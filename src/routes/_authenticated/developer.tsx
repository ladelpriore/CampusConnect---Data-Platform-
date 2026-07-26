import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "./dashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Audit } from "./audit";
import { Info } from "lucide-react";
import { SqlWorkbench } from "@/components/sql-workbench";

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({
    meta: [
      { title: "Developer & Governance — CampusContext" },
      { name: "description", content: "API explorer, SQL and MongoDB reference designs, audit trust ledger and access model for the CampusContext platform." },
    ],
  }),
  component: DeveloperPage,
});

function DeveloperPage() {
  return (
    <PageShell title="Developer & Governance" subtitle="Developer surface and governance controls: APIs, schemas, audit trail and access model.">
      <Tabs defaultValue="api">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="api">API Explorer</TabsTrigger>
          <TabsTrigger value="sql">SQL Workbench</TabsTrigger>
          <TabsTrigger value="mongo">MongoDB</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="access">Access & Tenancy</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="mt-4"><ApiExplorer /></TabsContent>
        <TabsContent value="sql" className="mt-4"><SqlTab /></TabsContent>
        <TabsContent value="mongo" className="mt-4"><MongoTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><Audit /></div></TabsContent>
        <TabsContent value="access" className="mt-4"><AccessTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function RefBanner({ text }: { text: string }) {
  return (
    <Card className="border-dashed border-orange/40 bg-orange/5 mb-4">
      <CardContent className="p-4 flex items-start gap-3 text-sm">
        <Info className="h-4 w-4 text-orange mt-0.5 shrink-0" />
        <div className="text-muted-foreground text-xs">{text}</div>
      </CardContent>
    </Card>
  );
}

function ApiExplorer() {
  const request = `curl https://api.campuscontext.dev/v1/applicants/APP-2003 \\
  -H "Authorization: Bearer $CAMPUSCONTEXT_TOKEN"`;
  const response = {
    id: "e7b5d499-…",
    application_id: "APP-2003",
    first_name: "Cameron",
    last_name: "Reed",
    email: "cameron.reed@example.edu",
    application_status: "Admitted",
    enrollment_term: "Fall 2026",
    source: "SIS",
    lineage: [{ system: "SIS", field: "APPLICANT_ID", mapped_to: "application_id" }],
  };
  return (
    <>
      <RefBanner text="Reference API surface — endpoints below are a proposed design, not live routes. Full OpenAPI spec and Postman collection are next-cycle work." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Request</CardTitle><CardDescription>Fetch a canonical applicant by application_id.</CardDescription></CardHeader>
          <CardContent><pre className="text-xs bg-muted/50 rounded p-3 overflow-auto">{request}</pre></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Response</CardTitle><CardDescription>Canonical profile with lineage.</CardDescription></CardHeader>
          <CardContent><pre className="text-xs bg-muted/50 rounded p-3 overflow-auto">{JSON.stringify(response, null, 2)}</pre></CardContent>
        </Card>
      </div>
    </>
  );
}

const DDL = `-- Applicants (canonical, deduplicated)
CREATE TABLE public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text,
  first_name text, last_name text,
  email text, normalized_email text,
  application_status text,
  enrollment_term text,
  source_campaign text,
  missing_documents text[] DEFAULT '{}',
  source text,
  merged_into uuid REFERENCES public.applicants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX applicants_norm_email_idx ON public.applicants(normalized_email);
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;`;


function SqlTab() {
  return (
    <div className="space-y-4">
      <Card className="border-dashed border-navy/30 bg-navy/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <Info className="h-4 w-4 text-navy mt-0.5 shrink-0" />
          <div className="text-muted-foreground text-xs">
            The workbench displays the exact PostgreSQL a production deployment would run and executes an equivalent typed Supabase read against this prototype's live data. Non-SELECT keywords are blocked before execution. Each query is version-controlled — click the filename to open it on GitHub.
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Schema reference (PostgreSQL)</CardTitle><CardDescription>Live backend DDL for the canonical <span className="font-mono">applicants</span> entity.</CardDescription></CardHeader>
        <CardContent><pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-56">{DDL}</pre></CardContent>
      </Card>
      <SqlWorkbench />
    </div>
  );
}

function MongoTab() {
  const doc = {
    _id: "app_APP-2003",
    application_id: "APP-2003",
    name: { first: "Cameron", last: "Reed" },
    email: { raw: "cameron.reed@example.edu", normalized: "cameron.reed@example.edu" },
    status: { current: "Admitted", history: [{ status: "Submitted", at: "2026-01-05T…" }] },
    enrollment_term: "Fall 2026",
    attribution: { source: "SIS", campaign: null },
    documents: { missing: [] },
    duplicates_of: [],
    updated_at: "2026-07-26T12:34:56Z",
  };
  return (
    <>
      <RefBanner text="Reference document model — the live CampusContext backend is PostgreSQL. This document layout is a proposed shape for a document-oriented downstream consumer or cache." />
      <Card>
        <CardHeader><CardTitle>applicant collection — reference document</CardTitle></CardHeader>
        <CardContent><pre className="text-xs bg-muted/50 rounded p-3 overflow-auto">{JSON.stringify(doc, null, 2)}</pre></CardContent>
      </Card>
    </>
  );
}

const ROLES = [
  { role: "admin", scope: "Full platform: schema, integrations, rules, secrets, audit read/export." },
  { role: "counselor", scope: "Applicants: read/edit assigned records, resolve duplicates, complete tasks." },
  { role: "read-only", scope: "Read canonical entities and insights. No mutations." },
  { role: "service", scope: "Machine-to-machine: scoped API tokens for downstream applications." },
];

function AccessTab() {
  return (
    <>
      <RefBanner text="Reference role model — the current prototype uses a single-tenant authenticated session with permissive policies for demo purposes. Full RBAC and multi-tenant isolation are next-cycle work." />
      <Card>
        <CardHeader><CardTitle>Roles</CardTitle><CardDescription>Proposed access tiers for a production deployment.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-2">Role</th><th className="text-left px-4 py-2">Scope</th></tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.role} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs font-semibold">{r.role}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><CardTitle>Tenancy</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Production design: institution = tenant. Every canonical entity carries a <span className="font-mono">tenant_id</span> and every RLS policy scopes reads/writes to the caller's tenant. Cross-tenant reads require explicit service-role tokens issued by an admin. Not enforced in this prototype.
        </CardContent>
      </Card>
    </>
  );
}
