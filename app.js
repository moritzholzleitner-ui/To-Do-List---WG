/* app.js — WG Plan (NFC-ready) + Firebase Live-Sync + Fairer Plan + Übersicht + UNDO (Retour)

✅ NFC: fragt bei JEDEM Öffnen "Wer bist du?" (User wird NICHT gespeichert)
✅ Firebase Realtime DB: gleicher Stand auf allen Geräten
✅ Übersicht: nächste 12 Wochen (korrekt über Jahreswechsel)
✅ Fairness: WC & Bad nie in derselben Woche bei gleicher Person, WC vs Küche/Saugen gesplittet
✅ Retoure-Button: holt die zuletzt weggeclickte Wochenaufgabe zurück (inkl. Sync)

WICHTIG in index.html VOR app.js einbinden:
<script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js"></script>

UNDO Button in HTML (empfohlen):
<button id="undoWeekly" class="undo-btn hidden" type="button">Retour</button>
(Wenn er fehlt, crasht nichts — es passiert einfach nichts.)
*/

const PEOPLE = ["Woody", "Markus"];
const LS = {
  general: "wg.generalState",
  startWeek: "wg.startWeek",
  dailyDone: "wg.dailyDoneTasks"
};

// NFC-Flow: User nur temporär (jede Session neu auswählen)
let CURRENT_USER = null;

const GENERAL = [
  { id: "trash", label: "Restmüll raustragen" },
  { id: "plastic", label: "Plastik wegtragen" },
  { id: "pfand", label: "Pfand wegbringen" },
  { id: "glas", label: "Altglas wegtragen" }
];

function pad2(n) { return String(n).padStart(2, "0"); }

function todayFullStr() {
  const d = new Date();
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// ISO week (KW)
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    year: d.getUTCFullYear(),
    week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  };
}

// Übersicht: +7 Tage (sicher über Jahreswechsel)
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function animateRemoval(element, callback) {
  element.classList.add("fade-out");
  setTimeout(callback, 300);
}

function togglePerson(p) {
  return p === "Woody" ? "Markus" : "Woody";
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

/* =========================
   FAIRER WOCHENPLAN
   - Papier jede Woche abwechselnd
   - Putzblock alle 2 Wochen:
       WC bei Person A, Küche+Saugen bei Person B
   - Bad alle 3 Wochen, NIE in derselben Woche wie WC bei gleicher Person
   - Sieb alle 4 Wochen
   ========================= */

function getWeekPlan(kw) {
  const start = 9; // Anker-KW
  const diff = kw - start;

  const plan = { Woody: [], Markus: [] };
  const add = (p, t) => plan[p].push(t);

  // Papier (jede Woche abwechselnd)
  const papierTurn = (mod(diff, 2) === 0) ? "Markus" : "Woody";
  add(papierTurn, "Papier raustragen (Di)");

  // Putzblock alle 2 Wochen: splitten
  if (mod(diff, 2) === 0) {
    const wcTurn = (mod(Math.floor(diff / 2), 2) === 0) ? "Markus" : "Woody";
    const other = togglePerson(wcTurn);

    add(wcTurn, "WC putzen");
    add(other, "Küche wischen");
    add(other, "Staubsaugen / wischen");
  }

  // Bad alle 3 Wochen (nicht mit WC bei gleicher Person)
  if (mod(diff, 3) === 0) {
    let badTurn = (mod(Math.floor(diff / 3), 2) === 0) ? "Markus" : "Woody";
    if (plan[badTurn].includes("WC putzen")) badTurn = togglePerson(badTurn);
    add(badTurn, "Bad putzen");
  }

  // Sieb alle 4 Wochen
  if (mod(diff, 4) === 0) {
    const siebTurn = (mod(Math.floor(diff / 4), 2) === 0) ? "Markus" : "Woody";
    add(siebTurn, "Spülmaschine Sieb");
  }

  // Optional: cap 3 tasks/person (shift Küche/Saugen wenn nötig)
  const cap = 3;
  for (const p of ["Woody", "Markus"]) {
    const o = togglePerson(p);
    if (plan[p].length > cap) {
      for (const task of ["Küche wischen", "Staubsaugen / wischen"]) {
        if (plan[p].length <= cap) break;
        const idx = plan[p].indexOf(task);
        if (idx !== -1 && plan[o].length < plan[p].length) {
          plan[p].splice(idx, 1);
          plan[o].push(task);
        }
      }
    }
  }

  return plan;
}

function getTasksForWeek(kw, person) {
  const plan = getWeekPlan(kw);
  const list = plan[person] || [];
  return list.length ? list : null;
}

/* =========================
   GENERAL STATE: robust defaults
   ========================= */

function getGeneralStateSafe() {
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem(LS.general)) || {};
  } catch {
    state = {};
  }

  GENERAL.forEach(g => {
    if (!state[g.id] || typeof state[g.id] !== "object") {
      state[g.id] = { next: "Woody", lastDone: "—" };
    } else {
      if (!("next" in state[g.id])) state[g.id].next = "Woody";
      if (!("lastDone" in state[g.id])) state[g.id].lastDone = "—";
    }
  });

  localStorage.setItem(LS.general, JSON.stringify(state));
  return state;
}

