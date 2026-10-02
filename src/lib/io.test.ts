import { describe, expect, it } from 'vitest';
import { exportWorkspaceXML, parseWorkspaceXML } from './io';
import { rulesToWorkflow, workflowToRules } from './bifrostMapper';
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