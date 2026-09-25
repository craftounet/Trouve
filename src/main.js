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
  return `<div class="toolbar card"><div class="toolbar">${personal ? "<strong>Mon agenda</strong>" : groupSelect()}<div>${button("←", "week", "-7")} <span>Semaine du ${esc(week.split("-").reverse().join("/"))}</span> ${button("→", "week", "7")}</div>${button("+ Ajouter un cours", "add-event", "", "primary")}</div></div>${
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
