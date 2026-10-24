/* ==========================================================================
   Takarivo — transactions.js
   Purpose: Loads, adds, edits, and deletes transactions via the real
   Transactions API (netlify/functions/transactions.js), backed by
   Supabase. Replaces the demo/in-memory data from earlier parts.
   Implements search, filtering, and pagination client-side against the
   loaded dataset, and recalculates KPIs from real data.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const sb = window.TakarivoSupabase;
    if (!sb) {
        console.error("Takarivo: Supabase client not initialized. Check script load order.");
        return;
    }

    const API_BASE = "/.netlify/functions";
    const PAGE_SIZE = 10;

    /* ==========================================================================
       Element references
       ========================================================================== */
    const tableBody = document.getElementById("transactions-table-body");
    const noResultsMessage = document.getElementById("no-results-message");

    const searchInput = document.getElementById("filter-search");
    const dateInput = document.getElementById("filter-date");
    const accountSelect = document.getElementById("filter-account");
    const categorySelect = document.getElementById("filter-category");
    const typeSelect = document.getElementById("filter-type");
    const resetBtn = document.getElementById("filter-reset-btn");

    const paginationBar = document.getElementById("pagination-bar");
    const paginationSummary = document.getElementById("pagination-summary");
    const paginationPageIndicator = document.getElementById("pagination-page-indicator");
    const paginationPrevBtn = document.getElementById("pagination-prev-btn");
    const paginationNextBtn = document.getElementById("pagination-next-btn");

    const addTransactionBtn = document.getElementById("add-transaction-btn");
    const transactionModal = document.getElementById("add-transaction-modal");
    const transactionModalTitle = document.getElementById("add-transaction-title");
    const transactionModalCloseBtn = document.getElementById("transaction-modal-close-btn");
    const transactionModalCancelBtn = document.getElementById("transaction-modal-cancel-btn");
    const transactionForm = document.getElementById("add-transaction-form");
    const saveTransactionBtn = document.getElementById("save-transaction-btn");
    const transactionFormError = document.getElementById("transaction-form-error");
    const transactionFormErrorMessage = document.getElementById("transaction-form-error-message");

    const tFields = {
        id: document.getElementById("transaction-id"),
        type: document.getElementById("transaction-type"),
        date: document.getElementById("transaction-date"),
        description: document.getElementById("transaction-description"),
        merchant: document.getElementById("transaction-merchant"),
        category: document.getElementById("transaction-category"),
        account: document.getElementById("transaction-account"),
        amount: document.getElementById("transaction-amount"),
        notes: document.getElementById("transaction-notes"),
    };

    const tErrors = {
        type: document.getElementById("transaction-type-error"),
        date: document.getElementById("transaction-date-error"),
        description: document.getElementById("transaction-description-error"),
        category: document.getElementById("transaction-category-error"),
        account: document.getElementById("transaction-account-error"),
        amount: document.getElementById("transaction-amount-error"),
    };

    /* ==========================================================================
       State
       ========================================================================== */
    let accounts = [];
    let accountsById = {};
    let allTransactions = [];
    let currentPage = 1;

    /* ==========================================================================
       API helper
       ========================================================================== */
    async function apiRequest(method, path, body) {
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) throw new Error("You're not signed in. Please sign in again.");

        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
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

    const formatCurrency = (amount) => `৳${Math.round(amount).toLocaleString()}`;

    const formatDisplayDate = (isoDate) => {
        const date = new Date(`${isoDate}T00:00:00`);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    /* ==========================================================================
       Load accounts — needed to populate the Account filter + modal select,
       and to display an account name instead of a raw account_id in the table
       ========================================================================== */
    async function loadAccountsForDropdowns() {
        try {
            accounts = await apiRequest("GET", "/accounts");
            accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

            // Filter bar select
            accountSelect.innerHTML = '<option value="">All Accounts</option>';
            accounts.forEach((account) => {
                const option = document.createElement("option");
                option.value = account.id;
                option.textContent = account.name;
                accountSelect.appendChild(option);
            });

            // Modal select
            tFields.account.innerHTML = '<option value="">Select account</option>';
            accounts.forEach((account) => {
                const option = document.createElement("option");
                option.value = account.id;
                option.textContent = account.name;
                tFields.account.appendChild(option);
            });
        } catch (err) {
            console.error("Failed to load accounts for dropdowns:", err.message);
        }
    }

    /* ==========================================================================
       Load transactions — GET /transactions
       ========================================================================== */
    async function loadTransactions() {
        showLoadingState();

        try {
            allTransactions = await apiRequest("GET", "/transactions");
            currentPage = 1;
            renderFilteredResults();
        } catch (err) {
            showErrorState(err.message);
        }
    }

    function showLoadingState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="7"><p class="help-text">Loading transactions…</p></td>
            </tr>
        `;
        if (paginationBar) paginationBar.hidden = true;
        if (noResultsMessage) noResultsMessage.hidden = true;
    }

    function showErrorState(message) {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="7">
                    <p class="help-text is-error">${message}</p>
                    <button type="button" class="outline-button small-button" id="retry-load-transactions-btn">Retry</button>
                </td>
            </tr>
        `;
        if (paginationBar) paginationBar.hidden = true;
        if (noResultsMessage) noResultsMessage.hidden = true;
        document.getElementById("retry-load-transactions-btn")?.addEventListener("click", loadTransactions);
    }

    /* ==========================================================================
       Search + Filter — applied client-side against the loaded dataset
       ========================================================================== */
    function getFilteredTransactions() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const dateValue = dateInput.value;
        const accountValue = accountSelect.value;
        const categoryValue = categorySelect.value;
        const typeValue = typeSelect.value;

        return allTransactions.filter((t) => {
            const description = (t.description || "").toLowerCase();
            const merchant = (t.merchant || "").toLowerCase();

            const matchesSearch = !searchTerm || description.includes(searchTerm) || merchant.includes(searchTerm);
            const matchesDate = !dateValue || t.date === dateValue;
            const matchesAccount = !accountValue || t.account_id === accountValue;
            const matchesCategory = !categoryValue || t.category === categoryValue;
            const matchesType = !typeValue || t.transaction_type === typeValue;

            return matchesSearch && matchesDate && matchesAccount && matchesCategory && matchesType;
        });
    }

    /* ==========================================================================
       KPI calculations — from the filtered result set (Part 22 formulas)
       ========================================================================== */
    const calculateTotalIncome = (transactions) =>
        transactions.filter((t) => t.transaction_type === "income").reduce((sum, t) => sum + Number(t.amount), 0);

    const calculateTotalExpenses = (transactions) =>
        transactions.filter((t) => t.transaction_type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);

    const calculateNetCashFlow = (income, expenses) => income - expenses;

    function updateKPIs(filteredTransactions) {
        const totalIncome = calculateTotalIncome(filteredTransactions);
        const totalExpenses = calculateTotalExpenses(filteredTransactions);
        const netCashFlow = calculateNetCashFlow(totalIncome, totalExpenses);

        document.getElementById("kpi-total-count").textContent = String(filteredTransactions.length);
        document.getElementById("kpi-income").textContent = formatCurrency(totalIncome);
        document.getElementById("kpi-expenses").textContent = formatCurrency(totalExpenses);
        document.getElementById("kpi-net-cashflow").textContent = formatCurrency(netCashFlow);
    }

    /* ==========================================================================
       Pagination — applied client-side after search/filter
       ========================================================================== */
    function paginate(items, page) {
        const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const start = (safePage - 1) * PAGE_SIZE;
        const pageItems = items.slice(start, start + PAGE_SIZE);

        return { pageItems, safePage, totalPages, start };
    }

    function updatePaginationControls(totalItems, safePage, totalPages, shownCount, start) {
        if (!paginationBar) return;

        if (totalItems === 0) {
            paginationBar.hidden = true;
            return;
        }

        paginationBar.hidden = false;
        paginationSummary.textContent = `Showing ${start + 1}–${start + shownCount} of ${totalItems}`;
        paginationPageIndicator.textContent = `Page ${safePage} of ${totalPages}`;
        paginationPrevBtn.disabled = safePage <= 1;
        paginationNextBtn.disabled = safePage >= totalPages;
    }

    /* ==========================================================================
       Renders a single row (used for both initial render and edits)
       ========================================================================== */
    function renderRow(t) {
        const accountName = accountsById[t.account_id]?.name || "Unknown account";
        const isIncome = t.transaction_type === "income";
        const isTransfer = t.transaction_type === "transfer";
        const sign = isIncome ? "+" : isTransfer ? "" : "-";
        const amountClass = isIncome ? "income" : isTransfer ? "" : "expense";
        const typeLabel = t.transaction_type.charAt(0).toUpperCase() + t.transaction_type.slice(1);

        const row = document.createElement("tr");
        row.dataset.id = t.id;

        row.innerHTML = `
            <td>${formatDisplayDate(t.date)}</td>
            <td>${t.description}</td>
            <td><span class="category-tag" data-category="${t.category}">${t.category}</span></td>
            <td>${accountName}</td>
            <td><span class="type-tag ${t.transaction_type}">${typeLabel}</span></td>
            <td class="amount ${amountClass}">${sign}${formatCurrency(t.amount)}</td>
            <td>
                <div class="action-buttons">
                    <button type="button" class="icon-button icon-button-sm edit-btn" aria-label="Edit transaction">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m13 4 3 3-8 8H5v-3l8-8Z"/></svg>
                    </button>
                    <button type="button" class="icon-button icon-button-sm delete-btn" aria-label="Delete transaction">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h10M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6"/></svg>
                    </button>
                </div>
            </td>
        `;

        return row;
    }

    /* ==========================================================================
       Master render: filter -> KPIs -> paginate -> table + pagination bar
       ========================================================================== */
    function renderFilteredResults() {
        const filtered = getFilteredTransactions();
        updateKPIs(filtered);

        const { pageItems, safePage, totalPages, start } = paginate(filtered, currentPage);
        currentPage = safePage;

        tableBody.innerHTML = "";

        if (filtered.length === 0) {
            if (noResultsMessage) noResultsMessage.hidden = false;
            if (paginationBar) paginationBar.hidden = true;
            return;
        }

        if (noResultsMessage) noResultsMessage.hidden = true;
        pageItems.forEach((t) => tableBody.appendChild(renderRow(t)));
        updatePaginationControls(filtered.length, safePage, totalPages, pageItems.length, start);
    }

    /* Re-run filtering/pagination whenever a filter or search input changes */
    [searchInput, dateInput, accountSelect, categorySelect, typeSelect].forEach((input) => {
        if (!input) return;
        const eventType = input.tagName === "SELECT" || input.type === "date" ? "change" : "input";
        input.addEventListener(eventType, () => {
            currentPage = 1;
            renderFilteredResults();
        });
    });

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            searchInput.value = "";
            dateInput.value = "";
            accountSelect.value = "";
            categorySelect.value = "";
            typeSelect.value = "";
            currentPage = 1;
            renderFilteredResults();
        });
    }

    if (paginationPrevBtn) {
        paginationPrevBtn.addEventListener("click", () => {
            currentPage -= 1;
            renderFilteredResults();
        });
    }

    if (paginationNextBtn) {
        paginationNextBtn.addEventListener("click", () => {
            currentPage += 1;
            renderFilteredResults();
        });
    }

    /* ==========================================================================
       Modal open / close (shared for Add and Edit)
       ========================================================================== */
    const openTransactionModal = (transaction = null) => {
        if (!transactionModal) return;

        transactionForm.reset();
        clearTransactionErrors();
        hideTransactionFormError();

        if (transaction) {
            transactionModalTitle.textContent = "Edit Transaction";
            saveTransactionBtn.textContent = "Update Transaction";
            tFields.id.value = transaction.id;
            tFields.type.value = transaction.transaction_type;
            tFields.date.value = transaction.date;
            tFields.description.value = transaction.description || "";
            tFields.merchant.value = transaction.merchant || "";
            tFields.category.value = transaction.category || "";
            tFields.account.value = transaction.account_id || "";
            tFields.amount.value = transaction.amount ?? "";
            tFields.notes.value = transaction.notes || "";
        } else {
            transactionModalTitle.textContent = "Add Transaction";
            saveTransactionBtn.textContent = "Save Transaction";
            tFields.id.value = "";
        }

        transactionModal.hidden = false;
        tFields.type?.focus();
    };

    const closeTransactionModal = () => {
        if (!transactionModal) return;
        transactionModal.hidden = true;
        clearTransactionErrors();
        hideTransactionFormError();
        transactionForm?.reset();
        addTransactionBtn?.focus();
    };

    const isTransactionModalOpen = () => transactionModal ? !transactionModal.hidden : false;

    if (addTransactionBtn && transactionModal) {
        addTransactionBtn.addEventListener("click", () => openTransactionModal(null));
    }
    if (transactionModalCloseBtn) transactionModalCloseBtn.addEventListener("click", closeTransactionModal);
    if (transactionModalCancelBtn) transactionModalCancelBtn.addEventListener("click", closeTransactionModal);

    if (transactionModal) {
        transactionModal.addEventListener("click", (event) => {
            if (event.target === transactionModal) closeTransactionModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isTransactionModalOpen()) closeTransactionModal();
    });

    /* ==========================================================================
       Validation
       ========================================================================== */
    const showTError = (field, errorEl) => {
        field.setAttribute("aria-invalid", "true");
        if (errorEl) errorEl.hidden = false;
    };

    const clearTError = (field, errorEl) => {
        field.removeAttribute("aria-invalid");
        if (errorEl) errorEl.hidden = true;
    };

    const clearTransactionErrors = () => {
        Object.keys(tErrors).forEach((key) => {
            if (tFields[key]) clearTError(tFields[key], tErrors[key]);
        });
    };

    const showTransactionFormError = (message) => {
        if (transactionFormErrorMessage) transactionFormErrorMessage.textContent = message;
        if (transactionFormError) transactionFormError.hidden = false;
    };

    const hideTransactionFormError = () => {
        if (transactionFormError) transactionFormError.hidden = true;
    };

    const validateTransactionForm = () => {
        let isValid = true;

        if (!tFields.type.value) {
            showTError(tFields.type, tErrors.type);
            isValid = false;
        } else clearTError(tFields.type, tErrors.type);

        if (!tFields.date.value) {
            showTError(tFields.date, tErrors.date);
            isValid = false;
        } else clearTError(tFields.date, tErrors.date);

        if (!tFields.description.value.trim()) {
            showTError(tFields.description, tErrors.description);
            isValid = false;
        } else clearTError(tFields.description, tErrors.description);

        if (!tFields.category.value) {
            showTError(tFields.category, tErrors.category);
            isValid = false;
        } else clearTError(tFields.category, tErrors.category);

        if (!tFields.account.value) {
            showTError(tFields.account, tErrors.account);
            isValid = false;
        } else clearTError(tFields.account, tErrors.account);

        const amountValue = parseFloat(tFields.amount.value);
        if (tFields.amount.value.trim() === "" || Number.isNaN(amountValue) || amountValue <= 0) {
            showTError(tFields.amount, tErrors.amount);
            isValid = false;
        } else clearTError(tFields.amount, tErrors.amount);

        return isValid;
    };

    /* ==========================================================================
       Add / Edit — POST or PUT /transactions
       ========================================================================== */
    if (transactionForm) {
        transactionForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideTransactionFormError();

            if (!validateTransactionForm()) return;

            const payload = {
                transaction_type: tFields.type.value,
                date: tFields.date.value,
                description: tFields.description.value.trim(),
                merchant: tFields.merchant.value.trim() || null,
                category: tFields.category.value,
                account_id: tFields.account.value,
                amount: parseFloat(tFields.amount.value),
                notes: tFields.notes.value.trim() || null,
            };

            const isEditing = Boolean(tFields.id.value);
            saveTransactionBtn.disabled = true;

            try {
                if (isEditing) {
                    await apiRequest("PUT", "/transactions", { id: tFields.id.value, ...payload });
                } else {
                    await apiRequest("POST", "/transactions", payload);
                }

                closeTransactionModal();
                await loadTransactions();
            } catch (err) {
                showTransactionFormError(err.message);
            } finally {
                saveTransactionBtn.disabled = false;
            }
        });
    }

    /* ==========================================================================
       Row actions — Edit / Delete (event delegation, rows are re-rendered)
       ========================================================================== */
    tableBody.addEventListener("click", async (event) => {
        const editBtn = event.target.closest(".edit-btn");
        const deleteBtn = event.target.closest(".delete-btn");
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        const transactionId = row.dataset.id;

        if (editBtn) {
            const transaction = allTransactions.find((t) => t.id === transactionId);
            if (transaction) openTransactionModal(transaction);
        }

        if (deleteBtn) {
            const description = row.children[1]?.textContent ?? "this transaction";
            const confirmed = window.confirm(`Delete "${description}"? This cannot be undone.`);
            if (!confirmed) return;

            try {
                await apiRequest("DELETE", `/transactions?id=${encodeURIComponent(transactionId)}`);
                await loadTransactions();
            } catch (err) {
                window.alert(`Couldn't delete this transaction: ${err.message}`);
            }
        }
    });

    /* ==========================================================================
       Init
       ========================================================================== */
    (async function init() {
        await loadAccountsForDropdowns();
        await loadTransactions();
    })();

});
