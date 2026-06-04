const SAVED_REPORTS_KEY = "control-facturas-saved-reports";

const state = {
  mp: createSourceState(),
  sys: createSourceState(),
  report: createEmptyReport(),
  activeReport: "differences",
  savedReports: loadSavedReports(),
};

const reportTypes = {
  differences: {
    label: "Diferencias",
    empty: "No hay operaciones con importes diferentes.",
    fileName: "diferencias",
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
  mpFile: document.querySelector("#mpFile"),
  sysFile: document.querySelector("#sysFile"),
  mpStatus: document.querySelector("#mpStatus"),
  sysStatus: document.querySelector("#sysStatus"),
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
};

selectors.mpFile.addEventListener("change", (event) => handleFile(event, "mp"));
selectors.sysFile.addEventListener("change", (event) => handleFile(event, "sys"));
selectors.compareButton.addEventListener("click", compareFiles);
selectors.exportButton.addEventListener("click", exportActiveReport);
selectors.saveReportButton.addEventListener("click", saveActiveReport);
selectors.resetButton.addEventListener("click", resetApp);
selectors.reportTabs.addEventListener("click", handleReportTabClick);
selectors.savedReports.addEventListener("click", handleSavedReportAction);

renderTable();
renderSavedReports();

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
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
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

  const [headers = [], ...dataRows] = rows.filter((item) => item.some((value) => value.trim() !== ""));
  return dataRows.map((dataRow) => {
    const record = {};
    headers.forEach((header, index) => {
      record[String(header).trim()] = dataRow[index] ?? "";
    });
    return record;
  });
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t", "|"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function normalizeParsedRows(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(Boolean);
  return {
    headers,
    rows: rows.filter((row) => Object.values(row).some((value) => String(value).trim() !== "")),
  };
}

function getPreferredColumns(sourceKey, headers) {
  const positions =
    sourceKey === "mp"
      ? { sale: "K", amount: "Q" }
      : { sale: "G", amount: "E" };

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
  status.textContent = text;
  status.classList.toggle("ready", state[sourceKey].rows.length > 0);
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
    amount: parseMoney(getValueByColumnLetter(row, "sys", "E")),
    sourceValues: {
      date: getValueByColumnLetter(row, "sys", "A"),
      number: getValueByColumnLetter(row, "sys", "B"),
      journal: getValueByColumnLetter(row, "sys", "C"),
      totalPayment: parseMoney(getValueByColumnLetter(row, "sys", "E")),
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

function saveActiveReport() {
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

  persistSavedReports();
  renderSavedReports();
}

function loadSavedReports() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistSavedReports() {
  localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(state.savedReports));
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

function handleSavedReportAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const report = state.savedReports.find((item) => item.id === button.dataset.reportId);
  if (!report) return;

  if (button.dataset.action === "export") {
    exportRows(reportTypes[report.type]?.fileName || "reporte-guardado", report.rows);
    return;
  }

  if (button.dataset.action === "delete" && confirm(`¿Borrar el reporte "${report.label}"?`)) {
    state.savedReports = state.savedReports.filter((item) => item.id !== report.id);
    persistSavedReports();
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
