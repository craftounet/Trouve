import { createClient } from "@supabase/supabase-js";
import {
  days,
  clock,
  parisToday,
  datePlus,
  monday,
  occurs,
  commonSlots,
} from "./availability.js";
import "./style.css";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;
let session = null,
  page = "home",
  authMode = "login",
  week = monday(parisToday()),
  groupId = "",
  data = {
    profiles: [],
    groups: [],
    group_members: [],
    events: [],
    cancellations: [],
    cancellation_confirmations: [],
    invitations: [],
  },
  channel,
  connectionStatus = "○ Connexion…",
  version = 0,
  recovery = false,
  loading = false;
let invitation =
  new URL(location.href).searchParams.get("invite") ||
  sessionStorage.getItem("trouve-invite") ||
  "";
if (invitation) {
  sessionStorage.setItem("trouve-invite", invitation);
  history.replaceState(null, "", location.pathname);
}
const notify = (message) => {
  $("#notice").textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("#notice").textContent = ""), 6000);
};
const check = (r) => {
  if (r.error) throw r.error;
  return r.data;
};
const me = () => session?.user.id;
const name = (id) =>
  data.profiles.find((p) => p.id === id)?.username || "Membre";
const group = () => data.groups.find((g) => g.id === groupId);
const members = () => data.group_members.filter((m) => m.group_id === groupId);
const owner = () => group()?.owner_id === me();
const button = (label, action, id = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const field = (label, n, type = "text", value = "", attrs = "") =>
  `<label>${label}<input name="${n}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
function modal(html) {
  $("#dialog").innerHTML = html;
  $("#dialog").showModal();
}
function render() {
  if (!db) {
    $("#app").innerHTML =
      '<div class="auth card"><h1>Configurer Trouve</h1><p>Copie .env.example vers .env.local, puis relance le serveur.</p></div>';
    return;
  }
  if (!session || recovery) {
    renderAuth();
    return;
  }
  $("#app").innerHTML =
    `<div class="shell"><aside><div class="brand">tr<b>ou</b>ve<span style="color:#a497ff">.</span></div><nav>${[
      ["home", "◈ Accueil"],
      ["calendar", "▦ Mon agenda"],
      ["groups", "◎ Groupes"],
      ["profile", "◉ Mon profil"],
    ]
      .map(([p, l]) => button(l, "nav", p, p === page ? "active" : ""))
      .join(
        "",
      )}</nav><footer>DU TEMPS ENSEMBLE<p id="connection">${connectionStatus}</p>Horaires · Europe/Paris</footer></aside><main><div class="top"><div><div class="eyebrow">Ton temps, mieux partagé</div><h1>${page === "home" ? `Bonjour, ${esc(name(me()))} ✦` : page === "calendar" ? "Mon emploi du temps" : page === "groups" ? "Mes groupes" : "Mon profil"}</h1><span class="muted">${page === "home" ? "Le bon moment pour se retrouver." : page === "calendar" ? "Tes cours récurrents, du lundi au dimanche." : page === "groups" ? "Un agenda partagé, des moments à inventer." : "Les autres membres voient ton prénom ou pseudo."}</span></div>${button("Déconnexion", "logout")}</div>${loading ? '<p role="status">Synchronisation…</p>' : ""}${invitation ? `<div class="card between"><span>Une invitation t’attend.</span>${button("Rejoindre le groupe", "accept", "", "primary")}</div>` : ""}${page === "profile" ? profileView() : page === "groups" ? groupsView() : calendarView()}</main></div>`;
}
function renderAuth() {
  const signup = authMode === "signup";
  $("#app").innerHTML =
    `<main class="auth"><div class="brand">tr<b>ou</b>ve.</div><div class="card"><div class="eyebrow">Du temps ensemble</div><h1>${recovery ? "Nouveau mot de passe" : authMode === "reset" ? "Mot de passe oublié" : signup ? "Bienvenue dans le groupe" : "On se retrouve ?"}</h1><p class="muted">Partage ton emploi du temps et trouve les créneaux où tout le monde est libre.</p><form data-form="auth">${signup ? field("Ton prénom ou pseudo", "username", "text", "", 'required minlength="2" maxlength="60" autocomplete="nickname"') : ""}${!recovery ? field("Adresse e-mail", "email", "email", "", 'required autocomplete="email"') : ""}${authMode !== "reset" || recovery ? field("Mot de passe", "password", "password", "", 'required minlength="8" autocomplete="' + (signup || recovery ? "new-password" : "current-password") + '"') : ""}<button class="primary wide" type="submit">${recovery ? "Enregistrer" : authMode === "reset" ? "Recevoir le lien" : signup ? "Créer mon compte" : "Se connecter"}</button></form>${!recovery ? `<div class="auth-switch">${button(signup ? "J’ai déjà un compte" : "Créer un compte", "auth-mode", signup ? "login" : "signup")}${button("Mot de passe oublié", "auth-mode", "reset")}</div>` : ""}<p class="muted">${invitation ? "Ton invitation sera conservée après la connexion." : "Ton agenda est visible uniquement par les membres de tes groupes."}</p></div></main>`;
}
function groupSelect() {
  return `<select id="group-select" aria-label="Groupe actif"><option value="">Choisir un groupe</option>${data.groups.map((g) => `<option value="${g.id}" ${g.id === groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>`;
}
function calendarView() {
  const personal = page === "calendar",
    dates = Array.from({ length: 7 }, (_, i) => datePlus(week, i));
  const ids = personal ? [me()] : members().map((m) => m.user_id);
  return `<div class="toolbar card"><div class="toolbar">${personal ? "<strong>Mon agenda</strong>" : groupSelect()}<div>${button("←", "week", "-7")} <span>Semaine du ${esc(week.split("-").reverse().join("/"))}</span> ${button("→", "week", "7")}</div>${personal ? button("⇧ Importer", "import-agenda") : ""}${button("+ Ajouter un cours", "add-event", "", "primary")}</div></div>${
    !personal && !group()
      ? `<div class="card empty"><h2>Tout commence par un groupe</h2><p>Crée un groupe ou rejoins tes amis avec leur lien d’invitation.</p>${button("Voir mes groupes", "nav", "groups", "primary")}</div>`
      : `<div class="${personal ? "" : "grid"}"><div><div class="card"><div class="between"><h2>${personal ? "Ma semaine" : esc(group().name)}</h2><span class="pill">${ids.length} ${personal ? "agenda" : "membre(s)"}</span></div><div class="scroll"><div class="calendar">${dates
          .map(
            (date, i) =>
              `<div class="day"><h3>${days[i]}<small>${date.slice(8)}/${date.slice(5, 7)}</small></h3>${
                data.events
                  .filter((e) => ids.includes(e.user_id) && occurs(e, date))
                  .sort((a, b) => a.start_time.localeCompare(b.start_time))
                  .map((e) => {
                    let c = data.cancellations.find(
                      (c) =>
                        c.group_id === groupId &&
                        c.event_id === e.id &&
                        c.occurrence_date === date,
                    );
                    return `<button class="course ${c?.status === "confirmed" ? "good" : ""}" data-action="event" data-id="${e.id}" data-date="${date}"><b>${esc(e.title)}</b><small>${e.start_time.slice(0, 5)} – ${e.end_time.slice(0, 5)}</small><small>${esc(personal ? e.teacher : name(e.user_id))} ${esc(e.room)}</small>${c ? `<span class="pill ${c.status === "confirmed" ? "good" : c.status}">${statusLabel(c.status)}</span>` : ""}</button>`;
                  })
                  .join("") || "<small>Aucun cours</small>"
              }</div>`,
          )
          .join(
            "",
          )}</div></div></div>${!personal ? reportsView() : ""}</div>${!personal ? `<div><div class="card"><h2>✦ Trous communs</h2><small>8 h–18 h · au moins 30 min · heure de Paris</small><p class="muted">Basé sur les cours saisis. Un agenda vide est considéré libre : vérifiez que chacun a complété le sien.</p>${dates.flatMap((date, i) => commonSlots({ events: data.events, cancellations: data.cancellations, memberIds: ids, groupId, date }).map(([s, e]) => `<div class="slot"><div><b>${days[i]}</b><small>${clock(s)} → ${clock(e)}</small></div><span class="pill good">${ids.length}/${ids.length} libres</span></div>`)).join("") || "<p>Aucun créneau commun cette semaine.</p>"}</div></div>` : ""}</div>`
  }`;
}
const statusLabel = (s) =>
  ({
    pending: "À confirmer",
    confirmed: "Absence confirmée",
    rejected: "Signalement rejeté",
  })[s];
function reportsView() {
  const reports = data.cancellations.filter(
    (c) =>
      c.group_id === groupId &&
      c.occurrence_date >= week &&
      c.occurrence_date <= datePlus(week, 6),
  );
  return `<div class="card"><h2>Prof absent ? On vérifie ensemble.</h2><p class="muted">Le signalement compte pour une voix. Deux « oui » distincts et une majorité stricte libèrent uniquement cette occurrence, dans ce groupe.</p>${reports.map((c) => `<div class="slot"><div><b>${esc(data.events.find((e) => e.id === c.event_id)?.title || "Cours")}</b><small>${c.occurrence_date} · ${data.cancellation_confirmations.filter((v) => v.cancellation_id === c.id && v.confirmation).length} confirmation(s)</small><span class="pill ${c.status === "confirmed" ? "good" : c.status}">${statusLabel(c.status)}</span></div><div>${button("Confirmer", "vote-yes", c.id)} ${button("Contester", "vote-no", c.id)}</div></div>`).join("") || '<p class="empty">Aucun signalement cette semaine.</p>'}</div>`;
}
function groupsView() {
  return `<div class="card between">${groupSelect()}${button("+ Créer un groupe", "new-group", "", "primary")}${button("Saisir une invitation", "enter-invite")}</div>${
    group()
      ? `<div class="grid"><div class="card"><div class="between"><h2>${esc(group().name)}</h2>${owner() ? button("Renommer", "rename-group") : button("Quitter", "leave-group", "", "danger")}</div>${members()
          .map(
            (m) =>
              `<div class="member"><span class="avatar">${esc(name(m.user_id).slice(0, 1).toUpperCase())}</span><div>${esc(name(m.user_id))}<small>${m.user_id === group().owner_id ? "Propriétaire" : m.user_id === me() ? "Toi" : "Membre"}</small></div>${owner() && m.user_id !== me() ? button("Retirer", "remove-member", m.user_id) : ""}</div>`,
          )
          .join(
            "",
          )}${owner() ? `<div class="actions">${button("Supprimer le groupe", "delete-group", "", "danger")}</div>` : ""}</div><div class="card"><h2>Inviter tes amis</h2><p class="muted">Chaque lien fonctionne une fois et expire après sept jours. Le propriétaire peut le révoquer.</p>${
          owner()
            ? `${button("Créer un lien", "invite", "", "primary")}${data.invitations
                .filter((i) => i.group_id === groupId)
                .map(
                  (i) =>
                    `<div class="slot"><span>${i.revoked ? "Révoqué" : i.used_at ? "Utilisé" : new Date(i.expires_at) < new Date() ? "Expiré" : "Disponible"}<small>Expire le ${new Date(i.expires_at).toLocaleDateString("fr-FR")}</small></span>${!i.revoked && !i.used_at ? `<div>${button("Copier", "copy-invite", i.token)} ${button("Révoquer", "revoke-invite", i.id)}</div>` : ""}</div>`,
                )
                .join("")}`
            : "<p>Demande un lien au propriétaire du groupe.</p>"
        }</div></div>`
      : '<div class="card empty">Aucun groupe sélectionné. Crée ton premier groupe ou utilise une invitation.</div>'
  }`;
}
function profileView() {
  return `<div class="card profile-form"><form data-form="profile">${field("Prénom ou pseudo", "username", "text", name(me()), 'required minlength="2" maxlength="60"')}<p class="muted">${esc(session.user.email)}</p><button class="primary">Enregistrer</button></form></div>`;
}
function importPreview(events, start, end) {
  modal(`<h2>Vérifier l’import</h2><p class="muted">${events.length} cours détecté(s). Corrige si besoin avant l’enregistrement.</p>
  <form data-form="confirm-import" data-start="${esc(start)}" data-end="${esc(end)}">
    <div class="import-list">${events.map((e,i)=>`<div class="import-row">
      <input name="title_${i}" value="${esc(e.title)}" required aria-label="Matière">
      <select name="day_${i}">${days.map((d,j)=>`<option value="${j}" ${j===e.day_of_week?"selected":""}>${d}</option>`).join("")}</select>
      <input name="start_${i}" type="time" value="${e.start_time}" required>
      <input name="end_${i}" type="time" value="${e.end_time}" required>
      <input name="teacher_${i}" value="${esc(e.teacher||"")}" placeholder="Prof">
      <input name="room_${i}" value="${esc(e.room||"")}" placeholder="Salle">
      <select name="parity_${i}"><option value="all" ${e.parity==="all"?"selected":""}>Toutes</option><option value="q1" ${e.parity==="q1"?"selected":""}>Q1</option><option value="q2" ${e.parity==="q2"?"selected":""}>Q2</option></select>
    </div>`).join("")}</div>
    <input type="hidden" name="count" value="${events.length}">
    <div class="actions"><button class="primary" type="submit">Importer les cours</button>${button("Annuler","close")}</div>
  </form>`);
}
function loadScript(src) {
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){ if(window.Tesseract) return resolve(); existing.addEventListener("load",resolve,{once:true}); return; }
    const s=document.createElement("script"); s.src=src; s.onload=resolve; s.onerror=()=>reject(new Error("Impossible de charger le lecteur de documents.")); document.head.appendChild(s);
  });
}
async function pdfAgenda(file, parityDefault) {
  const pdfjs = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const page=await pdf.getPage(1), vp=page.getViewport({scale:1});
  const tc=await page.getTextContent();
  const items=tc.items.map(x=>({text:x.str.trim(),x:x.transform[4],y:vp.height-x.transform[5],w:x.width,h:Math.abs(x.height||x.transform[3]||8)})).filter(x=>x.text);
  const dayNames=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
  const headers=dayNames.map((d,i)=>{const x=items.find(v=>v.text.toLowerCase()===d);return x?{i,x:x.x+x.w/2,y:x.y}:null}).filter(Boolean).sort((a,b)=>a.x-b.x);
  const clocks=items.map(v=>{const m=v.text.match(/^(\d{1,2})h(\d{2})$/i);return m?{m:+m[1]*60 + +m[2],y:v.y}:null}).filter(Boolean).sort((a,b)=>a.y-b.y);
  if(headers.length<5||clocks.length<4) throw new Error("La grille du PDF n’a pas pu être reconnue.");
  const minuteAt=y=>{let best=clocks[0];for(let i=0;i<clocks.length-1;i++){const a=clocks[i],b=clocks[i+1];if(y>=a.y&&y<=b.y)return Math.round((a.m+(y-a.y)*(b.m-a.m)/(b.y-a.y))/5)*5;if(Math.abs(y-a.y)<Math.abs(y-best.y))best=a}return best.m};
  const xBounds=headers.map((h,i)=>({day:h.i,left:i?(headers[i-1].x+h.x)/2:h.x-(headers[1].x-h.x)/2,right:i<headers.length-1?(h.x+headers[i+1].x)/2:h.x+(h.x-headers[i-1].x)/2,top:h.y}));
  const yLines=[...new Set(clocks.map(t=>Math.round(t.y*2)/2))].sort((a,b)=>a-b);
  const events=[];
  for(const col of xBounds){
    const ci=items.filter(v=>v.x+v.w/2>col.left&&v.x+v.w/2<col.right&&v.y>col.top+3);
    const ys=[...yLines];
    for(const v of ci) if(/^(Q1|Q2)$/i.test(v.text)) ys.push(v.y);
    ys.sort((a,b)=>a-b);
    const cuts=[...new Set(ys.map(y=>Math.round(y)))];
    for(let k=0;k<cuts.length-1;k++){
      const top=cuts[k],bot=cuts[k+1]; if(bot-top<12) continue;
      const block=ci.filter(v=>v.y>=top-2&&v.y<bot-2).sort((a,b)=>a.y-b.y||a.x-b.x);
      if(!block.length) continue;
      const txt=block.map(v=>v.text).join(" ").replace(/\s+/g," ").trim();
      if(txt.length<3||/ACCES SEL|SELF|Semestre/i.test(txt)) continue;
      const subject=block.find(v=>/^[A-ZÉÈÀÙÇ][A-ZÉÈÀÙÇ0-9 .&-]{3,}$/.test(v.text)&&!/^Q[12]$/.test(v.text));
      if(!subject) continue;
      const q=/\bQ1\b/i.test(txt)?"q1":/\bQ2\b/i.test(txt)?"q2":parityDefault;
      const teacher=block.find(v=>/^[A-ZÉÈÀÙÇ-]+ [A-Z]\.?$/.test(v.text))?.text||"";
      const room=block.map(v=>v.text).find(t=>/^(?:\d{2,3}[A-Z]*|T\d+|PHY-TP|\d+ NSI\\/SNT)$/i.test(t))||"";
      const st=minuteAt(top), en=minuteAt(bot);
      if(en>st&&st>=480&&en<=1200) events.push({title:subject.text.slice(0,120),teacher,room,day_of_week:col.day,start_time:clock(st),end_time:clock(en),parity:q});
    }
  }
  if(!events.length) throw new Error("Aucun cours exploitable n’a été trouvé dans le PDF.");
  return events;
}
function parseAgendaWords(words, width, height, parityDefault) {
  const usable=words.filter(w=>w.confidence>35 && w.text?.trim());
  const dayNames=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
  const headers=dayNames.map((d,i)=>{
    const w=usable.find(x=>x.text.toLowerCase().includes(d));
    return w ? {i,x:(w.bbox.x0+w.bbox.x1)/2,y:w.bbox.y1} : null;
  }).filter(Boolean);
  if(headers.length<5) throw new Error("Je n’ai pas reconnu les colonnes des jours. Essaie une capture plus nette.");
  headers.sort((a,b)=>a.x-b.x);
  const times=usable.map(w=>{const m=w.text.match(/^(\d{1,2})[:h](\d{2})$/i);return m?{m:Number(m[1])*60+Number(m[2]),y:(w.bbox.y0+w.bbox.y1)/2}:null}).filter(Boolean);
  if(times.length<4) throw new Error("Je n’ai pas reconnu assez d’horaires.");
  const yMin=Math.min(...times.map(t=>t.y)), yMax=Math.max(...times.map(t=>t.y));
  const mMin=Math.min(...times.map(t=>t.m)), mMax=Math.max(...times.map(t=>t.m));
  const minuteAt=y=>Math.round((mMin+(y-yMin)*(mMax-mMin)/(yMax-yMin))/5)*5;
  const bounds=headers.map((h,i)=>({i:h.i,left:i? (headers[i-1].x+h.x)/2:Math.max(0,h.x-(headers[1].x-h.x)/2),right:i<headers.length-1?(h.x+headers[i+1].x)/2:Math.min(width,h.x+(h.x-headers[i-1].x)/2),top:h.y}));
  const byDay=bounds.map(b=>usable.filter(w=>{const x=(w.bbox.x0+w.bbox.x1)/2;return x>b.left&&x<b.right&&w.bbox.y0>b.top+4&&!/^\d{1,2}[:h]\d{2}$/i.test(w.text);}));
  const events=[];
  byDay.forEach((ws,di)=>{
    ws.sort((x,y)=>x.bbox.y0-y.bbox.y0);
    const lines=[];
    for(const w of ws){let line=lines.find(l=>Math.abs(l.y-w.bbox.y0)<12);if(!line){line={y:w.bbox.y0,y1:w.bbox.y1,words:[]};lines.push(line)} line.words.push(w);line.y1=Math.max(line.y1,w.bbox.y1);}
    const clusters=[];
    for(const l of lines){let cl=clusters.at(-1);if(!cl||l.y-cl.y1>22){cl={y:l.y,y1:l.y1,lines:[]};clusters.push(cl)}cl.lines.push(l);cl.y1=l.y1;}
    for(const cl of clusters){
      const text=cl.lines.map(l=>l.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(" ")).join(" ").trim();
      if(text.length<3) continue;
      const low=text.toLowerCase(); if(/semaine|pause|repas|dejeuner|récré|recre/.test(low)) continue;
      const start=minuteAt(cl.y), end=Math.max(start+30,minuteAt(cl.y1));
      if(start<360||start>1200||end>1320) continue;
      const parity=/\bq\s*1\b/i.test(text)?"q1":/\bq\s*2\b/i.test(text)?"q2":parityDefault;
      const clean=text.replace(/\bQ\s*[12]\b/ig,"").trim();
      const room=(clean.match(/(?:salle|lab(?:o)?|gymnase)\s*[:.-]?\s*([\w-]+)/i)||[])[1]||"";
      events.push({title:clean.slice(0,120),teacher:"",room,day_of_week:bounds[di].i,start_time:clock(start),end_time:clock(end),parity});
    }
  });
  if(!events.length) throw new Error("Aucun cours n’a été détecté. Essaie une image plus nette.");
  return events;
}
async function analyzeAgenda(file, parity) {
  if(file.type==="application/pdf") return pdfAgenda(file, parity);
  const source=file;
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
  notify("Lecture de l’emploi du temps… cela peut prendre quelques secondes.");
  const result=await window.Tesseract.recognize(source,"fra");
  const words=result.data.words||[];
  const width=result.data.imageSize?.width||1000, height=result.data.imageSize?.height||1000;
  return parseAgendaWords(words,width,height,parity);
}
function eventForm(e = {}) {
  modal(
    `<h2>${e.id ? "Modifier le cours" : "Ajouter un cours"}</h2><form data-form="event" data-id="${e.id || ""}">${field("Matière", "title", "text", e.title, 'required maxlength="120"')}<div class="row">${field("Professeur", "teacher", "text", e.teacher, 'maxlength="120"')}${field("Salle", "room", "text", e.room, 'maxlength="80"')}</div><label>Jour<select name="day_of_week">${days.map((d, i) => `<option value="${i}" ${e.day_of_week === i ? "selected" : ""}>${d}</option>`).join("")}</select></label><div class="row">${field("Début", "start_time", "time", e.start_time || "08:00", "required")}${field("Fin", "end_time", "time", e.end_time || "10:00", "required")}</div><div class="row">${field("À partir du", "recurrence_start", "date", e.recurrence_start || parisToday(), "required")}${field("Jusqu’au (facultatif)", "recurrence_end", "date", e.recurrence_end)}</div><div class="actions"><button class="primary">Enregistrer</button>${button("Annuler", "close")}</div></form>`,
  );
}
async function load() {
  if (!session) return;
  const v = ++version;
  const tables = Object.keys(data);
  const results = await Promise.all(
    tables.map(async (t) => {
      const rows = [];
      for (let start = 0; start < 10000; start += 1000) {
        const batch = check(
          await db
            .from(t)
            .select("*")
            .order(
              t === "group_members"
                ? "group_id"
                : t === "cancellation_confirmations"
                  ? "cancellation_id"
                  : "id",
            )
            .range(start, start + 999),
        );
        rows.push(...batch);
        if (batch.length < 1000) return { data: rows };
      }
      throw new Error("Trop de données à charger.");
    }),
  );
  if (v !== version || !session) return;
  for (let i = 0; i < tables.length; i++) {
    const rows = check(results[i]);
    if (rows.length >= 10000)
      throw new Error(
        "Volume trop important : affine le chargement avant de continuer.",
      );
    data[tables[i]] = rows;
  }
  if (!data.groups.some((g) => g.id === groupId))
    groupId = data.groups[0]?.id || "";
  loading = false;
  if (!(page === "profile" && document.activeElement?.tagName === "INPUT"))
    render();
}
async function connect() {
  if (channel) await db.removeChannel(channel);
  if (!session) return;
  channel = db
    .channel("trouve-" + me())
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      clearTimeout(connect.timer);
      connect.timer = setTimeout(
        () => load().catch((e) => notify(e.message)),
        180,
      );
    })
    .subscribe((status) => {
      connectionStatus =
        status === "SUBSCRIBED" ? "● En direct" : "○ Reconnexion…";
      if ($("#connection")) $("#connection").textContent = connectionStatus;
      if (status === "SUBSCRIBED") load().catch((e) => notify(e.message));
    });
}
async function action(a, id, target) {
  switch (a) {
    case "nav":
      page = id;
      render();
      break;
    case "auth-mode":
      authMode = id;
      render();
      break;
    case "logout":
      check(await db.auth.signOut());
      break;
    case "close":
      $("#dialog").close();
      break;
    case "week":
      week = datePlus(week, Number(id));
      render();
      break;
    case "add-event":
      eventForm();
      break;
    case "import-agenda":
      modal(`
        <h2>Importer mon emploi du temps</h2>
        <p class="muted">Ajoute une capture/photo (PNG ou JPG) ou un PDF. L'import crée des cours récurrents : choisis Q1 ou Q2 pour les cours en alternance.</p>
        <form data-form="import-agenda">
          <label>Fichier<input name="agenda" type="file" accept="image/png,image/jpeg,application/pdf" required></label>
          <div class="row">
            ${field("Début de la période", "recurrence_start", "date", week, "required")}
            ${field("Fin de la période", "recurrence_end", "date", datePlus(week, 300), "required")}
          </div>
          <label>Alternance par défaut
            <select name="parity">
              <option value="all">Toutes les semaines</option>
              <option value="q1">Q1</option>
              <option value="q2">Q2</option>
            </select>
          </label>
          <p class="muted">Après sélection, Trouve essaie d'extraire le texte du fichier. Tu pourras vérifier les cours avant de les enregistrer.</p>
          <div class="actions"><button class="primary" type="submit">Analyser le fichier</button>${button("Annuler", "close")}</div>
        </form>`);
      break;
    case "event": {
      const e = data.events.find((e) => e.id === id),
        date = target.dataset.date,
        c = data.cancellations.find(
          (c) =>
            c.event_id === id &&
            c.group_id === groupId &&
            c.occurrence_date === date,
        );
      modal(
        `<h2>${esc(e.title)}</h2><p>${esc(e.teacher)} · ${esc(e.room)}</p><p>${date} · ${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)}</p><div class="actions">${e.user_id === me() ? button("Modifier", "edit-event", id) + button("Supprimer", "delete-event", id, "danger") : ""}${group() && !c && date >= parisToday() ? `<button data-action="report" data-id="${id}" data-date="${date}">Prof absent</button>` : ""}${button("Fermer", "close")}</div>${c ? `<p>${statusLabel(c.status)}</p>` : ""}`,
      );
      break;
    }
    case "edit-event":
      $("#dialog").close();
      eventForm(data.events.find((e) => e.id === id));
      break;
    case "delete-event":
      if (confirm("Supprimer ce cours et ses signalements ?")) {
        check(await db.from("events").delete().eq("id", id));
        $("#dialog").close();
        await load();
      }
      break;
    case "report":
      check(
        await db.rpc("report_absence", {
          group_id: groupId,
          event_id: id,
          occurrence_date: target.dataset.date,
        }),
      );
      $("#dialog").close();
      notify("Signalement ajouté. Une seconde confirmation est nécessaire.");
      await load();
      break;
    case "vote-yes":
    case "vote-no":
      check(
        await db.rpc("vote_absence", {
          cancellation_id: id,
          confirmation: a === "vote-yes",
        }),
      );
      await load();
      break;
    case "new-group":
    case "rename-group":
      modal(
        `<h2>${a === "new-group" ? "Créer" : "Renommer"} un groupe</h2><form data-form="${a}">${field("Nom du groupe", "name", "text", a === "rename-group" ? group().name : "", 'required maxlength="80"')}<div class="actions"><button class="primary">Enregistrer</button>${button("Annuler", "close")}</div></form>`,
      );
      break;
    case "delete-group":
      if (
        confirm(
          "Supprimer définitivement ce groupe, ses invitations et signalements ? Les agendas personnels sont conservés.",
        )
      ) {
        check(await db.from("groups").delete().eq("id", groupId));
        await load();
      }
      break;
    case "leave-group":
    case "remove-member":
      if (
        confirm(
          a === "leave-group"
            ? "Quitter ce groupe ?"
            : "Retirer ce membre du groupe ?",
        )
      ) {
        check(
          await db
            .from("group_members")
            .delete()
            .eq("group_id", groupId)
            .eq("user_id", a === "leave-group" ? me() : id),
        );
        await load();
      }
      break;
    case "invite": {
      const i = check(
        await db
          .from("invitations")
          .insert({ group_id: groupId })
          .select()
          .single(),
      );
      await load();
      await copyInvite(i.token);
      break;
    }
    case "copy-invite":
      await copyInvite(id);
      break;
    case "revoke-invite":
      check(
        await db.from("invitations").update({ revoked: true }).eq("id", id),
      );
      await load();
      break;
    case "enter-invite":
      modal(
        `<h2>Rejoindre un groupe</h2><form data-form="invite">${field("Lien ou code d’invitation", "token", "text", "", "required")}<div class="actions"><button class="primary">Rejoindre</button>${button("Annuler", "close")}</div></form>`,
      );
      break;
    case "accept":
      groupId = check(await db.rpc("accept_invitation", { token: invitation }));
      invitation = "";
      sessionStorage.removeItem("trouve-invite");
      page = "groups";
      await load();
      notify("Bienvenue dans le groupe !");
      break;
  }
}
async function copyInvite(token) {
  const link = new URL(location.pathname, location.origin);
  link.searchParams.set("invite", token);
  try {
    await navigator.clipboard.writeText(link.href);
    notify("Lien copié !");
  } catch {
    modal(
      `<h2>Lien d’invitation</h2><p class="invite">${esc(link.href)}</p>${button("Fermer", "close")}`,
    );
  }
}
async function submit(form) {
  const f = Object.fromEntries(new FormData(form));
  switch (form.dataset.form) {
    case "auth":
      if (recovery) {
        check(await db.auth.updateUser({ password: f.password }));
        recovery = false;
        notify("Mot de passe modifié.");
        await load();
      } else if (authMode === "signup") {
        const result = check(
          await db.auth.signUp({
            email: f.email,
            password: f.password,
            options: {
              data: { username: f.username.trim() },
              emailRedirectTo: location.origin + location.pathname,
            },
          }),
        );
        notify(
          result.session
            ? "Compte créé."
            : "Consulte tes e-mails pour confirmer ton compte.",
        );
      } else if (authMode === "reset") {
        check(
          await db.auth.resetPasswordForEmail(f.email, {
            redirectTo: location.origin + location.pathname,
          }),
        );
        notify("Si ce compte existe, un lien a été envoyé.");
      } else check(await db.auth.signInWithPassword(f));
      break;
    case "import-agenda": {
      const file = form.querySelector('input[name="agenda"]').files[0];
      if (!file) throw new Error("Choisis une image ou un PDF.");
      if (file.size > 12 * 1024 * 1024) throw new Error("Le fichier dépasse 12 Mo.");
      const start = f.recurrence_start, end = f.recurrence_end;
      if (end < start) throw new Error("La date de fin doit suivre la date de début.");
      const events = await analyzeAgenda(file, f.parity);
      importPreview(events, start, end);
      break;
    }
    case "confirm-import": {
      const count=Number(f.count), rows=[];
      for(let i=0;i<count;i++){
        if(f[`end_${i}`]<=f[`start_${i}`]) throw new Error("Un cours a une heure de fin invalide.");
        const parity=f[`parity_${i}`];
        rows.push({
          user_id:me(), title:f[`title_${i}`].trim(), teacher:(f[`teacher_${i}`]||"").trim(),
          room:(f[`room_${i}`]||"").trim(), day_of_week:Number(f[`day_${i}`]),
          start_time:f[`start_${i}`], end_time:f[`end_${i}`],
          recurrence_start: parity==="q2" ? datePlus(form.dataset.start,7) : form.dataset.start,
          recurrence_end:form.dataset.end, recurrence_interval_weeks:parity==="all"?1:2,
        });
      }
      check(await db.from("events").insert(rows));
      $("#dialog").close(); await load(); notify(`${rows.length} cours importé(s) dans ton agenda.`); break;
    }
    case "profile":
      check(
        await db
          .from("profiles")
          .update({ username: f.username.trim() })
          .eq("id", me()),
      );
      await load();
      notify("Profil enregistré.");
      break;
    case "event":
      if (f.end_time <= f.start_time)
        throw new Error("La fin doit être après le début.");
      if (f.recurrence_end && f.recurrence_end < f.recurrence_start)
        throw new Error("La date de fin doit suivre la date de début.");
      f.day_of_week = Number(f.day_of_week);
      f.recurrence_end = f.recurrence_end || null;
      f.title = f.title.trim();
      check(
        await (form.dataset.id
          ? db.from("events").update(f).eq("id", form.dataset.id)
          : db.from("events").insert({ ...f, user_id: me() })),
      );
      $("#dialog").close();
      await load();
      notify("Cours enregistré.");
      break;
    case "new-group": {
      const g = check(
        await db
          .from("groups")
          .insert({ name: f.name.trim(), owner_id: me() })
          .select()
          .single(),
      );
      groupId = g.id;
      $("#dialog").close();
      await load();
      break;
    }
    case "rename-group":
      check(
        await db
          .from("groups")
          .update({ name: f.name.trim() })
          .eq("id", groupId),
      );
      $("#dialog").close();
      await load();
      break;
    case "invite": {
      let token = f.token.trim();
      try {
        token = new URL(token).searchParams.get("invite") || token;
      } catch {}
      if (!/^[0-9a-f-]{36}$/i.test(token))
        throw new Error("Lien ou code invalide.");
      groupId = check(await db.rpc("accept_invitation", { token }));
      $("#dialog").close();
      await load();
      break;
    }
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  e.preventDefault();
  b.disabled = true;
  try {
    await action(b.dataset.action, b.dataset.id, b);
  } catch (e) {
    notify(e.message || "Une erreur est survenue.");
  } finally {
    b.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  if (!e.target.dataset.form) return;
  e.preventDefault();
  const b = e.target.querySelector('[type="submit"],button:not([data-action])');
  b.disabled = true;
  try {
    await submit(e.target);
  } catch (e) {
    notify(e.message || "Une erreur est survenue.");
  } finally {
    b.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "group-select") {
    groupId = e.target.value;
    render();
  }
});
window.addEventListener("focus", () => {
  if (session) load().catch((e) => notify(e.message));
});
// Refresh membership revocations even when RLS prevents delivery of a removed row.
setInterval(() => {
  if (session && document.visibilityState === "visible")
    load().catch((e) => notify(e.message));
}, 30000);
render();
if (db) {
  // Read the persisted session explicitly on startup. This avoids depending on
  // INITIAL_SESSION timing in static hosts such as GitHub Pages.
  db.auth
    .getSession()
    .then(({ data: { session: initialSession }, error }) => {
      if (error) throw error;
      session = initialSession;
      if (session) {
        loading = true;
        render();
        return load().then(connect);
      }
      render();
    })
    .catch((e) => {
      loading = false;
      render();
      notify(e.message || "Impossible d’initialiser la connexion.");
    });

  db.auth.onAuthStateChange((event, s) => {
    const changed = session?.user.id !== s?.user.id;
    session = s;
    if (event === "PASSWORD_RECOVERY") recovery = true;
    if (!s) {
      version++;
      loading = false;
      data = Object.fromEntries(Object.keys(data).map((k) => [k, []]));
      groupId = "";
      if (channel) {
        db.removeChannel(channel);
        channel = null;
      }
      $("#dialog").close();
      render();
    } else if (
      event !== "INITIAL_SESSION" &&
      (changed || event === "PASSWORD_RECOVERY")
    ) {
      loading = true;
      render();
      setTimeout(() => {
        load()
          .then(connect)
          .catch((e) => {
            loading = false;
            render();
            notify(e.message);
          });
      }, 0);
    }
  });
}
