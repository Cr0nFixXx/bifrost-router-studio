/**
 * Mapping between the visual workflow graph and the Bifrost routing-rule model.
 *
 *   Trigger node  ->  RoutingRule (cel_expression, scope, priority, chain_rule)
 *   Target node   ->  rule.targets[]   (provider/model/weight)
 *   Fallback node ->  rule.fallbacks[] ("provider/model" strings, in order)
 *   Complexity    ->  a Trigger whose CEL is built from complexity_tier
 *
 * This is the single source of truth for converting both directions so the
 * canvas and a Bifrost config.json never drift.
 */
import type { Edge, Node } from 'reactflow';
import type { CELCondition, CELGroup, RoutingRule } from '@/types/bifrost';
import type {
  ConditionNodeData,
  FallbackNodeData,
  LogicNodeData,
  ModelNodeData,
  TargetNodeData,
  TriggerNodeData,
  WFNode,
} from '@/types/workflow';
import { compileGroup, emitCondition, parseExpression } from './cel';

const handle = (e: Edge) => (e.sourceHandle ?? 'out').split('.').pop() ?? 'out';

/**
 * Breadth-first collection of nodes of `wantKind` reachable from `startId`,
 * following any number of intermediate nodes (trigger -> complexity -> target,
 * target -> fallback, etc.). Returns ids in discovery order.
 */
function collectReachable(
  startId: string,
  edges: Edge[],
  wantKind: string,
  nodes: WFNode[],
): string[] {
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    // Chain-rule visualization edges connect trigger -> trigger and must not be
    // interpreted as routing targets/fallbacks for the source rule.
    if (e.sourceHandle === 'chainout' || e.targetHandle === 'chainin') return;
    const arr = adj.get(e.source) ?? [];
    arr.push(e.target);
    adj.set(e.source, arr);
  });
  const seen = new Set<string>([startId]);
  const queue = [...(adj.get(startId) ?? [])];
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node?.data.kind === wantKind) out.push(id);
    else queue.push(...(adj.get(id) ?? []));
  }
  return out;
}

void handle;

function compileExpressionNode(id: string, nodes: WFNode[], edges: Edge[]): string {
  const node = nodes.find((n) => n.id === id);
  if (!node) return 'true';
  if (node.data.kind === 'condition') return emitCondition({ ...(node.data as ConditionNodeData), id });
  if (node.data.kind === 'logic') {
    const logic = node.data as LogicNodeData;
    const inputs = edges
      .filter((e) => e.target === id)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is WFNode => !!n && (n.data.kind === 'condition' || n.data.kind === 'logic'));
    if (inputs.length === 0) return 'true';
    return inputs
      .map((n) => n.data.kind === 'logic' ? `(${compileExpressionNode(n.id, nodes, edges)})` : compileExpressionNode(n.id, nodes, edges))
      .join(` ${logic.combinator} `);
  }
  return 'true';
}

function expressionForTrigger(trigger: Node<TriggerNodeData>, nodes: WFNode[], edges: Edge[]): string {
  const roots = edges
    .filter((e) => e.source === trigger.id)
    .map((e) => nodes.find((n) => n.id === e.target))
    .filter((n): n is WFNode => !!n && (n.data.kind === 'condition' || n.data.kind === 'logic'));
  if (roots.length === 0) {
    const raw = trigger.data.celExpression?.trim() || compileGroup(trigger.data.celGroup);
    const parsed = parseExpression(raw);
    return parsed.warnings.length === 0 ? compileGroup(parsed.group) : raw;
  }
  return roots
    .map((n) => n.data.kind === 'logic' ? `(${compileExpressionNode(n.id, nodes, edges)})` : compileExpressionNode(n.id, nodes, edges))
    .join(' && ')
    .replace(/^\((.*)\)$/, '$1');
}

