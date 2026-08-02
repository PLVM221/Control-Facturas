const SAVED_REPORTS_KEY = "control-facturas-saved-reports";
const PENDING_DELETIONS_KEY = "control-facturas-pending-deletions";
const ACTIVE_LOCATION_KEY = "control-facturas-active-location";
const locations = {
  "rosario-centro": "Rosario Centro",
  "alto-rosario": "Solar",
};
const locationPasswordHashes = {
  "rosario-centro": "dcc42bf11c51b8ba886040b0eadb31fda6aa6439fe1f219bd085df043ed9b4dc",
  "alto-rosario": "5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5",
};
const supabaseConfig = window.SUPABASE_CONFIG || {};

const state = {
  location: "",
  pendingLocation: "",
  controlMonth: getCurrentMonthValue(),
  mp: createSourceState(),
  sys: createSourceState(),
  transfer: createSourceState(),
  report: createEmptyReport(),
  activeReport: "differences",
  savedReports: [],
};
let savedReportsSyncInProgress = false;

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
  missingSystem: {
    label: "Mercado Pago sin Odoo",
    empty: "Todas las operaciones de Mercado Pago aparecen en Odoo.",
    fileName: "mercado-pago-sin-odoo",
  },
  emptyMemo: {
    label: "Ventas sin MP",
    empty: "No hay ventas de Odoo con la columna Memo vacía.",
    fileName: "ventas-sin-memo",
  },
  transferDifferences: {
    label: "Diferencias Transferencias MP",
    empty: "No hay transferencias con importes diferentes a Odoo.",
    fileName: "diferencias-transferencias-mp",
  },
  transferMissingSystem: {
    label: "Transferencias MP sin Odoo",
    empty: "Todas las transferencias de Rosario Centro aparecen en Odoo.",
    fileName: "transferencias-mp-sin-odoo",
  },
  transactionSearch: {
    label: "Búsqueda de transacción",
    empty: "No se encontró la transacción en los archivos cargados.",
    fileName: "busqueda-de-transaccion",
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

const transferReportColumns = [
  ["transferDate", "Fecha", false],
  ["transferNumber", "Número", false],
  ["transferLocation", "Sucursal", false],
  ["transferAmount", "Importe", true],
  ["transferType", "Tipo de operación", false],
];

const transactionSearchColumns = [
  ["source", "Origen", false],
  ["date", "Fecha", false],
  ["number", "Número", false],
  ["detail", "Diario / Sucursal", false],
  ["amount", "Importe", true],
  ["memo", "Memo / Tipo de operación", false],
];

const selectors = {
  locationGate: document.querySelector("#locationGate"),
  appShell: document.querySelector("#appShell"),
  currentLocation: document.querySelector("#currentLocation"),
  changeLocationButton: document.querySelector("#changeLocationButton"),
  locationOptions: document.querySelector(".location-options"),
  locationLogin: document.querySelector("#locationLogin"),
  locationLoginTitle: document.querySelector("#locationLoginTitle"),
  locationPassword: document.querySelector("#locationPassword"),
  locationLoginError: document.querySelector("#locationLoginError"),
  cancelLocationLogin: document.querySelector("#cancelLocationLogin"),
  mpFile: document.querySelector("#mpFile"),
  sysFile: document.querySelector("#sysFile"),
  transferFile: document.querySelector("#transferFile"),
  mpStatus: document.querySelector("#mpStatus"),
  sysStatus: document.querySelector("#sysStatus"),
  transferStatus: document.querySelector("#transferStatus"),
  mpPanel: document.querySelector("#mpPanel"),
  sysPanel: document.querySelector("#sysPanel"),
  transferPanel: document.querySelector("#transferPanel"),
  mpDropAction: document.querySelector("#mpDropAction"),
  sysDropAction: document.querySelector("#sysDropAction"),
  transferDropAction: document.querySelector("#transferDropAction"),
  mpDropDetail: document.querySelector("#mpDropDetail"),
  sysDropDetail: document.querySelector("#sysDropDetail"),
  transferDropDetail: document.querySelector("#transferDropDetail"),
  controlMonth: document.querySelector("#controlMonth"),
  transactionSearch: document.querySelector("#transactionSearch"),
  transactionQuery: document.querySelector("#transactionQuery"),
  searchTransactionButton: document.querySelector("#searchTransactionButton"),
  compareButton: document.querySelector("#compareButton"),
  exportButton: document.querySelector("#exportButton"),
  saveReportButton: document.querySelector("#saveReportButton"),
  resetButton: document.querySelector("#resetButton"),
  totalCount: document.querySelector("#totalCount"),
  diffCount: document.querySelector("#diffCount"),
  missingMpCount: document.querySelector("#missingMpCount"),
  missingSystemCount: document.querySelector("#missingSystemCount"),
  emptyMemoCount: document.querySelector("#emptyMemoCount"),
  transferDiffCount: document.querySelector("#transferDiffCount"),
  transferMissingCount: document.querySelector("#transferMissingCount"),
  reconciliationSummary: document.querySelector("#reconciliationSummary"),
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
selectors.transferFile.addEventListener("change", (event) => handleFile(event, "transfer"));
selectors.controlMonth.addEventListener("change", handleControlMonthChange);
selectors.transactionSearch.addEventListener("submit", searchTransaction);
selectors.compareButton.addEventListener("click", compareFiles);
selectors.exportButton.addEventListener("click", exportActiveReport);
selectors.saveReportButton.addEventListener("click", saveActiveReport);
selectors.resetButton.addEventListener("click", resetApp);
selectors.reportTabs.addEventListener("click", handleReportTabClick);
selectors.savedReports.addEventListener("click", handleSavedReportAction);
selectors.locationGate.addEventListener("click", handleLocationChoice);
selectors.changeLocationButton.addEventListener("click", showLocationGate);
selectors.locationLogin.addEventListener("submit", handleLocationLogin);
selectors.cancelLocationLogin.addEventListener("click", resetLocationLogin);
window.addEventListener("online", retrySavedReportsSync);
window.setInterval(() => {
  if (!selectors.syncStatus.classList.contains("ready")) retrySavedReportsSync();
}, 30000);

selectors.controlMonth.value = state.controlMonth;

const sessionLocation = sessionStorage.getItem(ACTIVE_LOCATION_KEY);
if (locations[sessionLocation]) {
  selectLocation(sessionLocation);
} else {
  showLocationGate();
}

function createSourceState() {
  return {
    allRows: [],
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
    transferDifferences: [],
    transferMissingSystem: [],
    transactionSearch: [],
  };
}

async function handleFile(event, sourceKey) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const parsed = await parseFile(file);
    validateSourceColumns(sourceKey, parsed.headers);
    const rows = filterSourceRows(sourceKey, parsed.rows, parsed.headers);
    state[sourceKey] = {
      allRows: parsed.rows,
      rows,
      headers: parsed.headers,
      fileName: file.name,
    };

    state.report = createEmptyReport();
    renderMetrics(0);
    renderTable();
    updateStatus(sourceKey, getLoadedStatus(sourceKey));
    updateCompareState();
  } catch (error) {
    state[sourceKey] = createSourceState();
    updateStatus(sourceKey, "Error");
    alert(`No se pudo leer ${file.name}: ${error.message}`);
  }
}

