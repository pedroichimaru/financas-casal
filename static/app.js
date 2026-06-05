// ===== NAVIGATION =====

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const section = btn.dataset.section;
    document.getElementById("section-importar").hidden = section !== "importar";
    document.getElementById("section-fechamento").hidden = section !== "fechamento";
    if (section === "fechamento") initFechamento();
  });
});

// ===== IMPORTAR =====

const dropZone      = document.getElementById("drop-zone");
const fileInput     = document.getElementById("file-input");
const fileNameEl    = document.getElementById("file-name");
const uploadSection = document.getElementById("upload-section");
const resultSection = document.getElementById("result-section");
const expensesBody  = document.getElementById("expenses-body");
const monthBadge    = document.getElementById("month-badge");
const countBadge    = document.getElementById("count-badge");
const totalBadge    = document.getElementById("total-badge");
const errorBanner   = document.getElementById("error-banner");
const loading       = document.getElementById("loading");
const importSuccess = document.getElementById("import-success");
const btnClear      = document.getElementById("btn-clear");
const btnImport     = document.getElementById("btn-import");
const selectMonth   = document.getElementById("select-month");
const selectYear    = document.getElementById("select-year");

// Populate year dropdown
const currentYear = new Date().getFullYear();
for (let y = currentYear; y >= currentYear - 4; y--) {
  const opt = document.createElement("option");
  opt.value = y;
  opt.textContent = y;
  selectYear.appendChild(opt);
}

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

btnClear.addEventListener("click", resetImport);

// Stored after /upload for use in /import
let _pendingExpenses = null;
let _pendingMes = null;

btnImport.addEventListener("click", saveImport);

function selectedMonth() {
  const m = selectMonth.value;
  const y = selectYear.value;
  return m && y ? `${m}/${y}` : null;
}

function resetImport() {
  resultSection.hidden = true;
  uploadSection.hidden = false;
  fileNameEl.textContent = "";
  fileInput.value = "";
  errorBanner.hidden = true;
  importSuccess.hidden = true;
  btnImport.disabled = false;
  btnImport.textContent = "Importar despesas";
  expensesBody.innerHTML = "";
  _pendingExpenses = null;
  _pendingMes = null;
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.hidden = false;
  loading.hidden = true;
}

async function handleFile(file) {
  if (!file.name.endsWith(".xlsx")) {
    showError("Selecione um arquivo .xlsx válido.");
    return;
  }
  if (!selectedMonth()) {
    showError("Selecione o mês e o ano de fechamento antes de importar.");
    return;
  }

  errorBanner.hidden = true;
  importSuccess.hidden = true;
  loading.hidden = false;
  resultSection.hidden = true;
  fileNameEl.textContent = file.name;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("mes", selectedMonth());

  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) { showError(data.detail || "Erro ao processar o arquivo."); return; }

    _pendingExpenses = data.expenses;
    _pendingMes = data.mes;
    renderPreview(data.expenses, data.count, data.total, data.mes);
  } catch {
    showError("Erro de conexão com o servidor.");
  } finally {
    loading.hidden = true;
  }
}

async function saveImport() {
  if (!_pendingExpenses || !_pendingMes) return;
  btnImport.disabled = true;
  btnImport.textContent = "Salvando…";

  try {
    const res = await fetch("/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: _pendingMes, expenses: _pendingExpenses }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.detail || "Erro ao salvar despesas.");
      btnImport.disabled = false;
      btnImport.textContent = "Importar despesas";
      return;
    }
    importSuccess.textContent = `${data.saved} despesas salvas para ${data.mes}.`;
    importSuccess.hidden = false;
    btnImport.textContent = "Importado ✓";
  } catch {
    showError("Erro de conexão ao salvar.");
    btnImport.disabled = false;
    btnImport.textContent = "Importar despesas";
  }
}

