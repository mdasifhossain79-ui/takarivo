/* ==========================================================================
   Takarivo — settings.js
   Purpose: Interactivity for the Settings page — form submissions,
   password validation, category management, and Data & Privacy actions.
   No backend, no database — nothing here is persisted; changes are
   logged to the console and reset on page reload.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ==========================================================================
       Generic "Save" handler for simple settings forms
       (Profile, Security, Notifications, Appearance, Currency)
       ========================================================================== */
    const wireSaveForm = (formId, label) => {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(form).entries());
            console.log(`${label} saved (demo only, not persisted):`, data);
        });
    };

    wireSaveForm("profile-form", "Profile");
    wireSaveForm("security-form", "Security settings");
    wireSaveForm("notifications-form", "Notification preferences");
    wireSaveForm("appearance-form", "Appearance preference");
    wireSaveForm("currency-form", "Currency preference");

    /* ==========================================================================
       Password — basic validation before "saving"
       ========================================================================== */
    const passwordForm = document.getElementById("password-form");
    const currentPassword = document.getElementById("current-password");
    const newPassword = document.getElementById("new-password");
    const confirmPassword = document.getElementById("confirm-password");
    const confirmPasswordError = document.getElementById("confirm-password-error");

    if (passwordForm) {
        passwordForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const isMismatch = newPassword.value !== confirmPassword.value;
            const isEmpty = !currentPassword.value || !newPassword.value || !confirmPassword.value;

            if (isMismatch || isEmpty) {
                confirmPassword.setAttribute("aria-invalid", "true");
                if (confirmPasswordError) {
                    confirmPasswordError.hidden = false;
                    confirmPasswordError.textContent = isEmpty
                        ? "All password fields are required."
                        : "Passwords do not match.";
                }
                return;
            }

            confirmPassword.removeAttribute("aria-invalid");
            if (confirmPasswordError) confirmPasswordError.hidden = true;

            console.log("Password updated (demo only, not persisted).");
            passwordForm.reset();
        });
    }

    /* ==========================================================================
       Categories — add / remove chips (in-memory only)
       ========================================================================== */
    const categoryList = document.getElementById("category-list");
    const addCategoryForm = document.getElementById("add-category-form");
    const newCategoryInput = document.getElementById("new-category-name");

    const removeCategoryChip = (chip) => {
        const name = chip.dataset.category;
        chip.remove();
        console.log(`Category removed (demo only, not persisted): ${name}`);
    };

    if (categoryList) {
        categoryList.addEventListener("click", (event) => {
            const removeBtn = event.target.closest(".chip-remove");
            if (!removeBtn) return;
            const chip = removeBtn.closest(".category-chip");
            if (chip) removeCategoryChip(chip);
        });
    }

    if (addCategoryForm && categoryList) {
        addCategoryForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const name = newCategoryInput.value.trim();
            if (!name) return;

            const chip = document.createElement("span");
            chip.className = "category-chip";
            chip.dataset.category = name;
            chip.innerHTML = `${name} <button type="button" class="chip-remove" aria-label="Remove ${name}">&times;</button>`;

            categoryList.appendChild(chip);
            console.log(`Category added (demo only, not persisted): ${name}`);

            addCategoryForm.reset();
            newCategoryInput.focus();
        });
    }

    /* ==========================================================================
       Data & Privacy
       ========================================================================== */
    const exportDataBtn = document.getElementById("export-data-btn");
    const deleteAccountBtn = document.getElementById("delete-account-btn");

    if (exportDataBtn) {
        exportDataBtn.addEventListener("click", () => {
            console.log("Export My Data clicked — demo only, not yet connected.");
        });
    }

    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener("click", () => {
            const confirmed = window.confirm(
                "Are you sure you want to delete your account? This cannot be undone."
            );
            if (confirmed) {
                console.log("Delete Account confirmed — demo only, no account was actually deleted.");
            }
        });
    }

});
