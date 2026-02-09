/*************************************************
 * CONFIG
 *************************************************/
const CSV_URL =
  "PASTE_YOUR_GOOGLE_SHEET_CSV_LINK_HERE"; // published CSV link

const MANAGERS = ["Ana"]; // never auto-assign tasks

/*************************************************
 * CSV LOADER
 *************************************************/
async function loadCSV() {
  const res = await fetch(CSV_URL, { cache: "no-store" });
  return await res.text();
}

/*************************************************
 * ADVANCED CSV PARSER
 *************************************************/
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (c === '"' && inQuotes && n === '"') {
      cell += '"';
      i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," || c === ";") && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter(r => r.some(c => c));
}

/*************************************************
 * NORMALIZE DATA
 *************************************************/
function csvToObjects(rows) {
  const headers = rows.shift().map(h => h.toLowerCase());

  const idx = {
    date: headers.indexOf("date"),
    name: headers.indexOf("name"),
    area: headers.indexOf("area"),
    entry: headers.indexOf("entry"),
    exit: headers.indexOf("exit")
  };

  return rows.map(r => ({
    date: r[idx.date],
    name: r[idx.name],
    area: r[idx.area],
    entry: r[idx.entry],
    exit: r[idx.exit]
  }));
}

/*************************************************
 * HELPERS
 *************************************************/
function toMinutes(t) {
  if (!t || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isWorking(row) {
  return (
    row.entry &&
    row.exit &&
    !/off|folga/i.test(row.entry) &&
    !MANAGERS.includes(row.name)
  );
}

/*************************************************
 * ROLE IDENTIFICATION
 *************************************************/
function identifyRoles(staff) {
  const valid = staff.filter(s => toMinutes(s.entry) !== null);

  const byEntry = [...valid].sort(
    (a, b) => toMinutes(a.entry) - toMinutes(b.entry)
  );

  const byExit = [...valid].sort(
    (a, b) => toMinutes(a.exit) - toMinutes(b.exit)
  );

  return {
    opener: byEntry[0],
    firstExit: byExit[0],
    lastExit: byExit[byExit.length - 1]
  };
}

/*************************************************
 * BUSINESS RULES (CORRECTED)
 *************************************************/
function limpezaCasaDeBanho(sala) {
  const roles = identifyRoles(sala);

  // 🔴 CRITICAL FIX:
  // If only 2 SALA staff → OPENER cleans WC
  if (sala.length === 2) {
    return roles.opener?.name;
  }

  return roles.firstExit?.name;
}

/*************************************************
 * TASK GENERATORS
 *************************************************/
function generateSalaTasks(sala) {
  if (!sala.length) return {};

  const roles = identifyRoles(sala);

  return {
    "16:30 Fecho da sala de cima": roles.opener?.name,
    "16:30 Limpeza e reposição aparador / cadeira bebés":
      roles.opener?.name,
    "16:30 Repor papel (casa de banho)": roles.opener?.name,
    "17:30 Limpeza casa de banho (clientes e staff)":
      limpezaCasaDeBanho(sala),
    "17:30 Limpeza vidros e espelhos": roles.lastExit?.name,
    "17:30 Fecho da sala": roles.lastExit?.name
  };
}

function generateBarTasks(bar) {
  if (!bar.length) return {};

  const roles = identifyRoles(bar);

  return {
    "Preparação Bar": roles.opener?.name,
    "Reposições Bar":
      bar.length >= 3 ? roles.firstExit?.name : roles.opener?.name,
    "Limpeza máquinas / leites": roles.lastExit?.name,
    "Fecho Bar": roles.lastExit?.name
  };
}

/*************************************************
 * DATE HANDLING
 *************************************************/
function getAvailableDates(data) {
  return [...new Set(data.map(d => d.date))].sort();
}

/*************************************************
 * MAIN APP RUNNER
 *************************************************/
async function runApp(selectedDate) {
  const csv = await loadCSV();
  const rows = parseCSV(csv);
  const data = csvToObjects(rows);

  const working = data.filter(
    d => d.date === selectedDate && isWorking(d)
  );

  const sala = working.filter(d =>
    d.area.toLowerCase().includes("sala")
  );

  const bar = working.filter(d =>
    d.area.toLowerCase().includes("bar")
  );

  return {
    sala: generateSalaTasks(sala),
    bar: generateBarTasks(bar)
  };
}

/*************************************************
 * INIT (Dropdown + Refresh-safe)
 *************************************************/
async function initApp() {
  const csv = await loadCSV();
  const rows = parseCSV(csv);
  const data = csvToObjects(rows);

  const dates = getAvailableDates(data);
  const select = document.getElementById("dateSelect");

  select.innerHTML =
    `<option value="">Escolher data</option>` +
    dates.map(d => `<option value="${d}">${d}</option>`).join("");

  select.addEventListener("change", async () => {
    if (!select.value) return;
    const result = await runApp(select.value);
    renderResult(result);
  });
}

/*************************************************
 * RENDER (you already have this)
 *************************************************/
function renderResult(result) {
  console.log("SALA:", result.sala);
  console.log("BAR:", result.bar);
  // keep your existing UI rendering here
}

document.addEventListener("DOMContentLoaded", initApp);