function validateSourceColumns(sourceKey, headers) {
  const requiredColumns = {
    mp: ["B", "N"],
    sys: ["A"],
    transfer: ["B", "G", "H", "K", "AA"],
  }[sourceKey];
  const missingColumn = requiredColumns.find(
    (letter) => !getHeaderByColumnLetter(headers, letter)
  );
  if (missingColumn) {
    const sourceName =
      sourceKey === "mp" ? "Mercado Pago" : sourceKey === "sys" ? "Odoo" : "Transferencias MP";
    throw new Error(`el archivo de ${sourceName} no tiene columna ${missingColumn}`);
  }
}

function filterSourceRows(sourceKey, rows, headers) {
  const dateLetters = { mp: "B", sys: "A", transfer: "K" };
  const dateColumn = getHeaderByColumnLetter(headers, dateLetters[sourceKey]);
  const expectedLocation = normalizeLocationName(locations[state.location]);
  const locationColumn =
    sourceKey === "mp" ? getHeaderByColumnLetter(headers, "N") : "";

  return rows.filter(
    (row) =>
      isDateInControlMonth(row[dateColumn]) &&
      (sourceKey !== "mp" || normalizeLocationName(row[locationColumn]) === expectedLocation)
  );
}

function getLoadedStatus(sourceKey) {
  const monthLabel = formatControlMonth(state.controlMonth);
  const locationLabel = sourceKey === "mp" ? ` de ${locations[state.location]}` : "";
  return `Cargado: ${state[sourceKey].rows.length} filas${locationLabel} · ${monthLabel}`;
}

