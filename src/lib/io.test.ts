import { describe, expect, it } from 'vitest';
import { exportWorkspaceXML, parseConfigJSON, parseWorkspaceXML } from './io';
import { rulesToWorkflow, workflowToRules } from './bifrostMapper';
import { isRuleUid } from './ruleIds';
import type { RoutingRule } from '@/types/bifrost';

const rule = (over: Partial<RoutingRule> = {}): RoutingRule => ({
  id: 'r1',
  name: 'XML Roundtrip',
  cel_expression: 'true',
  targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }],
  fallbacks: ['anthropic/claude', { provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'k1' }],
  scope: 'global',
  scope_id: null,
  priority: 0,
  enabled: true,
  chain_rule: false,
  ...over,
});

const roundTripRules = (xml: string): RoutingRule[] => {
  const project = parseWorkspaceXML(xml);
  return workflowToRules(project.nodes, project.edges);
};

describe('workspace XML export', () => {
  it('keeps pinned fallback keys through an XML roundtrip', () => {
    const { nodes, edges } = rulesToWorkflow([rule()]);
    const xml = exportWorkspaceXML({ name: 'ws', direction: 'LR', nodes, edges });

    expect(xml).toContain('key_id="k1"');
    expect(xml).toContain('vertex/gemini-2.5-pro');
    const [back] = roundTripRules(xml);
    expect(back.fallbacks).toEqual(['anthropic/claude', { provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'k1' }]);
    expect(back).toMatchObject({ id: 'r1', name: 'XML Roundtrip', priority: 0, scope: 'global', enabled: true });
  });

  it('reads legacy text-only fallback elements', () => {
    const legacy = `<BifrostRouterStudio><Project name="ws" direction="LR"/><RoutingRules><Rule id="r1" name="Legacy" priority="0" scope="global" enabled="true"><CELExpression>true</CELExpression><Targets><Target provider="openai" model="gpt-4o" weight="1"/></Targets><Fallbacks><Fallback>anthropic/claude</Fallback></Fallbacks></Rule></RoutingRules></BifrostRouterStudio>`;
    expect(roundTripRules(legacy)[0].fallbacks).toEqual(['anthropic/claude']);
  });
});

describe('config.json import (Bifrost 2.5.0: id is optional)', () => {
  const configWith = (rules: unknown[]) => JSON.stringify({ governance: { routing_rules: rules } });
  const baseRule = { name: 'R', cel_expression: 'true', targets: [{ weight: 1 }], scope: 'global', priority: 0 };

  it('mints a distinct local id for every rule that has none', () => {
    const { rules } = parseConfigJSON(configWith([{ ...baseRule, name: 'A' }, { ...baseRule, name: 'B' }]));

    expect(rules).toHaveLength(2);
    for (const r of rules) expect(isRuleUid(r.id)).toBe(true);
    expect(rules[0].id).not.toBe(rules[1].id);
    expect(rules.map((r) => r.name)).toEqual(['A', 'B']);
  });

  it('passes an existing id through untouched', () => {
    const { rules } = parseConfigJSON(configWith([{ ...baseRule, id: 'kept-id' }, { ...baseRule, name: 'B', id: '' }]));

    expect(rules[0].id).toBe('kept-id');
    expect(isRuleUid(rules[1].id)).toBe(true);
  });
});