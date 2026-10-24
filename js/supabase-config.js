/* ==========================================================================
   Takarivo — supabase-config.js
   Purpose: Public Supabase project configuration for the browser client.

   The anon key below is SAFE to expose in frontend code — Supabase is
   designed for this. Row Level Security policies (see database/*.sql)
   enforce per-user access; the anon key alone cannot bypass them.

   NEVER put the service-role key in this file, or anywhere under js/.
   The service-role key only belongs in Netlify environment variables,
   used exclusively inside netlify/functions/ server-side code.

   Replace the placeholders below with your real project values from
   README_SUPABASE.md (Project Settings -> API) before auth will work.
   ========================================================================== */


const TAKARIVO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4eXdld3ZtdG92Z3R3emF4dGlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMzQyNDgsImV4cCI6MjEwNTgxMDI0OH0.yaKPNRqlUSG15s773CvHEXisj7lcldPK3LHRI2rKV0U";

const TAKARIVO_SUPABASE_URL = "https://zxywewvmtovgtwzaxtil.supabase.co";
