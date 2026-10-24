/* ==========================================================================
   Takarivo — netlify/functions/cards-expense.js
   Purpose: Dedicated endpoint for recording a card expense.

   Rule: Expense increases due_amount, and increases transaction_count
   (matches the frontend addCardExpense logic from Part 24).
   Available Credit updates automatically via the generated column.

   POST body: { "card_id": "...", "amount": 1500 }

   Note: this endpoint adjusts the card's due_amount directly. It does
   NOT create a row in the transactions table — wiring transactions.js
   to call this automatically when a card expense transaction is
   created is a natural next step for a future part.
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
    console.error("Auth error in cards-expense function:", userError?.message || userError);
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
    const { data: card, error: fetchError } = await supabase
      .from("cards")
      .select("id, due_amount, credit_limit, transaction_count")
      .eq("id", cardId)
      .single();

    if (fetchError || !card) {
      return error("Card not found.", 404);
    }

    const newDueAmount = card.due_amount + amount;

    if (newDueAmount > card.credit_limit) {
      return error(
        `This expense would push the due amount (${newDueAmount}) over the credit limit (${card.credit_limit}).`,
        422
      );
    }

    const { data: updatedCard, error: updateError } = await supabase
      .from("cards")
      .update({
        due_amount: newDueAmount,
        transaction_count: card.transaction_count + 1,
      })
      .eq("id", cardId)
      .select()
      .single();

    if (updateError) return error(updateError.message, 500);

    return success(updatedCard, "Expense recorded successfully.");
  } catch (err) {
    return error("Unexpected server error.", 500);
  }
};
