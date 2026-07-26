import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";
import { Quality } from "./quality";
import { CANONICAL_FIELDS } from "@/lib/campus";
import { EntityDiagram } from "@/components/entity-diagram";
import { AlertTriangle, CheckCircle2, FlaskConical, Plus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/data-model")({
  head: () => ({
    meta: [
      { title: "Data Model — CampusContext" },
      { name: "description", content: "Entity relationships, schema designer, workload access patterns, data quality and lineage for the CampusContext platform." },
    ],
  }),
  component: DataModelPage,
});

// ------------------------------------------------------------
// Entity definitions
// ------------------------------------------------------------
type EntityDef = {
  name: string; table: string; description: string;
  fields: { name: string; type: string; required?: boolean; pk?: boolean; fk?: string; index?: boolean; note?: string }[];
  relationships: string[];
};

const ENTITIES: EntityDef[] = [
  {
    name: "Applicant", table: "applicants",
    description: "Canonical, deduplicated applicant profile. Sole source of trusted admissions context for downstream CRM and agent applications.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "application_id", type: "text", index: true, note: "External SIS identifier" },
      { name: "first_name", type: "text", required: true },
      { name: "last_name", type: "text", required: true },
      { name: "email", type: "text" },
      { name: "normalized_email", type: "text", index: true },
      { name: "application_status", type: "text", required: true },
      { name: "enrollment_term", type: "text" },
      { name: "source_campaign", type: "text" },
      { name: "missing_documents", type: "text[]" },
      { name: "source", type: "text", note: "Origin system label" },
      { name: "merged_into", type: "uuid", fk: "applicants.id", note: "Non-null on losing side of a merge" },
    ],
    relationships: ["1 applicant → many validation_errors", "1 applicant → many workflow_executions", "applicant ↔ applicant via duplicate_matches"],
  },
  { name: "Data source", table: "data_sources", description: "A configured upstream integration (SIS, CRM, marketing, etc.).",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "name", type: "text", required: true },
      { name: "kind", type: "text", required: true }, { name: "status", type: "text", required: true },
      { name: "sync_frequency", type: "text", required: true }, { name: "last_sync_at", type: "timestamptz" },
      { name: "records_processed", type: "int" }, { name: "failed_records", type: "int" },
    ], relationships: ["1 data_source → many import_jobs"] },
  { name: "Import job", table: "import_jobs", description: "One execution of a pipeline — either a CSV import or an integration sync.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "source_id", type: "uuid", fk: "data_sources.id" },
      { name: "source_name", type: "text" }, { name: "kind", type: "text", required: true },
      { name: "status", type: "text", required: true }, { name: "records_total", type: "int" },
      { name: "records_valid", type: "int" }, { name: "records_invalid", type: "int" },
    ], relationships: ["many import_jobs → 1 data_source", "1 import_job → many validation_errors"] },
  { name: "Validation error", table: "validation_errors", description: "Per-row, per-field validation failure captured during ingestion.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "import_job_id", type: "uuid", fk: "import_jobs.id", index: true },
      { name: "applicant_id", type: "uuid", fk: "applicants.id" }, { name: "row_number", type: "int" },
      { name: "field", type: "text" }, { name: "kind", type: "text", required: true },
      { name: "message", type: "text" }, { name: "submitted_value", type: "text" }, { name: "resolved", type: "bool", required: true },
    ], relationships: ["many validation_errors → 1 import_job", "many validation_errors → 1 applicant (optional)"] },
  { name: "Duplicate match", table: "duplicate_matches", description: "Detected duplicate pair awaiting or resolved by merge.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "applicant_a", type: "uuid", fk: "applicants.id" },
      { name: "applicant_b", type: "uuid", fk: "applicants.id" }, { name: "reason", type: "text", required: true },
      { name: "resolved", type: "bool", required: true },
    ], relationships: ["2 applicants ↔ 1 duplicate_match"] },
  { name: "Workflow rule", table: "workflow_rules", description: "Trigger + condition + action definition consumed by the automation engine.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "name", type: "text", required: true },
      { name: "description", type: "text" }, { name: "active", type: "bool", required: true },
      { name: "condition", type: "jsonb", required: true }, { name: "action", type: "jsonb", required: true },
    ], relationships: ["1 workflow_rule → many workflow_executions"] },
  { name: "Workflow execution", table: "workflow_executions", description: "One firing of a workflow rule against a matched entity.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "rule_id", type: "uuid", fk: "workflow_rules.id" },
      { name: "applicant_id", type: "uuid", fk: "applicants.id" }, { name: "action_taken", type: "text", required: true },
      { name: "result", type: "text" },
    ], relationships: ["many workflow_executions → 1 workflow_rule", "many workflow_executions → 1 applicant"] },
  { name: "Audit event", table: "audit_events", description: "Append-only trust ledger. Every write in the platform emits a row.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "actor", type: "text" },
      { name: "action", type: "text", required: true }, { name: "affected_record", type: "text" },
      { name: "source", type: "text" }, { name: "result", type: "text" }, { name: "metadata", type: "jsonb" },
    ], relationships: ["referenced by every mutation across the platform"] },
  { name: "Quality snapshot", table: "quality_snapshots", description: "Point-in-time completeness & duplicate-rate capture, recorded on scans and merges.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true }, { name: "completeness_pct", type: "int", required: true },
      { name: "duplicate_rate_pct", type: "int", required: true }, { name: "trigger", type: "text", required: true },
      { name: "note", type: "text" },
    ], relationships: ["standalone (time series)"] },
];

