-- ==========================================================================
-- Takarivo — database/cards.sql
-- Purpose: User-owned credit cards. available_balance is derived, never
-- stored independently, so it can never drift out of sync.
-- PostgreSQL / Supabase syntax.
-- ==========================================================================

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  bank_name text not null,
  card_name text not null,
  card_type text,

  credit_limit numeric(14, 2) not null
    check (credit_limit > 0),

  due_amount numeric(14, 2) not null default 0
    check (due_amount >= 0),

  -- Available Balance = Credit Limit - Due Amount
  -- Generated column: always computed by Postgres, can never drift out
  -- of sync with credit_limit / due_amount, and can't be written to directly.
  available_balance numeric(14, 2)
    generated always as (credit_limit - due_amount) stored,

  billing_cycle text,
  due_date date,

  transaction_count integer not null default 0
    check (transaction_count >= 0),

  status text not null default 'Active'
    check (status in ('Active', 'Frozen', 'Closed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A card can't be due more than its own limit
  constraint due_amount_not_over_limit check (due_amount <= credit_limit)
);

comment on table public.cards is 'One row per credit card owned by a user.';
comment on column public.cards.available_balance is 'Generated column: credit_limit - due_amount. Always derived, never set directly.';
comment on column public.cards.transaction_count is 'Incremented when a card expense is created (matches frontend addCardExpense logic).';

-- ==========================================================================
-- Indexes
-- ==========================================================================

create index if not exists cards_user_id_idx on public.cards (user_id);

-- Supports "this user's active/frozen/closed cards" filtering
create index if not exists cards_user_id_status_idx on public.cards (user_id, status);

-- Supports the "Upcoming Due" KPI (nearest due_date per user)
create index if not exists cards_user_id_due_date_idx on public.cards (user_id, due_date);

-- ==========================================================================
-- Keep updated_at current on every row update
-- (shares the same trigger function defined in profiles.sql; re-declared
-- here with create-or-replace so this file can also be run standalone)
-- ==========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cards_updated_at on public.cards;

create trigger set_cards_updated_at
  before update on public.cards
  for each row
  execute function public.set_updated_at();

-- ==========================================================================
-- Row Level Security (RLS) — users may only access their own cards
-- ==========================================================================

alter table public.cards enable row level security;

create policy "Users can view their own cards"
  on public.cards
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cards"
  on public.cards
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cards"
  on public.cards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own cards"
  on public.cards
  for delete
  using (auth.uid() = user_id);
