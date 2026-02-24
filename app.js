const PEOPLE = ["Woody", "Markus"];
const LS = { 
  me: "wg.me", 
  general: "wg.generalState", 
  startWeek: "wg.startWeek",
  dailyDone: "wg.dailyDoneTasks" 
};

const WEEK_A = ["Papier raustragen (Dienstag)", "Bad putzen", "Küche wischen"];
const WEEK_B = ["Papier raustragen (Dienstag)", "WC putzen", "Wohnung staubsaugen / wischen", "Geschirrspüler-Sieb reinigen"];

const GENERAL = [
  { id: "trash", label: "Restmüll raustragen" },
  { id: "plastic", label: "Plastik wegtragen" },
  { id: "pfand", label: "Pfand wegbringen" }
];

function pad2(n) { return String(n).padStart(2, "0"); }
function todayFullStr() {
    const d = new Date();
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) };
}

function animateRemoval(element, callback) {
    element.classList.add('fade-out');
    setTimeout(callback, 300);
}

function getWeeklyList(me) {
  const now = isoWeek(new Date());
  // Start-Anker KW 6 sorgt dafür, dass Markus diese Woche (KW 9) Woche B (WC) hat
  let start = { year: 2026, week: 6 }; 
  const diff = (now.year * 53 + now.week) - (start.year * 53 + start.week);
  const cycle = ((diff % 4) + 4) % 4;

  if (me === "Woody") {
    if (cycle === 0) return WEEK_A;
    if (cycle === 2) return WEEK_B;
    return null;
  } else {
    if (cycle === 1) return WEEK_A;
    if (cycle === 3) return WEEK_B;
    return null;
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
  const list = getWeeklyList(me);
  const ul = document.getElementById("weeklyTasks");
  ul.innerHTML = "";

  let dailyDoneState = JSON.parse(localStorage.getItem(LS.dailyDone)) || { date: todayFullStr(), tasks: [] };
  
  // INITIAL-FIX: Wenn heute Dienstag ist und Markus Papier geleert hat, füge es hinzu
  if (dailyDoneState.date === todayFullStr() && dailyDoneState.tasks.length === 0) {
      dailyDoneState.tasks.push("Papier raustragen (Dienstag)");
      localStorage.setItem(LS.dailyDone, JSON.stringify(dailyDoneState));
  }

  if (!list) {
    const li = document.createElement("li");
    li.textContent = "Freie Woche ✨";
    li.style.opacity = "0.5";
    li.style.listStyle = "none";
    ul.appendChild(li);
  } else {
    list.forEach(t => {
      if (dailyDoneState.tasks.includes(t)) return;
      const li = document.createElement("li");
      li.textContent = t;
      li.onclick = () => {
        animateRemoval(li, () => {
            dailyDoneState.tasks.push(t);
            localStorage.setItem(LS.dailyDone, JSON.stringify(dailyDoneState));
            render();
        });
      };
      ul.appendChild(li);
    });
  }

  // --- ALLGEMEINE AUFGABEN (STAND KORRIGIERT) ---
  const state = JSON.parse(localStorage.getItem(LS.general)) || {
    trash: { next: "Woody", lastDone: "Markus (24.02.)" },
    plastic: { next: "Markus", lastDone: "Woody (vor Ferien)" },
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

  if (wrap.children.length === 0) {
      wrap.innerHTML = '<p style="opacity: 0.5; text-align: center; margin-top: 20px;">Alles erledigt für dich!</p>';
  }
}

document.getElementById("loginWoody").onclick = () => { localStorage.setItem(LS.me, "Woody"); render(); };
document.getElementById("loginMarkus").onclick = () => { localStorage.setItem(LS.me, "Markus"); render(); };
document.getElementById("switchBtn").onclick = () => { localStorage.removeItem(LS.me); render(); };

render();