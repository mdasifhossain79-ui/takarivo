/* ==========================================================================
   Takarivo — netlify/functions/cards-payment.js
   Purpose: Dedicated endpoint for making a payment on a credit card.

   Rule: Payment decreases due_amount.
   Available Credit (= Credit Limit - Due Amount) updates automatically,
   since available_balance is a generated column in the database — this
   function only ever writes to due_amount, never to available_balance.

   POST body: { "card_id": "...", "amount": 1500 }
   ========================================================================== */

const { success, error } = require("./utils/response");
const { getBearerToken, getSupabaseClientForRequest } = require("./utils/supabaseClient");

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
    console.error("Auth error in cards-payment function:", userError?.message || userError);
    return error("Invalid or expired session. Please sign in again.", 401);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return error("Request body must be valid JSON.", 400);
  }

  const { card_id: cardId, amount } = body;

  if (!cardId || typeof cardId !== "string") {
    return error("card_id is required.", 400);
  }

  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    return error("amount is required and must be a number greater than 0.", 422);
  }

  try {
    // Ownership check: RLS already hides other users' cards, so a missing
    // result here means "doesn't exist or isn't yours" — either way, 404.
    const { data: card, error: fetchError } = await supabase
      .from("cards")
      .select("id, due_amount, credit_limit")
      .eq("id", cardId)
      .single();

    if (fetchError || !card) {
      return error("Card not found.", 404);
    }

    if (amount > card.due_amount) {
      return error(
        `Payment of ${amount} exceeds the current due amount of ${card.due_amount}.`,
        422
      );
    }

    const newDueAmount = card.due_amount - amount;

    const { data: updatedCard, error: updateError } = await supabase
      .from("cards")
      .update({ due_amount: newDueAmount })
      .eq("id", cardId)
      .select()
      .single();

    if (updateError) return error(updateError.message, 500);

    return success(updatedCard, "Payment applied successfully.");
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
