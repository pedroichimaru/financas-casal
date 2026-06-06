// ===== NAVIGATION =====

document.querySelector(".logo").addEventListener("click", () => {
  document.querySelector('[data-section="inicio"]').click();
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const section = btn.dataset.section;
    document.getElementById("section-inicio").hidden     = section !== "inicio";
    document.getElementById("section-importar").hidden   = section !== "importar";
    document.getElementById("section-fechamento").hidden = section !== "fechamento";
    document.getElementById("section-salarios").hidden   = section !== "salarios";
    closeFilterPanel();
    closeApropDropdown();
    closeMesDropdown();
    if (section === "inicio")     initInicio();
    if (section === "fechamento") initFechamento();
    if (section === "salarios")  initSalarios();
  });
});

// ===== INÍCIO (DASHBOARD) =====

if (typeof ChartDataLabels !== "undefined") Chart.register(ChartDataLabels);
let _historicoChart = null;

function initInicio() {
  loadDashboard();
}

async function loadDashboard() {
  const loadingEl = document.getElementById("inicio-loading");
  const emptyEl   = document.getElementById("inicio-empty");
  const contentEl = document.getElementById("inicio-content");
  loadingEl.hidden = false;
  contentEl.hidden = true;
  emptyEl.hidden   = true;
  try {
    const res  = await fetch("/dashboard");
    const data = await res.json();
    loadingEl.hidden = true;
    if (!data.has_data) { emptyEl.hidden = false; return; }
    renderDashboard(data);
    contentEl.hidden = false;
  } catch {
    loadingEl.hidden = true;
    emptyEl.textContent = "Erro ao carregar o dashboard.";
    emptyEl.hidden = false;
  }
}

function renderDashboard(data) {
  // 1. Último mês
  const um = data.ultimo_mes;
  document.getElementById("inicio-mes-nome").textContent = um.mes;
  document.getElementById("inicio-total-geral").textContent = formatBRL(um.total_geral);

  document.getElementById("inicio-total-split").innerHTML = buildSplitHtml({ items: [
    { cls: "pedro",  label: "Pedro",  val: um.total_pedro  },
    { cls: "marina", label: "Marina", val: um.total_marina },
  ]});

  const saldoEl = document.getElementById("inicio-saldo");
  const saldoAbs = Math.abs(um.saldo_aberto);
  saldoEl.textContent = formatBRL(saldoAbs);
  saldoEl.className   = "inicio-metric-value " + (um.saldo_aberto <= 0 ? "saldo-quitado" : "saldo-aberto");

  document.getElementById("inicio-saldo-split").innerHTML = buildSplitHtml({ items: [
    { cls: "marina", label: "Devido",     val: um.total_marina      },
    { cls: "pedro",  label: "Abatido",    val: um.total_abatimentos },
  ]});

  // Saldo card: cor e título condicionais
  const cardSaldo      = document.getElementById("card-saldo");
  const cardSaldoLabel = document.getElementById("card-saldo-label");
  if (cardSaldo) {
    if (Math.abs(um.saldo_aberto) < 0.01) {
      cardSaldo.className = "inicio-resumo-card inicio-resumo-card--neutral";
    } else if (um.saldo_aberto > 0) {
      cardSaldo.className = "inicio-resumo-card inicio-resumo-card--danger";
    } else {
      cardSaldo.className = "inicio-resumo-card inicio-resumo-card--success";
    }
  }
  if (cardSaldoLabel) {
    if (Math.abs(um.saldo_aberto) < 0.01) {
      cardSaldoLabel.textContent = "Balanço Zerado";
    } else if (um.saldo_aberto > 0) {
      cardSaldoLabel.textContent = "Saldo em Aberto Marina";
    } else {
      cardSaldoLabel.textContent = "Sobrepago Marina";
    }
  }
  const saldoMetricEl = document.getElementById("inicio-saldo");
  if (saldoMetricEl) saldoMetricEl.className = "inicio-metric-value";

  // 2. Salários
  const salLabel = document.getElementById("inicio-sal-label");
  if (salLabel) salLabel.textContent = `Divisão de Despesas Casa — ${um.mes}`;
  renderDashSalarios(data.salarios);

  // 3. Gráfico
  renderHistoricoChart(data.historico);
}

function renderDashSalarios(sal) {
  const el = document.getElementById("inicio-sal-cards");
  el.innerHTML = "";
  if (!sal) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">Sem dados de salário cadastrados.</p>';
    return;
  }
  const nLabel = sal.windowSize < 12 ? `${sal.windowSize}m` : "12m";
  [
    { cls: "pedro",  label: "Pedro",  avg: sal.avgPedro,  pct: sal.pctPedro  },
    { cls: "marina", label: "Marina", avg: sal.avgMarina, pct: sal.pctMarina },
  ].forEach(({ cls, label, avg, pct }) => {
    const card = document.createElement("div");
    card.className = `summary-card summary-card--${cls}`;
    card.innerHTML = `
      <div class="summary-card__label">${label} — Despesas Casa</div>
      <div class="summary-card__value">${formatPct(pct)}</div>
      <div class="summary-card__sub">Média ${nLabel}: ${formatBRL(avg)}</div>
    `;
    el.appendChild(card);
  });
}

function renderHistoricoChart(historico) {
  const canvas = document.getElementById("historico-chart");
  if (!canvas || typeof Chart === "undefined") return;
  if (_historicoChart) { _historicoChart.destroy(); _historicoChart = null; }

  // fade-in: começa invisível
  canvas.style.opacity = "0";
  canvas.style.transition = "";

  const font = { family: "'IBM Plex Sans', sans-serif" };

  const labels = historico.map(h => {
    const [name, year] = h.mes.split("/");
    return `${name.slice(0, 3)}/${year.slice(2)}`;
  });

  const mkDs = (label, data, color, dlAlign) => ({
    label, data,
    borderColor: color,
    backgroundColor: "transparent",
    pointBackgroundColor: color,
    pointBorderColor: color,
    tension: 0.3, pointRadius: 5, pointHoverRadius: 7, fill: false,
    datalabels: { align: dlAlign, anchor: "center", offset: 12 },
  });

  _historicoChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        mkDs("Total Geral", historico.map(h => h.total),  "#0F172A", "top"),
        mkDs("Pedro",       historico.map(h => h.pedro),  "#16A34A", "top"),
        mkDs("Marina",      historico.map(h => h.marina), "#DB2777", "bottom"),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 32, bottom: 24 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: { ...font, size: 12, weight: "600" },
          bodyFont:  { ...font, size: 12 },
          padding: 10,
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: (ctx) => `  ${ctx.dataset.label}: ${formatBRL(ctx.parsed.y)}`,
          },
        },
        datalabels: {
          offset: 0,
          backgroundColor: (ctx) => ctx.dataset.borderColor,
          borderRadius: 8,
          color: "#fff",
          font: { size: 9, weight: "700", ...font },
          formatter: (v) => `${Math.round(v / 1000)}k`,
          padding: { top: 3, bottom: 3, left: 5, right: 5 },
        },
      },
      scales: {
        y: {
          ticks: { callback: (v) => formatBRL(v), font: { ...font, size: 11 }, maxTicksLimit: 6 },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        x: {
          ticks: { font: { ...font, size: 11 } },
          grid: { display: false },
        },
      },
    },
  });

  // fade-in após render
  requestAnimationFrame(() => {
    canvas.style.transition = "opacity 0.7s ease-in-out";
    canvas.style.opacity = "1";
  });
}

