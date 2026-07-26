-- Question: Which upstream integrations are failing the most, as a share of records they attempted?
-- Used by: Integrations health, Insights reliability.
-- Parameters: none.
-- Recommended indexes:
--   PRIMARY KEY on data_sources(id) is sufficient for the row count sizes in this prototype.
-- Performance note: aggregation is O(n) on data_sources; keep failed_records/records_processed
--   maintained by the ingestion writer to avoid a scan over import_jobs.

SELECT
  name,
  kind,
  records_processed,
  failed_records,
  CASE
    WHEN records_processed = 0 THEN 0
    ELSE round(100.0 * failed_records / records_processed, 2)
  END AS failure_rate_pct
FROM public.data_sources
ORDER BY failure_rate_pct DESC, failed_records DESC;
