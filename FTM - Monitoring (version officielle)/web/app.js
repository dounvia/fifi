if (!DATA) throw new Error("pas de données");

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const plural = (n, w) => n + " " + w + (n > 1 ? "s" : "");
const ICON_COPY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const ICON_EXT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';

let state = { env: null, node: null, onlyDown: false, theme: "light" };
try { const s = JSON.parse(localStorage.getItem("ftm-ui") || "{}"); Object.assign(state, s); } catch (e) {}
const save = () => { try { localStorage.setItem("ftm-ui", JSON.stringify(state)); } catch (e) {} };

const envOf = c => DATA.envs.find(e => e.code === c) || DATA.envs[0];
const enMaint = n => !!n.maintenance;                                  // nœud en maintenance
const svcDown = n => enMaint(n) ? [] : n.services.filter(s => s.ok === false);   // arrêtés (hors maintenance)
const etatSvc = s => s.ok === true ? "ok" : s.ok === false ? "ko" : "nv";   // nv = non vérifié
const libelle = s => s.ok === true ? "Démarré" : s.ok === false ? "Arrêté" : "Non vérifié";
const envDown = e => e.nodes.flatMap(svcDown);
const envSvc = e => e.nodes.filter(n => !enMaint(n)).flatMap(n => n.services.filter(s => s.cat !== "acces"));
const fmtPct = v => v == null ? "–" : (v >= 99.95 && v < 100 ? "99,9" : v.toFixed(1).replace(".", ",").replace(",0", "")) + " %";
function dispoMoy(services) {   // disponibilité moyenne sur 7 jours
  const v = services.map(s => s.dispo7).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
document.documentElement.dataset.theme = state.theme;   // thème mémorisé

// Logo
function logoSVG(couleur) {

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + '<defs><linearGradient id="logoTrait" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset=".5" stop-color="#60a5fa"/><stop offset="1" stop-color="#3b82f6"/></linearGradient>'
    + '<linearGradient id="logoFond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>'
    + '<rect width="64" height="64" rx="16" fill="url(#logoFond)"/>'
    + '<rect x=".5" y=".5" width="63" height="63" rx="15.5" fill="none" stroke="rgba(255,255,255,.12)"/>'
    + '<path d="M10 36h10l5-12 8 22 6-16 4 6h11" fill="none" stroke="url(#logoTrait)" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="52" cy="12" r="6.5" fill="' + couleur + '" stroke="#0f172a" stroke-width="3"/></svg>';
}
function renderLogo() {
  const panne = DATA.envs.some(e => envDown(e).length > 0);
  const svg = logoSVG(panne ? "#f43f5e" : "#34d399");
  $("#logo").innerHTML = svg;
 const petit = svg.replace('viewBox="0 0 64 64"', 'viewBox="-4 -4 72 72"');
 $("#favicon").href = "data:image/svg+xml," + encodeURIComponent(petit);

}

// Onglets
function renderTabs() {
  const box = $("#tabs");
  box.querySelectorAll(".tab").forEach(t => t.remove());
  DATA.envs.forEach((e, i) => {
    const d = envDown(e).length;
    const b = document.createElement("button");
    b.className = "tab"; b.role = "tab"; b.id = "tab-" + e.code;
    b.setAttribute("aria-selected", e.code === state.env);
    b.title = e.name + " (touche " + (i + 1) + ")";
    b.innerHTML = `<span class="dot ${d ? "ko" : "ok"}"></span><span><span class="code">${esc(e.code)}</span> <span class="tname">${esc(e.name)}</span></span>
      ${d ? `<span class="count">${d}</span>` : ""}`;
    b.onclick = () => selectEnv(e.code);
    box.appendChild(b);
  });
  moveInd();
}
function moveInd(instant) {
  const t = $("#tab-" + state.env), ind = $("#tabInd");
  if (!t) return;
  if (instant) ind.style.transition = "none";
  ind.style.width = t.offsetWidth + "px";
  ind.style.transform = `translateX(${t.offsetLeft - 4}px)`;
  ind.style.left = "4px";
  if (instant) requestAnimationFrame(() => ind.style.transition = "");
}

// En-tête

function etatCluster(e) {
  const total = e.nodes.length, actifs = e.nodes.filter(n => !svcDown(n).length).length;
  if (!e.cluster) return { cls: "unique", txt: "Nœud unique", actifs, total };
  if (actifs === total) return { cls: "ok", txt: "Opérationnel", actifs, total };
  if (actifs > 0) return { cls: "degrade", txt: "Dégradé", actifs, total };
  return { cls: "hs", txt: "Hors service", actifs, total };
}
function dispo(e) {
  const h = envSvc(e).flatMap(s => s.history);
  return h.length ? Math.round(1000 * h.filter(Boolean).length / h.length) / 10 : 100;
}
function renderHero(e) {
  const all = envSvc(e), down = all.filter(s => s.ok === false), up = all.filter(s => s.ok === true).length;
  const pct = all.length ? up / all.length : 0, C = 2 * Math.PI * 17;
  const col = down.length === 0 ? "var(--green)" : pct >= .5 ? "var(--amber)" : "var(--red)";
  const nDownNodes = e.nodes.filter(n => svcDown(n).length).map(n => n.name);
  const nv = all.filter(s => s.ok == null).length;
  const phrase = down.length === 0 && nv
    ? `<span class="dot nv"></span>${plural(nv, "service")} non vérifié${nv > 1 ? "s" : ""} : connexion SSH impossible.`
    : down.length === 0
    ? `<span class="dot ok"></span>Tous les services sont démarrés.`
    : `<span class="dot ko"></span>${plural(down.length, "service")} arrêté${down.length > 1 ? "s" : ""} sur ${nDownNodes.map(esc).join(", ")}.`;
  const maint = e.nodes.filter(enMaint);
  const phraseMaint = maint.length ? `<span class="ph"><span class="dot mt"></span>${maint.map(n => esc(n.name)).join(", ")} en maintenance.</span>` : "";
  const d7 = dispoMoy(all);
  $("#hero").innerHTML = `
    <div><h1>${esc(e.name)} <span class="chip">${esc(e.code)}</span></h1><p><span class="ph">${phrase}</span>${phraseMaint}</p></div>
    <div class="stats">
      <div class="stat"><div><small>Cluster <span class="etat-cl ${etatCluster(e).cls}">${etatCluster(e).txt}</span></small><strong>${etatCluster(e).actifs} <em>sur ${plural(e.nodes.length, "nœud")} actif${etatCluster(e).actifs > 1 ? "s" : ""}</em></strong></div></div>
      <div class="stat">
        <svg class="ring" width="44" height="44" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="17"/>
          <circle class="val" cx="22" cy="22" r="17" stroke="${col}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <div><small>Services démarrés</small><strong>${up} <em>sur ${all.length}</em></strong></div>
      </div>
      <div class="stat" title="Part des contrôles où les services étaient démarrés, sur les 7 derniers jours (hors maintenance)">
        <div><small>Disponibilité</small><strong class="dispo-val">${fmtPct(d7)} <em>sur 7 jours</em></strong></div></div>
    </div>`;
}

// Topologie
const estAcces = s => s.cat === "acces";
const nbArrets = n => svcDown(n).filter(s => !estAcces(s)).length;
function accesHTML(n) {
  const a = n.services.filter(estAcces);
  if (!a.length) return "";
  return `<div class="acces"><span class="acces-lbl">Accès machine</span>${a.map(s =>
    `<span class="acces-it ${etatSvc(s)}" title="${esc(s.name)} : ${s.ok ? "répond" : "ne répond pas"}"><span class="dot ${etatSvc(s)}"></span>${esc(s.name)}</span>`).join("")}</div>`;
}
function nodeCard(n) {
  const d = svcDown(n), mt = enMaint(n);
  let list = n.services.filter(s => !estAcces(s));
  if (state.onlyDown) list = list.filter(s => s.ok !== true);
  const items = list.map(s => `<li class="svc ${etatSvc(s)}"><span class="dot ${etatSvc(s)}"></span>
      <span class="nm">${esc(s.name)}</span><span class="st"${s.ancien ? ' title="Connexion SSH ratée à ce contrôle : dernier état connu"' : ""}>${libelle(s)}${s.ancien ? " *" : ""}</span></li>`).join("")
    || `<li class="svc-all"><span class="dot ok"></span>Tous les services sont démarrés</li>`;
  const pill = mt ? `<span class="pill mt" title="Aucune alerte mail pour ce nœud"><span class="dot mt"></span>Maintenance</span>`
    : `<span class="pill ${d.length ? "ko" : "ok"}"><span class="dot ${d.length ? "ko" : "ok"}"></span>${d.length ? (nbArrets(n) ? plural(nbArrets(n), "arrêt") : "Accès coupé") : "En service"}</span>`;
  return `<button class="node ${d.length ? "down" : ""} ${mt ? "maint" : ""} ${state.node === n.id ? "selected" : ""}" data-node="${esc(n.id)}" aria-pressed="${state.node === n.id}">
    <div class="node-head"><div class="node-title"><b>${esc(n.name)}</b><span class="mono">${esc(n.host)} · ${esc(n.ip)}</span></div>
      ${pill}</div>
    ${accesHTML(n)}<ul class="svc-list">${items}</ul></button>`;
}
function renderTopo(e) {
  const trt = e.nodes;
  const okNodes = trt.filter(n => !svcDown(n).length).length;
  $("#topoSub").textContent = `${plural(e.nodes.length, "nœud")}, ${plural(envSvc(e).length, "service")} contrôlés. Cliquez sur un nœud pour le détail.`;
  $("#topo").innerHTML = `
    <div class="tree">
      <span class="cluster-label hub"><span class="hub-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="12" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><path d="M12 7.4V16.6M12 11H5.5v5.6M12 11h6.5v5.6"/></svg></span>
        <span><b>${e.cluster ? "Cluster Secure Transport" : "Secure Transport"}</b>
        <small class="${okNodes < trt.length ? "ko" : ""} ${etatCluster(e).cls}">${etatCluster(e).txt}, ${okNodes} sur ${plural(trt.length, "nœud")} actif${okNodes > 1 ? "s" : ""}</small></span></span>
      <span class="trunk flow"></span>
    <div class="cluster ${e.cluster ? "is-cluster" : ""}" style="--n:${Math.max(trt.length, 1)}">
      ${trt.map(n => `<div class="slot"><div class="link-v flow ${enMaint(n) ? "mt" : svcDown(n).length ? "down" : ""}"></div>${nodeCard(n)}</div>`).join("")}
    </div></div>`;
  $("#topo").querySelectorAll(".node").forEach(b => b.onclick = () => selectNode(b.dataset.node, true));
}

// Détail du nœud
function bars(h) {
  h = h.slice(-20);
  const vides = Array(Math.max(0, 20 - h.length)).fill('<i class="v"></i>').join("");
  return `<div class="bars">${vides}${h.map((v, i) => `<i class="${v ? "" : "k"}" title="Contrôle −${h.length - 1 - i} : ${v ? "démarré" : "arrêté"}"></i>`).join("")}</div>`;
}
function renderInspector(e) {
  const n = e.nodes.find(x => x.id === state.node) || e.nodes[0];
  const d = svcDown(n);
  const ssh = n.sshUser ? `${n.sshUser}@${n.ip}` : "";
  const ligneHist = s => {
    const okRate = s.dispo7 != null ? fmtPct(s.dispo7) : (s.history.length ? Math.round(100 * s.history.filter(Boolean).length / s.history.length) : 100) + " %";
    return `<div class="hrow" title="Disponibilité sur 7 jours : ${okRate}"><div class="hrow-top"><span class="dot ${etatSvc(s)}"></span><span class="nm">${esc(s.name)}</span>
      ${bars(s.history)}<span class="meta ${etatSvc(s)}">${s.ok === true ? (s.ms != null ? s.ms + " ms" : "Démarré") : s.ok === false ? "Arrêté " + esc(s.since) : "Non vérifié"}</span></div></div>`;
  };
  const hist = n.services.filter(s => !estAcces(s)).map(ligneHist).join("");
  const histAcces = n.services.filter(estAcces).map(ligneHist).join("");
  $("#inspector").innerHTML = `
    <div class="ins-head">
      <div class="ins-top"><div><h3>${esc(n.name)}</h3><div class="role">Nœud de traitement Secure Transport</div></div>
        ${enMaint(n) ? `<span class="pill mt"><span class="dot mt"></span>Maintenance</span>`
          : `<span class="pill ${d.length ? "ko" : "ok"}"><span class="dot ${d.length ? "ko" : "ok"}"></span>${d.length ? (nbArrets(n) ? plural(nbArrets(n), "arrêt") : "Accès coupé") : "En service"}</span>`}</div>
      <div class="facts">
        <button class="fact copy" data-copy="${esc(n.host)}"><small>Hostname</small><span class="mono">${esc(n.host)}</span>${ICON_COPY}</button>
        <button class="fact copy" data-copy="${esc(n.ip)}"><small>Adresse IP</small><span class="mono">${esc(n.ip)}</span>${ICON_COPY}</button>
        ${ssh ? `<button class="fact copy wide" data-copy="ssh ${esc(ssh)}"><small>Connexion SSH</small><span class="mono">ssh ${esc(ssh)}</span>${ICON_COPY}</button>` : ""}
        <div class="fact wide" title="Part des contrôles où les services de ce nœud étaient démarrés (hors maintenance)"><small>Disponibilité sur 7 jours</small><span class="mono">${fmtPct(dispoMoy(n.services))}</span></div>
      </div>
      ${enMaint(n) ? `<div class="maint-note"><span class="dot mt"></span><span><b>En maintenance depuis ${esc(n.maintenance.depuis)}.</b> Aucune alerte mail n'est envoyée pour ce nœud. À la fin de la maintenance, une alerte part si un service est toujours arrêté.</span></div>` : ""}
      <div class="ins-links">${(n.links || []).map(l => `<a class="btn btn-ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ${ICON_EXT}</a>`).join("")}
        <button class="btn btn-ghost btn-maint" id="maintBtn" title="${enMaint(n) ? "Réactiver les alertes mail pour ce nœud" : "Suspendre les alertes mail pendant une intervention prévue"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/></svg>
          ${enMaint(n) ? "Terminer la maintenance" : "Mettre en maintenance"}</button></div>
    </div>
    <div class="ins-body">
      ${histAcces ? `<div class="ins-sec"><div class="sec-title"><h4>Accès à la machine</h4><span>20 derniers contrôles</span></div>${histAcces}</div>` : ""}
      <div class="ins-sec"><div class="sec-title"><h4>Services Secure Transport</h4><span>20 derniers contrôles</span></div>${hist}</div>
    </div>`;
  $("#inspector").querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copy(b.dataset.copy));
  $("#maintBtn").onclick = () => basculerMaintenance(n);
}

async function basculerMaintenance(n) {
  const b = $("#maintBtn"); b.disabled = true;
  const actif = !enMaint(n);
  try {
    const r = await fetch("api/maintenance", { method: "POST", headers: { "Content-Type": "application/json" },
                                               body: JSON.stringify({ id: n.id, actif }) });
    if (!r.ok) throw 0;
    Object.assign(DATA, await r.json());
    render();
    toast(actif ? `${n.name} en maintenance : alertes mail suspendues` : `Fin de maintenance sur ${n.name} : alertes réactivées`, actif ? "mt" : "ok");
  } catch (err) { toast("Impossible de changer le mode maintenance : vérifiez que supervision.py tourne.", "ko"); b.disabled = false; }
}

function renderEvents(e) {
  const j = e.journal || [];
  $("#events").innerHTML = j.length ? `<ul class="journal">${j.slice(0, 8).map(x => {
      const n = e.nodes.find(k => k.name === x.node);
      if (x.type === "maintenance") return `<li><time>${esc(x.t)}</time><span class="dot mt"></span>
        <div><span class="mt-txt">${x.ok ? "Fin de maintenance" : "Début de maintenance"}</span></div>
        <button data-n="${esc(n ? n.id : "")}">${esc(x.node)}</button></li>`;
      return `<li><time>${esc(x.t)}</time><span class="dot ${x.ok ? "ok" : "ko"}"></span>
        <div>${esc(x.service)} <span>${x.ok ? "a redémarré" : "s'est arrêté"}</span></div>
        <button data-n="${esc(n ? n.id : "")}">${esc(x.node)}</button></li>`; }).join("")}</ul>`
    : `<p class="empty" style="padding:0 20px 18px;display:flex;align-items:center;gap:8px"><span class="dot ok"></span>Aucun changement d'état aujourd'hui : tout est stable.</p>`;
  $("#events").querySelectorAll("button[data-n]").forEach(b => b.onclick = () => selectNode(b.dataset.n, true));
}

// Accueil
function renderAccueil() {
  const total = DATA.envs.flatMap(envSvc).length, down = DATA.envs.flatMap(envDown).length;
  $("#badgeDot").className = "dot " + (down ? "ko" : "ok");
  $("#badgeTxt").textContent = down ? `${plural(down, "alerte")} sur l'ensemble des environnements` : `Les ${total} services sont démarrés`;
  $("#envsLive").style.setProperty("--n", DATA.envs.length);
  $("#envsLive").innerHTML = DATA.envs.map(e => {
    const all = envSvc(e).length, d = envDown(e).length;
    return `<button class="env-live ${d ? "ko" : ""}" data-env="${esc(e.code)}">
      <span class="haut"><span class="code">${esc(e.code)}</span><span class="dot ${d ? "ko" : "ok"}"></span></span>
      <b>${esc(e.name)}</b>
      <span class="etat ${d ? "ko" : ""} ${etatCluster(e).cls}">${etatCluster(e).txt}</span>
      <span class="chiffres"><span class="nb"><strong>${all - d}</strong><em>/ ${all} services</em></span><span class="nd">${plural(e.nodes.length, "nœud")}</span></span>
      <span class="jauge"><i style="width:${all ? 100 * (all - d) / all : 100}%"></i></span></button>`;
  }).join("");
  $("#envsLive").querySelectorAll(".env-live").forEach(b => b.onclick = () => {
    state.env = b.dataset.env; state.node = null; render(); fermerAccueil();
  });
  const nbNoeuds = DATA.envs.reduce((t, e) => t + e.nodes.length, 0);
  const d = new Date(DATA.generatedAt);
  $("#introMaj").textContent = "Dernier contrôle à " + d.toLocaleTimeString("fr-FR");
  $("#logoIntro").innerHTML = $("#logo").innerHTML;
}

// Transition accueil / supervision
function fermerAccueil() {
  const a = $("#accueil"); if (a.classList.contains("sortie")) return;
  a.classList.add("sortie"); document.body.classList.remove("intro-ouvert"); document.body.classList.add("devoile"); document.body.style.paddingRight = "";
  try { sessionStorage.setItem("ftm-accueil-vu", "1"); } catch (e) {}
  setTimeout(() => { a.classList.add("cache"); moveInd(true); }, 1000);
}
function ouvrirAccueil() {
  // compense la barre de défilement
  const sb = innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = sb > 0 ? sb + "px" : "";
  const a = $("#accueil"); document.body.classList.remove("devoile"); a.classList.remove("cache");
  requestAnimationFrame(() => { a.classList.remove("sortie"); document.body.classList.add("intro-ouvert"); a.scrollTop = 0; });
  try { sessionStorage.removeItem("ftm-accueil-vu"); } catch (e) {}
}
(() => {
  let vu = false; try { vu = sessionStorage.getItem("ftm-accueil-vu") === "1"; } catch (e) {}
  if (vu) $("#accueil").classList.add("sortie", "cache");
  else document.body.classList.add("intro-ouvert");
  $("#entrer").onclick = fermerAccueil;
  $("#retourAccueil").onclick = ouvrirAccueil;
  $("#themeBtn2").onclick = () => $("#themeBtn").click();
  $("#descendre").onclick = fermerAccueil;
  $("#logo").title = "Revenir à l'accueil"; $("#logo").onclick = ouvrirAccueil;
  $("#accueil").addEventListener("wheel", ev => { if (ev.deltaY > 30 && $("#accueil").scrollHeight <= $("#accueil").clientHeight + 4) fermerAccueil(); }, { passive: true });
  document.addEventListener("keydown", ev => { if (!$("#accueil").classList.contains("sortie") && (ev.key === "Enter" || ev.key === "ArrowDown") && !ev.target.matches("input,button")) fermerAccueil(); });
})();

// Actions
function render() {
  const e = envOf(state.env); state.env = e.code;
  if (!e.nodes.some(n => n.id === state.node)) state.node = (e.nodes.find(n => svcDown(n).length) || e.nodes[0]).id;
  $("#onlyDown").checked = state.onlyDown;
  renderLogo(); renderAccueil(); renderTabs(); renderHero(e); renderTopo(e); renderInspector(e); renderEvents(e); save();
}
function selectEnv(code) { if (code === state.env) return; state.env = code; state.node = null; render(); }
function selectNode(id, scroll) {
  state.node = id; const e = envOf(state.env);
  $("#topo").querySelectorAll(".node").forEach(b => { const on = b.dataset.node === id; b.classList.toggle("selected", on); b.setAttribute("aria-pressed", on); });
  renderInspector(e); save();
  if (scroll && innerWidth <= 1180) $("#inspector").scrollIntoView({ behavior: "smooth", block: "start" });
}
function toast(msg, kind) {
  const t = document.createElement("div"); t.className = "toast";
  t.innerHTML = (kind ? `<span class="dot ${kind}"></span>` : "") + esc(msg);
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 2600);
}
function copy(txt) {
  const done = () => toast("Copié : " + txt, "ok");
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
}

