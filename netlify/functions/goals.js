/* ==========================================================================
   Takarivo — netlify/functions/goals.js
   Purpose: CRUD API for a user's savings goals, backed by Supabase.
   GET    -> list the authenticated user's goals (enriched with
             calculated Remaining and Progress)
   POST   -> create a new goal
   PUT    -> update an existing goal (id required in body)
   DELETE -> delete a goal (id required as a query parameter)

   Remaining and Progress are NOT stored columns (see database/goals.sql)
   — they're calculated here, on every read, from target_amount and
   saved_amount. Status ("in-progress" / "completed") IS a stored
   column in this table (unlike budgets), so this function recomputes
   and writes it on every create/update instead of trusting client
   input, guaranteeing it can never drift from the numbers.

   Auth: every request must include "Authorization: Bearer <access_token>".
   Ownership: goals don't reference any other owned resource, so Row
   Level Security alone is sufficient — every query is automatically
   scoped to auth.uid() = user_id.
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

const GOAL_CATEGORIES = ["Emergency", "Travel", "Home", "Vehicle", "Education", "Personal", "Other"];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

/* ==========================================================================
   Calculation formulas — reusable, pure functions (shared with
   goals-contribution.js; kept identical to js/goals.js, Parts 27–28)
   ========================================================================== */
function calculateRemaining(targetAmount, savedAmount) {
  return Math.max(0, targetAmount - savedAmount);
}

function calculateProgress(savedAmount, targetAmount) {
  if (!targetAmount) return 0;
  return (savedAmount / targetAmount) * 100;
}

function isGoalCompleted(savedAmount, targetAmount) {
  return savedAmount >= targetAmount;
}

function determineGoalStatus(savedAmount, targetAmount) {
  return isGoalCompleted(savedAmount, targetAmount) ? "completed" : "in-progress";
}

function enrichGoal(goal) {
  const remaining = calculateRemaining(goal.target_amount, goal.saved_amount);
  const progress = calculateProgress(goal.saved_amount, goal.target_amount);

  return { ...goal, remaining, progress };
}

function validateGoalInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      errors.push("name is required.");
    }
  }

  if (!partial || body.category !== undefined) {
    if (!GOAL_CATEGORIES.includes(body.category)) {
      errors.push(`category must be one of: ${GOAL_CATEGORIES.join(", ")}.`);
    }
  }

  if (!partial || body.target_amount !== undefined) {
    if (typeof body.target_amount !== "number" || Number.isNaN(body.target_amount) || body.target_amount <= 0) {
      errors.push("target_amount is required and must be a number greater than 0.");
    }
  }

  if (body.saved_amount !== undefined) {
    if (typeof body.saved_amount !== "number" || Number.isNaN(body.saved_amount) || body.saved_amount < 0) {
      errors.push("saved_amount must be a number greater than or equal to 0.");
    }
  }

  if (!partial || body.target_date !== undefined) {
    if (!isValidDate(body.target_date)) errors.push("target_date is required and must be in YYYY-MM-DD format.");
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
    console.error("Auth error in goals function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }
  const userId = userData.user.id;

  try {
    switch (event.httpMethod) {
      // --- GET: list the user's goals, enriched with calculated fields -----
      case "GET": {
        const { data, error: dbError } = await supabase
          .from("goals")
          .select("*")
          .order("target_date", { ascending: true });

        if (dbError) return error(dbError.message, 500);
        return success(data.map(enrichGoal), "Goals retrieved successfully.");
      }

      // --- POST: create a new goal --------------------------------------------
      case "POST": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        const validationErrors = validateGoalInput(body);
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        const savedAmount = body.saved_amount ?? 0;

        const { data, error: dbError } = await supabase
          .from("goals")
          .insert({
            user_id: userId,
            name: body.name.trim(),
            category: body.category,
            target_amount: body.target_amount,
            saved_amount: savedAmount,
            target_date: body.target_date,
            // status is always derived server-side, never trusted from the client
            status: determineGoalStatus(savedAmount, body.target_amount),
          })
          .select()
          .single();

        if (dbError) return error(dbError.message, 500);
        return success(enrichGoal(data), "Goal created successfully.", 201);
      }

      // --- PUT: update an existing goal ----------------------------------------
      case "PUT": {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch {
          return error("Request body must be valid JSON.", 400);
        }

        if (!body.id || typeof body.id !== "string") {
          return error("id is required to update a goal.", 400);
        }

        const validationErrors = validateGoalInput(body, { partial: true });
        if (validationErrors.length > 0) {
          return error(validationErrors.join(" "), 422);
        }

        // Need the current row if only one of target_amount/saved_amount is
        // being changed, so status can be recalculated correctly either way.
        const { data: existing, error: fetchError } = await supabase
          .from("goals")
          .select("target_amount, saved_amount")
          .eq("id", body.id)
          .single();

        if (fetchError || !existing) {
          return error("Goal not found.", 404);
        }

        const updates = {};
        if (body.name !== undefined) updates.name = body.name.trim();
        if (body.category !== undefined) updates.category = body.category;
        if (body.target_amount !== undefined) updates.target_amount = body.target_amount;
        if (body.saved_amount !== undefined) updates.saved_amount = body.saved_amount;
        if (body.target_date !== undefined) updates.target_date = body.target_date;

        const nextTarget = updates.target_amount ?? existing.target_amount;
        const nextSaved = updates.saved_amount ?? existing.saved_amount;
        updates.status = determineGoalStatus(nextSaved, nextTarget);

        const { data, error: dbError } = await supabase
          .from("goals")
          .update(updates)
          .eq("id", body.id)
          .select()
          .single();

        if (dbError) return error(dbError.message, 422);
        return success(enrichGoal(data), "Goal updated successfully.");
      }

      // --- DELETE: remove a goal -------------------------------------------------
      case "DELETE": {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return error("id query parameter is required to delete a goal.", 400);
        }

        const { data, error: dbError } = await supabase
          .from("goals")
          .delete()
          .eq("id", id)
          .select()
          .single();

        if (dbError) {
          if (dbError.code === "PGRST116") return error("Goal not found.", 404);
          return error(dbError.message, 500);
        }

        return success(enrichGoal(data), "Goal deleted successfully.");
      }

      default:
        return error(`Method ${event.httpMethod} is not allowed on this endpoint.`, 405);
    }
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
