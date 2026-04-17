-- ============================================================
-- MAKE MY REELS – Supabase Schema
-- ============================================================
-- Auth: Uses the native Clerk + Supabase integration.
-- Setup:
--   1. Clerk Dashboard → Integrations → Activate Supabase → copy your Clerk domain
--   2. Supabase Dashboard → Authentication → Sign In / Up → Add Provider → Clerk
--      → paste your Clerk domain
-- The Clerk user ID is available via:  auth.jwt()->>'sub'
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE public.team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  location TEXT,
  avatar TEXT,
  color TEXT,
  active_projects INTEGER DEFAULT 0,
  completed_projects INTEGER DEFAULT 0,
  avg_rating NUMERIC DEFAULT 0,
  avg_effort NUMERIC DEFAULT 0,
  on_time_rate NUMERIC DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  onboarding_notes TEXT,
  aadhaar_image_url TEXT,
  kyc_declaration BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  location TEXT,
  notes TEXT,
  avatar TEXT,
  color TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  notes TEXT,
  location TEXT,
  priority TEXT DEFAULT 'Medium',
  tags TEXT[] DEFAULT '{}',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_ids TEXT[] DEFAULT '{}',
  team_member_ids TEXT[] DEFAULT '{}',
  event_date TEXT NOT NULL,
  event_time TEXT,
  due_date TEXT,
  submission_deadline TEXT,
  status TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  budget NUMERIC,
  expenses NUMERIC,
  rating NUMERIC,
  requires_payment BOOLEAN DEFAULT false,
  invoice_amount NUMERIC,
  payment_status TEXT DEFAULT 'Pending',
  razorpay_link_id TEXT,
  razorpay_link_url TEXT,
  instagram_links JSONB DEFAULT '[]'::jsonb,
  dependencies TEXT[] DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY – core tables
-- ============================================================
-- Any authenticated user (valid Clerk JWT with a 'sub' claim) gets full access.
-- Anonymous / unauthenticated requests are blocked.

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- team_members
CREATE POLICY "Authenticated users can read team_members"
  ON public.team_members FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can insert team_members"
  ON public.team_members FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can update team_members"
  ON public.team_members FOR UPDATE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can delete team_members"
  ON public.team_members FOR DELETE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

-- clients
CREATE POLICY "Authenticated users can read clients"
  ON public.clients FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can update clients"
  ON public.clients FOR UPDATE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can delete clients"
  ON public.clients FOR DELETE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

-- projects
CREATE POLICY "Authenticated users can read projects"
  ON public.projects FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can insert projects"
  ON public.projects FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can update projects"
  ON public.projects FOR UPDATE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can delete projects"
  ON public.projects FOR DELETE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

-- ============================================================
-- NOTIFICATION SYSTEM TABLES
-- ============================================================

CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'medium',
  is_read BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  channels_sent TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  shoot_reminder_1h JSONB DEFAULT '{"push": true, "email": false, "in_app": true}'::jsonb,
  shoot_reminder_24h JSONB DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  deadline_reminder JSONB DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  status_change JSONB DEFAULT '{"push": false, "email": false, "in_app": true}'::jsonb,
  project_assigned JSONB DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  overdue_alert JSONB DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  payment_received JSONB DEFAULT '{"push": true, "email": false, "in_app": true}'::jsonb,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- ============================================================
-- ROW LEVEL SECURITY – notification tables
-- ============================================================
-- Users can only read/update their own notifications.
-- Server-side inserts (cron jobs) use the service_role key which bypasses RLS.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- notifications: users see/update only their own
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = (select auth.jwt()->>'sub'));

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = (select auth.jwt()->>'sub'));

CREATE POLICY "Server inserts notifications"
  ON public.notifications FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

-- notification_preferences: users manage only their own
CREATE POLICY "Users read own preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = (select auth.jwt()->>'sub'));

CREATE POLICY "Users manage own preferences"
  ON public.notification_preferences FOR ALL
  USING (user_id = (select auth.jwt()->>'sub'));

-- push_subscriptions: users manage only their own
CREATE POLICY "Users read own subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = (select auth.jwt()->>'sub'));

CREATE POLICY "Users manage own subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (user_id = (select auth.jwt()->>'sub'));

-- ============================================================
-- PHASE 1: ASSIGNMENT & WHATSAPP TABLES
-- ============================================================

CREATE TABLE public.project_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  role_needed TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | wa_sent | accepted | declined | expired | cancelled
  response_token TEXT DEFAULT gen_random_uuid()::text,  -- secure token for accept/decline URLs
  whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  decline_reason TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  assignment_group_id UUID NOT NULL DEFAULT gen_random_uuid(),
  auto_expire_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,                 -- Clerk user ID
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.whatsapp_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL,                  -- outbound | inbound
  recipient_phone TEXT NOT NULL,
  recipient_type TEXT NOT NULL,             -- team_member | client
  recipient_id UUID,
  template_name TEXT,
  template_params JSONB DEFAULT '{}'::jsonb,
  message_type TEXT NOT NULL,              -- assignment_request | assignment_confirmation | etc.
  whatsapp_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | delivered | read | failed
  error_message TEXT,
  related_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  related_assignment_id UUID REFERENCES public.project_assignments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for project_assignments
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project_assignments"
  ON public.project_assignments FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can insert project_assignments"
  ON public.project_assignments FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can update project_assignments"
  ON public.project_assignments FOR UPDATE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

