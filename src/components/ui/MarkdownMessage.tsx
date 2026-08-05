import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[[^\]]+\]\([^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('`')) {
      out.push(<code key={key++} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.92em] text-neon">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      out.push(<strong key={key++} className="font-semibold text-ink">{inline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith('*')) {
      out.push(<em key={key++} className="italic text-ink-muted">{inline(token.slice(1, -1))}</em>);
    } else if (token.startsWith('[')) {
      const lm = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      if (lm) {
        out.push(<a key={key++} href={lm[2]} target="_blank" rel="noreferrer" className="text-neon underline decoration-neon/40 hover:decoration-neon">{lm[1]}</a>);
      } else out.push(token);
    } else out.push(token);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderTextBlocks(text: string): ReactNode[] {
  const lines = text.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? 'text-base' : level === 2 ? 'text-sm' : 'text-xs';
      nodes.push(<div key={key++} className={`mt-2 font-semibold text-ink ${cls}`}>{inline(heading[2])}</div>);
      i++; continue;
    }

    if (/^>\s?/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) block.push(lines[i++].replace(/^>\s?/, ''));
      nodes.push(<blockquote key={key++} className="border-l-2 border-neon/40 pl-3 text-ink-faint italic">{block.map((l, idx) => <div key={idx}>{inline(l)}</div>)}</blockquote>);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      nodes.push(<ul key={key++} className="list-disc pl-5 space-y-0.5">{items.map((it, idx) => <li key={idx}>{inline(it)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      nodes.push(<ol key={key++} className="list-decimal pl-5 space-y-0.5">{items.map((it, idx) => <li key={idx}>{inline(it)}</li>)}</ol>);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i++]);
    }
    nodes.push(<p key={key++} className="leading-relaxed break-words">{inline(para.join(' '))}</p>);
  }
  return nodes;
}

export function MarkdownMessage({ text }: { text: string }) {
  const parts = text.split(/```([^\n`]*)\n?([\s\S]*?)```/g);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i] ?? '';
    if (prose.trim()) nodes.push(...renderTextBlocks(prose));
    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (code !== undefined) {
      nodes.push(
        <div key={`code-${i}`} className="max-w-full overflow-hidden rounded-lg border border-border bg-canvas">
          {lang?.trim() && <div className="border-b border-border bg-surface-2 px-3 py-1 text-[10px] uppercase tracking-wider text-ink-faint">{lang.trim()}</div>}
          <pre className="overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed text-ink-muted"><code className="break-words">{code.replace(/\n$/, '')}</code></pre>
        </div>,
      );
    }
  }
  return <div className="min-w-0 max-w-full space-y-2 overflow-hidden break-words text-sm text-ink-muted">{nodes.length ? nodes : <p>{text}</p>}</div>;
}