function renderPreview(expenses, count, total, mes) {
  expensesBody.innerHTML = "";
  expenses.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.data}</td>
      <td>${e.despesa}</td>
      <td class="col-valor">${formatBRL(e.valor)}</td>
      <td>${e.id}</td>
      <td>${e.portador}</td>
    `;
    expensesBody.appendChild(tr);
  });
  monthBadge.textContent = mes;
  countBadge.textContent = `${count} despesa${count !== 1 ? "s" : ""}`;
  totalBadge.textContent = `Total: ${formatBRL(total)}`;
  uploadSection.hidden = true;
  resultSection.hidden = false;
}

// ===== FECHAMENTO =====

const fechamentoSel     = document.getElementById("fechamento-mes-select");
const fechamentoContent = document.getElementById("fechamento-content");
const fechamentoEmpty   = document.getElementById("fechamento-empty");
const fechamentoLoading = document.getElementById("fechamento-loading");
const fechamentoBody    = document.getElementById("fechamento-body");
const fechamentoFoot    = document.getElementById("fechamento-foot");
const fechamentoSummary = document.getElementById("fechamento-summary");

let _mesesLoaded = false;

async function initFechamento() {
  if (_mesesLoaded) return;
  _mesesLoaded = true;

  try {
    const res = await fetch("/meses");
    const meses = await res.json();
    fechamentoSel.innerHTML = '<option value="">Selecione o mês…</option>';
    meses.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      fechamentoSel.appendChild(opt);
    });
    if (meses.length === 0) {
      fechamentoEmpty.textContent = "Nenhum mês importado ainda. Importe um XLSX primeiro.";
      fechamentoEmpty.hidden = false;
    }
  } catch {
    fechamentoEmpty.textContent = "Erro ao carregar meses.";
    fechamentoEmpty.hidden = false;
  }
}

fechamentoSel.addEventListener("change", async () => {
  const mes = fechamentoSel.value;
  fechamentoContent.hidden = true;
  fechamentoEmpty.hidden = true;
  if (!mes) return;

  fechamentoLoading.hidden = false;
  try {
    const res = await fetch(`/fechamento?mes=${encodeURIComponent(mes)}`);
    const data = await res.json();
    fechamentoLoading.hidden = true;
    if (!data.expenses || data.expenses.length === 0) {
      fechamentoEmpty.textContent = "Nenhuma despesa encontrada para este mês.";
      fechamentoEmpty.hidden = false;
      return;
    }
    renderFechamento(data);
    fechamentoContent.hidden = false;
  } catch {
    fechamentoLoading.hidden = true;
    fechamentoEmpty.textContent = "Erro ao carregar despesas.";
    fechamentoEmpty.hidden = false;
  }
});

function rowClass(aprop) {
  switch (aprop) {
    case "Pedro":  return "row-pedro";
    case "Marina": return "row-marina";
    case "Casa":   return "row-casa";
    case "50/50":  return "row-meio";
    default:       return "";
  }
}

function renderFechamento({ expenses, totais, total_geral }) {
  fechamentoBody.innerHTML = "";
  fechamentoFoot.innerHTML = "";
  fechamentoSummary.innerHTML = "";

  expenses.forEach((e) => {
    const tr = document.createElement("tr");
    tr.className = rowClass(e.apropriacao);
    tr.innerHTML = `
      <td>${e.data}</td>
      <td>${e.despesa}</td>
      <td class="col-valor">${formatBRL(e.valor)}</td>
      <td>${e.id_origem}</td>
      <td>${e.portador}</td>
      <td><span class="aprop-badge">${e.apropriacao}</span></td>
    `;
    fechamentoBody.appendChild(tr);
  });

  // Summary cards (acima da tabela)
  const contaCards = [
    { key: "Pedro",  cls: "pedro"  },
    { key: "Marina", cls: "marina" },
    { key: "Casa",   cls: "casa"   },
    { key: "50/50",  cls: "meio"   },
  ];
  contaCards.forEach(({ key, cls }) => {
    if ((totais[key] || 0) === 0) return;
    const card = document.createElement("div");
    card.className = `summary-card summary-card--${cls}`;
    card.innerHTML = `
      <div class="summary-card__label">${key}</div>
      <div class="summary-card__value">${formatBRL(totais[key])}</div>
    `;
    fechamentoSummary.appendChild(card);
  });

  const totalCard = document.createElement("div");
  totalCard.className = "summary-card summary-card--total";
  totalCard.innerHTML = `
    <div class="summary-card__label">Total Geral</div>
    <div class="summary-card__value">${formatBRL(total_geral)}</div>
  `;
  fechamentoSummary.appendChild(totalCard);
}

// ===== UTILS =====

function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
