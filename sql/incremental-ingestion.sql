-- Question: Which applicant rows changed since the last successful sync watermark?
-- Used by: Pipelines incremental extract stage.
-- Parameters:
--   :watermark timestamptz — last successful sync time for the source.
--   :limit int — batch size (default 500).
-- Recommended indexes:
--   CREATE INDEX applicants_updated_at_idx ON public.applicants (updated_at);
-- Performance note: ORDER BY updated_at ASC + LIMIT is a keyset-friendly batch;
--   the next run passes the max(updated_at) it observed as the new watermark.

SELECT
  id,
  application_id,
  first_name,
  last_name,
  email,
  application_status,
  updated_at
FROM public.applicants
WHERE updated_at > :watermark
  AND merged_into IS NULL
ORDER BY updated_at ASC
LIMIT :limit;
