import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Activity, CheckCircle2, AlertTriangle, Users, Database, RefreshCcw, GitBranch, ChevronRight, MapPin,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { timeAgo, isValidEmail } from "@/lib/campus";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Overview — CampusContext" }, { name: "description", content: "Operational overview of connected data sources, applicant records, data quality and workflow health." }] }),
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
        supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("duplicate_matches").select("*").eq("resolved", false),
        supabase.from("workflow_executions").select("*"),
        supabase.from("import_jobs").select("created_at,records_total,records_valid,records_invalid,kind").gte("created_at", sinceIso),
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

  const apps = data.applicants;
  const totalFields = ["application_id", "first_name", "last_name", "email", "application_status", "enrollment_term"];
  let completeCount = 0;
  let filled = 0, tot = apps.length * totalFields.length;
  let failedRecords = 0;
  apps.forEach((a) => {
    const missing = totalFields.some((f) => !(a as never as Record<string, unknown>)[f]);
    if (!missing) completeCount++;
    totalFields.forEach((f) => { if ((a as never as Record<string, unknown>)[f]) filled++; });
    if (!isValidEmail(a.email)) failedRecords++;
    if (!a.application_id) failedRecords++;
  });
  const completeness = tot ? Math.round((filled / tot) * 100) : 0;
  const totalProcessed = data.sources.reduce((s, x) => s + (x.records_processed ?? 0), 0);
  const totalFailed = data.sources.reduce((s, x) => s + (x.failed_records ?? 0), 0);
  const lastSync = data.sources.reduce<string | null>((acc, s) => {
    if (!s.last_sync_at) return acc;
    if (!acc || new Date(s.last_sync_at) > new Date(acc)) return s.last_sync_at;
    return acc;
  }, null);

  const statusCounts = new Map<string, number>();
  apps.forEach((a) => statusCounts.set(a.application_status ?? "Unknown", (statusCounts.get(a.application_status ?? "Unknown") ?? 0) + 1));
  const statusData = Array.from(statusCounts, ([name, value]) => ({ name, value }));

  const errorsBySource = data.sources.map((s) => ({ name: s.name, errors: s.failed_records ?? 0 }));

  // Records processed over time — aggregated from real import_jobs (imports + syncs) over the last 7 days.
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
  const trend = dayBuckets;
  const hasTrendData = trend.some((t) => t.records > 0);

  const COLORS = ["oklch(0.24 0.06 265)", "oklch(0.68 0.17 45)", "oklch(0.62 0.14 200)", "oklch(0.62 0.14 155)", "oklch(0.55 0.15 300)", "oklch(0.5 0.02 260)"];

  return (
    <PageShell
      title="Overview"
      subtitle="Operational health of your admissions data platform."
    >
      <GuidedDemoPanel />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Database} label="Connected sources" value={data.sources.filter((s) => s.status === "connected").length} sub={`of ${data.sources.length} configured`} />
        <Kpi icon={Users} label="Records synchronized" value={totalProcessed.toLocaleString()} sub={`${apps.length} trusted profiles`} />
        <Kpi icon={CheckCircle2} label="Data completeness" value={`${completeness}%`} sub={`${completeCount} complete profiles`} accent="success" />
        <Kpi icon={AlertTriangle} label="Failed records" value={totalFailed + failedRecords} sub={`${data.duplicates.length} duplicates open`} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Records processed (last 7 days)</CardTitle>
            <CardDescription>Aggregated from real import jobs and synchronization runs (last 7 days).</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {hasTrendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
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
                  <div className="font-medium text-navy">No processing activity yet</div>
                  <div className="mt-1 max-w-xs">Trigger a sync on <span className="text-navy">Data Sources</span> or upload a CSV on <span className="text-navy">Import &amp; Mapping</span> to populate this chart from real jobs.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Application status</CardTitle><CardDescription>Trusted profiles by stage.</CardDescription></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto text-muted-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Errors by source</CardTitle><CardDescription>Failed records at last synchronization.</CardDescription></CardHeader>
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
          <CardHeader><CardTitle>Integration health</CardTitle></CardHeader>
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
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" /> {data.workflows.length} workflow executions on record
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> {data.jobs.length} recent import jobs
            </div>
          </CardContent>
        </Card>
      </div>
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
  { to: "/sources", label: "Data Sources", desc: "See the simulated SIS/CRM/marketing integrations feeding the platform." },
  { to: "/import", label: "Import & Mapping", desc: "Download the sample CSV, upload it, and map columns to canonical fields." },
  { to: "/quality", label: "Data Quality", desc: "Scan for duplicates and merge two records into one trusted profile." },
  { to: "/workflows", label: "Workflows", desc: "Edit the rule, save it, then test it against sample applicants." },
  { to: "/assistant", label: "Admissions Assistant", desc: "Ask about a specific applicant and approve an escalation." },
  { to: "/audit", label: "Audit Log", desc: "Confirm every action above was written to the trust ledger." },
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
            <CardDescription>Recommended walkthrough for reviewers — follow the numbered order.</CardDescription>
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
        </ol>
      </CardContent>
    </Card>
  );
}
