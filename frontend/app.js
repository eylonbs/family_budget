// ─── API HELPERS ─────────────────────────────────────────────────────────────

let loadingOverlay = null;

function showLoading(msg) {
  if (!loadingOverlay) {
    loadingOverlay = document.createElement("div");
    loadingOverlay.id = "loadingOverlay";
    loadingOverlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999";
    loadingOverlay.innerHTML =
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:2rem 2.5rem;text-align:center;box-shadow:var(--shadow-lg)">' +
      '<div style="font-size:1.5rem;margin-bottom:0.5rem">⏳</div>' +
      '<div id="loadingMsg" style="font-size:var(--text-sm);color:var(--text)"></div></div>';
    document.body.appendChild(loadingOverlay);
  }
  document.getElementById("loadingMsg").textContent = msg;
  loadingOverlay.style.display = "flex";
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "none";
}

async function api(path, opts = {}, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(path, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...opts.headers },
        signal: controller.signal,
        ...opts,
      });
      clearTimeout(timeout);
      hideLoading();
      if (res.status === 401) {
        showLogin();
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || "Request failed");
      }
      if (res.headers.get("content-type")?.includes("json")) {
        return res.json();
      }
      return res;
    } catch (e) {
      if (e.message === "Unauthorized") throw e;
      if (attempt < retries) {
        showLoading("Server is waking up... hang tight (" + attempt + "/" + retries + ")");
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        hideLoading();
        throw e;
      }
    }
  }
}

// ─── STATE ───────────────────────────────────────────────────────────────────

let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let currentType = "expense";
let currentFilter = "all";
let donutChart = null;
let cachedTransactions = [];
let cachedSummary = {};
let cachedBudget = {};
let budgetSaveTimer = null;

const CAT_COLORS = {
  "🛒 Food & Grocery": "#01696f",
  "🏠 Housing": "#437a22",
  "🚗 Transport": "#d19900",
  "💊 Health": "#a12c7b",
  "👗 Clothing": "#964219",
  "🎮 Entertainment": "#da7101",
  "📱 Subscriptions": "#006494",
  "🍽️ Dining Out": "#7a39bb",
  "✈️ Travel": "#a13544",
  "📚 Education": "#4f98a3",
  "💰 Salary": "#6daa45",
  "🎁 Gift/Bonus": "#e8af34",
  "📦 Other": "#797876",
};

