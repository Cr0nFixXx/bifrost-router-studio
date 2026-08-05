/**
 * Priority reordering for routing rules.
 *
 * Bifrost evaluates rules first-match-wins by ascending `priority`, so priority
 * is a single global ordering across all scopes. The Rules panel groups rules
 * by scope for readability, but dragging within a group should still reorder the
 * underlying global priority list without disturbing the relative order of
 * rules in other scopes.
 *
 * `reorderWithinGroup` takes the *full* rule set (global), the ids of the group
 * being reordered in their *new* order, and returns a new `id -> priority` map
 * (priorities densified to 0..n-1). The dragged group keeps its global
 * neighbourhood; only its internal order changes.
 */
import type { RoutingRule } from '@/types/bifrost';

export function reorderWithinGroup(
  all: RoutingRule[],
  groupIdsInNewOrder: string[],
): Record<string, number> {
  const idSet = new Set(groupIdsInNewOrder);
  const sorted = [...all].sort((a, b) => a.priority - b.priority);

  // Positions (into `sorted`) that the group's members currently occupy.
  const removedIndices: number[] = [];
  const rest: RoutingRule[] = [];
  sorted.forEach((r, i) => {
    if (idSet.has(r.id)) removedIndices.push(i);
    else rest.push(r);
  });

  // The group members, arranged in their new order.
  const orderPos = new Map(groupIdsInNewOrder.map((id, i) => [id, i]));
  const groupItems = sorted
    .filter((r) => idSet.has(r.id))
    .sort((a, b) => (orderPos.get(a.id)! - orderPos.get(b.id)!));

  // Rebuild: slide the group members back into the slots they vacated, in the
  // new order; every other rule keeps both its order and its global position.
  const rebuilt: RoutingRule[] = [];
  let ri = 0;
  let gi = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (gi < removedIndices.length && removedIndices[gi] === i) {
      rebuilt.push(groupItems[gi]);
      gi++;
    } else {
      rebuilt.push(rest[ri++]);
    }
  }

  const map: Record<string, number> = {};
  rebuilt.forEach((r, idx) => {
    map[r.id] = idx;
  });
  return map;
}
