-- ANERITH → Supabase mirror schema
-- Run in the Supabase SQL editor after creating the project.
-- The local SQLite database remains the write path; this schema is a
-- reporting / integration mirror populated by /api/integrations/supabase.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  full_name text not null,
  country text,
  role text not null default 'user',
  kyc_status text not null default 'unverified',
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  number text not null unique,
  type text not null,
  plan text not null,
  phase integer not null default 1,
  account_size_cents bigint not null,
  balance_cents bigint not null,
  status text not null,
  profit_target_pct numeric,
  daily_loss_pct numeric not null,
  max_drawdown_pct numeric not null,
  drawdown_mode text not null,
  start_balance_cents bigint not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists accounts_user_idx on public.accounts(user_id);

create table if not exists public.positions (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  symbol text not null,
  side text not null,
  lots numeric not null,
  entry_price numeric not null,
  sl numeric,
  tp numeric,
  profit_cents bigint,
  status text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  close_price numeric,
  close_reason text
);
create index if not exists positions_account_idx on public.positions(account_id, status);

create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid references public.profiles(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  type text not null,
  amount_cents bigint not null,
  status text not null,
  method text,
  reference text,
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists transactions_user_idx on public.transactions(user_id, created_at desc);

create table if not exists public.payouts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount_cents bigint not null,
  fee_cents bigint not null,
  net_cents bigint not null,
  status text not null,
  method text not null,
  destination text not null,
  reference text not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists payouts_user_idx on public.payouts(user_id, requested_at desc);

create table if not exists public.payment_intents (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null,
  account_size_cents bigint not null,
  amount_cents bigint not null,
  currency text not null,
  provider text not null,
  method text not null,
  status text not null,
  merchant_reference text not null unique,
  order_tracking_id text,
  challenge_id uuid,
  account_id uuid references public.accounts(id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists payment_intents_user_idx on public.payment_intents(user_id, created_at desc);

create table if not exists public.competitions (
  id uuid primary key,
  name text not null,
  description text not null,
  prize_pool_cents bigint not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.competition_entries (
  id uuid primary key,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  display_name text not null,
  account_size_cents bigint not null,
  return_pct numeric not null,
  peak_return_pct numeric not null default 0,
  prize_cents bigint not null default 0,
  joined_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists competition_entries_comp_idx on public.competition_entries(competition_id);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;
alter table public.payouts enable row level security;
alter table public.payment_intents enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "accounts owner read" on public.accounts;
create policy "accounts owner read" on public.accounts
  for select using (auth.uid() = user_id);

drop policy if exists "positions owner read" on public.positions;
create policy "positions owner read" on public.positions
  for select using (
    exists (select 1 from public.accounts a where a.id = positions.account_id and a.user_id = auth.uid())
  );

drop policy if exists "transactions owner read" on public.transactions;
create policy "transactions owner read" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "payouts owner read" on public.payouts;
create policy "payouts owner read" on public.payouts
  for select using (auth.uid() = user_id);

drop policy if exists "payment intents owner read" on public.payment_intents;
create policy "payment intents owner read" on public.payment_intents
  for select using (auth.uid() = user_id);

drop policy if exists "competitions authenticated read" on public.competitions;
create policy "competitions authenticated read" on public.competitions
  for select using (auth.role() = 'authenticated');

drop policy if exists "entries authenticated read" on public.competition_entries;
create policy "entries authenticated read" on public.competition_entries
  for select using (auth.role() = 'authenticated');