-- RLS for whatsapp_messages
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read whatsapp_messages"
  ON public.whatsapp_messages FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can insert whatsapp_messages"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can update whatsapp_messages"
  ON public.whatsapp_messages FOR UPDATE
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX idx_projects_client_id ON public.projects(client_id);
CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_event_date ON public.projects(event_date);
CREATE INDEX idx_team_members_is_deleted ON public.team_members(is_deleted) WHERE is_deleted = false;
CREATE INDEX idx_clients_is_deleted ON public.clients(is_deleted) WHERE is_deleted = false;
-- ============================================================
-- PHASE 2: CANDIDATE RANKING + AVAILABILITY TABLES
-- ============================================================

CREATE TABLE public.assignment_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_group_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  role_needed TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  score_breakdown JSONB DEFAULT '{}'::jsonb,
  distance_km NUMERIC,
  is_available BOOLEAN DEFAULT true,
  was_attempted BOOLEAN DEFAULT false
);

CREATE TABLE public.team_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  unavailable_from DATE NOT NULL,
  unavailable_to DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PHASE 4: ADMIN DIGEST TABLE
-- ============================================================

CREATE TABLE public.admin_digests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMPTZ DEFAULT now(),
  todays_shoots JSONB DEFAULT '[]'::jsonb,
  pending_confirmations JSONB DEFAULT '[]'::jsonb,
  quote_follow_ups JSONB DEFAULT '[]'::jsonb,
  overdue_projects JSONB DEFAULT '[]'::jsonb,
  revenue_this_month NUMERIC DEFAULT 0,
  revenue_pipeline NUMERIC DEFAULT 0,
  revenue_outstanding NUMERIC DEFAULT 0
);

-- RLS for new tables
ALTER TABLE public.assignment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage assignment_candidates"
  ON public.assignment_candidates FOR ALL
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can manage team_availability"
  ON public.team_availability FOR ALL
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can read admin_digests"
  ON public.admin_digests FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE INDEX idx_project_assignments_project_id ON public.project_assignments(project_id);
CREATE INDEX idx_project_assignments_team_member_id ON public.project_assignments(team_member_id);
CREATE INDEX idx_project_assignments_status ON public.project_assignments(status);
CREATE INDEX idx_project_assignments_auto_expire ON public.project_assignments(auto_expire_at) WHERE status = 'wa_sent';
CREATE INDEX idx_whatsapp_messages_assignment_id ON public.whatsapp_messages(related_assignment_id);
CREATE INDEX idx_whatsapp_messages_project_id ON public.whatsapp_messages(related_project_id);
CREATE INDEX idx_assignment_candidates_group ON public.assignment_candidates(assignment_group_id);
CREATE INDEX idx_assignment_candidates_project ON public.assignment_candidates(project_id);
CREATE INDEX idx_team_availability_member ON public.team_availability(team_member_id);
CREATE INDEX idx_team_availability_dates ON public.team_availability(unavailable_from, unavailable_to);
CREATE INDEX idx_admin_digests_generated ON public.admin_digests(generated_at DESC);

-- ============================================================
-- CRON IDEMPOTENCY TABLE
-- ============================================================

CREATE TABLE public.cron_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name TEXT NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cron_name, run_date)
);

-- No RLS — only accessed by service_role key from cron jobs

-- ============================================================
-- RATE LIMIT LOG (API throttling)
-- ============================================================

CREATE TABLE public.rate_limit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  route TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rate_limit_log_lookup ON public.rate_limit_log(user_id, route, created_at DESC);

-- No RLS — only accessed by service_role key from API routes

-- ============================================================
-- DISTANCE CACHE (Google Maps API results, 7-day TTL)
-- ============================================================

CREATE TABLE public.distance_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(origin, destination)
);

-- No RLS — only accessed by service_role key from API routes

-- ============================================================
-- PENDING APPROVALS (replaces Google Sheets approval queue)
-- ============================================================

CREATE TABLE public.pending_approvals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                          -- edit | delete | create | statusChange
  entity_type TEXT NOT NULL,                   -- project | team | client
  entity_id TEXT NOT NULL,
  entity_title TEXT NOT NULL,
  changes JSONB DEFAULT '{}'::jsonb,
  requested_by TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'       -- pending | approved | rejected
);

ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage pending_approvals"
  ON public.pending_approvals FOR ALL
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE INDEX idx_pending_approvals_status ON public.pending_approvals(status);

-- ============================================================
-- AUDIT LOGS (replaces Google Sheets logs)
-- ============================================================

CREATE TABLE public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  fields TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit_logs"
  ON public.audit_logs FOR SELECT
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated users can insert audit_logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK ((select auth.jwt()->>'sub') IS NOT NULL);

CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ============================================================
-- TEAM ROLES (replaces Google Sheets Team_Roles tab)
-- ============================================================

CREATE TABLE public.team_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE
);

ALTER TABLE public.team_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage team_roles"
  ON public.team_roles FOR ALL
  USING ((select auth.jwt()->>'sub') IS NOT NULL);

-- ============================================================
-- STORAGE BUCKET FOR DOCUMENTS (Aadhaar images, etc.)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage: authenticated users only
CREATE POLICY "Authenticated read on documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND (select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated upload to documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND (select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated update on documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'documents' AND (select auth.jwt()->>'sub') IS NOT NULL);

CREATE POLICY "Authenticated delete from documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND (select auth.jwt()->>'sub') IS NOT NULL);
