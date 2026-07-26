// Allowlisted, read-only queries backing the SQL Workbench.
// Each entry pairs (a) the SQL text shown to the reviewer with (b) a typed
// Supabase executor that runs an equivalent read against the live prototype
// data. Arbitrary SQL from the browser is not executed — the workbench
// resolves the entered text to a template id and blocks anything else.
import { supabase } from "@/integrations/supabase/client";
import { GITHUB_REPO_URL } from "./campus";

export type WorkbenchParamType = "text" | "int" | "timestamptz" | "select";
export interface WorkbenchParam {
  name: string;
  label: string;
  type: WorkbenchParamType;
  default: string;
  options?: string[];
  description?: string;
}
export interface WorkbenchResult {
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
  note?: string;
}
export interface WorkbenchQuery {
  id: string;
  title: string;
  purpose: string;
  tables: string[];
  indexes: string[];
  sql: (params: Record<string, string>) => string;
  params: WorkbenchParam[];
  githubPath: string;
  executable: boolean;
  blockedReason?: string;
  run?: (params: Record<string, string>) => Promise<WorkbenchResult>;
  explain?: (rows: Record<string, unknown>[]) => string;
}

const repoBlobBase = GITHUB_REPO_URL.replace(/\.git$/, "") + "/blob/main";
export const ghPath = (p: string) => `${repoBlobBase}/${p}`;

const timed = async <T,>(f: () => Promise<T>): Promise<[T, number]> => {
  const t = performance.now();
  const r = await f();
  return [r, Math.round(performance.now() - t)];
};

const asRows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

