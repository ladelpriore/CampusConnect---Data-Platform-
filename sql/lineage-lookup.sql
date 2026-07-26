-- Question: What source system and recent audit trail explains a canonical applicant?
-- Used by: Data Model → Lineage drill-in, Assistant "why does this look this way?" answer.
-- Parameters:
--   :application_id text — canonical applicant to trace.
-- Recommended indexes:
--   CREATE INDEX applicants_application_id_idx ON public.applicants (application_id);
--   CREATE INDEX audit_events_affected_idx     ON public.audit_events (affected_record, created_at DESC);
-- Performance note: two indexed lookups + a bounded LIMIT keep this responsive even as the
--   audit ledger grows to millions of rows.

WITH target AS (
  SELECT * FROM public.applicants WHERE application_id = :application_id LIMIT 1
)
SELECT
  t.application_id,
  t.first_name || ' ' || t.last_name AS name,
  t.source                            AS source_system,
  t.normalized_email,
  ae.created_at                       AS event_at,
  ae.action,
  ae.actor,
  ae.result,
  ae.metadata
FROM target t
LEFT JOIN public.audit_events ae
  ON ae.affected_record = t.application_id
ORDER BY ae.created_at DESC NULLS LAST
LIMIT 25;
