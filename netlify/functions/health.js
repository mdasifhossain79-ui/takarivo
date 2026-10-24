/* ==========================================================================
   Takarivo — netlify/functions/health.js
   Purpose: Simple health-check endpoint to confirm the Netlify Functions
   backend is wired up and reachable. No database, no external calls.
   ========================================================================== */

exports.handler = async function handler() {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      success: true,
      message: "Takarivo API is running",
    }),
  };
};