function handleControlMonthChange() {
  if (!selectors.controlMonth.value) return;
  state.controlMonth = selectors.controlMonth.value;

  ["mp", "sys", "transfer"].forEach((sourceKey) => {
    const source = state[sourceKey];
    if (!source.fileName) return;
    source.rows = filterSourceRows(sourceKey, source.allRows, source.headers);
    updateStatus(sourceKey, getLoadedStatus(sourceKey));
  });

  state.report = createEmptyReport();
  state.activeReport = "differences";
  renderMetrics(0);
  renderTable();
  updateCompareState();
}

function normalizeLocationName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("es-AR");
}

function getCurrentMonthValue(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatControlMonth(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

function isDateInControlMonth(value, controlMonth = state.controlMonth) {
  const date = parseTransactionDate(value);
  const [year, month] = controlMonth.split("-").map(Number);
  return Boolean(
    date &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1
  );
}

function parseTransactionDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const dayFirstMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dayFirstMatch) {
    return createValidDate(dayFirstMatch[3], dayFirstMatch[2], dayFirstMatch[1]);
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return createValidDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createValidDate(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? date
    : null;
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
  const ready = Boolean(state[sourceKey].fileName);

  status.textContent = text;
  status.classList.toggle("ready", ready);
  panel.classList.toggle("loaded", ready);
  dropAction.textContent = ready ? "Cambiar archivo" : "Seleccionar archivo";
  dropDetail.textContent = ready ? state[sourceKey].fileName : "CSV, TXT, XLS o XLSX";
}

function updateCompareState() {
  const mpColumns = getPreferredColumns("mp", state.mp.headers);
  const sysColumns = getPreferredColumns("sys", state.sys.headers);
  const transferReady = ["B", "G", "H", "K", "AA"].every((letter) =>
    getHeaderByColumnLetter(state.transfer.headers, letter)
  );
  const ready =
    state.mp.rows.length > 0 &&
    state.sys.rows.length > 0 &&
    state.transfer.fileName &&
    mpColumns.sale &&
    mpColumns.amount &&
    sysColumns.sale &&
    sysColumns.amount &&
    transferReady;

  selectors.compareButton.disabled = !ready;
  selectors.searchTransactionButton.disabled = !(
    state.mp.fileName || state.sys.fileName || state.transfer.fileName
  );
}

function searchTransaction(event) {
  event.preventDefault();
  const query = normalizeSaleNumber(selectors.transactionQuery.value);
  if (!query) {
    selectors.transactionQuery.focus();
    return;
  }

  const results = [];
  state.mp.rows.forEach((row) => {
    if (normalizeSaleNumber(getValueByColumnLetter(row, "mp", "K")) !== query) return;
    results.push({
      source: "Mercado Pago",
      date: getValueByColumnLetter(row, "mp", "B"),
      number: getValueByColumnLetter(row, "mp", "K"),
      detail: "",
      amount: parseMoney(getValueByColumnLetter(row, "mp", "Q")),
      memo: "",
    });
  });

  state.sys.rows.forEach((row) => {
    const memo = getValueByColumnLetter(row, "sys", "G");
    const number = getValueByColumnLetter(row, "sys", "B");
    if (normalizeSaleNumber(memo) !== query && normalizeSaleNumber(number) !== query) return;
    results.push({
      source: "Odoo",
      date: getValueByColumnLetter(row, "sys", "A"),
      number,
      detail: getValueByColumnLetter(row, "sys", "C"),
      amount: parseMoney(getValueByColumnLetter(row, "sys", "F")),
      memo,
    });
  });

  state.transfer.rows.forEach((row) => {
    if (normalizeSaleNumber(getValueByColumnLetter(row, "transfer", "B")) !== query) return;
    results.push({
      source: "Transferencias MP",
      date: getValueByColumnLetter(row, "transfer", "K"),
      number: getValueByColumnLetter(row, "transfer", "B"),
      detail: getValueByColumnLetter(row, "transfer", "AA"),
      amount: parseMoney(getValueByColumnLetter(row, "transfer", "H")),
      memo: getValueByColumnLetter(row, "transfer", "G"),
    });
  });

  state.report.transactionSearch = results;
  state.activeReport = "transactionSearch";
  renderTable();
}

function compareFiles() {
  const mpColumns = getPreferredColumns("mp", state.mp.headers);
  const sysColumns = getPreferredColumns("sys", state.sys.headers);
  const mpIndex = buildRecordMap(state.mp.rows, mpColumns.sale, mpColumns.amount, "mp");
  const sysIndex = buildRecordMap(state.sys.rows, sysColumns.sale, sysColumns.amount, "sys");
  const mpRecords = mpIndex.records;
  const sysRecords = sysIndex.records;
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

  compareTransferFiles(report);

  state.report = report;
  state.activeReport = "differences";
  renderMetrics({
    matches: report.matches.length + report.differences.length,
    mpIndex,
    sysIndex,
  });
  renderTable();
}

function compareTransferFiles(report) {
  const odooRecords = buildRecordMap(
    state.sys.rows,
    getHeaderByColumnLetter(state.sys.headers, "G"),
    getHeaderByColumnLetter(state.sys.headers, "F"),
    "sys"
  ).records;
  const seenTransferNumbers = new Set();

  state.transfer.rows.forEach((row) => {
    const transferNumber = normalizeSaleNumber(getValueByColumnLetter(row, "transfer", "B"));
    if (!transferNumber || seenTransferNumbers.has(transferNumber)) return;
    seenTransferNumbers.add(transferNumber);

    const transferRecord = createTransferRecord(row);
    const odooRecord = odooRecords.get(transferNumber);
    if (!odooRecord) {
      if (normalizeLocationName(transferRecord.transferLocation) === "rosario centro") {
        report.transferMissingSystem.push(transferRecord);
      }
      return;
    }

    if (roundMoney(transferRecord.transferAmount - odooRecord.amount) !== 0) {
      report.transferDifferences.push(transferRecord);
    }
  });
}

function createTransferRecord(row) {
  return {
    transferDate: getValueByColumnLetter(row, "transfer", "K"),
    transferNumber: getValueByColumnLetter(row, "transfer", "B"),
    transferLocation: getValueByColumnLetter(row, "transfer", "AA"),
    transferAmount: parseMoney(getValueByColumnLetter(row, "transfer", "H")),
    transferType: getValueByColumnLetter(row, "transfer", "G"),
  };
}

function buildRecordMap(rows, saleColumn, amountColumn, sourceKey) {
  const records = new Map();
  let emptyRows = 0;
  let duplicateRows = 0;

  rows.forEach((row) => {
    const saleNumber = normalizeSaleNumber(row[saleColumn]);
    if (!saleNumber) {
      emptyRows += 1;
      return;
    }

    if (records.has(saleNumber)) {
      duplicateRows += 1;
      return;
    }

    records.set(saleNumber, {
      amount: parseMoney(row[amountColumn]),
      sourceValues:
        sourceKey === "sys"
          ? createSystemRecord(row).sourceValues
          : {
              date: getValueByColumnLetter(row, "mp", "B"),
              number: getValueByColumnLetter(row, "mp", "K"),
              mpOperationValue: parseMoney(getValueByColumnLetter(row, "mp", "Q")),
            },
    });
  });

  return {
    records,
    emptyRows,
    duplicateRows,
  };
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
    date: sysRecord?.sourceValues.date ?? mpRecord?.sourceValues.date ?? "",
    number: sysRecord?.sourceValues.number ?? mpRecord?.sourceValues.number ?? "",
    journal: sysRecord?.sourceValues.journal ?? "",
    totalPayment: sysRecord?.sourceValues.totalPayment ?? null,
    mpOperationValue: mpRecord?.sourceValues.mpOperationValue ?? null,
    memo: sysRecord?.sourceValues.memo ?? "",
  };
}

function renderMetrics(details) {
  const matches = typeof details === "number" ? details : details.matches;
  selectors.totalCount.textContent = matches;
  selectors.diffCount.textContent = state.report.differences.length;
  selectors.missingMpCount.textContent = state.report.missingMp.length;
  selectors.missingSystemCount.textContent = state.report.missingSystem.length;
  selectors.emptyMemoCount.textContent = state.report.emptyMemo.length;
  selectors.transferDiffCount.textContent = state.report.transferDifferences.length;
  selectors.transferMissingCount.textContent = state.report.transferMissingSystem.length;

  if (typeof details === "number") {
    selectors.reconciliationSummary.hidden = true;
    return;
  }

  const odooDuplicates = details.sysIndex.duplicateRows;
  selectors.reconciliationSummary.innerHTML = `
    <div>
      <strong>Cómo cierra Odoo</strong>
      <span>${state.sys.rows.length} filas = ${matches} coincidencias + ${state.report.missingMp.length} sin Mercado Pago + ${state.report.emptyMemo.length} sin MP${odooDuplicates ? ` + ${odooDuplicates} duplicadas` : ""}</span>
    </div>
  `;
  selectors.reconciliationSummary.hidden = false;
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
  const columns = getReportColumns(state.activeReport);

  selectors.activeReportTitle.textContent = reportType.label;
  selectors.reportTabs.querySelectorAll("[data-report-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reportType === state.activeReport);
  });
  selectors.reportHead.innerHTML = `<tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  selectors.reportBody.innerHTML = rows.map((row) => createTableRow(row, columns)).join("");
  const hasAnySource = state.mp.fileName || state.sys.fileName || state.transfer.fileName;
  selectors.emptyState.textContent =
    state.activeReport === "transactionSearch"
      ? hasAnySource
        ? reportType.empty
        : "Cargá al menos un archivo para buscar."
      : state.mp.fileName && state.sys.fileName && state.transfer.fileName
        ? reportType.empty
        : "Cargá los tres archivos para comparar.";
  selectors.emptyState.hidden = rows.length > 0;
  selectors.exportButton.disabled = rows.length === 0;
  selectors.saveReportButton.disabled = rows.length === 0;
}

function getReportColumns(reportType) {
  if (reportType === "transactionSearch") return transactionSearchColumns;
  return reportType.startsWith("transfer") ? transferReportColumns : reportColumns;
}

function createTableRow(row, columns) {
  return `<tr>${columns
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
  exportRows(reportTypes[state.activeReport].fileName, getActiveRows(), state.activeReport);
}

function exportRows(name, rows, reportType = "differences") {
  if (!rows.length || !window.XLSX) return;

  const columns = getReportColumns(reportType);
  const exportRows = rows.map((row) =>
    Object.fromEntries(columns.map(([key, label]) => [label, row[key] ?? ""]))
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
      transfer: state.transfer.fileName,
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
      await syncPendingDeletions();
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
      const savedReports = remoteReports.map(fromRemoteReport).map(normalizeSavedReport);
      localStorage.setItem(getSavedReportsKey(), JSON.stringify(savedReports));
      return savedReports;
    } catch (error) {
      console.error(error);
      setSyncStatus(getSyncErrorStatus(error), false);
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
    const reports = Array.isArray(saved) ? saved : [];
    const normalizedReports = reports.map(normalizeSavedReport);

    if (JSON.stringify(reports) !== JSON.stringify(normalizedReports)) {
      localStorage.setItem(stationKey, JSON.stringify(normalizedReports));
    }

    return normalizedReports;
  } catch {
    return [];
  }
}

function normalizeSavedReport(report) {
  if (report.type === "emptyMemo" && report.label === "Ventas sin Memo") {
    return { ...report, label: reportTypes.emptyMemo.label };
  }
  if (report.type?.startsWith("transfer")) {
    return {
      ...report,
      rows: report.rows.map((row) => {
        const legacyTransferRow = row.transferType === undefined;
        return {
          ...row,
          transferDate: legacyTransferRow ? "" : row.transferDate ?? "",
          transferType: legacyTransferRow ? row.transferDate ?? "" : row.transferType,
        };
      }),
    };
  }
  return report;
}

async function persistSavedReports() {
  if (isCloudConfigured()) {
    try {
      setSyncStatus("Sincronizando...", false);
      await supabaseRequest("saved_reports?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(state.savedReports.map(toRemoteReport)),
      });
      setSyncStatus("Sincronizado", true);
    } catch (error) {
      console.error(error);
      setSyncStatus(getSyncErrorStatus(error), false);
    }
  }

  localStorage.setItem(getSavedReportsKey(), JSON.stringify(state.savedReports));
}

