import { describe, it, expect } from 'vitest';
import { workflowToRules, rulesToWorkflow, rulesToConfig } from './bifrostMapper';
import { TEMPLATES } from './templates';
import type { RoutingRule } from '@/types/bifrost';
import type { Edge } from 'reactflow';

const rule = (over: Partial<RoutingRule> = {}): RoutingRule => ({
  id: 'r1',
  name: 'Rule',
  description: '',
  enabled: true,
  chain_rule: false,
  cel_expression: 'model == "gpt-4o"',
  targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }],
  fallbacks: ['anthropic/claude-3-7-sonnet-latest'],
  scope: 'global',
  scope_id: null,
  priority: 0,
  ...over,
});

describe('bifrostMapper', () => {
  it('maps a single trigger -> targets + fallbacks', () => {
    const { nodes, edges } = rulesToWorkflow([rule()]);
    const rules = workflowToRules(nodes, edges);
    expect(rules).toHaveLength(1);
    expect(rules[0].targets).toEqual([{ provider: 'openai', model: 'gpt-4o', weight: 1 }]);
    expect(rules[0].fallbacks).toEqual(['anthropic/claude-3-7-sonnet-latest']);
  });

  it('is stable across a template -> rules -> workflow -> rules round trip', () => {
    const { nodes, edges } = TEMPLATES[0].build();
    const a = workflowToRules(nodes, edges).map((r) => ({
      n: r.name,
      c: r.cel_expression,
      t: r.targets,
      f: r.fallbacks,
      s: r.scope,
      p: r.priority,
      cr: r.chain_rule,
    }));
    const { nodes: n2, edges: e2 } = rulesToWorkflow(workflowToRules(nodes, edges));
    const b = workflowToRules(n2, e2).map((r) => ({
      n: r.name,
      c: r.cel_expression,
      t: r.targets,
      f: r.fallbacks,
      s: r.scope,
      p: r.priority,
      cr: r.chain_rule,
    }));
    expect(b).toEqual(a);
  });

  it('resolves targets reached through an intermediate complexity node (BFS)', () => {
    const nodes = [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'T', triggerKind: 'model' as const, celGroup: { id: 'g', combinator: '&&' as const, conditions: [] }, celExpression: 'model == "gpt-4o"', enabled: true, priority: 0, scope: 'global' as const, scopeId: null, chainRule: false } },
      { id: 'x', type: 'complexity', position: { x: 1, y: 0 }, data: { kind: 'complexity', label: 'X', tier: 'COMPLEX' as const } },
      { id: 'g2', type: 'target', position: { x: 2, y: 0 }, data: { kind: 'target', label: 'Tgt', providerId: 'openai', modelId: 'gpt-4o', weight: 1 } },
      { id: 'f', type: 'fallback', position: { x: 3, y: 0 }, data: { kind: 'fallback', label: 'Fb', providerId: 'anthropic', modelId: 'claude', order: 0 } },
    ] as any;
    const edges: Edge[] = [
      { id: 'e1', source: 't', sourceHandle: 'out', target: 'x', targetHandle: 'in', type: 'flow' },
      { id: 'e2', source: 'x', sourceHandle: 'out', target: 'g2', targetHandle: 'in', type: 'flow' },
      { id: 'e3', source: 'g2', sourceHandle: 'fbout', target: 'f', targetHandle: 'in', type: 'flow' },
    ];
    const rules = workflowToRules(nodes, edges);
    expect(rules[0].targets).toEqual([{ provider: 'openai', model: 'gpt-4o', weight: 1 }]);
    expect(rules[0].fallbacks).toEqual(['anthropic/claude']);
  });



  it('treats fallbacks as rule-level, not target-indexed', () => {
    const src = rule({
      targets: [
        { provider: 'openai', model: 'gpt-4o', api_key: 'key-a', weight: 0.7 },
        { provider: 'azure', model: 'gpt-4o', api_key: 'key-b', weight: 0.3 },
      ],
      fallbacks: ['anthropic/claude', 'gemini/gemini-flash'],
    });
    const { nodes, edges } = rulesToWorkflow([src]);
    const fallbackEdges = edges.filter((e) => e.target.startsWith('fallback'));
    expect(fallbackEdges).toHaveLength(1);

    const [roundTrip] = workflowToRules(nodes, edges);
    expect(roundTrip.targets).toEqual([
      { provider: 'openai', model: 'gpt-4o', api_key: 'key-a', weight: 0.7 },
      { provider: 'azure', model: 'gpt-4o', api_key: 'key-b', weight: 0.3 },
    ]);
    expect(roundTrip.fallbacks).toEqual(['anthropic/claude', 'gemini/gemini-flash']);
  });



  it('imports AI-generated complex CEL into real condition/logic nodes', () => {
    const aiRule = rule({
      id: 'ai-complex',
      name: 'AI Complex',
      cel_expression: "(budget_used > 70 && request_size < 5000 && complexity_tier != 'SIMPLE') || (headers['x-tier'] == 'enterprise' && time.hour >= 9)",
      targets: [
        { provider: 'openai', model: 'gpt-4o', weight: 0.6 },
        { provider: 'anthropic', model: 'claude-sonnet', weight: 0.4 },
      ],
      fallbacks: ['openai/gpt-4o-mini', 'groq/llama-3.1-70b'],
    });
    const { nodes, edges } = rulesToWorkflow([aiRule]);
    const conditions = nodes.filter((n) => n.data.kind === 'condition') as any[];
    const logic = nodes.filter((n) => n.data.kind === 'logic') as any[];
    expect(conditions.length).toBeGreaterThan(3);
    expect(logic.length).toBeGreaterThan(1);
    expect(conditions.some((n) => n.data.field === 'request_size' && n.data.value === '5000')).toBe(true);
    expect(conditions.some((n) => n.data.field === 'time_hour' && n.data.value === '9')).toBe(true);
    expect(conditions.some((n) => n.data.field === 'header' && n.data.headerName === 'x-tier')).toBe(true);
    const [roundTrip] = workflowToRules(nodes, edges);
    expect(roundTrip.targets).toHaveLength(2);
    expect(roundTrip.fallbacks).toEqual(['openai/gpt-4o-mini', 'groq/llama-3.1-70b']);
  });



  it('deduplicates identical condition nodes in simple mode without leaking targets', () => {
    const a = rule({ id: 'a', name: 'A', cel_expression: 'headers["user-agent"].contains("claude")', targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }] });
    const b = rule({ id: 'b', name: 'B', cel_expression: 'headers["user-agent"].contains("claude")', targets: [{ provider: 'anthropic', model: 'claude-sonnet', weight: 1 }] });
    const simple = rulesToWorkflow([a, b], { dedupeConditions: true });
    expect(simple.nodes.filter((n) => n.data.kind === 'condition')).toHaveLength(1);
    const rt = workflowToRules(simple.nodes, simple.edges);
    expect(rt.find((r) => r.id === 'a')?.targets).toEqual([{ provider: 'openai', model: 'gpt-4o', weight: 1 }]);
    expect(rt.find((r) => r.id === 'b')?.targets).toEqual([{ provider: 'anthropic', model: 'claude-sonnet', weight: 1 }]);

    const expert = rulesToWorkflow([a, b], { dedupeConditions: false });
    expect(expert.nodes.filter((n) => n.data.kind === 'condition')).toHaveLength(2);
  });

  it('emits the Bifrost governance shape', () => {
    const cfg = rulesToConfig([rule()], { openai: { id: 'openai', type: 'openai', supported: true, mode: 'proxy', keys: [] } });
    expect(cfg.governance.routing_rules).toHaveLength(1);
    expect((cfg.providers.openai as { id: string }).id).toBe('openai');
  });
});
