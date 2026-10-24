/* ==========================================================================
   Takarivo — budgets.js
   Purpose: Loads, creates, edits, and deletes budgets via the real
   Budgets API (netlify/functions/budgets.js), backed by Supabase.

   Spent is NOT entered manually — it's calculated from the user's real
   transactions (via the Transactions API) that match a budget's
   category and fall within its date range. After calculating, the
   result is written back via PUT /budgets, so the server recalculates
   and returns fresh Remaining, Progress, and Status (Part 47) — keeping
   one source of truth for that math instead of duplicating it here.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const sb = window.TakarivoSupabase;
    if (!sb) {
        console.error("Takarivo: Supabase client not initialized. Check script load order.");
        return;
    }

    const API_BASE = "/.netlify/functions";

    /* ==========================================================================
       Element references
       ========================================================================== */
    const tableBody = document.getElementById("budgets-table-body");

    const addBudgetBtn = document.getElementById("add-budget-btn");
    const budgetModal = document.getElementById("budget-modal");
    const budgetModalTitle = document.getElementById("budget-modal-title");
    const budgetModalCloseBtn = document.getElementById("budget-modal-close-btn");
    const budgetModalCancelBtn = document.getElementById("budget-modal-cancel-btn");
    const budgetForm = document.getElementById("budget-form");
    const saveBudgetBtn = document.getElementById("save-budget-btn");
    const budgetFormError = document.getElementById("budget-form-error");
    const budgetFormErrorMessage = document.getElementById("budget-form-error-message");

    const fields = {
        id: document.getElementById("budget-id"),
        category: document.getElementById("budget-category"),
        amount: document.getElementById("budget-amount"),
        startDate: document.getElementById("budget-start-date"),
        endDate: document.getElementById("budget-end-date"),
    };

    const errors = {
        category: document.getElementById("budget-category-error"),
        amount: document.getElementById("budget-amount-error"),
        startDate: document.getElementById("budget-start-date-error"),
        endDate: document.getElementById("budget-end-date-error"),
    };

    const statusLabel = {
        "on-track": "On Track",
        "near-limit": "Near Limit",
        "critical": "Critical",
        "over-budget": "Over Budget",
    };

    const statusToLevel = {
        "on-track": "low",
        "near-limit": "medium",
        "critical": "medium",
        "over-budget": "high",
    };

    let budgets = [];

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

    const formatCurrency = (amount) => `৳${Math.round(Number(amount)).toLocaleString()}`;

    /* ==========================================================================
       Table states
       ========================================================================== */
    function showLoadingState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="7"><p class="help-text">Loading budgets…</p></td>
            </tr>
        `;
    }

    function showEmptyState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="7"><p class="help-text">No budgets yet. Click "Add Budget" to create your first one.</p></td>
            </tr>
        `;
    }

    function showErrorState(message) {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="7">
                    <p class="help-text is-error">${message}</p>
                    <button type="button" class="outline-button small-button" id="retry-load-budgets-btn">Retry</button>
                </td>
            </tr>
        `;
        document.getElementById("retry-load-budgets-btn")?.addEventListener("click", loadBudgets);
    }

    /* ==========================================================================
       Calculate real spending from transactions
       Sums expense transactions matching a budget's category, with a
       date on or after start_date and on or before end_date.
       ========================================================================== */
    function calculateSpentFromTransactions(budget, transactions) {
        return transactions
            .filter((t) =>
                t.transaction_type === "expense" &&
                t.category === budget.category &&
                t.date >= budget.start_date &&
                t.date <= budget.end_date
            )
            .reduce((sum, t) => sum + Number(t.amount), 0);
    }

    /* ==========================================================================
       Render
       ========================================================================== */
    function renderBudgets(budgetList) {
        tableBody.innerHTML = "";

        budgetList.forEach((budget) => {
            const level = statusToLevel[budget.status] || "low";
            const progress = Number(budget.progress) || 0;

            const row = document.createElement("tr");
            row.dataset.id = budget.id;

            row.innerHTML = `
                <td><span class="category-tag" data-category="${budget.category}">${budget.category}</span></td>
                <td>${formatCurrency(budget.budget_amount)}</td>
                <td>${formatCurrency(budget.spent_amount)}</td>
                <td class="amount ${budget.remaining < 0 ? "expense" : "income"}">${formatCurrency(budget.remaining)}</td>
                <td>
                    <div class="utilization">
                        <div class="utilization-bar"><div class="utilization-fill ${level}" style="width: ${Math.min(progress, 100).toFixed(1)}%;"></div></div>
                        <span class="help-text">${progress.toFixed(1)}%</span>
                    </div>
                </td>
                <td><span class="status-tag ${budget.status}">${statusLabel[budget.status] || budget.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="outline-button small-button budget-edit-btn">Edit</button>
                        <button type="button" class="icon-button icon-button-sm delete-btn" aria-label="Delete budget">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h10M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    /* ==========================================================================
       KPI cards — computed from the (transaction-synced) budgets
       ========================================================================== */
    function updateKPIs(budgetList) {
        const totalBudget = budgetList.reduce((sum, b) => sum + Number(b.budget_amount), 0);
        const totalSpent = budgetList.reduce((sum, b) => sum + Number(b.spent_amount), 0);
        const totalRemaining = totalBudget - totalSpent;
        const overBudgetCount = budgetList.filter((b) => b.status === "over-budget").length;

        document.getElementById("kpi-total-budget").textContent = formatCurrency(totalBudget);
        document.getElementById("kpi-total-spent").textContent = formatCurrency(totalSpent);
        document.getElementById("kpi-remaining").textContent = formatCurrency(totalRemaining);
        document.getElementById("kpi-over-budget").textContent = String(overBudgetCount);
    }

    /* ==========================================================================
       Load — GET /budgets + GET /transactions, then sync spent_amount
       from real transaction data for every budget before rendering.
       ========================================================================== */
    async function loadBudgets() {
        showLoadingState();

        try {
            const [loadedBudgets, transactions] = await Promise.all([
                apiRequest("GET", "/budgets"),
                apiRequest("GET", "/transactions"),
            ]);

            // Recalculate each budget's spent_amount from real transactions.
            // Only write back (PUT) when the number actually changed, to
            // avoid unnecessary API calls on every page load.
            const synced = await Promise.all(
                loadedBudgets.map(async (budget) => {
                    const actualSpent = calculateSpentFromTransactions(budget, transactions);
                    const currentSpent = Number(budget.spent_amount);

                    if (Math.abs(actualSpent - currentSpent) < 0.01) {
                        return budget; // already in sync, no write needed
                    }

                    try {
                        return await apiRequest("PUT", "/budgets", {
                            id: budget.id,
                            spent_amount: actualSpent,
                        });
                    } catch (err) {
                        console.error(`Failed to sync spent_amount for budget ${budget.id}:`, err.message);
                        return budget; // fall back to the stale value rather than losing the row
                    }
                })
            );

            budgets = synced;

            if (budgets.length === 0) {
                showEmptyState();
            } else {
                renderBudgets(budgets);
            }

            updateKPIs(budgets);
        } catch (err) {
            showErrorState(err.message);
        }
    }

    /* ==========================================================================
       Modal open / close (shared for Add and Edit)
       ========================================================================== */
    const openBudgetModal = (budget = null) => {
        if (!budgetModal) return;

        budgetForm.reset();
        clearFormErrors();
        hideFormError();

        if (budget) {
            budgetModalTitle.textContent = "Edit Budget";
            saveBudgetBtn.textContent = "Update Budget";
            fields.id.value = budget.id;
            fields.category.value = budget.category || "";
            fields.amount.value = budget.budget_amount ?? "";
            fields.startDate.value = budget.start_date || "";
            fields.endDate.value = budget.end_date || "";
        } else {
            budgetModalTitle.textContent = "Add Budget";
            saveBudgetBtn.textContent = "Save Budget";
            fields.id.value = "";
        }

        budgetModal.hidden = false;
        fields.category?.focus();
    };

    const closeBudgetModal = () => {
        if (!budgetModal) return;
        budgetModal.hidden = true;
        clearFormErrors();
        hideFormError();
        budgetForm?.reset();
        addBudgetBtn?.focus();
    };

    const isBudgetModalOpen = () => budgetModal ? !budgetModal.hidden : false;

    if (addBudgetBtn && budgetModal) {
        addBudgetBtn.addEventListener("click", () => openBudgetModal(null));
    }
    if (budgetModalCloseBtn) budgetModalCloseBtn.addEventListener("click", closeBudgetModal);
    if (budgetModalCancelBtn) budgetModalCancelBtn.addEventListener("click", closeBudgetModal);

    if (budgetModal) {
        budgetModal.addEventListener("click", (event) => {
            if (event.target === budgetModal) closeBudgetModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isBudgetModalOpen()) closeBudgetModal();
    });

    /* ==========================================================================
       Validation
       ========================================================================== */
    const showFieldError = (field, errorEl) => {
        field.setAttribute("aria-invalid", "true");
        if (errorEl) errorEl.hidden = false;
    };

    const clearFieldError = (field, errorEl) => {
        field.removeAttribute("aria-invalid");
        if (errorEl) errorEl.hidden = true;
    };

    const clearFormErrors = () => {
        Object.keys(errors).forEach((key) => {
            if (fields[key]) clearFieldError(fields[key], errors[key]);
        });
    };

    const showFormError = (message) => {
        if (budgetFormErrorMessage) budgetFormErrorMessage.textContent = message;
        if (budgetFormError) budgetFormError.hidden = false;
    };

    const hideFormError = () => {
        if (budgetFormError) budgetFormError.hidden = true;
    };

    const validateForm = () => {
        let isValid = true;

        if (!fields.category.value) {
            showFieldError(fields.category, errors.category);
            isValid = false;
        } else {
            clearFieldError(fields.category, errors.category);
        }

        const amountValue = parseFloat(fields.amount.value);
        if (fields.amount.value.trim() === "" || Number.isNaN(amountValue) || amountValue <= 0) {
            showFieldError(fields.amount, errors.amount);
            isValid = false;
        } else {
            clearFieldError(fields.amount, errors.amount);
        }

        if (!fields.startDate.value) {
            showFieldError(fields.startDate, errors.startDate);
            isValid = false;
        } else {
            clearFieldError(fields.startDate, errors.startDate);
        }

        if (!fields.endDate.value || (fields.startDate.value && fields.endDate.value < fields.startDate.value)) {
            showFieldError(fields.endDate, errors.endDate);
            isValid = false;
        } else {
            clearFieldError(fields.endDate, errors.endDate);
        }

        return isValid;
    };

    /* ==========================================================================
       Add / Edit — POST or PUT /budgets
       ========================================================================== */
    if (budgetForm) {
        budgetForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideFormError();

            if (!validateForm()) return;

            const payload = {
                category: fields.category.value,
                budget_amount: parseFloat(fields.amount.value),
                start_date: fields.startDate.value,
                end_date: fields.endDate.value,
            };

            const isEditing = Boolean(fields.id.value);
            saveBudgetBtn.disabled = true;

            try {
                if (isEditing) {
                    await apiRequest("PUT", "/budgets", { id: fields.id.value, ...payload });
                } else {
                    await apiRequest("POST", "/budgets", payload);
                }

                closeBudgetModal();
                await loadBudgets();
            } catch (err) {
                showFormError(err.message);
            } finally {
                saveBudgetBtn.disabled = false;
            }
        });
    }

    /* ==========================================================================
       Row actions — Edit / Delete
       ========================================================================== */
    tableBody.addEventListener("click", async (event) => {
        const editBtn = event.target.closest(".budget-edit-btn");
        const deleteBtn = event.target.closest(".delete-btn");
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        const budgetId = row.dataset.id;
        const budget = budgets.find((b) => b.id === budgetId);

        if (editBtn && budget) {
            openBudgetModal(budget);
        }

        if (deleteBtn) {
            const categoryLabel = budget?.category || "this budget";
            const confirmed = window.confirm(`Delete the "${categoryLabel}" budget? This cannot be undone.`);
            if (!confirmed) return;

            try {
                await apiRequest("DELETE", `/budgets?id=${encodeURIComponent(budgetId)}`);
                await loadBudgets();
            } catch (err) {
                window.alert(`Couldn't delete this budget: ${err.message}`);
            }
        }
    });

    /* ==========================================================================
       Init
       ========================================================================== */
    loadBudgets();

});
