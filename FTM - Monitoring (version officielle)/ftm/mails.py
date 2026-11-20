#!/usr/bin/env python3
# FTM - Monitoring
# Alertes et rapport quotidien par mail (SMTP ou Outlook)

import html
import os
import smtplib
import subprocess
from datetime import datetime, timedelta
from email.message import EmailMessage

from ftm import config


def html_mail(changements, adresse_page, demo):
    arrets = [c for c in changements if not c["ok"]]
    reprises = [c for c in changements if c["ok"]]
    e = lambda t: html.escape(str(t), quote=False)
    F = "font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
    envs = sorted({c["env"] for c in (arrets or reprises)})
    noms = " et ".join(", ".join(config.NOMS_ENV.get(c, c) for c in envs).rsplit(", ", 1))
    heure = changements[0]["heure"]

    sur = ("l'environnement " if len(envs) == 1 else "les environnements ") + noms
    if arrets:
        quoi = "l'arrêt d'un service" if len(arrets) == 1 else "l'arrêt de %d services" % len(arrets)
    else:
        quoi = "le redémarrage d'un service" if len(reprises) == 1 else "le redémarrage de %d services" % len(reprises)
    intro = "FTM - Monitoring a détecté %s sur %s lors du contrôle de %s." % (quoi, sur, heure)
    suite = "Les équipes concernées peuvent consulter le détail du nœud et l'historique des contrôles sur la page de supervision."

    def ligne(c, premiere):
        coul, lib = ("#e11d48", "Arrêté") if not c["ok"] else ("#059669", "Redémarré")
        bord = "" if premiere else "border-top:1px solid #e7eaef;"
        return ('<tr><td style="%s%spadding:13px 18px;font-size:14px;color:#0f172a">'
                '<span style="color:%s">&#9679;</span>&nbsp; <b style="font-weight:600">%s</b>'
                '<div style="%sfont-size:12px;color:#7d889a;padding:3px 0 0 18px">%s · %s · %s</div></td>'
                '<td align="right" style="%s%spadding:13px 18px;font-size:13px;font-weight:600;color:%s;white-space:nowrap;vertical-align:top">%s</td></tr>'
                % (bord, F, coul, e(c["service"]), F, e(c["env"]), e(c["noeud"]), e(c["hostname"]), bord, F, coul, lib))

    tous = arrets + reprises
    tableau = "".join(ligne(c, i == 0) for i, c in enumerate(tous))
    cid = "fond-alerte" if arrets else "fond-retabli"
    demo_txt = ('&nbsp;<span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#eef1f5;'
                'font-size:11px;font-weight:600;color:#7d889a;vertical-align:1px">Démo</span>') if demo else ""

    return gabarit_mail({
        "apercu": e(intro), "F": F, "cid": cid, "cid_mso": cid.replace("fond", "banniere"),
        "t1": "Alerte de" if arrets else "Services", "t2": "supervision" if arrets else "rétablis",
        "pt": "#f43f5e" if arrets else "#34d399", "pill": "Service arrêté" if len(arrets) == 1 else ("%d services arrêtés" % len(arrets) if arrets else "Services redémarrés"),
        "intro": e(intro), "titre_tableau": "Services concernés", "extra": "",
        "suite": e(suite), "tableau": tableau, "url": e(adresse_page), "demo": demo_txt})


