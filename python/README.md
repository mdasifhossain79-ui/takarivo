# Takarivo — Python Utilities

Standalone Python scripts for financial calculations, report
generation, and CSV import/export.

**Python is NOT the web server for Takarivo.** The web app is served
by static HTML/CSS/JS + Netlify Functions (Node.js) — see the project
root and `netlify/functions/`. This `python/` folder is a separate,
independent set of command-line utilities. It does not run as part of
the website, does not use Flask, Streamlit, or any web framework, and
has no dependency on Node.js or Netlify.

## Files

| File                  | Purpose                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `financial_utils.py`  | Core calculation functions (net savings, credit utilization, budget remaining, goal progress, monthly summary) |
| `report_generator.py` | Builds a plain-text financial report from transactions/budgets/goals                                           |
| `csv_processor.py`    | Reads and writes transaction data as CSV                                                                       |
| `requirements.txt`    | Dependencies (currently none — standard library only)                                                          |

## Requirements

- Python 3.9 or later (uses modern type hints)
- No third-party packages needed

## Setup

```bash
cd python
# Optional: create a virtual environment
python3 -m venv venv
source venv/bin/activate   # on Windows: venv\Scripts\activate

# Nothing to install right now, but this keeps the convention working:
pip install -r requirements.txt
```

## Usage

### As standalone scripts

Each script can be run directly and will print a small demo using
built-in sample data — useful for checking everything works:

```bash
python3 financial_utils.py     # (no __main__ block — import only)
python3 report_generator.py    # prints a demo report to the terminal
python3 csv_processor.py       # writes sample_transactions.csv and sample_summary.csv
```

### As importable modules

```python
from financial_utils import (
    calculate_net_savings,
    calculate_credit_utilization,
    calculate_budget_remaining,
    calculate_goal_progress,
    calculate_monthly_summary,
)

net = calculate_net_savings(income=68500, expenses=34300)
utilization = calculate_credit_utilization(due_amount=8400, credit_limit=80000)
```

```python
from report_generator import generate_report

report_text = generate_report(transactions, budgets, goals)
print(report_text)
```

```python
from csv_processor import read_transactions_csv, write_summary_csv

transactions = read_transactions_csv("my_export.csv")
write_summary_csv(transactions, "summary.csv")
```

## Why these formulas match the app

Every function in `financial_utils.py` mirrors the exact same formula
already used in the frontend (`js/budgets.js`, `js/goals.js`,
`js/cards.js`, `js/transactions.js`) and backend
(`netlify/functions/*.js`). This is intentional — these utilities are
meant for offline analysis, scripting, or report generation using the
same math as the live app, not a competing or alternative
implementation.

## What this is NOT

- Not a web server
- Not an API
- Not connected to Supabase or any database
- Not using Flask, Streamlit, Django, or FastAPI

If a future part needs Python to talk to real Takarivo data, that
would mean reading an exported CSV/JSON file — not a live database
connection — to keep this folder's "standalone utility" nature intact.
