const SAVED_REPORTS_KEY = "control-facturas-saved-reports";
const ACTIVE_LOCATION_KEY = "control-facturas-active-location";
const locations = {
  "rosario-centro": "Rosario Centro",
  "alto-rosario": "Alto Rosario",
};
const supabaseConfig = window.SUPABASE_CONFIG || {};

const state = {
  location: "",
  mp: createSourceState(),
  sys: createSourceState(),
  report: createEmptyReport(),
  activeReport: "differences",
  savedReports: [],
};

const reportTypes = {
  differences: {
    label: "Diferencias en Montos",
    empty: "No hay operaciones con importes diferentes.",
    fileName: "diferencias-en-montos",
  },
  missingMp: {
    label: "Odoo sin Mercado Pago",
    empty: "Todas las operaciones de Odoo aparecen en Mercado Pago.",
    fileName: "odoo-sin-mercado-pago",
  },
  emptyMemo: {
    label: "Ventas sin Memo",
    empty: "No hay ventas de Odoo con la columna Memo vacía.",
    fileName: "ventas-sin-memo",
  },
};

const reportColumns = [
  ["date", "Fecha", false],
  ["number", "Número", false],
  ["journal", "Diario", false],
  ["totalPayment", "Total Pago", true],
  ["mpOperationValue", "Valor de la operación en MP", true],
  ["memo", "Memo", false],
];

const selectors = {
  locationGate: document.querySelector("#locationGate"),
  appShell: document.querySelector("#appShell"),
  currentLocation: document.querySelector("#currentLocation"),
  changeLocationButton: document.querySelector("#changeLocationButton"),
  mpFile: document.querySelector("#mpFile"),
  sysFile: document.querySelector("#sysFile"),
  mpStatus: document.querySelector("#mpStatus"),
  sysStatus: document.querySelector("#sysStatus"),
  mpPanel: document.querySelector("#mpPanel"),
  sysPanel: document.querySelector("#sysPanel"),
  mpDropAction: document.querySelector("#mpDropAction"),
  sysDropAction: document.querySelector("#sysDropAction"),
  mpDropDetail: document.querySelector("#mpDropDetail"),
  sysDropDetail: document.querySelector("#sysDropDetail"),
  compareButton: document.querySelector("#compareButton"),
  exportButton: document.querySelector("#exportButton"),
  saveReportButton: document.querySelector("#saveReportButton"),
  resetButton: document.querySelector("#resetButton"),
  totalCount: document.querySelector("#totalCount"),
  diffCount: document.querySelector("#diffCount"),
  missingMpCount: document.querySelector("#missingMpCount"),
  emptyMemoCount: document.querySelector("#emptyMemoCount"),
  activeReportTitle: document.querySelector("#activeReportTitle"),
  reportTabs: document.querySelector("#reportTabs"),
  reportHead: document.querySelector("#reportHead"),
  reportBody: document.querySelector("#reportBody"),
  emptyState: document.querySelector("#emptyState"),
  savedReports: document.querySelector("#savedReports"),
  savedEmptyState: document.querySelector("#savedEmptyState"),
  savedTitle: document.querySelector("#savedTitle"),
  syncStatus: document.querySelector("#syncStatus"),
};

selectors.mpFile.addEventListener("change", (event) => handleFile(event, "mp"));
selectors.sysFile.addEventListener("change", (event) => handleFile(event, "sys"));
selectors.compareButton.addEventListener("click", compareFiles);
selectors.exportButton.addEventListener("click", exportActiveReport);
selectors.saveReportButton.addEventListener("click", saveActiveReport);
selectors.resetButton.addEventListener("click", resetApp);
selectors.reportTabs.addEventListener("click", handleReportTabClick);
selectors.savedReports.addEventListener("click", handleSavedReportAction);
selectors.locationGate.addEventListener("click", handleLocationChoice);
selectors.changeLocationButton.addEventListener("click", showLocationGate);