def gabarit_mail(v):
    # gabarit commun alerte / rapport
    return """<!doctype html><html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<style>@media only screen and (max-width:520px){.banniere{background-image:none!important;background-color:#101d4f!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f4f9">
<div style="display:none;max-height:0;overflow:hidden">%(apercu)s</div>
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" bgcolor="#f1f4f9" style="background:#f1f4f9"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px -12px rgba(15,23,42,.18)">
 <tr><td style="font-size:0;line-height:0">
<!--[if mso]><img src="cid:%(cid_mso)s" width="600" height="260" alt="FTM - Monitoring : %(t1)s %(t2)s" style="display:block;border:0"><![endif]-->
<!--[if !mso]><!--><table role="presentation" width="100%%" cellpadding="0" cellspacing="0"><tr><td class="banniere" bgcolor="#101d4f" background="cid:%(cid)s" valign="top" height="260" style="background-color:#101d4f;background-image:url('cid:%(cid)s');background-size:cover;background-position:right center;background-repeat:no-repeat;height:260px;font-size:14px;line-height:1.4">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%%"><tr><td style="padding:34px 40px 0">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
   <td style="vertical-align:middle"><img src="cid:logo-ftm" width="26" height="26" alt="" style="display:block;border-radius:7px"></td>
   <td style="vertical-align:middle;padding-left:9px;%(F)sfont-size:14px;font-weight:600;color:#ffffff">FTM - Monitoring</td>
  </tr></table>
  <p style="margin:0;padding-top:26px;%(F)sfont-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#93a5cf">Supervision &middot; Secure Transport</p>
  <p style="margin:0;padding-top:8px;%(F)sfont-size:34px;line-height:37px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-1px;color:#ffffff">%(t1)s<br><span style="color:#93c5fd">%(t2)s</span></p>
  <!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="border-radius:999px;background:#26356b;border:1px solid #3d4f8a;padding:7px 14px;%(F)sfont-size:12.5px;font-weight:500;color:#ffffff">
   <span style="color:%(pt)s;font-size:12px">&#9679;</span>&nbsp; %(pill)s</td></tr></table><!--<![endif]-->
  <!--[if mso]><p style="margin:0;padding-top:16px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#ffffff"><span style="color:%(pt)s">&#9679;</span>&nbsp; %(pill)s</p><![endif]-->
  </td></tr></table>
 </td></tr></table><!--<![endif]-->
 </td></tr>
 <tr><td style="padding:34px 40px 0">
  <p style="%(F)smargin:0;font-size:15px;line-height:1.7;color:#0f172a;font-weight:600">Bonjour,</p>
  <p style="%(F)smargin:8px 0 0;font-size:15px;line-height:1.7;color:#465267">%(intro)s</p>
 </td></tr>
 <tr><td style="padding:22px 40px 0">
  <p style="%(F)smargin:0 0 10px 2px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#7d889a">%(titre_tableau)s</p>
    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e7eaef;border-radius:14px;border-collapse:separate">%(tableau)s</table>
 </td></tr>%(extra)s
 <tr><td style="padding:20px 40px 0">
  <p style="%(F)smargin:0;font-size:15px;line-height:1.7;color:#465267">%(suite)s</p>
 </td></tr>
 <tr><td style="padding:26px 40px 36px">
  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="%(url)s" style="height:36px;v-text-anchor:middle;width:186px;" arcsize="50%%" stroke="f" fillcolor="#1d4ed8"><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:bold;">Ouvrir la supervision &rarr;</center></v:roundrect><![endif]-->
  <!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#1d4ed8" style="border-radius:999px;background:#1d4ed8;background-image:linear-gradient(90deg,#2563eb 0%%,#1e40af 100%%)">
   <a href="%(url)s" style="%(F)sdisplay:inline-block;padding:9px 18px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">Ouvrir la supervision &nbsp;&rarr;</a>
  </td></tr></table><!--<![endif]-->
  </td></tr>
 <tr><td style="padding:0 40px"><div style="border-top:1px solid #e7eaef;font-size:0;line-height:0">&nbsp;</div></td></tr>
 <tr><td style="padding:28px 40px 36px">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0"><tr>
   <td style="vertical-align:top;width:36px"><img src="cid:logo-ftm" width="28" height="28" alt="" style="display:block;border-radius:7px"></td>
   <td style="vertical-align:top;padding-left:10px">
    <div style="%(F)sfont-size:13px;line-height:18px;font-weight:700;color:#0f172a">FTM - Monitoring%(demo)s</div>
    <p style="%(F)smargin:6px 0 0;font-size:12px;line-height:1.6;color:#8a94a6">Message automatique, merci de ne pas y répondre.</p></td>
  </tr></table></td></tr>
</table></td></tr></table></body></html>""" % v


