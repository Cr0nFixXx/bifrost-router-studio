/**
 * Rules panel — lists routing rules grouped by scope (global / customer /
 * team / virtual_key) with priority, sorted lowest-first, and lets you
 * reorder priority, jump to the rule's trigger on the canvas, or delete it.
 *
 * This satisfies the "drag-to-reorder priority" TODO item: rules can be
 * reordered by dragging within a scope group (pointer-based) or with the
 * up/down controls. Dragging reorders the global first-match priority list.
 */
import { useMemo, useState } from 'react';
import { Reorder } from 'framer-motion';
import { ArrowUp, ArrowDown, Trash2, Eye, Globe, Building2, Users, KeyRound, AlertTriangle, GripVertical, Copy, Download } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { workflowToRules } from '@/lib/bifrostMapper';
import { IconButton, Chip, EmptyState } from '@/components/ui/primitives';
import type { RuleScope } from '@/types/bifrost';

const SCOPE_META: Record<RuleScope, { icon: React.ReactNode; label: string }> = {
  global: { icon: <Globe size={14} />, label: 'Global' },
  customer: { icon: <Building2 size={14} />, label: 'Customer' },
  team: { icon: <Users size={14} />, label: 'Team' },
  virtual_key: { icon: <KeyRound size={14} />, label: 'Virtual Key' },
};

export function RulesPanel() {
  const storedRules = useStore((s) => s.rules);
  const dragReorder = useStore((s) => s.reorderRulesByIds);
  const reorderPriority = useStore((s) => s.reorderRulePriority);
  const deleteNode = useStore((s) => s.deleteNode);
  const duplicateRule = useStore((s) => s.duplicateRule);
  const copyRuleJson = useStore((s) => s.copyRuleJson);
  const selectNode = useStore((s) => s.selectNode);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const rules = useMemo(() => workflowToRules(nodes as any, edges), [nodes, edges]);
  const displayedRules = rules.length ? rules : storedRules;

  const grouped = useMemo(() => {
    const g: Record<string, typeof rules> = {};
    for (const r of [...displayedRules].sort((a, b) => a.priority - b.priority)) {
      const key = r.scope === 'global' ? 'global' : `${r.scope}:${r.scope_id ?? '?'}`;
      (g[key] ??= []).push(r);
    }
    return g;
  }, [displayedRules]);

  const nodeForRule = (ruleId: string) => nodes.find((n) => (n.data as any).ruleId === ruleId || n.id === ruleId);

  const focus = (ruleId: string) => {
    const node = nodeForRule(ruleId);
    if (node) {
      selectNode(node.id);
      useStore.getState().setRightTab('inspector');
    }
  };

  if (displayedRules.length === 0) {
    return <EmptyState icon={<AlertTriangle size={28} />} title="No rules yet" description="Add a trigger node on the canvas or apply a template to create your first rule." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Rules</div>
          <div className="text-sm font-semibold text-ink">{displayedRules.length} routing rules</div>
        </div>
        <Chip tone="amber">first-match-wins</Chip>
      </div>

      {Object.entries(grouped).map(([key, list]) => {
        const [scope, scopeId] = key.split(':');
        const meta = SCOPE_META[scope as RuleScope];
        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2 text-ink-faint">
              <span className="text-neon-violet">{meta.icon}</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold">{meta.label}</span>
              {scopeId && <span className="text-[11px] text-ink-faint">· {scopeId}</span>}
              <span className="text-[11px] text-ink-faint ml-auto">{list.length}</span>
            </div>
            <Reorder.Group axis="y" values={list.map((r) => r.id)} onReorder={(ids) => dragReorder(ids as string[])} className="space-y-1.5">
              {list.map((rule, idx) => (
                <Reorder.Item
                  key={rule.id}
                  value={rule.id}
                  className="rounded-lg bg-surface-2/60 border border-border px-3 py-2 hover:border-border-strong transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-ink-faint cursor-grab active:cursor-grabbing" title="Drag to reorder"><GripVertical size={14} /></span>
                    <span className="text-[10px] font-mono text-ink-faint w-6 text-right">{rule.priority}</span>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => focus(rule.id)}>
                      <div className="text-sm text-ink truncate flex items-center gap-1.5">
                        {!rule.enabled && <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" title="disabled" />}
                        {rule.name}
                      </div>
                      <div className="text-[10px] text-ink-faint font-mono truncate">{rule.cel_expression}</div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <IconButton label="Raise priority" onClick={() => reorderPriority(rule.id, 'up')} disabled={idx === 0}>
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton label="Lower priority" onClick={() => reorderPriority(rule.id, 'down')} disabled={idx === list.length - 1}>
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton label="View on canvas" onClick={() => focus(rule.id)}>
                        <Eye size={14} />
                      </IconButton>
                      <IconButton label="Duplicate whole rule" onClick={() => duplicateRule(rule.id)}>
                        <Copy size={14} />
                      </IconButton>
                      <IconButton label="Copy/export rule JSON" onClick={() => copyRuleJson(rule.id)}>
                        <Download size={14} />
                      </IconButton>
                      <IconButton label="Delete rule" onClick={() => { const n = nodeForRule(rule.id); if (n) deleteNode(n.id); }}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>
        );
      })}
    </div>
  );
}