let cycleLeft = DATA.interval;
async function checkNow() {
  const b = $("#checkNow"); if (b.disabled) return;
  b.disabled = true; $("#checkIco").classList.add("spin"); b.querySelector(".lbl").textContent = "Contrôle en cours…";
  const before = DATA.envs.flatMap(e => envDown(e).map(s => e.code + s.name)).length;
  try {
    if (DEMO) { await new Promise(r => setTimeout(r, 1300)); simulate(); }
    else {
      // délai max : 2 min
      const arret = new AbortController(), minuteur = setTimeout(() => arret.abort(), 120000);
      const r = await fetch("api/controle", { method: "POST", signal: arret.signal });
      clearTimeout(minuteur);
      if (!r.ok) throw 0;
      Object.assign(DATA, await r.json());
    }
    render(); cycleLeft = DATA.interval; stamp();
    const after = DATA.envs.flatMap(envDown).length;
    toast(after ? `Contrôle terminé : ${plural(after, "service")} arrêté${after > 1 ? "s" : ""}` : "Contrôle terminé : tout est démarré", after ? "ko" : "ok");
  } catch (err) { toast(err && err.name === "AbortError" ? "Le contrôle prend trop de temps : regardez le terminal (lignes [SSH])." : "Le contrôle n'a pas abouti : vérifiez que supervision.py tourne.", "ko"); }
  b.disabled = false; $("#checkIco").classList.remove("spin"); b.querySelector(".lbl").textContent = "Contrôler maintenant";
}
function simulate() {
  const now = new Date().toTimeString().slice(0, 5);
  DATA.envs.forEach(e => e.nodes.forEach(n => n.services.forEach(s => {
    const flip = Math.random() < .025; const ok = flip ? !s.ok : s.ok;
    if (flip) { (e.journal ||= []).unshift({ t: now, node: n.name, service: s.name, ok }); s.since = now; }
    s.ok = ok; s.ms = ok ? 4 + Math.round(Math.random() * 40) : null;
    s.history = s.history.slice(1).concat(ok ? 1 : 0);
  })));
  DATA.generatedAt = new Date().toISOString();
}
function stamp() {
  const d = new Date(DATA.generatedAt);
  const infos = ["Dernier contrôle le " + d.toLocaleDateString("fr-FR") + " à " + d.toLocaleTimeString("fr-FR")];
  if (DATA.confirmation) infos.push(DATA.confirmation > 1 ? `Alerte mail après ${DATA.confirmation} contrôles identiques` : "Alerte mail dès le premier contrôle");
  if (DATA.rapport) infos.push("Rapport quotidien à " + DATA.rapport.replace(":", " h "));
  $("#lastRun").textContent = infos.join("  ·  ");
}
function tick() {
  cycleLeft--; if (cycleLeft <= 0) { if ($("#checkNow").disabled) { cycleLeft = 5; } else { DEMO ? checkNow() : location.reload(); cycleLeft = DATA.interval; } }
  const L = 2 * Math.PI * 7;
  $("#cycleArc").style.strokeDasharray = L;
  $("#cycleArc").style.strokeDashoffset = L * (1 - cycleLeft / DATA.interval);
  $("#cycleTxt").textContent = cycleLeft + " s";
}

