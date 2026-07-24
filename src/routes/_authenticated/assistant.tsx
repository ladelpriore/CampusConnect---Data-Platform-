import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, ShieldCheck, User, Bot, PhoneCall } from "lucide-react";
import { useState } from "react";
import { logAudit, statusBadgeClass } from "@/lib/campus";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Admissions Assistant — CampusContext" }, { name: "description", content: "Prototype AI admissions assistant using controlled tools over trusted applicant context." }] }),
  component: Assistant,
});

type Applicant = {
  id: string; application_id: string | null; first_name: string | null; last_name: string | null;
  email: string | null; application_status: string | null; missing_documents: string[] | null;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  tool?: string;
  data?: unknown;
  awaitingConfirm?: { tool: "route_to_admissions_counselor"; applicantId: string; applicantName: string };
};

const EXAMPLES = [
  "Why is Jordan Lee's application incomplete?",
  "Which applicants are missing transcripts?",
  "Which records should be escalated to a counselor?",
];

function Assistant() {
  const qc = useQueryClient();
  const { data: applicants } = useQuery({
    queryKey: ["assistant-applicants"],
    queryFn: async () => (await supabase.from("applicants").select("id,application_id,first_name,last_name,email,application_status,missing_documents").is("merged_into", null)).data as Applicant[] ?? [],
  });
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi — I'm the CampusContext admissions assistant. I use three controlled tools (lookup_application_status, list_missing_documents, route_to_admissions_counselor) on your trusted applicant data. Try a question below." },
  ]);
  const [input, setInput] = useState("");

  async function send(text: string) {
    if (!text.trim() || !applicants) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    const reply = respond(text, applicants);
    setMessages((m) => [...m, userMsg, reply]);
    if (reply.tool) {
      await logAudit({
        action: "assistant.tool_used",
        affected_record: reply.tool,
        source: "assistant",
        result: typeof reply.data === "object" ? JSON.stringify(reply.data).slice(0, 200) : String(reply.data ?? ""),
      });
    }
  }

  async function confirmRoute(applicantId: string, applicantName: string, index: number) {
    await supabase.from("workflow_executions").insert({
      rule_id: null, applicant_id: applicantId,
      action_taken: "route_to_admissions_counselor",
      result: `Assistant escalated ${applicantName} to counselor (approved by admin)`,
    });
    await logAudit({
      action: "assistant.action_approved", affected_record: applicantName,
      source: "assistant", result: "Routed to admissions counselor",
    });
    setMessages((m) => m.map((msg, i) => i === index
      ? { ...msg, awaitingConfirm: undefined, content: msg.content + `\n\n✅ Escalation approved and recorded in workflow history.` }
      : msg));
    await qc.invalidateQueries();
    toast.success(`${applicantName} routed to counselor`);
  }

  return (
    <PageShell
      title="Admissions Assistant"
      subtitle="Prototype agent — deterministic responses over your trusted applicant records. No live LLM call is made."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Card className="flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-orange grid place-items-center text-orange-foreground"><Sparkles className="h-4 w-4" /></div>
              <div>
                <CardTitle className="text-base">CampusContext Assistant</CardTitle>
                <CardDescription className="text-xs">Prototype agent simulation · Deterministic tool calls</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={"flex gap-3 " + (m.role === "user" ? "flex-row-reverse" : "")}>
                <div className={"h-7 w-7 rounded-md grid place-items-center shrink-0 " + (m.role === "user" ? "bg-muted text-foreground" : "bg-navy text-navy-foreground")}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={"max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap " + (m.role === "user" ? "bg-navy text-navy-foreground" : "bg-muted")}>
                  {m.content}
                  {m.tool && (
                    <div className="mt-2 text-xs text-muted-foreground border-t border-border pt-2 flex items-center gap-1.5">
                      <ShieldCheck className="h-3 w-3 text-success" /> Tool: <code className="font-mono">{m.tool}</code>
                    </div>
                  )}
                  {m.awaitingConfirm && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" className="bg-orange text-orange-foreground hover:bg-orange/90"
                        onClick={() => confirmRoute(m.awaitingConfirm!.applicantId, m.awaitingConfirm!.applicantName, i)}>
                        <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Approve escalation
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => setMessages((prev) => prev.map((msg, idx) => idx === i ? { ...msg, awaitingConfirm: undefined, content: msg.content + "\n\n✖ Escalation cancelled." } : msg))}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
          <div className="border-t p-3 flex gap-2">
            <Input placeholder="Ask about an applicant, missing documents, or escalations…"
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(input); }} />
            <Button onClick={() => send(input)} className="bg-navy text-navy-foreground hover:bg-navy-muted"><Send className="h-4 w-4" /></Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Example questions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {EXAMPLES.map((q) => (
                <button key={q} onClick={() => send(q)} className="w-full text-left text-sm rounded-md border p-2.5 hover:bg-muted transition-colors">
                  {q}
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Controlled tools</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <ToolInfo name="lookup_application_status" desc="Read applicant status by name or ID." />
              <ToolInfo name="list_missing_documents" desc="Return the missing documents for an applicant or across the queue." />
              <ToolInfo name="route_to_admissions_counselor" desc="Escalate an applicant. Requires admin confirmation." confirm />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function ToolInfo({ name, desc, confirm }: { name: string; desc: string; confirm?: boolean }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="font-mono text-[11px] text-navy font-semibold">{name}</div>
      <div className="text-muted-foreground mt-0.5">{desc}</div>
      {confirm && <div className="mt-1 flex items-center gap-1 text-orange"><ShieldCheck className="h-3 w-3" /> Requires human approval</div>}
    </div>
  );
}

function respond(question: string, applicants: Applicant[]): Msg {
  const q = question.toLowerCase();

  // Try to find named applicant
  const named = applicants.find((a) => {
    const full = `${a.first_name ?? ""} ${a.last_name ?? ""}`.toLowerCase();
    return full && q.includes(full.trim());
  }) ?? applicants.find((a) => a.application_id && q.includes(a.application_id.toLowerCase()));

  if ((q.includes("why") || q.includes("status") || q.includes("incomplete")) && named) {
    const badge = named.application_status ? `[${named.application_status}]` : "";
    const missing = named.missing_documents ?? [];
    let content = `**${named.first_name} ${named.last_name}** ${badge} — application ${named.application_id ?? "n/a"}.`;
    if (named.application_status === "Incomplete") {
      content += missing.length
        ? `\n\nThe application is marked Incomplete because the following documents are missing: **${missing.join(", ")}**.`
        : `\n\nStatus is Incomplete but no missing documents are recorded — likely a downstream data-quality issue.`;
      content += `\n\n**Recommended next action:** send a Document Follow-Up reminder, or escalate to an admissions counselor.`;
    } else {
      content += `\n\nCurrent status is **${named.application_status}**. No blocking documents recorded.`;
    }
    return { role: "assistant", content, tool: "lookup_application_status", data: { applicantId: named.id }, awaitingConfirm: named.application_status === "Incomplete" ? { tool: "route_to_admissions_counselor", applicantId: named.id, applicantName: `${named.first_name} ${named.last_name}` } : undefined };
  }

  if (q.includes("missing") && (q.includes("transcript") || q.includes("document"))) {
    const target = q.includes("transcript") ? "transcript" : null;
    const list = applicants.filter((a) => (a.missing_documents ?? []).some((d) => target ? d === target : true));
    const lines = list.slice(0, 15).map((a) => `• ${a.first_name} ${a.last_name} (${a.application_id ?? "no id"}) — missing ${(a.missing_documents ?? []).join(", ")}`);
    return {
      role: "assistant",
      content: `Found **${list.length}** applicants${target ? " missing transcripts" : " with missing documents"}:\n\n${lines.join("\n")}${list.length > 15 ? `\n… and ${list.length - 15} more` : ""}`,
      tool: "list_missing_documents", data: { count: list.length },
    };
  }

  if (q.includes("escalate") || q.includes("counselor") || q.includes("escalation")) {
    const candidates = applicants.filter((a) => a.application_status === "Incomplete" && (a.missing_documents ?? []).length >= 2);
    if (candidates.length === 0) {
      return { role: "assistant", content: "No applicants currently meet the escalation threshold (Incomplete AND 2+ missing docs).", tool: "list_missing_documents" };
    }
    const top = candidates[0];
    const lines = candidates.slice(0, 5).map((a) => `• ${a.first_name} ${a.last_name} — ${(a.missing_documents ?? []).length} missing docs`);
    return {
      role: "assistant",
      content: `**${candidates.length}** applicants meet escalation criteria (Incomplete + 2+ missing documents):\n\n${lines.join("\n")}\n\nI'd recommend routing **${top.first_name} ${top.last_name}** to a counselor first.`,
      tool: "route_to_admissions_counselor",
      awaitingConfirm: { tool: "route_to_admissions_counselor", applicantId: top.id, applicantName: `${top.first_name} ${top.last_name}` },
    };
  }

  // Default: try to answer with any matched applicant, or list summary
  if (named) {
    return {
      role: "assistant",
      content: `**${named.first_name} ${named.last_name}** — status ${named.application_status ?? "unknown"}, application ${named.application_id ?? "n/a"}, email ${named.email ?? "—"}.`,
      tool: "lookup_application_status",
    };
  }
  const byStatus = new Map<string, number>();
  applicants.forEach((a) => byStatus.set(a.application_status ?? "Unknown", (byStatus.get(a.application_status ?? "Unknown") ?? 0) + 1));
  const summary = Array.from(byStatus, ([k, v]) => `• ${k}: ${v}`).join("\n");
  void statusBadgeClass;
  return {
    role: "assistant",
    content: `I couldn't identify a specific applicant. Here's a summary of trusted profiles:\n\n${summary}\n\nTry: "Why is Jordan Lee's application incomplete?" or "Which applicants are missing transcripts?"`,
  };
}
