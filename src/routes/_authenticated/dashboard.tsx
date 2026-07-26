import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Activity, CheckCircle2, AlertTriangle, Users, Database, RefreshCcw, GitBranch, ChevronRight, MapPin, Github, Server, Boxes, PlugZap, Workflow, Cog, LineChart as LineIcon, Wrench, Sparkles, Layers,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from "recharts";
import { timeAgo, GITHUB_REPO_URL } from "@/lib/campus";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — CampusContext Core Data & Integrations Platform" },
      { name: "description", content: "Operational overview of the CampusContext core data & integrations platform: integration health, pipeline reliability, data quality and downstream consumers." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [srcs, apps, jobs, dups, wf, jobs7] = await Promise.all([
        supabase.from("data_sources").select("*"),
        supabase.from("applicants").select("*").is("merged_into", null),
        supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("duplicate_matches").select("*").eq("resolved", false),
        supabase.from("workflow_executions").select("*"),
        supabase.from("import_jobs").select("created_at,records_total,records_valid,records_invalid,kind,source_name").gte("created_at", sinceIso),
      ]);
      return {
        sources: srcs.data ?? [],
        applicants: apps.data ?? [],
        jobs: jobs.data ?? [],
        duplicates: dups.data ?? [],
        workflows: wf.data ?? [],
        jobs7: jobs7.data ?? [],
      };
    },
  });

  if (!data) return <PageShell title="Overview"><div className="text-sm text-muted-foreground">Loading…</div></PageShell>;

  const totalFields = ["application_id", "first_name", "last_name", "email", "application_status", "enrollment_term"];
  let filled = 0;
  const tot = data.applicants.length * totalFields.length;
  data.applicants.forEach((a) => totalFields.forEach((f) => { if ((a as never as Record<string, unknown>)[f]) filled++; }));
  const completeness = tot ? Math.round((filled / tot) * 100) : 0;
  const totalProcessed = data.sources.reduce((s, x) => s + (x.records_processed ?? 0), 0);
  const totalFailed = data.sources.reduce((s, x) => s + (x.failed_records ?? 0), 0);
  const totalJobs = data.jobs7.length;
  const successJobs = data.jobs7.filter((j) => (j.records_invalid ?? 0) === 0).length;
  const successRate = totalJobs ? Math.round((successJobs / totalJobs) * 100) : 100;

  // Pipeline volume by day (last 7)
  const dayBuckets: { day: string; records: number; iso: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    dayBuckets.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), records: 0, iso: d.toISOString().slice(0, 10) });
  }
  data.jobs7.forEach((j) => {
    const key = new Date(j.created_at).toISOString().slice(0, 10);
    const b = dayBuckets.find((x) => x.iso === key);
    if (b) b.records += j.records_total ?? 0;
  });
  const hasTrendData = dayBuckets.some((t) => t.records > 0);

  const errorsBySource = data.sources.map((s) => ({ name: s.name, errors: s.failed_records ?? 0 }));

  const lastSync = data.sources.reduce<string | null>((acc, s) => {
    if (!s.last_sync_at) return acc;
    if (!acc || new Date(s.last_sync_at) > new Date(acc)) return s.last_sync_at;
    return acc;
  }, null);

  return (
    <PageShell
      title="Core Data & Integrations Platform"
      subtitle="Standardize institution data and expose trusted context to CRM and agent applications."
    >
      <GuidedDemoPanel />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi icon={PlugZap} label="Connected integrations" value={data.sources.filter((s) => s.status === "connected").length} sub={`of ${data.sources.length} configured`} />
        <Kpi icon={CheckCircle2} label="Pipeline success rate (7d)" value={`${successRate}%`} sub={`${totalJobs} runs`} accent="success" />
        <Kpi icon={Activity} label="Data-quality score" value={`${completeness}%`} sub={`${data.applicants.length} trusted profiles`} accent="success" />
        <Kpi icon={Users} label="Records synchronized" value={totalProcessed.toLocaleString()} sub={`last sync ${timeAgo(lastSync)}`} />
        <Kpi icon={AlertTriangle} label="Failed records" value={totalFailed} sub={`${data.duplicates.length} duplicates open`} accent="warning" />
        <Kpi icon={GitBranch} label="Workflow executions" value={data.workflows.length} sub="lifetime" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline volume (last 7 days)</CardTitle>
            <CardDescription>Records processed across ingestion pipelines. Derived from real import & sync jobs.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {hasTrendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayBuckets}>
                  <CartesianGrid stroke="oklch(0.9 0.01 250)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 250)" }} />
                  <Line type="monotone" dataKey="records" stroke="oklch(0.24 0.06 265)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <div className="font-medium text-navy">No pipeline activity yet</div>
                  <div className="mt-1 max-w-xs">Trigger a sync on <Link to="/integrations" className="underline">Integrations</Link> or upload a CSV to populate this chart from real jobs.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Integration health</CardTitle><CardDescription>Live connection status.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {data.sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">Last sync {timeAgo(s.last_sync_at)}</div>
                </div>
                <span className={
                  "text-xs px-2 py-0.5 rounded-full border " +
                  (s.status === "connected" ? "bg-success/15 text-success border-success/30"
                    : s.status === "degraded" ? "bg-warning/15 text-warning-foreground border-warning/40"
                    : "bg-destructive/15 text-destructive border-destructive/30")
                }>{s.status}</span>
              </div>
            ))}
            <div className="pt-2 border-t text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCcw className="h-3 w-3" /> Last successful sync: {timeAgo(lastSync)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Failures by integration</CardTitle><CardDescription>Rejected records at last sync.</CardDescription></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={errorsBySource}>
                <CartesianGrid stroke="oklch(0.9 0.01 250)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 250)" }} />
                <Bar dataKey="errors" fill="oklch(0.68 0.17 45)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent platform activity</CardTitle><CardDescription>Latest ingestion, sync and automation events.</CardDescription></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {data.jobs.slice(0, 8).map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(j.created_at)}</td>
                      <td className="px-4 py-2 text-xs capitalize">{j.kind}</td>
                      <td className="px-4 py-2 text-xs">{j.source_name}</td>
                      <td className="px-4 py-2 text-xs text-right text-success">+{j.records_valid}</td>
                      <td className="px-4 py-2 text-xs text-right text-destructive">-{j.records_invalid}</td>
                    </tr>
                  ))}
                  {data.jobs.length === 0 && <tr><td className="py-6 text-center text-muted-foreground text-sm">No activity yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <ArchitecturePanel />
    </PageShell>
  );
}