const TIPS = [
  "Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
  "Dining out is your fastest-growing cost. Try meal prepping 2 days a week.",
  "Review your subscriptions — cancel what you haven't used this month.",
  "Set a 'no-spend weekend' once a month to boost savings.",
  "Automate savings: transfer a fixed amount on payday before spending.",
  "Compare your grocery bill — switching stores can save 15-20%.",
  "Entertainment budget exceeded. Try free options: parks, libraries, hiking.",
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getKey() {
  return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
}

function fmt(n) {
  return "₪" + n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

function showLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("appRoot").style.display = "none";
  document.getElementById("pinInput").value = "";
  document.getElementById("loginError").textContent = "";
  document.getElementById("pinInput").focus();
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appRoot").style.display = "grid";
  renderAll();
}

async function checkAuth() {
  try {
    const data = await api("/api/auth/check");
    if (data.authenticated) {
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function doLogin() {
  const pin = document.getElementById("pinInput").value;
  if (!pin) return;
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
    showApp();
  } catch {
    document.getElementById("loginError").textContent = "Wrong PIN. Try again.";
    document.getElementById("pinInput").value = "";
    document.getElementById("pinInput").focus();
  } finally {
    btn.disabled = false;
  }
}

async function doLogout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  showLogin();
}

// ─── DATA FETCHING ───────────────────────────────────────────────────────────

async function fetchData() {
  const key = getKey();
  const [transactions, summary, budget] = await Promise.all([
    api(`/api/transactions?month=${key}`),
    api(`/api/summary?month=${key}`),
    api(`/api/budget-goals?month=${key}`),
  ]);
  cachedTransactions = transactions;
  cachedSummary = summary;
  cachedBudget = budget;
}

// ─── MONTH NAV ───────────────────────────────────────────────────────────────

function changeMonth(d) {
  currentMonth += d;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderAll();
}

function updateMonthLabel() {
  document.getElementById("monthLabel").textContent = MONTHS[currentMonth] + " " + currentYear;
}

// ─── TYPE TOGGLE ─────────────────────────────────────────────────────────────

function setType(t) {
  currentType = t;
  document.getElementById("btnExpense").className = "type-btn" + (t === "expense" ? " active-expense" : "");
  document.getElementById("btnIncome").className = "type-btn" + (t === "income" ? " active-income" : "");
  const catSel = document.getElementById("txCategory");
  catSel.value = t === "income" ? "💰 Salary" : "🛒 Food & Grocery";
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  document.querySelector(`.chip[data-filter="${f}"]`).classList.add("active");
  renderTransactions();
}

// ─── ADD TRANSACTION ─────────────────────────────────────────────────────────

async function addTransaction() {
  const desc = document.getElementById("txDesc").value.trim();
  const amount = parseFloat(document.getElementById("txAmount").value);
  const date = document.getElementById("txDate").value;
  const category = document.getElementById("txCategory").value;
  const person = document.getElementById("txPerson").value;
  const recurring = document.getElementById("txRecurring").checked;

  if (!desc) { alert("Please enter a description."); return; }
  if (!amount || amount <= 0) { alert("Please enter a valid amount."); return; }
  if (!date) { alert("Please pick a date."); return; }

  const btn = document.getElementById("addTxBtn");
  btn.disabled = true;
  try {
    await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        description: desc,
        amount,
        type: currentType,
        category,
        paid_by: person,
        date,
        recurring,
      }),
    });

    document.getElementById("txDesc").value = "";
    document.getElementById("txAmount").value = "";
    document.getElementById("txRecurring").checked = false;

    await renderAll();
  } catch (e) {
    alert("Error adding transaction: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

async function deleteTx(id) {
  try {
    await api(`/api/transactions/${id}`, { method: "DELETE" });
    await renderAll();
  } catch (e) {
    alert("Error deleting: " + e.message);
  }
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function updateKPIs() {
  const s = cachedSummary;

  document.getElementById("kpiIncome").textContent = fmt(s.income || 0);
  document.getElementById("kpiIncomeCount").textContent = (s.income_count || 0) + " entries";
  document.getElementById("kpiExpenses").textContent = fmt(s.expenses || 0);
  document.getElementById("kpiExpensesCount").textContent = (s.expense_count || 0) + " entries";

  const balance = s.balance || 0;
  const balEl = document.getElementById("kpiBalance");
  balEl.textContent = fmt(balance);
  balEl.className = "kpi-value " + (balance >= 0 ? "green" : "red");

  document.getElementById("kpiSavings").textContent = (s.savings_rate || 0).toFixed(1) + "%";
  document.getElementById("kpiSavingsAbs").textContent = fmt(Math.max(0, s.balance || 0)) + " saved";

  document.getElementById("whoEylon").textContent = fmt(s.eylon_spent || 0);
  document.getElementById("whoRonny").textContent = fmt(s.ronny_spent || 0);

  document.getElementById("txCount").textContent = (s.total_transactions || 0) + " total";

  updateBudgetBar();
  checkBudgetOverruns();
  updateTip();
}

function updateBudgetBar() {
  const budgetTotal = cachedBudget.monthly_budget || 0;
  const expenses = cachedSummary.expenses || 0;

  if (budgetTotal > 0) {
    const pct = Math.min((expenses / budgetTotal) * 100, 100);
    const fill = document.getElementById("budgetBarFill");
    fill.style.width = pct + "%";
    fill.className = "budget-bar-fill " + (pct < 70 ? "safe" : pct < 90 ? "warn" : "over");
    document.getElementById("budgetBarLabel").textContent = fmt(expenses) + " of " + fmt(budgetTotal);
    const rem = budgetTotal - expenses;
    document.getElementById("budgetBarSub").textContent =
      rem >= 0
        ? `${fmt(rem)} remaining this month`
        : `⚠️ Over budget by ${fmt(Math.abs(rem))}`;
  } else {
    document.getElementById("budgetBarLabel").textContent = "No budget set";
    document.getElementById("budgetBarFill").style.width = "0%";
    document.getElementById("budgetBarSub").textContent = "Set your monthly budget in the sidebar →";
  }
}

function checkBudgetOverruns() {
  const limits = cachedBudget.category_limits || {};
  const catTotals = cachedSummary.category_totals || {};
  let html = "";

  for (const [cat, limit] of Object.entries(limits)) {
    if (limit <= 0) continue;
    const spent = catTotals[cat] || 0;
    const pct = (spent / limit) * 100;
    if (pct >= 80) {
      const color = pct >= 100 ? "var(--error)" : "var(--gold)";
      const bg = pct >= 100 ? "var(--error-hl)" : "var(--gold-hl)";
      html += `<div style="font-size:var(--text-xs);margin-bottom:6px;padding:6px 10px;border-radius:var(--radius-sm);background:${bg};color:${color}">
        ${pct >= 100 ? "❌" : "⚠️"} <strong>${escHtml(cat)}</strong>: ${fmt(spent)} / ${fmt(limit)} (${pct.toFixed(0)}%)
      </div>`;
    }
  }
  document.getElementById("budgetOverruns").innerHTML = html;
}

function updateTip() {
  const expenses = cachedSummary.expenses || 0;
  const tipIdx = Math.floor(expenses / 500) % TIPS.length;
  document.getElementById("tipText").textContent = TIPS[tipIdx];
}

// ─── CATEGORY CHART ──────────────────────────────────────────────────────────

function updateCategoryChart() {
  const catTotals = cachedSummary.category_totals || {};
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  const colors = labels.map((l) => CAT_COLORS[l] || "#797876");

  const ctx = document.getElementById("donutChart").getContext("2d");
  if (donutChart) donutChart.destroy();

  donutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) =>
              " " + c.label + ": " + fmt(c.raw) + " (" + ((c.raw / total) * 100 || 0).toFixed(1) + "%)",
          },
        },
      },
    },
  });

  const catList = document.getElementById("catList");
  if (!sorted.length) {
    catList.innerHTML =
      '<div style="font-size:var(--text-xs);color:var(--text-muted);text-align:center;padding:var(--space-4)">No expenses yet</div>';
    return;
  }
  catList.innerHTML = sorted
    .slice(0, 6)
    .map(
      ([cat, val]) => `
    <div class="cat-item">
      <div class="cat-dot" style="background:${CAT_COLORS[cat] || "#797876"}"></div>
      <div class="cat-name">${escHtml(cat)}</div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${total > 0 ? (val / total) * 100 : 0}%;background:${CAT_COLORS[cat] || "#797876"}"></div>
      </div>
      <div class="cat-amount">${fmt(val)}</div>
    </div>
  `
    )
    .join("");
}

