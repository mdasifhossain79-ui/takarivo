/* ==========================================================================
   Takarivo — netlify/functions/utils/response.js
   Purpose: Shared helpers so every API function returns the exact same
   JSON shape, success or error.
   ========================================================================== */

const jsonHeaders = { "Content-Type": "application/json" };

function success(data, message = "", statusCode = 200) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify({
      success: true,
      data: data ?? null,
      message,
    }),
  };
}

function error(message, statusCode = 400) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify({
      success: false,
      data: null,
      message,
    }),
  };
}

module.exports = { success, error };

