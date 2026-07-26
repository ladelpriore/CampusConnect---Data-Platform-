# CampusContext

The application file structure and codebase for the live demo prototype so you can review and validate the technical architecture, logic, data modeling, and apis. 

- **Live demo:** https://campuscontext-core.lovable.app (use "Continue as demo user")
- **Source:** https://github.com/ladelpriore/CampusConnect---Data-Platform-.git

CampusContext is a **Core Data & Integrations Platform** for higher education. It standardizes institution data and exposes trusted context to downstream CRM and agent applications.

## The customer problem

Colleges have student and applicant data scattered across SIS, CRM, LMS and marketing systems. That fragmentation drives bad decisions, duplicated outreach and slow response to at-risk applicants — and it makes downstream AI CRM and agent applications unusable, because they can't reason over trusted data.

CampusContext demonstrates the core-platform answer: canonical data model, integrations, pipelines, data quality, automation, insights and governance — with a simulated Agent Workspace (the Admissions Assistant) showing how a downstream consumer uses the platform.

## Primary navigation

1. **Overview** — platform KPIs, architecture and guided demo
2. **Data Model** — Entities · Fields · Relationships · Data Quality · Lineage
3. **Integrations** — Connections · APIs · Webhooks · Imports & Exports · Mappings
4. **Pipelines** — Extract → Stage → Validate → Transform → Match → Load Canonical → Publish
5. **Automation** — Workflows · Rules · Triggers & Actions · Execution History
6. **Insights** — Quality, reliability, pipeline and workflow dashboards
7. **Developer & Governance** — API Explorer · SQL · MongoDB · Audit · Access & Tenancy


## Product architecture

- **Frontend**: React 19 + TypeScript + Tailwind v4, routed with TanStack Router.
- **Backend**: Lovable Cloud (PostgreSQL, Auth, storage).
- **Auth**: Email/password sign-in. A "demo user" button creates a scratch account.
- **All data**: synthetic. No real student PII.

## Data model

| Table | Purpose |
|---|---|
| `data_sources` | Registered integrations (SIS, CRM, marketing) with sync status |
| `applicants` | Canonical trusted applicant profiles (merged rows have `merged_into`) |
| `import_jobs` | Every CSV import or sync run |
| `validation_errors` | Row-level data-quality issues |
| `duplicate_matches` | Detected duplicate pairs pending review |
| `workflow_rules` | Simple WHEN/THEN automation rules |
| `workflow_executions` | Every rule run against real records |
| `audit_events` | Trust ledger — every meaningful action |

## Agent tools

The Admissions Assistant is deterministic (no live LLM call is made — the UI clearly labels this as a **prototype agent simulation**). It exposes three controlled tools over stored applicant data:

1. `lookup_application_status(applicant)` — reads status & context.
2. `list_missing_documents(filter?)` — returns applicants missing docs.
3. `route_to_admissions_counselor(applicant)` — **requires human approval** before writing.

Every tool call is logged to `audit_events` with the tool name and result.

## Trust and audit controls

- Row-Level Security is enabled on every table; only signed-in users can read/write.
- Assistant escalation actions require an explicit "Approve" click.
- Duplicate merges record before/after and are logged.
- The Audit Log surfaces every import, sync, merge, workflow run and agent action with actor, timestamp, affected record and result.

## Current limitations

- Single-tenant prototype — all authenticated users share the same demo dataset (documented trade-off; would move to per-institution tenancy in production).
- Duplicate detection is **exact-match only** (application ID or normalized email).
- Assistant is deterministic; no LLM integration yet.
- Sync is simulated (button-triggered), not truly incremental.
- No RBAC — every signed-in user has full admin rights.
- No webhooks or realtime updates.

## Potential next steps

- Webhooks in/out for real-time SIS and CRM events.
- Incremental synchronization with watermarking per source.
- Fuzzy matching (Jaro-Winkler on names, phonetic keys) beyond exact duplicates.
- Role-based access control (admin / counselor / read-only).
- Real SIS connectors (Banner, Colleague, Workday Student) and CRM (Slate, Salesforce Education Cloud).
- Live LLM assistant with function-calling wired to the same controlled tool surface.
- Bulk merge workflows and undo for data stewards.
