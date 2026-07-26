import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useState } from "react";
import { Quality } from "./quality";
import { CANONICAL_FIELDS } from "@/lib/campus";

export const Route = createFileRoute("/_authenticated/data-model")({
  head: () => ({
    meta: [
      { title: "Data Model — CampusContext" },
      { name: "description", content: "Canonical entities, fields, relationships, quality and lineage for the CampusContext platform." },
    ],
  }),
  component: DataModelPage,
});

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
    relationships: [
      "1 applicant → many validation_errors",
      "1 applicant → many workflow_executions",
      "applicant ↔ applicant via duplicate_matches",
    ],
  },
  {
    name: "Data source", table: "data_sources",
    description: "A configured upstream integration (SIS, CRM, marketing, etc.).",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "name", type: "text", required: true },
      { name: "kind", type: "text", required: true, note: "sis · crm · marketing" },
      { name: "status", type: "text", required: true },
      { name: "sync_frequency", type: "text", required: true },
      { name: "last_sync_at", type: "timestamptz" },
      { name: "records_processed", type: "int" },
      { name: "failed_records", type: "int" },
    ],
    relationships: ["1 data_source → many import_jobs"],
  },
  {
    name: "Import job", table: "import_jobs",
    description: "One execution of a pipeline — either a CSV import or an integration sync.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "source_id", type: "uuid", fk: "data_sources.id" },
      { name: "source_name", type: "text" },
      { name: "kind", type: "text", required: true, note: "csv · sync" },
      { name: "status", type: "text", required: true },
      { name: "records_total", type: "int" },
      { name: "records_valid", type: "int" },
      { name: "records_invalid", type: "int" },
    ],
    relationships: [
      "many import_jobs → 1 data_source",
      "1 import_job → many validation_errors",
    ],
  },
  {
    name: "Validation error", table: "validation_errors",
    description: "Per-row, per-field validation failure captured during ingestion.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "import_job_id", type: "uuid", fk: "import_jobs.id", index: true },
      { name: "applicant_id", type: "uuid", fk: "applicants.id" },
      { name: "row_number", type: "int" },
      { name: "field", type: "text" },
      { name: "kind", type: "text", required: true },
      { name: "message", type: "text" },
      { name: "submitted_value", type: "text" },
      { name: "resolved", type: "bool", required: true },
    ],
    relationships: [
      "many validation_errors → 1 import_job",
      "many validation_errors → 1 applicant (optional)",
    ],
  },
  {
    name: "Duplicate match", table: "duplicate_matches",
    description: "Detected duplicate pair awaiting or resolved by merge.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "applicant_a", type: "uuid", fk: "applicants.id" },
      { name: "applicant_b", type: "uuid", fk: "applicants.id" },
      { name: "reason", type: "text", required: true },
      { name: "resolved", type: "bool", required: true },
    ],
    relationships: ["2 applicants ↔ 1 duplicate_match"],
  },
  {
    name: "Workflow rule", table: "workflow_rules",
    description: "Trigger + condition + action definition consumed by the automation engine.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "active", type: "bool", required: true },
      { name: "condition", type: "jsonb", required: true },
      { name: "action", type: "jsonb", required: true },
    ],
    relationships: ["1 workflow_rule → many workflow_executions"],
  },
  {
    name: "Workflow execution", table: "workflow_executions",
    description: "One firing of a workflow rule against a matched entity.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "rule_id", type: "uuid", fk: "workflow_rules.id" },
      { name: "applicant_id", type: "uuid", fk: "applicants.id" },
      { name: "action_taken", type: "text", required: true },
      { name: "result", type: "text" },
    ],
    relationships: [
      "many workflow_executions → 1 workflow_rule",
      "many workflow_executions → 1 applicant",
    ],
  },
  {
    name: "Audit event", table: "audit_events",
    description: "Append-only trust ledger. Every write in the platform emits a row.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "actor", type: "text" },
      { name: "action", type: "text", required: true },
      { name: "affected_record", type: "text" },
      { name: "source", type: "text" },
      { name: "result", type: "text" },
      { name: "metadata", type: "jsonb" },
    ],
    relationships: ["referenced by every mutation across the platform"],
  },
  {
    name: "Quality snapshot", table: "quality_snapshots",
    description: "Point-in-time completeness & duplicate-rate capture, recorded on scans and merges.",
    fields: [
      { name: "id", type: "uuid", pk: true, required: true },
      { name: "completeness_pct", type: "int", required: true },
      { name: "duplicate_rate_pct", type: "int", required: true },
      { name: "trigger", type: "text", required: true },
      { name: "note", type: "text" },
    ],
    relationships: ["standalone (time series)"],
  },
];

