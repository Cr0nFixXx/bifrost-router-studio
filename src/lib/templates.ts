/** Pre-built rule-chain templates the user can instantiate from a menu. */
import type { Edge } from 'reactflow';
import type { RoutingRule } from '@/types/bifrost';
import type { WFNode } from '@/types/workflow';
import { rulesToWorkflow } from './bifrostMapper';

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  accent: string;
  build: () => { nodes: WFNode[]; edges: Edge[] };
}

function ruleTemplate(rule: RoutingRule): () => { nodes: WFNode[]; edges: Edge[] } {
  return () => rulesToWorkflow([rule]);
}

const baseRule = (over: Partial<RoutingRule>): RoutingRule => ({
  id: over.id ?? 'tpl-rule',
  name: over.name ?? 'Template Rule',
  description: over.description ?? '',
  enabled: over.enabled ?? true,
  chain_rule: over.chain_rule ?? false,
  cel_expression: over.cel_expression ?? 'true',
  targets: over.targets ?? [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
  fallbacks: over.fallbacks ?? [],
  scope: over.scope ?? 'global',
  scope_id: over.scope_id ?? null,
  priority: over.priority ?? 0,
});

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'cost-optimization',
    name: 'Cost Optimization Chain',
    description: 'Route cheap/simple traffic to small models, expensive traffic to frontier models, with fallbacks.',
    accent: '#34d399',
    build: ruleTemplate(baseRule({
      id: 'tpl-cost-optimization',
      name: 'Cost-Aware Routing',
      cel_expression: 'complexity_tier in ["SIMPLE", "MEDIUM"] || budget_used > 75',
      targets: [
        { provider: 'groq', model: 'llama-3.1-8b-instant', weight: 0.55 },
        { provider: 'openai', model: 'gpt-4o-mini', weight: 0.45 },
      ],
      fallbacks: ['openai/gpt-4o-mini', 'groq/llama-3.1-70b-versatile'],
    })),
  },
  {
    id: 'high-availability',
    name: 'High Availability Chain',
    description: 'Weighted primary providers with a single ordered fallback chain across vendors.',
    accent: '#22d3ee',
    build: ruleTemplate(baseRule({
      id: 'tpl-high-availability',
      name: 'High Availability Route',
      cel_expression: 'true',
      targets: [
        { provider: 'openai', model: 'gpt-4o', weight: 0.6 },
        { provider: 'azure', model: 'gpt-4o', weight: 0.4 },
      ],
      fallbacks: ['anthropic/claude-3-7-sonnet-latest', 'gemini/gemini-2.0-pro-exp-02-05'],
    })),
  },
  {
    id: 'tier-gated',
    name: 'Tier-Gated Routing',
    description: 'Premium/enterprise users go to frontier models; everyone else can use standard routing.',
    accent: '#a78bfa',
    build: ruleTemplate(baseRule({
      id: 'tpl-tier-gated',
      name: 'Premium Header Route',
      cel_expression: 'headers["x-tier"] in ["premium", "enterprise"] && complexity_tier in ["COMPLEX", "REASONING"]',
      targets: [
        { provider: 'anthropic', model: 'claude-3-7-sonnet-latest', weight: 0.7 },
        { provider: 'openai', model: 'gpt-4o', weight: 0.3 },
      ],
      fallbacks: ['openai/gpt-4o-mini'],
    })),
  },
  {
    id: 'provider-model-alias-normalizer',
    name: 'Provider/Model Alias Normalizer',
    description: 'Match common model aliases first, then route to the canonical provider/model target.',
    accent: '#fbbf24',
    build: ruleTemplate(baseRule({
      id: 'tpl-alias-normalizer',
      name: 'Alias → Canonical Model',
      chain_rule: true,
      cel_expression: 'model in ["sonnet", "claude-sonnet", "opus"]',
      targets: [{ provider: 'anthropic', model: 'claude-3-7-sonnet-latest', weight: 1 }],
      fallbacks: ['openrouter/anthropic/claude-3.7-sonnet'],
    })),
  },
  {
    id: 'speech-tts-routing',
    name: 'Speech / TTS Routing',
    description: 'Route speech requests to a TTS provider with a Gemini TTS fallback.',
    accent: '#f472b6',
    build: ruleTemplate(baseRule({
      id: 'tpl-speech-tts',
      name: 'Speech Requests',
      cel_expression: 'request_type == "speech" || provider == "elevenlabs"',
      targets: [{ provider: 'elevenlabs', model: 'eleven_flash_v2_5', weight: 1 }],
      fallbacks: ['gemini/gemini-3.1-flash-tts-preview'],
    })),
  },
  {
    id: 'claude-cli-routing',
    name: 'Claude CLI Routing',
    description: 'Detect Claude CLI clients by header and reroute small/haiku aliases to a preferred target.',
    accent: '#a78bfa',
    build: ruleTemplate(baseRule({
      id: 'tpl-claude-cli',
      name: 'Claude CLI Client',
      cel_expression: 'headers["user-agent"].startsWith("claude-cli") && model.contains("haiku")',
      targets: [{ provider: 'openrouter', model: 'anthropic/claude-3-haiku', weight: 1 }],
      fallbacks: ['groq/llama-3.1-70b-versatile'],
    })),
  },
  {
    id: 'budget-spillover',
    name: 'Budget Spillover',
    description: 'When budget usage is high, spill traffic to a cheaper provider.',
    accent: '#34d399',
    build: ruleTemplate(baseRule({
      id: 'tpl-budget-spillover',
      name: 'Budget Spillover',
      cel_expression: 'budget_used > 85',
      targets: [{ provider: 'groq', model: 'llama-3.1-8b-instant', weight: 1 }],
      fallbacks: ['openai/gpt-4o-mini'],
    })),
  },
  {
    id: 'premium-reasoning',
    name: 'Premium Reasoning Lane',
    description: 'Premium users with complex/reasoning prompts go to frontier models.',
    accent: '#22d3ee',
    build: ruleTemplate(baseRule({
      id: 'tpl-premium-reasoning',
      name: 'Premium Reasoning',
      cel_expression: 'headers["tier"] == "premium" && complexity_tier in ["COMPLEX", "REASONING"]',
      targets: [
        { provider: 'anthropic', model: 'claude-3-7-sonnet-latest', weight: 0.6 },
        { provider: 'openai', model: 'gpt-4o', weight: 0.4 },
      ],
      fallbacks: ['gemini/gemini-2.0-pro-exp-02-05'],
    })),
  },
];
