import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/store/useStore';
import { rulesToWorkflow } from '@/lib/bifrostMapper';
import type { RoutingRule } from '@/types/bifrost';

const base: RoutingRule = {
  id: 'r1', name: 'A', enabled: true, chain_rule: false,
  cel_expression: 'true',
  targets: [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
  fallbacks: [], scope: 'global', scope_id: null, priority: 0,
};

const second: RoutingRule = { ...base, id: 'r2', name: 'B', priority: 1 };

/**
 * The store used to keep a connect-time `rules` snapshot alongside the canvas
 * and write priorities back into it. These two cases pin the replacement
 * invariant: there is exactly one projection, and it is the canvas.
 */
describe('rules projection', () => {
  beforeEach(() => {
    const { nodes, edges } = rulesToWorkflow([base, second], { dedupeConditions: true });
    useStore.setState({ nodes, edges, providers: [] });
  });

  it('reorders priorities in the canvas projection, not in a snapshot', () => {
    useStore.getState().reorderRulePriority('r1', 'down');

    const byId = Object.fromEntries(useStore.getState().getCanvasRules().map((r) => [r.id, r.priority]));
    expect(byId).toEqual({ r1: 1, r2: 0 });

    // Nothing beyond the canvas may appear in the projection.
    expect(useStore.getState().getCanvasRules().map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('shows a canvas edit immediately, so an export cannot write stale rules', () => {
    const trigger = useStore.getState().nodes.find((n) => n.data.kind === 'trigger');
    expect(trigger).toBeDefined();
    useStore.getState().updateNodeData(trigger!.id, { label: 'renamed' });

    expect(useStore.getState().getCanvasRules().map((r) => r.name)).toContain('renamed');
  });
});