// Recherche
let hits = [], hi = 0;
function openSearch() { $("#scrim").classList.add("open"); $("#q").value = ""; runSearch(); setTimeout(() => $("#q").focus(), 10); }
function closeSearch() { $("#scrim").classList.remove("open"); }
function runSearch() {
  const q = $("#q").value.trim().toLowerCase();
  hits = [];
  DATA.envs.forEach(e => e.nodes.forEach(n => {
    const hay = [n.name, n.host, n.ip, e.code, e.name, ...n.services.map(s => s.name)].join(" ").toLowerCase();
    if (!q || hay.includes(q)) hits.push({ e, n });
  }));
  if (!q) hits.sort((a, b) => svcDown(b.n).length - svcDown(a.n).length);
  hi = 0; drawHits();
}
function drawHits() {
  $("#results").innerHTML = hits.slice(0, 40).map((h, i) => {
    const d = svcDown(h.n).length;
    return `<li role="option" aria-selected="${i === hi}" data-i="${i}"><span class="dot ${d ? "ko" : "ok"}"></span>
      <div class="t"><b>${esc(h.n.name)}</b><span class="mono">${esc(h.n.host)} · ${esc(h.n.ip)}</span></div>
      <span class="pill ${d ? "ko" : "ok"}">${d ? (nbArrets(h.n) ? plural(nbArrets(h.n), "arrêt") : "Accès coupé") : "En service"}</span><span class="env">${esc(h.e.code)}</span></li>`;
  }).join("") || `<li style="cursor:default;color:var(--ink-3)">Aucun nœud ne correspond à cette recherche.</li>`;
  $("#results").querySelectorAll("li[data-i]").forEach(li => {
    li.onclick = () => pick(+li.dataset.i);
    li.onmousemove = () => { if (hi !== +li.dataset.i) { hi = +li.dataset.i; drawHits(); } };
  });
  const sel = $("#results li[aria-selected=true]"); if (sel) sel.scrollIntoView({ block: "nearest" });
}
function pick(i) { const h = hits[i]; if (!h) return; closeSearch(); state.env = h.e.code; state.node = h.n.id; render(); }