/* =========================
   FIREBASE LIVE SYNC
   ========================= */

const firebaseConfig = {
  apiKey: "AIzaSyCqVp2ARLN-SizfaM1WaQGlxeNh2T_gFF8",
  authDomain: "wg-to-do-list.firebaseapp.com",
  databaseURL: "https://wg-to-do-list-default-rtdb.firebaseio.com",
  projectId: "wg-to-do-list",
  storageBucket: "wg-to-do-list.firebasestorage.app",
  messagingSenderId: "315531496360",
  appId: "1:315531496360:web:9091f815c8c6fd2ef8ab9d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// gemeinsamer Raum
const ROOM_ID = "woody-markus";
const roomRef = db.ref("rooms/" + ROOM_ID);

// Schutz gegen Write-Loops
let applyingRemote = false;

function getLocalSyncState() {
  let general = {};
  let dailyDone = {};
  let startWeek = null;

  try { general = JSON.parse(localStorage.getItem(LS.general) || "{}"); } catch { general = {}; }
  try { dailyDone = JSON.parse(localStorage.getItem(LS.dailyDone) || "{}"); } catch { dailyDone = {}; }
  try { startWeek = JSON.parse(localStorage.getItem(LS.startWeek) || "null"); } catch { startWeek = null; }

  return { general, dailyDone, startWeek };
}

function applyRemoteState(data) {
  if (!data) return;
  applyingRemote = true;

  if (data.general) localStorage.setItem(LS.general, JSON.stringify(data.general));
  if (data.dailyDone) localStorage.setItem(LS.dailyDone, JSON.stringify(data.dailyDone));
  if (data.startWeek) localStorage.setItem(LS.startWeek, JSON.stringify(data.startWeek));

  applyingRemote = false;
  render();
}

function pushStateToFirebase() {
  if (applyingRemote) return;
  const payload = getLocalSyncState();
  payload.updatedAt = Date.now();
  return roomRef.update(payload);
}

// Live listener
roomRef.on("value", (snap) => {
  const data = snap.val();
  if (!data) {
    pushStateToFirebase(); // initial
    return;
  }
  applyRemoteState(data);
});

/* =========================
   UNDO Helpers
   ========================= */

function loadDailyDoneState() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(LS.dailyDone)) || { date: todayFullStr(), tasks: [] };
  } catch {
    s = { date: todayFullStr(), tasks: [] };
  }
  if (s.date !== todayFullStr()) s = { date: todayFullStr(), tasks: [] };
  if (!Array.isArray(s.tasks)) s.tasks = [];
  return s;
}

function saveDailyDoneState(s) {
  localStorage.setItem(LS.dailyDone, JSON.stringify(s));
}

/* =========================
   RENDER
   ========================= */

