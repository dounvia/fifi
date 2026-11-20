#!/usr/bin/env python3
# FTM - Monitoring
# Contrôles, etat.json, alertes, maintenance, journal et rapport

import json
import threading
import time
from collections import OrderedDict
from datetime import datetime

import config
import mails
import verification


class Superviseur:
    def __init__(self, intervalle, demo, adresse_page="http://localhost:8080"):
        self.intervalle = intervalle
        self.demo = demo
        self.adresse_page = adresse_page
        self.verrou = threading.Lock()
        self.controle_en_cours = threading.Lock()
        self.memoire = self._charger()
        self.donnees = None

    def _charger(self):
        try:
            with open(config.FICHIER_ETAT, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {"services": {}, "journal": {}}

    def _sauver(self):
        try:
            with open(config.FICHIER_ETAT, "w", encoding="utf-8") as f:
                json.dump(self.memoire, f, ensure_ascii=False)
        except OSError:
            pass

    def controler(self):
        # un seul contrôle à la fois
        if not self.controle_en_cours.acquire(blocking=False):
            with self.controle_en_cours:
                return self.donnees
        try:
            return self._controler()
        finally:
            self.controle_en_cours.release()

    def _controler(self):
        lignes = config.lire_inventaire()
        resultats = verification.tester_tout(lignes, self.demo)

        with self.verrou:
            maintenant = datetime.now()
            heure = maintenant.strftime("%H:%M")
            jour = maintenant.strftime("%Y-%m-%d")
            envs = OrderedDict()
            changements = []
            confirmation = config.nb_confirmation()
            maintenance = self.memoire.setdefault("maintenance", {})
            dispo = self.memoire.setdefault("dispo", {})

            for ligne, (ok, ms) in zip(lignes, resultats):
                env = ligne["env"]
                cle = "|".join((env, ligne["hostname"], ligne["service"]))
                id_noeud = env + "-" + ligne["hostname"]
                en_maintenance = id_noeud in maintenance
                mem = self.memoire["services"].setdefault(cle, {"ok": ok, "since": heure, "history": []})
                mem.setdefault("notifie", mem.get("ok"))
                ok_reel = ok

                # journal
                if ok is not None and mem["history"] and mem["ok"] is not None and mem["ok"] != ok:
                    mem["since"] = heure
                    journal = self.memoire["journal"].setdefault(env, [])
                    journal.insert(0, {"t": heure, "jour": jour, "node": ligne["noeud"],
                                       "service": ligne["service"], "ok": ok})
                    del journal[config.TAILLE_JOURNAL:]
                if ok is None and mem.get("ok") is not None and mem.get("history"):
                    ok, ms = mem["ok"], None  # SSH KO : dernier état connu
                    ligne = dict(ligne, ancien=True)
                elif ok is not None:
                    mem["ok"] = ok
                    mem["history"] = (mem["history"] + [1 if ok else 0])[-config.TAILLE_HISTO:]

                if ok_reel is not None:
                    # alerte si confirmée, hors maintenance
                    if mem["notifie"] is None:
                        mem["notifie"] = ok_reel
                    recents = mem["history"][-confirmation:]
                    if (mem["notifie"] != ok_reel and not en_maintenance and len(recents) == confirmation
                            and all(v == (1 if ok_reel else 0) for v in recents)):
                        mem["notifie"] = ok_reel
                        changements.append({"env": env, "noeud": ligne["noeud"], "hostname": ligne["hostname"],
                                            "service": ligne["service"], "ok": ok_reel, "heure": heure})
                    # dispo du jour
                    if not en_maintenance:
                        jours = dispo.setdefault(cle, {})
                        compteur = jours.setdefault(jour, [0, 0])
                        compteur[0] += 1 if ok_reel else 0
                        compteur[1] += 1
                        for ancien_jour in sorted(jours)[:-config.JOURS_DISPO]:
                            del jours[ancien_jour]
                totaux = list(zip(*dispo.get(cle, {}).values()))
                dispo7 = round(100 * sum(totaux[0]) / sum(totaux[1]), 1) if totaux and sum(totaux[1]) else None

                e = envs.setdefault(env, {"code": env, "name": config.NOMS_ENV.get(env, env),
                                          "cluster_csv": "", "nodes": OrderedDict()})
                if ligne.get("cluster"):
                    e["cluster_csv"] = ligne["cluster"]
                n = e["nodes"].setdefault(ligne["noeud"], {
                    "id": env + "-" + ligne["hostname"], "name": ligne["noeud"],
                    "role": ligne.get("type") or "traitement", "host": ligne["hostname"],
                    "ip": ligne["ip"], "sshUser": ligne.get("user_ssh", ""),
                    "maintenance": maintenance.get(id_noeud), "links": [], "services": []})
                if ligne.get("url"):
                    n["links"].append({"label": "Ouvrir " + ligne["service"], "url": ligne["url"]})
                n["services"].append({"name": ligne["service"], "cat": ligne.get("categorie") or "service", "ok": ok, "ms": ms,
                                      "since": mem["since"], "history": mem["history"], "dispo7": dispo7,
                                      "ancien": bool(ligne.get("ancien"))})

            liste = []
            for code, e in envs.items():
                noeuds = list(e["nodes"].values())
                if e["cluster_csv"]:
                    cluster = e["cluster_csv"].lower() in ("oui", "o", "yes", "1", "true")
                else:
                    cluster = sum(1 for n in noeuds if n["role"] == "traitement") >= 2
                journal = [j for j in self.memoire["journal"].get(code, []) if j.get("jour") == jour]
                liste.append({"code": code, "name": e["name"], "cluster": cluster,
                              "nodes": noeuds, "journal": journal})

            self.donnees = {"generatedAt": maintenant.isoformat(timespec="seconds"),
                            "source": "demo" if self.demo else ("reel" if config.trouver_csv() else "exemple"),
                            "interval": self.intervalle, "confirmation": confirmation,
                            "rapport": "%02d:%02d" % config.heure_rapport() if config.heure_rapport() else "",
                            "envs": liste}
            self._sauver()

        arretes = sum(1 for ok, _ in resultats if ok is False)
        print("[%s] %d services contrôlés, %d arrêté(s)" % (maintenant.strftime("%H:%M:%S"), len(resultats), arretes))
        mails.envoyer_alerte(changements, self.demo, self.adresse_page)
        return self.donnees

    def maintenance(self, id_noeud, actif):
        with self.verrou:
            if not self.donnees:
                return None
            for env in self.donnees["envs"]:
                noeud = next((n for n in env["nodes"] if n["id"] == id_noeud), None)
                if noeud:
                    break
            else:
                return None
            maintenant = datetime.now()
            liste = self.memoire.setdefault("maintenance", {})
            if bool(actif) == (id_noeud in liste):
                return self.donnees
            if actif:
                liste[id_noeud] = {"depuis": maintenant.strftime("%H:%M"), "jour": maintenant.strftime("%Y-%m-%d")}
            else:
                liste.pop(id_noeud, None)
            noeud["maintenance"] = liste.get(id_noeud)
            journal = self.memoire["journal"].setdefault(env["code"], [])
            journal.insert(0, {"t": maintenant.strftime("%H:%M"), "jour": maintenant.strftime("%Y-%m-%d"),
                               "node": noeud["name"], "service": "Maintenance", "ok": not actif, "type": "maintenance"})
            del journal[config.TAILLE_JOURNAL:]
            env["journal"] = [j for j in journal if j.get("jour") == maintenant.strftime("%Y-%m-%d")]
            self._sauver()
            print("[MAINTENANCE] %s %s" % (noeud["host"], "en maintenance" if actif else ": fin de maintenance"))
            return self.donnees

    def journal_csv(self):
        lignes = [["Date", "Heure", "Environnement", "Nœud", "Service", "Événement"]]
        with self.verrou:
            evts = [(code, j) for code, liste in self.memoire.get("journal", {}).items() for j in liste]
        evts.sort(key=lambda x: (x[1].get("jour", ""), x[1].get("t", "")), reverse=True)
        for code, j in evts:
            if j.get("type") == "maintenance":
                quoi = "Fin de maintenance" if j.get("ok") else "Début de maintenance"
            else:
                quoi = "Redémarré" if j.get("ok") else "Arrêté"
            jour = j.get("jour", "")
            date = "/".join(reversed(jour.split("-"))) if jour else ""
            lignes.append([date, j.get("t", ""), code, j.get("node", ""), j.get("service", ""), quoi])
        sortie = []
        for l in lignes:
            sortie.append(";".join('"%s"' % str(c).replace('"', '""') if (";" in str(c) or '"' in str(c)) else str(c) for c in l))
        return "\ufeff" + "\r\n".join(sortie) + "\r\n"

    def rapport(self, force=False):
        # une fois par jour
        h = config.heure_rapport()
        maintenant = datetime.now()
        jour = maintenant.strftime("%Y-%m-%d")
        if not force:
            if not h or (maintenant.hour, maintenant.minute) < h or self.memoire.get("rapport_envoye") == jour:
                return
        reglages = config.lire_alertes()
        if not self.demo and not reglages:
            if force:
                print("alertes.csv absent ou actif;non : le rapport ne peut pas être envoyé.")
            return
        if not self.donnees:
            return
        with self.verrou:
            msg = mails.preparer_rapport(self.donnees, self.memoire.get("journal", {}), reglages or {},
                                   self.adresse_page, self.demo)
        if self.demo:
            mails.sauver_demo(msg, "rapport")
        elif not mails.envoyer_mail(msg, reglages):
            return
        with self.verrou:
            self.memoire["rapport_envoye"] = jour
            self._sauver()

    def boucle(self):
        while True:
            time.sleep(self.intervalle)
            try:
                self.controler()
                self.rapport()
            except Exception as err:
                print("Erreur pendant le contrôle :", err)