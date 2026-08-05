/**
 * Demo dataset used when the user creates a brand-new (empty) database, so the
 * canvas is never empty on first run.
 */
import { BifrostDb } from './bifrostDb';
import type { ProviderConfig, RoutingRule } from '@/types/bifrost';

const SAMPLE_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    type: 'openai',
    supported: true,
    mode: 'proxy',
    keys: [{ value: 'sk-...', weight: 1, models: ['*'] }],
    forward_headers: ['*'],
  },
  {
    id: 'anthropic',
    type: 'anthropic',
    supported: true,
    mode: 'proxy',
    keys: [{ value: 'sk-ant-...', weight: 1, models: ['*'] }],
  },
  {
    id: 'groq',
    type: 'groq',
    supported: true,
    mode: 'proxy',
    keys: [{ value: 'gsk-...', weight: 1, models: ['*'] }],
  },
];

const SAMPLE_RULES: RoutingRule[] = [
  {
    id: 'rule-premium-tier',
    name: 'Premium Tier Route',
    description: 'Premium header users go to GPT-4o with an Azure fallback.',
    enabled: true,
    chain_rule: false,
    cel_expression: 'headers["x-tier"] == "premium"',
    targets: [
      { provider: 'openai', model: 'gpt-4o', weight: 0.7 },
      { provider: 'azure', model: 'gpt-4o', weight: 0.3 },
    ],
    fallbacks: ['anthropic/claude-3-7-sonnet-latest'],
    scope: 'team',
    scope_id: 'team-ml-ops',
    priority: 10,
  },
  {
    id: 'rule-complexity',
    name: 'Complexity Router',
    description: 'Frontier models for complex/reasoning prompts; cheap models otherwise.',
    enabled: true,
    chain_rule: true,
    cel_expression: 'complexity_tier in ["COMPLEX", "REASONING"]',
    targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }],
    fallbacks: ['openai/gpt-4o-mini'],
    scope: 'global',
    scope_id: null,
    priority: 0,
  },
  {
    id: 'rule-cost-spillover',
    name: 'Budget Spillover',
    description: 'When spend on the primary is high, spill over to a cheaper provider.',
    enabled: true,
    chain_rule: false,
    cel_expression: 'budget_used > 85',
    targets: [{ provider: 'groq', model: 'llama-3.1-70b-versatile', weight: 1 }],
    fallbacks: [],
    scope: 'global',
    scope_id: null,
    priority: 20,
  },
];

export async function createSampleDb(): Promise<BifrostDb> {
  const db = await BifrostDb.open();
  for (const p of SAMPLE_PROVIDERS) db.upsertProvider(p);
  for (const r of SAMPLE_RULES) db.createRule(r);
  return db;
}
