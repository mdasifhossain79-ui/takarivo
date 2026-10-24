-- ==========================================================================
-- Takarivo — Full Database Initialization Script
-- Paste and run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zxywewvmtovgtwzaxtil/sql/new
-- ==========================================================================

-- 1. Shared helper function for updated_at timestamps
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==========================================================================
-- 2. Profiles Table & Trigger
-- ==========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  avatar_url text,
  currency text not null default 'BDT' check (currency in ('BDT', 'USD', 'EUR', 'GBP')),
  timezone text not null default 'Asia/Dhaka',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile row on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================================
-- 3. Accounts Table
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

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists accounts_user_id_status_idx on public.accounts (user_id, status);

drop trigger if exists set_accounts_updated_at on public.accounts;
create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;

drop policy if exists "Users can view their own accounts" on public.accounts;
create policy "Users can view their own accounts" on public.accounts
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own accounts" on public.accounts;
create policy "Users can insert their own accounts" on public.accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own accounts" on public.accounts;
create policy "Users can update their own accounts" on public.accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own accounts" on public.accounts;
create policy "Users can delete their own accounts" on public.accounts
  for delete using (auth.uid() = user_id);

-- ==========================================================================
-- 4. Cards Table
-- ==========================================================================
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank_name text not null,
  card_name text not null,
  card_type text,
  credit_limit numeric(14, 2) not null check (credit_limit > 0),
  due_amount numeric(14, 2) not null default 0 check (due_amount >= 0),
  available_balance numeric(14, 2) generated always as (credit_limit - due_amount) stored,
  billing_cycle text,
  due_date date,
  transaction_count integer not null default 0 check (transaction_count >= 0),
  status text not null default 'Active' check (status in ('Active', 'Frozen', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint due_amount_not_over_limit check (due_amount <= credit_limit)
);

create index if not exists cards_user_id_idx on public.cards (user_id);
create index if not exists cards_user_id_status_idx on public.cards (user_id, status);
create index if not exists cards_user_id_due_date_idx on public.cards (user_id, due_date);

drop trigger if exists set_cards_updated_at on public.cards;
create trigger set_cards_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

alter table public.cards enable row level security;

drop policy if exists "Users can view their own cards" on public.cards;
create policy "Users can view their own cards" on public.cards
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own cards" on public.cards;
create policy "Users can insert their own cards" on public.cards
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own cards" on public.cards;
create policy "Users can update their own cards" on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own cards" on public.cards;
create policy "Users can delete their own cards" on public.cards
  for delete using (auth.uid() = user_id);

-- ==========================================================================
-- 5. Transactions Table
-- ==========================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  card_id uuid references public.cards (id) on delete set null,
  date date not null,
  description text not null,
  merchant text,
  category text not null,
  transaction_type text not null check (
    transaction_type in ('income', 'expense', 'transfer')
  ),
  amount numeric(14, 2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_account_id_idx on public.transactions (account_id);
create index if not exists transactions_card_id_idx on public.transactions (card_id);
create index if not exists transactions_user_id_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_id_category_idx on public.transactions (user_id, category);
create index if not exists transactions_user_id_type_idx on public.transactions (user_id, transaction_type);

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

drop policy if exists "Users can view their own transactions" on public.transactions;
create policy "Users can view their own transactions" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions" on public.transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own transactions" on public.transactions;
create policy "Users can delete their own transactions" on public.transactions
  for delete using (auth.uid() = user_id);

-- ==========================================================================
-- 6. Budgets Table
-- ==========================================================================
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  budget_amount numeric(14, 2) not null check (budget_amount > 0),
  spent_amount numeric(14, 2) not null default 0 check (spent_amount >= 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_end_after_start check (end_date >= start_date)
);

create index if not exists budgets_user_id_idx on public.budgets (user_id);
create index if not exists budgets_user_id_category_idx on public.budgets (user_id, category);
create index if not exists budgets_user_id_period_idx on public.budgets (user_id, start_date, end_date);

drop trigger if exists set_budgets_updated_at on public.budgets;
create trigger set_budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;

drop policy if exists "Users can view their own budgets" on public.budgets;
create policy "Users can view their own budgets" on public.budgets
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own budgets" on public.budgets;
create policy "Users can insert their own budgets" on public.budgets
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own budgets" on public.budgets;
create policy "Users can update their own budgets" on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own budgets" on public.budgets;
create policy "Users can delete their own budgets" on public.budgets
  for delete using (auth.uid() = user_id);

-- ==========================================================================
-- 7. Goals Table
-- ==========================================================================
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null check (
    category in (
      'Emergency',
      'Travel',
      'Home',
      'Vehicle',
      'Education',
      'Personal',
      'Other'
    )
  ),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  saved_amount numeric(14, 2) not null default 0 check (saved_amount >= 0),
  target_date date not null,
  status text not null default 'in-progress' check (status in ('in-progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals (user_id);
create index if not exists goals_user_id_status_idx on public.goals (user_id, status);
create index if not exists goals_user_id_category_idx on public.goals (user_id, category);
create index if not exists goals_user_id_target_date_idx on public.goals (user_id, target_date);

drop trigger if exists set_goals_updated_at on public.goals;
create trigger set_goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

drop policy if exists "Users can view their own goals" on public.goals;
create policy "Users can view their own goals" on public.goals
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own goals" on public.goals;
create policy "Users can insert their own goals" on public.goals
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own goals" on public.goals;
create policy "Users can update their own goals" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own goals" on public.goals;
create policy "Users can delete their own goals" on public.goals
  for delete using (auth.uid() = user_id);