// Carrega dashboard ao iniciar (seção padrão)
initInicio();

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
for (let y = currentYear; y >= 2025; y--) {
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
const btnZerarMes       = document.getElementById("btn-zerar-mes");

let _mesesLoaded     = false;
let _meses           = [];
let _currentMesIdx   = -1;
let _currentExpenses = [];
let _openFilterPanel = null;
let _apropDropdown   = null;

const FILTER_COLS = {
  id: {
    thId: "th-id-filter-btn",
    getValue: (tr) => tr.querySelectorAll("td")[3]?.textContent.trim() ?? "",
  },
  portador: {
    thId: "th-portador-filter-btn",
    getValue: (tr) => tr.querySelectorAll("td")[4]?.textContent.trim() ?? "",
  },
  apropriacao: {
    thId: "th-aprop-filter-btn",
    getValue: (tr) => tr.querySelectorAll("td")[5]?.querySelector(".aprop-btn")?.dataset.aprop ?? "",
  },
};

const _filters      = { id: new Set(), portador: new Set(), apropriacao: new Set() };
const _filterValues = { id: [],        portador: [],        apropriacao: [] };

const SORT_COLS = [
  { key: "data",    thId: "th-sort-data" },
  { key: "despesa", thId: "th-sort-despesa" },
  { key: "valor",   thId: "th-sort-valor" },
  { key: "id",          thId: "th-sort-id" },
  { key: "portador",    thId: "th-sort-portador" },
  { key: "apropriacao", thId: "th-sort-aprop" },
];

let _sortState         = { col: null, dir: "asc" };
let _currentProp       = null;
let _currentPagamentos = [];
let _totalMarina       = 0;

const PAG_SORT_COLS = [
  { key: "data",      thId: "pag-th-data" },
  { key: "pagamento", thId: "pag-th-pagamento" },
  { key: "valor",     thId: "pag-th-valor" },
];
let _pagSortState  = { col: null, dir: "asc" };
let _editingPagId  = null;

// Persistent delegated listeners (registered once)
fechamentoBody.addEventListener("click", onApropBtnClick);
fechamentoBody.addEventListener("click", onDelRowBtnClick);
Object.entries(FILTER_COLS).forEach(([colKey, cfg]) => {
  document.getElementById(cfg.thId).addEventListener("click", (e) => {
    e.stopPropagation();
    if (_openFilterPanel?.key === colKey) { closeFilterPanel(); return; }
    closeFilterPanel();
    if (_filterValues[colKey].length === 0) return;
    openFilterPanel(colKey);
  });
});
SORT_COLS.forEach(({ key, thId }) => {
  document.getElementById(thId).addEventListener("click", () => sortTable(key));
});
PAG_SORT_COLS.forEach(({ key, thId }) => {
  document.getElementById(thId).addEventListener("click", () => sortPagamentos(key));
});
document.getElementById("pag-body").addEventListener("click", onPagDelBtnClick);
document.getElementById("pag-body").addEventListener("click", onPagEditBtnClick);
document.getElementById("btn-mes-prev").addEventListener("click", (e) => { e.stopPropagation(); selectMesIdx(_currentMesIdx + 1); });
document.getElementById("btn-mes-next").addEventListener("click", (e) => { e.stopPropagation(); selectMesIdx(_currentMesIdx - 1); });
document.getElementById("mes-nav-label-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleMesDropdown(); });
document.getElementById("btn-add-pag").addEventListener("click", addPagamento);
document.getElementById("edit-pag-save").addEventListener("click", saveEditPagamento);
document.getElementById("edit-pag-cancel").addEventListener("click", exitEditMode);
document.getElementById("edit-pag-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("edit-pag-overlay")) exitEditMode();
});

function maskDate(input) {
  const d = input.value.replace(/\D/g, "").slice(0, 8);
  let v = d;
  if (d.length >= 3) v = d.slice(0, 2) + "/" + d.slice(2);
  if (d.length >= 5) v = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
  input.value = v;
}
document.getElementById("pag-data").addEventListener("input", function () { maskDate(this); });
document.getElementById("edit-pag-data").addEventListener("input", function () { maskDate(this); });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && _editingPagId) exitEditMode();
});

async function initFechamento() {
  if (_mesesLoaded) return;
  _mesesLoaded = true;

  try {
    const res = await fetch("/meses");
    _meses = await res.json();
    fechamentoSel.innerHTML = '<option value="">Selecione o mês…</option>';
    _meses.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m; opt.textContent = m;
      fechamentoSel.appendChild(opt);
    });
    if (_meses.length === 0) {
      fechamentoEmpty.textContent = "Nenhum mês importado ainda. Importe um XLSX primeiro.";
      fechamentoEmpty.hidden = false;
      updateMesNav();
      return;
    }
    selectMesIdx(0); // auto-carrega o mês mais recente
  } catch {
    fechamentoEmpty.textContent = "Erro ao carregar meses.";
    fechamentoEmpty.hidden = false;
  }
}

function selectMesIdx(idx) {
  if (idx < 0 || idx >= _meses.length) return;
  _currentMesIdx = idx;
  updateMesNav();
  fechamentoSel.value = _meses[idx];
  fechamentoSel.dispatchEvent(new Event("change"));
}

function updateMesNav() {
  const textEl  = document.getElementById("mes-nav-text");
  const prevBtn = document.getElementById("btn-mes-prev");
  const nextBtn = document.getElementById("btn-mes-next");
  if (textEl)  textEl.textContent = _currentMesIdx >= 0 ? _meses[_currentMesIdx] : "—";
  if (prevBtn) prevBtn.disabled   = _currentMesIdx >= _meses.length - 1;
  if (nextBtn) nextBtn.disabled   = _currentMesIdx <= 0;
}

function toggleMesDropdown() {
  const dropdown = document.getElementById("mes-nav-dropdown");
  if (!dropdown.hidden) { closeMesDropdown(); return; }
  dropdown.innerHTML = "";
  _meses.forEach((mes, idx) => {
    const item = document.createElement("div");
    item.className = "mes-nav-item" + (idx === _currentMesIdx ? " mes-nav-item--active" : "");
    item.textContent = mes;
    item.addEventListener("click", () => { closeMesDropdown(); selectMesIdx(idx); });
    dropdown.appendChild(item);
  });
  dropdown.hidden = false;
  document.getElementById("mes-nav-label-btn").classList.add("open");
  setTimeout(() => document.addEventListener("click", onOutsideMesNav, true), 0);
}

