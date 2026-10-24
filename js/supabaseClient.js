/* ==========================================================================
   Takarivo — supabaseClient.js
   Purpose: Initializes a single shared Supabase browser client for the
   whole frontend. Requires (in this order, before this file):
     1. The Supabase JS SDK from CDN
     2. supabase-config.js

   The initialized client is exposed as window.TakarivoSupabase, so it
   doesn't collide with the SDK's own global `supabase` namespace.
   ========================================================================== */

(function initTakarivoSupabaseClient() {
  if (typeof supabase === "undefined") {
    console.error("Takarivo: Supabase SDK not loaded. Check the CDN <script> tag order.");
    return;
  }

  if (typeof TAKARIVO_SUPABASE_URL === "undefined" || typeof TAKARIVO_SUPABASE_ANON_KEY === "undefined") {
    console.error("Takarivo: supabase-config.js not loaded before supabaseClient.js.");
    return;
  }

  if (TAKARIVO_SUPABASE_URL.includes("your-project-ref")) {
    console.warn(
      "Takarivo: supabase-config.js still has placeholder values. " +
      "Auth calls will fail until you set your real Project URL and anon key."
    );
  }

  window.TakarivoSupabase = supabase.createClient(TAKARIVO_SUPABASE_URL, TAKARIVO_SUPABASE_ANON_KEY);
})();
