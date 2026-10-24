/* ==========================================================================
   Takarivo — accounts.js
   Purpose: Loads, adds, edits, and deletes accounts via the real Accounts
   API (netlify/functions/accounts.js), backed by Supabase. Replaces the
   demo/in-memory data from earlier parts. Handles loading, empty,
   error, and success states for the table.
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
    const exportBtn = document.getElementById("export-btn");
    const addAccountBtn = document.getElementById("add-account-btn");
    const modal = document.getElementById("add-account-modal");
    const modalTitle = document.getElementById("add-account-title");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const form = document.getElementById("add-account-form");
    const saveBtn = document.getElementById("save-account-btn");
    const formError = document.getElementById("account-form-error");
    const formErrorMessage = document.getElementById("account-form-error-message");
    const tableBody = document.getElementById("accounts-table-body");

    const fields = {
        id: document.getElementById("account-id"),
        name: document.getElementById("account-name"),
        institution: document.getElementById("institution"),
        type: document.getElementById("account-type"),
        accountNumber: document.getElementById("account-number"),
        balance: document.getElementById("opening-balance"),
        currency: document.getElementById("currency"),
    };

    const errors = {
        name: document.getElementById("account-name-error"),
        institution: document.getElementById("institution-error"),
        type: document.getElementById("account-type-error"),
        balance: document.getElementById("opening-balance-error"),
    };

    const currencySymbols = { BDT: "৳", USD: "$", EUR: "€", GBP: "£" };

    /* ==========================================================================
       API helper — attaches the current session's access token, and
       throws with the API's own error message on failure.
       ========================================================================== */
    async function apiRequest(method, path, body) {
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) {
            throw new Error("You're not signed in. Please sign in again.");
        }

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

    /* ==========================================================================
       Table states — loading / empty / error / success
       ========================================================================== */
    function showLoadingState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="6"><p class="help-text">Loading accounts…</p></td>
            </tr>
        `;
    }

    function showEmptyState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="6"><p class="help-text">No accounts yet. Click "Add Account" to create your first one.</p></td>
            </tr>
        `;
    }

    function showErrorState(message) {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="6">
                    <p class="help-text is-error">${message}</p>
                    <button type="button" class="outline-button small-button" id="retry-load-btn">Retry</button>
                </td>
            </tr>
        `;
        document.getElementById("retry-load-btn")?.addEventListener("click", loadAccounts);
    }

    function statusClassFor(status) {
        if (status === "Active") return "active";
        if (status === "Frozen") return "frozen";
        if (status === "Closed") return "closed";
        return "active";
    }

    function renderAccounts(accounts) {
        tableBody.innerHTML = "";

        accounts.forEach((account) => {
            const symbol = currencySymbols[account.currency] || "";
            const isNegative = Number(account.balance) < 0;
            const amountClass = account.balance == 0 ? "" : isNegative ? "expense" : "income";

            const row = document.createElement("tr");
            row.dataset.id = account.id;
            row.innerHTML = `
                <td>${account.name}</td>
                <td>${account.institution || "—"}</td>
                <td>${account.account_type}</td>
                <td class="amount ${amountClass}">${symbol}${Number(account.balance).toLocaleString()}</td>
                <td><span class="status-tag ${statusClassFor(account.status)}">${account.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="outline-button small-button account-edit-btn">Edit</button>
                        <button type="button" class="icon-button icon-button-sm delete-btn" aria-label="Delete account">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h10M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    /* ==========================================================================
       KPI cards — computed from the loaded accounts
       ========================================================================== */
    function updateKPIs(accounts) {
        const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

        const bankLike = accounts.filter((a) => a.account_type === "Bank" || a.account_type === "Savings" || a.account_type === "MFS");
        const cashLike = accounts.filter((a) => a.account_type === "Cash");
        const creditLike = accounts.filter((a) => a.account_type === "Credit");

        const bankTotal = bankLike.reduce((sum, a) => sum + Number(a.balance), 0);
        const cashTotal = cashLike.reduce((sum, a) => sum + Number(a.balance), 0);
        const creditTotal = creditLike.reduce((sum, a) => sum + Number(a.balance), 0);

        document.getElementById("kpi-total-balance").textContent = `৳${totalBalance.toLocaleString()}`;
        document.getElementById("kpi-total-balance-compare").textContent = `${accounts.length} account${accounts.length === 1 ? "" : "s"}`;

        document.getElementById("kpi-bank-total").textContent = `৳${bankTotal.toLocaleString()}`;
        document.getElementById("kpi-bank-compare").textContent = `${bankLike.length} account${bankLike.length === 1 ? "" : "s"}`;

        document.getElementById("kpi-cash-total").textContent = `৳${cashTotal.toLocaleString()}`;
        document.getElementById("kpi-cash-compare").textContent = `${cashLike.length} account${cashLike.length === 1 ? "" : "s"}`;

        document.getElementById("kpi-credit-total").textContent = `৳${creditTotal.toLocaleString()}`;
        document.getElementById("kpi-credit-compare").textContent = `${creditLike.length} card${creditLike.length === 1 ? "" : "s"}`;
    }

    /* ==========================================================================
       Load — GET /accounts
       ========================================================================== */
    async function loadAccounts() {
        showLoadingState();

        try {
            const accounts = await apiRequest("GET", "/accounts");

            if (!accounts || accounts.length === 0) {
                showEmptyState();
            } else {
                renderAccounts(accounts);
            }

            updateKPIs(accounts || []);
        } catch (err) {
            showErrorState(err.message);
        }
    }

    /* ==========================================================================
       Modal open / close (shared for Add and Edit)
       ========================================================================== */
    const openModal = (account = null) => {
        if (!modal) return;

        form.reset();
        clearFormErrors();
        hideFormError();

        if (account) {
            modalTitle.textContent = "Edit Account";
            saveBtn.textContent = "Update Account";
            fields.id.value = account.id;
            fields.name.value = account.name || "";
            fields.institution.value = account.institution || "";
            fields.type.value = account.account_type || "";
            fields.accountNumber.value = account.account_number_masked || "";
            fields.balance.value = account.balance ?? "";
            fields.currency.value = account.currency || "BDT";
        } else {
            modalTitle.textContent = "Add Account";
            saveBtn.textContent = "Save Account";
            fields.id.value = "";
        }

        modal.hidden = false;
        fields.name?.focus();
    };

    const closeModal = () => {
        if (!modal) return;
        modal.hidden = true;
        clearFormErrors();
        hideFormError();
        form?.reset();
        addAccountBtn?.focus();
    };

    const isModalOpen = () => modal ? !modal.hidden : false;

    if (addAccountBtn && modal) {
        addAccountBtn.addEventListener("click", () => openModal(null));
    }
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);

    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isModalOpen()) closeModal();
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
        if (formErrorMessage) formErrorMessage.textContent = message;
        if (formError) formError.hidden = false;
    };

    const hideFormError = () => {
        if (formError) formError.hidden = true;
    };

    const validateForm = () => {
        let isValid = true;

        if (!fields.name.value.trim()) {
            showFieldError(fields.name, errors.name);
            isValid = false;
        } else {
            clearFieldError(fields.name, errors.name);
        }

        if (!fields.institution.value.trim()) {
            showFieldError(fields.institution, errors.institution);
            isValid = false;
        } else {
            clearFieldError(fields.institution, errors.institution);
        }

        if (!fields.type.value) {
            showFieldError(fields.type, errors.type);
            isValid = false;
        } else {
            clearFieldError(fields.type, errors.type);
        }

        const balanceValue = parseFloat(fields.balance.value);
        if (fields.balance.value.trim() === "" || Number.isNaN(balanceValue)) {
            showFieldError(fields.balance, errors.balance);
            isValid = false;
        } else {
            clearFieldError(fields.balance, errors.balance);
        }

        return isValid;
    };

    /* ==========================================================================
       Add / Edit — POST or PUT /accounts
       ========================================================================== */
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideFormError();

            if (!validateForm()) return;

            const payload = {
                name: fields.name.value.trim(),
                institution: fields.institution.value.trim(),
                account_type: fields.type.value,
                account_number_masked: fields.accountNumber.value.trim() || null,
                balance: parseFloat(fields.balance.value),
                currency: fields.currency.value,
            };

            const isEditing = Boolean(fields.id.value);
            saveBtn.disabled = true;

            try {
                if (isEditing) {
                    await apiRequest("PUT", "/accounts", { id: fields.id.value, ...payload });
                } else {
                    await apiRequest("POST", "/accounts", payload);
                }

                closeModal();
                await loadAccounts();
            } catch (err) {
                showFormError(err.message);
            } finally {
                saveBtn.disabled = false;
            }
        });
    }

    /* ==========================================================================
       Edit / Delete — row action buttons (event delegation, since rows
       are re-rendered on every load)
       ========================================================================== */
    if (tableBody) {
        tableBody.addEventListener("click", async (event) => {
            const editBtn = event.target.closest(".account-edit-btn");
            const deleteBtn = event.target.closest(".delete-btn");
            const row = event.target.closest("tr[data-id]");
            if (!row) return;

            const accountId = row.dataset.id;

            if (editBtn) {
                try {
                    const accounts = await apiRequest("GET", "/accounts");
                    const account = accounts.find((a) => a.id === accountId);
                    if (account) openModal(account);
                } catch (err) {
                    showErrorState(err.message);
                }
            }

            if (deleteBtn) {
                const accountName = row.children[0]?.textContent ?? "this account";
                const confirmed = window.confirm(`Delete "${accountName}"? This cannot be undone.`);
                if (!confirmed) return;

                try {
                    await apiRequest("DELETE", `/accounts?id=${encodeURIComponent(accountId)}`);
                    await loadAccounts();
                } catch (err) {
                    window.alert(`Couldn't delete this account: ${err.message}`);
                }
            }
        });
    }

    /* ==========================================================================
       Export — still a placeholder, unchanged from earlier parts
       ========================================================================== */
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            console.log("Export clicked — demo only, not yet connected.");
        });
    }

    /* ==========================================================================
       Init
       ========================================================================== */
    loadAccounts();

});