// ─── TRANSACTIONS LIST ───────────────────────────────────────────────────────

function renderTransactions() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const tx = cachedTransactions.filter((t) => {
    if (currentFilter === "income" && t.type !== "income") return false;
    if (currentFilter === "expense" && t.type !== "expense") return false;
    if (search && !t.description.toLowerCase().includes(search) && !t.category.toLowerCase().includes(search))
      return false;
    return true;
  });

  const list = document.getElementById("txList");
  if (!tx.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">💸</div><p>No transactions found.</p></div>';
    return;
  }

  list.innerHTML = tx
    .map((t) => {
      const color = CAT_COLORS[t.category] || "#797876";
      const bg = color + "22";
      const emoji = t.category.split(" ")[0];
      const recurBadge = t.recurring ? '<span class="badge badge-recurring">🔁 recurring</span>' : "";
      const incBadge = t.type === "income" ? '<span class="badge badge-income">income</span>' : "";
      return `<div class="tx-item">
      <div class="tx-emoji" style="background:${bg};color:${color}">${emoji}</div>
      <div class="tx-info">
        <div class="tx-name">${escHtml(t.description)} ${recurBadge}${incBadge}</div>
        <div class="tx-meta">${escHtml(t.category)} · ${t.date} · ${t.paid_by}</div>
      </div>
      <div class="tx-amount ${t.type}">${t.type === "expense" ? "-" : "+"}${fmt(t.amount)}</div>
      <button class="tx-delete" data-id="${t.id}" aria-label="Delete transaction">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
      </button>
    </div>`;
    })
    .join("");
}