export function workflowToRules(nodes: WFNode[], edges: Edge[]): RoutingRule[] {
  const rules: RoutingRule[] = [];
  const triggers = nodes.filter((n) => n.data.kind === 'trigger') as Node<TriggerNodeData>[];

  triggers.forEach((trigger, idx) => {
    const data = trigger.data;
    const targetIds = collectReachable(trigger.id, edges, 'target', nodes);

    const targets = targetIds.flatMap((id) => {
      const tn = nodes.find((n) => n.id === id)!.data as TargetNodeData;
      if (tn.routes?.length) return tn.routes.map((r) => ({ ...r, weight: r.weight ?? 1 }));
      const modelId = collectReachable(id, edges, 'model', nodes)[0];
      const mn = modelId ? (nodes.find((n) => n.id === modelId)!.data as ModelNodeData) : null;
      return [{
        provider: mn?.providerId || tn.providerId || undefined,
        model: mn?.modelId || tn.modelId || undefined,
        ...(tn.apiKeyId ? { api_key: tn.apiKeyId } : {}),
        weight: tn.weight,
      }];
    });

    // Fallbacks are rule-level in Bifrost (`routing_rules.fallbacks`), not
    // target-level. Visually they may be attached to one or more targets; when
    // serializing, collect the reachable fallback nodes once for the whole rule,
    // de-duplicate them, and sort by their explicit `order`.
    const fallbackIds = Array.from(new Set(collectReachable(trigger.id, edges, 'fallback', nodes)));
    const fallbacks = fallbackIds
      .map((id) => ({ id, data: nodes.find((n) => n.id === id)!.data as FallbackNodeData }))
      .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
      .flatMap(({ data }) => data.fallbacks?.length ? data.fallbacks : [[data.providerId, data.modelId].filter(Boolean).join('/')].filter(Boolean));

    rules.push({
      id: data.ruleId ?? trigger.id,
      name: data.label || `Rule ${idx + 1}`,
      description: data.description,
      enabled: data.enabled,
      chain_rule: data.chainRule,
      cel_expression: expressionForTrigger(trigger, nodes, edges),
      targets,
      fallbacks,
      scope: (data.scope as RoutingRule['scope']) ?? 'global',
      scope_id: data.scopeId ?? null,
      priority: data.priority ?? idx,
    });
  });

  return rules.sort((a, b) => a.priority - b.priority);
}

/* ----------------------- config.json <-> graph --------------------- */

export function rulesToConfig(rules: RoutingRule[], providers: Record<string, unknown> = {}) {
  return {
    providers,
    governance: { routing_rules: rules },
  };
}

