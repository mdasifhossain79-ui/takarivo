/* ==========================================================================
   Takarivo — netlify/functions/cards.js
   Purpose: CRUD API for a user's credit cards, backed by Supabase.
   GET    -> list the authenticated user's credit cards
   POST   -> create a new credit card
   PUT    -> update an existing credit card (id required in body)
   DELETE -> delete a credit card (id required as a query parameter)

   Auth: every request must include "Authorization: Bearer <access_token>".
   The Supabase client is scoped to that token, so Row Level Security
   (see database/cards.sql) enforces that users only ever see or
   modify their own rows.
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

const CARD_STATUSES = ["Active", "Frozen", "Closed"];

function validateCardInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.bank_name !== undefined) {
    if (!body.bank_name || typeof body.bank_name !== "string" || !body.bank_name.trim()) {
      errors.push("bank_name is required.");
    }
  }

  if (!partial || body.card_name !== undefined) {
    if (!body.card_name || typeof body.card_name !== "string" || !body.card_name.trim()) {
      errors.push("card_name is required.");
    }
  }

  if (!partial || body.credit_limit !== undefined) {
    const limit = Number(body.credit_limit);
    if (typeof limit !== "number" || Number.isNaN(limit) || limit <= 0) {
      errors.push("credit_limit must be a positive number.");
    }
  }

  if (body.due_amount !== undefined) {
    const due = Number(body.due_amount);
    if (typeof due !== "number" || Number.isNaN(due) || due < 0) {
      errors.push("due_amount must be a non-negative number.");
    }
    if (body.credit_limit !== undefined && due > Number(body.credit_limit)) {
      errors.push("due_amount cannot exceed credit_limit.");
    }
  }

  if (body.status !== undefined && !CARD_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${CARD_STATUSES.join(", ")}.`);
  }

  return errors;
}

exports.handler = async function handler(event) {
  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return error("Missing or invalid Authorization header.", 401);
  }

  let supabase;
  try {
    supabase = getSupabaseClientForRequest(accessToken);
  } catch (err) {
    return error(err.message, 500);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    console.error("Auth error in cards function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }
  const userId = userData.user.id;

  try {
    switch (event.httpMethod) {
      // --- GET: list user's cards -----------------------------------------
      case "GET": {
        const { data, error: dbError } = await supabase
          .from("cards")
          .select("*")
          .order("created_at", { ascending: false });

        if (dbError) return error(dbError.message, 500);
        return success(data || [], "Cards retrieved successfully.");
      }

      // --- POST: create a new card ---------------------------------------
      case "POST": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        const validationErrors = validateCardInput(body);
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const insertPayload = {
          user_id: userId,
          bank_name: body.bank_name.trim(),
          card_name: body.card_name.trim(),
          card_type: body.card_type?.trim() || null,
          credit_limit: Number(body.credit_limit),
          due_amount: body.due_amount !== undefined ? Number(body.due_amount) : 0,
          billing_cycle: body.billing_cycle?.trim() || null,
          due_date: body.due_date || null,
          status: body.status || "Active",
        };

        const { data, error: dbError } = await supabase
          .from("cards")
          .insert(insertPayload)
          .select()
          .single();

        if (dbError) return error(dbError.message, 500);
        return success(data, "Card created successfully.", 201);
      }

      // --- PUT: update an existing card ----------------------------------
      case "PUT": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        if (!body.id) {
          return error("id is required to update a card.", 400);
        }

        const validationErrors = validateCardInput(body, { partial: true });
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const updatePayload = {};
        if (body.bank_name !== undefined) updatePayload.bank_name = body.bank_name.trim();
        if (body.card_name !== undefined) updatePayload.card_name = body.card_name.trim();
        if (body.card_type !== undefined) updatePayload.card_type = body.card_type?.trim() || null;
        if (body.credit_limit !== undefined) updatePayload.credit_limit = Number(body.credit_limit);
        if (body.due_amount !== undefined) updatePayload.due_amount = Number(body.due_amount);
        if (body.billing_cycle !== undefined) updatePayload.billing_cycle = body.billing_cycle?.trim() || null;
        if (body.due_date !== undefined) updatePayload.due_date = body.due_date || null;
        if (body.status !== undefined) updatePayload.status = body.status;

        const { data, error: dbError } = await supabase
          .from("cards")
          .update(updatePayload)
          .eq("id", body.id)
          .select()
          .single();

        if (dbError) return error(dbError.message, 500);
        if (!data) return error("Card not found.", 404);
        return success(data, "Card updated successfully.");
      }

      // --- DELETE: delete a card -----------------------------------------
      case "DELETE": {
        const cardId = event.queryStringParameters?.id;
        if (!cardId) {
          return error("id query parameter is required.", 400);
        }

        const { error: dbError } = await supabase
          .from("cards")
          .delete()
          .eq("id", cardId);

        if (dbError) return error(dbError.message, 500);
        return success(null, "Card deleted successfully.");
      }

      default:
        return error(`Method ${event.httpMethod} is not allowed.`, 405);
    }
  } catch (err) {
    return error(`Internal server error: ${err.message}`, 500);
  }
};