const sessionLocation = sessionStorage.getItem(ACTIVE_LOCATION_KEY);
if (locations[sessionLocation]) {
  selectLocation(sessionLocation);
} else {
  showLocationGate();
}

function createSourceState() {
  return {
    rows: [],
    headers: [],
    fileName: "",
  };
}

function createEmptyReport() {
  return {
    differences: [],
    missingMp: [],
    emptyMemo: [],
    matches: [],
    missingSystem: [],
  };
}

async function handleFile(event, sourceKey) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const parsed = await parseFile(file);
    state[sourceKey] = {
      rows: parsed.rows,
      headers: parsed.headers,
      fileName: file.name,
    };

    state.report = createEmptyReport();
    renderMetrics(0);
    renderTable();
    updateStatus(sourceKey, `Cargado: ${parsed.rows.length} filas`);
    updateCompareState();
  } catch (error) {
    state[sourceKey] = createSourceState();
    updateStatus(sourceKey, "Error");
    alert(`No se pudo leer ${file.name}: ${error.message}`);
  }
}

async function parseFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (["xls", "xlsx"].includes(extension)) {
    if (!window.XLSX) {
      throw new Error("lector XLSX no disponible");
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    return normalizeParsedRows(rows);
  }

  const text = await file.text();
  return normalizeParsedRows(parseDelimitedText(text));
}

function parseDelimitedText(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t", "|"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function normalizeParsedRows(rows) {
  if (!rows.length || !Array.isArray(rows[0])) {
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(Boolean);
    return {
      headers,
      rows: rows.filter((row) => Object.values(row).some(hasValue)),
    };
  }

  const nonEmptyRows = rows.filter((row) => row.some(hasValue));
  const [, ...dataRows] = nonEmptyRows;
  const columnCount = Math.max(0, ...nonEmptyRows.map((row) => row.length));
  const headers = Array.from({ length: columnCount }, (_, index) => getPhysicalColumnKey(index));

  return {
    headers,
    rows: dataRows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    ),
  };
}

function hasValue(value) {
  return String(value ?? "").trim() !== "";
}

function getPhysicalColumnKey(index) {
  return `__column_${indexToColumnLetter(index)}`;
}

