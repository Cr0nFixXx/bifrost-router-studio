import type { Edge } from 'reactflow';
import type { ProviderConfig, RoutingRule } from '@/types/bifrost';
import type { WFNode } from '@/types/workflow';
import { workflowToRules } from '@/lib/bifrostMapper';
import { fallbackToParts, fallbackToRef } from './modelRefs';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

function bounds(nodes: WFNode[]) {
  if (!nodes.length) return { minX: 0, minY: 0, width: 1200, height: 800 };
  const minX = Math.min(...nodes.map((n) => n.position.x)) - 120;
  const minY = Math.min(...nodes.map((n) => n.position.y)) - 100;
  const maxX = Math.max(...nodes.map((n) => n.position.x + 280)) + 140;
  const maxY = Math.max(...nodes.map((n) => n.position.y + 150)) + 120;
  return { minX, minY, width: Math.max(900, maxX - minX), height: Math.max(600, maxY - minY) };
}

const COLORS: Record<string, string> = {
  trigger: '#a78bfa', condition: '#fbbf24', logic: '#5eead4', target: '#22d3ee', fallback: '#f87171', provider: '#34d399', complexity: '#fbbf24', group: '#9a9aa3', model: '#5eead4'
};

export function workflowToSvg(nodes: WFNode[], edges: Edge[], title = 'Bifrost Router Studio'): string {
  const b = bounds(nodes);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeSvg = edges.map((e) => {
    const s = nodeById.get(e.source); const t = nodeById.get(e.target);
    if (!s || !t) return '';
    const x1 = s.position.x - b.minX + 250;
    const y1 = s.position.y - b.minY + 58;
    const x2 = t.position.x - b.minX;
    const y2 = t.position.y - b.minY + 58;
    const mx = (x1 + x2) / 2;
    const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    const label = (e.data as any)?.label;
    return `<path d="${path}" fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>${label ? `<text x="${mx}" y="${(y1+y2)/2-6}" fill="#94a3b8" font-size="11" text-anchor="middle">${esc(label)}</text>` : ''}`;
  }).join('\n');
  const nodeSvg = nodes.map((n) => {
    const x = n.position.x - b.minX; const y = n.position.y - b.minY;
    const c = COLORS[n.data.kind] ?? '#94a3b8';
    const subtitle = n.data.kind === 'target' ? `${(n.data as any).providerId || '?'} / ${(n.data as any).modelId || '?'}` : n.data.kind === 'condition' ? `${(n.data as any).field} ${(n.data as any).op} ${(n.data as any).value}` : n.data.kind === 'logic' ? ((n.data as any).combinator === '&&' ? 'all inputs must match' : 'any input may match') : n.data.kind;
    return `<g transform="translate(${x},${y})"><rect width="250" height="116" rx="16" fill="#131316" stroke="${c}" stroke-width="2"/><rect x="0" y="14" width="4" height="88" rx="2" fill="${c}"/><text x="18" y="32" fill="#e7e7ea" font-size="14" font-weight="700">${esc((n.data as any).label || n.data.kind)}</text><text x="18" y="54" fill="#9a9aa3" font-size="11">${esc(subtitle).slice(0, 48)}</text><text x="18" y="88" fill="${c}" font-size="10" font-family="monospace">${esc(n.data.kind)}</text></g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}" viewBox="0 0 ${b.width} ${b.height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs><rect width="100%" height="100%" fill="#090a0c"/><text x="24" y="34" fill="#e7e7ea" font-size="18" font-weight="700">${esc(title)}</text>${edgeSvg}${nodeSvg}</svg>`;
}

export async function workflowToRaster(nodes: WFNode[], edges: Edge[], type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const svg = workflowToSvg(nodes, edges);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    if (type === 'image/jpeg') { ctx.fillStyle = '#090a0c'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type, 0.92));
  } finally { URL.revokeObjectURL(url); }
}

export function workflowToMarkdown(nodes: WFNode[], edges: Edge[], providers: ProviderConfig[] = []): string {
  const rules = workflowToRules(nodes, edges);
  return `# Bifrost Router Studio Export\n\n- Nodes: ${nodes.length}\n- Connections: ${edges.length}\n- Rules: ${rules.length}\n- Providers: ${providers.length}\n\n## Rules\n\n${rules.map(ruleMd).join('\n\n')}\n\n## Connections\n\n${edges.map((e) => `- \`${e.source}\` → \`${e.target}\`${(e.data as any)?.label ? ` — ${(e.data as any).label}` : ''}`).join('\n')}\n`;
}
function ruleMd(r: RoutingRule): string {
  return `### ${r.priority}. ${r.name}\n\n- Enabled: ${r.enabled}\n- Scope: ${r.scope}${r.scope_id ? ` / ${r.scope_id}` : ''}\n- Chain re-eval: ${r.chain_rule}\n- CEL: \`${r.cel_expression}\`\n- Targets:\n${r.targets.map((t) => `  - ${t.provider ?? '?'} / ${t.model ?? '?'} · weight ${t.weight}${t.api_key ? ` · key ${t.api_key}` : ''}`).join('\n') || '  - none'}\n- Fallbacks:\n${r.fallbacks.map((f) => { const p = fallbackToParts(f); return `  - ${fallbackToRef(f)}${p.key_id ? ` · key ${p.key_id}` : ''}`; }).join('\n') || '  - none'}`;
}