// ---- 1. Applicants by source and status
const applicantsBySource: WorkbenchQuery = {
  id: "applicants_by_source",
  title: "Applicants by source and status",
  purpose: "Distribution of canonical applicants across upstream source systems and admissions statuses.",
  tables: ["applicants"],
  indexes: ["applicants(source, application_status) WHERE merged_into IS NULL"],
  githubPath: "sql/applicants-by-source.sql",
  executable: true,
  params: [],
  sql: () => `SELECT
  coalesce(source, 'unknown')             AS source,
  coalesce(application_status, 'unknown') AS status,
  count(*)                                AS applicants
FROM public.applicants
WHERE merged_into IS NULL
GROUP BY 1, 2
ORDER BY applicants DESC, source, status;`,
  run: async () => {
    const [{ data }, ms] = await timed(async () =>
      supabase.from("applicants").select("source, application_status").is("merged_into", null),
    );
    const grouped = new Map<string, number>();
    for (const r of asRows(data)) {
      const key = `${(r.source as string) ?? "unknown"}|${(r.application_status as string) ?? "unknown"}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    const rows = [...grouped.entries()]
      .map(([k, v]) => {
        const [source, status] = k.split("|");
        return { source, status, applicants: v };
      })
      .sort((a, b) => b.applicants - a.applicants);
    return {
      columns: ["source", "status", "applicants"],
      rows,
      durationMs: ms,
      note: `${rows.length} (source, status) groups from ${asRows(data).length} canonical applicants.`,
    };
  },
};

// ---- 2. Integration failure rate
const integrationFailureRate: WorkbenchQuery = {
  id: "integration_failure_rate",
  title: "Integration failure rate",
  purpose: "Which upstream integrations are failing most as a share of records they attempted.",
  tables: ["data_sources"],
  indexes: ["primary key on data_sources(id) suffices at prototype scale"],
  githubPath: "sql/integration-failure-rate.sql",
  executable: true,
  params: [],
  sql: () => `SELECT
  name, kind, records_processed, failed_records,
  CASE WHEN records_processed = 0 THEN 0
       ELSE round(100.0 * failed_records / records_processed, 2)
  END AS failure_rate_pct
FROM public.data_sources
ORDER BY failure_rate_pct DESC, failed_records DESC;`,
  run: async () => {
    const [{ data }, ms] = await timed(async () =>
      supabase.from("data_sources").select("name, kind, records_processed, failed_records"),
    );
    const rows = asRows(data)
      .map((r) => {
        const processed = (r.records_processed as number) ?? 0;
        const failed = (r.failed_records as number) ?? 0;
        return {
          name: r.name,
          kind: r.kind,
          records_processed: processed,
          failed_records: failed,
          failure_rate_pct: processed === 0 ? 0 : Math.round((failed / processed) * 10000) / 100,
        };
      })
      .sort((a, b) => b.failure_rate_pct - a.failure_rate_pct || b.failed_records - a.failed_records);
    return { columns: ["name", "kind", "records_processed", "failed_records", "failure_rate_pct"], rows, durationMs: ms };
  },
};

// ---- 3. Unresolved duplicates
const unresolvedDuplicates: WorkbenchQuery = {
  id: "unresolved_duplicates",
  title: "Unresolved duplicate candidates",
  purpose: "Duplicate applicant pairs still open for review, joined back to both records.",
  tables: ["duplicate_matches", "applicants"],
  indexes: ["duplicate_matches(created_at DESC) WHERE resolved = false"],
  githubPath: "sql/unresolved-duplicates.sql",
  executable: true,
  params: [{ name: "limit", label: "Result limit", type: "int", default: "100" }],
  sql: (p) => `SELECT dm.id AS match_id, dm.reason, dm.created_at,
       a.application_id AS a_application_id, a.first_name || ' ' || a.last_name AS a_name, a.email AS a_email,
       b.application_id AS b_application_id, b.first_name || ' ' || b.last_name AS b_name, b.email AS b_email
FROM public.duplicate_matches dm
JOIN public.applicants a ON a.id = dm.applicant_a
JOIN public.applicants b ON b.id = dm.applicant_b
WHERE dm.resolved = false
ORDER BY dm.created_at DESC
LIMIT ${Number(p.limit) || 100};`,
  run: async (p) => {
    const limit = Math.max(1, Math.min(500, Number(p.limit) || 100));
    const [{ data }, ms] = await timed(async () =>
      supabase
        .from("duplicate_matches")
        .select("id, reason, created_at, a:applicant_a(application_id, first_name, last_name, email), b:applicant_b(application_id, first_name, last_name, email)")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(limit),
    );
    const rows = asRows(data).map((r) => {
      const a = (r.a ?? {}) as Record<string, unknown>;
      const b = (r.b ?? {}) as Record<string, unknown>;
      return {
        match_id: r.id,
        reason: r.reason,
        created_at: r.created_at,
        a_application_id: a.application_id,
        a_name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
        a_email: a.email,
        b_application_id: b.application_id,
        b_name: `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim(),
        b_email: b.email,
      };
    });
    return {
      columns: ["match_id", "reason", "created_at", "a_application_id", "a_name", "a_email", "b_application_id", "b_name", "b_email"],
      rows,
      durationMs: ms,
    };
  },
};

// ---- 4. Data quality issues
const dataQualityIssues: WorkbenchQuery = {
  id: "data_quality_issues",
  title: "Applicant quality issues",
  purpose: "Applicants with the most open validation issues, broken down by validation kind.",
  tables: ["validation_errors", "applicants"],
  indexes: ["validation_errors(applicant_id) WHERE resolved = false"],
  githubPath: "sql/data-quality-issues.sql",
  executable: true,
  params: [],
  sql: () => `SELECT a.application_id, a.first_name || ' ' || a.last_name AS name, a.application_status,
       count(*) AS open_issues,
       count(*) FILTER (WHERE ve.kind = 'invalid_email') AS invalid_email,
       count(*) FILTER (WHERE ve.kind = 'missing_field') AS missing_field,
       count(*) FILTER (WHERE ve.kind = 'bad_status')    AS bad_status,
       count(*) FILTER (WHERE ve.kind = 'bad_term')      AS bad_term
FROM public.validation_errors ve
JOIN public.applicants a ON a.id = ve.applicant_id
WHERE ve.resolved = false
GROUP BY a.id, a.application_id, a.first_name, a.last_name, a.application_status
ORDER BY open_issues DESC
LIMIT 50;`,
  run: async () => {
    const [{ data }, ms] = await timed(async () =>
      supabase
        .from("validation_errors")
        .select("kind, applicant:applicant_id(application_id, first_name, last_name, application_status)")
        .eq("resolved", false),
    );
    const agg = new Map<string, Record<string, unknown>>();
    for (const r of asRows(data)) {
      const a = (r.applicant ?? {}) as Record<string, unknown>;
      const key = String(a.application_id ?? "(no id)");
      if (!agg.has(key)) {
        agg.set(key, {
          application_id: a.application_id,
          name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
          application_status: a.application_status,
          open_issues: 0,
          invalid_email: 0,
          missing_field: 0,
          bad_status: 0,
          bad_term: 0,
        });
      }
      const row = agg.get(key)!;
      row.open_issues = (row.open_issues as number) + 1;
      const k = r.kind as string;
      if (k in row) row[k] = (row[k] as number) + 1;
    }
    const rows = [...agg.values()].sort((a, b) => (b.open_issues as number) - (a.open_issues as number)).slice(0, 50);
    return {
      columns: ["application_id", "name", "application_status", "open_issues", "invalid_email", "missing_field", "bad_status", "bad_term"],
      rows,
      durationMs: ms,
    };
  },
};

