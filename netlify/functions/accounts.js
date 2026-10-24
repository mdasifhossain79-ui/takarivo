/* ==========================================================================
   Takarivo — netlify/functions/accounts.js
   Purpose: CRUD API for a user's accounts, backed by Supabase.
   GET    -> list the authenticated user's accounts
   POST   -> create a new account
   PUT    -> update an existing account (id required in body)
   DELETE -> delete an account (id required as a query parameter)

   Auth: every request must include "Authorization: Bearer <access_token>".
   The Supabase client is scoped to that token, so Row Level Security
   (see database/accounts.sql) enforces that users only ever see or
   modify their own rows — this function does not manually filter by
   user_id for reads, RLS already guarantees it.
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

const ACCOUNT_TYPES = ["Bank", "Savings", "Cash", "MFS", "Credit"];
const CURRENCIES = ["BDT", "USD", "EUR", "GBP"];

/**
 * Validates account input.
 * `partial` = true for PUT, where only the fields being changed are required to be valid.
 */
function validateAccountInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      errors.push("name is required.");
    }
  }

  if (!partial || body.account_type !== undefined) {
    if (!ACCOUNT_TYPES.includes(body.account_type)) {
      errors.push(`account_type must be one of: ${ACCOUNT_TYPES.join(", ")}.`);
    }
  }

  if (body.currency !== undefined && !CURRENCIES.includes(body.currency)) {
    errors.push(`currency must be one of: ${CURRENCIES.join(", ")}.`);
  }

  if (body.balance !== undefined && typeof body.balance !== "number") {
    errors.push("balance must be a number.");
  }

  if (body.institution !== undefined && typeof body.institution !== "string") {
    errors.push("institution must be a string.");
  }

  if (body.account_number_masked !== undefined && typeof body.account_number_masked !== "string") {
    errors.push("account_number_masked must be a string.");
  }

  return errors;
}

exports.handler = async function handler(event) {
  // --- Authentication ---------------------------------------------------
  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return error("Missing or invalid Authorization header.", 401);
  }

  const supabase = getSupabaseClientForRequest(accessToken);

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    console.error("Auth error in accounts function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }
  const userId = userData.user.id;

  try {
    switch (event.httpMethod) {
      // --- GET: list the user's accounts ---------------------------------
      case "GET": {
        const { data, error: dbError } = await supabase
          .from("accounts")
          .select("*")
          .order("created_at", { ascending: false });

        if (dbError) return error(dbError.message, 500);
        return success(data, "Accounts retrieved successfully.");
      }

      // --- POST: create a new account -------------------------------------
      case "POST": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        const validationErrors = validateAccountInput(body);
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const { data, error: dbError } = await supabase
          .from("accounts")
          .insert({
            user_id: userId,
            name: body.name.trim(),
            institution: body.institution?.trim() || null,
            account_type: body.account_type,
            account_number_masked: body.account_number_masked || null,
            balance: body.balance ?? 0,
            currency: body.currency || "BDT",
          })
          .select()
          .single();

        if (dbError) return error(dbError.message, 500);
        return success(data, "Account created successfully.", 201);
      }

      // --- PUT: update an existing account --------------------------------
      case "PUT": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        if (!body.id || typeof body.id !== "string") {
          return error("id is required to update an account.", 400);
        }

        const validationErrors = validateAccountInput(body, { partial: true });
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const updates = {};
        if (body.name !== undefined) updates.name = body.name.trim();
        if (body.institution !== undefined) updates.institution = body.institution?.trim() || null;
        if (body.account_type !== undefined) updates.account_type = body.account_type;
        if (body.account_number_masked !== undefined) updates.account_number_masked = body.account_number_masked;
        if (body.balance !== undefined) updates.balance = body.balance;
        if (body.currency !== undefined) updates.currency = body.currency;
        if (body.status !== undefined) updates.status = body.status;

        if (Object.keys(updates).length === 0) {
          return error("No valid fields provided to update.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("accounts")
          .update(updates)
          .eq("id", body.id)
          .select()
          .single();

        if (dbError) {
          // No matching row (either it doesn't exist, or RLS hid someone else's row)
          if (dbError.code === "PGRST116") return error("Account not found.", 404);
          return error(dbError.message, 500);
        }

        return success(data, "Account updated successfully.");
      }

      // --- DELETE: remove an account ---------------------------------------
      case "DELETE": {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return error("id query parameter is required to delete an account.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("accounts")
          .delete()
          .eq("id", id)
          .select()
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") return error("Account not found.", 404);
          return error(dbError.message, 500);
        }

        return success(data, "Account deleted successfully.");
      }

      default:
        return error(`Method ${event.httpMethod} is not allowed on this endpoint.`, 405);
    }
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
