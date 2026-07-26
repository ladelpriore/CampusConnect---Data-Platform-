import { useState } from "react";

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  fields: string[];
  tone: "core" | "quality" | "workflow" | "audit" | "ingest";
}
interface Edge {
  from: string;
  to: string;
  label: string;
  cardinality: string;
}

const NODES: Node[] = [
  { id: "data_sources",       label: "data_sources",       x:  20, y:  30, fields: ["id (PK)", "name", "kind", "status", "sync_frequency"], tone: "ingest" },
  { id: "import_jobs",        label: "import_jobs",        x: 260, y:  30, fields: ["id (PK)", "source_id (FK)", "kind", "records_total", "records_invalid"], tone: "ingest" },
  { id: "validation_errors",  label: "validation_errors",  x: 520, y:  30, fields: ["id (PK)", "import_job_id (FK)", "applicant_id (FK)", "field", "kind"], tone: "quality" },
  { id: "applicants",         label: "applicants",         x: 260, y: 210, fields: ["id (PK)", "application_id", "normalized_email", "application_status", "merged_into (FK self)"], tone: "core" },
  { id: "duplicate_matches",  label: "duplicate_matches",  x: 520, y: 210, fields: ["id (PK)", "applicant_a (FK)", "applicant_b (FK)", "reason", "resolved"], tone: "quality" },
  { id: "workflow_rules",     label: "workflow_rules",     x:  20, y: 390, fields: ["id (PK)", "name", "active", "condition (jsonb)", "action (jsonb)"], tone: "workflow" },
  { id: "workflow_executions",label: "workflow_executions",x: 260, y: 390, fields: ["id (PK)", "rule_id (FK)", "applicant_id (FK)", "action_taken", "result"], tone: "workflow" },
  { id: "quality_snapshots",  label: "quality_snapshots",  x: 520, y: 390, fields: ["id (PK)", "duplicate_rate_pct", "trigger", "note"], tone: "quality" },
  { id: "audit_events",       label: "audit_events",       x: 260, y: 570, fields: ["id (PK)", "actor", "action", "affected_record", "metadata (jsonb)"], tone: "audit" },
];

const EDGES: Edge[] = [
  { from: "data_sources", to: "import_jobs", label: "runs", cardinality: "1 : N" },
  { from: "import_jobs", to: "validation_errors", label: "produces", cardinality: "1 : N" },
  { from: "applicants", to: "validation_errors", label: "affects", cardinality: "1 : N" },
  { from: "applicants", to: "duplicate_matches", label: "paired via", cardinality: "N : M (self)" },
  { from: "applicants", to: "workflow_executions", label: "targets", cardinality: "1 : N" },
  { from: "workflow_rules", to: "workflow_executions", label: "fires", cardinality: "1 : N" },
  { from: "applicants", to: "audit_events", label: "records", cardinality: "1 : N" },
  { from: "import_jobs", to: "audit_events", label: "records", cardinality: "1 : N" },
];

const TONE: Record<Node["tone"], { fill: string; stroke: string; text: string }> = {
  core:     { fill: "hsl(217 76% 24% / 0.10)", stroke: "hsl(217 76% 24%)", text: "hsl(217 76% 24%)" },
  ingest:   { fill: "hsl(217 91% 60% / 0.10)", stroke: "hsl(217 91% 60%)", text: "hsl(217 91% 45%)" },
  quality:  { fill: "hsl(24 95% 53% / 0.10)",  stroke: "hsl(24 95% 53%)",  text: "hsl(24 90% 40%)" },
  workflow: { fill: "hsl(270 70% 55% / 0.10)", stroke: "hsl(270 70% 55%)", text: "hsl(270 60% 40%)" },
  audit:    { fill: "hsl(215 15% 45% / 0.10)", stroke: "hsl(215 15% 45%)", text: "hsl(215 15% 30%)" },
};

const BOX_W = 210;
const BOX_H = 140;

export interface EntityDiagramProps {
  selected?: string;
  onSelect?: (id: string) => void;
}

export function EntityDiagram({ selected, onSelect }: EntityDiagramProps) {
  const [hover, setHover] = useState<string | null>(null);
  const width = 760;
  const height = 740;

  function anchor(n: Node) { return { cx: n.x + BOX_W / 2, cy: n.y + BOX_H / 2 }; }

  return (
    <div className="w-full overflow-auto rounded-md border bg-muted/20">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[720px]" role="img" aria-label="CampusContext entity relationship diagram">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill="hsl(215 15% 45%)" />
          </marker>
        </defs>
        {EDGES.map((e, i) => {
          const a = anchor(NODES.find((n) => n.id === e.from)!);
          const b = anchor(NODES.find((n) => n.id === e.to)!);
          const active = selected && (selected === e.from || selected === e.to);
          return (
            <g key={i} opacity={active ? 1 : 0.55}>
              <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="hsl(215 15% 45%)" strokeWidth={active ? 2 : 1.2} markerEnd="url(#arrow)" />
              <text x={(a.cx + b.cx) / 2} y={(a.cy + b.cy) / 2 - 4} textAnchor="middle" fontSize="10" fill="hsl(215 15% 30%)" className="select-none">
                {e.cardinality}
              </text>
            </g>
          );
        })}
        {NODES.map((n) => {
          const tone = TONE[n.tone];
          const isSel = selected === n.id;
          const isHover = hover === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              className="cursor-pointer"
              onClick={() => onSelect?.(n.id)}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                width={BOX_W}
                height={BOX_H}
                rx={8}
                fill={tone.fill}
                stroke={tone.stroke}
                strokeWidth={isSel ? 2.5 : isHover ? 1.8 : 1}
              />
              <rect width={BOX_W} height={26} rx={8} fill={tone.stroke} opacity={0.85} />
              <text x={12} y={17} fontFamily="ui-monospace, monospace" fontSize="12" fontWeight="600" fill="white">{n.label}</text>
              {n.fields.map((f, i) => (
                <text key={i} x={12} y={44 + i * 18} fontSize="10.5" fontFamily="ui-monospace, monospace" fill={tone.text}>{f}</text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
