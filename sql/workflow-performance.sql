-- Question: How often does each workflow rule fire, and how do outcomes distribute?
-- Used by: Automation performance panel, Insights reliability.
-- Parameters: none.
-- Recommended indexes:
--   CREATE INDEX workflow_executions_rule_idx ON public.workflow_executions (rule_id, created_at DESC);
-- Performance note: conditional aggregation is cheaper than three separate joins for outcome buckets.

SELECT
  wr.name                                                  AS rule,
  wr.active,
  count(we.id)                                             AS executions,
  count(*) FILTER (WHERE we.result = 'succeeded')          AS succeeded,
  count(*) FILTER (WHERE we.result = 'skipped')            AS skipped,
  count(*) FILTER (WHERE we.result = 'failed')             AS failed,
  max(we.created_at)                                       AS last_fired_at
FROM public.workflow_rules wr
LEFT JOIN public.workflow_executions we ON we.rule_id = wr.id
GROUP BY wr.id, wr.name, wr.active
ORDER BY executions DESC, rule;
