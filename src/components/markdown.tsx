// Tiny, dependency-free Markdown renderer for the Assistant chat.
// Supports **bold**, *italic*, `code`, bullet lists (- or • or *), and blank-line paragraphs.
import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={key++} className="px-1 py-0.5 rounded bg-background text-[0.85em] font-mono">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("*")) nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ children }: { children: string }) {
  const lines = children.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: string[] | null = null;
  let para: string[] | null = null;
  let key = 0;
  const flushList = () => {
    if (list) {
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-0.5 my-1">
          {list.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
        </ul>
      );
      list = null;
    }
  };
  const flushPara = () => {
    if (para) {
      blocks.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(para.join("\n"))}</p>);
      para = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    if (bullet) {
      flushPara();
      (list ??= []).push(bullet[1]);
      continue;
    }
    if (line.trim() === "") {
      flushList();
      flushPara();
      continue;
    }
    flushList();
    (para ??= []).push(line);
  }
  flushList();
  flushPara();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