async function retrySavedReportsSync() {
  if (!state.location || !isCloudConfigured() || savedReportsSyncInProgress) return;

  savedReportsSyncInProgress = true;
  try {
    state.savedReports = await loadSavedReports();
    renderSavedReports();
  } finally {
    savedReportsSyncInProgress = false;
  }
}

function getSavedReportsKey() {
  return `${SAVED_REPORTS_KEY}-${state.location}`;
}

function getPendingDeletionsKey() {
  return `${PENDING_DELETIONS_KEY}-${state.location}`;
}

function getPendingDeletions() {
  try {
    const pending = JSON.parse(localStorage.getItem(getPendingDeletionsKey()) || "[]");
    return Array.isArray(pending) ? pending : [];
  } catch {
    return [];
  }
}

function addPendingDeletion(reportId) {
  const pending = new Set(getPendingDeletions());
  pending.add(reportId);
  localStorage.setItem(getPendingDeletionsKey(), JSON.stringify([...pending]));
}

function removePendingDeletion(reportId) {
  const pending = getPendingDeletions().filter((id) => id !== reportId);
  localStorage.setItem(getPendingDeletionsKey(), JSON.stringify(pending));
}

async function syncPendingDeletions() {
  for (const reportId of getPendingDeletions()) {
    await deleteRemoteReport(reportId);
    removePendingDeletion(reportId);
  }
}

