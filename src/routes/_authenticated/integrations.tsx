import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Sources } from "./sources";
import { Importer } from "./import";
import { timeAgo, CANONICAL_FIELDS } from "@/lib/campus";
import { Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — CampusContext" },
      { name: "description", content: "Connections, APIs, webhooks, imports/exports and field mappings feeding the CampusContext platform." },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <PageShell title="Integrations" subtitle="Connections into the platform and the interfaces that carry data in and out.">
      <Tabs defaultValue="connections">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="apis">APIs</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="imports">Imports & Exports</TabsTrigger>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-4 space-y-4"><ConnectionsTable /><div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><Sources /></div></TabsContent>
        <TabsContent value="apis" className="mt-4"><ApisTab /></TabsContent>
        <TabsContent value="webhooks" className="mt-4"><WebhooksTab /></TabsContent>
        <TabsContent value="imports" className="mt-4 space-y-4"><ImportHistory /><div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><Importer /></div></TabsContent>
        <TabsContent value="mappings" className="mt-4"><MappingsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ConnectionsTable() {
  const { data } = useQuery({
    queryKey: ["integrations-table"],
    queryFn: async () => (await supabase.from("data_sources").select("*").order("name")).data ?? [],
  });
  const direction = (kind: string) => kind === "marketing" ? "inbound" : "bidirectional";
  const mode = (kind: string) => kind === "sis" ? "batch sync" : kind === "crm" ? "API" : "webhook / API";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations directory</CardTitle>
        <CardDescription>Every configured connection into the core platform. Simulated for the prototype.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Integration</th>
              <th className="text-left px-4 py-2">System type</th>
              <th className="text-left px-4 py-2">Direction</th>
              <th className="text-left px-4 py-2">Mode</th>
              <th className="text-left px-4 py-2">Last sync</th>
              <th className="text-right px-4 py-2">Records processed</th>
              <th className="text-right px-4 py-2">Failed</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 text-xs uppercase text-muted-foreground">{s.kind}</td>
                <td className="px-4 py-2 text-xs">{direction(s.kind)}</td>
                <td className="px-4 py-2 text-xs">{mode(s.kind)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{timeAgo(s.last_sync_at)}</td>
                <td className="px-4 py-2 text-right">{(s.records_processed ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-destructive">{s.failed_records ?? 0}</td>
                <td className="px-4 py-2"><span className={
                  "text-xs px-2 py-0.5 rounded-full border " +
                  (s.status === "connected" ? "bg-success/15 text-success border-success/30"
                    : s.status === "degraded" ? "bg-warning/15 text-warning-foreground border-warning/40"
                    : "bg-destructive/15 text-destructive border-destructive/30")
                }>{s.status}</span></td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground text-sm">No integrations configured.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ImportHistory() {
  const { data } = useQuery({
    queryKey: ["import-history"],
    queryFn: async () => (await supabase.from("import_jobs").select("*").eq("kind", "csv").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle>Import history</CardTitle><CardDescription>Recent CSV imports.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">When</th>
              <th className="text-left px-4 py-2">File</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-right px-4 py-2">Valid</th>
              <th className="text-right px-4 py-2">Invalid</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">No imports yet — upload a CSV below.</td></tr>}
            {(data ?? []).map((j) => (
              <tr key={j.id} className="border-t">
                <td className="px-4 py-2 text-xs text-muted-foreground">{timeAgo(j.created_at)}</td>
                <td className="px-4 py-2 text-xs">{j.source_name}</td>
                <td className="px-4 py-2 text-xs text-right">{j.records_total}</td>
                <td className="px-4 py-2 text-xs text-right text-success">{j.records_valid}</td>
                <td className="px-4 py-2 text-xs text-right text-destructive">{j.records_invalid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MappingsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Field mappings</CardTitle>
        <CardDescription>Canonical target fields available when importing new source data. Interactive mapping is done during CSV import.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Canonical field</th>
              <th className="text-left px-4 py-2">Accepted source columns (auto-suggested)</th>
            </tr>
          </thead>
          <tbody>
            {CANONICAL_FIELDS.map((f) => (
              <tr key={f} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{f}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{
                  ({
                    application_id: "application_id, app_id, id",
                    first_name: "first_name, firstname, given_name, first",
                    last_name: "last_name, lastname, surname, family_name, last",
                    email: "email, email_address, mail",
                    application_status: "application_status, status, stage",
                    enrollment_term: "enrollment_term, term, intake",
                    source_campaign: "source_campaign, campaign, utm_campaign",
                    missing_documents: "missing_documents, docs_missing, missing",
                  } as Record<string, string>)[f]
                }</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const API_ENDPOINTS = [
  { method: "GET", path: "/v1/applicants", desc: "List canonical applicants (paginated, filterable)" },
  { method: "GET", path: "/v1/applicants/{id}", desc: "Fetch one trusted applicant profile with lineage" },
  { method: "POST", path: "/v1/applicants", desc: "Upsert applicant from an external source system" },
  { method: "POST", path: "/v1/import_jobs", desc: "Start an ingestion run" },
  { method: "GET", path: "/v1/quality/snapshots", desc: "Time-series of completeness & duplicate rate" },
  { method: "GET", path: "/v1/workflow_executions", desc: "Recent automation firings" },
  { method: "GET", path: "/v1/audit_events", desc: "Trust ledger query" },
];

function ApisTab() {
  return (
    <>
      <ReferenceBanner text="Reference API surface — endpoints below are a proposed design, not live routes. Postman collection and OpenAPI spec are next-cycle work." />
      <Card>
        <CardHeader><CardTitle>Reference REST API</CardTitle><CardDescription>Read/write surface downstream applications will consume.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-2 w-24">Method</th><th className="text-left px-4 py-2">Path</th><th className="text-left px-4 py-2">Description</th></tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((e) => (
                <tr key={e.path} className="border-t">
                  <td className="px-4 py-2"><span className={"text-xs font-mono font-semibold " + (e.method === "GET" ? "text-success" : "text-orange")}>{e.method}</span></td>
                  <td className="px-4 py-2 font-mono text-xs">{e.path}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

const WEBHOOK_EVENTS = [
  "applicant.upserted", "applicant.merged", "import_job.completed", "quality.snapshot.recorded", "workflow.executed",
];

function WebhooksTab() {
  const example = {
    id: "evt_01HABC…",
    type: "applicant.upserted",
    occurred_at: "2026-07-26T12:34:56Z",
    data: {
      applicant_id: "e7b5d499-…-…",
      application_id: "APP-2001",
      changes: { application_status: ["Submitted", "Admitted"] },
      source: "SIS",
    },
  };
  return (
    <>
      <ReferenceBanner text="Reference webhook design — no outbound deliveries are made from this prototype." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Emitted events</CardTitle><CardDescription>Subscribable event types.</CardDescription></CardHeader>
          <CardContent><ul className="space-y-1 text-sm font-mono">{WEBHOOK_EVENTS.map((e) => <li key={e}>• {e}</li>)}</ul></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sample payload</CardTitle><CardDescription>Signed with HMAC-SHA256 in the reference design.</CardDescription></CardHeader>
          <CardContent><pre className="text-xs bg-muted/50 rounded p-3 overflow-auto">{JSON.stringify(example, null, 2)}</pre></CardContent>
        </Card>
      </div>
    </>
  );
}

function ReferenceBanner({ text }: { text: string }) {
  return (
    <Card className="border-dashed border-orange/40 bg-orange/5 mb-4">
      <CardContent className="p-4 flex items-start gap-3 text-sm">
        <Info className="h-4 w-4 text-orange mt-0.5 shrink-0" />
        <div className="text-muted-foreground text-xs">{text}</div>
      </CardContent>
    </Card>
  );
}