export function PageShell({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: string; accent?: "success" | "warning";
}) {
  const color = accent === "success" ? "text-success" : accent === "warning" ? "text-orange" : "text-navy";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <Icon className={"h-4 w-4 " + color} /> {label}
        </div>
        <div className={"mt-2 text-2xl font-semibold " + color}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

const DEMO_STEPS = [
  { to: "/integrations", label: "Integrations", desc: "Inspect simulated SIS/CRM/marketing connections, then upload a sample CSV." },
  { to: "/data-model", label: "Data Model → Data Quality", desc: "Browse canonical entities, then scan for duplicates and merge two records." },
  { to: "/pipelines", label: "Pipelines", desc: "See ingestion stages and open a run to trace records through the pipeline." },
  { to: "/automation", label: "Automation", desc: "Edit the workflow rule, save it, then test against sample applicants." },
  { to: "/insights", label: "Insights", desc: "Review completeness, reliability and workflow outcome dashboards." },
  { to: "/developer", label: "Developer & Governance → Audit", desc: "Confirm every action above is recorded in the trust ledger." },
] as const;

function GuidedDemoPanel() {
  return (
    <Card className="border-navy/20 bg-navy/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-navy grid place-items-center text-navy-foreground">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">Guided demo</CardTitle>
            <CardDescription>Recommended walkthrough — follow the numbered order across the seven platform areas.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.to}>
              <Link
                to={s.to}
                className="group flex items-start gap-3 rounded-md border bg-background p-3 hover:border-orange/50 hover:bg-orange/5 transition-colors"
              >
                <span className="h-6 w-6 shrink-0 rounded-full bg-orange text-orange-foreground text-xs font-semibold grid place-items-center">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy flex items-center gap-1">
                    {s.label}
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </div>
              </Link>
            </li>
          ))}
          <li>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-md border border-navy/30 bg-navy/5 p-3 hover:border-navy/60 hover:bg-navy/10 transition-colors h-full"
            >
              <span className="h-6 w-6 shrink-0 rounded-full bg-navy text-navy-foreground text-xs font-semibold grid place-items-center">{DEMO_STEPS.length + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-navy flex items-center gap-1">
                  View source on GitHub
                  <Github className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Inspect the file structure, schema migrations and platform code behind the prototype.
                </div>
              </div>
            </a>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}

function ArchitecturePanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-navy" /> Platform architecture</CardTitle>
        <CardDescription>CampusContext is the core data & integrations layer between source systems and downstream applications.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        <ArchColumn
          title="Source Systems"
          items={[
            { icon: Server, label: "SIS" },
            { icon: Database, label: "Existing CRM" },
            { icon: Boxes, label: "LMS" },
            { icon: PlugZap, label: "Marketing & partner systems" },
          ]}
        />
        <ArchColumn
          title="Core Platform"
          highlight
          items={[
            { icon: Boxes, label: "Data model", to: "/data-model" },
            { icon: PlugZap, label: "Integrations", to: "/integrations" },
            { icon: Workflow, label: "Pipelines", to: "/pipelines" },
            { icon: CheckCircle2, label: "Data quality", to: "/data-model" },
            { icon: Cog, label: "Automation", to: "/automation" },
            { icon: LineIcon, label: "APIs & Insights", to: "/insights" },
            { icon: Wrench, label: "Governance", to: "/developer" },
          ]}
        />
        <ArchColumn
          title="Powered Applications"
          items={[
            { icon: Sparkles, label: "AI CRM (reference)" },
            { icon: Sparkles, label: "Agent Workspace", to: "/assistant", badge: "Try demo" },
          ]}
          footer="Downstream applications consume canonical entities and governed context from the platform. The Admissions Assistant is a simulated agent workspace demonstrating this consumption."
        />
      </CardContent>
    </Card>
  );
}

function ArchColumn({ title, items, highlight, footer }: {
  title: string;
  items: { icon: React.ComponentType<{ className?: string }>; label: string; to?: string; badge?: string }[];
  highlight?: boolean;
  footer?: string;
}) {
  return (
    <div className={"rounded-md border p-4 " + (highlight ? "border-navy/40 bg-navy/[0.04]" : "bg-background")}>
      <div className={"text-xs uppercase tracking-wide font-semibold mb-3 " + (highlight ? "text-navy" : "text-muted-foreground")}>{title}</div>
      <ul className="space-y-1.5 text-sm">
        {items.map((it) => {
          const inner = (
            <span className="flex items-center gap-2">
              <it.icon className="h-4 w-4 text-navy/70" />
              <span>{it.label}</span>
              {it.badge && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-orange/40 bg-orange/10 text-orange font-semibold">{it.badge}</span>}
            </span>
          );
          return (
            <li key={it.label}>
              {it.to ? (
                <Link to={it.to} className="block rounded px-2 py-1.5 hover:bg-navy/5 transition-colors">{inner}</Link>
              ) : (
                <div className="px-2 py-1.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {footer && <p className="mt-3 text-xs text-muted-foreground">{footer}</p>}
    </div>
  );
}
