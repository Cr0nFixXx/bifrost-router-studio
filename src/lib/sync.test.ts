import { describe, expect, it, vi } from 'vitest';
import type { ApiRule, RoutingRule } from '@/types/bifrost';
import { apiRuleToRouting, toWriteShape } from '@/lib/bifrostApi';
import { applyDiff, diffIsEmpty, diffRules, rejectionReason, toUpdateShape } from '@/lib/sync';

function rule(patch: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 'r1',
    name: 'Cheap tier',
    enabled: true,
    chain_rule: false,
    cel_expression: 'complexity_tier == "SIMPLE"',
    targets: [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
    fallbacks: [],
    scope: 'global',
    scope_id: null,
    priority: 10,
    ...patch,
  };
}

/** A GET response for the same rule, with the fields the canvas does not model. */
function remote(patch: Partial<ApiRule> = {}): ApiRule {
  const base = rule();
  return {
    ...toWriteShape(base),
    id: base.id,
    ttft_timeout_ms: 45000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...patch,
  };
}

describe('diffRules', () => {
  it('leaves an unchanged rule alone', () => {
    const diff = diffRules([rule()], [remote()]);
    expect(diff.update).toHaveLength(0);
    expect(diffIsEmpty(diff)).toBe(true);
    expect(diff.unchanged).toBe(1);
  });

  it('does not treat server-only fields as a change', () => {
    // ttft_timeout_ms and the timestamps exist only on the API side.
    const diff = diffRules([rule()], [remote({ ttft_timeout_ms: 90000 })]);
    expect(diff.update).toHaveLength(0);
  });

  it('pushes a changed rule with a complete write shape', () => {
    const diff = diffRules([rule({ priority: 5 })], [remote()]);
    expect(diff.update).toHaveLength(1);
    // targets must travel whole — the API replaces the whole list on PUT.
    expect(diff.update[0].write.targets).toEqual([{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }]);
    expect(diff.update[0].write.priority).toBe(5);
  });

  it('omits scope from the update body', () => {
    const diff = diffRules([rule({ priority: 1 })], [remote()]);
    expect(diff.update[0].write).not.toHaveProperty('scope');
    expect(diff.update[0].write).not.toHaveProperty('scope_id');
  });

  it('creates a rule the gateway has never seen', () => {
    const diff = diffRules([rule()], []);
    expect(diff.create).toHaveLength(1);
    expect(diff.delete).toHaveLength(0);
  });

  it('deletes a rule that vanished from the canvas', () => {
    const diff = diffRules([], [remote()]);
    expect(diff.delete).toEqual(['r1']);
    expect(diff.create).toHaveLength(0);
  });

  it('emits delete + create when a rule changes scope, never a PUT', () => {
    const diff = diffRules([rule({ scope: 'team', scope_id: 'team-7' })], [remote()]);
    expect(diff.update).toHaveLength(0);
    expect(diff.delete).toEqual(['r1']);
    expect(diff.create[0].scope).toBe('team');
    expect(diff.create[0].scope_id).toBe('team-7');
  });

  it('rejects a rule with weights that do not sum to 1 and keeps pushing the rest', () => {
    const diff = diffRules([rule({ id: 'bad', targets: [{ provider: 'openai', weight: 0.5 }] }), rule({ id: 'good' })], [remote({ id: 'good' })]);
    expect(diff.rejected.map((r) => r.id)).toEqual(['bad']);
    expect(diffIsEmpty(diff)).toBe(true);
  });
});

describe('rejectionReason', () => {
  it('names the actual problem', () => {
    expect(rejectionReason(rule({ targets: [{ provider: 'openai', weight: 0.5 }] }))).toMatch(/summieren/);
    expect(rejectionReason(rule({ cel_expression: '   ' }))).toMatch(/CEL/);
    expect(rejectionReason(rule({ targets: [] }))).toMatch(/Targets/);
    expect(rejectionReason(rule({ scope: 'team', scope_id: null }))).toMatch(/scope_id/);
    expect(rejectionReason(rule())).toBeNull();
  });
});

describe('toWriteShape', () => {
  it('regenerates the dashboard query from CEL on every push', () => {
    const a = toWriteShape(rule()).query;
    const b = toWriteShape(rule()).query;
    // Freshly generated ids mean these differ; what matters is that both exist
    // and describe the same condition.
    expect(a).toBeTruthy();
    expect(JSON.stringify(a).length).toBe(JSON.stringify(b).length);
  });

  it('omits query when the CEL cannot be parsed', () => {
    expect(toWriteShape(rule({ cel_expression: 'this is not cel (((' })).query).toBeUndefined();
  });

  it('drops config.json-only fields from fallback objects', () => {
    const write = toWriteShape(rule({ fallbacks: [{ provider: 'groq', provider_key_name: 'k1', key_id: 'k1' }] }));
    expect(write.fallbacks).toEqual([{ provider: 'groq', key_id: 'k1' }]);
  });

  it('maps the canvas api_key onto the API key_id', () => {
    const write = toWriteShape(rule({ targets: [{ provider: 'openai', api_key: 'key-9', weight: 1 }] }));
    expect(write.targets[0].key_id).toBe('key-9');
  });
});

describe('toUpdateShape', () => {
  it('is the create shape without scope', () => {
    const update = toUpdateShape(rule({ scope: 'team', scope_id: 't1' }));
    expect(update).not.toHaveProperty('scope');
    expect(update).not.toHaveProperty('scope_id');
  });
});

describe('apiRuleToRouting', () => {
  it('round-trips the fields the canvas models', () => {
    const back = apiRuleToRouting(remote({ description: 'note' }));
    expect(back).toMatchObject({ id: 'r1', name: 'Cheap tier', description: 'note', priority: 10, scope: 'global' });
  });
});

describe('applyDiff', () => {
  const api = () => ({
    createRule: vi.fn().mockResolvedValue({ id: 'new' }),
    updateRule: vi.fn().mockResolvedValue({}),
    deleteRule: vi.fn().mockResolvedValue(undefined),
  });

  it('creates before it deletes so a scope move never has a gap', async () => {
    const client = api();
    const diff = diffRules([rule({ scope: 'team', scope_id: 't1' })], [remote()]);
    const result = await applyDiff(client as never, diff);
    expect(result).toMatchObject({ created: 1, deleted: 1, failed: 0 });
    expect(client.createRule.mock.invocationCallOrder[0]).toBeLessThan(client.deleteRule.mock.invocationCallOrder[0]);
  });

  it('stops at the first failure and counts what did not make it', async () => {
    const client = api();
    client.updateRule.mockRejectedValue(new Error('weights must sum to 1'));
    const diff = diffRules([rule({ priority: 1 }), rule({ id: 'r2', priority: 2 })], [remote(), remote({ id: 'r2' })]);
    const result = await applyDiff(client as never, diff);
    expect(result.error).toMatch(/weights/);
    // Neither update reached the gateway — the one that threw and the one
    // never attempted both count as "not transferred".
    expect(result.failed).toBe(2);
    expect(client.updateRule).toHaveBeenCalledTimes(1);
  });
});