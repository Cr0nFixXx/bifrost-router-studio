/**
 * Label projection for the rule tree. Covers the two things that were wrong
 * before the first real database was read: a target pins its key as `api_key`
 * (a fallback uses `key_id`), and a disabled rule has to stay visible.
 */
import { describe, it, expect } from 'vitest';
import type { RoutingRule } from '@/types/bifrost';
import {
  fallbackLabel,
  ruleDescription,
  ruleLabel,
  ruleTooltip,
  targetLabel,
} from './ruleLabels';

const rule = (over: Partial<RoutingRule> = {}): RoutingRule => ({
  id: 'r1',
  name: 'Cheap for simple',
  enabled: true,
  chain_rule: false,
  cel_expression: 'complexity_tier == "simple"',
  targets: [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
  fallbacks: [],
  scope: 'global',
  scope_id: null,
  priority: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
});

describe('ruleLabel', () => {
  it('uses the plain name when enabled', () => {
    expect(ruleLabel(rule())).toBe('Cheap for simple');
  });

  it('marks a disabled rule instead of hiding it', () => {
    expect(ruleLabel(rule({ enabled: false }))).toBe('Cheap for simple (aus)');
  });
});

describe('ruleDescription', () => {
  it('shows priority and scope', () => {
    expect(ruleDescription(rule({ priority: 3 }))).toBe('#3 · global');
  });

  it('appends scope_id when the scope is narrowed', () => {
    expect(ruleDescription(rule({ scope: 'team', scope_id: 'alpha' }))).toBe('#0 · team:alpha');
  });

  it('keeps priority 0 visible rather than falling back to empty', () => {
    expect(ruleDescription(rule({ priority: 0 }))).toContain('#0');
  });
});

describe('targetLabel', () => {
  it('joins provider and model and appends the weight', () => {
    expect(targetLabel({ provider: 'openai', model: 'gpt-4o-mini', weight: 0.7 }))
      .toBe('openai/gpt-4o-mini · 0.7');
  });

  it('reads a pinned key from api_key, not key_id', () => {
    // RoutingTarget pins with `api_key`; reading `key_id` here silently dropped
    // the pin from the label.
    expect(targetLabel({ provider: 'anthropic', model: 'claude-3-haiku', api_key: 'key-9', weight: 0.3 }))
      .toBe('anthropic/claude-3-haiku · 0.3 · key key-9');
  });

  it('says so when provider and model are both missing', () => {
    expect(targetLabel({ weight: 1 })).toBe('(leer) · 1');
  });

  it('keeps weight 0 in the label — it is an error on the gateway, not a default', () => {
    expect(targetLabel({ provider: 'openai', model: 'gpt-4o', weight: 0 }))
      .toBe('openai/gpt-4o · 0');
  });
});

describe('fallbackLabel', () => {
  it('renders the legacy string form', () => {
    expect(fallbackLabel('anthropic/claude-3-haiku')).toBe('anthropic/claude-3-haiku');
  });

  it('shows a pinned key, which fallbackToRef would have dropped', () => {
    expect(fallbackLabel({ provider: 'anthropic', model: 'claude-3-haiku', key_id: 'k1' }))
      .toBe('anthropic/claude-3-haiku · key k1');
  });

  it('handles "provider/" — the form that keeps the incoming model', () => {
    expect(fallbackLabel('openai/')).toBe('openai/');
  });

  it('says so for an empty entry', () => {
    expect(fallbackLabel('')).toBe('(leer)');
  });
});

describe('ruleTooltip', () => {
  it('carries the CEL expression verbatim', () => {
    expect(ruleTooltip(rule())).toContain('CEL: complexity_tier == "simple"');
  });

  it('lists targets and fallbacks with counts', () => {
    const tip = ruleTooltip(rule({
      targets: [
        { provider: 'openai', model: 'gpt-4o-mini', weight: 0.7 },
        { provider: 'anthropic', model: 'claude-3-haiku', api_key: 'key-9', weight: 0.3 },
      ],
      fallbacks: ['anthropic/claude-3-haiku'],
    }));
    expect(tip).toContain('Targets (2):');
    expect(tip).toContain('key key-9');
    expect(tip).toContain('Fallbacks (1):');
  });

  it('omits the description line when there is none', () => {
    expect(ruleTooltip(rule())).not.toContain('undefined');
  });

  it('includes the description when present', () => {
    expect(ruleTooltip(rule({ description: 'low complexity' }))).toContain('low complexity');
  });

  it('flags a chain rule', () => {
    expect(ruleTooltip(rule({ chain_rule: true }))).toContain('chain rule');
  });
});
