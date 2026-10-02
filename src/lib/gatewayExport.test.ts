import { describe, it, expect } from 'vitest';
import { toLiteLLM, toOpenAIModelGroups } from './gatewayExport';
import type { ProviderConfig, RoutingRule } from '@/types/bifrost';

const providers: ProviderConfig[] = [
  { id: 'openai', type: 'openai', supported: true, mode: 'proxy', keys: [] },
  { id: 'anthropic', type: 'anthropic', supported: true, mode: 'proxy', keys: [] },
];

function rule(id: string, over: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id,
    name: 'Route ' + id,
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

describe('toLiteLLM', () => {
  it('emits a model_list and router_settings', () => {
    const yaml = toLiteLLM([rule('a')], providers);
    expect(yaml).toContain('model_list:');
    expect(yaml).toContain('router_settings:');
  });

  it('maps targets to model_name deployments with provider type prefix', () => {
    const yaml = toLiteLLM(
      [rule('a', { targets: [{ provider: 'openai', model: 'gpt-4o', weight: 0.6 }] })],
      providers,
    );
    expect(yaml).toContain('model_name: route-a-a');
    expect(yaml).toContain('model: openai/gpt-4o');
    expect(yaml).toContain('# weight: 0.6');
  });

  it('keeps CEL conditions as comments and emits fallbacks', () => {
    const yaml = toLiteLLM(
      [
        rule('a', {
          cel_expression: 'model == "gpt-4o"',
          targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }],
          fallbacks: ['anthropic/claude-3'],
        }),
      ],
      providers,
    );
    expect(yaml).toContain('# CEL: model == "gpt-4o"');
    expect(yaml).toContain('fallbacks:');
    expect(yaml).toContain('"route-a-a":');
    expect(yaml).toContain('claude-3');
  });

  it('skips disabled rules', () => {
    const yaml = toLiteLLM([rule('a', { enabled: false })], providers);
    expect(yaml).not.toContain('model_name:');
  });
});

describe('toOpenAIModelGroups', () => {
  it('produces one group per enabled rule with summed weights', () => {
    const cfg = toOpenAIModelGroups(
      [rule('a', { targets: [{ provider: 'openai', model: 'gpt-4o', weight: 0.6 }, { provider: 'openai', model: 'gpt-4o', weight: 0.4 }] })],
      providers,
    );
    expect(cfg.model_groups).toHaveLength(1);
    expect(cfg.model_groups[0].weights['openai/gpt-4o']).toBeCloseTo(1);
  });

  it('captures the condition and fallbacks on the group', () => {
    const cfg = toOpenAIModelGroups(
      [rule('a', { cel_expression: 'budget_used < 100', targets: [{ model: 'm1', weight: 1 }], fallbacks: ['f1'] })],
    );
    const g = cfg.model_groups[0];
    expect(g.condition).toBe('budget_used < 100');
    expect(g.fallbacks).toEqual(['f1']);
    expect(g.members).toContain('m1');
  });

  it('handles pinned object fallbacks', () => {
    const cfg = toOpenAIModelGroups(
      [rule('a', { targets: [{ model: 'm1', weight: 1 }], fallbacks: [{ provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'k1' }] })],
    );
    expect(cfg.model_groups[0].fallbacks).toEqual(['gemini-2.5-pro']);
    expect(toLiteLLM([rule('a', { targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }], fallbacks: [{ provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'k1' }] })]))
      .toContain('"gemini-2.5-pro"');
  });

  it('omits disabled rules', () => {
    const cfg = toOpenAIModelGroups([rule('a', { enabled: false })]);
    expect(cfg.model_groups).toHaveLength(0);
  });
});
