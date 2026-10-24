"""
Takarivo — python/financial_utils.py

Purpose: Core financial calculation functions, mirroring the same
formulas already used across the Takarivo frontend (js/*.js) and
backend (netlify/functions/*.js), so offline scripts and reports stay
consistent with the app's own math.

This module is completely independent of the web app — it has no
knowledge of Node.js, Netlify Functions, or Supabase, and does not
import them. It only works with plain Python data (numbers, dicts,
lists), so it can be reused in any script, notebook, or future tool.

No web framework (Flask, Streamlit, etc.) is used anywhere here.
Standard library only — no third-party dependencies required.
"""

from __future__ import annotations
from typing import Iterable, Mapping, Any


def calculate_net_savings(income: float, expenses: float) -> float:
    """
    Net Savings = Income - Expenses

    Matches: js/transactions.js calculateNetCashFlow()
    """
    return income - expenses


def calculate_credit_utilization(
    due_amount: float, credit_limit: float
) -> float:
    """
    Utilization (%) = Due Amount / Credit Limit x 100

    Returns 0.0 if credit_limit is 0 or negative, to avoid
    a division-by-zero error.

    Matches: js/cards.js calculateUtilization()
    """
    if not credit_limit or credit_limit <= 0:
        return 0.0
    return (due_amount / credit_limit) * 100


def calculate_budget_remaining(
    budget_amount: float, spent_amount: float
) -> float:
    """
    Remaining = Budget Amount - Spent Amount

    Matches: js/budgets.js calculateRemaining()
    """
    return budget_amount - spent_amount


def calculate_goal_progress(
    saved_amount: float, target_amount: float
) -> float:
    """
    Progress (%) = Saved Amount / Target Amount x 100

    Not capped at 100 — an overfunded goal can exceed it, same as the
    frontend. Returns 0.0 if target_amount is 0 or negative.

    Matches: js/goals.js calculateProgress()
    """
    if not target_amount or target_amount <= 0:
        return 0.0
    return (saved_amount / target_amount) * 100


def calculate_monthly_summary(
    transactions: Iterable[Mapping[str, Any]]
) -> dict:
    """
    Aggregates a list of transactions into a monthly-style summary.

    Each transaction is expected to be a mapping with at least:
        - "amount": float
        - "transaction_type": "income" | "expense" | "transfer"

    Transfers are excluded from income/expense totals, same as the
    frontend calculation in js/transactions.js.

    Returns a dict:
        {
            "total_income": float,
            "total_expenses": float,
            "net_savings": float,
            "transaction_count": int,
        }
    """
    total_income = 0.0
    total_expenses = 0.0
    count = 0

    for txn in transactions:
        count += 1
        txn_type = txn.get("transaction_type")
        amount = float(txn.get("amount", 0) or 0)

        if txn_type == "income":
            total_income += amount
        elif txn_type == "expense":
            total_expenses += amount
        # transfers are counted but not added to income/expenses

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_savings": calculate_net_savings(total_income, total_expenses),
        "transaction_count": count,
    }


# ==========================================================================
# Small supporting helpers — not in the required function list, but used
# by report_generator.py to turn raw numbers into the same status labels
# shown in the UI (Budgets: on-track/near-limit/critical/over-budget;
# Goals: in-progress/completed).
# ==========================================================================

def determine_budget_status(progress_percentage: float) -> str:
    """
    Mirrors js/budgets.js determineStatus() (Part 26 thresholds):
        0-69%   -> "on-track"
        70-89%  -> "near-limit"
        90-100% -> "critical"
        >100%   -> "over-budget"
    """
    if progress_percentage > 100:
        return "over-budget"
    if progress_percentage >= 90:
        return "critical"
    if progress_percentage >= 70:
        return "near-limit"
    return "on-track"


def determine_goal_status(saved_amount: float, target_amount: float) -> str:
    """
    Mirrors js/goals.js determineGoalStatus():
        saved >= target -> "completed"
        otherwise       -> "in-progress"
    """
    return "completed" if saved_amount >= target_amount else "in-progress"
