import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { timeAgo } from "@/lib/campus";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit Log — CampusContext" }, { name: "description", content: "Every import, sync, merge, workflow run and agent action recorded for trust and compliance." }] }),
  component: Audit,
});

const ACTION_COLORS: Record<string, string> = {
  "csv.import": "bg-navy/10 text-navy border-navy/30",
  "sync.completed": "bg-success/15 text-success border-success/30",
  "sync.degraded": "bg-warning/15 text-warning-foreground border-warning/40",
  "duplicate.merged": "bg-orange/15 text-orange border-orange/30",
  "workflow.executed": "bg-blue-500/15 text-blue-700 border-blue-500/30",
  "workflow.activated": "bg-success/15 text-success border-success/30",
  "workflow.deactivated": "bg-muted text-muted-foreground border-border",
  "assistant.tool_used": "bg-purple-500/15 text-purple-700 border-purple-500/30",
  "assistant.action_approved": "bg-orange/15 text-orange border-orange/30",
  "quality.scan": "bg-navy/10 text-navy border-navy/30",
};

function Audit() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((e) =>
      [e.action, e.actor, e.affected_record, e.source, e.result].some((v) => (v ?? "").toString().toLowerCase().includes(s))
    );
  }, [data, q]);

  return (
    <PageShell title="Audit Log" subtitle="A trust ledger of every action across the platform — imports, syncs, merges, workflows and agent activity.">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>{filtered.length} events shown</CardDescription>
          </div>
          <Input placeholder="Filter by action, actor, record…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 w-36">Timestamp</th>
                  <th className="text-left px-4 py-2">Actor</th>
                  <th className="text-left px-4 py-2">Action</th>
                  <th className="text-left px-4 py-2">Affected record</th>
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No events.</td></tr>}
                {filtered.map((e) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(e.created_at)}</td>
                    <td className="px-4 py-2 text-xs">{e.actor ?? "system"}</td>
                    <td className="px-4 py-2">
                      <span className={"text-xs px-2 py-0.5 rounded-full border " + (ACTION_COLORS[e.action] ?? "bg-muted text-muted-foreground border-border")}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{e.affected_record ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.source ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.result ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
