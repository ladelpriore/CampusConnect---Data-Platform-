// Shared helpers used across CampusContext pages.
import { supabase } from "@/integrations/supabase/client";

export const GITHUB_REPO_URL = "https://github.com/ladelpriore/CampusConnect---Data-Platform-.git";

export const CANONICAL_FIELDS = [
  "application_id",
  "first_name",
  "last_name",
  "email",
  "application_status",
  "enrollment_term",
  "source_campaign",
  "missing_documents",
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const t = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

export function isValidEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) !== null;
}

export function suggestMapping(header: string): CanonicalField | null {
  const h = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, CanonicalField> = {
    application_id: "application_id", app_id: "application_id", id: "application_id",
    first_name: "first_name", firstname: "first_name", given_name: "first_name", first: "first_name",
    last_name: "last_name", lastname: "last_name", surname: "last_name", family_name: "last_name", last: "last_name",
    email: "email", email_address: "email", mail: "email",
    application_status: "application_status", status: "application_status", stage: "application_status",
    enrollment_term: "enrollment_term", term: "enrollment_term", intake: "enrollment_term",
    source_campaign: "source_campaign", campaign: "source_campaign", utm_campaign: "source_campaign",
    missing_documents: "missing_documents", docs_missing: "missing_documents", missing: "missing_documents",
  };
  return map[h] ?? null;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = false;
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') quoted = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export const SAMPLE_CSV = `application_id,first_name,last_name,email,application_status,enrollment_term,source_campaign,missing_documents
APP-2001,Avery,Johnson,avery.j@example.edu,Submitted,Fall 2026,Search Ads,
APP-2002,Blake,Ortiz,,Incomplete,Fall 2026,Open House 2025,transcript;fafsa
APP-2003,Cameron,Reed,cameron.reed@example.edu,Admitted,Fall 2026,Referral,
APP-2004,Dakota,Singh,dakota[at]example.edu,Submitted,Fall 2026,Email Drip,
APP-2005,Elliot,Wu,elliot.wu@example.edu,Incomplete,Spring 2026,Open House 2025,recommendation
`;

export async function logAudit(input: {
  action: string;
  affected_record?: string | null;
  source?: string | null;
  result?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data } = await supabase.auth.getUser();
  const actor = data.user?.email ?? "system";
  await supabase.from("audit_events").insert({
    actor, action: input.action,
    affected_record: input.affected_record ?? null,
    source: input.source ?? null,
    result: input.result ?? null,
    metadata: (input.metadata ?? null) as never,
  });
}

export function statusBadgeClass(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "admitted") return "bg-success/15 text-success border-success/30";
  if (s === "submitted") return "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300";
  if (s === "incomplete") return "bg-orange/15 text-orange border-orange/30";
  if (s === "waitlisted") return "bg-warning/15 text-warning-foreground border-warning/30";
  if (s === "denied") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
