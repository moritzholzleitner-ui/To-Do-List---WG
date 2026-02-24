const PEOPLE = ["Woody", "Markus"];
const LS = { me: "wg.me", general: "wg.generalState", startWeek: "wg.startWeek", dailyDone: "wg.dailyDoneTasks" };

// Alle Aufgaben zusammengefasst
const ALL_FIXED = [
  "Papier raustragen (Dienstag)",
  "Bad putzen",
  "WC putzen",
  "Küche wischen",
  "Wohnung staubsaugen / wischen",
  "Geschirrspüler-Sieb reinigen"
];

const GENERAL = [
  { id: "trash", label: "Restmüll raustragen" },
  { id: "plastic", label: "Plastik wegtragen" },
  { id: "pfand", label: "Pfand wegbringen" }
];

function pad2(n) { return String(n).padStart(2, "0"); }
function todayFullStr() { const d = new Date(); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`; }

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) };
}

function animateRemoval(element, callback) { element.classList.add('fade-out'); setTimeout(callback, 300); }

/**
 * 4-Wochen-Rhythmus Logik (Start KW 6):
 * KW 9 (cycle 3): Markus (Big Clean + Papier) | Woody (Frei)
 * KW 10 (cycle 0): Woody (Papier) | Markus (Frei)
 * KW 11 (cycle 1): Woody (Big Clean + Papier) | Markus (Frei)
 * KW 12 (cycle 2): Markus (Papier) | Woody (Frei)
 */
function getPlanForWeek(targetKW, person) {
  const startKW = 6; 
  const diff = targetKW - startKW;
  const cycle = ((diff % 4) + 4) % 4;

  if (person === "Woody") {
    if (cycle === 1) return "Putzwoche";
    if (cycle === 3) return "Frei";
    if (cycle === 0) return "Papier";
    return "Frei";
  } else {
    if (cycle === 3) return "Putzwoche";
    if (cycle === 1) return "Frei";
    if (cycle === 2) return "Papier";
    return "Frei";
  }
}

function render() {
  const me = localStorage.getItem(LS.me);
  if (!PEOPLE.includes(me)) {
    document.getElementById("loginView").classList.remove("hidden");
    document.getElementById("appView").classList.add("hidden");
    return;
  }

  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");

  const w = isoWeek(new Date());
  document.getElementById("userNameDisplay").textContent = me.toUpperCase();
  document.getElementById("kwNumber").textContent = w.week;
  document.getElementById("dateLine").textContent = `Heute: ${todayFullStr()}`;

  // --- WOCHENAUFGABEN ---
  const currentPlan = getPlanForWeek(w.week, me);
  const ul = document.getElementById("weeklyTasks");
  ul.innerHTML = "";

  let dailyDoneState = JSON.parse(localStorage.getItem(LS.dailyDone)) || { date: todayFullStr(), tasks: [] };
  if (dailyDoneState.date !== todayFullStr()) dailyDoneState = { date: todayFullStr(), tasks: [] };

  if (currentPlan === "Frei") {
    const li = document.createElement("li");
    li.textContent = "Diese Woche hast du frei"; 
    li.style.opacity = "0.5"; li.style.listStyle = "none";
    ul.appendChild(li);
  } else {
    const tasksToShow = (currentPlan === "Putzwoche") ? ALL_FIXED : ["Papier raustragen (Dienstag)"];
    tasksToShow.forEach(t => {
      if (dailyDoneState.tasks.includes(t)) return;
      const li = document.createElement("li");
      li.textContent = t;
      li.onclick = () => { animateRemoval(li, () => { dailyDoneState.tasks.push(t); localStorage.setItem(LS.dailyDone, JSON.stringify(dailyDoneState)); render(); }); };
      ul.appendChild(li);
    });
  }

  // --- NACH BEDARF ---
  const state = JSON.parse(localStorage.getItem(LS.general)) || {
    trash: { next: "Woody", lastDone: "Markus (24.02.)" },
    plastic: { next: "Markus", lastDone: "Woody (24.02.)" },
    pfand: { next: "Markus", lastDone: "Woody (24.02.)" }
  };

  const wrap = document.getElementById("generalTasks");
  wrap.innerHTML = "";
  GENERAL.forEach(g => {
    if (state[g.id].next !== me) return;
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <h3>${g.label}</h3>
        <p>Zuletzt: ${state[g.id].lastDone || "—"}</p>
      </div>
      <button class="btn-done">ERLEDIGT</button>
    `;
    item.querySelector("button").onclick = () => {
      animateRemoval(item, () => {
        state[g.id].lastDone = `${me} (${pad2(new Date().getDate())}.${pad2(new Date().getMonth()+1)}.)`;
        state[g.id].next = me === "Woody" ? "Markus" : "Woody";
        localStorage.setItem(LS.general, JSON.stringify(state));
        render();
      });
    };
    wrap.appendChild(item);
  });

  // Übersicht Tabelle
  const rotationBody = document.getElementById("rotationBody");
  rotationBody.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const kw = w.week + i;
    const row = document.createElement("tr");
    if (i === 0) row.className = "current-kw";
    row.innerHTML = `<td>${kw}</td><td>${getPlanForWeek(kw, "Woody")}</td><td>${getPlanForWeek(kw, "Markus")}</td>`;
    rotationBody.appendChild(row);
  }
}

// UI Initialisierung
document.getElementById("toggleOverview").onclick = function() {
  const content = document.getElementById("overviewContent");
  content.classList.toggle("hidden");
  this.textContent = content.classList.contains("hidden") ? "Übersicht anzeigen ↓" : "Übersicht ausblenden ↑";
};

document.getElementById("loginWoody").onclick = () => { localStorage.setItem(LS.me, "Woody"); render(); };
document.getElementById("loginMarkus").onclick = () => { localStorage.setItem(LS.me, "Markus"); render(); };
document.getElementById("switchBtn").onclick = () => { localStorage.removeItem(LS.me); render(); };

render();