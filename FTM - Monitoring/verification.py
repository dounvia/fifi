#!/usr/bin/env python3
# FTM - Monitoring
# Contrôle des nœuds : ps par SSH et test des ports

import random
import re
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

import config


def test_tcp(ip, port):
    debut = time.perf_counter()
    try:
        with socket.create_connection((ip, int(port)), timeout=config.TIMEOUT):
            return True, int((time.perf_counter() - debut) * 1000)
    except (OSError, ValueError):
        return False, None


def tester(ligne, demo=False):
    if demo:  # 3 % de chance d'être arrêté
        ok = random.random() > 0.03
        return ok, random.randint(3, 45) if ok else None
    return test_tcp(ligne["ip"], ligne.get("port") or 22)


def tester_tout(lignes, demo=False):
    # une connexion SSH par machine
    resultats = [None] * len(lignes)
    groupes = {}
    autres = []
    for i, l in enumerate(lignes):
        if l.get("commande_ssh") and not demo:
            groupes.setdefault((l.get("user_ssh", ""), l["ip"]), []).append(i)
        else:
            autres.append(i)

    def verifier_machine(cle):
        user, ip = cle
        numeros = groupes[cle]
        script = "; ".join(
            "if %s >/dev/null 2>&1; then echo R%d=OK; else echo R%d=KO; fi"
            % (lignes[i]["commande_ssh"], n, n) for n, i in enumerate(numeros))
        cible = "%s@%s" % (user, ip) if user else ip
        cmd = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=%d" % config.TIMEOUT,
               "-o", "StrictHostKeyChecking=no", "-o", "LogLevel=ERROR",
               "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=3",
               "-o", "GSSAPIAuthentication=no",
               cible, script]
        etats, erreur = {}, ""
        for essai in range(3):
            debut = time.perf_counter()
            try:
                r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, errors="replace", timeout=config.DELAI_SSH,
                                   stdin=subprocess.DEVNULL)
                etats = dict(re.findall(r"R(\d+)=(OK|KO)", r.stdout))
                erreur = (r.stderr or "").strip() or "code retour %d" % r.returncode
            except subprocess.TimeoutExpired:
                etats, erreur = {}, "pas de réponse en %d s" % config.DELAI_SSH
            except (OSError, subprocess.SubprocessError) as err:
                etats, erreur = {}, str(err)
            if etats:
                break
            time.sleep(2)
        ms = int((time.perf_counter() - debut) * 1000)
        if not etats:
            print("[SSH] %s : connexion impossible après 3 essais (%s)" % (cible, erreur[:120] or "aucune réponse"))
            for i in numeros:
                resultats[i] = (None, None)
            return
        for n, i in enumerate(numeros):
            ok = etats.get(str(n)) == "OK"
            resultats[i] = (ok, ms if ok else None)

    def verifier_ligne(i):
        resultats[i] = tester(lignes[i], demo)

    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(verifier_machine, list(groupes)))
        list(pool.map(verifier_ligne, autres))
    return resultats