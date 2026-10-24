/* ==========================================================================
   Takarivo — goals.js
   Purpose: Loads, creates, edits, and deletes goals via the real Goals
   API (netlify/functions/goals.js), plus the dedicated Contribution
   endpoint (goals-contribution.js), backed by Supabase. Replaces the
   demo/in-memory data and calculations from earlier parts — Saved,
   Remaining, Progress, and Status are now all sourced from the API.
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
    const tableBody = document.getElementById("goals-table-body");

    const addGoalBtn = document.getElementById("add-goal-btn");
    const goalModal = document.getElementById("goal-modal");
    const goalModalTitle = document.getElementById("goal-modal-title");
    const goalModalCloseBtn = document.getElementById("goal-modal-close-btn");
    const goalModalCancelBtn = document.getElementById("goal-modal-cancel-btn");
    const goalForm = document.getElementById("goal-form");
    const saveGoalBtn = document.getElementById("save-goal-btn");
    const goalFormError = document.getElementById("goal-form-error");
    const goalFormErrorMessage = document.getElementById("goal-form-error-message");

    const fields = {
        id: document.getElementById("goal-id"),
        name: document.getElementById("goal-name"),
        category: document.getElementById("goal-category"),
        targetDate: document.getElementById("goal-target-date"),
        targetAmount: document.getElementById("goal-target-amount"),
        savedAmount: document.getElementById("goal-saved-amount"),
    };

    const errors = {
        name: document.getElementById("goal-name-error"),
        category: document.getElementById("goal-category-error"),
        targetDate: document.getElementById("goal-target-date-error"),
        targetAmount: document.getElementById("goal-target-amount-error"),
    };

    const statusLabel = {
        "in-progress": "In Progress",
        "completed": "Completed",
    };

    let goals = [];

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
        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    };

    const progressLevel = (percentage) => {
        if (percentage >= 90) return "high";
        if (percentage >= 50) return "medium";
        return "low";
    };

    /* ==========================================================================
       Table states
       ========================================================================== */
    function showLoadingState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="9"><p class="help-text">Loading goals…</p></td>
            </tr>
        `;
    }

    function showEmptyState() {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="9"><p class="help-text">No goals yet. Click "Add Goal" to create your first one.</p></td>
            </tr>
        `;
    }

    function showErrorState(message) {
        tableBody.innerHTML = `
            <tr class="table-status-row">
                <td colspan="9">
                    <p class="help-text is-error">${message}</p>
                    <button type="button" class="outline-button small-button" id="retry-load-goals-btn">Retry</button>
                </td>
            </tr>
        `;
        document.getElementById("retry-load-goals-btn")?.addEventListener("click", loadGoals);
    }

    /* ==========================================================================
       Render
       ========================================================================== */
    function renderGoals(goalList) {
        tableBody.innerHTML = "";

        goalList.forEach((goal) => {
            const progress = Number(goal.progress) || 0;
            const level = progressLevel(progress);

            const row = document.createElement("tr");
            row.dataset.id = goal.id;

            row.innerHTML = `
                <td>${goal.name}</td>
                <td><span class="category-tag" data-category="${goal.category}">${goal.category}</span></td>
                <td>${formatCurrency(goal.target_amount)}</td>
                <td>${formatCurrency(goal.saved_amount)}</td>
                <td class="amount income">${formatCurrency(goal.remaining)}</td>
                <td>
                    <div class="utilization">
                        <div class="utilization-bar"><div class="utilization-fill ${level}" style="width: ${Math.min(progress, 100).toFixed(1)}%;"></div></div>
                        <span class="help-text">${progress.toFixed(1)}%</span>
                    </div>
                </td>
                <td>${formatDisplayDate(goal.target_date)}</td>
                <td><span class="status-tag ${goal.status}">${statusLabel[goal.status] || goal.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="outline-button small-button goal-edit-btn">Edit</button>
                        <button type="button" class="primary-button small-button contribute-btn">Contribute</button>
                        <button type="button" class="icon-button icon-button-sm delete-btn" aria-label="Delete goal">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h10M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    /* ==========================================================================
       KPI cards — computed from the loaded goals
       ========================================================================== */
    function updateKPIs(goalList) {
        const totalTarget = goalList.reduce((sum, g) => sum + Number(g.target_amount), 0);
        const totalSaved = goalList.reduce((sum, g) => sum + Number(g.saved_amount), 0);
        const totalRemaining = Math.max(0, totalTarget - totalSaved);
        const completedCount = goalList.filter((g) => g.status === "completed").length;

        document.getElementById("kpi-total-goals").textContent = String(goalList.length);
        document.getElementById("kpi-total-target").textContent = formatCurrency(totalTarget);
        document.getElementById("kpi-total-saved").textContent = formatCurrency(totalSaved);
        document.getElementById("kpi-remaining").textContent = formatCurrency(totalRemaining);
        document.getElementById("kpi-completed").textContent = String(completedCount);
    }

    /* ==========================================================================
       Load — GET /goals
       ========================================================================== */
    async function loadGoals() {
        showLoadingState();

        try {
            goals = await apiRequest("GET", "/goals");

            if (!goals || goals.length === 0) {
                showEmptyState();
            } else {
                renderGoals(goals);
            }

            updateKPIs(goals || []);
        } catch (err) {
            showErrorState(err.message);
        }
    }

    /* ==========================================================================
       Modal open / close (shared for Add and Edit)
       ========================================================================== */
    const openGoalModal = (goal = null) => {
        if (!goalModal) return;

        goalForm.reset();
        clearFormErrors();
        hideFormError();

        if (goal) {
            goalModalTitle.textContent = "Edit Goal";
            saveGoalBtn.textContent = "Update Goal";
            fields.id.value = goal.id;
            fields.name.value = goal.name || "";
            fields.category.value = goal.category || "";
            fields.targetDate.value = goal.target_date || "";
            fields.targetAmount.value = goal.target_amount ?? "";
            fields.savedAmount.value = goal.saved_amount ?? "";
        } else {
            goalModalTitle.textContent = "Add Goal";
            saveGoalBtn.textContent = "Save Goal";
            fields.id.value = "";
        }

        goalModal.hidden = false;
        fields.name?.focus();
    };

    const closeGoalModal = () => {
        if (!goalModal) return;
        goalModal.hidden = true;
        clearFormErrors();
        hideFormError();
        goalForm?.reset();
        addGoalBtn?.focus();
    };

    const isGoalModalOpen = () => goalModal ? !goalModal.hidden : false;

    if (addGoalBtn && goalModal) {
        addGoalBtn.addEventListener("click", () => openGoalModal(null));
    }
    if (goalModalCloseBtn) goalModalCloseBtn.addEventListener("click", closeGoalModal);
    if (goalModalCancelBtn) goalModalCancelBtn.addEventListener("click", closeGoalModal);

    if (goalModal) {
        goalModal.addEventListener("click", (event) => {
            if (event.target === goalModal) closeGoalModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isGoalModalOpen()) closeGoalModal();
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
        if (goalFormErrorMessage) goalFormErrorMessage.textContent = message;
        if (goalFormError) goalFormError.hidden = false;
    };

    const hideFormError = () => {
        if (goalFormError) goalFormError.hidden = true;
    };

    const validateForm = () => {
        let isValid = true;

        if (!fields.name.value.trim()) {
            showFieldError(fields.name, errors.name);
            isValid = false;
        } else {
            clearFieldError(fields.name, errors.name);
        }

        if (!fields.category.value) {
            showFieldError(fields.category, errors.category);
            isValid = false;
        } else {
            clearFieldError(fields.category, errors.category);
        }

        if (!fields.targetDate.value) {
            showFieldError(fields.targetDate, errors.targetDate);
            isValid = false;
        } else {
            clearFieldError(fields.targetDate, errors.targetDate);
        }

        const targetValue = parseFloat(fields.targetAmount.value);
        if (fields.targetAmount.value.trim() === "" || Number.isNaN(targetValue) || targetValue <= 0) {
            showFieldError(fields.targetAmount, errors.targetAmount);
            isValid = false;
        } else {
            clearFieldError(fields.targetAmount, errors.targetAmount);
        }

        return isValid;
    };

    /* ==========================================================================
       Add / Edit — POST or PUT /goals
       ========================================================================== */
    if (goalForm) {
        goalForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideFormError();

            if (!validateForm()) return;

            const payload = {
                name: fields.name.value.trim(),
                category: fields.category.value,
                target_date: fields.targetDate.value,
                target_amount: parseFloat(fields.targetAmount.value),
            };

            const isEditing = Boolean(fields.id.value);
            if (fields.savedAmount.value.trim() !== "") {
                payload.saved_amount = parseFloat(fields.savedAmount.value);
            }

            saveGoalBtn.disabled = true;

            try {
                if (isEditing) {
                    await apiRequest("PUT", "/goals", { id: fields.id.value, ...payload });
                } else {
                    await apiRequest("POST", "/goals", payload);
                }

                closeGoalModal();
                await loadGoals();
            } catch (err) {
                showFormError(err.message);
            } finally {
                saveGoalBtn.disabled = false;
            }
        });
    }

    /* ==========================================================================
       Row actions — Edit / Delete / Contribute
       ========================================================================== */
    tableBody.addEventListener("click", async (event) => {
        const editBtn = event.target.closest(".goal-edit-btn");
        const deleteBtn = event.target.closest(".delete-btn");
        const contributeBtn = event.target.closest(".contribute-btn");
        const row = event.target.closest("tr[data-id]");
        if (!row) return;

        const goalId = row.dataset.id;
        const goal = goals.find((g) => g.id === goalId);
        const goalName = goal?.name || "this goal";

        if (editBtn && goal) {
            openGoalModal(goal);
        }

        if (deleteBtn) {
            const confirmed = window.confirm(`Delete "${goalName}"? This cannot be undone.`);
            if (!confirmed) return;

            try {
                await apiRequest("DELETE", `/goals?id=${encodeURIComponent(goalId)}`);
                await loadGoals();
            } catch (err) {
                window.alert(`Couldn't delete this goal: ${err.message}`);
            }
        }

        if (contributeBtn) {
            const input = window.prompt(`Add a contribution to "${goalName}" (৳):`);
            if (input === null) return;

            const amount = parseFloat(input);
            if (Number.isNaN(amount) || amount <= 0) {
                window.alert("Please enter a valid amount greater than 0.");
                return;
            }

            try {
                await apiRequest("POST", "/goals-contribution", { goal_id: goalId, amount });
                await loadGoals();
            } catch (err) {
                window.alert(`Couldn't add contribution: ${err.message}`);
            }
        }
    });

    /* ==========================================================================
       Init
       ========================================================================== */
    loadGoals();

});
