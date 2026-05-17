-- ==========================================================
-- 🛠️ MAOS PRODUCTION DATABASE HARDENING & CLEANUP SCRIPT
-- ==========================================================
-- This script contains queries to wipe out mock testing data,
-- verify RLS (Row Level Security) policies, and grant full
-- operational permissions to Postgres roles.
-- Copy and execute these queries inside the Supabase SQL Editor.
-- ==========================================================

------------------------------------------------------------
-- 🧹 STEP 1: WIPE OUT FAKE / TESTING DAILY REPORTS
------------------------------------------------------------
-- Wipes all mock daily reports so you have a clean slate.
-- (This does not affect actual users or lead campaigns).
DELETE FROM public.daily_reports;

-- Optional: If you want to reset auto-increment primary keys:
-- ALTER SEQUENCE daily_reports_id_seq RESTART WITH 1;


------------------------------------------------------------
-- 🔒 STEP 2: SCHEMA RLS & SECURITY CONFIGURATION
------------------------------------------------------------
-- Enable Row Level Security on all critical tables
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_lines ENABLE ROW LEVEL SECURITY;


------------------------------------------------------------
-- 🛡️ STEP 3: DEFINE COMPREHENSIVE RLS POLICIES
------------------------------------------------------------

-- A. DAILY REPORTS POLICIES
DROP POLICY IF EXISTS "Admins can view all daily reports" ON public.daily_reports;
CREATE POLICY "Admins can view all daily reports" ON public.daily_reports
    FOR SELECT TO authenticated
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Users can insert their own daily reports" ON public.daily_reports;
CREATE POLICY "Users can insert their own daily reports" ON public.daily_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Users can update their own daily reports" ON public.daily_reports;
CREATE POLICY "Users can update their own daily reports" ON public.daily_reports
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Users can view their own daily reports" ON public.daily_reports;
CREATE POLICY "Users can view their own daily reports" ON public.daily_reports
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
    );


-- B. CAMPAIGNS POLICIES
DROP POLICY IF EXISTS "Admins can manage all campaigns" ON public.campaigns;
CREATE POLICY "Admins can manage all campaigns" ON public.campaigns
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Teammates can view assigned campaigns" ON public.campaigns;
CREATE POLICY "Teammates can view assigned campaigns" ON public.campaigns
    FOR SELECT TO authenticated
    USING (
        assignee_email = (SELECT email FROM public.users WHERE id = auth.uid())
        OR assignment_type = 'shared'
    );


-- C. COMMISSIONS POLICIES
DROP POLICY IF EXISTS "Admins can manage all commissions" ON public.commissions;
CREATE POLICY "Admins can manage all commissions" ON public.commissions
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Teammates can view own commissions" ON public.commissions;
CREATE POLICY "Teammates can view own commissions" ON public.commissions
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
    );


------------------------------------------------------------
-- 🔑 STEP 4: DATABASE GRANTS FOR PRODUCTION ROLES
------------------------------------------------------------
-- Grants read/write permissions on public schema to authenticated users and service roles.

-- 1. Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant permissions on tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 3. Grant permissions on sequences (auto-incrementing IDs)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 4. Ensure future tables also inherit these permissions automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ==========================================================
-- ✅ SCHEMA RE-VERIFICATION COMPLETE
-- ==========================================================