// ---- 5. Latest pipeline runs
const latestPipelineRuns: WorkbenchQuery = {
  id: "latest_pipeline_runs",
  title: "Latest pipeline run per source",
  purpose: "Most recent import/sync job per source using a ROW_NUMBER window over source_name.",
  tables: ["import_jobs"],
  indexes: ["import_jobs(source_name, created_at DESC)"],
  githubPath: "sql/latest-pipeline-runs.sql",
  executable: true,
  params: [],
  sql: () => `WITH ranked AS (
  SELECT ij.*, row_number() OVER (PARTITION BY source_name ORDER BY created_at DESC) AS rn
  FROM public.import_jobs ij
)
SELECT source_name, kind, status, records_total, records_valid, records_invalid, created_at
FROM ranked WHERE rn = 1
ORDER BY created_at DESC;`,
  run: async () => {
    const [{ data }, ms] = await timed(async () =>
      supabase.from("import_jobs").select("source_name, kind, status, records_total, records_valid, records_invalid, created_at").order("created_at", { ascending: false }),
    );
    const seen = new Set<string>();
    const rows = [] as Record<string, unknown>[];
    for (const r of asRows(data)) {
      const key = String(r.source_name ?? "—");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }
    return {
      columns: ["source_name", "kind", "status", "records_total", "records_valid", "records_invalid", "created_at"],
      rows,
      durationMs: ms,
      note: `${rows.length} sources · ${asRows(data).length} total runs scanned.`,
    };
  },
};

// ---- 6. Workflow performance
const workflowPerformance: WorkbenchQuery = {
  id: "workflow_performance",
  title: "Workflow execution performance",
  purpose: "How often each workflow rule fires and the distribution of execution outcomes.",
  tables: ["workflow_rules", "workflow_executions"],
  indexes: ["workflow_executions(rule_id, created_at DESC)"],
  githubPath: "sql/workflow-performance.sql",
  executable: true,
  params: [],
  sql: () => `SELECT wr.name AS rule, wr.active,
       count(we.id) AS executions,
       count(*) FILTER (WHERE we.result = 'succeeded') AS succeeded,
       count(*) FILTER (WHERE we.result = 'skipped')   AS skipped,
       count(*) FILTER (WHERE we.result = 'failed')    AS failed,
       max(we.created_at) AS last_fired_at
FROM public.workflow_rules wr
LEFT JOIN public.workflow_executions we ON we.rule_id = wr.id
GROUP BY wr.id, wr.name, wr.active
ORDER BY executions DESC, rule;`,
  run: async () => {
    const [rules, ms1] = await timed(async () => supabase.from("workflow_rules").select("id, name, active"));
    const [{ data: execs }, ms2] = await timed(async () => supabase.from("workflow_executions").select("rule_id, result, created_at"));
    const agg = new Map<string, { rule: string; active: boolean; executions: number; succeeded: number; skipped: number; failed: number; last_fired_at: string | null }>();
    for (const r of asRows(rules.data)) agg.set(String(r.id), { rule: r.name as string, active: r.active as boolean, executions: 0, succeeded: 0, skipped: 0, failed: 0, last_fired_at: null });
    for (const e of asRows(execs)) {
      const row = agg.get(String(e.rule_id));
      if (!row) continue;
      row.executions++;
      const r = String(e.result ?? "");
      if (r === "succeeded" || r === "skipped" || r === "failed") row[r]++;
      const t = e.created_at as string;
      if (!row.last_fired_at || (t && t > row.last_fired_at)) row.last_fired_at = t;
    }
    const rows = [...agg.values()].sort((a, b) => b.executions - a.executions || a.rule.localeCompare(b.rule));
    return {
      columns: ["rule", "active", "executions", "succeeded", "skipped", "failed", "last_fired_at"],
      rows,
      durationMs: ms1 + ms2,
    };
  },
};

