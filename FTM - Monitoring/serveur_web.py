#!/usr/bin/env python3
# FTM - Monitoring
# Page web et API

import json
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler

import config


def fabriquer_handler(sup):
    class Handler(BaseHTTPRequestHandler):
        def _envoyer(self, code, contenu, type_):
            corps = contenu.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", type_ + "; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corps)

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                chemin = config.trouver_page()
                if not chemin:
                    self._envoyer(500, "index.html introuvable dans templates/", "text/plain")
                    return
                try:
                    with open(chemin, encoding="utf-8-sig") as f:
                        page = f.read()
                except (OSError, UnicodeDecodeError) as err:
                    self._envoyer(500, "Impossible de lire " + chemin + " : " + str(err), "text/plain")
                    return
                with sup.verrou:
                    donnees = json.dumps(sup.donnees, ensure_ascii=False).replace("</", "<\\/")
                page = page.replace("/*__DATA__*/null", donnees)
                self._envoyer(200, page, "text/html")
            elif self.path.startswith("/police/"):
                nom = os.path.basename(self.path)
                chemin = os.path.join(config.DOSSIER, "templates", "police", nom)
                if nom.endswith(".woff") and os.path.isfile(chemin):
                    with open(chemin, "rb") as f:
                        corps = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "font/woff")
                    self.send_header("Content-Length", str(len(corps)))
                    self.send_header("Cache-Control", "max-age=86400")
                    self.end_headers()
                    self.wfile.write(corps)
                else:
                    self._envoyer(404, "Police introuvable", "text/plain")
            elif self.path == "/api/etat":
                with sup.verrou:
                    self._envoyer(200, json.dumps(sup.donnees, ensure_ascii=False), "application/json")
            elif self.path.split("?")[0] == "/api/journal.csv":
                corps = sup.journal_csv().encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="journal-ftm-%s.csv"'
                                 % datetime.now().strftime("%Y-%m-%d"))
                self.send_header("Content-Length", str(len(corps)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(corps)
            else:
                self._envoyer(404, "Page introuvable", "text/plain")

        def do_POST(self):
            if self.path == "/api/controle":
                self._envoyer(200, json.dumps(sup.controler(), ensure_ascii=False), "application/json")
            elif self.path == "/api/maintenance":
                try:
                    taille = min(int(self.headers.get("Content-Length") or 0), 10000)
                    demande = json.loads(self.rfile.read(taille) or b"{}")
                    donnees = sup.maintenance(str(demande.get("id", "")), bool(demande.get("actif")))
                except (ValueError, AttributeError):
                    donnees = None
                if donnees is None:
                    self._envoyer(404, json.dumps({"erreur": "nœud inconnu"}), "application/json")
                else:
                    with sup.verrou:
                        self._envoyer(200, json.dumps(donnees, ensure_ascii=False), "application/json")
            else:
                self._envoyer(404, "Page introuvable", "text/plain")

        def log_message(self, *args):
            pass
    return Handler