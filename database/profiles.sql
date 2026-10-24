-- ==========================================================================
-- Takarivo — database/profiles.sql
-- Purpose: User profile table, linked 1:1 to Supabase Auth users.
-- PostgreSQL / Supabase syntax. No other tables are created here.
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
comment on table public.profiles is 'One row per user, linked to auth.users via id.';
comment on column public.profiles.currency is 'Default display currency. Matches Settings > Currency options.';
-- Helpful lookup index (email is already unique, but explicit index for search)
create index if not exists profiles_email_idx on public.profiles (email);
-- ==========================================================================
-- Keep updated_at current on every row update
-- ==========================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before
update on public.profiles for each row execute function public.set_updated_at();
-- ==========================================================================
-- Row Level Security (RLS) — preparation only
-- Each user may only see and modify their own profile row.
-- ==========================================================================
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for
select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for
update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for
insert with check (auth.uid() = id);
-- No delete policy is defined — profile deletion should be handled
-- through account deletion flows, not direct row deletion, in a later part.
