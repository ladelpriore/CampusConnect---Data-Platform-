import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights — CampusContext" },
      { name: "description", content: "Platform outcome dashboards: quality, integration reliability, pipeline performance and workflow effectiveness." },
    ],
  }),
  component: InsightsPage,
});

const COLORS = ["oklch(0.24 0.06 265)", "oklch(0.68 0.17 45)", "oklch(0.62 0.14 200)", "oklch(0.62 0.14 155)", "oklch(0.55 0.15 300)"];

function InsightsPage() {
  const { data } = useQuery({
    queryKey: ["insights"],
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [apps, sources, jobs, execs] = await Promise.all([
        supabase.from("applicants").select("*").is("merged_into", null),
        supabase.from("data_sources").select("*"),
        supabase.from("import_jobs").select("*").gte("created_at", sinceIso).order("created_at"),
        supabase.from("workflow_executions").select("*").order("created_at"),
      ]);
      return { apps: apps.data ?? [], sources: sources.data ?? [], jobs: jobs.data ?? [], execs: execs.data ?? [] };
    },
  });

  if (!data) return <PageShell title="Insights"><div className="text-sm text-muted-foreground">Loading…</div></PageShell>;

  // Completeness by source
  const totalFields = ["application_id", "first_name", "last_name", "email", "application_status", "enrollment_term"];
  const completenessBySource = Array.from(
    data.apps.reduce((m, a) => {
      const key = a.source ?? "Unknown";
      const bucket = m.get(key) ?? { source: key, filled: 0, total: 0 };
      totalFields.forEach((f) => {
        bucket.total++;
        if ((a as never as Record<string, unknown>)[f]) bucket.filled++;
      });
      m.set(key, bucket);
      return m;
    }, new Map<string, { source: string; filled: number; total: number }>()).values(),
  ).map((b) => ({ source: b.source, completeness: b.total ? Math.round((b.filled / b.total) * 100) : 0 }));

  const failedBySource = data.sources.map((s) => ({ name: s.name, failed: s.failed_records ?? 0 }));

  // Pipeline success trend (last 30d by day)
  const dayMap = new Map<string, { day: string; total: number; success: number }>();
  data.jobs.forEach((j) => {
    const key = new Date(j.created_at).toISOString().slice(0, 10);
    const b = dayMap.get(key) ?? { day: key.slice(5), total: 0, success: 0 };
    b.total++;
    if ((j.records_invalid ?? 0) === 0) b.success++;
    dayMap.set(key, b);
  });
  const successTrend = Array.from(dayMap.values()).map((d) => ({ day: d.day, rate: d.total ? Math.round((d.success / d.total) * 100) : 0 }));

  // Workflow outcomes
  const outcomeMap = new Map<string, number>();
  data.execs.forEach((e) => outcomeMap.set(e.action_taken, (outcomeMap.get(e.action_taken) ?? 0) + 1));
  const workflowOutcomes = Array.from(outcomeMap, ([name, value]) => ({ name, value }));

  // Records processed by source
  const processedBySource = data.sources.map((s) => ({ name: s.name, records: s.records_processed ?? 0 }));

  return (
    <PageShell title="Insights" subtitle="Deeper dashboards on platform outcomes — quality, reliability, throughput and automation.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Completeness by source</CardTitle><CardDescription>Average field completeness of applicants grouped by origin system.</CardDescription></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completenessBySource}>
                <CartesianGrid stroke="oklch(0.9 0.01 250)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="source" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="completeness" fill="oklch(0.24 0.06 265)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Failed records by integration</CardTitle><CardDescription>Cumulative rejections at last synchronization.</CardDescription></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={failedBySource}>
                <CartesianGrid stroke="oklch(0.9 0.01 250)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="failed" fill="oklch(0.68 0.17 45)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pipeline success trend (30d)</CardTitle><CardDescription>Percentage of runs completing with zero rejected records.</CardDescription></CardHeader>
          <CardContent className="h-64">
            {successTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={successTrend}>
                  <CartesianGrid stroke="oklch(0.9 0.01 250)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="rate" stroke="oklch(0.62 0.14 155)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No pipeline runs in the last 30 days.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Workflow outcomes</CardTitle><CardDescription>Distribution of actions taken by automation.</CardDescription></CardHeader>
          <CardContent className="h-64">
            {workflowOutcomes.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={workflowOutcomes} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {workflowOutcomes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No workflow executions yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Records processed by source</CardTitle><CardDescription>Cumulative volume across integrations.</CardDescription></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedBySource} layout="vertical">
              <CartesianGrid stroke="oklch(0.9 0.01 250)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" fontSize={12} width={120} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="records" fill="oklch(0.24 0.06 265)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </PageShell>
  );
}