function indexToColumnLetter(index) {
  let result = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function getPreferredColumns(sourceKey, headers) {
  const positions =
    sourceKey === "mp"
      ? { sale: "K", amount: "Q" }
      : { sale: "G", amount: "F" };

  return {
    sale: getHeaderByColumnLetter(headers, positions.sale),
    amount: getHeaderByColumnLetter(headers, positions.amount),
  };
}

function getHeaderByColumnLetter(headers, letter) {
  return headers[columnLetterToIndex(letter)] || "";
}

function getValueByColumnLetter(row, sourceKey, letter) {
  const header = getHeaderByColumnLetter(state[sourceKey].headers, letter);
  return header ? row[header] : "";
}

function columnLetterToIndex(letter) {
  return letter
    .toUpperCase()
    .split("")
    .reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function updateStatus(sourceKey, text) {
  const status = selectors[`${sourceKey}Status`];
  const panel = selectors[`${sourceKey}Panel`];
  const dropAction = selectors[`${sourceKey}DropAction`];
  const dropDetail = selectors[`${sourceKey}DropDetail`];
  const ready = state[sourceKey].rows.length > 0;

  status.textContent = text;
  status.classList.toggle("ready", ready);
  panel.classList.toggle("loaded", ready);
  dropAction.textContent = ready ? "Cambiar archivo" : "Seleccionar archivo";
  dropDetail.textContent = ready ? state[sourceKey].fileName : "CSV, TXT, XLS o XLSX";
}

function updateCompareState() {
  const mpColumns = getPreferredColumns("mp", state.mp.headers);
  const sysColumns = getPreferredColumns("sys", state.sys.headers);
  const ready =
    state.mp.rows.length > 0 &&
    state.sys.rows.length > 0 &&
    mpColumns.sale &&
    mpColumns.amount &&
    sysColumns.sale &&
    sysColumns.amount;

  selectors.compareButton.disabled = !ready;
}

function compareFiles() {
  const mpColumns = getPreferredColumns("mp", state.mp.headers);
  const sysColumns = getPreferredColumns("sys", state.sys.headers);
  const mpRecords = buildRecordMap(state.mp.rows, mpColumns.sale, mpColumns.amount, "mp");
  const sysRecords = buildRecordMap(state.sys.rows, sysColumns.sale, sysColumns.amount, "sys");
  const report = createEmptyReport();
  const allSaleNumbers = new Set([...mpRecords.keys(), ...sysRecords.keys()]);

  state.sys.rows.forEach((row) => {
    if (String(getValueByColumnLetter(row, "sys", "G") ?? "").trim() === "") {
      report.emptyMemo.push(createReportRow(null, createSystemRecord(row)));
    }
  });

  allSaleNumbers.forEach((saleNumber) => {
    const mpRecord = mpRecords.get(saleNumber);
    const sysRecord = sysRecords.get(saleNumber);

    if (!mpRecord) {
      report.missingMp.push(createReportRow(null, sysRecord));
      return;
    }

    if (!sysRecord) {
      report.missingSystem.push(createReportRow(mpRecord, null));
      return;
    }

    const row = createReportRow(mpRecord, sysRecord);
    if (roundMoney(mpRecord.amount - sysRecord.amount) === 0) {
      report.matches.push(row);
    } else {
      report.differences.push(row);
    }
  });

  state.report = report;
  state.activeReport = "differences";
  renderMetrics(allSaleNumbers.size);
  renderTable();
}

function buildRecordMap(rows, saleColumn, amountColumn, sourceKey) {
  const records = new Map();

  rows.forEach((row) => {
    const saleNumber = normalizeSaleNumber(row[saleColumn]);
    if (!saleNumber || records.has(saleNumber)) return;

    records.set(saleNumber, {
      amount: parseMoney(row[amountColumn]),
      sourceValues:
        sourceKey === "sys"
          ? createSystemRecord(row).sourceValues
          : {
              mpOperationValue: parseMoney(getValueByColumnLetter(row, "mp", "Q")),
            },
    });
  });

  return records;
}

function createSystemRecord(row) {
  return {
    amount: parseMoney(getValueByColumnLetter(row, "sys", "F")),
    sourceValues: {
      date: getValueByColumnLetter(row, "sys", "A"),
      number: getValueByColumnLetter(row, "sys", "B"),
      journal: getValueByColumnLetter(row, "sys", "C"),
      totalPayment: parseMoney(getValueByColumnLetter(row, "sys", "F")),
      memo: getValueByColumnLetter(row, "sys", "G"),
    },
  };
}

function normalizeSaleNumber(value) {
  const text = String(value ?? "").trim().replace(/^'/, "");
  const digitGroups = text.match(/\d+/g);
  if (!digitGroups) return "";
  return digitGroups.join("");
}

function parseMoney(value) {
  const raw = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const normalized =
    decimalSeparator === ","
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createReportRow(mpRecord, sysRecord) {
  return {
    date: sysRecord?.sourceValues.date ?? "",
    number: sysRecord?.sourceValues.number ?? "",
    journal: sysRecord?.sourceValues.journal ?? "",
    totalPayment: sysRecord?.sourceValues.totalPayment ?? null,
    mpOperationValue: mpRecord?.sourceValues.mpOperationValue ?? null,
    memo: sysRecord?.sourceValues.memo ?? "",
  };
}

function renderMetrics(total) {
  selectors.totalCount.textContent = total;
  selectors.diffCount.textContent = state.report.differences.length;
  selectors.missingMpCount.textContent = state.report.missingMp.length;
  selectors.emptyMemoCount.textContent = state.report.emptyMemo.length;
}

function getActiveRows() {
  return state.report[state.activeReport] || [];
}

function handleReportTabClick(event) {
  const button = event.target.closest("[data-report-type]");
  if (!button) return;
  state.activeReport = button.dataset.reportType;
  renderTable();
}

function renderTable() {
  const rows = getActiveRows();
  const reportType = reportTypes[state.activeReport];

  selectors.activeReportTitle.textContent = reportType.label;
  selectors.reportTabs.querySelectorAll("[data-report-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reportType === state.activeReport);
  });
  selectors.reportHead.innerHTML = `<tr>${reportColumns.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  selectors.reportBody.innerHTML = rows.map(createTableRow).join("");
  selectors.emptyState.textContent =
    state.mp.rows.length && state.sys.rows.length ? reportType.empty : "Cargá ambos archivos para comparar.";
  selectors.emptyState.hidden = rows.length > 0;
  selectors.exportButton.disabled = rows.length === 0;
  selectors.saveReportButton.disabled = rows.length === 0;
}

function createTableRow(row) {
  return `<tr>${reportColumns
    .map(([key, , isAmount]) => {
      const value = isAmount ? formatMoney(row[key]) : escapeHtml(row[key]);
      return `<td${isAmount ? ' class="amount"' : ""}>${value}</td>`;
    })
    .join("")}</tr>`;
}

function formatMoney(value) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function exportActiveReport() {
  exportRows(reportTypes[state.activeReport].fileName, getActiveRows());
}

function exportRows(name, rows) {
  if (!rows.length || !window.XLSX) return;

  const exportRows = rows.map((row) =>
    Object.fromEntries(reportColumns.map(([key, label]) => [label, row[key] ?? ""]))
  );
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
  XLSX.writeFile(workbook, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function saveActiveReport() {
  const rows = getActiveRows();
  if (!rows.length) return;

  state.savedReports.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: state.activeReport,
    label: reportTypes[state.activeReport].label,
    createdAt: new Date().toISOString(),
    sourceFiles: {
      mp: state.mp.fileName,
      sys: state.sys.fileName,
    },
    rows: rows.map((row) => ({ ...row })),
  });

  await persistSavedReports();
  renderSavedReports();
}

async function loadSavedReports() {
  if (!state.location) return [];

  if (isCloudConfigured()) {
    try {
      setSyncStatus("Sincronizando...", false);
      const localReports = loadLocalSavedReports();
      if (localReports.length) {
        await supabaseRequest("saved_reports?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify(localReports.map(toRemoteReport)),
        });
      }

      const remoteReports = await supabaseRequest(
        `saved_reports?location=eq.${encodeURIComponent(state.location)}&select=*&order=created_at.desc`
      );
      setSyncStatus("Sincronizado", true);
      const savedReports = remoteReports.map(fromRemoteReport);
      localStorage.setItem(getSavedReportsKey(), JSON.stringify(savedReports));
      return savedReports;
    } catch (error) {
      console.error(error);
      setSyncStatus("Sin conexión · guardado local", false);
    }
  } else {
    setSyncStatus("Guardado local", false);
  }

  return loadLocalSavedReports();
}

function loadLocalSavedReports() {
  try {
    const stationKey = getSavedReportsKey();
    const stationSaved = localStorage.getItem(stationKey);

    if (stationSaved === null) {
      const legacySaved = localStorage.getItem(SAVED_REPORTS_KEY);
      if (legacySaved) {
        localStorage.setItem(stationKey, legacySaved);
        localStorage.removeItem(SAVED_REPORTS_KEY);
      }
    }

    const saved = JSON.parse(localStorage.getItem(stationKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

async function persistSavedReports() {
  if (isCloudConfigured()) {
    try {
      setSyncStatus("Sincronizando...", false);
      const latestReport = state.savedReports[0];
      await supabaseRequest("saved_reports?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(toRemoteReport(latestReport)),
      });
      setSyncStatus("Sincronizado", true);
    } catch (error) {
      console.error(error);
      setSyncStatus("Sin conexión · guardado local", false);
    }
  }

  localStorage.setItem(getSavedReportsKey(), JSON.stringify(state.savedReports));
}

function getSavedReportsKey() {
  return `${SAVED_REPORTS_KEY}-${state.location}`;
}

function renderSavedReports() {
  selectors.savedReports.innerHTML = state.savedReports
    .map(
      (report) => `
        <article class="saved-report">
          <div>
            <strong>${escapeHtml(report.label)}</strong>
            <span>${formatSavedDate(report.createdAt)} · ${report.rows.length} filas</span>
            <small>MP: ${escapeHtml(report.sourceFiles?.mp || "-")} · Odoo: ${escapeHtml(report.sourceFiles?.sys || "-")}</small>
          </div>
          <div class="saved-report-actions">
            <button class="small-button ghost-button" type="button" data-action="export" data-report-id="${report.id}">Excel</button>
            <button class="small-button danger-button" type="button" data-action="delete" data-report-id="${report.id}">Borrar</button>
          </div>
        </article>
      `
    )
    .join("");
  selectors.savedEmptyState.hidden = state.savedReports.length > 0;
}

function formatSavedDate(value) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function handleSavedReportAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const report = state.savedReports.find((item) => item.id === button.dataset.reportId);
  if (!report) return;

  if (button.dataset.action === "export") {
    exportRows(reportTypes[report.type]?.fileName || "reporte-guardado", report.rows);
    return;
  }

  if (button.dataset.action === "delete" && confirm(`¿Borrar el reporte "${report.label}"?`)) {
    if (isCloudConfigured()) {
      try {
        setSyncStatus("Sincronizando...", false);
        await supabaseRequest(`saved_reports?id=eq.${encodeURIComponent(report.id)}`, {
          method: "DELETE",
        });
        setSyncStatus("Sincronizado", true);
      } catch (error) {
        console.error(error);
        setSyncStatus("No se pudo borrar en la nube", false);
        alert("No se pudo borrar el reporte en Supabase. Revisá la conexión.");
        return;
      }
    }

    state.savedReports = state.savedReports.filter((item) => item.id !== report.id);
    localStorage.setItem(getSavedReportsKey(), JSON.stringify(state.savedReports));
    renderSavedReports();
  }
}

function resetApp() {
  state.mp = createSourceState();
  state.sys = createSourceState();
  state.report = createEmptyReport();
  state.activeReport = "differences";
  selectors.mpFile.value = "";
  selectors.sysFile.value = "";
  updateStatus("mp", "Sin archivo");
  updateStatus("sys", "Sin archivo");
  updateCompareState();
  renderMetrics(0);
  renderTable();
}

function handleLocationChoice(event) {
  const button = event.target.closest("[data-location]");
  if (!button) return;
  selectLocation(button.dataset.location);
}

async function selectLocation(location) {
  if (!locations[location]) return;

  state.location = location;
  sessionStorage.setItem(ACTIVE_LOCATION_KEY, location);
  resetApp();
  state.savedReports = await loadSavedReports();
  selectors.currentLocation.textContent = locations[location];
  selectors.savedTitle.textContent = `Reportes guardados · ${locations[location]}`;
  renderSavedReports();
  selectors.locationGate.hidden = true;
  selectors.appShell.hidden = false;
}

function showLocationGate() {
  selectors.locationGate.hidden = false;
  selectors.appShell.hidden = true;
}

function isCloudConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
}

function setSyncStatus(text, ready) {
  selectors.syncStatus.textContent = text;
  selectors.syncStatus.classList.toggle("ready", ready);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseConfig.url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseConfig.publishableKey,
      Authorization: `Bearer ${supabaseConfig.publishableKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondió ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204 || options.method === "DELETE") return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function toRemoteReport(report) {
  return {
    id: report.id,
    location: state.location,
    type: report.type,
    label: report.label,
    created_at: report.createdAt,
    source_files: report.sourceFiles,
    rows: report.rows,
  };
}

function fromRemoteReport(report) {
  return {
    id: report.id,
    type: report.type,
    label: report.label,
    createdAt: report.created_at,
    sourceFiles: report.source_files,
    rows: report.rows,
  };
}
