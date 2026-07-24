import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Play, GitBranch, Save, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { logAudit, timeAgo } from "@/lib/campus";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/workflows")({
  head: () => ({ meta: [{ title: "Workflows — CampusContext" }, { name: "description", content: "Simple rule builder for admissions automation with test-run and execution history." }] }),
  component: Workflows,
});

type RuleCondition = { status?: string | null; missing_documents_not_empty?: boolean };
type RuleAction = { assign?: string; notify?: string };
type Rule = {
  id: string; name: string; description: string | null; active: boolean;
  condition: RuleCondition; action: RuleAction; created_at: string;
};

const STATUS_OPTIONS = ["Any", "Incomplete", "Submitted", "Admitted", "Waitlisted", "Denied"];
const NOTIFY_OPTIONS = [
  { value: "admissions_counselor", label: "Admissions counselor" },
  { value: "student_email", label: "Student (email)" },
  { value: "financial_aid", label: "Financial aid office" },
  { value: "none", label: "No notification" },
];

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
      return { rules: (rules.data ?? []) as unknown as Rule[], execs: execs.data ?? [], apps: apps.data ?? [] };
    },
  });

  async function toggleRule(id: string, active: boolean) {
    await supabase.from("workflow_rules").update({ active }).eq("id", id);
    await logAudit({ action: active ? "workflow.activated" : "workflow.deactivated", affected_record: id });
    await qc.invalidateQueries();
  }

  async function testRule(rule: Rule) {
    if (!data) return;
    const cond = rule.condition ?? {};
    const matches = data.apps.filter((a) => {
      const statusOk = !cond.status || cond.status === "Any" || a.application_status === cond.status;
      const missingOk = !cond.missing_documents_not_empty || (a.missing_documents ?? []).length > 0;
      return statusOk && missingOk;
    });
    const assign = rule.action?.assign || "Task";
    const notify = rule.action?.notify || "none";
    const notifyLabel = NOTIFY_OPTIONS.find((n) => n.value === notify)?.label ?? notify;
    const inserts = matches.slice(0, 10).map((a) => ({
      rule_id: rule.id, applicant_id: a.id,
      action_taken: `${assign} assigned`,
      result: notify === "none"
        ? `${assign} assigned for ${a.first_name} ${a.last_name}`
        : `${notifyLabel} notified about ${a.first_name} ${a.last_name}`,
    }));
    if (inserts.length) await supabase.from("workflow_executions").insert(inserts);
    await logAudit({ action: "workflow.executed", affected_record: rule.name, result: `${inserts.length} applicants matched (of ${matches.length})` });
    await qc.invalidateQueries();
    toast.success(`Rule matched ${matches.length} applicants; ${inserts.length} tasks created`);
  }

  return (
    <PageShell title="Workflow Automation" subtitle="Automate follow-ups when applicants need attention.">
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onToggle={(v) => toggleRule(rule.id, v)}
            onTest={() => testRule(rule)}
            onSaved={() => qc.invalidateQueries()}
          />
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
    </PageShell>
  );
}

function RuleCard({ rule, onToggle, onTest, onSaved }: {
  rule: Rule; onToggle: (v: boolean) => void; onTest: () => void; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>(rule.condition?.status ?? "Incomplete");
  const [missingReq, setMissingReq] = useState<boolean>(!!rule.condition?.missing_documents_not_empty);
  const [assign, setAssign] = useState<string>(rule.action?.assign ?? "Document Follow-Up");
  const [notify, setNotify] = useState<string>(rule.action?.notify ?? "admissions_counselor");

  useEffect(() => {
    if (!editing) {
      setStatus(rule.condition?.status ?? "Incomplete");
      setMissingReq(!!rule.condition?.missing_documents_not_empty);
      setAssign(rule.action?.assign ?? "Document Follow-Up");
      setNotify(rule.action?.notify ?? "admissions_counselor");
    }
  }, [rule, editing]);

  async function save() {
    setSaving(true);
    const condition: RuleCondition = { status: status === "Any" ? null : status, missing_documents_not_empty: missingReq };
    const action: RuleAction = { assign, notify };
    const { error } = await supabase.from("workflow_rules")
      .update({ condition: condition as never, action: action as never }).eq("id", rule.id);
    setSaving(false);
    if (error) { toast.error("Could not save rule"); return; }
    await logAudit({ action: "workflow.rule_updated", affected_record: rule.name, result: `status=${status}, missing_docs=${missingReq}, assign=${assign}, notify=${notify}` });
    toast.success("Rule saved");
    setEditing(false);
    onSaved();
  }

  const notifyLabel = NOTIFY_OPTIONS.find((n) => n.value === (rule.action?.notify ?? "admissions_counselor"))?.label ?? "—";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-navy grid place-items-center text-navy-foreground">
            <GitBranch className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{rule.name}</CardTitle>
            <CardDescription>{rule.description}</CardDescription>
          </div>
          <Switch checked={rule.active} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm font-mono space-y-0.5">
            <div><span className="text-orange font-semibold">WHEN</span> application_status = "{rule.condition?.status ?? "Any"}"</div>
            {rule.condition?.missing_documents_not_empty && (
              <div className="pl-10"><span className="text-orange font-semibold">AND</span> missing_documents is not empty</div>
            )}
            <div><span className="text-orange font-semibold">THEN</span> assign "{rule.action?.assign ?? "—"}"</div>
            <div className="pl-10"><span className="text-orange font-semibold">AND</span> notify {notifyLabel}</div>
          </div>
        ) : (
          <div className="rounded-md border p-3 space-y-3 bg-background">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Application status equals</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Also require missing documents</Label>
                  <div className="h-10 flex items-center gap-2 rounded-md border px-3">
                    <Switch checked={missingReq} onCheckedChange={setMissingReq} />
                    <span className="text-sm text-muted-foreground">{missingReq ? "Required" : "Not required"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Assign task</Label>
                <Input value={assign} onChange={(e) => setAssign(e.target.value)} placeholder="Document Follow-Up" />
              </div>
              <div>
                <Label className="text-xs">Notify</Label>
                <Select value={notify} onValueChange={setNotify}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFY_OPTIONS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit rule
              </Button>
              <Button variant="outline" size="sm" onClick={onTest} disabled={!rule.active}>
                <Play className="h-4 w-4 mr-2" /> Test against sample records
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={save} disabled={saving} className="bg-navy text-navy-foreground hover:bg-navy-muted">
                <Save className="h-4 w-4 mr-2" /> {saving ? "Saving…" : "Save rule"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