// ---- 7. Incremental ingestion
const incrementalIngestion: WorkbenchQuery = {
  id: "incremental_ingestion",
  title: "Incremental ingestion watermark",
  purpose: "Applicant rows updated after a watermark, ordered so the caller can advance the mark.",
  tables: ["applicants"],
  indexes: ["applicants(updated_at)"],
  githubPath: "sql/incremental-ingestion.sql",
  executable: true,
  params: [
    { name: "watermark", label: "Watermark (updated_at >)", type: "timestamptz", default: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
    { name: "limit", label: "Batch size", type: "int", default: "50" },
  ],
  sql: (p) => `SELECT id, application_id, first_name, last_name, email, application_status, updated_at
FROM public.applicants
WHERE updated_at > '${p.watermark}'
  AND merged_into IS NULL
ORDER BY updated_at ASC
LIMIT ${Number(p.limit) || 50};`,
  run: async (p) => {
    const limit = Math.max(1, Math.min(500, Number(p.limit) || 50));
    const [{ data }, ms] = await timed(async () =>
      supabase
        .from("applicants")
        .select("id, application_id, first_name, last_name, email, application_status, updated_at")
        .is("merged_into", null)
        .gt("updated_at", p.watermark)
        .order("updated_at", { ascending: true })
        .limit(limit),
    );
    const rows = asRows(data);
    const nextWatermark = rows.length ? rows[rows.length - 1].updated_at : p.watermark;
    return {
      columns: ["id", "application_id", "first_name", "last_name", "email", "application_status", "updated_at"],
      rows,
      durationMs: ms,
      note: `${rows.length} rows returned · next watermark → ${nextWatermark}`,
    };
  },
};

// ---- 8. Idempotent upsert (documented write, NOT executed)
const idempotentUpsert: WorkbenchQuery = {
  id: "idempotent_upsert",
  title: "Idempotent applicant ingestion",
  purpose: "Documented ingestion write path — INSERT ... ON CONFLICT keeps retries safe.",
  tables: ["applicants"],
  indexes: ["UNIQUE applicants(application_id) WHERE application_id IS NOT NULL", "applicants(normalized_email)"],
  githubPath: "sql/idempotent-upsert.sql",
  executable: false,
  blockedReason: "Write query — the browser workbench is read-only. Ingestion workers issue this INSERT server-side.",
  params: [],
  sql: () => `INSERT INTO public.applicants (
  application_id, first_name, last_name, email, normalized_email,
  application_status, enrollment_term, source_campaign, source, updated_at
) VALUES (
  :application_id, :first_name, :last_name, :email, lower(trim(:email)),
  :application_status, :enrollment_term, :source_campaign, :source, now()
) ON CONFLICT (application_id) WHERE application_id IS NOT NULL
DO UPDATE SET
  first_name = excluded.first_name,
  last_name  = excluded.last_name,
  email      = excluded.email,
  normalized_email   = excluded.normalized_email,
  application_status = excluded.application_status,
  enrollment_term    = excluded.enrollment_term,
  source_campaign    = excluded.source_campaign,
  source             = excluded.source,
  updated_at         = now();`,
};

// ---- 9. JSONB workflow conditions
const jsonbWorkflowConditions: WorkbenchQuery = {
  id: "jsonb_workflow_conditions",
  title: "JSONB workflow-condition query",
  purpose: "Find workflow rules targeting a given application status inside their JSONB condition.",
  tables: ["workflow_rules"],
  indexes: ["workflow_rules USING gin (condition jsonb_path_ops)"],
  githubPath: "sql/jsonb-workflow-conditions.sql",
  executable: true,
  params: [
    { name: "status", label: "application_status", type: "select", default: "Incomplete", options: ["Incomplete", "Submitted", "Admitted", "Waitlisted", "Denied"] },
  ],
  sql: (p) => `SELECT id, name, active, condition, action
FROM public.workflow_rules
WHERE condition @> jsonb_build_object('application_status', '${p.status}')
ORDER BY active DESC, name;`,
  run: async (p) => {
    const [{ data }, ms] = await timed(async () => supabase.from("workflow_rules").select("id, name, active, condition, action"));
    const rows = asRows(data).filter((r) => {
      const c = (r.condition ?? {}) as Record<string, unknown>;
      return c.application_status === p.status;
    });
    return { columns: ["id", "name", "active", "condition", "action"], rows, durationMs: ms };
  },
};

// ---- 10. Lineage lookup
const lineageLookup: WorkbenchQuery = {
  id: "lineage_lookup",
  title: "Data-source lineage lookup",
  purpose: "Trace a canonical applicant to its source system and recent audit events.",
  tables: ["applicants", "audit_events"],
  indexes: ["applicants(application_id)", "audit_events(affected_record, created_at DESC)"],
  githubPath: "sql/lineage-lookup.sql",
  executable: true,
  params: [{ name: "application_id", label: "application_id", type: "text", default: "APP-2003" }],
  sql: (p) => `WITH target AS (
  SELECT * FROM public.applicants WHERE application_id = '${p.application_id}' LIMIT 1
)
SELECT t.application_id, t.first_name || ' ' || t.last_name AS name,
       t.source AS source_system, t.normalized_email,
       ae.created_at AS event_at, ae.action, ae.actor, ae.result, ae.metadata
FROM target t
LEFT JOIN public.audit_events ae ON ae.affected_record = t.application_id
ORDER BY ae.created_at DESC NULLS LAST
LIMIT 25;`,
  run: async (p) => {
    const [applicant, ms1] = await timed(async () =>
      supabase.from("applicants").select("application_id, first_name, last_name, source, normalized_email").eq("application_id", p.application_id).maybeSingle(),
    );
    const [{ data: events }, ms2] = await timed(async () =>
      supabase.from("audit_events").select("created_at, action, actor, result, metadata").eq("affected_record", p.application_id).order("created_at", { ascending: false }).limit(25),
    );
    const t = (applicant.data ?? {}) as Record<string, unknown>;
    const rows = asRows(events).length
      ? asRows(events).map((e) => ({
          application_id: t.application_id ?? p.application_id,
          name: `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
          source_system: t.source,
          normalized_email: t.normalized_email,
          event_at: e.created_at,
          action: e.action,
          actor: e.actor,
          result: e.result,
          metadata: e.metadata,
        }))
      : t.application_id
        ? [{ application_id: t.application_id, name: `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(), source_system: t.source, normalized_email: t.normalized_email, event_at: null, action: null, actor: null, result: null, metadata: null }]
        : [];
    return { columns: ["application_id", "name", "source_system", "normalized_email", "event_at", "action", "actor", "result", "metadata"], rows, durationMs: ms1 + ms2 };
  },
};

export const WORKBENCH_QUERIES: WorkbenchQuery[] = [
  applicantsBySource,
  integrationFailureRate,
  unresolvedDuplicates,
  dataQualityIssues,
  latestPipelineRuns,
  workflowPerformance,
  incrementalIngestion,
  idempotentUpsert,
  jsonbWorkflowConditions,
  lineageLookup,
];

const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|comment|copy|call)\b/i;

export function validateEditedSql(text: string, expected: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim().replace(/;+\s*$/, "");
  const expTrim = expected.trim().replace(/;+\s*$/, "");
  const normalize = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  if (!/^\s*(with|select)\b/i.test(trimmed)) return { ok: false, reason: "Only SELECT/CTE queries can run. Reset to the template to execute." };
  if (FORBIDDEN.test(trimmed)) return { ok: false, reason: "SQL contains a forbidden keyword (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/…)." };
  if (normalize(trimmed) !== normalize(expTrim)) {
    return { ok: false, reason: "Only the exact template SQL is executed against live data. Adjust parameters instead of editing SQL, or reset to the template." };
  }
  return { ok: true };
}
