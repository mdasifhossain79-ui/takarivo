-- ==========================================================================
-- Takarivo — database/transactions.sql
-- Purpose: User-owned financial transactions (income, expense, transfer).
-- PostgreSQL / Supabase syntax.
-- ==========================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Nullable: not every transaction is tied to a credit card.
  -- NOTE: no REFERENCES constraint yet — database/cards.sql doesn't exist
  -- as a table in this project yet. Once it does, add the foreign key with:
  --   alter table public.transactions
  --     add constraint transactions_card_id_fkey
  --     foreign key (card_id) references public.cards (id) on delete set null;
  card_id uuid,
  date date not null,
  description text not null,
  merchant text,
  -- Intentionally free-text, not a fixed check list: Settings > Categories
  -- lets users add their own custom categories.
  category text not null,
  transaction_type text not null check (
    transaction_type in ('income', 'expense', 'transfer')
  ),
  amount numeric(14, 2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.transactions is 'One row per income, expense, or transfer transaction owned by a user.';
comment on column public.transactions.amount is 'Always stored as a positive magnitude; transaction_type determines direction (income/expense/transfer).';
comment on column public.transactions.card_id is 'Optional link to a credit card. Foreign key to be added once database/cards.sql exists.';
-- ==========================================================================
-- Indexes
-- ==========================================================================
create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_account_id_idx on public.transactions (account_id);
create index if not exists transactions_card_id_idx on public.transactions (card_id);
-- Supports the common "this user's transactions in a date range" query,
-- newest first (matches how the Transactions page lists rows)
create index if not exists transactions_user_id_date_idx on public.transactions (user_id, date desc);
-- Supports category filtering (Transactions page filter bar)
create index if not exists transactions_user_id_category_idx on public.transactions (user_id, category);
-- Supports type filtering (income/expense/transfer)
create index if not exists transactions_user_id_type_idx on public.transactions (user_id, transaction_type);
-- ==========================================================================
-- Keep updated_at current on every row update
-- (shares the same trigger function defined in profiles.sql; re-declared
-- here with create-or-replace so this file can also be run standalone)
-- ==========================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at before
update on public.transactions for each row execute function public.set_updated_at();
-- ==========================================================================
-- Row Level Security (RLS) — users may only access their own transactions
-- ==========================================================================
alter table public.transactions enable row level security;
create policy "Users can view their own transactions" on public.transactions for
select using (auth.uid() = user_id);
create policy "Users can insert their own transactions" on public.transactions for
insert with check (auth.uid() = user_id);
create policy "Users can update their own transactions" on public.transactions for
update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own transactions" on public.transactions for delete using (auth.uid() = user_id);