def preparer_mail(changements, reglages, adresse_page, demo=False):
    arrets = [c for c in changements if not c["ok"]]
    reprises = [c for c in changements if c["ok"]]
    envs = sorted({c["env"] for c in changements})
    pluriel = lambda n: "s" if n > 1 else ""
    parties = []
    if arrets:
        parties.append("%d service%s arrêté%s" % (len(arrets), pluriel(len(arrets)), pluriel(len(arrets))))
    if reprises:
        parties.append("%d redémarré%s" % (len(reprises), pluriel(len(reprises))))

    texte = []
    for titre, liste in (("Services arrêtés", arrets), ("Services redémarrés", reprises)):
        if liste:
            texte.append(titre + " :")
            texte += ["  - %s · %s (%s) · %s, à %s" % (c["env"], c["noeud"], c["hostname"], c["service"], c["heure"]) for c in liste]
            texte.append("")
    texte += ["Supervision : " + adresse_page, "",
              "Message automatique envoyé par FTM - Monitoring, merci de ne pas y répondre."]

    sujet = "%s[FTM - Monitoring] %s : %s" % ("[DÉMO] " if demo else "", ", ".join(envs), ", ".join(parties))
    return construire_message(sujet, "\n".join(texte), html_mail(changements, adresse_page, demo),
                              bool(arrets), reglages)


def construire_message(sujet, texte, corps_html, alerte, reglages):
    msg = EmailMessage()
    msg["Subject"] = sujet
    msg["From"] = "FTM - Monitoring <%s>" % (reglages.get("expediteur") or "ftm-monitoring@exemple.fr")
    msg["To"] = ", ".join(reglages.get("destinataires") or ["equipe@exemple.fr"])
    msg["Date"] = datetime.now().astimezone().strftime("%a, %d %b %Y %H:%M:%S %z")
    msg.set_content(texte)
    msg.add_alternative(corps_html, subtype="html")
    partie_html = msg.get_payload()[1]
    dossier_mail = os.path.dirname(config.FICHIER_LOGO_MAIL)
    fond = "fond-alerte" if alerte else "fond-retabli"
    images = [("logo.png", "png", "logo-ftm"), (fond + ".jpg", "jpeg", fond)]
    for nom, sous_type, cid in images:
        chemin = os.path.join(dossier_mail, nom)
        if os.path.isfile(chemin):
            with open(chemin, "rb") as f:
                partie_html.add_related(f.read(), "image", sous_type, cid="<%s>" % cid)
    return msg


