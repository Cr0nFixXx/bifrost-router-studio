import { describe, it, expect } from 'vitest';
import { reorderWithinGroup } from './ruleOrder';
import type { RoutingRule } from '@/types/bifrost';

function rule(id: string, priority: number): RoutingRule {
  return {
    id,
    name: id,
    enabled: true,
    chain_rule: false,
    cel_expression: 'true',
    targets: [],
    fallbacks: [],
    scope: 'global',
    priority,
  };
}

describe('reorderWithinGroup', () => {
  it('priorities are densified to 0..n-1', () => {
    const all = [rule('a', 5), rule('b', 9), rule('c', 12)];
    const map = reorderWithinGroup(all, ['c', 'b', 'a']);
    expect([map.a, map.b, map.c].sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it('moves a dragged group to its new internal order and keeps others stable', () => {
    // global order A(0) B(1) C(2) D(3) E(4); group = B, C (a contiguous slice)
    const all = [rule('A', 0), rule('B', 1), rule('C', 2), rule('D', 3), rule('E', 4)];
    const map = reorderWithinGroup(all, ['C', 'B']);
    expect(map.A).toBe(0);
    expect(map.D).toBe(3);
    expect(map.E).toBe(4);
    expect(map.C).toBeLessThan(map.B);
  });

  it('reorders a non-contiguous group without disturbing the rest', () => {
    // A(0) B(1) C(2) D(3); group = A, C with new order C, A
    const all = [rule('A', 0), rule('B', 1), rule('C', 2), rule('D', 3)];
    const map = reorderWithinGroup(all, ['C', 'A']);
    expect(map.B).toBe(1);
    expect(map.D).toBe(3);
    expect(map.C).toBe(0);
    expect(map.A).toBe(2);
  });

  it('leaves an already-ordered group unchanged', () => {
    const all = [rule('A', 0), rule('B', 1), rule('C', 2)];
    const map = reorderWithinGroup(all, ['A', 'B', 'C']);
    expect(map).toEqual({ A: 0, B: 1, C: 2 });
  });

  it('gives every rule exactly one priority', () => {
    const all = [rule('A', 0), rule('B', 1), rule('C', 2), rule('D', 3)];
    const map = reorderWithinGroup(all, ['D', 'C', 'B', 'A']);
    expect(new Set(Object.values(map)).size).toBe(4);
  });
});
