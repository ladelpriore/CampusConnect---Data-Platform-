-- Question: How are trusted applicants distributed across source systems and admissions statuses?
-- Used by: Overview KPIs, Integrations health, Insights breakdown.
-- Parameters: none.
-- Recommended indexes:
--   CREATE INDEX applicants_source_status_idx ON public.applicants (source, application_status)
--     WHERE merged_into IS NULL;
-- Performance note: filtered index keeps this GROUP BY on a narrow subset (post-merge canonical rows only).

SELECT
  coalesce(source, 'unknown')             AS source,
  coalesce(application_status, 'unknown') AS status,
  count(*)                                AS applicants
FROM public.applicants
WHERE merged_into IS NULL
GROUP BY 1, 2
ORDER BY applicants DESC, source, status;
