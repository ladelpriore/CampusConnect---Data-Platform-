import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "./dashboard";
import { Database, RefreshCcw, ChevronRight, Server, Megaphone, Info } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { timeAgo, logAudit } from "@/lib/campus";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({ meta: [{ title: "Data Sources — CampusContext" }, { name: "description", content: "SIS, CRM and marketing integrations feeding the CampusContext platform." }] }),
  component: Sources,
});

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sis: Server, crm: Database, marketing: Megaphone,
};

function Sources() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data: sources } = useQuery({
    queryKey: ["sources"],
    queryFn: async () => (await supabase.from("data_sources").select("*").order("name")).data ?? [],
  });
  const { data: jobs } = useQuery({
    queryKey: ["source-jobs"],
    queryFn: async () => (await supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  async function runSync(id: string, name: string) {
    setSyncing(id);
    const src = sources?.find((s) => s.id === id);
    const processed = 50 + Math.floor(Math.random() * 200);
    const failed = Math.floor(Math.random() * 5);
    await supabase.from("import_jobs").insert({
      source_id: id, source_name: name, kind: "sync", status: "completed",
      records_total: processed, records_valid: processed - failed, records_invalid: failed,
    });
    await supabase.from("data_sources").update({
      last_sync_at: new Date().toISOString(),
      records_processed: (src?.records_processed ?? 0) + processed,
      failed_records: (src?.failed_records ?? 0) + failed,
      status: "connected",
    }).eq("id", id);
    await logAudit({ action: "sync.completed", affected_record: name, source: src?.kind, result: `${processed} records, ${failed} failed` });
    await qc.invalidateQueries();
    setSyncing(null);
    toast.success(`${name}: ${processed} records synced`);
  }

  const detailSource = sources?.find((s) => s.id === detail);
  const detailJobs = jobs?.filter((j) => j.source_id === detail) ?? [];

  return (
    <PageShell title="Data Sources" subtitle="Manage integrations that feed CampusContext.">
      <Card className="border-dashed border-orange/40 bg-orange/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <Info className="h-4 w-4 text-orange mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-navy">Demo simulations</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              The integrations below and their "Run sync" results are simulated for prototype purposes. No external SIS, CRM, or marketing platform is contacted; sync outcomes are generated locally and recorded to the audit log.
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sources?.map((s) => {
          const Icon = ICONS[s.kind] ?? Database;
          return (
            <Card key={s.id} className="hover:shadow-sm transition">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-navy grid place-items-center text-navy-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <div className="text-xs text-muted-foreground capitalize">{s.kind}</div>
                  </div>
                  <span className={
                    "text-xs px-2 py-0.5 rounded-full border " +
                    (s.status === "connected" ? "bg-success/15 text-success border-success/30"
                      : s.status === "degraded" ? "bg-warning/15 text-warning-foreground border-warning/40"
                      : "bg-destructive/15 text-destructive border-destructive/30")
                  }>{s.status}</span>
                </div>
                <div className="mt-2">
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-orange/30 bg-orange/10 text-orange font-semibold">Demo simulation</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Last sync" value={timeAgo(s.last_sync_at)} />
                <Row label="Records processed" value={(s.records_processed ?? 0).toLocaleString()} />
                <Row label="Failed" value={String(s.failed_records ?? 0)} />
                <Row label="Frequency" value={s.sync_frequency} />
                <div className="pt-3 flex gap-2">
                  <Button size="sm" disabled={syncing === s.id} onClick={() => runSync(s.id, s.name)} className="bg-navy text-navy-foreground hover:bg-navy-muted">
                    <RefreshCcw className={"h-3.5 w-3.5 mr-1.5 " + (syncing === s.id ? "animate-spin" : "")} />
                    {syncing === s.id ? "Syncing…" : "Run sync"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDetail(s.id)}>
                    View details <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detailSource?.name} — recent jobs</DialogTitle></DialogHeader>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Kind</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Valid</th>
                  <th className="text-right px-3 py-2">Invalid</th>
                </tr>
              </thead>
              <tbody>
                {detailJobs.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No jobs recorded yet.</td></tr>}
                {detailJobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="px-3 py-2">{timeAgo(j.created_at)}</td>
                    <td className="px-3 py-2 capitalize">{j.kind}</td>
                    <td className="px-3 py-2 text-right">{j.records_total}</td>
                    <td className="px-3 py-2 text-right text-success">{j.records_valid}</td>
                    <td className="px-3 py-2 text-right text-destructive">{j.records_invalid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
