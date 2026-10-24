/* ==========================================================================
   Takarivo — cards.js
   Purpose: Loads, adds, edits, and deletes credit cards via the real
   Cards API (netlify/functions/cards.js), plus dedicated Payment and
   Expense endpoints (cards-payment.js, cards-expense.js), backed by
   Supabase. Replaces the demo/in-memory data and calculations from
   earlier parts — due_amount, available_balance (Available Credit),
   utilization, and transaction_count are now all sourced from the API.
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
    const tableBody = document.getElementById("cards-table-body");

    const addCardBtn = document.getElementById("add-card-btn");
    const cardModal = document.getElementById("card-modal");
    const cardModalTitle = document.getElementById("card-modal-title");
    const cardModalCloseBtn = document.getElementById("card-modal-close-btn");
    const cardModalCancelBtn = document.getElementById("card-modal-cancel-btn");
    const cardForm = document.getElementById("card-form");
    const saveCardBtn = document.getElementById("save-card-btn");
    const cardFormError = document.getElementById("card-form-error");
    const cardFormErrorMessage = document.getElementById("card-form-error-message");

    const fields = {
        id: document.getElementById("card-id"),
        bankName: document.getElementById("card-bank-name"),
        cardName: document.getElementById("card-name"),
        cardType: document.getElementById("card-type"),
        status: document.getElementById("card-status"),
        creditLimit: document.getElementById("card-credit-limit"),
        dueAmount: document.getElementById("card-due-amount"),
        billingCycle: document.getElementById("card-billing-cycle"),
        dueDate: document.getElementById("card-due-date"),
    };

    const errors = {
        bankName: document.getElementById("card-bank-name-error"),
        cardName: document.getElementById("card-name-error"),
        creditLimit: document.getElementById("card-credit-limit-error"),
    };

    let cards = [];

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

    const formatDisplayDate = (isoDate) => {
        if (!isoDate) return "—";
        const date = new Date(`${isoDate}T00:00:00`);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const utilizationLevel = (percentage) => {
        if (percentage >= 70) return "high";
        if (percentage >= 30) return "medium";
        return "low";
    };

    const calculateUtilization = (dueAmount, creditLimit) => {
        if (!creditLimit) return 0;
        return (Number(dueAmount) / Number(creditLimit)) * 100;
    };

    /* ==========================================================================
       Table states
       ========================================================================== */
    function showLoadingState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="9"><p class="help-text">Loading cards…</p></td>
            </tr>
        `;
    }

    function showEmptyState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="9"><p class="help-text">No cards yet. Click "Add Card" to add your first one.</p></td>
            </tr>
        `;
    }

    function showErrorState(message) {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="9">
                    <p class="help-text is-error">${message}</p>
                    <button type="button" class="outline-button small-button" id="retry-load-cards-btn">Retry</button>
                </td>
            </tr>
        `;
        document.getElementById("retry-load-cards-btn")?.addEventListener("click", loadCards);
    }

    /* ==========================================================================
       Render
       ========================================================================== */
    function renderCards(cardList) {
        tableBody.innerHTML = "";

        cardList.forEach((card) => {
            const utilization = calculateUtilization(card.due_amount, card.credit_limit);
            const level = utilizationLevel(utilization);
            const availableCredit = card.available_balance ?? (card.credit_limit - card.due_amount);

            const row = document.createElement("tr");
            row.dataset.id = card.id;

            row.innerHTML = `
                <td>
                    <div class="card-cell">
                        <span class="card-icon" aria-hidden="true">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M2.5 8.5h15"/></svg>
                        </span>
                        <span>${card.card_name}</span>
                    </div>
                </td>
                <td>${card.bank_name}</td>
                <td>${formatCurrency(card.credit_limit)}</td>
                <td class="amount expense">${formatCurrency(card.due_amount)}</td>
                <td class="amount income">${formatCurrency(availableCredit)}</td>
                <td>
                    <div class="utilization">
                        <div class="utilization-bar"><div class="utilization-fill ${level}" style="width: ${Math.min(utilization, 100).toFixed(1)}%;"></div></div>
                        <span class="help-text">${utilization.toFixed(1)}%</span>
                    </div>
                </td>
                <td>${card.billing_cycle || "—"}</td>
                <td>${formatDisplayDate(card.due_date)}</td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="outline-button small-button card-edit-btn">Edit</button>
                        <button type="button" class="outline-button small-button card-pay-btn">Pay</button>
                        <button type="button" class="outline-button small-button card-expense-btn">+ Expense</button>
                        <button type="button" class="icon-button icon-button-sm delete-btn" aria-label="Delete card">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h10M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    /* ==========================================================================
       KPI cards — computed from the loaded cards
       ========================================================================== */
    function updateKPIs(cardList) {
        const totalLimit = cardList.reduce((sum, c) => sum + Number(c.credit_limit), 0);
        const totalDue = cardList.reduce((sum, c) => sum + Number(c.due_amount), 0);
        const totalAvailable = cardList.reduce((sum, c) => sum + Number(c.available_balance ?? (c.credit_limit - c.due_amount)), 0);
        const overallUtilization = calculateUtilization(totalDue, totalLimit);
        const cardsWithDue = cardList.filter((c) => Number(c.due_amount) > 0).length;

        document.getElementById("kpi-total-limit").textContent = formatCurrency(totalLimit);
        document.getElementById("kpi-card-count").textContent = `${cardList.length} card${cardList.length === 1 ? "" : "s"}`;

        document.getElementById("kpi-total-due").textContent = formatCurrency(totalDue);
        document.getElementById("kpi-due-count").textContent = `across ${cardsWithDue} card${cardsWithDue === 1 ? "" : "s"}`;

        document.getElementById("kpi-available-credit").textContent = formatCurrency(totalAvailable);
        document.getElementById("kpi-utilization").textContent = `${overallUtilization.toFixed(1)}%`;

        const upcoming = cardList
            .filter((c) => c.due_date)
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];

        if (upcoming) {
            document.getElementById("kpi-upcoming-due").textContent = formatDisplayDate(upcoming.due_date);
            document.getElementById("kpi-upcoming-due-card").textContent = upcoming.card_name;
        } else {
            document.getElementById("kpi-upcoming-due").textContent = "—";
            document.getElementById("kpi-upcoming-due-card").textContent = "No upcoming dues";
        }
    }

    /* ==========================================================================
       Load — GET /cards
       ========================================================================== */
    async function loadCards() {
        showLoadingState();

        try {
            cards = await apiRequest("GET", "/cards");

            if (!cards || cards.length === 0) {
                showEmptyState();
            } else {
                renderCards(cards);
            }

            updateKPIs(cards || []);
        } catch (err) {
            showErrorState(err.message);
        }
    }

    /* ==========================================================================
       Modal open / close (shared for Add and Edit)
       ========================================================================== */
    const openCardModal = (card = null) => {
        if (!cardModal) return;

        cardForm.reset();
        clearFormErrors();
        hideFormError();
        fields.status.value = "Active";

        if (card) {
            cardModalTitle.textContent = "Edit Card";
            saveCardBtn.textContent = "Update Card";
            fields.id.value = card.id;
            fields.bankName.value = card.bank_name || "";
            fields.cardName.value = card.card_name || "";
            fields.cardType.value = card.card_type || "";
            fields.status.value = card.status || "Active";
            fields.creditLimit.value = card.credit_limit ?? "";
            fields.dueAmount.value = card.due_amount ?? "";
            fields.billingCycle.value = card.billing_cycle || "";
            fields.dueDate.value = card.due_date || "";
        } else {
            cardModalTitle.textContent = "Add Card";
            saveCardBtn.textContent = "Save Card";
            fields.id.value = "";
        }

        cardModal.hidden = false;
        fields.bankName?.focus();
    };

    const closeCardModal = () => {
        if (!cardModal) return;
        cardModal.hidden = true;
        clearFormErrors();
        hideFormError();
        cardForm?.reset();
        addCardBtn?.focus();
    };

    const isCardModalOpen = () => cardModal ? !cardModal.hidden : false;

    if (addCardBtn && cardModal) {
        addCardBtn.addEventListener("click", () => openCardModal(null));
    }
    if (cardModalCloseBtn) cardModalCloseBtn.addEventListener("click", closeCardModal);
    if (cardModalCancelBtn) cardModalCancelBtn.addEventListener("click", closeCardModal);

    if (cardModal) {
        cardModal.addEventListener("click", (event) => {
            if (event.target === cardModal) closeCardModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isCardModalOpen()) closeCardModal();
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
        if (cardFormErrorMessage) cardFormErrorMessage.textContent = message;
        if (cardFormError) cardFormError.hidden = false;
    };

    const hideFormError = () => {
        if (cardFormError) cardFormError.hidden = true;
    };

    const validateForm = () => {
        let isValid = true;

        if (!fields.bankName.value.trim()) {
            showFieldError(fields.bankName, errors.bankName);
            isValid = false;
        } else {
            clearFieldError(fields.bankName, errors.bankName);
        }

        if (!fields.cardName.value.trim()) {
            showFieldError(fields.cardName, errors.cardName);
            isValid = false;
        } else {
            clearFieldError(fields.cardName, errors.cardName);
        }

        const limitValue = parseFloat(fields.creditLimit.value);
        if (fields.creditLimit.value.trim() === "" || Number.isNaN(limitValue) || limitValue <= 0) {
            showFieldError(fields.creditLimit, errors.creditLimit);
            isValid = false;
        } else {
            clearFieldError(fields.creditLimit, errors.creditLimit);
        }

        return isValid;
    };

    /* ==========================================================================
       Add / Edit — POST or PUT /cards
       ========================================================================== */
    if (cardForm) {
        cardForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideFormError();

            if (!validateForm()) return;

            const payload = {
                bank_name: fields.bankName.value.trim(),
                card_name: fields.cardName.value.trim(),
                card_type: fields.cardType.value.trim() || null,
                status: fields.status.value,
                credit_limit: parseFloat(fields.creditLimit.value),
                billing_cycle: fields.billingCycle.value.trim() || null,
                due_date: fields.dueDate.value || null,
            };

            const isEditing = Boolean(fields.id.value);
            if (!isEditing) {
                payload.due_amount = fields.dueAmount.value.trim() === "" ? 0 : parseFloat(fields.dueAmount.value);
            } else if (fields.dueAmount.value.trim() !== "") {
                payload.due_amount = parseFloat(fields.dueAmount.value);
            }

            saveCardBtn.disabled = true;

            try {
                if (isEditing) {
                    await apiRequest("PUT", "/cards", { id: fields.id.value, ...payload });
                } else {
                    await apiRequest("POST", "/cards", payload);
                }

                closeCardModal();
                await loadCards();
            } catch (err) {
                showFormError(err.message);
            } finally {
                saveCardBtn.disabled = false;
            }
        });
    }

    /* ==========================================================================
       Row actions — Edit / Delete / Pay / + Expense
       ========================================================================== */
    tableBody.addEventListener("click", async (event) => {
        const editBtn = event.target.closest(".card-edit-btn");
        const deleteBtn = event.target.closest(".delete-btn");
        const payBtn = event.target.closest(".card-pay-btn");
        const expenseBtn = event.target.closest(".card-expense-btn");
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        const cardId = row.dataset.id;
        const card = cards.find((c) => c.id === cardId);
        const cardLabel = card?.card_name || "this card";

        if (editBtn && card) {
            openCardModal(card);
        }

        if (deleteBtn) {
            const confirmed = window.confirm(`Delete "${cardLabel}"? This cannot be undone.`);
            if (!confirmed) return;

            try {
                await apiRequest("DELETE", `/cards?id=${encodeURIComponent(cardId)}`);
                await loadCards();
            } catch (err) {
                window.alert(`Couldn't delete this card: ${err.message}`);
            }
        }

        if (payBtn) {
            const input = window.prompt(`Payment amount for "${cardLabel}" (৳):`);
            if (input === null) return;

            const amount = parseFloat(input);
            if (Number.isNaN(amount) || amount <= 0) {
                window.alert("Please enter a valid amount greater than 0.");
                return;
            }

            try {
                await apiRequest("POST", "/cards-payment", { card_id: cardId, amount });
                await loadCards();
            } catch (err) {
                window.alert(`Couldn't apply payment: ${err.message}`);
            }
        }

        if (expenseBtn) {
            const input = window.prompt(`Expense amount for "${cardLabel}" (৳):`);
            if (input === null) return;

            const amount = parseFloat(input);
            if (Number.isNaN(amount) || amount <= 0) {
                window.alert("Please enter a valid amount greater than 0.");
                return;
            }

            try {
                await apiRequest("POST", "/cards-expense", { card_id: cardId, amount });
                await loadCards();
            } catch (err) {
                window.alert(`Couldn't record expense: ${err.message}`);
            }
        }
    });

    /* ==========================================================================
       Init
       ========================================================================== */
    loadCards();

});
