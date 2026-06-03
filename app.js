const state = {
  mp: createSourceState(),
  sys: createSourceState(),
  report: createEmptyReport(),
};

const reportColumnLetters = {
  sys: ["A", "B", "C", "D", "F"],
  mp: ["Q", "D"],
};

const selectors = {
  mpFile: document.querySelector("#mpFile"),
  sysFile: document.querySelector("#sysFile"),
  mpStatus: document.querySelector("#mpStatus"),
  sysStatus: document.querySelector("#sysStatus"),
  compareButton: document.querySelector("#compareButton"),
  exportDiffButton: document.querySelector("#exportDiffButton"),
  resetButton: document.querySelector("#resetButton"),
  totalCount: document.querySelector("#totalCount"),
  diffCount: document.querySelector("#diffCount"),
  reportHead: document.querySelector("#reportHead"),
  reportBody: document.querySelector("#reportBody"),
  emptyState: document.querySelector("#emptyState"),
};

selectors.mpFile.addEventListener("change", (event) => handleFile(event, "mp"));
selectors.sysFile.addEventListener("change", (event) => handleFile(event, "sys"));
selectors.compareButton.addEventListener("click", compareFiles);
selectors.exportDiffButton.addEventListener("click", () => exportRows("diferencias", state.report.differences));
selectors.resetButton.addEventListener("click", resetApp);

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
    missingSystem: [],
    missingMp: [],
    matches: [],
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
      : { sale: "G", amount: "F" };

  return {
    sale: getHeaderByColumnLetter(headers, positions.sale),
    amount: getHeaderByColumnLetter(headers, positions.amount),
  };
}

function getHeaderByColumnLetter(headers, letter) {
  const index = columnLetterToIndex(letter);
  return headers[index] || "";
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
  const mpRecords = buildRecordMap(state.mp.rows, mpColumns.sale, mpColumns.amount);
  const sysRecords = buildRecordMap(state.sys.rows, sysColumns.sale, sysColumns.amount);
  const report = createEmptyReport();
  const allSaleNumbers = new Set([...mpRecords.keys(), ...sysRecords.keys()]);

  allSaleNumbers.forEach((saleNumber) => {
    const mpRecord = mpRecords.get(saleNumber);
    const sysRecord = sysRecords.get(saleNumber);

    if (!mpRecord) {
      report.missingMp.push(createReportRow(saleNumber, null, sysRecord, "Falta en Mercado Pago"));
      return;
    }

    if (!sysRecord) {
      report.missingSystem.push(createReportRow(saleNumber, mpRecord, null, "Falta en sistema"));
      return;
    }

    const difference = roundMoney(mpRecord.amount - sysRecord.amount);
    const row = createReportRow(saleNumber, mpRecord, sysRecord, difference === 0 ? "Coincide" : "Diferencia");
    row.difference = difference;

    if (difference === 0) {
      report.matches.push(row);
    } else {
      report.differences.push(row);
    }
  });

  state.report = report;
  renderMetrics(allSaleNumbers.size);
  renderTable();

  selectors.exportDiffButton.disabled = report.differences.length === 0;
}

function buildRecordMap(rows, saleColumn, amountColumn) {
  const records = new Map();
  const sourceKey = rows === state.mp.rows ? "mp" : "sys";

  rows.forEach((row, index) => {
    const saleNumber = normalizeSaleNumber(row[saleColumn]);
    if (!saleNumber) return;

    const amount = parseMoney(row[amountColumn]);
    const previous = records.get(saleNumber);

    if (previous) {
      previous.count += 1;
      return;
    }

    records.set(saleNumber, {
      saleNumber,
      amount,
      count: 1,
      rowNumber: index + 2,
      sourceValues: getReportValues(row, sourceKey),
    });
  });

  return records;
}

function getReportValues(row, sourceKey) {
  return reportColumnLetters[sourceKey].reduce((values, letter) => {
    const header = getHeaderByColumnLetter(state[sourceKey].headers, letter);
    values[`${sourceKey}${letter}`] = header ? row[header] : "";
    return values;
  }, {});
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

function createReportRow(saleNumber, mpRecord, sysRecord, status) {
  const mpValues = mpRecord?.sourceValues || {};
  const sysValues = sysRecord?.sourceValues || {};

  return {
    saleNumber,
    sysA: sysValues.sysA ?? "",
    sysB: sysValues.sysB ?? "",
    sysC: sysValues.sysC ?? "",
    sysD: sysValues.sysD ?? "",
    mpD: mpValues.mpD ?? "",
    mpAmount: mpRecord?.amount ?? null,
    systemAmount: sysRecord?.amount ?? null,
    difference: mpRecord && sysRecord ? roundMoney(mpRecord.amount - sysRecord.amount) : null,
    mpRows: mpRecord?.count ?? 0,
    systemRows: sysRecord?.count ?? 0,
    status,
  };
}

function renderMetrics(total) {
  selectors.totalCount.textContent = total;
  selectors.diffCount.textContent = state.report.differences.length;
}

function renderTable() {
  const rows = state.report.differences || [];
  const columns = [
    ["saleNumber", "Numero venta"],
    ["sysA", "Odoo Fecha"],
    ["sysB", "Odoo Numero"],
    ["sysC", "Odoo Diario"],
    ["sysD", "Odoo Cliente / Proveedor"],
    ["mpD", "Numero de movimiento"],
    ["mpAmount", "Valor MP"],
    ["systemAmount", "Odoo Total Pago"],
  ];

  selectors.reportHead.innerHTML = `<tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  selectors.reportBody.innerHTML = rows
    .map((row) => {
      return `<tr>${columns
        .map(([key]) => {
          const value = ["mpAmount", "systemAmount"].includes(key)
            ? formatMoney(row[key])
            : escapeHtml(row[key]);
          const className = ["mpAmount", "systemAmount"].includes(key) ? " class=\"amount\"" : "";
          return `<td${className}>${value}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  selectors.emptyState.hidden = rows.length > 0;
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

function exportRows(name, rows) {
  if (!rows.length) return;

  const headers = [
    "numero_venta",
    "odoo_fecha",
    "odoo_numero",
    "odoo_diario",
    "odoo_cliente_proveedor",
    "numero_movimiento",
    "valor_mp",
    "odoo_total_pago",
  ];
  const csvRows = [
    headers.join(";"),
    ...rows.map((row) =>
      [
        row.saleNumber,
        row.sysA,
        row.sysB,
        row.sysC,
        row.sysD,
        row.mpD,
        row.mpAmount ?? "",
        row.systemAmount ?? "",
      ]
        .map(csvCell)
        .join(";")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function resetApp() {
  state.mp = createSourceState();
  state.sys = createSourceState();
  state.report = createEmptyReport();
  selectors.mpFile.value = "";
  selectors.sysFile.value = "";
  updateStatus("mp", "Sin archivo");
  updateStatus("sys", "Sin archivo");
  updateCompareState();
  renderMetrics(0);
  renderTable();
  selectors.exportDiffButton.disabled = true;
}
