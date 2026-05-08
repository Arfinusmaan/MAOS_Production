-- MAOS Database Schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. ENUMS
create type user_role as enum ('admin', 'full_cycle_closer', 'setter', 'closer', 'viewer');
create type user_status as enum ('pending', 'active', 'disabled');
create type client_stage as enum ('Cold Lead', 'Interested', 'Meeting Booked', 'Follow-Up', 'Closed', 'Inactive');
create type payout_status as enum ('pending', 'processing', 'paid');
create type commission_type as enum ('setup', 'mrr', 'setter_bonus');

-- 2. USERS (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users on delete cascade not null primary key,
  email text unique not null,
  first_name text not null,
  last_name text not null,
  role user_role default 'viewer'::user_role not null,
  status user_status default 'pending'::user_status not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. CLIENTS
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  stage client_stage default 'Cold Lead'::client_stage not null,
  plan_type text check (plan_type in ('minimum', 'premium')),
  mrr numeric default 0,
  setup_fee numeric default 0,
  assigned_setter_id uuid references public.users(id),
  assigned_closer_id uuid references public.users(id),
  next_follow_up timestamp with time zone,
  notes text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. COMMISSIONS & PAYOUTS
create table public.commissions (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  amount numeric not null,
  type commission_type not null,
  status payout_status default 'pending'::payout_status not null,
  is_recurring boolean default false,
  split_percentage numeric default 100 check (split_percentage > 0 and split_percentage <= 100),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  paid_at timestamp with time zone
);

-- 5. DAILY REPORTS
create table public.daily_reports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  date date default CURRENT_DATE not null,
  calls_made integer default 0,
  voicemails integer default 0,
  pickups integer default 0,
  meetings_booked integer default 0,
  shows integer default 0,
  closings integer default 0,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, date)
);

-- 6. ACTIVITIES (Audit Log)
create table public.activities (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. NOTIFICATIONS
create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  type text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ROW LEVEL SECURITY (RLS) POLICIES --

-- Enable RLS
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.commissions enable row level security;
alter table public.daily_reports enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;

-- USERS Policies
-- Admins can read all users. Users can read their own profile.
create policy "Users can view their own profile" on public.users for select using (auth.uid() = id);
create policy "Admins can view all users" on public.users for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);
create policy "Admins can update users" on public.users for update using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

-- CLIENTS Policies
-- Active users can read clients.
create policy "Active users can view clients" on public.clients for select using (
  exists (select 1 from public.users where id = auth.uid() and status = 'active')
);
create policy "Active users can insert clients" on public.clients for insert with check (
  exists (select 1 from public.users where id = auth.uid() and status = 'active')
);
create policy "Active users can update clients" on public.clients for update using (
  exists (select 1 from public.users where id = auth.uid() and status = 'active')
);

-- DAILY REPORTS Policies
-- Users can view and manage their own reports. Admins can view all.
create policy "Users can manage their own reports" on public.daily_reports for all using (auth.uid() = user_id);
create policy "Admins can view all reports" on public.daily_reports for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

-- Realtime Setup
alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.notifications;
