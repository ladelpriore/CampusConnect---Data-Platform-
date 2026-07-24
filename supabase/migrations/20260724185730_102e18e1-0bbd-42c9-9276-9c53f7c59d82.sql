
-- Data sources
CREATE TABLE public.data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  sync_frequency TEXT NOT NULL DEFAULT 'hourly',
  last_sync_at TIMESTAMPTZ,
  records_processed INT NOT NULL DEFAULT 0,
  failed_records INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sources TO authenticated;
GRANT ALL ON public.data_sources TO service_role;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read data_sources" ON public.data_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write data_sources" ON public.data_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Applicants
CREATE TABLE public.applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  normalized_email TEXT,
  application_status TEXT,
  enrollment_term TEXT,
  source_campaign TEXT,
  missing_documents TEXT[] DEFAULT '{}',
  source TEXT,
  merged_into UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.applicants (application_id);
CREATE INDEX ON public.applicants (normalized_email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicants TO authenticated;
GRANT ALL ON public.applicants TO service_role;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read applicants" ON public.applicants FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write applicants" ON public.applicants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Import jobs
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.data_sources(id) ON DELETE SET NULL,
  source_name TEXT,
  kind TEXT NOT NULL, -- 'csv' or 'sync'
  status TEXT NOT NULL DEFAULT 'completed',
  records_total INT NOT NULL DEFAULT 0,
  records_valid INT NOT NULL DEFAULT 0,
  records_invalid INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all import_jobs" ON public.import_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Validation errors
CREATE TABLE public.validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID REFERENCES public.applicants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_errors TO authenticated;
GRANT ALL ON public.validation_errors TO service_role;
ALTER TABLE public.validation_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all validation_errors" ON public.validation_errors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Duplicate matches
CREATE TABLE public.duplicate_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_a UUID REFERENCES public.applicants(id) ON DELETE CASCADE,
  applicant_b UUID REFERENCES public.applicants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_matches TO authenticated;
GRANT ALL ON public.duplicate_matches TO service_role;
ALTER TABLE public.duplicate_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all duplicate_matches" ON public.duplicate_matches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Workflow rules
CREATE TABLE public.workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_rules TO authenticated;
GRANT ALL ON public.workflow_rules TO service_role;
ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all workflow_rules" ON public.workflow_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Workflow executions
CREATE TABLE public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.workflow_rules(id) ON DELETE CASCADE,
  applicant_id UUID REFERENCES public.applicants(id) ON DELETE SET NULL,
  action_taken TEXT NOT NULL,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_executions TO authenticated;
GRANT ALL ON public.workflow_executions TO service_role;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all workflow_executions" ON public.workflow_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit events
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT,
  action TEXT NOT NULL,
  affected_record TEXT,
  source TEXT,
  result TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all audit_events" ON public.audit_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed data sources
INSERT INTO public.data_sources (name, kind, status, sync_frequency, last_sync_at, records_processed, failed_records) VALUES
  ('Banner SIS', 'sis', 'connected', 'every 15 min', now() - interval '12 minutes', 4820, 3),
  ('Slate CRM', 'crm', 'connected', 'hourly', now() - interval '45 minutes', 2140, 7),
  ('HubSpot Marketing', 'marketing', 'degraded', 'hourly', now() - interval '3 hours', 980, 24);

-- Seed workflow rule
INSERT INTO public.workflow_rules (name, description, active, condition, action) VALUES
  ('Incomplete → Document Follow-Up',
   'When an application is Incomplete and missing documents, assign a Document Follow-Up task and notify the counselor.',
   TRUE,
   '{"status":"Incomplete","missing_documents_not_empty":true}'::jsonb,
   '{"assign":"Document Follow-Up","notify":"admissions_counselor"}'::jsonb);

-- Seed 25 synthetic applicants
INSERT INTO public.applicants (application_id, first_name, last_name, email, normalized_email, application_status, enrollment_term, source_campaign, missing_documents, source) VALUES
  ('APP-1001','Jordan','Lee','jordan.lee@example.edu','jordan.lee@example.edu','Incomplete','Fall 2026','Open House 2025',ARRAY['transcript','recommendation'],'Banner SIS'),
  ('APP-1002','Priya','Shah','priya.shah@example.edu','priya.shah@example.edu','Submitted','Fall 2026','Search Ads',ARRAY[]::text[],'Slate CRM'),
  ('APP-1003','Marcus','Chen','marcus.chen@example.edu','marcus.chen@example.edu','Admitted','Fall 2026','Referral',ARRAY[]::text[],'Banner SIS'),
  ('APP-1004','Ana','Rodriguez','ana.rodriguez@example.edu','ana.rodriguez@example.edu','Incomplete','Spring 2026','Open House 2025',ARRAY['transcript'],'Banner SIS'),
  ('APP-1005','Sam','Nguyen',NULL,NULL,'Incomplete','Fall 2026','Email Drip',ARRAY['fafsa','transcript'],'Slate CRM'),
  ('APP-1006','Taylor','Brown','taylor.brown[at]example.edu',NULL,'Submitted','Fall 2026','Search Ads',ARRAY[]::text[],'HubSpot Marketing'),
  ('APP-1007','Riya','Patel','riya.patel@example.edu','riya.patel@example.edu','Waitlisted','Fall 2026','Open House 2025',ARRAY['recommendation'],'Banner SIS'),
  ('APP-1008','Chris','Kim','chris.kim@example.edu','chris.kim@example.edu','Denied','Fall 2026','Search Ads',ARRAY[]::text[],'Slate CRM'),
  ('APP-1009','Zoe','Miller','zoe.miller@example.edu','zoe.miller@example.edu','Admitted','Fall 2026','Referral',ARRAY[]::text[],'Banner SIS'),
  ('APP-1010','Diego','Hernandez','diego.h@example.edu','diego.h@example.edu','Incomplete','Fall 2026','Open House 2025',ARRAY['transcript'],'Banner SIS'),
  ('APP-1011','Hana','Suzuki','hana.suzuki@example.edu','hana.suzuki@example.edu','Submitted','Spring 2026','Search Ads',ARRAY[]::text[],'Slate CRM'),
  ('APP-1012','Noah','Williams','noah.w@example.edu','noah.w@example.edu','Incomplete','Fall 2026','Email Drip',ARRAY['transcript','fafsa','recommendation'],'Banner SIS'),
  ('APP-1013','Emma','Davis','emma.davis@example.edu','emma.davis@example.edu','Admitted','Fall 2026','Referral',ARRAY[]::text[],'Banner SIS'),
  ('APP-1014','Liam','Garcia','liam.garcia@example.edu','liam.garcia@example.edu','Submitted','Fall 2026','Open House 2025',ARRAY[]::text[],'Slate CRM'),
  (NULL,'Olivia','Martinez','olivia.m@example.edu','olivia.m@example.edu','Submitted','Fall 2026','Search Ads',ARRAY[]::text[],'HubSpot Marketing'),
  ('APP-1016','Ethan','Wilson','ethan.wilson@example.edu','ethan.wilson@example.edu','Incomplete','Fall 2026','Email Drip',ARRAY['transcript'],'Banner SIS'),
  ('APP-1017','Ava','Anderson','ava.anderson@example.edu','ava.anderson@example.edu','Waitlisted','Fall 2026','Open House 2025',ARRAY[]::text[],'Slate CRM'),
  ('APP-1018','Mia','Thomas','mia.thomas@example.edu','mia.thomas@example.edu','Admitted','Fall 2026','Referral',ARRAY[]::text[],'Banner SIS'),
  -- Duplicate application_id APP-1003
  ('APP-1003','Marcus','Chen','marcus.c@example.edu','marcus.c@example.edu','Submitted','Fall 2026','Search Ads',ARRAY[]::text[],'Slate CRM'),
  -- Duplicate normalized email
  ('APP-1020','Jordan','Lee','JORDAN.LEE@example.edu','jordan.lee@example.edu','Incomplete','Fall 2026','Open House 2025',ARRAY['transcript'],'HubSpot Marketing'),
  ('APP-1021','Sophia','Jackson','sophia.jackson@example.edu','sophia.jackson@example.edu','Submitted','Fall 2026','Referral',ARRAY[]::text[],'Banner SIS'),
  -- Conflicting status pair (same app id APP-1022 twice with different statuses)
  ('APP-1022','Isabella','White','isabella.white@example.edu','isabella.white@example.edu','Admitted','Fall 2026','Referral',ARRAY[]::text[],'Banner SIS'),
  ('APP-1022','Isabella','White','isabella.white@example.edu','isabella.white@example.edu','Waitlisted','Fall 2026','Referral',ARRAY[]::text[],'Slate CRM'),
  ('APP-1024','Lucas','Harris','not-an-email','not-an-email','Submitted','Fall 2026','Email Drip',ARRAY[]::text[],'HubSpot Marketing'),
  ('APP-1025','Mila','Clark','mila.clark@example.edu','mila.clark@example.edu','Incomplete','Fall 2026','Open House 2025',ARRAY['fafsa'],'Banner SIS');

-- Seed initial audit events
INSERT INTO public.audit_events (actor, action, affected_record, source, result) VALUES
  ('system','sync.completed','Banner SIS','sis','4820 records processed, 3 failed'),
  ('system','sync.completed','Slate CRM','crm','2140 records processed, 7 failed'),
  ('system','sync.degraded','HubSpot Marketing','marketing','24 records failed validation');
