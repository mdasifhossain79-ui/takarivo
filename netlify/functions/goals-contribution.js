/* ==========================================================================
   Takarivo — netlify/functions/goals-contribution.js
   Purpose: Dedicated endpoint for adding a contribution to a goal.

   A contribution increases saved_amount, which recalculates Remaining,
   Progress, and Status — using the exact same functions a goal's
   normal create/update would, so there's only one place this math
   lives (mirrors js/goals.js addContribution, Part 28).

   POST body: { "goal_id": "...", "amount": 5000 }
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

function calculateRemaining(targetAmount, savedAmount) {
  return Math.max(0, targetAmount - savedAmount);
}

function calculateProgress(savedAmount, targetAmount) {
  if (!targetAmount) return 0;
  return (savedAmount / targetAmount) * 100;
}

function determineGoalStatus(savedAmount, targetAmount) {
  return savedAmount >= targetAmount ? "completed" : "in-progress";
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return error(`Method ${event.httpMethod} is not allowed on this endpoint.`, 405);
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) {
    return error("Missing or invalid Authorization header.", 401);
  }

  const supabase = getSupabaseClientForRequest(accessToken);

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    console.error("Auth error in goals-contribution function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return error("Request body must be valid JSON.", 400);
  }

  const { goal_id: goalId, amount } = body;

  if (!goalId || typeof goalId !== "string") {
    return error("goal_id is required.", 400);
  }

  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    return error("amount is required and must be a number greater than 0.", 422);
  }

  try {
    // Ownership check: RLS already hides other users' goals, so a missing
    // result here means "doesn't exist or isn't yours" — either way, 404.
    const { data: goal, error: fetchError } = await supabase
      .from("goals")
      .select("id, target_amount, saved_amount")
      .eq("id", goalId)
      .single();

    if (fetchError || !goal) {
      return error("Goal not found.", 404);
    }

    const newSavedAmount = goal.saved_amount + amount;
    const newStatus = determineGoalStatus(newSavedAmount, goal.target_amount);

    const { data: updatedGoal, error: updateError } = await supabase
      .from("goals")
      .update({
        saved_amount: newSavedAmount,
        status: newStatus,
      })
      .eq("id", goalId)
      .select()
      .single();

    if (updateError) return error(updateError.message, 500);

    const enriched = {
      ...updatedGoal,
      remaining: calculateRemaining(updatedGoal.target_amount, updatedGoal.saved_amount),
      progress: calculateProgress(updatedGoal.saved_amount, updatedGoal.target_amount),
    };

    return success(enriched, "Contribution added successfully.");
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
