-- Question: Which applicants have the most open validation issues, and of what kinds?
-- Used by: Data Quality dimensions, Assistant triage.
-- Parameters: none.
-- Recommended indexes:
--   CREATE INDEX validation_errors_applicant_open_idx
--     ON public.validation_errors (applicant_id) WHERE resolved = false;
-- Performance note: conditional aggregation collapses one row per applicant with per-kind counts
--   in a single pass; keep the filtered index narrow.

SELECT
  a.application_id,
  a.first_name || ' ' || a.last_name AS name,
  a.application_status,
  count(*)                                       AS open_issues,
  count(*) FILTER (WHERE ve.kind = 'invalid_email')  AS invalid_email,
  count(*) FILTER (WHERE ve.kind = 'missing_field')  AS missing_field,
  count(*) FILTER (WHERE ve.kind = 'bad_status')     AS bad_status,
  count(*) FILTER (WHERE ve.kind = 'bad_term')       AS bad_term
FROM public.validation_errors ve
JOIN public.applicants a ON a.id = ve.applicant_id
WHERE ve.resolved = false
GROUP BY a.id, a.application_id, a.first_name, a.last_name, a.application_status
ORDER BY open_issues DESC
LIMIT 50;
