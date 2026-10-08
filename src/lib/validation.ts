/**
 * Real-time validation engine for the workflow graph.
 *
 * Surfaces Bifrost-specific problems directly on the canvas: triggers with no
 * targets, weight sums != 1, invalid CEL, cycles in the fallback chain, and missing scope IDs.
 */
import type { Edge } from 'reactflow';
import type { FallbackNodeData, WFNode } from '@/types/workflow';
import { validateCEL } from './cel';
import { isRuleUid } from './ruleIds';
import { fallbackFromParts, fallbackToParts } from './modelRefs';
import { collectReachable } from './bifrostMapper';
import { WEIGHT_WARN_EPSILON, weightSum } from './ruleShape';

export type DiagnosticLevel = 'error' | 'warning' | 'info';

export interface Diagnostic {
  id: string;
  level: DiagnosticLevel;
  nodeIds: string[]; // nodes to highlight
  title: string;
  detail: string;
}

function detectCycle(nodes: WFNode[], edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => adj.get(e.source)?.push(e.target));
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited,1 in-stack,2 done
  let cyclic = false;

  const dfs = (id: string) => {
    state.set(id, 1);
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) cyclic = true;
      else if (s === 0) dfs(next);
    }
    state.set(id, 2);
  };
  nodes.forEach((n) => {
    if ((state.get(n.id) ?? 0) === 0) dfs(n.id);
  });
  return cyclic;
}

