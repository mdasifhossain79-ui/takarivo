-- ==========================================================================
-- Takarivo — database/goals.sql
-- Purpose: User-owned savings goals.
-- PostgreSQL / Supabase syntax.
-- ==========================================================================
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Fixed list, matching the Goals page category options exactly
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
comment on table public.goals is 'One row per savings goal owned by a user.';
comment on column public.goals.saved_amount is 'May exceed target_amount (overfunded goal) — no upper bound is enforced.';
comment on column public.goals.status is 'Derived from saved_amount >= target_amount on the frontend (Part 28); stored here so it can be queried/filtered directly.';
-- ==========================================================================
-- Indexes
-- ==========================================================================
create index if not exists goals_user_id_idx on public.goals (user_id);
-- Supports "this user's in-progress vs completed goals"
create index if not exists goals_user_id_status_idx on public.goals (user_id, status);
-- Supports "this user's goals by category"
create index if not exists goals_user_id_category_idx on public.goals (user_id, category);
-- Supports sorting/filtering goals by how soon they're due
create index if not exists goals_user_id_target_date_idx on public.goals (user_id, target_date);
-- ==========================================================================
-- Keep updated_at current on every row update
-- (shares the same trigger function defined in profiles.sql; re-declared
-- here with create-or-replace so this file can also be run standalone)
-- ==========================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
drop trigger if exists set_goals_updated_at on public.goals;
create trigger set_goals_updated_at before
update on public.goals for each row execute function public.set_updated_at();
-- ==========================================================================
-- Row Level Security (RLS) — users may only access their own goals
-- ==========================================================================
alter table public.goals enable row level security;
create policy "Users can view their own goals" on public.goals for
select using (auth.uid() = user_id);
create policy "Users can insert their own goals" on public.goals for
insert with check (auth.uid() = user_id);
create policy "Users can update their own goals" on public.goals for
update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own goals" on public.goals for delete using (auth.uid() = user_id);
