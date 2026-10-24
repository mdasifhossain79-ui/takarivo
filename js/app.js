/* ==========================================================================
   Takarivo — app.js
   Purpose: General app-wide JavaScript (not navigation-specific).
   Sidebar, mobile menu, and profile dropdown logic live in
   js/navigation.js. This file currently handles the homepage's
   Login / Get Started buttons.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const loginBtn = document.getElementById("login-btn");
    const getStartedBtn = document.getElementById("get-started-btn");

    if (loginBtn) {
        loginBtn.addEventListener("click", () => {
            window.location.href = "pages/login.html";
        });
    }

    if (getStartedBtn) {
        getStartedBtn.addEventListener("click", () => {
            window.location.href = "pages/register.html";
        });
    }

});