def preparer_rapport(donnees, journal, reglages, adresse_page, demo=False):
    e = lambda t: html.escape(str(t), quote=False)
    F = "font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
    p = lambda n, mot: "%d %s%s" % (n, mot, "s" if n > 1 else "")
    pa = lambda n: "%d service%s arrêté%s" % (n, "s" if n > 1 else "", "s" if n > 1 else "")
    maintenant = datetime.now()
    depuis = maintenant - timedelta(hours=24)

    def date_evt(j):
        try:
            return datetime.strptime("%s %s" % (j.get("jour", ""), j.get("t", "")), "%Y-%m-%d %H:%M")
        except ValueError:
            return None

    lignes_env, texte, arretes = [], [], []
    total_arrets_24h = 0
    for i, env in enumerate(donnees["envs"]):
        services = [s for n in env["nodes"] if not n.get("maintenance") for s in n["services"]]
        demarres = sum(1 for s in services if s["ok"] is True)
        dispos = [s["dispo7"] for s in services if s.get("dispo7") is not None]
        dispo = sum(dispos) / len(dispos) if dispos else None
        noeuds_ko = [n for n in env["nodes"] if not n.get("maintenance")
                     and any(s["ok"] is False for s in n["services"])]
        for n in env["nodes"]:
            for s in n["services"]:
                if s["ok"] is False and not n.get("maintenance"):
                    arretes.append((env["code"], n, s))
        actifs = len(env["nodes"]) - len(noeuds_ko)
        if not noeuds_ko:
            coul, etat = "#059669", "Opérationnel"
        elif actifs > 0:
            coul, etat = "#d97706", "Dégradé"
        else:
            coul, etat = "#e11d48", "Hors service"
        arrets_24h = sum(1 for j in journal.get(env["code"], [])
                         if j.get("type") != "maintenance" and not j.get("ok")
                         and (date_evt(j) or depuis) > depuis)
        total_arrets_24h += arrets_24h
        detail = "%d / %d services et accès OK · %s sur 24 h%s" % (
            demarres, len(services), p(arrets_24h, "arrêt"),
            (" · disponibilité 7 j %s %%" % ("%.1f" % dispo).replace(".", ",")) if dispo is not None else "")
        maint = [n["name"] for n in env["nodes"] if n.get("maintenance")]
        if maint:
            detail += " · en maintenance : " + ", ".join(maint)
        bord = "" if i == 0 else "border-top:1px solid #e7eaef;"
        lignes_env.append(
            '<tr><td style="%s%spadding:13px 18px;font-size:14px;color:#0f172a">'
            '<span style="color:%s">&#9679;</span>&nbsp; <b style="font-weight:600">%s</b> <span style="color:#7d889a">%s</span>'
            '<div style="%sfont-size:12px;color:#7d889a;padding:3px 0 0 18px">%s</div></td>'
            '<td align="right" style="%s%spadding:13px 18px;font-size:13px;font-weight:600;color:%s;white-space:nowrap;vertical-align:top">%s</td></tr>'
            % (bord, F, coul, e(env["name"]), e(env["code"]), F, e(detail), bord, F, coul, etat))
        texte.append("  - %s (%s) : %s, %s" % (env["name"], env["code"], etat, detail))

    extra = ""
    if arretes:
        lignes = "".join(
            '<tr><td style="%s%spadding:11px 18px;font-size:13.5px;color:#0f172a"><span style="color:#e11d48">&#9679;</span>&nbsp; '
            '<b style="font-weight:600">%s</b><div style="%sfont-size:12px;color:#7d889a;padding:3px 0 0 18px">%s · %s · %s · arrêté depuis %s</div></td></tr>'
            % ("" if k == 0 else "border-top:1px solid #e7eaef;", F, e(s["name"]), F, e(code), e(n["name"]), e(n["host"]), e(s["since"]))
            for k, (code, n, s) in enumerate(arretes[:12]))
        extra = ('<tr><td style="padding:22px 40px 0"><p style="%smargin:0 0 10px 2px;font-size:11px;font-weight:600;letter-spacing:2px;'
                 'text-transform:uppercase;color:#7d889a">Services arrêtés en ce moment</p>'
                 '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#fff5f6;border:1px solid #f5c2c4;'
                 'border-radius:14px;border-collapse:separate">%s</table></td></tr>' % (F, lignes))

    date_txt = maintenant.strftime("%d/%m/%Y")
    if arretes:
        intro = "Voici l'état des environnements au %s à %s : %s actuellement." % (
            date_txt, maintenant.strftime("%H:%M"), pa(len(arretes)))
    else:
        intro = "Voici l'état des environnements au %s à %s : tous les services supervisés sont démarrés." % (
            date_txt, maintenant.strftime("%H:%M"))
    intro += " %s sur les dernières 24 heures." % ("Aucun arrêt n'a été détecté" if not total_arrets_24h
                                                  else p(total_arrets_24h, "arrêt") + " détecté" + ("s" if total_arrets_24h > 1 else ""))
    suite = "Le détail de chaque nœud et l'historique des contrôles sont disponibles sur la page de supervision."
    demo_txt = ('&nbsp;<span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#eef1f5;'
                'font-size:11px;font-weight:600;color:#7d889a;vertical-align:1px">Démo</span>') if demo else ""
    alerte = bool(arretes)
    cid = "fond-alerte" if alerte else "fond-retabli"
    corps = gabarit_mail({
        "apercu": e(intro), "F": F, "cid": cid, "cid_mso": cid.replace("fond", "banniere"),
        "t1": "Rapport", "t2": "quotidien", "pt": "#f43f5e" if alerte else "#34d399",
        "pill": pa(len(arretes)) if alerte else "Tous les services démarrés",
        "intro": e(intro), "titre_tableau": "État des environnements", "tableau": "".join(lignes_env),
        "extra": extra, "suite": e(suite), "url": e(adresse_page), "demo": demo_txt})

    texte = ["Rapport quotidien du %s" % date_txt, "", intro, "", "Environnements :"] + texte + [""]
    if arretes:
        texte.append("Services arrêtés en ce moment :")
        texte += ["  - %s · %s (%s) · %s, depuis %s" % (c, n["name"], n["host"], s["name"], s["since"]) for c, n, s in arretes]
        texte.append("")
    texte += ["Supervision : " + adresse_page, "",
              "Message automatique envoyé par FTM - Monitoring, merci de ne pas y répondre."]
    sujet = "%s[FTM - Monitoring] Rapport du %s : %s" % (
        "[DÉMO] " if demo else "", date_txt, pa(len(arretes)) if arretes else "tout est démarré")
    return construire_message(sujet, "\n".join(texte), corps, alerte, reglages)