export function validateGraph(nodes: WFNode[], edges: Edge[]): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /** The one traversal, in node form — `bifrostMapper` owns the algorithm. */
  const reachable = (startId: string, kind: WFNode['data']['kind']): WFNode[] =>
    collectReachable(startId, edges, kind, nodes)
      .map((id) => byId.get(id))
      .filter((n): n is WFNode => !!n);


  const triggers = nodes.filter((n) => n.data.kind === 'trigger');
  const targets = nodes.filter((n) => n.data.kind === 'target');
  const fallbacks = nodes.filter((n) => n.data.kind === 'fallback');

  const outTargets = (id: string) =>
    edges.filter((e) => e.source === id).map((e) => byId.get(e.target)).filter(Boolean);

  // 1) Triggers need at least one target. Targets can be direct or reachable
  // through intermediate router/logic nodes.
  triggers.forEach((t) => {
    const outs = reachable(t.id, 'target');
    if (outs.length === 0) {
      diags.push({
        id: `no-target-${t.id}`,
        level: 'error',
        nodeIds: [t.id],
        title: 'Trigger has no target',
        detail: `Rule "${t.data.label}" will never route. Connect it to at least one Target node.`,
      });
    } else {
      // weight sum check
      const sum = weightSum(outs.map((n) => {
        const d = n.data as { routes?: Array<{ weight?: number }>; weight?: number };
        return { weight: d.routes?.length ? weightSum(d.routes) : d.weight };
      }));
      if (Math.abs(sum - 1) > WEIGHT_WARN_EPSILON) {
        diags.push({
          id: `weight-${t.id}`,
          level: 'warning',
          nodeIds: [t.id, ...outs.map((n) => n.id)],
          title: 'Target weights do not sum to 1',
          detail: `Weights currently sum to ${sum.toFixed(2)}. Bifrost expects them to total 1.0 (currently interpreted as relative).`,
        });
      }
    }

    // Bifrost fallbacks are rule-level (`routing_rules.fallbacks`), not
    // target-level. Warn once per rule if no fallback is reachable.
    const fb = reachable(t.id, 'fallback');
    if (outs.length > 0 && fb.length === 0) {
      diags.push({
        id: `no-fb-${t.id}`,
        level: 'warning',
        nodeIds: [t.id],
        title: 'No fallback configured',
        detail: `Rule "${t.data.label}" has no rule-level fallback chain. A target failure will surface directly to the caller.`,
      });
    }
  });

  // 3) Fallback nodes should not feed other targets (would create chains).
  fallbacks.forEach((fb) => {
    const downstream = outTargets(fb.id);
    if (downstream.length > 0) {
      diags.push({
        id: `fb-chain-${fb.id}`,
        level: 'warning',
        nodeIds: [fb.id, ...downstream.map((n) => n!.id)],
        title: 'Fallback feeds downstream node',
        detail: 'Fallbacks are terminal in Bifrost. This edge is informational only.',
      });
    }
    // Bifrost >= 2.2.4 rejects a rule whose fallback has no provider.
    const data = fb.data as FallbackNodeData;
    const entries = (data.fallbacks?.length ? data.fallbacks : [fallbackFromParts(data.providerId, data.modelId)]).map(fallbackToParts);
    entries.forEach((entry, idx) => {
      if (!entry.provider) {
        diags.push({
          id: `fb-no-provider-${fb.id}-${idx}`,
          level: 'error',
          nodeIds: [fb.id],
          title: 'Fallback without provider',
          detail: `Fallback #${idx + 1} has no provider. Bifrost rejects the rule on create/update.`,
        });
      }
      if (entry.key_id) {
        diags.push({
          id: `fb-pinned-${fb.id}-${idx}`,
          level: 'warning',
          nodeIds: [fb.id],
          title: 'Pinned fallback key',
          detail: `Fallback #${idx + 1} pins key "${entry.key_id}". Bifrost 2.2.2 and older cannot decode pinned fallbacks and would disable all routing rules on downgrade.`,
        });
      }
    });
  });

  // 5) CEL validation on triggers.
  triggers.forEach((t) => {
    const data = t.data as any;
    if (data.triggerKind !== 'complexity') {
      const cel = data.celExpression ?? '';
      validateCEL(cel).forEach((d) =>
        diags.push({
          id: `cel-${t.id}-${d.line}`,
          level: d.severity,
          nodeIds: [t.id],
          title: `CEL ${d.severity}: ${d.message}`,
          detail: `"${cel}"`,
        }),
      );
    }
  });

  // 6) Scope checks.
  triggers.forEach((t) => {
    const data = t.data as any;
    if (data.scope !== 'global' && !data.scopeId) {
      diags.push({
        id: `scope-${t.id}`,
        level: 'warning',
        nodeIds: [t.id],
        title: 'Scope requires a scope ID',
        detail: `Scope "${data.scope}" needs a scope_id (e.g. team-uuid) to take effect.`,
      });
    }
  });

  // 7) Duplicate rule names.
  const seen = new Map<string, string[]>();
  triggers.forEach((t) => {
    const arr = seen.get(t.data.label) ?? [];
    arr.push(t.id);
    seen.set(t.data.label, arr);
  });
  seen.forEach((ids, name) => {
    if (ids.length > 1) {
      diags.push({
        id: `dup-${name}`,
        level: 'warning',
        nodeIds: ids,
        title: 'Duplicate rule name',
        detail: `Multiple rules share the name "${name}". Rule names should be unique.`,
      });
    }
  });

  // 8) Duplicate persisted rule IDs. This can happen when a Rule node is
  // duplicated with its DB `ruleId` still attached. Saving such a graph would
  // violate the routing_rules primary key.
  const ruleIdSeen = new Map<string, string[]>();
  triggers.forEach((t) => {
    const id = (t.data as any).ruleId ?? t.id;
    const arr = ruleIdSeen.get(id) ?? [];
    arr.push(t.id);
    ruleIdSeen.set(id, arr);
  });
  ruleIdSeen.forEach((ids, ruleId) => {
    if (ids.length > 1) {
      diags.push({
        id: `dup-rule-id-${ruleId}`,
        level: 'error',
        nodeIds: ids,
        title: 'Duplicate persisted rule ID',
        detail: `Multiple Rule nodes use the same routing_rules.id "${ruleId}". Save will auto-repair duplicates by assigning fresh IDs, but you should review these rules.`,
      });
    }
  });
  triggers.forEach((t) => {
    const ruleId = (t.data as any).ruleId;
    if (!isRuleUid(ruleId)) {
      diags.push({
        id: `invalid-rule-id-${t.id}`,
        level: 'warning',
        nodeIds: [t.id],
        title: 'Rule ID is not a UID',
        detail: `Rule "${t.data.label}" has no valid UUID ruleId. Save will auto-assign a fresh UID.`,
      });
    }
  });

  // 9) Cycle detection.
  if (detectCycle(nodes, edges)) {
    diags.push({
      id: 'cycle',
      level: 'error',
      nodeIds: [],
      title: 'Cyclic dependency detected',
      detail: 'The graph contains a cycle. Routing evaluation could loop indefinitely.',
    });
  }

  return diags;
}

export function diagnosticsForNode(diags: Diagnostic[], nodeId: string): Diagnostic[] {
  return diags.filter((d) => d.nodeIds.includes(nodeId));
}
