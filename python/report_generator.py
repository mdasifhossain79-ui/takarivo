"""
Takarivo — python/report_generator.py

Purpose: Generates a plain-text financial summary report from
transaction, budget, and goal data, using the calculations in
financial_utils.py. Standalone — no web server, no Flask, no
Streamlit. Run directly from the command line, or import
generate_report() into another script.

Usage (as a script):
    python3 report_generator.py

Usage (as a module):
    from report_generator import generate_report
    report_text = generate_report(transactions, budgets, goals)
"""

from __future__ import annotations
from typing import Iterable, Mapping, Any

from financial_utils import (
    calculate_monthly_summary,
    calculate_budget_remaining,
    calculate_goal_progress,
    determine_budget_status,
    determine_goal_status,
)


def _format_currency(amount: float) -> str:
    """Formats a number as BDT, matching the app's display convention."""
    return f"\u09f3{amount:,.0f}"


def _build_summary_section(transactions: Iterable[Mapping[str, Any]]) -> str:
    summary = calculate_monthly_summary(transactions)

    lines = [
        "SUMMARY",
        "-------",
        f"Total Income:    {_format_currency(summary['total_income'])}",
        f"Total Expenses:  {_format_currency(summary['total_expenses'])}",
        f"Net Savings:     {_format_currency(summary['net_savings'])}",
        f"Transactions:    {summary['transaction_count']}",
    ]
    return "\n".join(lines)


def _build_budgets_section(budgets: Iterable[Mapping[str, Any]]) -> str:
    lines = ["BUDGETS", "-------"]

    budgets = list(budgets)
    if not budgets:
        lines.append("No budgets recorded.")
        return "\n".join(lines)

    for budget in budgets:
        category = budget.get("category", "Unknown")
        budget_amount = float(budget.get("budget_amount", 0) or 0)
        spent_amount = float(budget.get("spent_amount", 0) or 0)
        remaining = calculate_budget_remaining(budget_amount, spent_amount)
        progress = 0.0 if not budget_amount else (
            spent_amount / budget_amount) * 100
        status = determine_budget_status(progress)

        lines.append(
            f"{category:<15} budget "
            f"{_format_currency(budget_amount):>10}  "
            f"spent {_format_currency(spent_amount):>10}  "
            f"remaining {_format_currency(remaining):>10}  "
            f"[{status}]"
        )

    return "\n".join(lines)


def _build_goals_section(goals: Iterable[Mapping[str, Any]]) -> str:
    lines = ["GOALS", "-----"]

    goals = list(goals)
    if not goals:
        lines.append("No goals recorded.")
        return "\n".join(lines)

    for goal in goals:
        name = goal.get("name", "Unknown")
        target_amount = float(goal.get("target_amount", 0) or 0)
        saved_amount = float(goal.get("saved_amount", 0) or 0)
        progress = calculate_goal_progress(saved_amount, target_amount)
        status = determine_goal_status(saved_amount, target_amount)

        lines.append(
            f"{name:<20} {_format_currency(saved_amount):>10} / "
            f"{_format_currency(target_amount):<10}  "
            f"({progress:.1f}%)  [{status}]"
        )

    return "\n".join(lines)


def generate_report(
    transactions: Iterable[Mapping[str, Any]],
    budgets: Iterable[Mapping[str, Any]] | None = None,
    goals: Iterable[Mapping[str, Any]] | None = None,
) -> str:
    """
    Builds a full plain-text report from transactions, and optionally
    budgets and goals. Any section with no data is still included,
    clearly labeled as empty, rather than silently omitted.
    """
    budgets = budgets or []
    goals = goals or []

    sections = [
        "TAKARIVO FINANCIAL REPORT",
        "==========================",
        "",
        _build_summary_section(transactions),
        "",
        _build_budgets_section(budgets),
        "",
        _build_goals_section(goals),
    ]

    return "\n".join(sections)


if __name__ == "__main__":
    # Small demo dataset so this script produces useful output when run
    # directly, without needing a live database connection.
    demo_transactions = [
        {"amount": 68500, "transaction_type": "income"},
        {"amount": 8600, "transaction_type": "expense"},
        {"amount": 14500, "transaction_type": "expense"},
        {"amount": 1800, "transaction_type": "expense"},
    ]

    demo_budgets = [
        {"category": "Food", "budget_amount": 8000, "spent_amount": 8600},
        {"category": "Transport", "budget_amount": 3000, "spent_amount": 1800},
    ]

    demo_goals = [
        {
            "name": "Emergency Fund",
            "target_amount": 100000,
            "saved_amount": 65000,
        },
        {
            "name": "Europe Trip",
            "target_amount": 250000,
            "saved_amount": 250000,
        },
    ]

    print(generate_report(demo_transactions, demo_budgets, demo_goals))
