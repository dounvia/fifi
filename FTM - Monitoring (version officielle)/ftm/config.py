#!/usr/bin/env python3
# FTM - Monitoring
# Fichiers, réglages et lecture des CSV

import csv
import os
import re

# Fichiers
DOSSIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER_CONFIG = os.path.join(DOSSIER, "config")
DOSSIER_WEB = os.path.join(DOSSIER, "web")
FICHIER_CSV = os.path.join(DOSSIER_CONFIG, "environnements.csv")
FICHIER_EXEMPLE = os.path.join(DOSSIER_CONFIG, "environnements.exemple.csv")
FICHIER_SERVICES = os.path.join(DOSSIER_CONFIG, "services.csv")
FICHIER_ALERTES = os.path.join(DOSSIER_CONFIG, "alertes.csv")
FICHIER_ETAT = os.path.join(DOSSIER, "donnees", "etat.json")
FICHIER_PAGE = os.path.join(DOSSIER_WEB, "index.html")
FICHIER_LOGO_MAIL = os.path.join(DOSSIER_WEB, "mail", "logo.png")

# Réglages
DEMO = False
TIMEOUT = 10
DELAI_SSH = 45
TAILLE_HISTO = 40
TAILLE_JOURNAL = 200
JOURS_DISPO = 7
CONFIRMATION = 2   # nb de contrôles avant d'envoyer une alerte

NOMS_ENV = {"QUA": "Qualification", "DEV": "Développement", "INT": "Intégration",
            "REC": "Recette", "PPR": "Pré-production", "PRD": "Production"}


def trouver_csv():
    return FICHIER_CSV if os.path.isfile(FICHIER_CSV) else None


def trouver_page():
    return FICHIER_PAGE if os.path.isfile(FICHIER_PAGE) else None


def lire_csv(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return [{(k or "").strip(): (v or "").strip() for k, v in row.items()}
                for row in csv.DictReader(f, delimiter=";")]


def lire_inventaire():
    # un contrôle par machine et par service
    chemin = FICHIER_EXEMPLE if DEMO else (trouver_csv() or FICHIER_EXEMPLE)
    machines = [m for m in lire_csv(chemin) if m.get("env") and m.get("ip")]
    services = lire_csv(FICHIER_SERVICES)
    lignes = []
    for m in machines:
        for s in services:
            if s.get("type") != m.get("type") or not s.get("service"):
                continue
            ligne = dict(m)
            ligne["service"] = s["service"]
            ligne["port"] = s.get("port", "")
            ligne["commande_ssh"] = s.get("commande_ssh", "")
            ligne["categorie"] = s.get("categorie") or "service"
            ligne["url"] = m.get("url", "") if s.get("lien", "").lower() == "oui" else ""
            lignes.append(ligne)
    return lignes


def lire_reglages():
    if not os.path.isfile(FICHIER_ALERTES):
        return {}
    with open(FICHIER_ALERTES, encoding="utf-8-sig", newline="") as f:
        return {(r.get("parametre") or "").strip(): (r.get("valeur") or "").strip()
                for r in csv.DictReader(f, delimiter=";")}


def nb_confirmation():
    try:
        return max(1, int(lire_reglages().get("confirmation") or CONFIRMATION))
    except ValueError:
        return CONFIRMATION


def heure_rapport():
    valeur = lire_reglages().get("rapport_quotidien", "").strip()
    m = re.fullmatch(r"(\d{1,2})[:hH](\d{2})", valeur)
    return (int(m.group(1)), int(m.group(2))) if m else None


def lire_alertes():
    reglages = lire_reglages()
    if not reglages:
        return None
    if reglages.get("actif", "").lower() not in ("oui", "o", "yes", "1"):
        return None
    reglages["destinataires"] = [a.strip() for a in reglages.get("destinataires", "").split(",") if a.strip()]
    return reglages