let nodeSeq = 0;
function localId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${(nodeSeq++).toString(36)}`;
}

/** Build a canvas graph from persisted rules (used on DB/rules load). */
export function rulesToWorkflow(
  rules: RoutingRule[],
  opts: { x?: number; y?: number; dedupeConditions?: boolean } = {},
): { nodes: WFNode[]; edges: Edge[] } {
  const nodes: WFNode[] = [];
  const edges: Edge[] = [];
  const startX = opts.x ?? 80;
  const startY = opts.y ?? 80;
  const conditionCache = new Map<string, string>();

  function conditionKey(cond: CELCondition): string {
    return JSON.stringify({
      field: cond.field,
      headerName: (cond.headerName ?? '').trim().toLowerCase(),
      op: cond.op,
      value: String(cond.value ?? '').trim(),
      negate: !!cond.negate,
    });
  }

  function addConditionNode(cond: CELCondition, x: number, y: number): string {
    const key = conditionKey(cond);
    if (opts.dedupeConditions && conditionCache.has(key)) return conditionCache.get(key)!;
    const id = localId('condition');
    conditionCache.set(key, id);
    nodes.push({
      id,
      type: 'condition',
      position: { x, y },
      data: {
        kind: 'condition',
        label: cond.field === 'header' ? `Header ${cond.headerName ?? ''}` : cond.field === 'time_hour' ? 'time.hour' : cond.field,
        field: cond.field,
        op: cond.op,
        value: cond.value,
        headerName: cond.headerName,
        negate: cond.negate,
      },
    });
    return id;
  }

  function addLogicTree(item: CELCondition | CELGroup, rootX: number, baseY: number, depth = 0, row = { n: 0 }): string {
    if ('field' in item) {
      return addConditionNode(item, Math.max(startX + 320, rootX - (depth + 1) * 320), baseY + row.n++ * 150);
    }

    const id = localId('logic');
    const x = Math.max(startX + 420, rootX - depth * 320);
    const y = baseY + row.n * 150;
    nodes.push({
      id,
      type: 'logic',
      position: { x, y },
      data: { kind: 'logic', label: item.combinator === '&&' ? 'AND' : 'OR', combinator: item.combinator },
    });

    item.conditions.forEach((child) => {
      const childId = addLogicTree(child, rootX, baseY, depth + 1, row);
      const edgeId = `${childId}-${id}`;
      if (!edges.some((e) => e.id === edgeId)) edges.push({
        id: edgeId,
        source: childId,
        sourceHandle: 'out',
        target: id,
        targetHandle: 'in',
        type: 'flow',
      });
    });
    if (item.conditions.length === 0) row.n++;
    return id;
  }

  rules.forEach((rule, i) => {
    const triggerId = localId('trigger');
    const ty = startY + i * 640;
    nodes.push({
      id: triggerId,
      type: 'trigger',
      position: { x: startX, y: ty + 90 },
      data: {
        kind: 'trigger',
        label: rule.name,
        triggerKind: rule.cel_expression.includes('complexity_tier') ? 'complexity' : 'cel',
        celGroup: { id: localId('grp'), combinator: '&&', conditions: [] },
        celExpression: rule.cel_expression,
        enabled: rule.enabled,
        ruleId: rule.id,
        priority: rule.priority,
        scope: rule.scope,
        scopeId: rule.scope_id ?? null,
        chainRule: rule.chain_rule,
        description: rule.description,
      },
    });

    const expr = (rule.cel_expression ?? '').trim();
    let routeSourceId = triggerId;
    let routeSourceHandle = 'out';
    if (expr && expr !== 'true') {
      const parsed = parseExpression(expr).group;
      const rootId = addLogicTree(parsed, startX + 780, ty, 0);
      edges.push({
        id: `${triggerId}-${rootId}`,
        source: triggerId,
        sourceHandle: 'out',
        target: rootId,
        targetHandle: 'in',
        type: 'flow',
        data: { label: 'conditions' },
      });
      routeSourceId = rootId;
    }

    const targetId = localId('target');
    nodes.push({
      id: targetId,
      type: 'target',
      position: { x: startX + 1220, y: ty + 60 },
      data: {
        kind: 'target',
        label: rule.targets.length > 1 ? `${rule.targets.length} Targets` : ([rule.targets[0]?.provider, rule.targets[0]?.model].filter(Boolean).join(' / ') || 'Target'),
        providerId: rule.targets[0]?.provider ?? '',
        modelId: rule.targets[0]?.model ?? '',
        apiKeyId: rule.targets[0]?.api_key ?? '',
        weight: rule.targets[0]?.weight ?? 1,
        routes: rule.targets,
      },
    });
    edges.push({
      id: `${routeSourceId}-${targetId}`,
      source: routeSourceId,
      sourceHandle: routeSourceHandle,
      target: targetId,
      targetHandle: 'in',
      type: 'flow',
    });

    if (rule.fallbacks.length > 0) {
      const [prov, ...modelParts] = rule.fallbacks[0].split('/');
      const model = modelParts.join('/');
      const fbId = localId('fallback');
      nodes.push({
        id: fbId,
        type: 'fallback',
        position: { x: startX + 1640, y: ty + 60 },
        data: { kind: 'fallback', label: rule.fallbacks.length > 1 ? `${rule.fallbacks.length} Fallbacks` : (model || prov || 'Fallback'), providerId: prov, modelId: model, order: 0, fallbacks: rule.fallbacks },
      });
      edges.push({
        id: `${targetId}-${fbId}`,
        source: targetId,
        sourceHandle: 'fbout',
        target: fbId,
        targetHandle: 'in',
        type: 'flow',
      });
    }
  });

  return { nodes, edges };
}

/** Serialize a model node helper into the catalog reference (display only). */
export function describeModelNode(data: ModelNodeData): string {
  return [data.providerId, data.modelId].filter(Boolean).join('/');
}
