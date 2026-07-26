import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { timeAgo } from "@/lib/campus";
import { ArrowRight, Info } from "lucide-react";

const STAGES = ["Extract", "Stage", "Validate", "Transform", "Match / Deduplicate", "Load Canonical", "Publish"];

export const Route = createFileRoute("/_authenticated/pipelines")({
  head: () => ({
    meta: [
      { title: "Pipelines — CampusContext" },
      { name: "description", content: "ETL/ELT pipeline definitions, runs and stage-level record counts for the CampusContext platform." },
    ],
  }),
  component: PipelinesPage,
});

type Job = {
  id: string; source_id: string | null; source_name: string | null; kind: string;
  status: string; records_total: number; records_valid: number; records_invalid: number;
  created_at: string;
};

function PipelinesPage() {
  const { data } = useQuery({
    queryKey: ["pipelines"],
    queryFn: async () => {
      const [sources, jobs] = await Promise.all([
        supabase.from("data_sources").select("*").order("name"),
        supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      return { sources: sources.data ?? [], jobs: (jobs.data ?? []) as Job[] };
    },
  });
  const [runId, setRunId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const openRun = (j: Job) => { setSelectedJob(j); setRunId(j.id); };

  const definitions = (data?.sources ?? []).map((s) => {
    const runs = (data?.jobs ?? []).filter((j) => j.source_id === s.id);
    const success = runs.filter((r) => r.records_invalid === 0).length;
    const total = runs.length;
    const last = runs[0];
    const successRate = total ? Math.round((success / total) * 100) : null;
    return { source: s, runs, total, successRate, last };
  });

  return (
    <PageShell title="Pipelines" subtitle="Ingestion pipelines running the Extract → Publish flow for each connected source.">
      <Card className="border-dashed border-orange/40 bg-orange/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <Info className="h-4 w-4 text-orange mt-0.5 shrink-0" />
          <div className="text-muted-foreground text-xs">
            Stage-level counts on run detail are derived from real <span className="font-mono">import_jobs</span> totals; intermediate stages are simulated for the prototype.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Standard ingestion flow</CardTitle><CardDescription>All pipelines follow this sequence.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded border bg-navy/5 text-navy text-xs font-medium">{s}</div>
                {i < STAGES.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pipeline definitions</CardTitle><CardDescription>One pipeline per configured integration.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Pipeline</th>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-right px-4 py-2">Runs</th>
                <th className="text-right px-4 py-2">Success rate</th>
                <th className="text-left px-4 py-2">Last run</th>
                <th className="text-left px-4 py-2">Watermark</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((d) => (
                <tr key={d.source.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{d.source.name} pipeline</td>
                  <td className="px-4 py-2 text-xs uppercase text-muted-foreground">{d.source.kind}</td>
                  <td className="px-4 py-2 text-right">{d.total}</td>
                  <td className="px-4 py-2 text-right">{d.successRate === null ? "—" : `${d.successRate}%`}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{d.last ? timeAgo(d.last.created_at) : "never"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{d.source.last_sync_at ? timeAgo(d.source.last_sync_at) : "—"}</td>
                </tr>
              ))}
              {definitions.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No pipelines defined.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle><CardDescription>Click any row to inspect stage-level record flow.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Kind</th>
                  <th className="text-right px-4 py-2">Input</th>
                  <th className="text-right px-4 py-2">Valid</th>
                  <th className="text-right px-4 py-2">Rejected</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.jobs ?? []).map((j) => (
                  <tr key={j.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => openRun(j)}>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{timeAgo(j.created_at)}</td>
                    <td className="px-4 py-2 text-xs">{j.source_name}</td>
                    <td className="px-4 py-2 text-xs capitalize">{j.kind}</td>
                    <td className="px-4 py-2 text-xs text-right">{j.records_total}</td>
                    <td className="px-4 py-2 text-xs text-right text-success">{j.records_valid}</td>
                    <td className="px-4 py-2 text-xs text-right text-destructive">{j.records_invalid}</td>
                    <td className="px-4 py-2 text-xs">{j.status}</td>
                    <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost">Inspect</Button></td>
                  </tr>
                ))}
                {(data?.jobs ?? []).length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No pipeline runs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <RunDetail job={selectedJob} runId={runId} onClose={() => setRunId(null)} />
    </PageShell>
  );
}

function RunDetail({ job, runId, onClose }: { job: Job | null; runId: string | null; onClose: () => void }) {
  const { data: errors } = useQuery({
    queryKey: ["pipeline-errors", runId],
    enabled: !!runId,
    queryFn: async () => (await supabase.from("validation_errors").select("*").eq("import_job_id", runId!)).data ?? [],
  });
  const { data: audits } = useQuery({
    queryKey: ["pipeline-audit", runId],
    enabled: !!runId,
    queryFn: async () => (await supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  if (!job) return null;
  const total = job.records_total ?? 0;
  const invalid = job.records_invalid ?? 0;
  const valid = job.records_valid ?? 0;
  const stageCounts = [
    { stage: "Extract", count: total, note: "read from source" },
    { stage: "Stage", count: total, note: "landed in staging" },
    { stage: "Validate", count: total, note: `${invalid} rejected` },
    { stage: "Transform", count: valid, note: "canonical mapping applied" },
    { stage: "Match / Deduplicate", count: valid, note: "duplicate detection" },
    { stage: "Load Canonical", count: valid, note: "upserted into applicants" },
    { stage: "Publish", count: valid, note: "available to downstream consumers" },
  ];

  return (
    <Dialog open={!!runId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pipeline run — {job.source_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="text-xs text-muted-foreground">
            {timeAgo(job.created_at)} · {job.kind} · status {job.status}
          </div>
          <div className="rounded border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left px-3 py-2">Stage</th><th className="text-right px-3 py-2">Records</th><th className="text-left px-3 py-2">Note</th></tr>
              </thead>
              <tbody>
                {stageCounts.map((s) => (
                  <tr key={s.stage} className="border-t">
                    <td className="px-3 py-2 font-medium">{s.stage}</td>
                    <td className="px-3 py-2 text-right">{s.count}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1.5">Validation failures ({(errors ?? []).length})</div>
            <div className="rounded border overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5">Row</th><th className="text-left px-3 py-1.5">Field</th>
                    <th className="text-left px-3 py-1.5">Kind</th><th className="text-left px-3 py-1.5">Message</th><th className="text-left px-3 py-1.5">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(errors ?? []).length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No validation failures recorded for this run.</td></tr>}
                  {(errors ?? []).map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-3 py-1.5">{e.row_number ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{e.field ?? "—"}</td>
                      <td className="px-3 py-1.5">{e.kind}</td>
                      <td className="px-3 py-1.5">{e.message}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.submitted_value ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1.5">Related audit events (most recent)</div>
            <ul className="text-xs space-y-1 max-h-40 overflow-auto">
              {(audits ?? []).slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">{timeAgo(a.created_at)}</span>
                  <span className="font-mono">{a.action}</span>
                  <span className="text-muted-foreground truncate">{a.result ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
