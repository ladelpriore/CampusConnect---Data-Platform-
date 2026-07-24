import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANONICAL_FIELDS, CanonicalField, SAMPLE_CSV, isValidEmail, logAudit, normalizeEmail, parseCsv, suggestMapping } from "@/lib/campus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, CheckCircle2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import & Mapping — CampusContext" }, { name: "description", content: "Upload CSVs of applicant records, map columns to canonical fields, validate and import." }] }),
  component: Importer,
});

function Importer() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][]; fileName: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, CanonicalField | "">>({});
  const [importing, setImporting] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setCsv({ headers, rows, fileName: f.name });
    const initial: Record<string, CanonicalField | ""> = {};
    headers.forEach((h) => { initial[h] = suggestMapping(h) ?? ""; });
    setMapping(initial);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "campuscontext-sample-applicants.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validation = csv ? validateRows(csv.rows, csv.headers, mapping) : null;

  async function runImport() {
    if (!csv || !validation) return;
    setImporting(true);
    const valid = validation.records.filter((r) => r.ok);
    const invalid = validation.records.filter((r) => !r.ok);
    const inserts = valid.map((r) => ({
      application_id: r.record.application_id ?? null,
      first_name: r.record.first_name ?? null,
      last_name: r.record.last_name ?? null,
      email: r.record.email ?? null,
      normalized_email: normalizeEmail(r.record.email as string | undefined),
      application_status: r.record.application_status ?? null,
      enrollment_term: r.record.enrollment_term ?? null,
      source_campaign: r.record.source_campaign ?? null,
      missing_documents: r.record.missing_documents
        ? String(r.record.missing_documents).split(/[;,]/).map((s) => s.trim()).filter(Boolean)
        : [],
      source: "CSV Import",
    }));
    const { error } = await supabase.from("applicants").insert(inserts);
    if (error) { toast.error(error.message); setImporting(false); return; }

    const jobId = crypto.randomUUID();
    await supabase.from("import_jobs").insert({
      id: jobId, source_name: csv.fileName, kind: "csv", status: "completed",
      records_total: csv.rows.length, records_valid: inserts.length, records_invalid: invalid.length,
    });

    // Persist granular validation failures for every invalid row/field.
    const errorRows = invalid.flatMap((r) =>
      r.errors.map((e) => ({
        import_job_id: jobId,
        row_number: r.rowNumber,
        field: e.field,
        kind: e.kind,
        message: e.message,
        submitted_value: e.value ?? null,
      })),
    );
    if (errorRows.length) {
      await supabase.from("validation_errors").insert(errorRows as never);
    }

    await logAudit({
      action: "csv.import", affected_record: csv.fileName, source: "csv",
      result: `${inserts.length}/${csv.rows.length} imported`,
      metadata: { valid: inserts.length, invalid: invalid.length, error_rows: errorRows.length },
    });
    await qc.invalidateQueries();
    toast.success(invalid.length
      ? `Imported ${inserts.length} applicants — logged ${errorRows.length} validation issue${errorRows.length === 1 ? "" : "s"}`
      : `Imported ${inserts.length} applicants`);
    setCsv(null); setMapping({});
    setImporting(false);
  }

  return (
    <PageShell
      title="Import & Field Mapping"
      subtitle="Upload synthetic applicant CSVs, map columns to canonical fields and validate before import."
      actions={<Button variant="outline" onClick={downloadSample}><Download className="h-4 w-4 mr-2" />Sample CSV</Button>}
    >
      {!csv && (
        <Card>
          <CardContent className="p-10 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-navy/10 grid place-items-center text-navy mb-4">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-lg">Upload applicant CSV</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Use synthetic data only. Columns like <code>email</code>, <code>application_id</code>, <code>status</code> are auto-suggested.
            </p>
            <label className="mt-6 inline-flex">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
              <span className="cursor-pointer inline-flex items-center rounded-md bg-navy hover:bg-navy-muted text-navy-foreground px-4 py-2 text-sm font-medium">
                Choose file
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {csv && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Map columns</CardTitle>
              <CardDescription>{csv.fileName} — {csv.headers.length} columns, {csv.rows.length} rows</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {csv.headers.map((h) => (
                  <div key={h} className="flex items-center gap-3">
                    <div className="w-1/2 truncate text-sm font-medium">{h}</div>
                    <Select value={mapping[h] || "__skip"} onValueChange={(v) => setMapping({ ...mapping, [h]: v === "__skip" ? "" : (v as CanonicalField) })}>
                      <SelectTrigger className="w-1/2"><SelectValue placeholder="Skip" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip">— Skip —</SelectItem>
                        {CANONICAL_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Total rows" value={csv.rows.length} />
            <StatCard label="Valid" value={validation!.records.filter((r) => r.ok).length} accent="success" icon={CheckCircle2} />
            <StatCard label="Invalid" value={validation!.records.filter((r) => !r.ok).length} accent="destructive" icon={XCircle} />
          </div>

          <Card>
            <CardHeader><CardTitle>Preview</CardTitle><CardDescription>First 15 rows after mapping.</CardDescription></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Status</th>
                      {CANONICAL_FIELDS.map((f) => <th key={f} className="text-left px-3 py-2">{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {validation!.records.slice(0, 15).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">
                          {r.ok
                            ? <span className="text-success text-xs">✓ valid</span>
                            : <span className="text-destructive text-xs" title={r.errors.join(", ")}>✗ {r.errors[0]}</span>}
                        </td>
                        {CANONICAL_FIELDS.map((f) => (
                          <td key={f} className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate">{String(r.record[f] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setCsv(null); setMapping({}); }}>Cancel</Button>
            <Button onClick={runImport} disabled={importing || validation!.records.filter((r) => r.ok).length === 0} className="bg-navy text-navy-foreground hover:bg-navy-muted">
              {importing ? "Importing…" : `Import ${validation!.records.filter((r) => r.ok).length} records`}
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}

function StatCard({ label, value, accent, icon: Icon }: { label: string; value: number; accent?: "success" | "destructive"; icon?: React.ComponentType<{ className?: string }> }) {
  const color = accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : "text-navy";
  return (
    <Card><CardContent className="p-5">
      <div className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
        {Icon && <Icon className={"h-4 w-4 " + color} />} {label}
      </div>
      <div className={"mt-2 text-2xl font-semibold " + color}>{value}</div>
    </CardContent></Card>
  );
}

function validateRows(rows: string[][], headers: string[], mapping: Record<string, CanonicalField | "">) {
  const required: CanonicalField[] = ["application_id", "first_name", "last_name", "application_status"];
  const records = rows.map((row) => {
    const rec: Record<string, string | undefined> = {};
    headers.forEach((h, i) => {
      const f = mapping[h];
      if (f) rec[f] = (row[i] ?? "").trim() || undefined;
    });
    const errors: string[] = [];
    required.forEach((r) => { if (!rec[r]) errors.push(`missing ${r}`); });
    if (rec.email && !isValidEmail(rec.email)) errors.push("invalid email");
    return { record: rec, ok: errors.length === 0, errors };
  });
  return { records };
}
