import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Play, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { logAudit, timeAgo } from "@/lib/campus";

export const Route = createFileRoute("/_authenticated/workflows")({
  head: () => ({ meta: [{ title: "Workflows — CampusContext" }, { name: "description", content: "Simple rule builder for admissions automation with test-run and execution history." }] }),
  component: Workflows,
});

function Workflows() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const [rules, execs, apps] = await Promise.all([
        supabase.from("workflow_rules").select("*").order("created_at"),
        supabase.from("workflow_executions").select("*, workflow_rules(name), applicants(first_name,last_name,application_id)").order("created_at", { ascending: false }).limit(50),
        supabase.from("applicants").select("*").is("merged_into", null),
      ]);
      return { rules: rules.data ?? [], execs: execs.data ?? [], apps: apps.data ?? [] };
    },
  });

  async function toggleRule(id: string, active: boolean) {
    await supabase.from("workflow_rules").update({ active }).eq("id", id);
    await logAudit({ action: active ? "workflow.activated" : "workflow.deactivated", affected_record: id });
    await qc.invalidateQueries();
  }

  async function testRule(ruleId: string) {
    const rule = data?.rules.find((r) => r.id === ruleId);
    if (!rule || !data) return;
    const matches = data.apps.filter((a) =>
      a.application_status === "Incomplete" && (a.missing_documents ?? []).length > 0);
    const inserts = matches.slice(0, 10).map((a) => ({
      rule_id: ruleId, applicant_id: a.id,
      action_taken: "Document Follow-Up assigned",
      result: `Notified admissions counselor about ${a.first_name} ${a.last_name}`,
    }));
    if (inserts.length) await supabase.from("workflow_executions").insert(inserts);
    await logAudit({ action: "workflow.executed", affected_record: rule.name, result: `${inserts.length} applicants matched` });
    await qc.invalidateQueries();
    toast.success(`Rule matched ${matches.length} applicants; ${inserts.length} tasks created`);
  }

  return (
    <PageShell title="Workflow Automation" subtitle="Automate follow-ups when applicants need attention.">
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.rules.map((rule) => (
          <Card key={rule.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-navy grid place-items-center text-navy-foreground">
                  <GitBranch className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{rule.name}</CardTitle>
                  <CardDescription>{rule.description}</CardDescription>
                </div>
                <Switch checked={rule.active} onCheckedChange={(v) => toggleRule(rule.id, v)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm font-mono">
                <div><span className="text-orange font-semibold">WHEN</span> application_status = "Incomplete"</div>
                <div className="pl-10"><span className="text-orange font-semibold">AND</span> missing_documents is not empty</div>
                <div><span className="text-orange font-semibold">THEN</span> assign "Document Follow-Up"</div>
                <div className="pl-10"><span className="text-orange font-semibold">AND</span> notify admissions counselor</div>
              </div>
              <Button variant="outline" onClick={() => testRule(rule.id)} disabled={!rule.active}>
                <Play className="h-4 w-4 mr-2" /> Test against sample records
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Execution history</CardTitle><CardDescription>Most recent workflow runs.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Rule</th>
                  <th className="text-left px-4 py-2">Applicant</th>
                  <th className="text-left px-4 py-2">Action</th>
                  <th className="text-left px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {(data?.execs ?? []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No executions yet — hit "Test against sample records".</td></tr>}
                {data?.execs.map((e) => {
                  const rule = (e as never as { workflow_rules?: { name: string } }).workflow_rules;
                  const app = (e as never as { applicants?: { first_name: string; last_name: string; application_id: string } }).applicants;
                  return (
                    <tr key={e.id} className="border-t">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{timeAgo(e.created_at)}</td>
                      <td className="px-4 py-2">{rule?.name ?? "—"}</td>
                      <td className="px-4 py-2">{app ? `${app.first_name} ${app.last_name}` : "—"} <span className="text-xs text-muted-foreground font-mono">{app?.application_id ?? ""}</span></td>
                      <td className="px-4 py-2">{e.action_taken}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.result}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
