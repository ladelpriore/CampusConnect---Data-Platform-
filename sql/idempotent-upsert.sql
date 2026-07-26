-- Question: How do we ingest an applicant row without creating duplicates on retry?
-- Used by: Documented write path for ingestion workers. NOT executed from the browser workbench.
-- Parameters: bound by the caller (application_id, first_name, last_name, email, ...).
-- Recommended indexes:
--   CREATE UNIQUE INDEX applicants_application_id_uidx ON public.applicants (application_id)
--     WHERE application_id IS NOT NULL;
--   CREATE INDEX applicants_norm_email_idx ON public.applicants (normalized_email);
-- Performance note: ON CONFLICT relies on the unique index; the partial WHERE keeps NULL
--   application_ids out of uniqueness so we can still ingest source rows that lack a canonical id.

INSERT INTO public.applicants (
  application_id, first_name, last_name, email, normalized_email,
  application_status, enrollment_term, source_campaign, source, updated_at
)
VALUES (
  :application_id, :first_name, :last_name, :email, lower(trim(:email)),
  :application_status, :enrollment_term, :source_campaign, :source, now()
)
ON CONFLICT (application_id) WHERE application_id IS NOT NULL
DO UPDATE SET
  first_name         = excluded.first_name,
  last_name          = excluded.last_name,
  email              = excluded.email,
  normalized_email   = excluded.normalized_email,
  application_status = excluded.application_status,
  enrollment_term    = excluded.enrollment_term,
  source_campaign    = excluded.source_campaign,
  source             = excluded.source,
  updated_at         = now();
