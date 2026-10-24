-- ==========================================================================
-- Takarivo — database/budgets.sql
-- Purpose: User-owned category budgets, tracked over a date range.
-- PostgreSQL / Supabase syntax.
-- ==========================================================================
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Free-text, not a fixed check list: Settings > Categories lets users
  -- add their own custom categories (same reasoning as transactions.category).
  category text not null,
  budget_amount numeric(14, 2) not null check (budget_amount > 0),
  spent_amount numeric(14, 2) not null default 0 check (spent_amount >= 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_end_after_start check (end_date >= start_date)
);
comment on table public.budgets is 'One row per category budget, scoped to a date range (e.g. a calendar month).';
comment on column public.budgets.spent_amount is 'Running total spent against this budget. Status (On Track/Near Limit/Critical/Over Budget) is derived client-side from spent_amount / budget_amount, not stored.';
-- ==========================================================================
-- Indexes
-- ==========================================================================
create index if not exists budgets_user_id_idx on public.budgets (user_id);
-- Supports "this user's budget for category X"
create index if not exists budgets_user_id_category_idx on public.budgets (user_id, category);
-- Supports "this user's budgets active in a given period"
create index if not exists budgets_user_id_period_idx on public.budgets (user_id, start_date, end_date);
-- ==========================================================================
-- Keep updated_at current on every row update
-- (shares the same trigger function defined in profiles.sql; re-declared
-- here with create-or-replace so this file can also be run standalone)
-- ==========================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
drop trigger if exists set_budgets_updated_at on public.budgets;
create trigger set_budgets_updated_at before
update on public.budgets for each row execute function public.set_updated_at();
-- ==========================================================================
-- Row Level Security (RLS) — users may only access their own budgets
-- ==========================================================================
alter table public.budgets enable row level security;
create policy "Users can view their own budgets" on public.budgets for
select using (auth.uid() = user_id);
create policy "Users can insert their own budgets" on public.budgets for
insert with check (auth.uid() = user_id);
create policy "Users can update their own budgets" on public.budgets for
update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own budgets" on public.budgets for delete using (auth.uid() = user_id);
