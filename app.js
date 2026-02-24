/* app.js — WG Plan (Woody/Markus) + Übersicht (fix) + Fairer Plan + Firebase Live-Sync (Realtime DB)
   WICHTIG:
   - In index.html VOR app.js einbinden:
     <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js"></script>
*/

const PEOPLE = ["Woody", "Markus"];
const LS = {
  me: "wg.me",
  general: "wg.generalState",
  startWeek: "wg.startWeek",
  dailyDone: "wg.dailyDoneTasks"
};

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

// Übersicht: +7 Tage (funktioniert über Jahreswechsel)
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
  return ((n % m) + m) % m; // sauber bei negativen Zahlen
}

/* =========================
   FAIRER WOCHENPLAN
   Ziele:
   - Papier jede Woche abwechselnd
   - "Putzblock" alle 2 Wochen aktiv
     -> WC bei Person A, Küche+Saugen bei Person B (split)
   - Bad alle 3 Wochen, aber NIE in derselben Woche wie WC bei derselben Person
   - Sieb alle 4 Wochen
   ========================= */

function getWeekPlan(kw) {
  const start = 9;       // Anker-KW (dein bisheriges System)
  const diff = kw - start;

  const plan = { Woody: [], Markus: [] };
  const add = (p, t) => plan[p].push(t);

  // 1) Papier (jede Woche abwechselnd)
  const papierTurn = (mod(diff, 2) === 0) ? "Markus" : "Woody";
  add(papierTurn, "Papier raustragen (Di)");

  // 2) Putzblock alle 2 Wochen: WC / Küche / Saugen splitten
  if (mod(diff, 2) === 0) {
    const wcTurn = (mod(Math.floor(diff / 2), 2) === 0) ? "Markus" : "Woody";
    const other = togglePerson(wcTurn);

    add(wcTurn, "WC putzen");
    add(other, "Küche wischen");
    add(other, "Staubsaugen / wischen");
  }

  // 3) Bad alle 3 Wochen, aber nicht zusammen mit WC bei gleicher Person
  if (mod(diff, 3) === 0) {
    let badTurn = (mod(Math.floor(diff / 3), 2) === 0) ? "Markus" : "Woody";

    if (plan[badTurn].includes("WC putzen")) {
      badTurn = togglePerson(badTurn);
    }
    add(badTurn, "Bad putzen");
  }

  // 4) Sieb alle 4 Wochen
  if (mod(diff, 4) === 0) {
    const siebTurn = (mod(Math.floor(diff / 4), 2) === 0) ? "Markus" : "Woody";
    add(siebTurn, "Spülmaschine Sieb");
  }

  // Optional: harte Kappung (max 3 Tasks/Person) -> shift Küche/Saugen wenn nötig
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
   GENERAL STATE: robust
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

// Ein gemeinsamer "Raum" für euch — kann so bleiben
const ROOM_ID = "woody-markus";
const roomRef = db.ref("rooms/" + ROOM_ID);

// Schutz gegen Loop/Overwrites
let hasRemoteOnce = false;
let applyingRemote = false;

function getLocalSyncState() {
  return {
    general: JSON.parse(localStorage.getItem(LS.general) || "{}"),
    dailyDone: JSON.parse(localStorage.getItem(LS.dailyDone) || "{}"),
    startWeek: JSON.parse(localStorage.getItem(LS.startWeek) || "null")
  };
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
  if (applyingRemote) return; // keine Writes während Remote-Apply
  const payload = getLocalSyncState();
  payload.updatedAt = Date.now();
  return roomRef.update(payload);
}

// Live listener: Remote -> Local
roomRef.on("value", (snap) => {
  const data = snap.val();
  hasRemoteOnce = true;

  // Wenn Room leer ist: initial einmal lokalen Zustand hochschieben
  if (!data) {
    pushStateToFirebase();
    return;
  }
  applyRemoteState(data);
});

/* =========================
   RENDER
   ========================= */

function render() {
  const me = localStorage.getItem(LS.me);

  // Login / App View
  if (!PEOPLE.includes(me)) {
    document.getElementById("loginView").classList.remove("hidden");
    document.getElementById("appView").classList.add("hidden");
    return;
  }
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");

  const w = isoWeek(new Date());

  // Header
  document.getElementById("userNameDisplay").textContent = me.toUpperCase();
  document.getElementById("kwNumber").textContent = pad2(w.week);
  document.getElementById("dateLine").textContent = `Heute: ${todayFullStr()}`;

  // Wochenaufgaben
  const list = getTasksForWeek(w.week, me);
  const ul = document.getElementById("weeklyTasks");
  ul.innerHTML = "";

  let dailyDoneState = {};
  try {
    dailyDoneState = JSON.parse(localStorage.getItem(LS.dailyDone)) || { date: todayFullStr(), tasks: [] };
  } catch {
    dailyDoneState = { date: todayFullStr(), tasks: [] };
  }
  if (dailyDoneState.date !== todayFullStr()) dailyDoneState = { date: todayFullStr(), tasks: [] };

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

      li.onclick = () => animateRemoval(li, () => {
        dailyDoneState.tasks.push(t);
        localStorage.setItem(LS.dailyDone, JSON.stringify(dailyDoneState));
        pushStateToFirebase(); // ✅ Sync
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
      <button class="btn-done">ERLEDIGT</button>
    `;

    item.querySelector("button").onclick = () => animateRemoval(item, () => {
      const d = new Date();
      state[g.id].lastDone = `${me} (${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.)`;
      state[g.id].next = togglePerson(me);
      localStorage.setItem(LS.general, JSON.stringify(state));
      pushStateToFirebase(); // ✅ Sync
      render();
    });

    wrap.appendChild(item);
  });

  // Übersicht Tabelle (12 Wochen, sicher über Jahreswechsel)
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
document.getElementById("toggleOverview").onclick = function () {
  const content = document.getElementById("overviewContent");
  const isHidden = content.classList.contains("hidden");

  if (isHidden) {
    content.classList.remove("hidden");
    this.textContent = "Übersicht ausblenden ↑";
    render();
  } else {
    content.classList.add("hidden");
    this.textContent = "Übersicht anzeigen ↓";
  }
};

// Login / Switch
document.getElementById("loginWoody").onclick = () => {
  localStorage.setItem(LS.me, "Woody");
  render();
};
document.getElementById("loginMarkus").onclick = () => {
  localStorage.setItem(LS.me, "Markus");
  render();
};
document.getElementById("switchBtn").onclick = () => {
  localStorage.removeItem(LS.me);
  render();
};

// Start
render();