#!/usr/bin/env python3
# FTM - Monitoring
# Supervision des environnements Secure Transport (QUA, DEV, INT)
#
# python3 supervision.py               -> vraies machines
# python3 supervision.py --demo        -> machines fictives
# python3 supervision.py --test-mail
#
# Fichiers :
#   config.py        fichiers, réglages et lecture des CSV
#   verification.py  contrôle des nœuds (SSH, ps, ports)
#   mails.py         alertes et rapport quotidien (SMTP)
#   superviseur.py   logique de supervision (contrôles, etat.json, maintenance, journal)
#   serveur_web.py   page web et API

import argparse
import socket
import threading
from http.server import HTTPServer
from socketserver import ThreadingMixIn

import config
import mails
from serveur_web import fabriquer_handler
from superviseur import Superviseur


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    # plusieurs visiteurs en même temps
    daemon_threads = True


def main():
    p = argparse.ArgumentParser(description="Supervision des environnements FTM")
    p.add_argument("--port", type=int, default=8080, help="port du serveur web (8080)")
    p.add_argument("--intervalle", type=int, default=60, help="secondes entre deux contrôles (60)")
    p.add_argument("--demo", action="store_true", help="états simulés, sans tester le réseau")
    p.add_argument("--test-mail", action="store_true", help="envoie une alerte d'exemple puis s'arrête")
    p.add_argument("--test-rapport", action="store_true", help="fait un contrôle, envoie le rapport quotidien puis s'arrête")
    a = p.parse_args()
    config.DEMO = a.demo
    adresse_page = "http://%s:%d" % (socket.gethostname(), a.port)
    if a.test_mail:
        mails.mail_de_test(adresse_page)
        return
    if a.test_rapport:
        sup = Superviseur(a.intervalle, a.demo, adresse_page)
        sup.controler()
        sup.rapport(force=True)
        return

    csv_reel = config.trouver_csv()
    print("Dossier du script :", config.DOSSIER)
    print("Page web :", config.trouver_page() or "INTROUVABLE (mettre index.html dans le dossier templates)")
    if a.demo:
        print("MODE DÉMO : machines fictives, aucun mail envoyé (pour tester : --test-mail)")
    elif csv_reel:
        print("Machines lues dans :", csv_reel)
    else:
        print("ATTENTION : environnements.csv introuvable -> machines fictives")
    if not a.demo:
        print("Alertes mail :", "activées" if config.lire_alertes() else "désactivées (voir alertes.csv)")
    print("Confirmation : alerte après %d contrôle(s) identique(s)" % config.nb_confirmation())
    if config.heure_rapport():
        print("Rapport quotidien : chaque jour à %02d:%02d" % config.heure_rapport())
    sup = Superviseur(a.intervalle, a.demo, adresse_page)
    sup.controler()
    threading.Thread(target=sup.boucle, daemon=True).start()

    serveur = ThreadingHTTPServer(("0.0.0.0", a.port), fabriquer_handler(sup))
    print("Supervision FTM disponible sur http://localhost:%d%s" % (a.port, "  (mode démo)" if a.demo else ""))
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")


if __name__ == "__main__":
    main()