def envoyer_par_outlook(msg, reglages):
    # Windows : envoi par Outlook via PowerShell
    import base64
    import tempfile
    dossier = tempfile.mkdtemp(prefix="ftm_mail_")
    corps = msg.get_body(("html",)).get_content()
    pieces = []
    for part in msg.walk():
        cid = (part.get("Content-ID") or "").strip("<>")
        if cid and not cid.startswith("fond"):
            nom = cid + "." + part.get_content_subtype().replace("jpeg", "jpg")
            with open(os.path.join(dossier, nom), "wb") as f:
                f.write(part.get_payload(decode=True))
            pieces.append((nom, cid))
    nom = "banniere-alerte.jpg" if "cid:banniere-alerte" in corps else "banniere-retabli.jpg"
    chemin = os.path.join(os.path.dirname(config.FICHIER_LOGO_MAIL), nom)
    if os.path.isfile(chemin):
        with open(chemin, "rb") as src, open(os.path.join(dossier, nom), "wb") as f:
            f.write(src.read())
        pieces.append((nom, nom[:-4]))
    with open(os.path.join(dossier, "corps.html"), "w", encoding="utf-8") as f:
        f.write(corps)
    with open(os.path.join(dossier, "sujet.txt"), "w", encoding="utf-8") as f:
        f.write(str(msg["Subject"]))
    with open(os.path.join(dossier, "a.txt"), "w", encoding="utf-8") as f:
        f.write("; ".join(reglages.get("destinataires") or []))
    lignes = ['$d = "%s"' % dossier.replace('"', '`"'),
              '$o = New-Object -ComObject Outlook.Application',
              '$m = $o.CreateItem(0)',
              '$m.To = Get-Content -LiteralPath (Join-Path $d "a.txt") -Raw -Encoding UTF8',
              '$m.Subject = (Get-Content -LiteralPath (Join-Path $d "sujet.txt") -Raw -Encoding UTF8).Trim()']
    for nom, cid in pieces:
        lignes.append('$a = $m.Attachments.Add((Join-Path $d "%s"))' % nom)
        lignes.append('$a.PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F", "%s")' % cid)
        lignes.append('$a.PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x7FFE000B", $true)')
    lignes += ['$m.HTMLBody = Get-Content -LiteralPath (Join-Path $d "corps.html") -Raw -Encoding UTF8',
               '$m.Send()']
    commande = base64.b64encode("\n".join(lignes).encode("utf-16-le")).decode()
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", commande],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", errors="replace", timeout=60)
        if r.returncode != 0:
            raise OSError((r.stderr or r.stdout or "erreur PowerShell").strip()[:300])
        print("[ALERTE] mail envoyé par Outlook à %s : %s" % (", ".join(reglages.get("destinataires") or []), msg["Subject"]))
        return True
    except (OSError, subprocess.SubprocessError) as err:
        print("[ALERTE] envoi par Outlook impossible (%s)" % err)
        return False
    finally:
        for n in os.listdir(dossier):
            try:
                os.remove(os.path.join(dossier, n))
            except OSError:
                pass
        try:
            os.rmdir(dossier)
        except OSError:
            pass


