import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Github, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { WORKBENCH_QUERIES, ghPath, validateEditedSql, type WorkbenchQuery, type WorkbenchResult } from "@/lib/sql-workbench";

export function SqlWorkbench() {
  const [activeId, setActiveId] = useState(WORKBENCH_QUERIES[0].id);
  const active = WORKBENCH_QUERIES.find((q) => q.id === activeId)!;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Query library</CardTitle>
          <CardDescription className="text-xs">10 curated queries · read-only</CardDescription></CardHeader>
        <CardContent className="p-2 space-y-0.5">
          {WORKBENCH_QUERIES.map((q, i) => (
            <button key={q.id} onClick={() => setActiveId(q.id)}
              className={"w-full text-left px-3 py-2 rounded text-sm transition-colors " + (activeId === q.id ? "bg-navy/10 text-navy font-medium" : "hover:bg-muted")}>
              <div className="flex items-center gap-2"><span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span><span className="truncate">{q.title}</span></div>
              <div className="text-[10px] text-muted-foreground font-mono pl-6 truncate">{q.tables.join(", ")}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <QueryPanel key={active.id} query={active} />
    </div>
  );
}

function QueryPanel({ query }: { query: WorkbenchQuery }) {
  const defaults = useMemo(() => Object.fromEntries(query.params.map((p) => [p.name, p.default])), [query]);
  const [params, setParams] = useState<Record<string, string>>(defaults);
  const initialSql = useMemo(() => query.sql(defaults), [query, defaults]);
  const templateSql = useMemo(() => query.sql(params), [query, params]);
  const [editedSql, setEditedSql] = useState<string>(initialSql);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setParam(name: string, v: string) {
    const next = { ...params, [name]: v };
    setParams(next);
    if (!dirty) setEditedSql(query.sql(next));
  }
  function reset() { setEditedSql(query.sql(params)); setDirty(false); setError(null); }

  async function run() {
    setError(null); setResult(null);
    if (!query.executable) { setError(query.blockedReason ?? "This query is not executable from the workbench."); return; }
    const sqlToCheck = dirty ? editedSql : templateSql;
    const check = validateEditedSql(sqlToCheck, templateSql);
    if (!check.ok) { setError(check.reason); return; }
    try {
      setBusy(true);
      const r = await query.run!(params);
      setResult(r);
      toast.success(`Query returned ${r.rows.length} row${r.rows.length === 1 ? "" : "s"} in ${r.durationMs}ms`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{query.title}</CardTitle>
              <CardDescription>{query.purpose}</CardDescription>
            </div>
            <a href={ghPath(query.githubPath)} target="_blank" rel="noreferrer"
              className="text-xs inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-muted whitespace-nowrap">
              <Github className="h-3.5 w-3.5" /> {query.githubPath}
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {query.tables.map((t) => <span key={t} className="px-2 py-0.5 rounded-full border bg-navy/5 text-navy border-navy/20 font-mono">{t}</span>)}
            {query.indexes.map((i) => <span key={i} className="px-2 py-0.5 rounded-full border bg-muted text-muted-foreground font-mono" title="Suggested index">idx: {i}</span>)}
          </div>
          {query.params.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {query.params.map((p) => (
                <div key={p.name}>
                  <Label className="text-xs">{p.label}</Label>
                  {p.type === "select" ? (
                    <Select value={params[p.name]} onValueChange={(v) => setParam(p.name, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(p.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input value={params[p.name] ?? ""} onChange={(e) => setParam(p.name, e.target.value)} type={p.type === "int" ? "number" : "text"} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs uppercase text-muted-foreground">SQL</Label>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3 text-success" /> Non-SELECT keywords are blocked before execution.</div>
            </div>
            <Textarea rows={10} className="font-mono text-xs" value={editedSql} onChange={(e) => { setEditedSql(e.target.value); setDirty(true); }} />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={run} disabled={busy}><Play className="h-4 w-4 mr-1" /> {busy ? "Running…" : "Run"}</Button>
              <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1" /> Reset to template</Button>
              {!query.executable && <span className="text-xs text-orange">Write query — read-only workbench blocks execution.</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><div>{error}</div>
        </div>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Results</CardTitle>
                <CardDescription>{result.rows.length} row{result.rows.length === 1 ? "" : "s"} · {result.durationMs}ms {result.note ? "· " + result.note : ""}</CardDescription>
              </div>
              <div className="text-[10px] text-muted-foreground">Executed as a typed Supabase read against live prototype data.</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground sticky top-0">
                  <tr>{result.columns.map((c) => <th key={c} className="text-left px-3 py-2 font-medium">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 && <tr><td colSpan={result.columns.length} className="px-3 py-6 text-center text-muted-foreground">No rows.</td></tr>}
                  {result.rows.map((r, i) => (
                    <tr key={i} className="border-t align-top">
                      {result.columns.map((c) => (
                        <td key={c} className="px-3 py-2 font-mono">
                          {formatCell(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
