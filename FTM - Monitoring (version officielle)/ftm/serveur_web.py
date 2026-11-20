#!/usr/bin/env python3
# FTM - Monitoring
# Page web et API

import json
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler

from ftm import config


# fichiers de la page servis tels quels
FICHIERS_WEB = {"/style.css": "text/css; charset=utf-8",
                "/app.js": "text/javascript; charset=utf-8",
                "/bip.js": "text/javascript; charset=utf-8"}


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

        def _fichier(self, chemin, type_, cache):
            if not os.path.isfile(chemin):
                self._envoyer(404, "Fichier introuvable", "text/plain")
                return
            with open(chemin, "rb") as f:
                corps = f.read()
            self.send_response(200)
            self.send_header("Content-Type", type_)
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("Cache-Control", cache)
            self.end_headers()
            self.wfile.write(corps)

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                chemin = config.trouver_page()
                if not chemin:
                    self._envoyer(500, "index.html introuvable dans web/", "text/plain")
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
            elif self.path in FICHIERS_WEB:
                self._fichier(os.path.join(config.DOSSIER_WEB, self.path.lstrip("/")), FICHIERS_WEB[self.path], "no-store")
            elif self.path.startswith("/police/") and self.path.endswith(".woff"):
                nom = os.path.basename(self.path)
                self._fichier(os.path.join(config.DOSSIER_WEB, "police", nom), "font/woff", "max-age=86400")
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