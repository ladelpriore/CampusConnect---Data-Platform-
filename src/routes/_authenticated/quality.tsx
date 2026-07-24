import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "./dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isValidEmail, logAudit, normalizeEmail, statusBadgeClass } from "@/lib/campus";
import { useMemo, useState } from "react";
import { AlertTriangle, Merge, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/quality")({
  head: () => ({ meta: [{ title: "Data Quality — CampusContext" }, { name: "description", content: "Review missing fields, invalid emails, duplicate applicants and conflicting statuses." }] }),
  component: Quality,
});

type Applicant = { id: string; application_id: string | null; first_name: string | null; last_name: string | null; email: string | null; normalized_email: string | null; application_status: string | null; enrollment_term: string | null; source_campaign: string | null; missing_documents: string[] | null; source: string | null; merged_into: string | null };

function Quality() {
  const qc = useQueryClient();
  const { data: applicants, refetch } = useQuery({
    queryKey: ["quality-applicants"],
    queryFn: async () => (await supabase.from("applicants").select("*").is("merged_into", null)).data as Applicant[] ?? [],
  });
  const { data: snapshots } = useQuery({
    queryKey: ["quality-snapshots"],
    queryFn: async () => (await supabase.from("quality_snapshots").select("*").order("taken_at", { ascending: false }).limit(10)).data ?? [],
  });
  const [mergeCandidate, setMergeCandidate] = useState<[Applicant, Applicant] | null>(null);

  const analysis = useMemo(() => analyze(applicants ?? []), [applicants]);
  const previous = snapshots?.[0];

  async function saveSnapshot(trigger: string, note?: string, override?: { completeness: number; dupRate: number }) {
    const src = override ?? { completeness: analysis.completeness, dupRate: analysis.dupRate };
    await supabase.from("quality_snapshots").insert({
      trigger,
      note: note ?? null,
      completeness_pct: Math.round(src.completeness),
      duplicate_rate_pct: Math.round(src.dupRate),
    });
  }

  async function scanNow() {
    // Rebuild duplicate_matches from current applicants (idempotent-ish for prototype)
    await supabase.from("duplicate_matches").delete().eq("resolved", false);
    const inserts: { applicant_a: string; applicant_b: string; reason: string }[] = [];
    for (const dupe of analysis.duplicates) {
      inserts.push({ applicant_a: dupe.a.id, applicant_b: dupe.b.id, reason: dupe.reason });
    }
    if (inserts.length) await supabase.from("duplicate_matches").insert(inserts);
    await saveSnapshot("manual_scan");
    await logAudit({ action: "quality.scan", result: `${inserts.length} duplicate pairs detected` });
    await qc.invalidateQueries();
    toast.success(`Scan complete — ${inserts.length} duplicate pairs, ${analysis.issues.length} data issues`);
  }

  async function doMerge(a: Applicant, b: Applicant, canonicalId: string, chosen: Record<string, string | null | string[]>) {
    const keep = canonicalId === a.id ? a : b;
    const drop = canonicalId === a.id ? b : a;
    const patch = {
      application_id: chosen.application_id as string | null,
      first_name: chosen.first_name as string | null,
      last_name: chosen.last_name as string | null,
      email: chosen.email as string | null,
      normalized_email: normalizeEmail(chosen.email as string),
      application_status: chosen.application_status as string | null,
      enrollment_term: chosen.enrollment_term as string | null,
      source_campaign: chosen.source_campaign as string | null,
      missing_documents: chosen.missing_documents as string[],
    };
    await saveSnapshot("pre_merge");
    await supabase.from("applicants").update(patch).eq("id", keep.id);
    await supabase.from("applicants").update({ merged_into: keep.id }).eq("id", drop.id);
    await supabase.from("duplicate_matches").update({ resolved: true })
      .or(`and(applicant_a.eq.${a.id},applicant_b.eq.${b.id}),and(applicant_a.eq.${b.id},applicant_b.eq.${a.id})`);
    await logAudit({
      action: "duplicate.merged",
      affected_record: keep.application_id ?? keep.id,
      result: `merged ${drop.application_id ?? drop.id} → ${keep.application_id ?? keep.id}`,
    });
    setMergeCandidate(null);
    await refetch();
    // Recompute after refetch and record post-merge snapshot
    const { data: fresh } = await supabase.from("applicants").select("*").is("merged_into", null);
    const post = analyze((fresh as Applicant[]) ?? []);
    await saveSnapshot("post_merge", `merged ${drop.application_id ?? drop.id} → ${keep.application_id ?? keep.id}`, { completeness: post.completeness, dupRate: post.dupRate });
    await qc.invalidateQueries();
    toast.success("Applicants merged — quality snapshot recorded");
  }

  const list = applicants ?? [];

  return (
    <PageShell
      title="Data Quality"
      subtitle="Review and resolve data issues to keep applicant profiles trusted."
      actions={<Button onClick={scanNow} variant="outline"><RefreshCcw className="h-4 w-4 mr-2" />Re-scan</Button>}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Completeness (now)" value={`${analysis.completeness}%`} sub={previous ? `previous snapshot: ${previous.completeness_pct}%` : "no prior snapshot"} icon={ShieldCheck} accent="success" />
        <Metric label="Duplicate rate" value={`${analysis.dupRate}%`} sub={previous ? `previous snapshot: ${previous.duplicate_rate_pct}%` : "no prior snapshot"} icon={Merge} accent="warning" />
        <Metric label="Open issues" value={analysis.issues.length} icon={AlertTriangle} />
        <Metric label="Trusted profiles" value={list.length} icon={ShieldCheck} accent="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate applicants</CardTitle>
          <CardDescription>Exact matches by application ID or normalized email.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Record A</th>
                <th className="text-left px-4 py-2">Record B</th>
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {analysis.duplicates.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No duplicates detected.</td></tr>}
              {analysis.duplicates.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full border bg-orange/10 text-orange border-orange/30">{d.reason}</span></td>
                  <td className="px-4 py-3"><ApplicantMini a={d.a} /></td>
                  <td className="px-4 py-3"><ApplicantMini a={d.b} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setMergeCandidate([d.a, d.b])}><Merge className="h-3.5 w-3.5 mr-1.5" />Review & merge</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Data issues</CardTitle><CardDescription>Missing IDs, invalid emails, missing required fields, conflicting statuses.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Issue</th>
                  <th className="text-left px-4 py-2">Applicant</th>
                  <th className="text-left px-4 py-2">Application ID</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {analysis.issues.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">All records look clean.</td></tr>}
                {analysis.issues.map((iss, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded-full border bg-destructive/10 text-destructive border-destructive/30">{iss.kind}</span></td>
                    <td className="px-4 py-2">{iss.applicant.first_name} {iss.applicant.last_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{iss.applicant.application_id ?? "—"}</td>
                    <td className="px-4 py-2"><span className={"text-xs px-2 py-0.5 rounded-full border " + statusBadgeClass(iss.applicant.application_status)}>{iss.applicant.application_status ?? "—"}</span></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{iss.applicant.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quality snapshots</CardTitle>
          <CardDescription>Point-in-time completeness and duplicate-rate captures — recorded on every scan and merge.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Trigger</th>
                  <th className="text-right px-4 py-2">Completeness</th>
                  <th className="text-right px-4 py-2">Duplicate rate</th>
                  <th className="text-left px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {(snapshots ?? []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No snapshots yet — click "Re-scan" or resolve a duplicate to record one.</td></tr>}
                {(snapshots ?? []).map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded-full border bg-muted">{s.trigger}</span></td>
                    <td className="px-4 py-2 text-right font-medium text-success">{s.completeness_pct}%</td>
                    <td className="px-4 py-2 text-right font-medium text-orange">{s.duplicate_rate_pct}%</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <MergeDialog pair={mergeCandidate} onClose={() => setMergeCandidate(null)} onMerge={doMerge} />
    </PageShell>
  );
}

function Metric({ label, value, sub, icon: Icon, accent }: { label: string; value: React.ReactNode; sub?: string; icon: React.ComponentType<{ className?: string }>; accent?: "success" | "warning" }) {
  const color = accent === "success" ? "text-success" : accent === "warning" ? "text-orange" : "text-navy";
  return (
    <Card><CardContent className="p-5">
      <div className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1.5"><Icon className={"h-4 w-4 " + color} /> {label}</div>
      <div className={"mt-2 text-2xl font-semibold " + color}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

function ApplicantMini({ a }: { a: Applicant }) {
  return (
    <div>
      <div className="font-medium">{a.first_name} {a.last_name}</div>
      <div className="text-xs text-muted-foreground font-mono">{a.application_id ?? "—"} · {a.email ?? "—"}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        <span className={"text-[10px] px-1.5 py-0.5 rounded-full border " + statusBadgeClass(a.application_status)}>{a.application_status ?? "—"}</span>
        <span className="ml-2">{a.source}</span>
      </div>
    </div>
  );
}

function MergeDialog({ pair, onClose, onMerge }: { pair: [Applicant, Applicant] | null; onClose: () => void; onMerge: (a: Applicant, b: Applicant, canonicalId: string, chosen: Record<string, string | null | string[]>) => Promise<void> }) {
  const [chosen, setChosen] = useState<Record<string, "a" | "b">>({});
  const [canonicalId, setCanonicalId] = useState<string | null>(null);

  if (!pair) return null;
  const [a, b] = pair;
  const fields = ["application_id", "first_name", "last_name", "email", "application_status", "enrollment_term", "source_campaign", "missing_documents"] as const;

  function pick(f: string, side: "a" | "b") { setChosen({ ...chosen, [f]: side }); }

  function confirm() {
    const winner = canonicalId ?? a.id;
    const out: Record<string, string | null | string[]> = {};
    fields.forEach((f) => {
      const side = chosen[f] ?? "a";
      const src = side === "a" ? a : b;
      out[f] = (src as never as Record<string, string | null | string[]>)[f];
    });
    onMerge(a, b, winner, out);
  }

  return (
    <Dialog open={!!pair} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Merge into trusted profile</DialogTitle></DialogHeader>
        <div className="text-sm">
          <div className="mb-3 flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" name="canon" checked={(canonicalId ?? a.id) === a.id} onChange={() => setCanonicalId(a.id)} /> Keep A as canonical
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="canon" checked={canonicalId === b.id} onChange={() => setCanonicalId(b.id)} /> Keep B as canonical
            </label>
          </div>
          <table className="w-full text-sm border rounded-md overflow-hidden">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-3 py-2">Field</th><th className="text-left px-3 py-2">A</th><th className="text-left px-3 py-2">B</th></tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const va = (a as never as Record<string, string | string[] | null>)[f];
                const vb = (b as never as Record<string, string | string[] | null>)[f];
                const side = chosen[f] ?? "a";
                return (
                  <tr key={f} className="border-t">
                    <td className="px-3 py-2 font-medium">{f}</td>
                    <td className={"px-3 py-2 cursor-pointer " + (side === "a" ? "bg-orange/10 ring-1 ring-orange/30" : "")} onClick={() => pick(f, "a")}>{Array.isArray(va) ? va.join(", ") : (va ?? <span className="text-muted-foreground">—</span>)}</td>
                    <td className={"px-3 py-2 cursor-pointer " + (side === "b" ? "bg-orange/10 ring-1 ring-orange/30" : "")} onClick={() => pick(f, "b")}>{Array.isArray(vb) ? vb.join(", ") : (vb ?? <span className="text-muted-foreground">—</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Click a cell to pick the canonical value. Defaults to Record A.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} className="bg-navy text-navy-foreground hover:bg-navy-muted"><Merge className="h-4 w-4 mr-2" />Merge records</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function analyze(apps: Applicant[]) {
  const fields = ["application_id", "first_name", "last_name", "email", "application_status", "enrollment_term"];
  let filled = 0;
  const issues: { kind: string; applicant: Applicant }[] = [];
  apps.forEach((a) => {
    fields.forEach((f) => {
      const v = (a as never as Record<string, unknown>)[f];
      if (v && (typeof v !== "string" || v.trim())) filled++;
    });
    if (!a.application_id) issues.push({ kind: "missing application_id", applicant: a });
    if (!a.email) issues.push({ kind: "missing email", applicant: a });
    else if (!isValidEmail(a.email)) issues.push({ kind: "invalid email", applicant: a });
    if (!a.first_name || !a.last_name) issues.push({ kind: "missing name", applicant: a });
  });
  const total = apps.length * fields.length;
  const completeness = total ? Math.round((filled / total) * 100) : 0;

  // Duplicates
  const byAppId = new Map<string, Applicant[]>();
  const byEmail = new Map<string, Applicant[]>();
  apps.forEach((a) => {
    if (a.application_id) {
      const arr = byAppId.get(a.application_id) ?? []; arr.push(a); byAppId.set(a.application_id, arr);
    }
    if (a.normalized_email) {
      const arr = byEmail.get(a.normalized_email) ?? []; arr.push(a); byEmail.set(a.normalized_email, arr);
    }
  });
  const duplicates: { a: Applicant; b: Applicant; reason: string }[] = [];
  const seen = new Set<string>();
  const push = (arr: Applicant[], reason: string) => {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i].id, arr[j].id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        // extra: detect conflicting status when same application_id and different status
        let r = reason;
        if (reason === "same application_id" && arr[i].application_status !== arr[j].application_status) r = "conflicting status";
        duplicates.push({ a: arr[i], b: arr[j], reason: r });
      }
    }
  };
  byAppId.forEach((arr) => { if (arr.length > 1) push(arr, "same application_id"); });
  byEmail.forEach((arr) => { if (arr.length > 1) push(arr, "same normalized email"); });

  const dupRate = apps.length ? Math.round((duplicates.length / apps.length) * 100) : 0;
  return { completeness, dupRate, issues, duplicates };
}