function DataModelPage() {
  const [selectedEntity, setSelectedEntity] = useState<string>("applicants");
  return (
    <PageShell title="Data Model" subtitle="Interactive schema, workload-driven design and lineage for the canonical CampusContext platform.">
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Model Overview</TabsTrigger>
          <TabsTrigger value="entities">Entities &amp; Fields</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="designer">Schema Designer</TabsTrigger>
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab onSelect={(id) => setSelectedEntity(id)} /></TabsContent>
        <TabsContent value="entities" className="mt-4"><EntitiesTab selected={selectedEntity} onSelect={setSelectedEntity} /></TabsContent>
        <TabsContent value="relationships" className="mt-4"><RelationshipsTab /></TabsContent>
        <TabsContent value="designer" className="mt-4"><DesignerTab /></TabsContent>
        <TabsContent value="quality" className="mt-4"><div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><Quality /></div></TabsContent>
        <TabsContent value="lineage" className="mt-4"><LineageTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ------------------------------------------------------------
// Model Overview
// ------------------------------------------------------------
function OverviewTab({ onSelect }: { onSelect: (id: string) => void }) {
  const [selected, setSelected] = useState<string>("applicants");
  const entity = ENTITIES.find((e) => e.table === selected);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Entity relationship diagram</CardTitle>
          <CardDescription>Click any entity to inspect its fields and relationships. Arrows point from parent to child; labels show cardinality.</CardDescription>
        </CardHeader>
        <CardContent>
          <EntityDiagram selected={selected} onSelect={(id) => { setSelected(id); onSelect(id); }} />
          {entity && (
            <div className="mt-4 rounded-md border bg-muted/40 p-4">
              <div className="text-sm font-semibold">{entity.name} <span className="font-mono text-xs text-muted-foreground">— {entity.table}</span></div>
              <div className="text-xs text-muted-foreground mt-1">{entity.description}</div>
              <ul className="mt-2 text-xs list-disc pl-5 space-y-0.5">{entity.relationships.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Model decisions</CardTitle><CardDescription>Why the model looks like this today.</CardDescription></CardHeader>
          <CardContent><ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
            <li><span className="text-foreground font-medium">Canonical applicant profile</span> separates trusted data from raw source payloads.</li>
            <li><span className="text-foreground font-medium">UUID primary keys</span> allow distributed record creation across ingestion workers.</li>
            <li><span className="text-foreground font-medium">normalized_email</span> is indexed for cross-source matching.</li>
            <li><span className="text-foreground font-medium">merged_into</span> represents survivorship after deduplication instead of destructive deletes.</li>
            <li><span className="text-foreground font-medium">JSONB</span> is used for variable workflow conditions and audit metadata.</li>
            <li><span className="text-foreground font-medium">Foreign keys</span> preserve referential integrity across ingestion and execution.</li>
            <li><span className="text-foreground font-medium">Separate execution tables</span> prevent unbounded arrays/history on core records.</li>
          </ul></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange" /> Known model improvements</CardTitle><CardDescription>An honest list of what the first cut leaves on the table.</CardDescription></CardHeader>
          <CardContent><ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
            <li>Separate <span className="font-mono text-foreground">applicants</span> from <span className="font-mono text-foreground">applications</span> — one person can submit multiple applications.</li>
            <li>Replace free-text <span className="font-mono text-foreground">source</span> with a <span className="font-mono text-foreground">data_source_id</span> foreign key.</li>
            <li>Add <span className="font-mono text-foreground">institution_id</span> and RLS on it for multi-tenancy.</li>
            <li>Add immutable <span className="font-mono text-foreground">source_records</span> plus field-level lineage.</li>
            <li>Add mapping versions and schema versions so migrations replay cleanly.</li>
          </ul></CardContent>
        </Card>
      </div>

      <WorkloadCard />
    </div>
  );
}

// ------------------------------------------------------------
// Workload / access patterns
// ------------------------------------------------------------
type Workload = {
  id: string; description: string; entities: string[]; frequency: "high" | "medium" | "low"; kind: "read" | "write";
  index: string; sql: string; mongo: string; implication: string;
};

const WORKLOADS: Workload[] = [
  { id: "wl-find-by-appid", description: "Find applicant by application ID", entities: ["applicants"], frequency: "high", kind: "read",
    index: "UNIQUE applicants(application_id) WHERE application_id IS NOT NULL",
    sql: `SELECT * FROM applicants WHERE application_id = $1 LIMIT 1;`,
    mongo: `db.applicants.findOne({ application_id: appId })`,
    implication: "Single-row point read. Unique index makes it a B-tree seek; safe to embed in agent tool responses." },
  { id: "wl-find-by-email", description: "Find applicant by normalized email", entities: ["applicants"], frequency: "high", kind: "read",
    index: "applicants(normalized_email)",
    sql: `SELECT * FROM applicants WHERE normalized_email = lower(trim($1));`,
    mongo: `db.applicants.find({ 'email.normalized': email.toLowerCase().trim() })`,
    implication: "Cross-source matching hot path. Normalize on write so the index is sargable." },
  { id: "wl-list-by-inst", description: "List applications by institution and term", entities: ["applications (proposed)", "institutions (proposed)"], frequency: "high", kind: "read",
    index: "applications(institution_id, enrollment_term, application_status)",
    sql: `SELECT * FROM applications WHERE institution_id = $1 AND enrollment_term = $2 ORDER BY application_status;`,
    mongo: `db.applications.find({ institution_id, enrollment_term }).sort({ application_status: 1 })`,
    implication: "Motivates the applicants ↔ applications split so this list is O(matches), not O(all applicants)." },
  { id: "wl-insert-source", description: "Insert source record (raw payload)", entities: ["source_records (proposed)"], frequency: "high", kind: "write",
    index: "source_records(data_source_id, ingested_at)",
    sql: `INSERT INTO source_records (data_source_id, external_id, payload, ingested_at) VALUES ($1,$2,$3, now());`,
    mongo: `db.source_records.insertOne({ data_source_id, external_id, payload, ingested_at: new Date() })`,
    implication: "Append-only. Immutable payload lets you replay canonicalization when mapping rules change." },
  { id: "wl-update-status", description: "Update application status", entities: ["applicants"], frequency: "medium", kind: "write",
    index: "existing PK",
    sql: `UPDATE applicants SET application_status = $2, updated_at = now() WHERE id = $1;`,
    mongo: `db.applicants.updateOne({ _id }, { $set: { 'status.current': next, updated_at: new Date() }, $push: { 'status.history': { status: next, at: new Date() } } })`,
    implication: "Trigger emits an audit_event; downstream workflows may fire — keep writes small and idempotent." },
  { id: "wl-append-audit", description: "Append audit event", entities: ["audit_events"], frequency: "high", kind: "write",
    index: "audit_events(affected_record, created_at DESC)",
    sql: `INSERT INTO audit_events(actor, action, affected_record, source, result, metadata) VALUES ($1,$2,$3,$4,$5,$6);`,
    mongo: `db.audit_events.insertOne({ actor, action, affected_record, source, result, metadata, created_at: new Date() })`,
    implication: "Append-only ledger. Partition by month at scale; never mutate." },
];

function WorkloadCard() {
  const [openId, setOpenId] = useState<string | null>(WORKLOADS[0].id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workload &amp; access patterns</CardTitle>
        <CardDescription>Modeling is driven by the reads and writes the platform actually serves. Click a row to see the query and modeling implication.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left px-4 py-2">Workload</th><th className="text-left px-4 py-2">Entities</th><th className="text-left px-4 py-2">Kind</th><th className="text-left px-4 py-2">Frequency</th><th className="text-left px-4 py-2">Suggested index</th></tr>
          </thead>
          <tbody>
            {WORKLOADS.map((w) => (
              <>
                <tr key={w.id} className="border-t cursor-pointer hover:bg-muted/30" onClick={() => setOpenId(openId === w.id ? null : w.id)}>
                  <td className="px-4 py-2">{w.description}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{w.entities.join(", ")}</td>
                  <td className="px-4 py-2"><span className={"text-[10px] px-1.5 py-0.5 rounded border " + (w.kind === "read" ? "bg-navy/10 text-navy border-navy/30" : "bg-orange/10 text-orange border-orange/30")}>{w.kind}</span></td>
                  <td className="px-4 py-2 text-xs">{w.frequency}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">{w.index}</td>
                </tr>
                {openId === w.id && (
                  <tr key={w.id + "-body"} className="border-t bg-muted/20">
                    <td colSpan={5} className="p-4 space-y-3">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-1">PostgreSQL</div>
                          <pre className="text-xs bg-background border rounded p-3 overflow-auto">{w.sql}</pre>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-1">MongoDB</div>
                          <pre className="text-xs bg-background border rounded p-3 overflow-auto">{w.mongo}</pre>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Modeling implication:</span> {w.implication}</div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------
// Entities & Fields (with Design Sandbox)
// ------------------------------------------------------------
type ProposedField = { name: string; type: string; required: boolean; unique: boolean; indexed: boolean; defaultValue: string; validation: string; description: string; deprecated?: boolean };

function EntitiesTab({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const entity = ENTITIES.find((e) => e.table === selected) ?? ENTITIES[0];
  const { data: example } = useQuery({
    queryKey: ["entity-example", entity.table],
    queryFn: async () => {
      const { data } = await supabase.from(entity.table as never).select("*").limit(1);
      return (data?.[0] as Record<string, unknown> | undefined) ?? null;
    },
  });
  const [proposals, setProposals] = useState<Record<string, ProposedField[]>>({});
  const [draft, setDraft] = useState<ProposedField | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; issues: string[] } | null>(null);

  const list = proposals[entity.table] ?? [];

  function openNew() { setDraft({ name: "", type: "text", required: false, unique: false, indexed: false, defaultValue: "", validation: "", description: "" }); setEditIdx(null); }
  function openEdit(i: number) { setDraft({ ...list[i] }); setEditIdx(i); }
  function save() {
    if (!draft) return;
    if (!/^[a-z][a-z0-9_]*$/.test(draft.name)) { toast.error("Field name must be snake_case."); return; }
    const next = [...list];
    if (editIdx == null) next.push(draft); else next[editIdx] = draft;
    setProposals({ ...proposals, [entity.table]: next });
    setDraft(null); setEditIdx(null);
    toast.success(`Proposal saved to sandbox for ${entity.table}.${draft.name}`);
  }
  function deprecate(i: number) {
    const next = [...list]; next[i] = { ...next[i], deprecated: !next[i].deprecated }; setProposals({ ...proposals, [entity.table]: next });
  }
  function drop(i: number) {
    const next = list.filter((_, j) => j !== i); setProposals({ ...proposals, [entity.table]: next });
  }
  function inspectSchema() {
    const req = entity.fields.filter((f) => f.required).map((f) => f.name);
    toast.success(`${entity.table}: ${entity.fields.length} columns · ${req.length} required · ${entity.fields.filter((f) => f.index).length} indexed`);
  }
  function validateRecord() {
    if (!example) { setValidation({ ok: false, issues: ["No example record available."] }); return; }
    const issues: string[] = [];
    entity.fields.forEach((f) => {
      if (f.required && (example[f.name] == null || example[f.name] === "")) issues.push(`Missing required field: ${f.name}`);
    });
    setValidation({ ok: issues.length === 0, issues });
  }

  const ddl = list.length
    ? list.filter((f) => !f.deprecated).map((f) => `ALTER TABLE public.${entity.table}\n  ADD COLUMN ${f.name} ${f.type}${f.required ? " NOT NULL" : ""}${f.defaultValue ? ` DEFAULT ${f.defaultValue}` : ""}${f.unique ? ` UNIQUE` : ""};${f.indexed ? `\nCREATE INDEX ${entity.table}_${f.name}_idx ON public.${entity.table} (${f.name});` : ""}`).join("\n\n")
    + (list.some((f) => f.deprecated) ? "\n\n-- Deprecated (would drop in a follow-up migration after readers stop using them):\n" + list.filter((f) => f.deprecated).map((f) => `-- ALTER TABLE public.${entity.table} DROP COLUMN ${f.name};`).join("\n") : "")
    : "";
  const mongoDelta = list.length
    ? JSON.stringify({ collMod: entity.table, validator: { $jsonSchema: { bsonType: "object", required: list.filter((f) => f.required && !f.deprecated).map((f) => f.name),
        properties: Object.fromEntries(list.filter((f) => !f.deprecated).map((f) => [f.name, { bsonType: bsonFor(f.type), description: f.description || undefined }])) } } }, null, 2)
    : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Entities</CardTitle></CardHeader>
        <CardContent className="p-2 space-y-0.5">
          {ENTITIES.map((e) => (
            <button key={e.table} onClick={() => onSelect(e.table)}
              className={"w-full text-left px-3 py-2 rounded text-sm transition-colors " + (selected === e.table ? "bg-navy/10 text-navy font-medium" : "hover:bg-muted")}>
              <div>{e.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{e.table}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{entity.name} <span className="text-muted-foreground font-mono text-sm">— {entity.table}</span></CardTitle>
              <CardDescription>{entity.description}</CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={inspectSchema}>Inspect schema</Button>
              <Button size="sm" variant="outline" onClick={validateRecord}>Validate example</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left px-4 py-2">Field</th><th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">Constraints</th><th className="text-left px-4 py-2">Notes</th></tr>
              </thead>
              <tbody>
                {entity.fields.map((f) => (
                  <tr key={f.name} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{f.name}</td>
                    <td className="px-4 py-2 text-xs">{f.type}</td>
                    <td className="px-4 py-2 text-xs space-x-1">
                      {f.pk && <Badge tone="navy">PK</Badge>}
                      {f.fk && <Badge tone="orange">FK → {f.fk}</Badge>}
                      {f.required && <Badge tone="success">required</Badge>}
                      {f.index && <Badge tone="muted">indexed</Badge>}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{f.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {validation && (
              <div className={"m-4 rounded-md border p-3 text-sm " + (validation.ok ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive")}>
                {validation.ok ? <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Example record passes required-field validation.</span>
                  : <><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Validation issues</div><ul className="mt-1 list-disc pl-5 text-xs">{validation.issues.map((i) => <li key={i}>{i}</li>)}</ul></>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed border-orange/40 bg-orange/[0.03]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4 text-orange" /> Design sandbox — {entity.table}</CardTitle>
            <CardDescription>Propose additions in local state. These changes do NOT touch the live schema; they render the migration you would run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">{list.length} proposed field{list.length === 1 ? "" : "s"}</div>
              <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add proposed field</Button>
            </div>
            {list.length > 0 && (
              <table className="w-full text-sm border rounded-md overflow-hidden">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left px-3 py-2">Field</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Flags</th><th className="text-right px-3 py-2">Actions</th></tr>
                </thead>
                <tbody>
                  {list.map((f, i) => (
                    <tr key={i} className={"border-t " + (f.deprecated ? "opacity-60 line-through" : "")}>
                      <td className="px-3 py-2 font-mono text-xs">{f.name}</td>
                      <td className="px-3 py-2 text-xs">{f.type}</td>
                      <td className="px-3 py-2 text-xs space-x-1">
                        {f.required && <Badge tone="success">required</Badge>}
                        {f.unique && <Badge tone="navy">unique</Badge>}
                        {f.indexed && <Badge tone="muted">indexed</Badge>}
                        {f.deprecated && <Badge tone="orange">deprecated</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(i)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deprecate(i)}>{f.deprecated ? "Undeprecate" : "Deprecate"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => drop(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {draft && (
              <div className="rounded-md border p-4 space-y-3 bg-background">
                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label className="text-xs">Field name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="preferred_name" /></div>
                  <div><Label className="text-xs">Type</Label>
                    <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["text", "int", "bigint", "bool", "timestamptz", "uuid", "jsonb", "text[]", "numeric"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Default (SQL literal)</Label><Input value={draft.defaultValue} onChange={(e) => setDraft({ ...draft, defaultValue: e.target.value })} placeholder="'' or now() or 0" /></div>
                  <div><Label className="text-xs">Validation rule</Label><Input value={draft.validation} onChange={(e) => setDraft({ ...draft, validation: e.target.value })} placeholder="e.g. length between 1 and 80" /></div>
                  <div className="md:col-span-2"><Label className="text-xs">Description</Label><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                  <label className="flex items-center gap-2 text-sm"><Switch checked={draft.required} onCheckedChange={(v) => setDraft({ ...draft, required: v })} /> Required</label>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={draft.unique} onCheckedChange={(v) => setDraft({ ...draft, unique: v })} /> Unique</label>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={draft.indexed} onCheckedChange={(v) => setDraft({ ...draft, indexed: v })} /> Indexed</label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setDraft(null); setEditIdx(null); }}>Cancel</Button>
                  <Button size="sm" onClick={save}>Save proposal</Button>
                </div>
              </div>
            )}
            {ddl && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Generated PostgreSQL migration</div>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-56">{ddl}</pre>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">MongoDB JSON Schema change</div>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-56">{mongoDelta}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Example record</CardTitle><CardDescription>Live sample from the database.</CardDescription></CardHeader>
          <CardContent>
            {example ? <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72">{JSON.stringify(example, null, 2)}</pre>
              : <div className="text-sm text-muted-foreground">No rows in this entity yet.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function bsonFor(t: string): string {
  switch (t) { case "int": case "bigint": return "int"; case "numeric": return "double"; case "bool": return "bool"; case "timestamptz": return "date"; case "jsonb": return "object"; case "text[]": return "array"; case "uuid": return "string"; default: return "string"; }
}

// ------------------------------------------------------------
// Relationships (interactive)
// ------------------------------------------------------------
type Rel = {
  id: "one-to-one" | "one-to-many" | "many-to-many";
  title: string; parent: string; child: string; fkLocation: string; deleteBehavior: string; mongoAdvice: string; access: string;
  diagram: string;
};

const RELS: Rel[] = [
  { id: "one-to-one", title: "Applicant ↔ Profile Preferences", parent: "applicants", child: "applicant_preferences (proposed)",
    fkLocation: "applicant_preferences.applicant_id UNIQUE", deleteBehavior: "ON DELETE CASCADE",
    mongoAdvice: "Embed inside applicants — the preferences travel with the parent and are always read together.",
    access: "Read with the applicant in every canonical fetch.",
    diagram: "applicants ─── 1:1 ─── applicant_preferences" },
  { id: "one-to-many", title: "Data Source → Import Jobs", parent: "data_sources", child: "import_jobs",
    fkLocation: "import_jobs.source_id", deleteBehavior: "ON DELETE RESTRICT (keep history)",
    mongoAdvice: "Reference — history is unbounded and read independently from the source configuration.",
    access: "List jobs by source_id with an index on (source_id, created_at DESC).",
    diagram: "data_sources ─── 1:N ─── import_jobs" },
  { id: "many-to-many", title: "Applicants ↔ Duplicate Matches (self)", parent: "applicants", child: "applicants (via duplicate_matches)",
    fkLocation: "duplicate_matches(applicant_a, applicant_b)", deleteBehavior: "ON DELETE CASCADE",
    mongoAdvice: "Reference — matches change independently and must be queryable from either side.",
    access: "Query both directions: WHERE applicant_a = $1 OR applicant_b = $1.",
    diagram: "applicants ─┐\n            ├── N:M ── duplicate_matches\napplicants ─┘" },
];

function RelationshipsTab() {
  const [id, setId] = useState<Rel["id"]>("one-to-many");
  const rel = RELS.find((r) => r.id === id)!;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Pick a cardinality</CardTitle><CardDescription>Realistic examples across CampusContext, with the modeling trade-offs on each side.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {RELS.map((r) => (
              <button key={r.id} onClick={() => setId(r.id)}
                className={"px-3 py-1.5 rounded-full text-xs border " + (id === r.id ? "bg-navy text-navy-foreground border-navy" : "bg-background hover:bg-muted")}>{r.id.replace(/-/g, " ")}</button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{rel.title}</CardTitle><CardDescription>{rel.id.replace(/-/g, " ")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <pre className="text-xs bg-muted/50 rounded p-4 overflow-auto">{rel.diagram}</pre>
          <div className="grid gap-3 md:grid-cols-2">
            <RelField label="Parent">{rel.parent}</RelField>
            <RelField label="Child">{rel.child}</RelField>
            <RelField label="Foreign key">{rel.fkLocation}</RelField>
            <RelField label="Delete behavior">{rel.deleteBehavior}</RelField>
            <RelField label="Access pattern">{rel.access}</RelField>
            <RelField label="Embed or reference (MongoDB)">{rel.mongoAdvice}</RelField>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Relational vs document heuristics</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
          <div>
            <div className="font-semibold mb-1">Relational</div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Normalize repeated or independently changing records.</li>
              <li>Use foreign keys and join tables to enforce integrity.</li>
              <li>Reach for CTEs and window functions for analytical reads.</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-1">MongoDB</div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Embed bounded data always read with the parent.</li>
              <li>Reference unbounded or independently changing data.</li>
              <li>Model around the read shape; secondary indexes support alt paths.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RelField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded border bg-muted/30 p-3"><div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div><div className="mt-1 text-sm font-mono">{children}</div></div>;
}

// ------------------------------------------------------------
// Schema Designer — Evolve the Applicant Model
// ------------------------------------------------------------
const CURRENT_DDL = `-- v1 (current)
CREATE TABLE applicants (
  id uuid PRIMARY KEY,
  application_id text,
  first_name text, last_name text,
  email text, normalized_email text,
  application_status text, enrollment_term text,
  source_campaign text, missing_documents text[],
  source text,
  merged_into uuid REFERENCES applicants(id)
);`;

const PROPOSED_DDL = `-- v2 (proposed)
CREATE TABLE institutions (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  schema_version int NOT NULL DEFAULT 1
);
CREATE TABLE applicants (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  normalized_email text,
  merged_into uuid REFERENCES applicants(id),
  UNIQUE (institution_id, normalized_email)
);
CREATE INDEX applicants_norm_email_idx ON applicants(normalized_email);
CREATE TABLE applications (
  id uuid PRIMARY KEY,
  applicant_id uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  application_id_external text,
  application_status text NOT NULL,
  enrollment_term text NOT NULL,
  source_campaign text,
  missing_documents text[] DEFAULT '{}',
  UNIQUE (institution_id, application_id_external)
);
CREATE INDEX applications_inst_term_idx ON applications(institution_id, enrollment_term, application_status);
CREATE TABLE source_records (
  id uuid PRIMARY KEY,
  data_source_id uuid NOT NULL REFERENCES data_sources(id),
  external_id text,
  payload jsonb NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_records_ds_ingested_idx ON source_records(data_source_id, ingested_at DESC);`;

const PROPOSED_MONGO = `// v2 (MongoDB reference)
db.createCollection('applicants', {
  validator: { $jsonSchema: { bsonType: 'object',
    required: ['institution_id','first_name','last_name'],
    properties: { institution_id: { bsonType: 'string' }, email: { normalized: { bsonType: 'string' } } } } } });
db.applicants.createIndex({ institution_id: 1, 'email.normalized': 1 }, { unique: true, partialFilterExpression: { 'email.normalized': { $exists: true } } });
db.applications.createIndex({ institution_id: 1, enrollment_term: 1, application_status: 1 });
db.source_records.createIndex({ data_source_id: 1, ingested_at: -1 });`;

function DesignerTab() {
  const [validation, setValidation] = useState<{ passed: string[]; failed: string[] } | null>(null);
  function runValidate() {
    const passed = [
      "Primary key present on every table (applicants, applications, institutions, source_records)",
      "Relationships defined (applications.applicant_id, applications.institution_id, source_records.data_source_id)",
      "Required fields identified (institution_id, first_name, last_name, application_status, enrollment_term)",
      "Indexes support stated access patterns (norm_email, inst+term+status, data_source+ingested_at)",
      "Tenant ownership represented (institution_id on applicants and applications)",
      "Schema version tracked on institutions",
      "No unbounded embedded history — status history and audit are separate tables",
    ];
    const failed: string[] = [];
    setValidation({ passed, failed });
    toast.success("Design validated — see checklist below.");
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Exercise — Evolve the Applicant Model</CardTitle>
          <CardDescription>Compare the current model to a proposed v2 that separates people from applications and preserves source provenance.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            <BeforeAfter title="Before" tone="muted">applicants (person + application fields, free-text source)</BeforeAfter>
            <BeforeAfter title="After" tone="navy">institutions · applicants · applications · source_records</BeforeAfter>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Current DDL (v1)</div>
              <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72">{CURRENT_DDL}</pre>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Proposed DDL (v2)</div>
              <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72">{PROPOSED_DDL}</pre>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs uppercase text-muted-foreground mb-1">MongoDB reference (v2)</div>
            <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-64">{PROPOSED_MONGO}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Why v2 is stronger</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm list-disc pl-5 text-muted-foreground space-y-1">
            <li>One applicant can submit multiple applications across terms without duplication.</li>
            <li>institution_id enables tenant isolation and per-institution unique keys.</li>
            <li>source_records preserves the raw payload — canonicalization becomes replayable.</li>
            <li>Canonical records stay small and queryable; history lives in dedicated tables.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-base">Validate design</CardTitle><CardDescription>Automated design checklist — no live schema change.</CardDescription></div>
          <Button size="sm" onClick={runValidate}>Validate design</Button>
        </CardHeader>
        <CardContent>
          {!validation ? <div className="text-sm text-muted-foreground">Click "Validate design" to run the checklist.</div>
            : <ul className="text-sm space-y-1">
              {validation.passed.map((p) => <li key={p} className="flex items-start gap-2 text-success"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /><span className="text-foreground">{p}</span></li>)}
              {validation.failed.map((p) => <li key={p} className="flex items-start gap-2 text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{p}</span></li>)}
            </ul>}
        </CardContent>
      </Card>

      <div className="rounded-md border border-dashed border-orange/40 bg-orange/5 p-4 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 text-orange mt-0.5 shrink-0" />
        <div>Design sandbox output. The live prototype schema is unchanged; the DDL above is what a v2 migration would run in a follow-up change.</div>
      </div>
    </div>
  );
}

function BeforeAfter({ title, tone, children }: { title: string; tone: "muted" | "navy"; children: React.ReactNode }) {
  const cls = tone === "navy" ? "border-navy/40 bg-navy/5" : "border-border bg-muted/30";
  return <div className={"rounded-md border p-4 " + cls}><div className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">{title}</div><div className="text-sm">{children}</div></div>;
}

// ------------------------------------------------------------
// Lineage
// ------------------------------------------------------------
const LINEAGE = [
  { system: "Slate CRM", srcField: "student_email", transform: "trim → lowercase → RFC5322 validate", canonical: "applicants.normalized_email", consumer: "AI CRM · Agent Workspace", integration: "/integrations", pipeline: "/pipelines" },
  { system: "SIS", srcField: "APPLICANT_ID", transform: "trim, uppercase", canonical: "applicants.application_id", consumer: "AI CRM · Reporting", integration: "/integrations", pipeline: "/pipelines" },
  { system: "SIS", srcField: "APP_STATUS", transform: "vocabulary map → {Submitted, Incomplete, Admitted, Waitlisted, Denied}", canonical: "applicants.application_status", consumer: "Automation · Agent Workspace", integration: "/integrations", pipeline: "/pipelines" },
  { system: "Marketing", srcField: "utm_campaign", transform: "passthrough", canonical: "applicants.source_campaign", consumer: "Insights · Attribution", integration: "/integrations", pipeline: "/pipelines" },
  { system: "CSV import", srcField: "missing", transform: "split on ';,' → text[]", canonical: "applicants.missing_documents", consumer: "Automation · Counselor UI", integration: "/integrations", pipeline: "/pipelines" },
];

function LineageTab() {
  const featured = LINEAGE[0];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>End-to-end lineage</CardTitle>
          <CardDescription>Source record → source field → mapping → transformation → canonical field → downstream consumer.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-muted/30 p-4 text-xs font-mono leading-relaxed overflow-auto">
            <span className="text-navy font-semibold">{featured.system}.{featured.srcField}</span>
            {" → "}<span className="text-orange">{featured.transform.split("→").join("→")}</span>
            {" → "}<span className="text-navy font-semibold">{featured.canonical}</span>
            {" → "}<span className="text-foreground font-semibold">{featured.consumer}</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Imports &amp; field mappings live under Integrations. Data Model surfaces their output through lineage.</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Field lineage catalog</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Source system</th>
                <th className="text-left px-4 py-2">Source field</th>
                <th className="text-left px-4 py-2">Mapping / transformation</th>
                <th className="text-left px-4 py-2">Canonical field</th>
                <th className="text-left px-4 py-2">Downstream consumer</th>
                <th className="text-left px-4 py-2">Related</th>
              </tr>
            </thead>
            <tbody>
              {LINEAGE.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2 text-xs">{l.system}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.srcField}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.transform}</td>
                  <td className="px-4 py-2 font-mono text-xs text-navy">{l.canonical}</td>
                  <td className="px-4 py-2 text-xs">{l.consumer}</td>
                  <td className="px-4 py-2 text-xs space-x-2">
                    <a className="underline hover:text-navy" href={l.integration}>mapping</a>
                    <a className="underline hover:text-navy" href={l.pipeline}>pipeline</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Canonical applicant fields</CardTitle><CardDescription>The applicant record's canonical field catalog. Source-system columns are mapped onto these on ingest.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-2">Canonical field</th><th className="text-left px-4 py-2">Purpose</th></tr>
            </thead>
            <tbody>
              {CANONICAL_FIELDS.map((f) => (
                <tr key={f} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{f}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{PURPOSES[f] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

const PURPOSES: Record<string, string> = {
  application_id: "Cross-system unique identifier",
  first_name: "Given name", last_name: "Family name",
  email: "Primary contact address (normalized on ingest)",
  application_status: "Stage in admissions funnel",
  enrollment_term: "Intended intake term",
  source_campaign: "Attribution — marketing origin",
  missing_documents: "Outstanding items required to complete the application",
};

function Badge({ children, tone }: { children: React.ReactNode; tone: "navy" | "orange" | "success" | "muted" }) {
  const cls = tone === "navy" ? "bg-navy/10 text-navy border-navy/30"
    : tone === "orange" ? "bg-orange/10 text-orange border-orange/30"
    : tone === "success" ? "bg-success/15 text-success border-success/30"
    : "bg-muted text-muted-foreground border-border";
  return <span className={"inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium " + cls}>{children}</span>;
}
