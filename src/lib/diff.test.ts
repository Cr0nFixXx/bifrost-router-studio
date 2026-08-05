import { describe, it, expect } from 'vitest';
import { diffRules, summarizeDiff } from './diff';
import type { RoutingRule } from '@/types/bifrost';

function rule(id: string, over: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id,
    name: id,
    enabled: true,
    chain_rule: false,
    cel_expression: 'true',
    targets: [],
    fallbacks: [],
    scope: 'global',
    priority: 0,
    ...over,
  };
}

describe('diffRules', () => {
  it('flags added, removed, modified and unchanged rules', () => {
    const base = [rule('a'), rule('b', { name: 'old' }), rule('c')];
    const next = [rule('a'), rule('b', { name: 'new' }), rule('d')];
    const by = Object.fromEntries(diffRules(base, next).map((d) => [d.id, d.kind]));
    expect(by).toEqual({ a: 'unchanged', b: 'modified', c: 'removed', d: 'added' });
  });

  it('reports field-level changes for modified rules', () => {
    const base = [rule('a', { priority: 0, cel_expression: 'true' })];
    const next = [rule('a', { priority: 5, cel_expression: 'model == "gpt-4o"' })];
    const d = diffRules(base, next).find((x) => x.id === 'a')!;
    expect(d.kind).toBe('modified');
    expect(d.changes.map((c) => c.field).sort()).toEqual(['cel_expression', 'priority']);
  });

  it('treats identical rules as unchanged', () => {
    const a = rule('a', { targets: [{ weight: 1 }] });
    const b = rule('a', { targets: [{ weight: 1 }] });
    expect(diffRules([a], [b])[0].kind).toBe('unchanged');
  });

  it('detects target list changes', () => {
    const base = [rule('a', { targets: [{ provider: 'openai', weight: 1 }] })];
    const next = [rule('a', { targets: [{ provider: 'anthropic', weight: 1 }] })];;
    expect(diffRules(base, next)[0].kind).toBe('modified');
  });
});

describe('summarizeDiff', () => {
  it('counts each change kind and the dirty flag', () => {
    const base = [rule('a'), rule('b'), rule('c')];
    const next = [rule('a'), rule('b', { name: 'x' }), rule('d')];
    const s = summarizeDiff(diffRules(base, next));
    expect(s).toEqual({ added: 1, removed: 1, modified: 1, unchanged: 1, dirty: true });
  });

  it('is not dirty when nothing changed', () => {
    const r = rule('a');
    const s = summarizeDiff(diffRules([r], [rule('a')]));
    expect(s.dirty).toBe(false);
    expect(s.unchanged).toBe(1);
  });
});