function DataModelPage() {
  return (
    <PageShell title="Data Model" subtitle="Canonical schemas, relationships, quality and lineage that downstream CRM and agent applications consume.">
      <Tabs defaultValue="entities">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="mt-4"><EntitiesTab /></TabsContent>
        <TabsContent value="fields" className="mt-4"><FieldsTab /></TabsContent>
        <TabsContent value="relationships" className="mt-4"><RelationshipsTab /></TabsContent>
        <TabsContent value="quality" className="mt-4"><div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><Quality /></div></TabsContent>
        <TabsContent value="lineage" className="mt-4"><LineageTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function EntitiesTab() {
  const [selected, setSelected] = useState(ENTITIES[0].table);
  const entity = ENTITIES.find((e) => e.table === selected)!;
  const { data: example } = useQuery({
    queryKey: ["entity-example", selected],
    queryFn: async () => {
      const { data } = await supabase.from(selected as never).select("*").limit(1);
      return (data?.[0] as Record<string, unknown> | undefined) ?? null;
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Entities</CardTitle></CardHeader>
        <CardContent className="p-2 space-y-0.5">
          {ENTITIES.map((e) => (
            <button
              key={e.table}
              onClick={() => setSelected(e.table)}
              className={"w-full text-left px-3 py-2 rounded text-sm transition-colors " +
                (selected === e.table ? "bg-navy/10 text-navy font-medium" : "hover:bg-muted")}
            >
              <div>{e.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{e.table}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{entity.name} <span className="text-muted-foreground font-mono text-sm">— {entity.table}</span></CardTitle>
            <CardDescription>{entity.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Field</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Constraints</th>
                  <th className="text-left px-4 py-2">Notes</th>
                </tr>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Relationships</CardTitle></CardHeader>
          <CardContent><ul className="text-sm space-y-1 list-disc pl-5">{entity.relationships.map((r) => <li key={r}>{r}</li>)}</ul></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Example record</CardTitle><CardDescription>Live sample from the database.</CardDescription></CardHeader>
          <CardContent>
            {example ? (
              <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72">{JSON.stringify(example, null, 2)}</pre>
            ) : (
              <div className="text-sm text-muted-foreground">No rows in this entity yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FieldsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canonical applicant fields</CardTitle>
        <CardDescription>The applicant record's canonical field catalog. Source-system columns are mapped onto these during ingestion.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left px-4 py-2">Canonical field</th><th className="text-left px-4 py-2">Purpose</th></tr>
          </thead>
          <tbody>
            {CANONICAL_FIELDS.map((f) => (
              <tr key={f} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{f}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {({
                    application_id: "Cross-system unique identifier",
                    first_name: "Given name",
                    last_name: "Family name",
                    email: "Primary contact address (normalized on ingest)",
                    application_status: "Stage in admissions funnel",
                    enrollment_term: "Intended intake term",
                    source_campaign: "Attribution — marketing origin",
                    missing_documents: "Outstanding items required to complete the application",
                  } as Record<string, string>)[f]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function RelationshipsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entity relationships</CardTitle>
        <CardDescription>Compact overview of the primary one-to-many relationships across the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted/50 rounded p-4 overflow-auto leading-relaxed">
{`data_sources ──┐
               ├──< import_jobs ──< validation_errors
               │                        │
               │                        └──> applicants (optional FK)
               │
applicants ────┼──< workflow_executions >── workflow_rules
               ├──< duplicate_matches >── applicants  (self-referencing pair)
               └──  merged_into ──> applicants (self FK, losing side)

audit_events   ─  append-only ledger, referenced by every mutation
quality_snapshots  ─  time-series of completeness_pct & duplicate_rate_pct`}
        </pre>
      </CardContent>
    </Card>
  );
}

const LINEAGE = [
  { system: "SIS", srcField: "APPLICANT_ID", transform: "trim, uppercase", canonical: "application_id" },
  { system: "SIS", srcField: "GIVEN_NAME", transform: "trim", canonical: "first_name" },
  { system: "SIS", srcField: "FAMILY_NAME", transform: "trim", canonical: "last_name" },
  { system: "SIS", srcField: "EMAIL", transform: "lowercase, RFC5322 validate → normalized_email", canonical: "email" },
  { system: "SIS", srcField: "APP_STATUS", transform: "vocabulary map", canonical: "application_status" },
  { system: "CRM", srcField: "Contact.Email", transform: "lowercase → normalized_email", canonical: "email" },
  { system: "CRM", srcField: "Opportunity.Stage", transform: "stage → application_status map", canonical: "application_status" },
  { system: "Marketing", srcField: "utm_campaign", transform: "passthrough", canonical: "source_campaign" },
  { system: "Marketing", srcField: "form_email", transform: "lowercase, validate", canonical: "email" },
  { system: "CSV import", srcField: "missing", transform: "split on ';,' → text[]", canonical: "missing_documents" },
];

function LineageTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Field lineage</CardTitle>
        <CardDescription>Source system → source field → transformation → canonical field. Simulated for the prototype using the current mapping rules.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Source system</th>
              <th className="text-left px-4 py-2">Source field</th>
              <th className="text-left px-4 py-2">Mapping / transformation</th>
              <th className="text-left px-4 py-2">Canonical field</th>
            </tr>
          </thead>
          <tbody>
            {LINEAGE.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2 text-xs">{l.system}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.srcField}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{l.transform}</td>
                <td className="px-4 py-2 font-mono text-xs text-navy">{l.canonical}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "navy" | "orange" | "success" | "muted" }) {
  const cls =
    tone === "navy" ? "bg-navy/10 text-navy border-navy/30"
    : tone === "orange" ? "bg-orange/10 text-orange border-orange/30"
    : tone === "success" ? "bg-success/15 text-success border-success/30"
    : "bg-muted text-muted-foreground border-border";
  return <span className={"inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium " + cls}>{children}</span>;
}