function deleteRemoteReport(reportId) {
  return supabaseRequest(`saved_reports?id=eq.${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });
}

function renderSavedReports() {
  selectors.savedReports.innerHTML = state.savedReports
    .map(
      (report) => `
        <article class="saved-report">
          <div>
            <strong>${escapeHtml(report.label)}</strong>
            <span>${formatSavedDate(report.createdAt)} · ${report.rows.length} filas</span>
            <small>MP: ${escapeHtml(report.sourceFiles?.mp || "-")} · Odoo: ${escapeHtml(report.sourceFiles?.sys || "-")} · Transferencias: ${escapeHtml(report.sourceFiles?.transfer || "-")}</small>
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
    exportRows(reportTypes[report.type]?.fileName || "reporte-guardado", report.rows, report.type);
    return;
  }

  if (button.dataset.action === "delete" && confirm(`¿Borrar el reporte "${report.label}"?`)) {
    state.savedReports = state.savedReports.filter((item) => item.id !== report.id);
    localStorage.setItem(getSavedReportsKey(), JSON.stringify(state.savedReports));
    renderSavedReports();

    if (isCloudConfigured()) {
      addPendingDeletion(report.id);
      try {
        setSyncStatus("Sincronizando...", false);
        await deleteRemoteReport(report.id);
        removePendingDeletion(report.id);
        setSyncStatus("Sincronizado", true);
      } catch (error) {
        console.error(error);
        setSyncStatus("Borrado local · sincronización pendiente", false);
      }
    }
  }
}