function closeMesDropdown() {
  const dropdown = document.getElementById("mes-nav-dropdown");
  if (!dropdown || dropdown.hidden) return;
  dropdown.hidden = true;
  document.getElementById("mes-nav-label-btn")?.classList.remove("open");
  document.removeEventListener("click", onOutsideMesNav, true);
}

function onOutsideMesNav(e) {
  const nav = document.getElementById("mes-nav");
  if (nav && !nav.contains(e.target)) closeMesDropdown();
}

fechamentoSel.addEventListener("change", async () => {
  const mes = fechamentoSel.value;
  fechamentoContent.hidden = true;
  btnZerarMes.hidden = true;
  fechamentoEmpty.hidden = true;
  closeFilterPanel();
  closeApropDropdown();
  Object.keys(_filters).forEach(k => { _filters[k] = new Set(); });
  updateFilterIndicators();
  _currentProp = null;
  if (_editingPagId) exitEditMode();
  if (!mes) return;

  fechamentoLoading.hidden = false;
  try {
    const [expRes, propRes, pagRes] = await Promise.all([
      fetch(`/fechamento?mes=${encodeURIComponent(mes)}`),
      fetch(`/salarios/proporcao?mes=${encodeURIComponent(mes)}`),
      fetch(`/pagamentos?mes=${encodeURIComponent(mes)}`),
    ]);
    const data = await expRes.json();
    _currentProp       = propRes.ok ? await propRes.json() : null;
    _currentPagamentos = pagRes.ok  ? await pagRes.json()  : [];
    fechamentoLoading.hidden = true;
    if (!data.expenses || data.expenses.length === 0) {
      fechamentoEmpty.textContent = "Nenhuma despesa encontrada para este mês.";
      fechamentoEmpty.hidden = false;
      return;
    }
    renderFechamento(data);
    fechamentoContent.hidden = false;
    btnZerarMes.hidden = false;
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

function renderFechamento({ expenses }) {
  // Default order: CC/extrato first, then credit cards alphabetically
  const ordered = [...expenses].sort((a, b) => {
    const [ga, la] = idSortPair((a.id_origem || "").trim());
    const [gb, lb] = idSortPair((b.id_origem || "").trim());
    if (ga !== gb) return ga - gb;
    return la.localeCompare(lb, "pt-BR");
  });

  _currentExpenses = ordered.map(e => ({ ...e }));
  _filterValues.id          = [...new Set(ordered.map(e => (e.id_origem || "").trim()))].sort();
  _filterValues.portador    = [...new Set(ordered.map(e => (e.portador  || "").trim()))].sort();
  _filterValues.apropriacao = ["Pedro", "Marina", "Casa", "50/50"].filter(v => ordered.some(e => e.apropriacao === v));
  Object.keys(_filters).forEach(k => { _filters[k] = new Set(); });
  updateFilterIndicators();
  _sortState = { col: null, dir: "asc" };
  updateSortIndicators();

  _pagSortState = { col: null, dir: "asc" };
  renderBalancoTable(_currentPagamentos);

  fechamentoBody.innerHTML = "";
  fechamentoFoot.innerHTML = "";

  ordered.forEach((e) => {
    const tr = document.createElement("tr");
    tr.className = rowClass(e.apropriacao);
    tr.dataset.rowid = e.id;
    tr.innerHTML = `
      <td>${e.data}</td>
      <td>${e.despesa}</td>
      <td class="col-valor">${formatBRL(e.valor)}</td>
      <td>${e.id_origem}</td>
      <td>${e.portador}</td>
      <td><button class="aprop-btn" data-rowid="${e.id}" data-aprop="${e.apropriacao}"><span class="aprop-btn-label">${e.apropriacao}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button></td>
      <td class="col-del"><button class="del-row-btn" title="Excluir despesa"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></td>
    `;
    fechamentoBody.appendChild(tr);
  });

  renderSummaryCards();
  renderIdTotals();
}

function renderIdTotals() {
  const strip = document.getElementById("id-totals-strip");
  strip.innerHTML = "";

  const byId = {};
  _currentExpenses.forEach(e => {
    const id = (e.id_origem || "—").trim();
    byId[id] = (byId[id] || 0) + e.valor;
  });

  const total = Object.values(byId).reduce((s, v) => s + v, 0);

  Object.entries(byId)
    .sort(([idA], [idB]) => {
      const [ga, la] = idSortPair(idA);
      const [gb, lb] = idSortPair(idB);
      if (ga !== gb) return ga - gb;
      return la.localeCompare(lb, "pt-BR");
    })
    .forEach(([id, valor]) => {
      const item = document.createElement("div");
      item.className = "id-totals-item";
      item.innerHTML = `<div class="id-totals-label" title="${id}">${id}</div><div class="id-totals-value">${formatBRL(valor)}</div>`;
      strip.appendChild(item);
    });

  const tot = document.createElement("div");
  tot.className = "id-totals-item id-totals-total";
  tot.innerHTML = `<div class="id-totals-label">Total Geral</div><div class="id-totals-value">${formatBRL(total)}</div>`;
  strip.appendChild(tot);
}

function renderSummaryCards() {
  fechamentoSummary.innerHTML = "";

  const totais = { Pedro: 0, Marina: 0, Casa: 0, "50/50": 0 };
  _currentExpenses.forEach(e => {
    const aprop = e.apropriacao || "50/50";
    if (aprop in totais) totais[aprop] += e.valor;
  });
  const total_geral = Object.values(totais).reduce((a, b) => a + b, 0);

  // Salary proportions for Casa
  const prop     = _currentProp;
  const hasProp  = prop?.found && prop.window_size > 0;
  const pPedro   = hasProp ? prop.pct_pedro  / 100 : 0.5;
  const pMarina  = hasProp ? prop.pct_marina / 100 : 0.5;

  const casaPedro   = totais["Casa"]   * pPedro;
  const casaMarina  = totais["Casa"]   * pMarina;
  const meioMeio    = totais["50/50"] * 0.5;
  const totalPedro  = totais["Pedro"]  + casaPedro  + meioMeio;
  const totalMarina = totais["Marina"] + casaMarina + meioMeio;

  const casaNota = hasProp
    ? `${formatPct(pPedro * 100)} / ${formatPct(pMarina * 100)} · ${prop.window_size}m salários`
    : "50% / 50% · sem dados de salário";

  [
    { key: "Pedro",  cls: "pedro",  split: null },
    { key: "Marina", cls: "marina", split: null },
    { key: "Casa",   cls: "casa",
      split: { items: [
        { cls: "pedro",  label: "Pedro",  val: casaPedro  },
        { cls: "marina", label: "Marina", val: casaMarina },
      ], note: casaNota }
    },
    { key: "50/50",  cls: "meio",
      split: { items: [
        { cls: "pedro",  label: "Pedro",  val: meioMeio },
        { cls: "marina", label: "Marina", val: meioMeio },
      ]}
    },
  ].forEach(({ key, cls, split }) => {
    const card = document.createElement("div");
    card.className = `summary-card summary-card--${cls}`;
    card.innerHTML = `
      <div class="summary-card__label">${key}</div>
      <div class="summary-card__value">${formatBRL(totais[key])}</div>
      ${split ? buildSplitHtml(split) : ""}
    `;
    fechamentoSummary.appendChild(card);
  });

  const totalCard = document.createElement("div");
  totalCard.className = "summary-card summary-card--total";
  totalCard.innerHTML = `
    <div class="summary-card__label">Total Geral</div>
    <div class="summary-card__value">${formatBRL(total_geral)}</div>
    ${buildSplitHtml({ items: [
      { cls: "pedro",  label: "Pedro",  val: totalPedro  },
      { cls: "marina", label: "Marina", val: totalMarina },
    ]})}
  `;
  fechamentoSummary.appendChild(totalCard);

  _totalMarina = totalMarina;
  renderBalancoSaldo();
}

function buildSplitHtml({ items, note }) {
  const pills = items.map(({ cls, label, val }) =>
    `<span class="split-pill split-pill--${cls}"><span class="split-pill__dot"></span><span class="split-pill__label">${label}</span><span class="split-pill__val">${formatBRL(val)}</span></span>`
  ).join("");
  const noteHtml = note ? `<span class="split-note">${note}</span>` : "";
  return `<div class="summary-card__split">${pills}${noteHtml}</div>`;
}

// ===== TABLE SORT =====

function sortTable(colKey) {
  const dir = _sortState.col === colKey && _sortState.dir === "asc" ? "desc" : "asc";
  _sortState = { col: colKey, dir };

  const rows = [...fechamentoBody.querySelectorAll("tr")];
  rows.sort((a, b) => {
    const va = getSortValue(a, colKey);
    const vb = getSortValue(b, colKey);
    const cmp = typeof va === "number"
      ? va - vb
      : String(va).localeCompare(String(vb), "pt-BR", { sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });

  rows.forEach(tr => fechamentoBody.appendChild(tr));
  updateSortIndicators();
}

function getSortValue(tr, colKey) {
  const exp = _currentExpenses.find(e => String(e.id) === String(tr.dataset.rowid));
  if (!exp) return colKey === "valor" ? 0 : "";
  switch (colKey) {
    case "data":    return parseDateSort(exp.data);
    case "despesa": return exp.despesa ?? "";
    case "valor":   return exp.valor ?? 0;
    case "id":          return exp.id_origem  ?? "";
    case "portador":    return exp.portador   ?? "";
    case "apropriacao": return exp.apropriacao ?? "";
    default:            return "";
  }
}

function parseDateSort(dateStr) {
  if (!dateStr) return "";
  // "DD/MM/YYYY" → "YYYYMMDD" for correct lexicographic sort
  const p = dateStr.split("/");
  if (p.length === 3) return `${p[2]}${p[1].padStart(2, "0")}${p[0].padStart(2, "0")}`;
  return dateStr;
}

function updateSortIndicators() {
  SORT_COLS.forEach(({ thId }) => {
    document.getElementById(thId).classList.remove("th-sorted-asc", "th-sorted-desc");
  });
  if (!_sortState.col) return;
  const cfg = SORT_COLS.find(c => c.key === _sortState.col);
  if (cfg) {
    document.getElementById(cfg.thId).classList.add(
      _sortState.dir === "asc" ? "th-sorted-asc" : "th-sorted-desc"
    );
  }
}

// ===== COLUMN FILTERS =====

function openFilterPanel(colKey) {
  const cfg       = FILTER_COLS[colKey];
  const triggerEl = document.getElementById(cfg.thId);
  const rect      = (triggerEl.closest("th") || triggerEl).getBoundingClientRect();
  const values = _filterValues[colKey];
  const active = _filters[colKey];

  const panel = document.createElement("div");
  panel.className = "id-filter-panel";
  panel.style.position = "fixed";
  panel.innerHTML = `
    <div class="id-filter-header">
      <button class="id-filter-all" id="idf-all">Todos</button>
      <button class="id-filter-all" id="idf-none">Nenhum</button>
    </div>
    <div class="id-filter-list" id="idf-list"></div>
    <div class="id-filter-footer">
      <button class="btn-primary id-filter-apply" id="idf-apply">Aplicar</button>
    </div>
  `;

  const list = panel.querySelector("#idf-list");
  values.forEach(val => {
    const label = document.createElement("label");
    label.className = "id-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = val;
    cb.checked = active.size === 0 || active.has(val);
    const span = document.createElement("span");
    span.textContent = val;
    label.appendChild(cb);
    label.appendChild(span);
    list.appendChild(label);
  });

  document.body.appendChild(panel);
  panel.style.top  = rect.bottom + "px";
  panel.style.left = Math.max(0, rect.left) + "px";

  panel.querySelector("#idf-all").addEventListener("click", () =>
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => (cb.checked = true))
  );
  panel.querySelector("#idf-none").addEventListener("click", () =>
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => (cb.checked = false))
  );
  panel.querySelector("#idf-apply").addEventListener("click", () => {
    const checked = [...panel.querySelectorAll("input[type=checkbox]:checked")].map(cb => cb.value);
    _filters[colKey] = checked.length === values.length ? new Set() : new Set(checked);
    applyFilters();
    updateFilterIndicators();
    closeFilterPanel();
  });

  _openFilterPanel = { key: colKey, panelEl: panel };
  setTimeout(() => document.addEventListener("click", onOutsideFilter, true), 0);
}

function closeFilterPanel() {
  if (!_openFilterPanel) return;
  _openFilterPanel.panelEl.remove();
  _openFilterPanel = null;
  document.removeEventListener("click", onOutsideFilter, true);
}

function onOutsideFilter(e) {
  if (!_openFilterPanel) return;
  const { key, panelEl } = _openFilterPanel;
  if (!panelEl.contains(e.target) && !e.target.closest(`#${FILTER_COLS[key].thId}`)) {
    closeFilterPanel();
  }
}

function applyFilters() {
  fechamentoBody.querySelectorAll("tr").forEach(tr => {
    const show = Object.entries(FILTER_COLS).every(([key, cfg]) => {
      const active = _filters[key];
      if (active.size === 0) return true;
      return active.has(cfg.getValue(tr));
    });
    tr.style.display = show ? "" : "none";
  });
}

function updateFilterIndicators() {
  Object.entries(FILTER_COLS).forEach(([key, cfg]) => {
    document.getElementById(cfg.thId).classList.toggle("th-filtered", _filters[key].size > 0);
  });
}

// ===== APROP RECLASSIFY =====

function onApropBtnClick(e) {
  const btn = e.target.closest(".aprop-btn");
  if (!btn) return;
  e.stopPropagation();
  if (_apropDropdown && _apropDropdown.dataset.rowid === btn.dataset.rowid) {
    closeApropDropdown();
    return;
  }
  closeApropDropdown();
  openApropDropdown(btn);
}

function openApropDropdown(btn) {
  const rect = btn.getBoundingClientRect();
  const currentAprop = btn.dataset.aprop;

  const dropdown = document.createElement("div");
  dropdown.className = "aprop-dropdown";
  dropdown.dataset.rowid = btn.dataset.rowid;
  dropdown.style.position = "fixed";

  [
    { label: "Pedro",  cls: "pedro"  },
    { label: "Marina", cls: "marina" },
    { label: "Casa",   cls: "casa"   },
    { label: "50/50",  cls: "meio"   },
  ].forEach(({ label, cls }) => {
    const opt = document.createElement("button");
    opt.className = `aprop-option aprop-option--${cls}${label === currentAprop ? " aprop-option--active" : ""}`;
    const dot = document.createElement("span");
    dot.className = "aprop-option-dot";
    opt.appendChild(dot);
    opt.appendChild(document.createTextNode(label));
    opt.addEventListener("click", (ev) => {
      ev.stopPropagation();
      applyReclassify(btn, label);
      closeApropDropdown();
    });
    dropdown.appendChild(opt);
  });

  document.body.appendChild(dropdown);

  const dropH = 4 * 36 + 10;
  let top = rect.bottom + 4;
  if (top + dropH > window.innerHeight) top = rect.top - dropH - 4;
  dropdown.style.top  = top + "px";
  dropdown.style.left = rect.left + "px";

  _apropDropdown = dropdown;
  setTimeout(() => document.addEventListener("click", onOutsideAprop, true), 0);
}

function closeApropDropdown() {
  if (!_apropDropdown) return;
  _apropDropdown.remove();
  _apropDropdown = null;
  document.removeEventListener("click", onOutsideAprop, true);
}

function onOutsideAprop(e) {
  if (_apropDropdown && !_apropDropdown.contains(e.target) && !e.target.closest(".aprop-btn")) {
    closeApropDropdown();
  }
}

async function applyReclassify(btn, newAprop) {
  const rowId = btn.dataset.rowid;
  const tr = fechamentoBody.querySelector(`tr[data-rowid="${rowId}"]`);
  if (!tr) return;

  const oldAprop = btn.dataset.aprop;
  if (oldAprop === newAprop) return;

  updateRowAprop(tr, btn, newAprop);

  try {
    const res = await fetch(`/expenses/${rowId}/apropriacao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apropriacao: newAprop }),
    });
    if (!res.ok) { updateRowAprop(tr, btn, oldAprop); return; }
    const exp = _currentExpenses.find(e => String(e.id) === String(rowId));
    if (exp) exp.apropriacao = newAprop;
    renderSummaryCards();
    applyFilters();
  } catch {
    updateRowAprop(tr, btn, oldAprop);
  }
}

function updateRowAprop(tr, btn, aprop) {
  tr.classList.remove("row-pedro", "row-marina", "row-casa", "row-meio");
  tr.classList.add(rowClass(aprop));
  btn.dataset.aprop = aprop;
  btn.querySelector(".aprop-btn-label").textContent = aprop;
}

// ===== BALANÇO =====

function renderBalancoTable(pagamentos) {
  const tbody = document.getElementById("pag-body");
  const wrap  = document.getElementById("pag-table-wrap");
  tbody.innerHTML = "";
  wrap.hidden = pagamentos.length === 0;

  pagamentos.forEach(p => {
    const aprop    = p.apropriacao || "Pedro";
    const abat     = computeAbatimento(p);
    const apropCls = aprop === "Pedro" ? "pedro" : aprop === "Casa" ? "casa" : "meio";
    const tr = document.createElement("tr");
    tr.dataset.pagid = p.id;
    tr.innerHTML = `
      <td>${p.data}</td>
      <td>${p.pagamento}</td>
      <td><span class="pag-aprop-${apropCls}">${aprop}</span></td>
      <td class="col-valor">${formatBRL(p.valor)}</td>
      <td class="col-valor pag-abatimento">${formatBRL(abat)}</td>
      <td class="col-del"><button class="edit-row-btn" title="Editar"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button><button class="del-row-btn" title="Excluir pagamento"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></td>
    `;
    tbody.appendChild(tr);
  });

  updatePagSortIndicators();
}

function computeAbatimento(pag) {
  const aprop  = pag.apropriacao || "Pedro";
  const pPedro = _currentProp?.found ? _currentProp.pct_pedro / 100 : 0.5;
  switch (aprop) {
    case "Pedro": return pag.valor;
    case "50/50": return pag.valor * 0.5;
    case "Casa":  return pag.valor * pPedro;
    default:      return pag.valor;
  }
}

function renderBalancoSaldo() {
  const totalEl = document.getElementById("balanco-total-val");
  const saldoEl = document.getElementById("balanco-saldo-val");
  if (!totalEl || !saldoEl) return;

  const pagTotal = _currentPagamentos.reduce((s, p) => s + computeAbatimento(p), 0);
  const saldo    = _totalMarina - pagTotal;

  totalEl.textContent = formatBRL(_totalMarina);
  saldoEl.textContent = formatBRL(Math.abs(saldo));
  const labelEl = document.querySelector(".balanco-saldo-label");
  if (Math.abs(saldo) < 0.01) {
    saldoEl.className = "balanco-saldo-val saldo-zerado";
    if (labelEl) labelEl.textContent = "Balanço Zerado";
  } else if (saldo < 0) {
    saldoEl.className = "balanco-saldo-val saldo-quitado";
    if (labelEl) labelEl.textContent = `Sobrepago — Crédito para ${nextMonthLabel(fechamentoSel.value)}`;
  } else {
    saldoEl.className = "balanco-saldo-val saldo-aberto";
    if (labelEl) labelEl.textContent = "Saldo em Aberto";
  }
}

function nextMonthLabel(mes) {
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  if (!mes) return "";
  const [name, year] = mes.split("/");
  const idx = months.findIndex(m => m.toLowerCase() === name.toLowerCase());
  if (idx === -1 || !year) return "";
  const ni = (idx + 1) % 12;
  const ny = ni === 0 ? parseInt(year) + 1 : parseInt(year);
  return `${months[ni]}/${ny}`;
}

async function addPagamento() {
  const mes   = fechamentoSel.value;
  const data  = document.getElementById("pag-data").value.trim();
  const desc  = document.getElementById("pag-desc").value.trim();
  const aprop = document.getElementById("pag-aprop").value;
  const valor = parseFloat(document.getElementById("pag-valor").value);
  const errEl = document.getElementById("pag-form-error");
  errEl.hidden = true;

  if (!mes)  { errEl.textContent = "Nenhum mês selecionado."; errEl.hidden = false; return; }
  if (data.replace(/\D/g, "").length < 8)
             { errEl.textContent = "Informe a data completa no formato DD/MM/AAAA."; errEl.hidden = false; return; }
  if (!desc) { errEl.textContent = "Informe a descrição.";    errEl.hidden = false; return; }
  if (isNaN(valor) || valor === 0)
             { errEl.textContent = "Informe um valor válido (pode ser negativo)."; errEl.hidden = false; return; }

  const btn = document.getElementById("btn-add-pag");
  btn.disabled = true;
  try {
    const res = await fetch("/pagamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, data, pagamento: desc, valor, apropriacao: aprop }),
    });
    if (!res.ok) { errEl.textContent = "Erro ao registrar."; errEl.hidden = false; return; }
    _currentPagamentos.push(await res.json());
    document.getElementById("pag-data").value  = "";
    document.getElementById("pag-desc").value  = "";
    document.getElementById("pag-valor").value = "";
    renderBalancoTable(_currentPagamentos);
    renderBalancoSaldo();
  } catch { errEl.textContent = "Erro de conexão."; errEl.hidden = false; }
  finally  { btn.disabled = false; }
}

function onPagEditBtnClick(e) {
  const btn = e.target.closest(".edit-row-btn");
  if (!btn) return;
  const tr  = btn.closest("tr");
  const pag = _currentPagamentos.find(p => String(p.id) === tr?.dataset.pagid);
  if (!pag) return;
  enterEditMode(pag);
}

function enterEditMode(pag) {
  _editingPagId = String(pag.id);
  document.getElementById("edit-pag-data").value  = pag.data;
  document.getElementById("edit-pag-desc").value  = pag.pagamento;
  document.getElementById("edit-pag-aprop").value = pag.apropriacao || "Pedro";
  document.getElementById("edit-pag-valor").value = pag.valor;
  document.getElementById("edit-pag-error").hidden = true;
  document.getElementById("edit-pag-overlay").hidden = false;
  document.getElementById("edit-pag-save").focus();
}

function exitEditMode() {
  _editingPagId = null;
  document.getElementById("edit-pag-overlay").hidden = true;
  document.getElementById("edit-pag-data").value   = "";
  document.getElementById("edit-pag-desc").value   = "";
  document.getElementById("edit-pag-valor").value  = "";
  document.getElementById("edit-pag-error").hidden = true;
}

async function saveEditPagamento() {
  const data  = document.getElementById("edit-pag-data").value.trim();
  const desc  = document.getElementById("edit-pag-desc").value.trim();
  const aprop = document.getElementById("edit-pag-aprop").value;
  const valor = parseFloat(document.getElementById("edit-pag-valor").value);
  const errEl = document.getElementById("edit-pag-error");
  errEl.hidden = true;

  if (data.replace(/\D/g, "").length < 8)
             { errEl.textContent = "Informe a data completa no formato DD/MM/AAAA."; errEl.hidden = false; return; }
  if (!desc) { errEl.textContent = "Informe a descrição.";     errEl.hidden = false; return; }
  if (isNaN(valor) || valor === 0)
             { errEl.textContent = "Informe um valor válido (pode ser negativo)."; errEl.hidden = false; return; }

  const btn = document.getElementById("edit-pag-save");
  btn.disabled = true;
  try {
    const res = await fetch(`/pagamentos/${_editingPagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, pagamento: desc, valor, apropriacao: aprop }),
    });
    if (!res.ok) { errEl.textContent = "Erro ao salvar."; errEl.hidden = false; return; }
    const idx = _currentPagamentos.findIndex(p => String(p.id) === _editingPagId);
    if (idx !== -1) _currentPagamentos[idx] = { ..._currentPagamentos[idx], data, pagamento: desc, valor, apropriacao: aprop };
    exitEditMode();
    renderBalancoTable(_currentPagamentos);
    renderBalancoSaldo();
  } catch { errEl.textContent = "Erro de conexão."; errEl.hidden = false; }
  finally  { btn.disabled = false; }
}

function onPagDelBtnClick(e) {
  const btn = e.target.closest(".del-row-btn");
  if (!btn) return;
  const tr    = btn.closest("tr");
  const pagId = tr?.dataset.pagid;
  const pag   = _currentPagamentos.find(p => String(p.id) === String(pagId));
  if (!pag) return;
  showConfirmModal(
    "Excluir pagamento",
    `Excluir "${pag.pagamento}" — ${formatBRL(pag.valor)}?`,
    () => execDeletePagamento(pagId, tr)
  );
}

async function execDeletePagamento(pagId, tr) {
  try {
    const res = await fetch(`/pagamentos/${pagId}`, { method: "DELETE" });
    if (!res.ok) return;
    tr.remove();
    _currentPagamentos = _currentPagamentos.filter(p => String(p.id) !== String(pagId));
    if (_currentPagamentos.length === 0) document.getElementById("pag-table-wrap").hidden = true;
    renderBalancoSaldo();
  } catch { /* silent */ }
}

function sortPagamentos(colKey) {
  const dir = _pagSortState.col === colKey && _pagSortState.dir === "asc" ? "desc" : "asc";
  _pagSortState = { col: colKey, dir };

  const tbody = document.getElementById("pag-body");
  const rows  = [...tbody.querySelectorAll("tr")];
  rows.sort((a, b) => {
    const pa = _currentPagamentos.find(p => String(p.id) === a.dataset.pagid);
    const pb = _currentPagamentos.find(p => String(p.id) === b.dataset.pagid);
    if (!pa || !pb) return 0;
    const va = colKey === "valor" ? pa[colKey] : String(pa[colKey]);
    const vb = colKey === "valor" ? pb[colKey] : String(pb[colKey]);
    const cmp = typeof va === "number" ? va - vb : va.localeCompare(vb, "pt-BR", { sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });
  rows.forEach(tr => tbody.appendChild(tr));
  updatePagSortIndicators();
}

function updatePagSortIndicators() {
  PAG_SORT_COLS.forEach(({ thId }) => {
    document.getElementById(thId).classList.remove("th-sorted-asc", "th-sorted-desc");
  });
  if (!_pagSortState.col) return;
  const cfg = PAG_SORT_COLS.find(c => c.key === _pagSortState.col);
  if (cfg) document.getElementById(cfg.thId).classList.add(
    _pagSortState.dir === "asc" ? "th-sorted-asc" : "th-sorted-desc"
  );
}

// ===== DELETE =====

btnZerarMes.addEventListener("click", () => {
  const mes = fechamentoSel.value;
  if (!mes) return;
  const count = _currentExpenses.length;
  showConfirmModal(
    "Zerar mês",
    `Apagar todas as ${count} despesa${count !== 1 ? "s" : ""} de ${mes}? Esta ação não pode ser desfeita.`,
    () => execDeleteMes(mes)
  );
});

async function execDeleteMes(mes) {
  try {
    const [res] = await Promise.all([
      fetch(`/despesas?mes=${encodeURIComponent(mes)}`,   { method: "DELETE" }),
      fetch(`/pagamentos?mes=${encodeURIComponent(mes)}`, { method: "DELETE" }),
    ]);
    if (!res.ok) return;
    fechamentoContent.hidden = true;
    btnZerarMes.hidden = true;
    _currentExpenses = [];
    const deletedIdx = _meses.indexOf(mes);
    _meses = _meses.filter(m => m !== mes);
    [...fechamentoSel.options].forEach(o => { if (o.value === mes) o.remove(); });
    fechamentoSel.value = "";
    if (_meses.length > 0) {
      _currentMesIdx = Math.min(deletedIdx, _meses.length - 1);
    } else {
      _currentMesIdx = -1;
    }
    updateMesNav();
    fechamentoEmpty.textContent = `Mês ${mes} zerado. Importe novamente para reinserir os dados.`;
    fechamentoEmpty.hidden = false;
  } catch { /* silent */ }
}

function onDelRowBtnClick(e) {
  const btn = e.target.closest(".del-row-btn");
  if (!btn) return;
  e.stopPropagation();
  const tr = btn.closest("tr");
  const rowId = tr?.dataset.rowid;
  const exp = _currentExpenses.find(ex => String(ex.id) === String(rowId));
  if (!exp) return;
  showConfirmModal(
    "Excluir despesa",
    `Excluir "${exp.despesa}" — ${formatBRL(exp.valor)}?`,
    () => execDeleteExpense(rowId, tr)
  );
}

async function execDeleteExpense(rowId, tr) {
  try {
    const res = await fetch(`/expenses/${rowId}`, { method: "DELETE" });
    if (!res.ok) return;
    tr.remove();
    _currentExpenses = _currentExpenses.filter(ex => String(ex.id) !== String(rowId));
    renderSummaryCards();
    if (_currentExpenses.length === 0) {
      fechamentoContent.hidden = true;
      btnZerarMes.hidden = true;
      fechamentoEmpty.textContent = "Nenhuma despesa restante para este mês.";
      fechamentoEmpty.hidden = false;
    }
  } catch { /* silent */ }
}

// ===== SALARY EDIT MODAL =====

function openSalEditModal(mes, pedro, marina) {
  _salEditingMes = mes;
  document.getElementById("edit-sal-title").textContent = `Editar salário — ${mes}`;
  document.getElementById("edit-sal-pedro").value  = pedro;
  document.getElementById("edit-sal-marina").value = marina;
  document.getElementById("edit-sal-error").hidden  = true;
  document.getElementById("edit-sal-overlay").hidden = false;
  document.getElementById("edit-sal-pedro").focus();
}

function closeSalEditModal() {
  _salEditingMes = null;
  document.getElementById("edit-sal-overlay").hidden = true;
  document.getElementById("edit-sal-pedro").value   = "";
  document.getElementById("edit-sal-marina").value  = "";
  document.getElementById("edit-sal-error").hidden  = true;
}

async function saveSalEdit() {
  const mes    = _salEditingMes;
  const pedro  = parseFloat(document.getElementById("edit-sal-pedro").value);
  const marina = parseFloat(document.getElementById("edit-sal-marina").value);
  const errEl  = document.getElementById("edit-sal-error");
  errEl.hidden = true;

  if (isNaN(pedro)  || pedro  < 0) { errEl.textContent = "Informe o salário de Pedro.";  errEl.hidden = false; return; }
  if (isNaN(marina) || marina < 0) { errEl.textContent = "Informe o salário de Marina."; errEl.hidden = false; return; }

  const btn = document.getElementById("edit-sal-save");
  btn.disabled = true;
  try {
    const res = await fetch("/salarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, pedro, marina }),
    });
    if (!res.ok) { errEl.textContent = "Erro ao salvar."; errEl.hidden = false; return; }
    closeSalEditModal();
    _salariosLoaded = false;
    await loadSalarios();
  } catch { errEl.textContent = "Erro de conexão."; errEl.hidden = false; }
  finally  { btn.disabled = false; }
}

// ===== CONFIRM MODAL =====

const confirmOverlay = document.getElementById("confirm-modal-overlay");
const confirmTitle   = document.getElementById("confirm-modal-title");
const confirmDesc    = document.getElementById("confirm-modal-desc");
const confirmCancel  = document.getElementById("confirm-modal-cancel");
const confirmOk      = document.getElementById("confirm-modal-ok");

let _confirmCallback = null;

confirmCancel.addEventListener("click", closeConfirmModal);
confirmOk.addEventListener("click", () => {
  if (_confirmCallback) _confirmCallback();
  closeConfirmModal();
});
confirmOverlay.addEventListener("click", (e) => {
  if (e.target === confirmOverlay) closeConfirmModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmOverlay.hidden) closeConfirmModal();
});

function showConfirmModal(title, desc, onConfirm) {
  confirmTitle.textContent = title;
  confirmDesc.textContent  = desc;
  _confirmCallback = onConfirm;
  confirmOverlay.hidden = false;
  confirmOk.focus();
}

function closeConfirmModal() {
  confirmOverlay.hidden = true;
  _confirmCallback = null;
}

// ===== SALÁRIOS =====

const salMonthSel  = document.getElementById("sal-month");
const salYearSel   = document.getElementById("sal-year");
const salPedroInp  = document.getElementById("sal-pedro");
const salMarinaInp = document.getElementById("sal-marina");
const btnSalvar    = document.getElementById("btn-salvar-salario");
const salContent   = document.getElementById("sal-content");
const salEmpty     = document.getElementById("sal-empty");
const salLoading   = document.getElementById("sal-loading");
const salBody      = document.getElementById("sal-body");
const salSummaryEl = document.getElementById("sal-summary");
const salFormError = document.getElementById("sal-form-error");
const salFormOk    = document.getElementById("sal-form-success");

// Populate year dropdown
(function () {
  const y0 = new Date().getFullYear();
  for (let y = y0; y >= y0 - 4; y--) {
    const o = document.createElement("option");
    o.value = y; o.textContent = y;
    salYearSel.appendChild(o);
  }
})();

let _salariosLoaded = false;
let _salEditingMes  = null;

function initSalarios() {
  if (_salariosLoaded) return;
  _salariosLoaded = true;
  loadSalarios();
}

async function loadSalarios() {
  salLoading.hidden = false;
  salContent.hidden = true;
  salEmpty.hidden   = true;
  salSummaryEl.hidden = true;
  try {
    const res  = await fetch("/salarios");
    const data = await res.json();
    salLoading.hidden = true;
    if (!data.length) {
      salEmpty.hidden = false;
      return;
    }
    renderSalarios(data);
    salContent.hidden   = false;
    salSummaryEl.hidden = false;
  } catch {
    salLoading.hidden = true;
    salEmpty.textContent = "Erro ao carregar salários.";
    salEmpty.hidden = false;
  }
}

btnSalvar.addEventListener("click", saveSalario);
document.getElementById("edit-sal-save").addEventListener("click", saveSalEdit);
document.getElementById("edit-sal-cancel").addEventListener("click", closeSalEditModal);
document.getElementById("edit-sal-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("edit-sal-overlay")) closeSalEditModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("edit-sal-overlay").hidden) closeSalEditModal();
});

