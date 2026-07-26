-- Question: Which workflow rules target a given application status, using their JSONB condition?
-- Used by: Automation registry filter, rule impact analysis.
-- Parameters:
--   :status text — application status to search for (e.g. 'Incomplete').
-- Recommended indexes:
--   CREATE INDEX workflow_rules_condition_gin_idx
--     ON public.workflow_rules USING gin (condition jsonb_path_ops);
-- Performance note: jsonb_path_ops GIN indexes the @> containment operator well; the query stays
--   sargable and avoids scanning every rule row as the ruleset grows.

SELECT
  id,
  name,
  active,
  condition,
  action
FROM public.workflow_rules
WHERE condition @> jsonb_build_object('application_status', :status)
ORDER BY active DESC, name;
