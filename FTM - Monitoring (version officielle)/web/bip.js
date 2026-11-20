// Assistant Bip (mots-clés)
(function () {
  "use strict";
  const NOM = "Bip";
  if (typeof DATA === "undefined" || !DATA || !Array.isArray(DATA.envs)) return;

  // Petits outils
  const LIBELLES = { ok: "Opérationnel", degrade: "Dégradé", panne: "Hors service" };
  const ech = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pl = (n, s = "s") => (n > 1 ? s : "");
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const norm = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");
  const point = cle => '<i class="fa-point ' + cle + '"></i>';
  function session(cle, valeur) {
    try { if (valeur === undefined) return sessionStorage.getItem(cle); sessionStorage.setItem(cle, valeur); }
    catch (e) { return null; }
  }

  // État
  function lireEtat() {
    return DATA.envs.map(e => {
      const total = envSvc(e).length, arretes = envDown(e).length, cluster = etatCluster(e).cls;
      return {
        code: e.code, nom: e.name,
        etat: !arretes ? "ok" : (cluster === "hs" ? "panne" : "degrade"),
        servicesOk: Math.max(total - arretes, 0), servicesTotal: total, noeuds: e.nodes.length,
        maintenance: e.nodes.filter(enMaint).map(n => n.name),
        problemes: e.nodes.flatMap(n => svcDown(n).map(s =>
          n.name + " : " + s.name + " arrêté" + (s.since ? " depuis " + s.since : "")))
      };
    });
  }
  const nbAlertes = envs => envs.reduce((t, e) => t + e.problemes.length, 0);

  // Aide
  const nbEnvs = DATA.envs.length;
  const DOCS = {
    pastilles: { titre: "Lire les pastilles", texte:
      '<ul class="fa-liste">' +
      "<li>" + point("ok") + "<span><b>Vert</b> : service démarré, nœud en bonne santé.</span></li>" +
      "<li>" + point("panne") + "<span><b>Rouge</b> : service arrêté, il compte comme une alerte.</span></li>" +
      "<li>" + point("degrade") + "<span><b>Orange</b> : environnement dégradé (une partie des nœuds du cluster tourne encore) ou nœud en maintenance.</span></li>" +
      "<li>" + point("nv") + "<span><b>Gris</b> : service pas encore vérifié.</span></li></ul>" },
    noeuds: { titre: "Nœuds et cluster", texte:
      "Chaque environnement regroupe des <b>nœuds</b> (des serveurs). Sur chacun, plusieurs <b>services</b> sont contrôlés. " +
      "En cluster, l'environnement reste <b>Dégradé</b> tant qu'au moins un nœud fonctionne, et passe <b>Hors service</b> quand plus aucun ne répond. " +
      "Un nœud en maintenance n'est pas compté dans les alertes." },
    controle: { titre: "Les contrôles", texte:
      "La page relance un contrôle automatiquement toutes les <b>" + ech(DATA.interval || 60) + " secondes</b> : " +
      "le petit cercle en haut à droite fait le compte à rebours. Pour contrôler tout de suite : le bouton " +
      "« Contrôler maintenant » ou la touche <kbd>R</kbd>." },
    alerte: { titre: "Que faire en cas d'alerte ?", texte:
      '<ol class="fa-etapes">' +
      "<li>Ouvrez l'environnement et repérez le nœud en rouge dans la topologie.</li>" +
      "<li>Relancez un contrôle pour écarter une coupure passagère.</li>" +
      "<li>Si l'arrêt persiste, notez l'heure, le nœud et le service (le journal les garde) et prévenez le référent de la plateforme.</li></ol>" +
      (DATA.confirmation ? '<p class="fa-discret">Un mail d\'alerte part automatiquement ' +
        (DATA.confirmation > 1 ? "après " + ech(DATA.confirmation) + " contrôles identiques." : "dès le premier contrôle.") + "</p>" : "") },
    raccourcis: { titre: "Raccourcis clavier", texte:
      '<ul class="fa-liste">' +
      "<li><kbd>R</kbd><span>Contrôler maintenant</span></li>" +
      "<li><kbd>/</kbd><span>ou <kbd>Ctrl</kbd> + <kbd>K</kbd> : rechercher un nœud, une IP ou un service</span></li>" +
      "<li><kbd>1</kbd><span>à <kbd>" + nbEnvs + "</kbd> : changer d'environnement</span></li>" +
      "<li><kbd>Échap</kbd><span>Fermer la recherche ou l'assistant</span></li></ul>" },
    journal: { titre: "Le journal", texte:
      "Le journal liste les changements d'état du jour (service arrêté, puis redémarré). " +
      "Le bouton « Exporter le journal » télécharge tout l'historique en CSV, à ouvrir dans Excel." }
  };
  if (DATA.source === "demo") DOCS.demo = { titre: "Le mode démo", texte:
    "Les états affichés sont <b>simulés</b> pour présenter l'interface. " +
    "Relancez <code>supervision.py</code> sans <code>--demo</code> pour superviser les vraies machines." };

  // Robot
  let nbDessins = 0;
  function robot() {          // dessin du robot
    const id = "faG" + (++nbDessins);
    return '<svg class="fa-robot" viewBox="0 0 64 64" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3fa"/></linearGradient>' +
      '<linearGradient id="' + id + 'e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eff6ff"/><stop offset="1" stop-color="#dbeafe"/></linearGradient>' +
      '<linearGradient id="' + id + 'o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>' +
      '<rect x="3.5" y="30" width="5" height="12" rx="2.5" fill="#dbe4f0"/><rect x="55.5" y="30" width="5" height="12" rx="2.5" fill="#dbe4f0"/>' +
      '<path d="M32 15V8.5" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>' +
      '<rect x="28.5" y="13" width="7" height="3" rx="1.5" fill="#dbe4f0"/>' +
      '<circle class="fa-antenne" cx="32" cy="6.5" r="3.3"/><circle cx="31.1" cy="5.6" r="1" fill="#fff" opacity=".8"/>' +
      '<rect x="8" y="15" width="48" height="43" rx="15" fill="url(#' + id + 't)" stroke="#d6dfec" stroke-width="1.5"/>' +
      '<rect x="14" y="21.5" width="36" height="30" rx="11" fill="url(#' + id + 'e)" stroke="#cfe0f8" stroke-width="1"/>' +
      '<path d="M19 27q4-2.5 9-2.5" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".9"/>' +
      '<g class="fa-yeux"><rect x="22" y="31.5" width="5.5" height="10" rx="2.75" fill="url(#' + id + 'o)"/>' +
      '<rect x="36.5" y="31.5" width="5.5" height="10" rx="2.75" fill="url(#' + id + 'o)"/>' +
      '<circle cx="23.9" cy="33.6" r="1" fill="#fff" opacity=".9"/><circle cx="38.4" cy="33.6" r="1" fill="#fff" opacity=".9"/></g></svg>';
  }
  function robotBulle() {     // bouton du robot
    const id = "faB" + (++nbDessins);
    const bulle = "M38 3a32 32 0 1 1 0 64a32 32 0 1 1 0-64z";
    return '<svg class="fa-robot" viewBox="0 0 72 72" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3fa"/></linearGradient>' +
      '<linearGradient id="' + id + 'e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eff6ff"/><stop offset="1" stop-color="#dbeafe"/></linearGradient>' +
      '<linearGradient id="' + id + 'o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>' +
      '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfdbfe"/><stop offset="1" stop-color="#93c5fd"/></linearGradient>' +
      '<clipPath id="' + id + 'c"><path d="' + bulle + '"/></clipPath></defs>' +
      '<path class="fa-r-fond" d="' + bulle + '" fill="url(#' + id + 'b)"/>' +
      '<g clip-path="url(#' + id + 'c)"><path class="fa-r-tete" d="M25 72q0-14 13-14t13 14z" fill="url(#' + id + 't)" stroke="#d6dfec" stroke-width="1.2"/></g>' +
      '<rect x="13.5" y="33" width="4.5" height="10" rx="2.25" fill="#dbe4f0"/><rect x="58" y="33" width="4.5" height="10" rx="2.25" fill="#dbe4f0"/>' +
      '<path d="M38 19V13.5" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round"/><rect x="35" y="17.5" width="6" height="2.6" rx="1.3" fill="#dbe4f0"/>' +
      '<circle class="fa-antenne" cx="38" cy="11.8" r="2.9"/><circle cx="37.2" cy="11" r=".9" fill="#fff" opacity=".8"/>' +
      '<circle class="fa-ping" cx="38" cy="11.8" r="5" fill="none" stroke-width="1.2"/><circle class="fa-ping fa-ping2" cx="38" cy="11.8" r="5" fill="none" stroke-width="1.2"/>' +
      '<rect class="fa-r-tete" x="17" y="19.5" width="42" height="37" rx="13" fill="url(#' + id + 't)" stroke="#d6dfec" stroke-width="1.3"/>' +
      '<rect class="fa-r-ecran" x="22.2" y="25" width="31.6" height="26" rx="9.5" fill="url(#' + id + 'e)" stroke="#cfe0f8" stroke-width=".9"/>' +
      '<path d="M26.5 30q3.5-2.2 8-2.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".9"/>' +
      '<g class="fa-regard"><g class="fa-yeux"><rect x="29" y="33.5" width="4.8" height="8.8" rx="2.4" fill="url(#' + id + 'o)"/><rect x="42.2" y="33.5" width="4.8" height="8.8" rx="2.4" fill="url(#' + id + 'o)"/>' +
      '<circle cx="30.7" cy="35.4" r=".9" fill="#fff"/><circle cx="43.9" cy="35.4" r=".9" fill="#fff"/></g></g>' +
      '<path d="M48 66l2.4-5.5h14l2.4 5.5z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width=".8"/>' +
      '<rect x="50.5" y="54" width="14" height="7" rx="1.4" fill="#0f172a"/>' +
      '<rect class="fa-ecr" x="52" y="55.8" width="7" height="1.1" rx=".55" fill="#60a5fa"/><rect class="fa-ecr fa-ecr2" x="52" y="57.8" width="4.5" height="1" rx=".5" fill="#34d399"/></svg>';
  }
  const ICO_FERMER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const ICO_ENVOYER = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

  // Construction
  const racine = document.createElement("div");
  racine.className = "fa";
  racine.innerHTML =
    '<div class="fa-teaser" hidden><svg class="fa-pointe" viewBox="0 0 14 13" aria-hidden="true"><path class="f" d="M0 0Q1 10 13.5 12.5Q5 13 0 12.5Z"/><path class="t" d="M1 0Q1.6 10 13.5 12.5Q5 13 0 12.5"/></svg><button type="button" class="fa-teaser-texte"></button>' +
    '<button type="button" class="fa-teaser-fermer" aria-label="Masquer le message">×</button></div>' +
    '<section class="fa-panneau" role="dialog" aria-label="Assistant de supervision" hidden>' +
      '<header class="fa-entete">' + robot() +
        '<div><div class="fa-titre">' + NOM + '</div>' +
        '<div class="fa-statut"><i class="fa-point ok"></i>En ligne · Supervision FTM</div></div>' +
        '<button type="button" class="fa-fermer" aria-label="Fermer l\'assistant">' + ICO_FERMER + "</button>" +
      "</header>" +
      '<div class="fa-fil" aria-live="polite"></div>' +
      '<form class="fa-saisie" autocomplete="off"><input type="text" placeholder="Posez une question… (ex. : état de QUA)" aria-label="Votre message">' +
      '<button type="submit" class="fa-envoyer" aria-label="Envoyer">' + ICO_ENVOYER + "</button></form>" +
      '<div class="fa-mention">Assistant local : aucune donnée ne quitte la page</div>' +
    "</section>" +
    '<button type="button" class="fa-lanceur" aria-label="Ouvrir l\'assistant de supervision" aria-expanded="false">' +
      robotBulle() + '<span class="fa-badge" hidden></span></button>';
  document.body.appendChild(racine);

  const q = s => racine.querySelector(s);
  const panneau = q(".fa-panneau"), fil = q(".fa-fil"), champ = q(".fa-saisie input");
  const lanceur = q(".fa-lanceur"), badge = q(".fa-badge"), teaser = q(".fa-teaser"), teaserTexte = q(".fa-teaser-texte");
  let ouvert = false, dejaOuvert = false, occupe = false, dernierNombre = null;

  // Ouverture / fermeture
  function ouvrir() {
    ouvert = true; masquerTeaser();
    panneau.hidden = false; racine.classList.add("fa-ouvert");
    lanceur.setAttribute("aria-expanded", "true");
    if (!dejaOuvert) { dejaOuvert = true; lancer(accueil); }
    setTimeout(() => champ.focus(), 60);
  }
  function fermer() {
    ouvert = false; panneau.hidden = true; racine.classList.remove("fa-ouvert");
    lanceur.setAttribute("aria-expanded", "false"); lanceur.focus();
    setTimeout(inviter, 400);
  }
  function montrerTeaser(html) {
    if (ouvert) return;
    teaserTexte.innerHTML = html; teaser.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => teaser.classList.add("fa-visible")));
  }
  function masquerTeaser() { teaser.classList.remove("fa-visible"); teaser.hidden = true; }

  lanceur.addEventListener("click", () => (ouvert ? fermer() : ouvrir()));
  q(".fa-fermer").addEventListener("click", fermer);
  teaserTexte.addEventListener("click", ouvrir);
  q(".fa-teaser-fermer").addEventListener("click", masquerTeaser);
  q(".fa-saisie").addEventListener("submit", ev => {
    ev.preventDefault();
    const texte = champ.value.trim();
    if (!texte || occupe) return;
    champ.value = ""; effacerChoix(); moi(texte); lancer(() => comprendre(texte));
  });
  document.addEventListener("keydown", ev => {
    const recherche = document.getElementById("scrim");
    if (ev.key === "Escape" && ouvert && !(recherche && recherche.classList.contains("open"))) fermer();
  });

  // Nouvelle alerte
  function actualiser() {
    const n = nbAlertes(lireEtat());
    badge.hidden = true;
    racine.classList.toggle("fa--alerte", n > 0);
    lanceur.setAttribute("aria-label", "Ouvrir l'assistant de supervision" + (n ? " (" + n + " alerte" + pl(n) + ")" : ""));
    if (dernierNombre !== null && n > dernierNombre)
      montrerTeaser("<span>Besoin d'aide ? 👋</span>");
    dernierNombre = n;
  }
  function inviter() {             // bulle d'aide à côté du robot
    if (ouvert) return;
    montrerTeaser("<span>Besoin d'aide ? 👋</span>");
  }

  // Messages
  const defiler = () => { fil.scrollTop = fil.scrollHeight; };
  async function bot(html) {
    const bulle = document.createElement("div");
    bulle.className = "fa-msg fa-bot fa-ecrit";
    bulle.innerHTML = "<span></span><span></span><span></span>";
    fil.appendChild(bulle); defiler();
    await pause(calme ? 0 : 380 + Math.min(html.length * 2, 520));
    bulle.className = "fa-msg fa-bot"; bulle.innerHTML = html; defiler();
  }
  function moi(texte) {
    const bulle = document.createElement("div");
    bulle.className = "fa-msg fa-moi"; bulle.textContent = texte;
    fil.appendChild(bulle); defiler();
  }
  function choix(liste) {
    effacerChoix();
    const zone = document.createElement("div"); zone.className = "fa-choix";
    liste.forEach(c => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fa-puce"; b.textContent = c.l;
      b.addEventListener("click", () => { if (occupe) return; effacerChoix(); moi(c.l); lancer(c.a); });
      zone.appendChild(b);
    });
    fil.appendChild(zone); defiler();
  }
  const effacerChoix = () => fil.querySelectorAll(".fa-choix").forEach(z => z.remove());
  async function lancer(action) {          // évite que deux réponses se mélangent
    if (occupe) return; occupe = true;
    try { await action(); } finally { occupe = false; }
  }

  // Menus
  const menu = () => [
    { l: "État général", a: resume },
    { l: "Voir les alertes", a: alertes },
    { l: "Un environnement", a: choisirEnv },
    { l: "Lancer un contrôle", a: controle },
    { l: "Consulter la documentation", a: menuDoc }
  ];
  async function menuSimple() { await bot("Que voulez-vous faire ?"); choix(menu()); }

  // Scénarios
  async function accueil() {
    const h = new Date().getHours();
    await bot((h >= 18 || h < 5 ? "Bonsoir" : "Bonjour") + " 👋 Je suis <b>" + NOM + "</b>, l'assistant de supervision.");
    await resume();
  }

  async function resume() {
    const envs = lireEtat(), soucis = envs.filter(e => e.etat !== "ok");
    if (!soucis.length) {
      await bot("Bonne nouvelle : les " + envs.length + " environnements sont <b>opérationnels</b>, tous les services sont démarrés.");
      return menuSimple();
    }
    const n = soucis.length;
    await bot(n + " environnement" + pl(n) + " demande" + pl(n, "nt") + " votre attention :" +
      '<ul class="fa-liste">' + soucis.map(e => "<li>" + point(e.etat) + "<span><b>" + ech(e.code) + "</b> · " +
        LIBELLES[e.etat] + ' <span class="fa-discret">(' + e.servicesOk + "/" + e.servicesTotal + " services)</span></span></li>").join("") + "</ul>");
    await bot("On regarde <b>" + ech(soucis[0].code) + "</b> en détail ?");
    choix([
      { l: "Oui, montre-moi", a: () => detail(soucis[0].code) },
      { l: "Toutes les alertes", a: alertes },
      { l: "Plus tard", a: menuSimple }
    ]);
  }

  function carte(e) {
    const pct = e.servicesTotal ? Math.round(100 * e.servicesOk / e.servicesTotal) : 100;
    return '<div class="fa-carte ' + e.etat + '">' +
      '<div class="fa-carte-haut"><span class="fa-carte-code">' + ech(e.code) + "</span>" + point(e.etat) + "</div>" +
      '<b class="fa-carte-nom">' + ech(e.nom) + "</b>" +
      '<span class="fa-carte-etat">' + LIBELLES[e.etat] + "</span>" +
      '<div class="fa-carte-chiffres"><span><strong>' + e.servicesOk + "</strong><em>/ " + e.servicesTotal + " services</em></span>" +
      '<span class="fa-carte-noeuds">' + e.noeuds + " nœud" + pl(e.noeuds) + "</span></div>" +
      '<span class="fa-jauge"><i style="width:' + pct + '%"></i></span></div>';
  }

  async function detail(code) {
    const e = lireEtat().find(x => x.code === code);
    if (!e) { await bot("Je ne trouve pas l'environnement " + ech(code) + "."); return choisirEnv(); }
    await bot(carte(e));
    if (e.maintenance.length)
      await bot(point("degrade") + " En maintenance : " + e.maintenance.map(ech).join(", ") + ".");
    if (e.problemes.length) {
      await bot("Ce qui ne va pas :" + '<ul class="fa-liste">' +
        e.problemes.map(p => "<li>" + point("panne") + "<span>" + ech(p) + "</span></li>").join("") + "</ul>");
      await bot("Je vous l'affiche dans la supervision, ou vous voulez la marche à suivre ?");
      choix([
        { l: "Afficher " + e.code, a: () => afficher(e.code) },
        { l: "La marche à suivre", a: () => doc("alerte") },
        { l: "Relancer un contrôle", a: controle }
      ]);
    } else {
      await bot("Rien à signaler sur cet environnement 👍");
      choix([
        { l: "Afficher " + e.code, a: () => afficher(e.code) },
        { l: "Un autre environnement", a: choisirEnv },
        { l: "Menu", a: menuSimple }
      ]);
    }
  }

  async function afficher(code) {           // ouvre l'environnement dans la page
    state.env = code; state.node = null; render(); fermerAccueil();
    await bot("C'est affiché : <b>" + ech(code) + "</b> est ouvert" +
      (lireEtat().find(x => x.code === code).problemes.length ? ", avec le nœud en défaut sélectionné." : "."));
    choix(menu());
  }

  async function choisirEnv() {
    await bot("Quel environnement ?");
    choix(lireEtat().map(e => ({ l: e.code + " · " + e.nom, a: () => detail(e.code) }))
      .concat([{ l: "Retour", a: menuSimple }]));
  }

  async function alertes() {
    const lignes = [];
    lireEtat().forEach(e => e.problemes.forEach(p =>
      lignes.push("<li>" + point("panne") + "<span><b>" + ech(e.code) + "</b> · " + ech(p) + "</span></li>")));
    if (!lignes.length) { await bot("Aucune alerte en cours : tous les services sont démarrés."); return menuSimple(); }
    await bot(lignes.length + " alerte" + pl(lignes.length) + " en cours :" + '<ul class="fa-liste">' + lignes.join("") + "</ul>");
    choix([
      { l: "Que faire ?", a: () => doc("alerte") },
      { l: "Relancer un contrôle", a: controle },
      { l: "Menu", a: menuSimple }
    ]);
  }

  async function controle() {
    await bot("Je lance un contrôle de tous les environnements…");
    try { await checkNow(); } catch (e) {}
    actualiser();
    await bot("Contrôle terminé ✔");
    await resume();
  }

  async function menuDoc() {
    await bot("Quelle partie de la documentation souhaitez-vous consulter ?");
    choix(Object.keys(DOCS).map(cle => ({ l: DOCS[cle].titre, a: () => doc(cle) }))
      .concat([{ l: "Retour", a: menuSimple }]));
  }

  async function doc(cle) {
    const fiche = DOCS[cle];
    if (!fiche) return menuDoc();
    await bot("<b>" + ech(fiche.titre) + "</b><br>" + fiche.texte);
    await bot("Ça répond à votre question ?");
    choix([
      { l: "Oui, merci", a: async () => { await bot("Parfait ! Je reste dans le coin si besoin."); choix(menu()); } },
      { l: "Autre sujet", a: menuDoc },
      { l: "Menu", a: menuSimple }
    ]);
  }

  // Questions libres
  async function comprendre(brut) {
    const t = norm(brut);
    const env = lireEtat().find(e =>
      new RegExp("\\b" + norm(e.code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(t) || t.includes(norm(e.nom)));
    if (env) return detail(env.code);
    if (/pastille|couleur|signifi|veut dire|gris/.test(t)) return doc("pastilles");
    if (/que faire|marche a suivre|procedure|mail|courriel/.test(t)) return doc("alerte");
    if (/raccourci|clavier|touche/.test(t)) return doc("raccourcis");
    if (/journal|export|excel|csv|historique/.test(t)) return doc("journal");
    if (/alerte|probleme|panne|erreur|arret|rouge|degrade/.test(t)) return alertes();
    if (/controle|verifi|relanc|actualis|rafraich/.test(t)) return controle();
    if (/noeud|serveur|cluster|maintenance|service/.test(t)) return doc("noeuds");
    if (DOCS.demo && /demo|simul/.test(t)) return doc("demo");
    if (/doc|aide|comment|explique|help/.test(t)) return menuDoc();
    if (/etat|resume|statut|situation|global|ca va/.test(t)) return resume();
    if (/^(bonjour|salut|hello|coucou|bonsoir|hey)/.test(t)) { await bot("Bonjour 👋"); return menuSimple(); }
    if (/merci/.test(t)) { await bot("Avec plaisir 😊"); return choix(menu()); }
    await bot("Je n'ai pas bien compris. Voici ce que je sais faire :");
    choix(menu());
  }

  // Position
  function placer() {
    const pied = document.querySelector(".foot");
    const surAccueil = document.body.classList.contains("intro-ouvert");
    if (!surAccueil && pied) {
      if (racine.parentNode !== pied) pied.appendChild(racine);
      racine.classList.add("fa--pied");
    } else {
      if (racine.parentNode !== document.body) document.body.appendChild(racine);
      racine.classList.remove("fa--pied");
    }
  }
  new MutationObserver(placer).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  placer();

  // Démarrage
  actualiser();
  setInterval(actualiser, 2000);          // suit les contrôles automatiques
  setTimeout(inviter, 800);               // la bulle « Besoin d'aide ? » apparaît
})();
