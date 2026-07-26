
## Approach

This is an information-architecture and navigation refactor, not a rebuild. I will reuse every existing page component as-is, wrap them in new tabbed "hub" routes, and add new subsections where the spec requires them (Data Model entities/relationships/lineage, Pipelines, Insights, Developer & Governance reference tabs). No database schema changes are required — I'll reuse `data_sources`, `import_jobs`, `validation_errors`, `duplicate_matches`, `workflow_rules`, `workflow_executions`, `audit_events`, `applicants`, `quality_snapshots`.

Existing routes at `/sources`, `/import`, `/quality`, `/workflows`, `/assistant`, `/audit` will be **removed from the sidebar** but kept as working URLs so deep links and the guided demo don't break. Each existing page component is refactored to `export function XPage()` so it can be embedded inside a tab panel on the new hub routes.

## New primary navigation (sidebar)

```text
1. Overview             /dashboard
2. Data Model           /data-model      (tabs: Entities · Fields · Relationships · Data Quality · Lineage)
3. Integrations         /integrations    (tabs: Connections · APIs · Webhooks · Imports & Exports · Mappings)
4. Pipelines            /pipelines       (list + run-detail drawer)
5. Automation           /automation      (tabs: Workflows · Rules · Triggers & Actions · Execution History)
6. Insights             /insights        (dashboards: quality · reliability · pipelines · workflows · source attribution)
7. Developer & Governance /developer     (tabs: API Explorer · SQL · MongoDB · Audit · Access & Tenancy)
```

Admissions Assistant is dropped from the sidebar; kept accessible from Overview → **Powered Applications → Agent Workspace** card (opens `/assistant`).

## Route changes

**Kept, unchanged URL, updated content**
- `/dashboard` — new heading "Core Data & Integrations Platform", platform KPIs (Connected integrations, Pipeline success rate, Data-quality score, Records synchronized, Failed records, Workflow executions), pipeline volume + failures-by-integration + integration health, removed Application Status pie, added architecture section (Source Systems / Core Platform / Powered Applications), guided demo reordered.

**Kept, still routable, removed from sidebar** (embedded inside hubs)
- `/sources`, `/import`, `/quality`, `/workflows`, `/audit`, `/assistant`

**New hub routes**
- `/data-model` — Entities tab lists all 9 tables with description, fields, types, required/PK/FK, indexes, relationships, example record (rendered live from Supabase). Fields tab = canonical fields catalog. Relationships tab = compact ASCII/SVG diagram. Data Quality tab = **embeds existing `QualityPage`**. Lineage tab = source-system → source-field → mapping → canonical-field table.
- `/integrations` — Connections tab embeds `SourcesPage`. Imports & Exports embeds `ImportPage` + history table from `import_jobs`. Mappings tab shows canonical mapping catalog. APIs and Webhooks tabs show clearly-labeled reference examples (REST endpoints table, sample webhook payload) marked "Reference design — not live".
- `/pipelines` — Renders the ingestion stage strip (Extract → Stage → Validate → Transform → Match/Dedupe → Load Canonical → Publish), plus pipeline definitions (one per data source) and run history built from `import_jobs`. Row click opens a drawer with per-stage record counts (derived from `records_total`/`records_valid`/`records_invalid`), applied mapping, and related audit events. Simulated stages labeled.
- `/automation` — Workflows tab embeds `WorkflowsPage`. Rules/Triggers & Actions/Execution History are additional views of the same `workflow_rules` and `workflow_executions` data.
- `/insights` — 5 focused charts driven by existing tables: completeness by source (from `applicants.source`), failed records by integration (`data_sources`), pipeline success/duration trend (`import_jobs`), workflow outcomes (`workflow_executions`), records processed by source (`import_jobs`).
- `/developer` — API Explorer (reference endpoint table with request/response snippets), SQL (schema DDL summary + sample queries), MongoDB (reference document model, labeled "Reference design — live backend is PostgreSQL"), Audit tab embeds `AuditPage`, Access & Tenancy shows role model reference (admin/counselor/read-only) with prototype-limitation note.

## Component refactor

Each existing `_authenticated/*.tsx` will change from `component: Inline` to `export function XPage()` + `component: XPage`. New hub route files import those page components and render them inside `Tabs`.

## Copy/positioning updates

- Everywhere: "admissions operations console" → "core data and integrations platform".
- Auth page tagline updated to match.
- `README.md` updated with new IA.
- Guided Demo order → Integrations → Data Model (Data Quality) → Pipelines → Automation → Insights → Developer & Governance (Audit), plus Agent Workspace demo.

## Not in this pass

- No new database tables, columns, or migrations.
- API Explorer, MongoDB tab, Access & Tenancy remain **reference designs** (clearly labeled). Postman collections, live API endpoints, RBAC enforcement, and multi-tenant isolation are next-cycle work.
- Assistant Markdown, workflow editor, validation-error persistence, real-history charts, quality snapshots, simulation labels, guided demo — already shipped in the prior pass and preserved.

## Verification

- `tsgo` (typecheck) after edits.
- Manual click-through of all 7 sidebar entries + `/assistant` from Overview, plus refresh on each URL.

Reply "go" to proceed, or tell me what to cut/adjust.
