# SQL library

Curated, read-mostly queries backing the CampusContext SQL Workbench
(Developer & Governance → SQL). Each file documents the business
question, parameters, recommended indexes and a short performance note,
and mirrors an allowlisted query id in
`src/lib/sql-workbench.ts`.

| File | Query id | Notes |
| --- | --- | --- |
| `applicants-by-source.sql` | `applicants_by_source` | JOIN + GROUP BY over canonical applicants |
| `integration-failure-rate.sql` | `integration_failure_rate` | Calculated percentage, ORDER BY |
| `unresolved-duplicates.sql` | `unresolved_duplicates` | Joins through `duplicate_matches` |
| `data-quality-issues.sql` | `data_quality_issues` | JOIN + conditional aggregation |
| `latest-pipeline-runs.sql` | `latest_pipeline_runs` | CTE + `row_number()` window function |
| `workflow-performance.sql` | `workflow_performance` | Aggregation by outcome |
| `incremental-ingestion.sql` | `incremental_ingestion` | Watermark parameter, `ORDER BY updated_at` |
| `idempotent-upsert.sql` | `idempotent_upsert` | `INSERT ... ON CONFLICT` — documented write, NOT executed from the browser |
| `jsonb-workflow-conditions.sql` | `jsonb_workflow_conditions` | JSONB containment against `workflow_rules.condition` |
| `lineage-lookup.sql` | `lineage_lookup` | Trace an applicant to its source and audit trail |

The workbench executes read-only queries via typed Supabase calls that
match the SQL text on this page. The idempotent-upsert file is
reference-only and blocked from execution.
