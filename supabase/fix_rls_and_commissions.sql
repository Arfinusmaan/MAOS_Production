-- ============================================================
-- MAOS — Full Database Fix & Commission Schema Upgrade
-- Run this ENTIRE script in your Supabase SQL Editor
-- ============================================================

-- ─── STEP 1: Fix infinite recursion with security definer helpers ─────────────
-- These functions bypass RLS entirely when called from within policies

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role::text from public.users where id = auth.uid();
$$;

create or replace function public.get_my_status()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select status::text from public.users where id = auth.uid();
$$;


-- ─── STEP 2: Drop ALL existing policies (every possible name) ────────────────

-- users table
drop policy if exists "Users can view their own profile" on public.users;
drop policy if exists "Admins can view all users" on public.users;
drop policy if exists "Admins can update users" on public.users;
drop policy if exists "Users can update their own profile" on public.users;
drop policy if exists "users_select_own" on public.users;
drop policy if exists "users_select_admin" on public.users;
drop policy if exists "users_update_own" on public.users;
drop policy if exists "users_update_admin" on public.users;

-- clients table
drop policy if exists "Active users can view clients" on public.clients;
drop policy if exists "Active users can insert clients" on public.clients;
drop policy if exists "Active users can update clients" on public.clients;
drop policy if exists "Admins can manage clients" on public.clients;
drop policy if exists "clients_select_active" on public.clients;
drop policy if exists "clients_insert_active" on public.clients;
drop policy if exists "clients_update_active" on public.clients;
drop policy if exists "clients_delete_admin" on public.clients;

-- daily_reports table
drop policy if exists "Users can manage their own reports" on public.daily_reports;
drop policy if exists "Admins can view all reports" on public.daily_reports;
drop policy if exists "reports_all_own" on public.daily_reports;
drop policy if exists "reports_select_admin" on public.daily_reports;

-- commissions table
drop policy if exists "Users can view their own commissions" on public.commissions;
drop policy if exists "Admins can manage all commissions" on public.commissions;
drop policy if exists "commissions_select_own" on public.commissions;
drop policy if exists "commissions_insert_active" on public.commissions;
drop policy if exists "commissions_update_admin" on public.commissions;
drop policy if exists "commissions_delete_admin" on public.commissions;

-- activities table
drop policy if exists "Users can view their own activities" on public.activities;
drop policy if exists "Admins can view all activities" on public.activities;
drop policy if exists "activities_insert_active" on public.activities;
drop policy if exists "activities_select_admin" on public.activities;
drop policy if exists "activities_select_own" on public.activities;

-- notifications table
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists "notifications_own" on public.notifications;
drop policy if exists "notifications_admin_insert" on public.notifications;


-- ─── STEP 3: Recreate USERS policies (no recursion) ──────────────────────────

-- Anyone can read their own row
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

-- Admins can read all users (uses recursion-free JWT check)
create policy "users_select_admin" on public.users
  for select using (auth.jwt() ->> 'email' = 'arfin@getmoreappts.com');

-- Users can update their own profile (name only, not role)
create policy "users_update_own" on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can update any user (approve, change role etc.)
create policy "users_update_admin" on public.users
  for update using (auth.jwt() ->> 'email' = 'arfin@getmoreappts.com');


-- ─── STEP 4: Recreate CLIENTS policies ───────────────────────────────────────

-- Active users can read clients
create policy "clients_select_active" on public.clients
  for select using (public.get_my_status() = 'active');

-- Active users can insert clients
create policy "clients_insert_active" on public.clients
  for insert with check (public.get_my_status() = 'active');

-- Active users can update clients (admin or assigned closer/setter)
create policy "clients_update_active" on public.clients
  for update using (public.get_my_status() = 'active');

-- Admins can delete clients
create policy "clients_delete_admin" on public.clients
  for delete using (public.get_my_role() = 'admin');


-- ─── STEP 5: COMMISSIONS table — add new columns ────────────────────────────

-- Add commission_role to know which role this line belongs to
alter table public.commissions
  add column if not exists commission_role text
  check (commission_role in ('full_cycle_closer','setter','closer','standalone_closer','split_a','split_b','admin'));

