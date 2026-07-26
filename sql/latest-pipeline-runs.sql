-- Question: For each data source, what was the most recent pipeline run and its outcome?
-- Used by: Pipelines run history header, Overview freshness KPI.
-- Parameters: none.
-- Recommended indexes:
--   CREATE INDEX import_jobs_source_recent_idx ON public.import_jobs (source_name, created_at DESC);
-- Performance note: ROW_NUMBER() windowed over source_name lets the planner use the composite
--   index for a top-1-per-group without a self join.

WITH ranked AS (
  SELECT
    ij.*,
    row_number() OVER (PARTITION BY source_name ORDER BY created_at DESC) AS rn
  FROM public.import_jobs ij
)
SELECT
  source_name,
  kind,
  status,
  records_total,
  records_valid,
  records_invalid,
  created_at
FROM ranked
WHERE rn = 1
ORDER BY created_at DESC;