// Raccourcis clavier
document.addEventListener("keydown", ev => {
  const open = $("#scrim").classList.contains("open");
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); open ? closeSearch() : openSearch(); return; }
  if (open) {
    if (ev.key === "Escape") closeSearch();
    else if (ev.key === "ArrowDown") { ev.preventDefault(); hi = Math.min(hi + 1, hits.length - 1); drawHits(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); hi = Math.max(hi - 1, 0); drawHits(); }
    else if (ev.key === "Enter") pick(hi);
    return;
  }
  if (ev.target.matches("input")) return;
  if (/^[1-9]$/.test(ev.key) && DATA.envs[ev.key - 1]) selectEnv(DATA.envs[ev.key - 1].code);
  if (ev.key === "/") { ev.preventDefault(); openSearch(); }
  if (ev.key.toLowerCase() === "r" && !ev.ctrlKey && !ev.metaKey) checkNow();
});
$("#q").addEventListener("input", runSearch);
$("#scrim").addEventListener("mousedown", ev => { if (ev.target.id === "scrim") closeSearch(); });
$("#openSearch").onclick = openSearch;
$("#checkNow").onclick = checkNow;
$("#checkNow2").onclick = checkNow;
$("#themeBtn").onclick = () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme; save();
};
$("#onlyDown").onchange = ev => { state.onlyDown = ev.target.checked; renderTopo(envOf(state.env)); save(); };
addEventListener("resize", () => moveInd(true));

render(); moveInd(true); stamp(); tick(); setInterval(tick, 1000);
// Bandeau mode démo
if (DATA.source && DATA.source !== "reel") {
  const d = document.createElement("div"); d.className = "alerte-source";
  d.innerHTML = DATA.source === "demo" ? "<b>Environnement de démonstration</b><span>· Données fictives, aucune connexion aux serveurs</span>" : "<b>Machines d'exemple</b><span>· Fichier environnements.csv introuvable</span>";
  d.title = DATA.source === "demo" ? "Relancez sans --demo pour superviser les vraies machines."
                                   : "Fichier environnements.csv introuvable à côté de supervision.py.";
  d.insertAdjacentHTML("afterbegin", '<span class="ico-demo"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg></span>');
  document.body.appendChild(d); document.body.classList.add("avec-alerte");
}

if (document.fonts) document.fonts.ready.then(() => moveInd(true));
