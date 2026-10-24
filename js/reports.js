/* ==========================================================================
   Takarivo — reports.js
   Purpose: Connects the Reports page to real data from the Accounts and
   Transactions APIs. Calculates Income, Expenses, Net Savings, Category
   spending, Account spending (via the Account filter), and Monthly
   trends — replacing the hardcoded demo arrays from Part 29. Filters
   (Date/Account/Category) now actually recalculate everything.
   Requires Chart.js to be loaded before this file.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {

    const sb = window.TakarivoSupabase;
    if (!sb) {
        console.error("Takarivo: Supabase client not initialized. Check script load order.");
        return;
    }

    const API_BASE = "/.netlify/functions";

    /* ==========================================================================
       Element references
       ========================================================================== */
    const filterDate = document.getElementById("report-filter-date");
    const filterAccount = document.getElementById("report-filter-account");
    const filterCategory = document.getElementById("report-filter-category");
    const resetBtn = document.getElementById("report-filter-reset-btn");

    const categoryTableBody = document.getElementById("category-report-table-body");

    /* ==========================================================================
       API helper
       ========================================================================== */
    async function apiRequest(method, path) {
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error("You're not signed in. Please sign in again.");

        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: { Authorization: `Bearer ${token}` },
        });

        let json;
        try {
            json = await response.json();
        } catch {
            throw new Error("Unexpected response from the server.");
        }

        if (!response.ok || !json.success) {
            throw new Error(json.message || "Something went wrong.");
        }

        return json.data;
    }

    const formatCurrency = (amount) => `৳${Math.round(Number(amount)).toLocaleString()}`;

    /* ==========================================================================
       Load accounts + transactions
       ========================================================================== */
    let accounts = [];
    let transactions = [];
    let accountsById = {};

    try {
        [accounts, transactions] = await Promise.all([
            apiRequest("GET", "/accounts"),
            apiRequest("GET", "/transactions"),
        ]);
        accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));
    } catch (err) {
        console.error("Failed to load report data:", err.message);
        if (categoryTableBody) {
            categoryTableBody.innerHTML = `<tr class="table-status-row"><td colspan="5"><p class="help-text is-error">Couldn't load data: ${err.message}</p></td></tr>`;
        }
        return;
    }

    /* ==========================================================================
       Populate filter dropdowns from real data
       ========================================================================== */
    accounts.forEach((account) => {
        const option = document.createElement("option");
        option.value = account.id;
        option.textContent = account.name;
        filterAccount.appendChild(option);
    });

    const categoriesPresent = [...new Set(transactions.map((t) => t.category))].sort();
    categoriesPresent.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        filterCategory.appendChild(option);
    });

    // Default the date filter to the current month if not already set
    if (filterDate && !filterDate.value) {
        filterDate.value = new Date().toISOString().slice(0, 7);
    }

    /* ==========================================================================
       Filtering
       Account and Category filters apply everywhere (KPIs, table, and
       both charts) — that's "Account spending" / "Category spending" in
       practice. The Date (month) filter only narrows the KPI cards and
       the category table to a single month; the trend charts always
       show multiple months, since a one-month trend isn't meaningful —
       they still respect Account/Category, just not the month picker.
       ========================================================================== */
    function applyAccountCategoryFilters(txns) {
        const accountValue = filterAccount.value;
        const categoryValue = filterCategory.value;

        return txns.filter((t) => {
            const matchesAccount = !accountValue || t.account_id === accountValue;
            const matchesCategory = !categoryValue || t.category === categoryValue;
            return matchesAccount && matchesCategory;
        });
    }

    function applyMonthFilter(txns) {
        const monthValue = filterDate.value; // "YYYY-MM"
        if (!monthValue) return txns;
        return txns.filter((t) => t.date.startsWith(monthValue));
    }

    /* ==========================================================================
       KPIs — from the month + account + category filtered set
       ========================================================================== */
    function updateKPIs(filteredForMonth) {
        const totalIncome = filteredForMonth
            .filter((t) => t.transaction_type === "income")
            .reduce((sum, t) => sum + Number(t.amount), 0);
        const totalExpenses = filteredForMonth
            .filter((t) => t.transaction_type === "expense")
            .reduce((sum, t) => sum + Number(t.amount), 0);
        const netSavings = totalIncome - totalExpenses;

        document.getElementById("kpi-total-income").textContent = formatCurrency(totalIncome);
        document.getElementById("kpi-total-expenses").textContent = formatCurrency(totalExpenses);
        document.getElementById("kpi-net-savings").textContent = formatCurrency(netSavings);
        document.getElementById("kpi-transaction-count").textContent = String(filteredForMonth.length);
    }

    /* ==========================================================================
       Category table — Category / Income / Expenses / Net / Percentage,
       built from the month + account + category filtered set
       ========================================================================== */
    function updateCategoryTable(filteredForMonth) {
        const totals = {}; // category -> { income, expenses }

        filteredForMonth.forEach((t) => {
            if (!totals[t.category]) totals[t.category] = { income: 0, expenses: 0 };
            if (t.transaction_type === "income") totals[t.category].income += Number(t.amount);
            if (t.transaction_type === "expense") totals[t.category].expenses += Number(t.amount);
        });

        const totalIncomeAll = Object.values(totals).reduce((sum, v) => sum + v.income, 0);
        const totalExpensesAll = Object.values(totals).reduce((sum, v) => sum + v.expenses, 0);

        const rows = Object.entries(totals).sort((a, b) => (b[1].income + b[1].expenses) - (a[1].income + a[1].expenses));

        if (rows.length === 0) {
            categoryTableBody.innerHTML = `<tr class="table-status-row"><td colspan="5"><p class="help-text">No transactions match these filters.</p></td></tr>`;
            return;
        }

        categoryTableBody.innerHTML = "";
        rows.forEach(([category, { income, expenses }]) => {
            const net = income - expenses;
            const isIncomeCategory = income > 0 && expenses === 0;
            const percentage = isIncomeCategory
                ? (totalIncomeAll ? (income / totalIncomeAll) * 100 : 0)
                : (totalExpensesAll ? (expenses / totalExpensesAll) * 100 : 0);

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><span class="category-tag" data-category="${category}">${category}</span></td>
                <td${income > 0 ? ' class="amount income"' : ""}>${formatCurrency(income)}</td>
                <td${expenses > 0 ? ' class="amount expense"' : ""}>${formatCurrency(expenses)}</td>
                <td class="amount ${net >= 0 ? "income" : "expense"}">${net >= 0 ? "" : "-"}${formatCurrency(Math.abs(net))}</td>
                <td>${percentage.toFixed(1)}%</td>
            `;
            categoryTableBody.appendChild(row);
        });
    }

    /* ==========================================================================
       Charts
       ========================================================================== */
    const colors = {
        income: "#385898",
        expenses: "#D93025",
        savings: "#1B8A5A",
        muted: "#666A72",
        border: "#D0D3D6",
    };

    const categoryColors = {
        Food: "#B5651D",
        Housing: "#385898",
        Transport: "#2D5FA3",
        Shopping: "#7A3FA0",
        Bills: "#B4302A",
        Entertainment: "#A32D6E",
        Other: "#666A72",
    };

    Chart.defaults.font.family = "'Segoe UI', 'Segoe UI Historic', Arial, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = colors.muted;

    let incomeExpensesChart = null;
    let expenseBreakdownChart = null;
    let savingsTrendChart = null;

    /* Monthly trends — last 6 months ending at the current month, from
       transactions filtered by Account/Category (but NOT by the month
       picker, since a trend needs more than one month to mean anything) */
    function buildMonthlyTrends(txns) {
        const months = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short" }) });
        }

        const income = months.map(() => 0);
        const expenses = months.map(() => 0);

        txns.forEach((t) => {
            const monthKey = t.date.slice(0, 7);
            const idx = months.findIndex((m) => m.key === monthKey);
            if (idx === -1) return;
            if (t.transaction_type === "income") income[idx] += Number(t.amount);
            if (t.transaction_type === "expense") expenses[idx] += Number(t.amount);
        });

        const savings = income.map((inc, i) => inc - expenses[i]);
        return { labels: months.map((m) => m.label), income, expenses, savings };
    }

    function renderIncomeExpensesChart(trend) {
        const canvas = document.getElementById("income-vs-expenses-chart");
        if (!canvas) return;

        if (incomeExpensesChart) incomeExpensesChart.destroy();

        incomeExpensesChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: trend.labels,
                datasets: [
                    { label: "Income", data: trend.income, backgroundColor: colors.income, borderRadius: 4, maxBarThickness: 28 },
                    { label: "Expenses", data: trend.expenses, backgroundColor: colors.expenses, borderRadius: 4, maxBarThickness: 28 },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "top", align: "end", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 16 } },
                    tooltip: {
                        backgroundColor: "#FFFFFF", titleColor: "#1C1E21", bodyColor: "#1C1E21",
                        borderColor: colors.border, borderWidth: 1, padding: 10,
                        callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` },
                    },
                },
                scales: {
                    x: { grid: { display: false }, border: { color: colors.border } },
                    y: { beginAtZero: true, grid: { color: colors.border }, border: { display: false }, ticks: { callback: (value) => `৳${value.toLocaleString()}` } },
                },
            },
        });
    }

    function renderSavingsTrendChart(trend) {
        const canvas = document.getElementById("savings-trend-chart");
        if (!canvas) return;

        if (savingsTrendChart) savingsTrendChart.destroy();

        savingsTrendChart = new Chart(canvas, {
            type: "line",
            data: {
                labels: trend.labels,
                datasets: [
                    { label: "Net Savings", data: trend.savings, borderColor: colors.savings, backgroundColor: "rgba(27, 138, 90, 0.12)", fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#FFFFFF", titleColor: "#1C1E21", bodyColor: "#1C1E21",
                        borderColor: colors.border, borderWidth: 1, padding: 10,
                        callbacks: { label: (context) => `Net Savings: ${formatCurrency(context.parsed.y)}` },
                    },
                },
                scales: {
                    x: { grid: { display: false }, border: { color: colors.border } },
                    y: { beginAtZero: true, grid: { color: colors.border }, border: { display: false }, ticks: { callback: (value) => `৳${value.toLocaleString()}` } },
                },
            },
        });
    }

    /* Expense Breakdown — from the month + account + category filtered set */
    function renderExpenseBreakdownChart(filteredForMonth) {
        const canvas = document.getElementById("expense-breakdown-chart");
        if (!canvas) return;

        const byCategory = {};
        filteredForMonth
            .filter((t) => t.transaction_type === "expense")
            .forEach((t) => {
                byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount);
            });

        const categories = Object.keys(byCategory);
        const values = Object.values(byCategory);

        if (expenseBreakdownChart) expenseBreakdownChart.destroy();

        if (categories.length === 0) {
            return; // nothing to draw; canvas stays empty for this filter combination
        }

        expenseBreakdownChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: categories,
                datasets: [{ data: values, backgroundColor: categories.map((c) => categoryColors[c] || colors.muted), borderColor: "#FFFFFF", borderWidth: 2 }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "60%",
                plugins: {
                    legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 12 } },
                    tooltip: {
                        backgroundColor: "#FFFFFF", titleColor: "#1C1E21", bodyColor: "#1C1E21",
                        borderColor: colors.border, borderWidth: 1, padding: 10,
                        callbacks: { label: (context) => `${context.label}: ${formatCurrency(context.parsed)}` },
                    },
                },
            },
        });
    }

    /* ==========================================================================
       Master render — recomputes everything from current filter values
       ========================================================================== */
    function renderReports() {
        const accountCategoryFiltered = applyAccountCategoryFilters(transactions);
        const monthFiltered = applyMonthFilter(accountCategoryFiltered);

        updateKPIs(monthFiltered);
        updateCategoryTable(monthFiltered);
        renderExpenseBreakdownChart(monthFiltered);

        const trend = buildMonthlyTrends(accountCategoryFiltered);
        renderIncomeExpensesChart(trend);
        renderSavingsTrendChart(trend);
    }

    [filterDate, filterAccount, filterCategory].forEach((input) => {
        if (!input) return;
        input.addEventListener("change", renderReports);
    });

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            filterDate.value = new Date().toISOString().slice(0, 7);
            filterAccount.value = "";
            filterCategory.value = "";
            renderReports();
        });
    }

    renderReports();

});
