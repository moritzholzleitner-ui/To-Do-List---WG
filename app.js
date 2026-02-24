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

// ✅ für Übersicht: jede Woche = +7 Tage (funktioniert über Jahreswechsel)
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function animateRemoval(element, callback) {
  element.classList.add("fade-out");
  setTimeout(callback, 300);
}

/**
 * Logik für Rhythmus (Anker KW 9)
 * WC, Küche, Saugen: alle 2 Wochen
 * Bad: alle 3 Wochen
 * Sieb: alle 4 Wochen
 */
function getTasksForWeek(kw, person) {
  const tasks = [];
  const start = 9;
  const diff = kw - start;

  // 1. Papier (jede Woche abwechselnd)
  const papierTurn = (diff % 2 === 0) ? "Markus" : "Woody";
  if (person === papierTurn) tasks.push("Papier raustragen (Di)");

  // 2. WC, Küche, Saugen (alle 2 Wochen)
  if (diff % 2 === 0) {
    const cleanTurn = (Math.floor(diff / 2) % 2 === 0) ? "Markus" : "Woody";
    if (person === cleanTurn) tasks.push("WC putzen", "Küche wischen", "Staubsaugen / wischen");
  }

  // 3. Bad putzen (alle 3 Wochen)
  if (diff % 3 === 0) {
    const badTurn = (Math.floor(diff / 3) % 2 === 0) ? "Markus" : "Woody";
    if (person === badTurn) tasks.push("Bad putzen");
  }

  // 4. Sieb reinigen (alle 4 Wochen)
  if (diff % 4 === 0) {
    const siebTurn = (Math.floor(diff / 4) % 2 === 0) ? "Markus" : "Woody";
    if (person === siebTurn) tasks.push("Spülmaschine Sieb");
  }

  return tasks.length > 0 ? tasks : null;
}

// ✅ robust: state defaults sicherstellen
function getGeneralStateSafe() {
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem(LS.general)) || {};
  } catch {
    state = {};
  }

  // Defaults (falls Keys fehlen / alte Version im Storage)
  GENERAL.forEach(g => {
    if (!state[g.id] || typeof state[g.id] !== "object") {
      // sinnvolle Defaults: rotierend starten
      state[g.id] = { next: "Woody", lastDone: "—" };
    } else {
      if (!("next" in state[g.id])) state[g.id].next = "Woody";
      if (!("lastDone" in state[g.id])) state[g.id].lastDone = "—";
    }
  });

  localStorage.setItem(LS.general, JSON.stringify(state));
  return state;
}

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

  // WOCHENAUFGABEN RENDERN
  const list = getTasksForWeek(w.week, me);
  const ul = document.getElementById("weeklyTasks");
  ul.innerHTML = "";

  let dailyDoneState = JSON.parse(localStorage.getItem(LS.dailyDone)) || { date: todayFullStr(), tasks: [] };
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
        render();
      });
      ul.appendChild(li);
    });
  }

  // NACH BEDARF RENDERN (nur wenn DU dran bist)
  const state = getGeneralStateSafe();

  const wrap = document.getElementById("generalTasks");
  wrap.innerHTML = "";

  GENERAL.forEach(g => {
    // ✅ jetzt safe
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
      state[g.id].lastDone = `${me} (${pad2(new Date().getDate())}.${pad2(new Date().getMonth() + 1)}.)`;
      state[g.id].next = me === "Woody" ? "Markus" : "Woody";
      localStorage.setItem(LS.general, JSON.stringify(state));
      render();
    });

    wrap.appendChild(item);
  });

  // ÜBERSICHT TABELLE BEFÜLLEN (✅ Datum +7 Tage, robust)
  const rotationBody = document.getElementById("rotationBody");
  if (rotationBody) {
    rotationBody.innerHTML = "";

    const baseDate = new Date(); // heute
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

// ÜBERSICHT BUTTON (✅ beim Öffnen rendern)
document.getElementById("toggleOverview").onclick = function () {
  const content = document.getElementById("overviewContent");
  const isHidden = content.classList.contains("hidden");

  if (isHidden) {
    content.classList.remove("hidden");
    this.textContent = "Übersicht ausblenden ↑";
    render(); // ✅ füllt Tabelle garantiert
  } else {
    content.classList.add("hidden");
    this.textContent = "Übersicht anzeigen ↓";
  }
};

// Login / Switch
document.getElementById("loginWoody").onclick = () => { localStorage.setItem(LS.me, "Woody"); render(); };
document.getElementById("loginMarkus").onclick = () => { localStorage.setItem(LS.me, "Markus"); render(); };
document.getElementById("switchBtn").onclick = () => { localStorage.removeItem(LS.me); render(); };

// Start
render();