async function saveSalario() {
  const mes    = salMonthSel.value && salYearSel.value
    ? `${salMonthSel.value}/${salYearSel.value}` : null;
  const pedro  = parseFloat(salPedroInp.value);
  const marina = parseFloat(salMarinaInp.value);

  salFormError.hidden = true;
  salFormOk.hidden    = true;

  if (!mes) {
    salFormError.textContent = "Selecione o mês e o ano.";
    salFormError.hidden = false; return;
  }
  if (isNaN(pedro) || pedro < 0) {
    salFormError.textContent = "Informe o salário de Pedro.";
    salFormError.hidden = false; return;
  }
  if (isNaN(marina) || marina < 0) {
    salFormError.textContent = "Informe o salário de Marina.";
    salFormError.hidden = false; return;
  }

  btnSalvar.disabled    = true;
  btnSalvar.textContent = "Salvando…";
  try {
    const res = await fetch("/salarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, pedro, marina }),
    });
    if (!res.ok) {
      const d = await res.json();
      salFormError.textContent = d.detail || "Erro ao salvar.";
      salFormError.hidden = false; return;
    }
    salFormOk.textContent = `Salário de ${mes} salvo com sucesso.`;
    salFormOk.hidden = false;
    clearSalForm();
    _salariosLoaded = false;
    await loadSalarios();
  } catch {
    salFormError.textContent = "Erro de conexão.";
    salFormError.hidden = false;
  } finally {
    btnSalvar.disabled    = false;
    btnSalvar.textContent = "Salvar";
  }
}