-- Add setter and closer linkage per commission row
alter table public.commissions
  add column if not exists setter_id uuid references public.users(id);

alter table public.commissions
  add column if not exists closer_id uuid references public.users(id);

-- Custom split percentages for Person A and Person B
alter table public.commissions
  add column if not exists split_pct_a numeric default 50;

alter table public.commissions
  add column if not exists split_pct_b numeric default 50;

-- notes for admin overrides
alter table public.commissions
  add column if not exists admin_note text;

-- ─── STEP 6: Fix payout_status enum — add pending_approval + approved ────────

-- Add new values to existing enum (cannot remove old ones, they stay)
do $$
begin
  -- Add 'pending_approval' if not already there
  begin
    alter type payout_status add value if not exists 'pending_approval';
  exception when others then null;
  end;
  -- Add 'approved' if not already there  
  begin
    alter type payout_status add value if not exists 'approved';
  exception when others then null;
  end;
end$$;

-- ─── STEP 7: Recreate COMMISSIONS policies ───────────────────────────────────

create policy "commissions_select_own" on public.commissions
  for select using (
    user_id = auth.uid() or
    public.get_my_role() = 'admin'
  );

create policy "commissions_insert_active" on public.commissions
  for insert with check (public.get_my_status() = 'active');

create policy "commissions_update_admin" on public.commissions
  for update using (public.get_my_role() = 'admin');

create policy "commissions_delete_admin" on public.commissions
  for delete using (public.get_my_role() = 'admin');


-- ─── STEP 8: Recreate DAILY REPORTS policies ─────────────────────────────────

create policy "reports_all_own" on public.daily_reports
  for all using (auth.uid() = user_id);

create policy "reports_select_admin" on public.daily_reports
  for select using (public.get_my_role() = 'admin');


-- ─── STEP 9: ACTIVITIES policies ─────────────────────────────────────────────

create policy "activities_insert_active" on public.activities
  for insert with check (public.get_my_status() = 'active');

create policy "activities_select_admin" on public.activities
  for select using (public.get_my_role() = 'admin');

create policy "activities_select_own" on public.activities
  for select using (user_id = auth.uid());


-- ─── STEP 10: NOTIFICATIONS policies ─────────────────────────────────────────

create policy "notifications_own" on public.notifications
  for all using (user_id = auth.uid());

create policy "notifications_admin_insert" on public.notifications
  for insert with check (public.get_my_role() = 'admin');


-- ─── STEP 11: Make sure your account is admin + active ───────────────────────
-- Replace with your email if different
update public.users
  set role = 'admin', status = 'active'
  where email = 'arfin@getmoreappts.com';


-- ─── STEP 12: Add custom plan_type support (allow 'custom') ──────────────────
-- The original schema only allows 'minimum' or 'premium'. This allows custom deals.
alter table public.clients
  drop constraint if exists clients_plan_type_check;

alter table public.clients
  add constraint clients_plan_type_check
  check (plan_type in ('minimum', 'premium', 'custom') or plan_type is null);


-- ─── STEP 13: Create public.global_settings table ─────────────────────────────
create table if not exists public.global_settings (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.global_settings enable row level security;

-- Drop policies if exist
drop policy if exists "Anyone can view global settings" on public.global_settings;
drop policy if exists "Admins can manage global settings" on public.global_settings;

-- Allow anyone to read
create policy "Anyone can view global settings" on public.global_settings
  for select using (true);

-- Allow admins to manage
create policy "Admins can manage global settings" on public.global_settings
  for all using (public.get_my_role() = 'admin');

-- Insert default daily call target of 250
insert into public.global_settings (key, value)
  values ('daily_call_target', '250')
  on conflict (key) do nothing;


-- ─── Done! ────────────────────────────────────────────────────────────────────
-- The following statuses now exist in payout_status enum:
--   pending_approval → just submitted, admin has not reviewed
--   approved         → admin verified, awaiting payment
--   processing       → (legacy, maps to pending_approval in app)
--   pending          → (legacy, maps to approved in app)  
--   paid             → paid out with date recorded
-- All RLS infinite recursion is fixed via get_my_role() / get_my_status()