def envoyer_mail(msg, reglages):
    if reglages.get("methode", "").lower() == "outlook":
        if os.name != "nt":
            print("[ALERTE] methode outlook : uniquement sur Windows. Sur le serveur, mettre methode;smtp dans alertes.csv.")
            return False
        return envoyer_par_outlook(msg, reglages)
    serveur, port = reglages.get("serveur_smtp", ""), int(reglages.get("port") or 25)
    if not serveur:
        print("[ALERTE] serveur_smtp vide dans alertes.csv : aucun mail envoyé.")
        return False
    securite = reglages.get("securite", "").lower()
    try:
        if securite == "ssl":
            smtp = smtplib.SMTP_SSL(serveur, port, timeout=config.TIMEOUT)
        else:
            smtp = smtplib.SMTP(serveur, port, timeout=config.TIMEOUT)
            if securite == "starttls":
                smtp.starttls()
        with smtp:
            if reglages.get("utilisateur"):
                smtp.login(reglages["utilisateur"], os.environ.get("FTM_SMTP_MOT_DE_PASSE", ""))
            smtp.send_message(msg)
        print("[ALERTE] mail envoyé à %s : %s" % (msg["To"], msg["Subject"]))
        return True
    except (OSError, smtplib.SMTPException) as err:
        print("[ALERTE] envoi impossible (%s)" % err)
        return False


def sauver_demo(msg, prefixe="alerte"):
    # démo : pas d'envoi
    print("[%s démo] %s" % (prefixe.upper(), msg["Subject"]))


def envoyer_alerte(changements, demo, adresse_page):
    if not changements:
        return
    reglages = config.lire_alertes()
    if not demo and not reglages:
        return
    msg = preparer_mail(changements, reglages or {}, adresse_page, demo)
    if demo:
        sauver_demo(msg, "alerte")
        return
    if reglages:
        envoyer_mail(msg, reglages)


def mail_de_test(adresse_page):
    reglages = config.lire_alertes()
    if not reglages:
        print("alertes.csv absent ou actif;non : copiez alertes.exemple.csv en alertes.csv et remplissez-le.")
        return
    if reglages.get("methode", "").lower() != "outlook" and reglages.get("utilisateur") and not os.environ.get("FTM_SMTP_MOT_DE_PASSE"):
        print("Le serveur demande un mot de passe : définissez d'abord la variable FTM_SMTP_MOT_DE_PASSE.")
        return
    h = datetime.now().strftime("%H:%M")
    exemple = [{"env": "DEV", "noeud": "Traitement 1", "hostname": "SRV-DEV-TRT1", "service": "Transaction Manager", "ok": False, "heure": h},
               {"env": "DEV", "noeud": "Traitement 1", "hostname": "SRV-DEV-TRT1", "service": "Monitor", "ok": False, "heure": h},
               {"env": "QUA", "noeud": "Traitement 2", "hostname": "SRV-QUA-TRT2", "service": "SSH Service (SFTP)", "ok": True, "heure": h}]
    envoyer_mail(preparer_mail(exemple, reglages, adresse_page, demo=True), reglages)
