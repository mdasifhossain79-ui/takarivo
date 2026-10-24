/* ==========================================================================
   Takarivo — netlify/functions/budgets.js
   Purpose: CRUD API for a user's category budgets, backed by Supabase.
   GET    -> list the authenticated user's budgets (enriched with
             calculated Remaining, Progress, and Status)
   POST   -> create a new budget
   PUT    -> update an existing budget (id required in body)
   DELETE -> delete a budget (id required as a query parameter)

   Remaining, Progress, and Status are NOT stored columns (see
   database/budgets.sql) — they're calculated here, on every read, from
   budget_amount and spent_amount, using the exact same formulas and
   4-tier thresholds as the frontend (js/budgets.js, Part 26). This
   keeps one source of truth for the math instead of two that could
   drift apart.

   Auth: every request must include "Authorization: Bearer <access_token>".
   The Supabase client is scoped to that token, so Row Level Security
   (see database/budgets.sql) enforces that users only ever see or
   modify their own budget rows. Budgets don't reference any other
   owned resource (no account_id/card_id), so RLS alone is sufficient
   for ownership here — no extra cross-resource check is needed.
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

/* ==========================================================================
   Calculation formulas — reusable, pure functions
   ========================================================================== */
function calculateRemaining(budgetAmount, spentAmount) {
  return budgetAmount - spentAmount;
}

function calculateProgress(spentAmount, budgetAmount) {
  if (!budgetAmount) return 0;
  return (spentAmount / budgetAmount) * 100;
}

/* Status tiers, matching js/budgets.js (Part 26):
   0–69%   on-track
   70–89%  near-limit
   90–100% critical
   >100%   over-budget
*/
function determineStatus(progress) {
  if (progress > 100) return "over-budget";
  if (progress >= 90) return "critical";
  if (progress >= 70) return "near-limit";
  return "on-track";
}

function enrichBudget(budget) {
  const remaining = calculateRemaining(budget.budget_amount, budget.spent_amount);
  const progress = calculateProgress(budget.spent_amount, budget.budget_amount);
  const status = determineStatus(progress);

  return { ...budget, remaining, progress, status };
}

function validateBudgetInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.category !== undefined) {
    if (!body.category || typeof body.category !== "string" || !body.category.trim()) {
      errors.push("category is required.");
    }
  }

  if (!partial || body.budget_amount !== undefined) {
    if (typeof body.budget_amount !== "number" || Number.isNaN(body.budget_amount) || body.budget_amount <= 0) {
      errors.push("budget_amount is required and must be a number greater than 0.");
    }
  }

  if (body.spent_amount !== undefined) {
    if (typeof body.spent_amount !== "number" || Number.isNaN(body.spent_amount) || body.spent_amount < 0) {
      errors.push("spent_amount must be a number greater than or equal to 0.");
    }
  }

  if (!partial || body.start_date !== undefined) {
    if (!isValidDate(body.start_date)) errors.push("start_date is required and must be in YYYY-MM-DD format.");
  }

  if (!partial || body.end_date !== undefined) {
    if (!isValidDate(body.end_date)) errors.push("end_date is required and must be in YYYY-MM-DD format.");
  }

  if (isValidDate(body.start_date) && isValidDate(body.end_date) && body.end_date < body.start_date) {
    errors.push("end_date must be on or after start_date.");
  }

  return errors;
}

exports.handler = async function handler(event) {
  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return error("Missing or invalid Authorization header.", 401);
  }

  const supabase = getSupabaseClientForRequest(accessToken);

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    console.error("Auth error in budgets function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }
  const userId = userData.user.id;

  try {
    switch (event.httpMethod) {
      // --- GET: list the user's budgets, enriched with calculated fields ---
      case "GET": {
        const { data, error: dbError } = await supabase
          .from("budgets")
          .select("*")
          .order("start_date", { ascending: false });

        if (dbError) return error(dbError.message, 500);
        return success(data.map(enrichBudget), "Budgets retrieved successfully.");
      }

      // --- POST: create a new budget -----------------------------------------
      case "POST": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        const validationErrors = validateBudgetInput(body);
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const { data, error: dbError } = await supabase
          .from("budgets")
          .insert({
            user_id: userId,
            category: body.category.trim(),
            budget_amount: body.budget_amount,
            spent_amount: body.spent_amount ?? 0,
            start_date: body.start_date,
            end_date: body.end_date,
          })
          .select()
          .single();

        if (dbError) return error(dbError.message, 500);
        return success(enrichBudget(data), "Budget created successfully.", 201);
      }

      // --- PUT: update an existing budget --------------------------------------
      case "PUT": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        if (!body.id || typeof body.id !== "string") {
          return error("id is required to update a budget.", 400);
        }

        const validationErrors = validateBudgetInput(body, { partial: true });
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const updates = {};
        if (body.category !== undefined) updates.category = body.category.trim();
        if (body.budget_amount !== undefined) updates.budget_amount = body.budget_amount;
        if (body.spent_amount !== undefined) updates.spent_amount = body.spent_amount;
        if (body.start_date !== undefined) updates.start_date = body.start_date;
        if (body.end_date !== undefined) updates.end_date = body.end_date;

        if (Object.keys(updates).length === 0) {
          return error("No valid fields provided to update.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("budgets")
          .update(updates)
          .eq("id", body.id)
          .select()
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") return error("Budget not found.", 404);
          return error(dbError.message, 422);
        }

        return success(enrichBudget(data), "Budget updated successfully.");
      }

      // --- DELETE: remove a budget ----------------------------------------------
      case "DELETE": {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return error("id query parameter is required to delete a budget.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("budgets")
          .delete()
          .eq("id", id)
          .select()
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") return error("Budget not found.", 404);
          return error(dbError.message, 500);
        }

        return success(enrichBudget(data), "Budget deleted successfully.");
      }

      default:
        return error(`Method ${event.httpMethod} is not allowed on this endpoint.`, 405);
    }
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
