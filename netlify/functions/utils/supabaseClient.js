/* ==========================================================================
   Takarivo — netlify/functions/utils/supabaseClient.js
   Purpose: Helper functions to extract authentication tokens from requests
   and create authenticated Supabase clients for Netlify functions.
   ========================================================================== */

const { createClient } = require("@supabase/supabase-js");

/**
 * Extracts the Bearer token from the incoming Netlify event headers.
 * Handles both lowercase and capitalized header names.
 *
 * @param {object} event - Netlify function event object
 * @returns {string|null} - Bearer token if present, or null
 */
function getBearerToken(event) {
  if (!event || !event.headers) return null;
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;

  const parts = authHeader.trim().split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}

/**
 * Creates a Supabase client scoped to the provided user access token.
 * Enables Supabase Row Level Security (RLS) to enforce data access policies.
 *
 * @param {string} accessToken - Authenticated user JWT
 * @returns {object} - Supabase client instance
 */
const fs = require("fs");
const path = require("path");

function normalizeSupabaseUrl(url) {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim().replace(/\/+$/, "");
  const match = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (match) {
    return `https://${match[1]}.supabase.co`;
  }
  return trimmed;
}

function isInvalidKey(val) {
  return !val || typeof val !== "string" || val.trim() === "" || val.includes("your-anon-key-here") || val.includes("your-project-ref");
}

function resolveSupabaseCredentials() {
  let supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  let supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (isInvalidKey(supabaseUrl) || isInvalidKey(supabaseAnonKey)) {
    // 1. Try reading directly from .env file
    const envCandidatePaths = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(__dirname, "../../../.env"),
    ];

    for (const envPath of envCandidatePaths) {
      try {
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
            const [key, ...rest] = trimmed.split("=");
            const val = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
            if (key.trim() === "SUPABASE_URL" && isInvalidKey(supabaseUrl) && !isInvalidKey(val)) {
              supabaseUrl = normalizeSupabaseUrl(val);
              process.env.SUPABASE_URL = supabaseUrl;
            }
            if (key.trim() === "SUPABASE_ANON_KEY" && isInvalidKey(supabaseAnonKey) && !isInvalidKey(val)) {
              supabaseAnonKey = val;
              process.env.SUPABASE_ANON_KEY = val;
            }
          }
          if (!isInvalidKey(supabaseUrl) && !isInvalidKey(supabaseAnonKey)) break;
        }
      } catch (_) {}
    }
  }

  if (isInvalidKey(supabaseUrl) || isInvalidKey(supabaseAnonKey)) {
    // 2. Try reading from js/supabase-config.js as fallback
    const configCandidatePaths = [
      path.resolve(process.cwd(), "js/supabase-config.js"),
      path.resolve(__dirname, "../../../js/supabase-config.js"),
    ];

    for (const configPath of configCandidatePaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf8");
          const urlMatch = configContent.match(/TAKARIVO_SUPABASE_URL\s*=\s*["']([^"']+)["']/);
          const keyMatch = configContent.match(/TAKARIVO_SUPABASE_ANON_KEY\s*=\s*["']([^"']+)["']/);
          if (urlMatch && isInvalidKey(supabaseUrl) && !isInvalidKey(urlMatch[1])) {
            supabaseUrl = normalizeSupabaseUrl(urlMatch[1]);
            process.env.SUPABASE_URL = supabaseUrl;
          }
          if (keyMatch && isInvalidKey(supabaseAnonKey) && !isInvalidKey(keyMatch[1])) {
            supabaseAnonKey = keyMatch[1];
            process.env.SUPABASE_ANON_KEY = keyMatch[1];
          }
          if (!isInvalidKey(supabaseUrl) && !isInvalidKey(supabaseAnonKey)) break;
        }
      } catch (_) {}
    }
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Creates a Supabase client scoped to the provided user access token.
 * Enables Supabase Row Level Security (RLS) to enforce data access policies.
 *
 * @param {string} accessToken - Authenticated user JWT
 * @returns {object} - Supabase client instance
 */
function getSupabaseClientForRequest(accessToken) {
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseCredentials();

  if (!supabaseUrl || !supabaseAnonKey || isInvalidKey(supabaseUrl) || isInvalidKey(supabaseAnonKey)) {
    throw new Error(
      "Missing or placeholder SUPABASE_URL or SUPABASE_ANON_KEY in environment variables. " +
      "Please set them in your .env file or Netlify dashboard."
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

module.exports = { getBearerToken, getSupabaseClientForRequest };
