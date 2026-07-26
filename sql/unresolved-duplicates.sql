-- Question: Which duplicate applicant pairs are still open for review?
-- Used by: Data Quality queue, Assistant hand-off.
-- Parameters:
--   :limit int — max pairs to return (default 100).
-- Recommended indexes:
--   CREATE INDEX duplicate_matches_open_idx ON public.duplicate_matches (created_at DESC)
--     WHERE resolved = false;
-- Performance note: filtered index avoids scanning resolved history as the ledger grows.

SELECT
  dm.id                    AS match_id,
  dm.reason,
  dm.created_at,
  a.application_id         AS a_application_id,
  a.first_name || ' ' || a.last_name AS a_name,
  a.email                  AS a_email,
  b.application_id         AS b_application_id,
  b.first_name || ' ' || b.last_name AS b_name,
  b.email                  AS b_email
FROM public.duplicate_matches dm
JOIN public.applicants a ON a.id = dm.applicant_a
JOIN public.applicants b ON b.id = dm.applicant_b
WHERE dm.resolved = false
ORDER BY dm.created_at DESC
LIMIT :limit;
