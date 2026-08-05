import { describe, it, expect } from 'vitest';
import { validateGraph } from './validation';
import type { WFNode } from '@/types/workflow';

const trigger = (id: string, cel = 'true'): WFNode =>
  ({ id, type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: id, triggerKind: 'cel', celGroup: { id: 'g', combinator: '&&', conditions: [] }, celExpression: cel, enabled: true, priority: 0, scope: 'global', scopeId: null, chainRule: false } }) as WFNode;

const target = (id: string, weight = 1): WFNode =>
  ({ id, type: 'target', position: { x: 1, y: 0 }, data: { kind: 'target', label: id, providerId: 'openai', modelId: 'gpt-4o', weight } }) as WFNode;

const fb = (id: string): WFNode =>
  ({ id, type: 'fallback', position: { x: 2, y: 0 }, data: { kind: 'fallback', label: id, providerId: 'anthropic', modelId: 'claude', order: 0 } }) as WFNode;

const edge = (s: string, t: string, sh = 'out', th = 'in'): any => ({ id: `${s}-${t}`, source: s, sourceHandle: sh, target: t, targetHandle: th });

describe('validation engine', () => {
  it('flags a trigger with no target as an error', () => {
    const diags = validateGraph([trigger('t')], []);
    expect(diags.some((d) => d.level === 'error' && d.nodeIds.includes('t'))).toBe(true);
  });

  it('passes a well-formed trigger -> target -> fallback chain', () => {
    const nodes = [trigger('t'), target('tg'), fb('f')];
    const edges = [edge('t', 'tg'), edge('tg', 'f', 'fbout')];
    const diags = validateGraph(nodes, edges);
    expect(diags.filter((d) => d.level === 'error')).toHaveLength(0);
  });

  it('warns when target weights do not sum to 1', () => {
    const nodes = [trigger('t'), target('tg', 0.5)];
    const edges = [edge('t', 'tg')];
    const diags = validateGraph(nodes, edges);
    expect(diags.some((d) => d.title?.includes('weight') ?? d.detail.includes('1'))).toBe(true);
  });

  it('warns about missing scope id for non-global scope', () => {
    const nodes = [trigger('t')];
    nodes[0].data = { ...(nodes[0].data as any), scope: 'team', scopeId: null } as any;
    const diags = validateGraph(nodes, [edge('t', 'tg')]);
    expect(diags.some((d) => d.title?.includes('Scope'))).toBe(true);
  });

  it('detects cycles', () => {
    const nodes = [trigger('t'), target('tg')];
    const edges = [edge('t', 'tg'), { id: 'back', source: 'tg', sourceHandle: 'fbout', target: 't', targetHandle: 'in', type: 'flow' }];
    const diags = validateGraph(nodes, edges);
    expect(diags.some((d) => d.title?.toLowerCase().includes('cyclic'))).toBe(true);
  });

  it('flags invalid CEL', () => {
    const diags = validateGraph([trigger('t', 'model = ') ], []);
    expect(diags.some((d) => d.title?.toLowerCase().includes('cel'))).toBe(true);
  });

  it('flags duplicate persisted rule ids before save', () => {
    const a = trigger('a');
    const b = trigger('b');
    a.data = { ...(a.data as any), ruleId: 'same-db-id' } as any;
    b.data = { ...(b.data as any), ruleId: 'same-db-id' } as any;
    const nodes = [a, b, target('ta'), target('tb')];
    const edges = [edge('a', 'ta'), edge('b', 'tb')];
    const diags = validateGraph(nodes, edges);
    expect(diags.some((d) => d.level === 'error' && d.title === 'Duplicate persisted rule ID' && d.nodeIds.includes('a') && d.nodeIds.includes('b'))).toBe(true);
  });


  it('warns when a trigger has no UUID ruleId', () => {
    const n = trigger('legacy-node-id');
    const diags = validateGraph([n, target('tg')], [edge('legacy-node-id', 'tg')]);
    expect(diags.some((d) => d.level === 'warning' && d.title === 'Rule ID is not a UID')).toBe(true);
  });

});
