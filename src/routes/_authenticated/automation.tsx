import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Workflows } from "./workflows";
import { timeAgo } from "@/lib/campus";

export const Route = createFileRoute("/_authenticated/automation")({
  head: () => ({
    meta: [
      { title: "Automation — CampusContext" },
      { name: "description", content: "Workflow rules, triggers, actions and execution history consuming canonical platform data." },
    ],
  }),
  component: AutomationPage,
});

function AutomationPage() {
  return (
    <PageShell title="Automation" subtitle="Rules consume canonical platform data and can trigger internal actions, API calls or webhooks.">
      <Tabs defaultValue="workflows">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="triggers">Triggers & Actions</TabsTrigger>
          <TabsTrigger value="executions">Execution History</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-4"><div className="-mx-6 lg:-mx-8 -mb-6 lg:-mb-8"><Workflows /></div></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
        <TabsContent value="triggers" className="mt-4"><TriggersTab /></TabsContent>
        <TabsContent value="executions" className="mt-4"><ExecutionsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function RulesTab() {
  const { data } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: async () => {
      const [rules, execs] = await Promise.all([
        supabase.from("workflow_rules").select("*").order("created_at"),
        supabase.from("workflow_executions").select("*"),
      ]);
      return { rules: rules.data ?? [], execs: execs.data ?? [] };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Rules registry</CardTitle><CardDescription>All configured rules with trigger, conditions, actions and health.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Rule</th>
              <th className="text-left px-4 py-2">Trigger</th>
              <th className="text-left px-4 py-2">Conditions</th>
              <th className="text-left px-4 py-2">Actions</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Executions</th>
              <th className="text-left px-4 py-2">Last run</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rules ?? []).map((r) => {
              const runs = (data?.execs ?? []).filter((e) => e.rule_id === r.id);
              const cond = (r.condition ?? {}) as { status?: string; missing_documents_not_empty?: boolean };
              const act = (r.action ?? {}) as { assign?: string; notify?: string };
              const last = runs[0];
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-2 font-medium">{r.name}<div className="text-xs text-muted-foreground font-normal">{r.description}</div></td>
                  <td className="px-4 py-2 text-xs">applicant.updated</td>
                  <td className="px-4 py-2 text-xs">
                    status = {cond.status ?? "Any"}
                    {cond.missing_documents_not_empty && <> · missing_docs</>}
                  </td>
                  <td className="px-4 py-2 text-xs">assign "{act.assign ?? "—"}" · notify {act.notify ?? "—"}</td>
                  <td className="px-4 py-2"><span className={"text-xs px-2 py-0.5 rounded-full border " + (r.active ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border")}>{r.active ? "active" : "inactive"}</span></td>
                  <td className="px-4 py-2 text-right">{runs.length}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{last ? timeAgo(last.created_at) : "never"}</td>
                </tr>
              );
            })}
            {(data?.rules ?? []).length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">No rules configured.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TriggersTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Available triggers</CardTitle><CardDescription>Events the platform can fire rules on.</CardDescription></CardHeader>
        <CardContent><ul className="text-sm space-y-1 font-mono">
          <li>• applicant.upserted</li>
          <li>• applicant.merged</li>
          <li>• applicant.status_changed</li>
          <li>• import_job.completed</li>
          <li>• quality.snapshot.recorded</li>
          <li>• schedule.daily</li>
        </ul></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Available actions</CardTitle><CardDescription>What a rule can do when it matches.</CardDescription></CardHeader>
        <CardContent><ul className="text-sm space-y-1">
          <li>• Assign task to admissions counselor</li>
          <li>• Notify a recipient (email, in-app)</li>
          <li>• Update applicant status</li>
          <li>• Call reference REST endpoint</li>
          <li>• Emit outbound webhook</li>
          <li>• Route to agent workspace for human-in-the-loop review</li>
        </ul></CardContent>
      </Card>
    </div>
  );
}

function ExecutionsTab() {
  const { data } = useQuery({
    queryKey: ["automation-execs"],
    queryFn: async () => (await supabase.from("workflow_executions").select("*, workflow_rules(name), applicants(first_name,last_name,application_id)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle>Execution history</CardTitle><CardDescription>Complete firing record for the automation engine.</CardDescription></CardHeader>
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
              {(data ?? []).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">No executions yet.</td></tr>}
              {(data ?? []).map((e) => {
                const r = (e as never as { workflow_rules?: { name: string } }).workflow_rules;
                const app = (e as never as { applicants?: { first_name: string; last_name: string; application_id: string } }).applicants;
                return (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{timeAgo(e.created_at)}</td>
                    <td className="px-4 py-2">{r?.name ?? "—"}</td>
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
  );
}
