/* ==========================================================================
   Takarivo — auth.js
   Purpose: Wires the Login, Register, Forgot Password, and Reset
   Password forms to real Supabase Auth calls. Requires
   supabaseClient.js to be loaded first (window.TakarivoSupabase).

   Only the anon key is ever used here (via TakarivoSupabase) — the
   service-role key never appears in any frontend file.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const sb = window.TakarivoSupabase;
    if (!sb) {
        console.error("Takarivo: Supabase client not initialized. Check script load order.");
        return;
    }

    /* ==========================================================================
       Shared validation helpers
       ========================================================================== */
    const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const showError = (field, errorEl) => {
        field.setAttribute("aria-invalid", "true");
        if (errorEl) errorEl.hidden = false;
    };

    const clearError = (field, errorEl) => {
        field.removeAttribute("aria-invalid");
        if (errorEl) errorEl.hidden = true;
    };

    const showBanner = (bannerEl, messageEl, message) => {
        if (messageEl) messageEl.textContent = message;
        if (bannerEl) bannerEl.hidden = false;
    };

    const hideBanner = (bannerEl) => {
        if (bannerEl) bannerEl.hidden = true;
    };

    const isSupabaseConfigured = () => {
        return (
            typeof TAKARIVO_SUPABASE_URL !== "undefined" &&
            typeof TAKARIVO_SUPABASE_ANON_KEY !== "undefined" &&
            !TAKARIVO_SUPABASE_URL.includes("your-project-ref") &&
            !TAKARIVO_SUPABASE_ANON_KEY.includes("your-anon-key") &&
            TAKARIVO_SUPABASE_URL.startsWith("https://")
        );
    };

    const getFriendlyErrorMessage = (error) => {
        if (!error) return "An unexpected error occurred.";
        if (!isSupabaseConfigured()) {
            return "Supabase credentials are not configured yet. Please update js/supabase-config.js with your Supabase Project URL and anon key.";
        }
        if (error.message === "Failed to fetch") {
            return "Unable to connect to Supabase (Failed to fetch). Please check your internet connection and verify that your Project URL in js/supabase-config.js is valid and reachable.";
        }
        return error.message;
    };

    /* ==========================================================================
       Login form (pages/login.html)
       ========================================================================== */
    const loginForm = document.getElementById("login-form");

    if (loginForm) {
        const emailField = document.getElementById("login-email");
        const passwordField = document.getElementById("login-password");
        const emailError = document.getElementById("login-email-error");
        const passwordError = document.getElementById("login-password-error");
        const errorBanner = document.getElementById("login-error-banner");
        const errorBannerMessage = document.getElementById("login-error-message");
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        const validateLoginForm = () => {
            let isValid = true;

            if (!isValidEmail(emailField.value.trim())) {
                showError(emailField, emailError);
                isValid = false;
            } else {
                clearError(emailField, emailError);
            }

            if (!passwordField.value) {
                showError(passwordField, passwordError);
                isValid = false;
            } else {
                clearError(passwordField, passwordError);
            }

            return isValid;
        };

        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideBanner(errorBanner);

            if (!validateLoginForm()) return;

            if (!isSupabaseConfigured()) {
                showBanner(errorBanner, errorBannerMessage, "Supabase credentials are not configured yet. Please update js/supabase-config.js with your Supabase Project URL and anon key.");
                return;
            }

            submitBtn.disabled = true;

            const { error } = await sb.auth.signInWithPassword({
                email: emailField.value.trim(),
                password: passwordField.value,
            });

            submitBtn.disabled = false;

            if (error) {
                showBanner(errorBanner, errorBannerMessage, getFriendlyErrorMessage(error));
                return;
            }

            // Note: "Remember me" currently has no effect on session
            // persistence — Supabase persists the session by default in
            // both cases. A shorter-lived session for unchecked "Remember
            // me" would need custom storage handling, left for a future part.

            window.location.href = "dashboard.html";
        });
    }

    /* ==========================================================================
       Forgot Password / Create Account link placeholders on the Login page
       ========================================================================== */
    const forgotPasswordLink = document.getElementById("forgot-password-link");
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", (event) => {
            event.preventDefault();
            window.location.href = "forgot-password.html";
        });
    }

    const createAccountLink = document.getElementById("create-account-link");
    if (createAccountLink) {
        createAccountLink.addEventListener("click", (event) => {
            event.preventDefault();
            window.location.href = "register.html";
        });
    }

    /* ==========================================================================
       Register form (pages/register.html)
       ========================================================================== */
    const registerForm = document.getElementById("register-form");

    if (registerForm) {
        const nameField = document.getElementById("register-name");
        const registerEmailField = document.getElementById("register-email");
        const registerPasswordField = document.getElementById("register-password");
        const confirmPasswordField = document.getElementById("register-confirm-password");
        const termsField = document.getElementById("register-terms");

        const nameError = document.getElementById("register-name-error");
        const registerEmailError = document.getElementById("register-email-error");
        const registerPasswordError = document.getElementById("register-password-error");
        const confirmPasswordError = document.getElementById("register-confirm-password-error");
        const termsError = document.getElementById("register-terms-error");
        const errorBanner = document.getElementById("register-error-banner");
        const errorBannerMessage = document.getElementById("register-error-message");
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        const validateRegisterForm = () => {
            let isValid = true;

            if (!nameField.value.trim()) {
                showError(nameField, nameError);
                isValid = false;
            } else {
                clearError(nameField, nameError);
            }

            if (!isValidEmail(registerEmailField.value.trim())) {
                showError(registerEmailField, registerEmailError);
                isValid = false;
            } else {
                clearError(registerEmailField, registerEmailError);
            }

            if (registerPasswordField.value.length < 8) {
                showError(registerPasswordField, registerPasswordError);
                isValid = false;
            } else {
                clearError(registerPasswordField, registerPasswordError);
            }

            if (!confirmPasswordField.value || confirmPasswordField.value !== registerPasswordField.value) {
                showError(confirmPasswordField, confirmPasswordError);
                isValid = false;
            } else {
                clearError(confirmPasswordField, confirmPasswordError);
            }

            if (!termsField.checked) {
                if (termsError) termsError.hidden = false;
                isValid = false;
            } else {
                if (termsError) termsError.hidden = true;
            }

            return isValid;
        };

        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideBanner(errorBanner);

            if (!validateRegisterForm()) return;

            if (!isSupabaseConfigured()) {
                showBanner(errorBanner, errorBannerMessage, "Supabase credentials are not configured yet. Please update js/supabase-config.js with your Supabase Project URL and anon key.");
                return;
            }

            submitBtn.disabled = true;

            const { error } = await sb.auth.signUp({
                email: registerEmailField.value.trim(),
                password: registerPasswordField.value,
                options: {
                    data: { full_name: nameField.value.trim() },
                },
            });

            submitBtn.disabled = false;

            if (error) {
                showBanner(errorBanner, errorBannerMessage, getFriendlyErrorMessage(error));
                return;
            }

            // Depending on your Supabase project's email confirmation
            // setting, the user may need to confirm their email before
            // they can sign in. Either way, send them to Login next.
            window.alert("Account created. Check your email to confirm, then sign in.");
            window.location.href = "login.html";
        });
    }

    /* ==========================================================================
       Forgot Password form (pages/forgot-password.html)
       ========================================================================== */
    const forgotPasswordForm = document.getElementById("forgot-password-form");

    if (forgotPasswordForm) {
        const resetEmailField = document.getElementById("reset-email");
        const resetEmailError = document.getElementById("reset-email-error");
        const formLevelError = document.getElementById("form-level-error");
        const requestState = document.getElementById("request-state");
        const successState = document.getElementById("success-state");
        const successEmailDisplay = document.getElementById("success-email-display");
        const resendLinkBtn = document.getElementById("resend-link-btn");
        const submitBtn = forgotPasswordForm.querySelector('button[type="submit"]');

        const sendResetLink = async (email) => {
            // Supabase does not reveal whether an account exists for this
            // email (by design, to avoid leaking who has an account) — a
            // successful call here does not guarantee an email was sent.
            const { error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}${window.location.pathname.replace("forgot-password.html", "reset-password.html")}`,
            });
            return error;
        };

        forgotPasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const email = resetEmailField.value.trim();
            if (formLevelError) formLevelError.hidden = true;

            if (!isValidEmail(email)) {
                showError(resetEmailField, resetEmailError);
                return;
            }
            clearError(resetEmailField, resetEmailError);

            if (!isSupabaseConfigured()) {
                showBanner(formLevelError, formLevelError?.querySelector("span"), "Supabase credentials are not configured yet. Please update js/supabase-config.js with your Supabase Project URL and anon key.");
                return;
            }

            submitBtn.disabled = true;
            const error = await sendResetLink(email);
            submitBtn.disabled = false;

            if (error) {
                showBanner(formLevelError, formLevelError?.querySelector("span"), getFriendlyErrorMessage(error));
                return;
            }

            if (successEmailDisplay) successEmailDisplay.textContent = email;
            if (requestState) requestState.hidden = true;
            if (successState) successState.hidden = false;
        });

        if (resendLinkBtn) {
            resendLinkBtn.addEventListener("click", async () => {
                const email = successEmailDisplay?.textContent ?? "";
                if (!email) return;

                resendLinkBtn.disabled = true;
                await sendResetLink(email);
                resendLinkBtn.disabled = false;

                window.alert("If an account exists for that email, another reset link has been sent.");
            });
        }
    }

    /* ==========================================================================
       Reset Password form (pages/reset-password.html)
       ========================================================================== */
    const resetPasswordForm = document.getElementById("reset-password-form");

    if (resetPasswordForm) {
        const newPasswordField = document.getElementById("new-password");
        const confirmNewPasswordField = document.getElementById("confirm-new-password");
        const newPasswordError = document.getElementById("new-password-error");
        const confirmNewPasswordError = document.getElementById("confirm-new-password-error");
        const errorBanner = document.getElementById("reset-error-banner");
        const errorBannerMessage = document.getElementById("reset-error-message");

        const strengthBarFill = document.getElementById("strength-bar-fill");
        const strengthLabel = document.getElementById("strength-label");
        const requirementItems = document.querySelectorAll("#requirements-list li");

        const resetRequestState = document.getElementById("reset-request-state");
        const resetSuccessState = document.getElementById("reset-success-state");
        const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');

        const passwordRequirements = {
            length: (value) => value.length >= 8,
            uppercase: (value) => /[A-Z]/.test(value),
            lowercase: (value) => /[a-z]/.test(value),
            number: (value) => /[0-9]/.test(value),
        };

        const getMetRequirements = (value) =>
            Object.keys(passwordRequirements).filter((key) => passwordRequirements[key](value));

        const isPasswordValid = (value) => getMetRequirements(value).length === Object.keys(passwordRequirements).length;

        const updatePasswordFeedback = () => {
            const value = newPasswordField.value;
            const metKeys = getMetRequirements(value);

            requirementItems.forEach((item) => {
                const requirement = item.dataset.requirement;
                item.classList.toggle("met", metKeys.includes(requirement));
            });

            const metCount = metKeys.length;
            strengthBarFill.classList.remove("weak", "medium", "strong");

            if (value.length === 0) {
                strengthLabel.textContent = "Password strength";
            } else if (metCount <= 2) {
                strengthBarFill.classList.add("weak");
                strengthLabel.textContent = "Weak";
            } else if (metCount === 3) {
                strengthBarFill.classList.add("medium");
                strengthLabel.textContent = "Medium";
            } else {
                strengthBarFill.classList.add("strong");
                strengthLabel.textContent = "Strong";
            }
        };

        newPasswordField.addEventListener("input", updatePasswordFeedback);

        resetPasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideBanner(errorBanner);

            let isValid = true;

            if (!isPasswordValid(newPasswordField.value)) {
                showError(newPasswordField, newPasswordError);
                isValid = false;
            } else {
                clearError(newPasswordField, newPasswordError);
            }

            if (!confirmNewPasswordField.value || confirmNewPasswordField.value !== newPasswordField.value) {
                showError(confirmNewPasswordField, confirmNewPasswordError);
                isValid = false;
            } else {
                clearError(confirmNewPasswordField, confirmNewPasswordError);
            }

            if (!isValid) return;

            if (!isSupabaseConfigured()) {
                showBanner(errorBanner, errorBannerMessage, "Supabase credentials are not configured yet. Please update js/supabase-config.js with your Supabase Project URL and anon key.");
                return;
            }

            // This only succeeds if the page was opened via a valid Supabase
            // password-recovery link, which establishes a temporary session.
            submitBtn.disabled = true;
            const { error } = await sb.auth.updateUser({ password: newPasswordField.value });
            submitBtn.disabled = false;

            if (error) {
                showBanner(errorBanner, errorBannerMessage, getFriendlyErrorMessage(error));
                return;
            }

            if (resetRequestState) resetRequestState.hidden = true;
            if (resetSuccessState) resetSuccessState.hidden = false;
        });
    }

});
