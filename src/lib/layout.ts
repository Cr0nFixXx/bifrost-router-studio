/**
 * Auto-layout engine for the canvas.
 *
 * Lays out routing graphs per rule/component instead of globally per layer. This
 * keeps vertical mode readable: each rule becomes a structured top→bottom
 * column, and horizontal mode becomes left→right rows. Shared condition nodes
 * are placed once and then reused by later rule components.
 */
import type { Edge } from 'reactflow';
import type { WFNode } from '@/types/workflow';

export type FlowDirection = 'LR' | 'TB';

const NODE_W = 260;
const NODE_H = 150;
const GAP_X = 260;
const GAP_Y = 150;
const COMPONENT_GAP_X = 220;
const COMPONENT_GAP_Y = 180;

type Pos = { x: number; y: number };

function sortNodes(a: WFNode, b: WFNode): number {
  if (a.data.kind === 'trigger' && b.data.kind === 'trigger') return ((a.data as any).priority ?? 0) - ((b.data as any).priority ?? 0);
  return String((a.data as any).label ?? a.id).localeCompare(String((b.data as any).label ?? b.id));
}

function collectRuleComponent(root: string, nodesById: Map<string, WFNode>, forward: Map<string, string[]>, reverse: Map<string, string[]>): Set<string> {
  const out = new Set<string>([root]);
  const queue = [...(forward.get(root) ?? [])];

  const addLogicInputs = (logicId: string) => {
    for (const src of reverse.get(logicId) ?? []) {
      const srcNode = nodesById.get(src);
      if (!srcNode || (srcNode.data.kind !== 'condition' && srcNode.data.kind !== 'logic')) continue;
      if (out.has(src)) continue;
      out.add(src);
      if (srcNode.data.kind === 'logic') addLogicInputs(src);
    }
  };

  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    const node = nodesById.get(id);
    if (!node) continue;
    out.add(id);
    if (node.data.kind === 'logic') addLogicInputs(id);
    queue.push(...(forward.get(id) ?? []));
  }
  return out;
}

function componentLevels(ids: Set<string>, forward: Map<string, string[]>, reverse: Map<string, string[]>): Map<string, number> {
  const level = new Map<string, number>();
  const indeg = new Map<string, number>();
  ids.forEach((id) => indeg.set(id, 0));
  ids.forEach((id) => {
    for (const tgt of forward.get(id) ?? []) if (ids.has(tgt)) indeg.set(tgt, (indeg.get(tgt) ?? 0) + 1);
  });
  const roots = [...ids].filter((id) => (indeg.get(id) ?? 0) === 0);
  roots.forEach((r) => level.set(r, 0));
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift()!;
    const base = level.get(id) ?? 0;
    for (const tgt of forward.get(id) ?? []) {
      if (!ids.has(tgt)) continue;
      level.set(tgt, Math.max(level.get(tgt) ?? 0, base + 1));
      queue.push(tgt);
    }
  }
  ids.forEach((id) => { if (!level.has(id)) level.set(id, 0); });

  // Improve readability: condition inputs of a logic node should sit one layer
  // before that logic node, even when they have no incoming edge from the rule.
  ids.forEach((id) => {
    for (const src of reverse.get(id) ?? []) {
      if (!ids.has(src)) continue;
      const srcNodeKind = src.includes('condition') ? 'condition' : undefined;
      const targetLevel = level.get(id) ?? 1;
      if (srcNodeKind === 'condition') level.set(src, Math.max(0, targetLevel - 1));
    }
  });
  return level;
}

export function autoLayout(nodes: WFNode[], edges: Edge[], direction: FlowDirection = 'LR'): WFNode[] {
  if (nodes.length === 0) return nodes;

  const layoutable = nodes.filter((n) => !n.parentNode && n.data.kind !== 'group' && n.data.kind !== 'annotation');
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  layoutable.forEach((n) => { forward.set(n.id, []); reverse.set(n.id, []); });
  edges.forEach((e) => {
    if (!forward.has(e.source) || !reverse.has(e.target)) return;
    if (e.sourceHandle === 'chainout' || e.targetHandle === 'chainin') return;
    forward.get(e.source)!.push(e.target);
    reverse.get(e.target)!.push(e.source);
  });

  const triggers = layoutable.filter((n) => n.data.kind === 'trigger').sort(sortNodes);
  const otherRoots = layoutable.filter((n) => n.data.kind !== 'trigger' && (reverse.get(n.id)?.length ?? 0) === 0).sort(sortNodes);
  const roots = [...triggers, ...otherRoots];
  const positioned = new Map<string, Pos>();
  let cursorX = 80;
  let cursorY = 80;

  for (const root of roots) {
    if (positioned.has(root.id)) continue;
    const comp = collectRuleComponent(root.id, nodesById, forward, reverse);
    // Do not relocate already-positioned shared nodes; they visually remain as
    // the single shared condition in simple mode.
    const ids = new Set([...comp].filter((id) => !positioned.has(id)));
    if (ids.size === 0) continue;
    const levels = componentLevels(ids, forward, reverse);
    const layers = new Map<number, string[]>();
    ids.forEach((id) => {
      const l = levels.get(id) ?? 0;
      const arr = layers.get(l) ?? [];
      arr.push(id);
      layers.set(l, arr);
    });
    layers.forEach((arr) => arr.sort((a, b) => sortNodes(nodesById.get(a)!, nodesById.get(b)!)));
    const layerKeys = [...layers.keys()].sort((a, b) => a - b);
    const maxItems = Math.max(...layerKeys.map((l) => layers.get(l)!.length), 1);
    const layerCount = Math.max(...layerKeys, 0) + 1;

    for (const l of layerKeys) {
      const idsInLayer = layers.get(l)!;
      idsInLayer.forEach((id, idx) => {
        if (direction === 'LR') positioned.set(id, { x: cursorX + l * (NODE_W + GAP_X), y: cursorY + idx * (NODE_H + GAP_Y) });
        else positioned.set(id, { x: cursorX + idx * (NODE_W + GAP_X), y: cursorY + l * (NODE_H + GAP_Y) });
      });
    }

    if (direction === 'LR') cursorY += maxItems * (NODE_H + GAP_Y) + COMPONENT_GAP_Y;
    else cursorX += maxItems * (NODE_W + GAP_X) + COMPONENT_GAP_X;
    if (direction === 'TB') cursorY = 80;
    if (direction === 'LR') cursorX = 80;
  }

  // Any remaining disconnected nodes are placed in a tidy strip.
  let rest = 0;
  for (const n of layoutable) {
    if (positioned.has(n.id)) continue;
    if (direction === 'LR') positioned.set(n.id, { x: 80, y: cursorY + rest++ * (NODE_H + GAP_Y) });
    else positioned.set(n.id, { x: cursorX + rest++ * (NODE_W + GAP_X), y: 80 });
  }

  return nodes.map((n) => n.parentNode || n.data.kind === 'group' || n.data.kind === 'annotation'
    ? n
    : ({ ...n, position: positioned.get(n.id) ?? n.position } as WFNode));
}
