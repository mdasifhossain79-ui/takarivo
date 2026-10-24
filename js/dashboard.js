/* ==========================================================================
   Takarivo — dashboard.js
   Purpose: Replaces all demo data on the dashboard with real data from
   the Accounts, Transactions, and Cards APIs. Calculates Total Balance,
   Income, Expenses, Savings, Credit Available, Recent Transactions,
   Upcoming Bills, Top Categories, and drives the Spending Overview
   chart — all from live data, not hardcoded arrays.
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

    const formatDisplayDate = (isoDate) => {
        const date = new Date(`${isoDate}T00:00:00`);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const todayIso = () => new Date().toISOString().slice(0, 10);

    /* ==========================================================================
       Load everything the dashboard needs, in parallel
       ========================================================================== */
    let accounts = [];
    let transactions = [];
    let cards = [];

    try {
        [accounts, transactions, cards] = await Promise.all([
            apiRequest("GET", "/accounts"),
            apiRequest("GET", "/transactions"),
            apiRequest("GET", "/cards"),
        ]);
    } catch (err) {
        console.error("Failed to load dashboard data:", err.message);
        // Leave everything showing "Loading…" -> fall back to a clear message
        document.querySelectorAll(".placeholder-list, #dashboard-recent-transactions-body").forEach((el) => {
            el.innerHTML = `<p class="help-text is-error">Couldn't load dashboard data: ${err.message}</p>`;
        });
        return;
    }

    const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

    /* ==========================================================================
       KPIs
       ========================================================================== */
    function isThisMonth(dateStr) {
        const now = new Date();
        const d = new Date(`${dateStr}T00:00:00`);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    // Total Balance: liquid accounts only (Bank/Savings/Cash/MFS) — credit
    // accounts represent debt, and dedicated credit cards are tracked
    // separately in "Credit Available" below, so they're excluded here
    // to avoid double-counting the same money two different ways.
    const liquidAccounts = accounts.filter((a) => a.account_type !== "Credit");
    const totalBalance = liquidAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

    const thisMonthTransactions = transactions.filter((t) => isThisMonth(t.date));
    const totalIncome = thisMonthTransactions
        .filter((t) => t.transaction_type === "income")
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = thisMonthTransactions
        .filter((t) => t.transaction_type === "expense")
        .reduce((sum, t) => sum + Number(t.amount), 0);
    const savings = totalIncome - totalExpenses;

    const creditAvailable = cards.reduce(
        (sum, c) => sum + Number(c.available_balance ?? (c.credit_limit - c.due_amount)),
        0
    );

    document.getElementById("kpi-total-balance").textContent = formatCurrency(totalBalance);
    document.getElementById("kpi-total-balance-compare").textContent =
        `${liquidAccounts.length} account${liquidAccounts.length === 1 ? "" : "s"}`;

    document.getElementById("kpi-income").textContent = formatCurrency(totalIncome);
    document.getElementById("kpi-expenses").textContent = formatCurrency(totalExpenses);
    document.getElementById("kpi-savings").textContent = formatCurrency(savings);

    document.getElementById("kpi-credit-available").textContent = formatCurrency(creditAvailable);
    document.getElementById("kpi-credit-available-compare").textContent =
        `${cards.length} card${cards.length === 1 ? "" : "s"}`;

    /* ==========================================================================
       Recent Transactions — latest 6, newest first
       ========================================================================== */
    const recentTransactionsBody = document.getElementById("dashboard-recent-transactions-body");

    const recentTransactions = [...transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6);

    if (recentTransactions.length === 0) {
        recentTransactionsBody.innerHTML = `
            <tr class="table-status-row"><td colspan="6"><p class="help-text">No transactions yet.</p></td></tr>
        `;
    } else {
        recentTransactionsBody.innerHTML = "";
        recentTransactions.forEach((t) => {
            const accountName = accountsById[t.account_id]?.name || "Unknown account";
            const isIncome = t.transaction_type === "income";
            const isTransfer = t.transaction_type === "transfer";
            const sign = isIncome ? "+" : isTransfer ? "" : "-";
            const amountClass = isIncome ? "income" : isTransfer ? "" : "expense";
            const typeLabel = t.transaction_type.charAt(0).toUpperCase() + t.transaction_type.slice(1);

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${formatDisplayDate(t.date)}</td>
                <td>${t.description}</td>
                <td><span class="category-tag" data-category="${t.category}">${t.category}</span></td>
                <td>${accountName}</td>
                <td class="amount ${amountClass}">${sign}${formatCurrency(t.amount)}</td>
                <td><span class="type-tag ${t.transaction_type}">${typeLabel}</span></td>
            `;
            recentTransactionsBody.appendChild(row);
        });
    }

    /* ==========================================================================
       Your Cards
       ========================================================================== */
    const cardsListEl = document.getElementById("dashboard-cards-list");

    if (cards.length === 0) {
        cardsListEl.innerHTML = `<p class="help-text">No cards yet.</p>`;
    } else {
        cardsListEl.innerHTML = "";
        cards.slice(0, 4).forEach((card) => {
            const row = document.createElement("div");
            row.className = "placeholder-row";
            row.innerHTML = `
                <span>${card.card_name}</span>
                <span class="help-text">${card.due_date ? `Due ${formatDisplayDate(card.due_date)}` : card.status}</span>
            `;
            cardsListEl.appendChild(row);
        });
    }

    /* ==========================================================================
       Upcoming Bills — derived from cards with an upcoming due date.
       (There's no dedicated bills table yet, so credit card due dates
       are the closest real "upcoming payment" data available.)
       ========================================================================== */
    const upcomingBillsListEl = document.getElementById("dashboard-upcoming-bills-list");
    const today = todayIso();

    const upcomingBills = cards
        .filter((c) => c.due_date && c.due_date >= today && Number(c.due_amount) > 0)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 4);

    if (upcomingBills.length === 0) {
        upcomingBillsListEl.innerHTML = `<p class="help-text">No upcoming bills.</p>`;
    } else {
        upcomingBillsListEl.innerHTML = "";
        upcomingBills.forEach((card) => {
            const row = document.createElement("div");
            row.className = "placeholder-row";
            row.innerHTML = `
                <span>${card.card_name} — due ${formatDisplayDate(card.due_date)}</span>
                <span class="help-text">${formatCurrency(card.due_amount)}</span>
            `;
            upcomingBillsListEl.appendChild(row);
        });
    }

    /* ==========================================================================
       Top Categories — this month's expenses, grouped by category
       ========================================================================== */
    const topCategoriesListEl = document.getElementById("dashboard-top-categories-list");

    const monthlyExpenseTransactions = thisMonthTransactions.filter((t) => t.transaction_type === "expense");
    const totalsByCategory = {};
    monthlyExpenseTransactions.forEach((t) => {
        totalsByCategory[t.category] = (totalsByCategory[t.category] || 0) + Number(t.amount);
    });

    const topCategories = Object.entries(totalsByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (topCategories.length === 0) {
        topCategoriesListEl.innerHTML = `<p class="help-text">No expenses recorded this month.</p>`;
    } else {
        const totalExpenseSum = topCategories.reduce((sum, [, amount]) => sum + amount, 0);
        topCategoriesListEl.innerHTML = "";
        topCategories.forEach(([category, amount]) => {
            const percentage = totalExpenseSum ? (amount / totalExpenseSum) * 100 : 0;
            const row = document.createElement("div");
            row.className = "placeholder-row";
            row.innerHTML = `
                <span>${category}</span>
                <span class="help-text">${percentage.toFixed(0)}%</span>
            `;
            topCategoriesListEl.appendChild(row);
        });
    }

    /* ==========================================================================
       Spending Overview chart — Weekly / Monthly / Yearly, built from
       real transactions instead of a hardcoded demo dataset.
       ========================================================================== */
    const canvas = document.getElementById("spending-chart");
    const rangeSelect = document.getElementById("chart-range");

    if (canvas && typeof Chart !== "undefined") {

        const colors = {
            income: "#385898",
            expenses: "#D93025",
            savings: "#1B8A5A",
            muted: "#666A72",
            border: "#D0D3D6",
        };

        Chart.defaults.font.family = "'Segoe UI', 'Segoe UI Historic', Arial, sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.color = colors.muted;

        const sumByType = (txns, type) => txns.filter((t) => t.transaction_type === type).reduce((s, t) => s + Number(t.amount), 0);

        function buildWeeklyData() {
            const labels = [];
            const income = [];
            const expenses = [];
            const savingsArr = [];

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().slice(0, 10);
                const dayTxns = transactions.filter((t) => t.date === iso);

                labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
                const inc = sumByType(dayTxns, "income");
                const exp = sumByType(dayTxns, "expense");
                income.push(inc);
                expenses.push(exp);
                savingsArr.push(inc - exp);
            }

            return { labels, income, expenses, savings: savingsArr };
        }

        function buildMonthlyData() {
            const year = new Date().getFullYear();
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const income = new Array(12).fill(0);
            const expenses = new Array(12).fill(0);

            transactions.forEach((t) => {
                const d = new Date(`${t.date}T00:00:00`);
                if (d.getFullYear() !== year) return;
                const monthIndex = d.getMonth();
                if (t.transaction_type === "income") income[monthIndex] += Number(t.amount);
                if (t.transaction_type === "expense") expenses[monthIndex] += Number(t.amount);
            });

            const savingsArr = income.map((inc, i) => inc - expenses[i]);
            return { labels: monthNames, income, expenses, savings: savingsArr };
        }

        function buildYearlyData() {
            const years = [...new Set(transactions.map((t) => new Date(`${t.date}T00:00:00`).getFullYear()))].sort();
            const labels = years.length ? years.map(String) : [String(new Date().getFullYear())];
            const income = labels.map(() => 0);
            const expenses = labels.map(() => 0);

            transactions.forEach((t) => {
                const year = new Date(`${t.date}T00:00:00`).getFullYear();
                const idx = labels.indexOf(String(year));
                if (idx === -1) return;
                if (t.transaction_type === "income") income[idx] += Number(t.amount);
                if (t.transaction_type === "expense") expenses[idx] += Number(t.amount);
            });

            const savingsArr = income.map((inc, i) => inc - expenses[i]);
            return { labels, income, expenses, savings: savingsArr };
        }

        const dataBuilders = { weekly: buildWeeklyData, monthly: buildMonthlyData, yearly: buildYearlyData };

        const initialRange = rangeSelect ? rangeSelect.value : "monthly";
        const initialData = dataBuilders[initialRange]();

        const spendingChart = new Chart(canvas, {
            type: "line",
            data: {
                labels: initialData.labels,
                datasets: [
                    { label: "Income", data: initialData.income, borderColor: colors.income, backgroundColor: colors.income, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 },
                    { label: "Expenses", data: initialData.expenses, borderColor: colors.expenses, backgroundColor: colors.expenses, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 },
                    { label: "Savings", data: initialData.savings, borderColor: colors.savings, backgroundColor: colors.savings, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "top", align: "end", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 16 } },
                    tooltip: {
                        backgroundColor: "#FFFFFF", titleColor: "#1C1E21", bodyColor: "#1C1E21",
                        borderColor: colors.border, borderWidth: 1, padding: 10, boxPadding: 4,
                        callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` },
                    },
                },
                scales: {
                    x: { grid: { display: false }, border: { color: colors.border } },
                    y: { beginAtZero: true, grid: { color: colors.border }, border: { display: false }, ticks: { callback: (value) => `৳${value.toLocaleString()}` } },
                },
            },
        });

        if (rangeSelect) {
            rangeSelect.addEventListener("change", (event) => {
                const builder = dataBuilders[event.target.value];
                if (!builder) return;

                const selected = builder();
                spendingChart.data.labels = selected.labels;
                spendingChart.data.datasets[0].data = selected.income;
                spendingChart.data.datasets[1].data = selected.expenses;
                spendingChart.data.datasets[2].data = selected.savings;
                spendingChart.update();
            });
        }
    }

});