function resetApp() {
  state.mp = createSourceState();
  state.sys = createSourceState();
  state.transfer = createSourceState();
  state.report = createEmptyReport();
  state.activeReport = "differences";
  selectors.mpFile.value = "";
  selectors.sysFile.value = "";
  selectors.transferFile.value = "";
  selectors.transactionQuery.value = "";
  updateStatus("mp", "Sin archivo");
  updateStatus("sys", "Sin archivo");
  updateStatus("transfer", "Sin archivo");
  updateCompareState();
  renderMetrics(0);
  renderTable();
}

function handleLocationChoice(event) {
  const button = event.target.closest("[data-location]");
  if (!button) return;
  state.pendingLocation = button.dataset.location;
  selectors.locationLoginTitle.textContent = `Ingresar a ${locations[state.pendingLocation]}`;
  selectors.locationOptions.hidden = true;
  selectors.locationLogin.hidden = false;
  selectors.locationLoginError.hidden = true;
  selectors.locationPassword.value = "";
  selectors.locationPassword.focus();
}

async function handleLocationLogin(event) {
  event.preventDefault();
  const passwordHash = await sha256(selectors.locationPassword.value);

  if (passwordHash !== locationPasswordHashes[state.pendingLocation]) {
    selectors.locationLoginError.hidden = false;
    selectors.locationPassword.select();
    return;
  }

  await selectLocation(state.pendingLocation);
  resetLocationLogin();
}

function resetLocationLogin() {
  state.pendingLocation = "";
  selectors.locationOptions.hidden = false;
  selectors.locationLogin.hidden = true;
  selectors.locationLoginError.hidden = true;
  selectors.locationPassword.value = "";
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
  sessionStorage.removeItem(ACTIVE_LOCATION_KEY);
  resetLocationLogin();
  selectors.locationGate.hidden = false;
  selectors.appShell.hidden = true;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isCloudConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
}

function setSyncStatus(text, ready) {
  selectors.syncStatus.textContent = text;
  selectors.syncStatus.classList.toggle("ready", ready);
}

function getSyncErrorStatus(error) {
  return error.message.includes("PGRST205")
    ? "Falta crear tabla en Supabase · guardado local"
    : "Sin conexión · guardado local";
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
