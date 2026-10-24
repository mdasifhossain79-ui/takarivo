/* ==========================================================================
   Takarivo — authGuard.js
   Purpose: Protects app-shell pages (Dashboard, Accounts, Transactions,
   etc.) from unauthenticated access, and wires up the sidebar Logout
   button. Must be loaded early in <head>, after supabaseClient.js.

   How the guard works: the page is hidden immediately (synchronously,
   before it can render) via documentElement.style.visibility. Once the
   session check resolves, the page is either revealed (signed in) or
   the browser is redirected to login.html (not signed in) — so a
   signed-out user never sees protected content, even briefly.

   Note: this is a client-side-only guard (no server-side rendering is
   involved in this static site), so it relies on running before the
   rest of the page paints. It is not a substitute for Row Level
   Security — RLS (see database/*.sql) is what actually protects the
   data; this guard only protects the UI experience.
   ========================================================================== */

// Hide the page immediately, before it has a chance to render.
document.documentElement.style.visibility = "hidden";

(async function checkAuthAndInit() {
  const sb = window.TakarivoSupabase;

  if (!sb) {
    console.error("Takarivo: Supabase client not initialized. Check script load order.");
    document.documentElement.style.visibility = "visible";
    return;
  }

  const { data, error } = await sb.auth.getSession();

  if (error || !data?.session) {
    window.location.href = "login.html";
    return;
  }

  // Authenticated — safe to show the page.
  document.documentElement.style.visibility = "visible";

  // Wire up the sidebar Logout button, once the DOM is ready.
  const attachLogout = () => {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "login.html";
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachLogout);
  } else {
    attachLogout();
  }

  // Keep the guard reactive: if the session ends in another tab
  // (e.g. logout elsewhere), redirect this tab too.
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      window.location.href = "login.html";
    }
  });
})();
