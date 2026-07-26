# CampusContext

- **Live demo:** https://campuscontext-core.lovable.app (use "Continue as demo user")
- **Source:** https://github.com/ladelpriore/CampusConnect-AI-CRM

A focused Core Platform prototype for higher-education admissions teams — ingest, standardize, quality-check and expose applicant data to AI assistants under human control.

## The customer problem

Colleges have student and applicant data scattered across SIS, CRM, LMS and marketing systems. That fragmentation drives bad decisions, duplicated outreach and slow response to at-risk applicants — and it makes AI assistants unusable, because they can't reason over trusted data.

CampusContext demonstrates a focused answer: unify feeds, resolve quality problems, run simple automations, and give an AI admissions assistant a **narrow, auditable set of tools** over that trusted context.

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
