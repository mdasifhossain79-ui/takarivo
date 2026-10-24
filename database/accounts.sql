-- ==========================================================================
-- Takarivo — database/accounts.sql
-- Purpose: User-owned financial accounts (bank, cash, credit, etc).
-- PostgreSQL / Supabase syntax. No transactions table here.
-- ==========================================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  institution text,
  account_type text not null check (
    account_type in ('Bank', 'Savings', 'Cash', 'MFS', 'Credit')
  ),
  account_number_masked text,
  balance numeric(14, 2) not null default 0,
  currency text not null default 'BDT' check (currency in ('BDT', 'USD', 'EUR', 'GBP')),
  status text not null default 'Active' check (status in ('Active', 'Frozen', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.accounts is 'One row per financial account owned by a user (bank, cash, credit, etc).';
comment on column public.accounts.account_number_masked is 'Display-only masked number, e.g. "•••• 4821". Never store a full account/card number here.';
-- ==========================================================================
-- Indexes
-- ==========================================================================
-- Every account lookup is scoped to a user, so this is the primary access path
create index if not exists accounts_user_id_idx on public.accounts (user_id);
-- Supports queries/filters like "this user's active accounts"
create index if not exists accounts_user_id_status_idx on public.accounts (user_id, status);
-- ==========================================================================
-- Keep updated_at current on every row update
-- (shares the same trigger function defined in profiles.sql; re-declared
-- here with create-or-replace so this file can also be run standalone)
-- ==========================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
drop trigger if exists set_accounts_updated_at on public.accounts;
create trigger set_accounts_updated_at before
update on public.accounts for each row execute function public.set_updated_at();
-- ==========================================================================
-- Row Level Security (RLS) — users may only access their own accounts
-- ==========================================================================
alter table public.accounts enable row level security;
create policy "Users can view their own accounts" on public.accounts for
select using (auth.uid() = user_id);
create policy "Users can insert their own accounts" on public.accounts for
insert with check (auth.uid() = user_id);
create policy "Users can update their own accounts" on public.accounts for
update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own accounts" on public.accounts for delete using (auth.uid() = user_id);