function clearSalForm() {
  salMonthSel.value  = "";
  salYearSel.value   = "";
  salPedroInp.value  = "";
  salMarinaInp.value = "";
}

function renderSalarios(salarios) {
  // salarios sorted oldest → newest (from server)
  const rows = computeRolling(salarios);

  // Summary cards from the most recent entry
  renderSalSummary(rows[rows.length - 1]);

  // Table newest → oldest
  salBody.innerHTML = "";
  [...rows].reverse().forEach(row => {
    const tr = document.createElement("tr");
    tr.dataset.mes    = row.mes;
    tr.dataset.pedro  = row.pedro;
    tr.dataset.marina = row.marina;

    const nLabel = row.windowSize < 12 ? `${row.windowSize}m` : "12m";
    tr.innerHTML = `
      <td>${row.mes}</td>
      <td class="col-valor">${formatBRL(row.pedro)}</td>
      <td class="col-valor">${formatBRL(row.marina)}</td>
      <td class="col-valor sal-media" title="Média dos últimos ${row.windowSize} meses">${formatBRL(row.avgPedro)} <small class="sal-window">(${nLabel})</small></td>
      <td class="col-valor sal-media" title="Média dos últimos ${row.windowSize} meses">${formatBRL(row.avgMarina)} <small class="sal-window">(${nLabel})</small></td>
      <td class="col-valor sal-pct-pedro">${formatPct(row.pctPedro)}</td>
      <td class="col-valor sal-pct-marina">${formatPct(row.pctMarina)}</td>
      <td class="col-del"><button class="edit-row-btn" title="Editar"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button><button class="del-row-btn" title="Excluir mês"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></td>
    `;

    tr.querySelector(".edit-row-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openSalEditModal(tr.dataset.mes, parseFloat(tr.dataset.pedro), parseFloat(tr.dataset.marina));
    });

    tr.querySelector(".del-row-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      showConfirmModal(
        "Excluir salário",
        `Excluir os salários de ${tr.dataset.mes}?`,
        () => execDeleteSalario(tr.dataset.mes)
      );
    });

    salBody.appendChild(tr);
  });
}

