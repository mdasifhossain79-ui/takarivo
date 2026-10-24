"""
Takarivo — python/csv_processor.py

Purpose: Reads and writes transaction data as CSV, for importing bank
exports or exporting a Takarivo report to a spreadsheet-friendly
format. Standalone — no web server, no Flask, no Streamlit, no
database connection. Uses only the Python standard library (csv,
pathlib) — no pandas or other third-party dependency required.

Usage (as a script):
    python3 csv_processor.py

Usage (as a module):
    from csv_processor import read_transactions_csv, write_summary_csv
"""

from __future__ import annotations
import csv
from pathlib import Path
from typing import Any

from financial_utils import calculate_monthly_summary

REQUIRED_COLUMNS = {"date", "description",
                    "category", "transaction_type", "amount"}


def read_transactions_csv(file_path: str | Path) -> list[dict[str, Any]]:
    """
    Reads a transactions CSV file and returns a list of dicts.

    Expected columns (header row): date, description, category,
    transaction_type, amount, and optionally merchant, account, notes.

    Raises ValueError if any required column is missing, so bad input
    fails loudly instead of silently producing wrong totals.
    """
    file_path = Path(file_path)
    transactions: list[dict[str, Any]] = []

    with file_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        if reader.fieldnames is None:
            raise ValueError(f"{file_path} appears to be empty.")

        missing = REQUIRED_COLUMNS - set(reader.fieldnames)
        if missing:
            missing_cols = ', '.join(sorted(missing))
            raise ValueError(
                f"{file_path} is missing required column(s): {missing_cols}")

        for row_number, row in enumerate(reader, start=2):  # header is row 1
            try:
                amount = float(row["amount"])
            except (TypeError, ValueError):
                raise ValueError(
                    f"Row {row_number}: invalid amount "
                    f"'{row.get('amount')}'.")

            transaction_type = (
                row.get("transaction_type") or ""
            ).strip().lower()
            if transaction_type not in {"income", "expense", "transfer"}:
                raise ValueError(
                    "Row "
                    f"{row_number}: transaction_type must be "
                    "income, expense, or transfer "
                    f"(got '{row.get('transaction_type')}')."
                )

            transactions.append({
                "date": row.get("date", "").strip(),
                "description": row.get("description", "").strip(),
                "merchant": (row.get("merchant") or "").strip() or None,
                "category": row.get("category", "").strip(),
                "account": (row.get("account") or "").strip() or None,
                "transaction_type": transaction_type,
                "amount": amount,
                "notes": (row.get("notes") or "").strip() or None,
            })

    return transactions


def write_transactions_csv(
    transactions: list[dict[str, Any]], file_path: str | Path
) -> None:
    """
    Writes a list of transaction dicts to a CSV file, in the same
    column format read_transactions_csv() expects — so a file written
    here can be read back in without modification.
    """
    file_path = Path(file_path)
    fieldnames = [
        "date", "description", "merchant", "category",
        "account", "transaction_type", "amount", "notes"
    ]

    with file_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for txn in transactions:
            writer.writerow({key: txn.get(key, "") for key in fieldnames})


def write_summary_csv(
    transactions: list[dict[str, Any]], file_path: str | Path
) -> None:
    """
    Writes a single-row CSV summary (Total Income, Total Expenses, Net
    Savings, Transaction Count) using calculate_monthly_summary().
    """
    file_path = Path(file_path)
    summary = calculate_monthly_summary(transactions)

    with file_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "total_income",
                "total_expenses",
                "net_savings",
                "transaction_count",
            ],
        )
        writer.writeheader()
        writer.writerow(summary)


if __name__ == "__main__":
    # Small demo run: write a sample transactions CSV, read it back,
    # and write a summary CSV — so this script is immediately useful
    # to run and inspect without needing a real export file first.
    demo_transactions = [
        {
            "date": "2026-09-04",
            "description": "Salary Deposit",
            "merchant": None,
            "category": "Salary",
            "account": "Main Account",
            "transaction_type": "income",
            "amount": 68500,
            "notes": None,
        },
        {
            "date": "2026-09-05",
            "description": "Grocery Store",
            "merchant": "Shwapno",
            "category": "Food",
            "account": "Main Account",
            "transaction_type": "expense",
            "amount": 2450,
            "notes": None,
        },
    ]

    sample_path = Path("sample_transactions.csv")
    summary_path = Path("sample_summary.csv")

    write_transactions_csv(demo_transactions, sample_path)
    loaded = read_transactions_csv(sample_path)
    write_summary_csv(loaded, summary_path)

    print(
        f"Wrote {sample_path} ({len(loaded)} transactions)"
    )
    print(f"Wrote {summary_path}")