function render() {
  const me = CURRENT_USER;

  // Login / App View
  if (!PEOPLE.includes(me)) {
    document.getElementById("loginView")?.classList.remove("hidden");
    document.getElementById("appView")?.classList.add("hidden");
    return;
  }

  document.getElementById("loginView")?.classList.add("hidden");
  document.getElementById("appView")?.classList.remove("hidden");

  const w = isoWeek(new Date());

  // Header
  document.getElementById("userNameDisplay").textContent = me.toUpperCase();
  document.getElementById("kwNumber").textContent = pad2(w.week);
  document.getElementById("dateLine").textContent = `Heute: ${todayFullStr()}`;

  // Wochenaufgaben
  const list = getTasksForWeek(w.week, me);
  const ul = document.getElementById("weeklyTasks");
  ul.innerHTML = "";

  const dailyDoneState = loadDailyDoneState();

  // Undo button show/hide
  const undoBtn = document.getElementById("undoWeekly");
  if (undoBtn) {
    if (dailyDoneState.tasks.length > 0) undoBtn.classList.remove("hidden");
    else undoBtn.classList.add("hidden");
  }

  if (!list) {
    const li = document.createElement("li");
    li.textContent = "Diese Woche hast du frei";
    li.style.opacity = "0.5";
    li.style.listStyle = "none";
    ul.appendChild(li);
  } else {
    list.forEach(t => {
      if (dailyDoneState.tasks.includes(t)) return;

      const li = document.createElement("li");
      li.textContent = t;

      // Klick = erledigt (verschwindet)
      li.onclick = () => animateRemoval(li, () => {
        dailyDoneState.tasks.push(t);
        saveDailyDoneState(dailyDoneState);
        pushStateToFirebase(); // Sync
        render();
      });

      ul.appendChild(li);
    });
  }

  // Nach Bedarf (nur wenn DU dran bist)
  const state = getGeneralStateSafe();
  const wrap = document.getElementById("generalTasks");
  wrap.innerHTML = "";

  GENERAL.forEach(g => {
    if (state[g.id].next !== me) return;

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div class="task-info">
        <h3>${g.label}</h3>
        <p>Zuletzt: ${state[g.id].lastDone || "—"}</p>
      </div>
      <button class="btn-done" type="button">ERLEDIGT</button>
    `;

    item.querySelector("button").onclick = () => animateRemoval(item, () => {
      const d = new Date();
      state[g.id].lastDone = `${me} (${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.)`;
      state[g.id].next = togglePerson(me);
      localStorage.setItem(LS.general, JSON.stringify(state));
      pushStateToFirebase(); // Sync
      render();
    });

    wrap.appendChild(item);
  });

  // Übersicht Tabelle (12 Wochen)
  const rotationBody = document.getElementById("rotationBody");
  if (rotationBody) {
    rotationBody.innerHTML = "";

    const baseDate = new Date();
    for (let i = 0; i < 12; i++) {
      const d = addDays(baseDate, i * 7);
      const wi = isoWeek(d);
      const kw = wi.week;

      const row = document.createElement("tr");
      if (i === 0) row.className = "current-kw";

      const wTasks = getTasksForWeek(kw, "Woody");
      const mTasks = getTasksForWeek(kw, "Markus");

      row.innerHTML = `
        <td>${pad2(kw)}</td>
        <td>${wTasks ? wTasks.join("<br>") : "—"}</td>
        <td>${mTasks ? mTasks.join("<br>") : "—"}</td>
      `;
      rotationBody.appendChild(row);
    }
  }
}

/* =========================
   UI EVENTS
   ========================= */

// Übersicht Toggle: beim Öffnen rendern
document.getElementById("toggleOverview")?.addEventListener("click", function () {
  const content = document.getElementById("overviewContent");
  if (!content) return;

  const isHidden = content.classList.contains("hidden");
  if (isHidden) {
    content.classList.remove("hidden");
    this.textContent = "Übersicht ausblenden ↑";
    render();
  } else {
    content.classList.add("hidden");
    this.textContent = "Übersicht anzeigen ↓";
  }
});

// Login: User nur temporär setzen
document.getElementById("loginWoody")?.addEventListener("click", () => {
  CURRENT_USER = "Woody";
  render();
});

document.getElementById("loginMarkus")?.addEventListener("click", () => {
  CURRENT_USER = "Markus";
  render();
});

// Switch (Profil wechseln)
document.getElementById("switchBtn")?.addEventListener("click", () => {
  CURRENT_USER = null;
  render();
});

// UNDO (Retour) — letzte erledigte Wochenaufgabe zurückholen
document.getElementById("undoWeekly")?.addEventListener("click", () => {
  if (!PEOPLE.includes(CURRENT_USER)) return;

  const s = loadDailyDoneState();
  if (s.tasks.length === 0) return;

  s.tasks.pop(); // letzte erledigte Aufgabe wieder "sichtbar" machen
  saveDailyDoneState(s);
  pushStateToFirebase(); // Sync
  render();
});

// Start
render();
