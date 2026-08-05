import { Search, X, Target, GitBranch } from 'lucide-react';
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { workflowToRules } from '@/lib/bifrostMapper';
import { Button, Chip, EmptyState } from '@/components/ui/primitives';

export function SearchPanel() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const query = useStore((s) => s.searchQuery);
  const setQuery = useStore((s) => s.setSearchQuery);
  const setHighlighted = useStore((s) => s.setHighlightedNodeIds);
  const selectNode = useStore((s) => s.selectNode);
  const setRightTab = useStore((s) => s.setRightTab);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [] as Array<{ id: string; type: 'node' | 'rule'; title: string; detail: string; nodeIds: string[] }>;
    const out: Array<{ id: string; type: 'node' | 'rule'; title: string; detail: string; nodeIds: string[] }> = [];
    for (const n of nodes) {
      const hay = JSON.stringify({ id: n.id, type: n.type, data: n.data }).toLowerCase();
      if (hay.includes(q)) out.push({ id: `node:${n.id}`, type: 'node', title: (n.data as any).label ?? n.id, detail: `${n.data.kind} · ${n.id}`, nodeIds: [n.id] });
    }
    const rules = workflowToRules(nodes as any, edges);
    for (const r of rules) {
      const hay = JSON.stringify(r).toLowerCase();
      if (!hay.includes(q)) continue;
      const trigger = nodes.find((n) => n.id === r.id || (n.data as any).ruleId === r.id);
      out.push({ id: `rule:${r.id}`, type: 'rule', title: r.name, detail: r.cel_expression, nodeIds: trigger ? [trigger.id] : [] });
    }
    return out.slice(0, 80);
  }, [q, nodes, edges]);

  const highlightAll = () => setHighlighted(Array.from(new Set(results.flatMap((r) => r.nodeIds))));
  const clear = () => { setQuery(''); setHighlighted([]); };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-ink-faint" />
          <input className="input pl-9" autoFocus placeholder="Search rules, CEL, provider, model, node id..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="outline" onClick={highlightAll}>Highlight all</Button>
        <Button variant="ghost" onClick={clear}><X size={14} /> Clear</Button>
      </div>

      <div className="text-xs text-ink-faint">{results.length} results · click a result to select and highlight it.</div>
      {q && results.length === 0 && <EmptyState icon={<Search size={28} />} title="No matches" description="Try a provider, model, CEL field, rule name or node id." />}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { setHighlighted(r.nodeIds); if (r.nodeIds[0]) selectNode(r.nodeIds[0]); setRightTab('inspector'); }}
            className="w-full rounded-xl border border-border bg-surface-2/50 p-3 text-left hover:border-neon/40 hover:bg-surface-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              {r.type === 'rule' ? <GitBranch size={14} className="text-neon-violet" /> : <Target size={14} className="text-neon-cyan" />}
              <span className="text-sm font-semibold text-ink truncate">{r.title}</span>
              <Chip tone={r.type === 'rule' ? 'violet' : 'cyan'}>{r.type}</Chip>
            </div>
            <div className="mt-1 text-[11px] text-ink-faint font-mono truncate">{r.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
