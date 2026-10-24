# Takarivo — Supabase Setup

This document explains how to set up the Supabase project Takarivo will use
for its backend (database, auth) in later parts. **No tables are created
yet** — this is architecture and environment setup only.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Choose an organization, give the project a name (e.g. `takarivo`), set a
   database password (save it somewhere safe — you'll need it later), and
   pick a region close to your users.
4. Wait a minute or two for the project to finish provisioning.

## 2. Find your Project URL and anon key

1. Inside your new project, go to **Project Settings → API**.
2. You'll see:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon public** key — a long JWT-style string, safe for frontend use
   - **service_role** key — also a long JWT-style string, **admin access, secret**

Copy the Project URL and anon key — you'll put these in your `.env` file
(see below). Leave the service-role key for now; it's not needed until
sensitive server-side operations require bypassing Row Level Security.

## 3. Environment variables

This project uses a `.env.example` file (already created) as a template.

**To set up your local environment:**

1. Copy the example file:
   ```
   cp .env.example .env
   ```
2. Open `.env` and replace the placeholder values with your real
   Project URL and anon key from step 2.
3. `.env` is already covered by `.gitignore` (see below) — it will not be
   committed to version control.

Netlify deployments will need the same variables set in
**Site Settings → Environment Variables** once the project is deployed —
that's a future part, not this one.

## 4. Security rules — read before going further

- **The anon key is safe to expose** in frontend/browser code. Supabase
  is designed for this — it enforces Row Level Security (RLS) policies
  on the database side, so the anon key alone can't do anything you
  haven't explicitly allowed.
- **The service-role key is NOT safe to expose.** It bypasses Row Level
  Security entirely and has full admin access to your database. It must
  only ever be used inside server-side code (a Netlify Function), never
  in any file that ships to the browser, and never logged or printed.
- **Never commit `.env` to Git.** It should always be listed in
  `.gitignore`. If a key is ever accidentally committed, treat it as
  compromised — rotate it immediately from the Supabase dashboard
  (Project Settings → API → Reset/Regenerate).
- `.env.example` is safe to commit — it only contains placeholder text,
  never real values.

## 5. What's next (not part of this step)

Future parts will cover:

- Creating the actual database tables (accounts, transactions, budgets, etc.)
- Row Level Security policies
- Connecting Netlify Functions to Supabase
- Wiring the frontend to real data instead of demo/in-memory data

No tables, no schema, and no Supabase client code exist yet — this
document only covers project creation and environment setup.