function renderSalSummary(latest) {
  salSummaryEl.innerHTML = "";
  const nLabel = latest.windowSize < 12 ? `últimos ${latest.windowSize} meses` : "12 meses";

  [
    { cls: "pedro",  label: "Pedro",  avg: latest.avgPedro,  pct: latest.pctPedro  },
    { cls: "marina", label: "Marina", avg: latest.avgMarina, pct: latest.pctMarina },
  ].forEach(({ cls, label, avg, pct }) => {
    const card = document.createElement("div");
    card.className = `summary-card summary-card--${cls}`;
    card.innerHTML = `
      <div class="summary-card__label">${label} — Média ${nLabel}</div>
      <div class="summary-card__value">${formatBRL(avg)}</div>
      <div class="summary-card__sub">${formatPct(pct)} das despesas Casa</div>
    `;
    salSummaryEl.appendChild(card);
  });
}

function fillSalForm(mes, pedro, marina) {
  const [m, y] = mes.split("/");
  salMonthSel.value  = m;
  salYearSel.value   = y;
  salPedroInp.value  = pedro;
  salMarinaInp.value = marina;
  _salEditingMes     = mes;

  salBody.querySelectorAll("tr").forEach(tr =>
    tr.classList.toggle("sal-row-editing", tr.dataset.mes === mes)
  );
  salFormError.hidden = true;
  salFormOk.hidden    = true;

  document.querySelector(".sal-form-card")
    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function execDeleteSalario(mes) {
  try {
    const res = await fetch(`/salarios?mes=${encodeURIComponent(mes)}`, { method: "DELETE" });
    if (!res.ok) return;
    if (_salEditingMes === mes) clearSalForm();
    _salariosLoaded = false;
    await loadSalarios();
  } catch { /* silent */ }
}

function computeRolling(salarios) {
  return salarios.map((s, idx) => {
    const win       = salarios.slice(Math.max(0, idx - 11), idx + 1);
    const avgPedro  = win.reduce((sum, r) => sum + r.pedro,  0) / win.length;
    const avgMarina = win.reduce((sum, r) => sum + r.marina, 0) / win.length;
    const total     = avgPedro + avgMarina;
    return {
      ...s,
      avgPedro,
      avgMarina,
      pctPedro:   total > 0 ? avgPedro  / total * 100 : 50,
      pctMarina:  total > 0 ? avgMarina / total * 100 : 50,
      windowSize: win.length,
    };
  });
}

function formatPct(v) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(v) + "%";
}

// ===== UTILS =====

// Returns [group, lowerName]: group 0 = conta corrente, 1 = credit card
function idSortPair(id) {
  const l = (id || "").toLowerCase();
  const isCC = l.includes("extrato") || l.includes("conta corrente") || l.includes("cc");
  return [isCC ? 0 : 1, l];
}

function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
