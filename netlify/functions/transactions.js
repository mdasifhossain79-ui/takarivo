/* ==========================================================================
   Takarivo — netlify/functions/transactions.js
   Purpose: CRUD API for a user's transactions, backed by Supabase.
   GET    -> list the authenticated user's transactions (optional filters)
   POST   -> create a new transaction (income, expense, or transfer)
   PUT    -> update an existing transaction (id required in body)
   DELETE -> delete a transaction (id required as a query parameter)

   Auth: every request must include "Authorization: Bearer <access_token>".
   The Supabase client is scoped to that token, so Row Level Security
   (see database/transactions.sql) enforces that users only ever see or
   modify their own transaction rows.

   Cross-user access prevention: RLS on the transactions table only
   guarantees user_id = auth.uid() for the transaction row itself — it
   does NOT stop someone from pointing account_id/card_id at an account
   or card that belongs to a different user. This function explicitly
   verifies ownership of the referenced account (and card, if provided)
   before every insert/update, on top of RLS.
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

const TRANSACTION_TYPES = ["income", "expense", "transfer"];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

/**
 * Validates transaction input.
 * `partial` = true for PUT, where only the fields being changed must be valid.
 */
function validateTransactionInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.account_id !== undefined) {
    if (!body.account_id || typeof body.account_id !== "string") {
      errors.push("account_id is required.");
    }
  }

  if (!partial || body.date !== undefined) {
    if (!isValidDate(body.date)) {
      errors.push("date is required and must be a valid date in YYYY-MM-DD format.");
    }
  }

  if (!partial || body.description !== undefined) {
    if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
      errors.push("description is required.");
    }
  }

  if (!partial || body.category !== undefined) {
    if (!body.category || typeof body.category !== "string" || !body.category.trim()) {
      errors.push("category is required.");
    }
  }

  if (!partial || body.transaction_type !== undefined) {
    if (!TRANSACTION_TYPES.includes(body.transaction_type)) {
      errors.push(`transaction_type must be one of: ${TRANSACTION_TYPES.join(", ")}.`);
    }
  }

  if (!partial || body.amount !== undefined) {
    if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount <= 0) {
      errors.push("amount is required and must be a number greater than 0.");
    }
  }

  if (body.card_id !== undefined && body.card_id !== null && typeof body.card_id !== "string") {
    errors.push("card_id must be a string or null.");
  }

  if (body.merchant !== undefined && body.merchant !== null && typeof body.merchant !== "string") {
    errors.push("merchant must be a string.");
  }

  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
    errors.push("notes must be a string.");
  }

  return errors;
}

/**
 * Confirms an account_id belongs to the current user. Relies on RLS to
 * hide other users' rows entirely — a missing result means "not found
 * or not yours," which is exactly the response we want either way.
 */
async function verifyAccountOwnership(supabase, accountId) {
  const { data, error: dbError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .single();

  if (dbError || !data) return false;
  return true;
}

/**
 * Same idea as verifyAccountOwnership, for the optional card_id field.
 */
async function verifyCardOwnership(supabase, cardId) {
  const { data, error: dbError } = await supabase
    .from("cards")
    .select("id")
    .eq("id", cardId)
    .single();

  if (dbError || !data) return false;
  return true;
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
    console.error("Auth error in transactions function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }
  const userId = userData.user.id;

  try {
    switch (event.httpMethod) {
      // --- GET: list the user's transactions (optional filters) ------------
      case "GET": {
        const params = event.queryStringParameters || {};
        let query = supabase.from("transactions").select("*").order("date", { ascending: false });

        if (params.account_id) query = query.eq("account_id", params.account_id);
        if (params.category) query = query.eq("category", params.category);
        if (params.transaction_type) {
          if (!TRANSACTION_TYPES.includes(params.transaction_type)) {
            return error(`transaction_type must be one of: ${TRANSACTION_TYPES.join(", ")}.`, 422);
          }
          query = query.eq("transaction_type", params.transaction_type);
        }
        if (params.date) {
          if (!isValidDate(params.date)) return error("date filter must be in YYYY-MM-DD format.", 422);
          query = query.eq("date", params.date);
        }

        const { data, error: dbError } = await query;
        if (dbError) return error(dbError.message, 500);
        return success(data, "Transactions retrieved successfully.");
      }

      // --- POST: create a new transaction -----------------------------------
      case "POST": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        const validationErrors = validateTransactionInput(body);
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const accountOwned = await verifyAccountOwnership(supabase, body.account_id);
        if (!accountOwned) {
          return error("account_id does not exist or does not belong to you.", 403);
        }

        if (body.card_id) {
          const cardOwned = await verifyCardOwnership(supabase, body.card_id);
          if (!cardOwned) {
            return error("card_id does not exist or does not belong to you.", 403);
          }
        }

        const { data, error: dbError } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            account_id: body.account_id,
            card_id: body.card_id || null,
            date: body.date,
            description: body.description.trim(),
            merchant: body.merchant?.trim() || null,
            category: body.category.trim(),
            transaction_type: body.transaction_type,
            amount: body.amount,
            notes: body.notes?.trim() || null,
          })
          .select()
          .single();

        if (dbError) return error(dbError.message, 500);
        return success(data, "Transaction created successfully.", 201);
      }

      // --- PUT: update an existing transaction ------------------------------
      case "PUT": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        if (!body.id || typeof body.id !== "string") {
          return error("id is required to update a transaction.", 400);
        }

        const validationErrors = validateTransactionInput(body, { partial: true });
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        if (body.account_id !== undefined) {
          const accountOwned = await verifyAccountOwnership(supabase, body.account_id);
          if (!accountOwned) return error("account_id does not exist or does not belong to you.", 403);
        }

        if (body.card_id) {
          const cardOwned = await verifyCardOwnership(supabase, body.card_id);
          if (!cardOwned) return error("card_id does not exist or does not belong to you.", 403);
        }

        const updates = {};
        if (body.account_id !== undefined) updates.account_id = body.account_id;
        if (body.card_id !== undefined) updates.card_id = body.card_id;
        if (body.date !== undefined) updates.date = body.date;
        if (body.description !== undefined) updates.description = body.description.trim();
        if (body.merchant !== undefined) updates.merchant = body.merchant?.trim() || null;
        if (body.category !== undefined) updates.category = body.category.trim();
        if (body.transaction_type !== undefined) updates.transaction_type = body.transaction_type;
        if (body.amount !== undefined) updates.amount = body.amount;
        if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

        if (Object.keys(updates).length === 0) {
          return error("No valid fields provided to update.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("transactions")
          .update(updates)
          .eq("id", body.id)
          .select()
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") return error("Transaction not found.", 404);
          return error(dbError.message, 500);
        }

        return success(data, "Transaction updated successfully.");
      }

      // --- DELETE: remove a transaction ---------------------------------------
      case "DELETE": {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return error("id query parameter is required to delete a transaction.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", id)
          .select()
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") return error("Transaction not found.", 404);
          return error(dbError.message, 500);
        }

        return success(data, "Transaction deleted successfully.");
      }

      default:
        return error(`Method ${event.httpMethod} is not allowed on this endpoint.`, 405);
    }
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