// ─── BUDGET GOALS ────────────────────────────────────────────────────────────

function loadBudgetInputs() {
  const b = cachedBudget;
  document.getElementById("budgetTotal").value = b.monthly_budget || "";
  document.getElementById("budgetFood").value = (b.category_limits || {})["🛒 Food & Grocery"] || "";
  document.getElementById("budgetDining").value = (b.category_limits || {})["🍽️ Dining Out"] || "";
  document.getElementById("budgetEntertainment").value = (b.category_limits || {})["🎮 Entertainment"] || "";
  document.getElementById("budgetTransport").value = (b.category_limits || {})["🚗 Transport"] || "";
}

function debouncedSaveBudgets() {
  clearTimeout(budgetSaveTimer);
  budgetSaveTimer = setTimeout(saveBudgets, 600);
}

async function saveBudgets() {
  const body = {
    month: getKey(),
    monthly_budget: parseFloat(document.getElementById("budgetTotal").value) || 0,
    savings_target: 0,
    category_limits: {
      "🛒 Food & Grocery": parseFloat(document.getElementById("budgetFood").value) || 0,
      "🍽️ Dining Out": parseFloat(document.getElementById("budgetDining").value) || 0,
      "🎮 Entertainment": parseFloat(document.getElementById("budgetEntertainment").value) || 0,
      "🚗 Transport": parseFloat(document.getElementById("budgetTransport").value) || 0,
    },
  };
  try {
    await api("/api/budget-goals", { method: "PUT", body: JSON.stringify(body) });
    cachedBudget = {
      month: body.month,
      monthly_budget: body.monthly_budget,
      savings_target: body.savings_target,
      category_limits: body.category_limits,
    };
    updateBudgetBar();
    checkBudgetOverruns();
  } catch (e) {
    console.error("Failed to save budgets", e);
  }
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────

function exportCSV() {
  const key = getKey();
  window.open(`/api/export?month=${key}`, "_blank");
}

// ─── RENDER ALL ──────────────────────────────────────────────────────────────

async function renderAll() {
  updateMonthLabel();
  try {
    await fetchData();
  } catch {
    return;
  }
  loadBudgetInputs();
  updateKPIs();
  updateCategoryChart();
  renderTransactions();
}

// ─── DARK MODE ───────────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem("theme");
  let theme = saved || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
  setTimeout(() => updateCategoryChart(), 50);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggle");
  btn.innerHTML =
    theme === "dark"
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initTheme();

  // Auth
  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.getElementById("pinInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("logoutBtn").addEventListener("click", doLogout);

  // Month nav
  document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => changeMonth(1));

  // Type toggle
  document.getElementById("btnExpense").addEventListener("click", () => setType("expense"));
  document.getElementById("btnIncome").addEventListener("click", () => setType("income"));

  // Add transaction
  document.getElementById("addTxBtn").addEventListener("click", addTransaction);

  // Delete transaction (event delegation)
  document.getElementById("txList").addEventListener("click", (e) => {
    const btn = e.target.closest(".tx-delete");
    if (btn) deleteTx(parseInt(btn.dataset.id));
  });

  // Search
  document.getElementById("searchInput").addEventListener("input", renderTransactions);

  // Filter chips
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => setFilter(chip.dataset.filter));
  });

  // Budget inputs
  ["budgetTotal", "budgetFood", "budgetDining", "budgetEntertainment", "budgetTransport"].forEach((id) => {
    document.getElementById(id).addEventListener("input", debouncedSaveBudgets);
  });

  // Export
  document.getElementById("exportBtn").addEventListener("click", exportCSV);

  // Theme toggle
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // Set default date
  document.getElementById("txDate").valueAsDate = new Date();

  // Check auth
  checkAuth();
});
