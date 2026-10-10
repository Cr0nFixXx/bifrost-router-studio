import { describe, expect, it } from 'vitest';
import { celToBifrostQueryObject } from './bifrostQuery';
import { CEL_FIELDS, queryFieldName } from './cel';
import type { CELField } from '@/types/bifrost';

/** The table `bifrostQuery` carried before it delegated to `cel.queryFieldName`. */
const FORMER_FIELD_MAP: Record<CELField, string> = {
  model: 'model',
  provider: 'provider',
  request_type: 'request_type',
  header: 'headers',
  param: 'params',
  team_name: 'team_name',
  customer_id: 'customer_id',
  virtual_key_name: 'virtual_key_name',
  budget_used: 'budget_used',
  tokens_used: 'tokens_used',
  request: 'request',
  request_size: 'request_size',
  time_hour: 'time.hour',
  complexity_tier: 'complexity_tier',
};

describe('bifrost query builder export', () => {
  it('converts CEL into Bifrost react-querybuilder state', () => {
    const q = celToBifrostQueryObject('headers["user-agent"].startsWith("claude-cli") && model.contains("haiku")')!;
    expect(q.combinator).toBe('and');
    expect(q.rules).toHaveLength(2);
    expect(q.rules[0]).toMatchObject({ field: 'headers', operator: 'beginsWith', value: 'user-agent:claude-cli', valueSource: 'value' });
    expect(q.rules[1]).toMatchObject({ field: 'model', operator: 'contains', value: 'haiku', valueSource: 'value' });
  });

  it('keeps nested OR groups', () => {
    const q = celToBifrostQueryObject('headers["tier"] == "premium" && (model.contains("opus") || model.contains("sonnet"))')!;
    expect(q.combinator).toBe('and');
    const nested = q.rules.find((r: any) => r.combinator === 'or') as any;
    expect(nested).toBeTruthy();
    expect(nested.rules).toHaveLength(2);
  });

  it('maps equality to react-querybuilder equals operator', () => {
    const q = celToBifrostQueryObject('provider == "openai" || provider == "anthropic"')!;
    expect(q.combinator).toBe('or');
    expect(q.rules[0]).toMatchObject({ field: 'provider', operator: '=', value: 'openai' });
  });

  it('derives every query field exactly as the deleted local map did', () => {
    for (const field of Object.keys(CEL_FIELDS) as CELField[]) {
      expect(queryFieldName(field), field).toBe(FORMER_FIELD_MAP[field]);
    }
  });
});

/**
 * The gateway's `query` payload is built by parsing the CEL a second time. It used
 * to inherit the `model` guess, so an unmodelled field arrived as a rule checking
 * the model — while the canvas showed `virtual_key_id`.
 */
describe('unmodelled fields in the query payload', () => {
  it('sends the field the user wrote', () => {
    const q = celToBifrostQueryObject('virtual_key_id == "vk_1"')!;
    expect(q.rules[0]).toMatchObject({ field: 'virtual_key_id', operator: '=', value: 'vk_1' });
  });

  it('sends no rule at all when the expression cannot be parsed', () => {
    expect(celToBifrostQueryObject('virtual_key_id == ')).toBeNull();
  });

  it('still refuses a flattened negation rather than shipping its opposite', () => {
    // The tree would read "provider == a AND team_name == b" — the negation is gone.
    // That is worse than sending no query at all.
    expect(celToBifrostQueryObject('!(provider == "a" && team_name == "b")')).toBeNull();
  });

  it('still refuses trailing tokens', () => {
    expect(celToBifrostQueryObject('model == "x" trailing')).toBeNull();
  });

  it('carries an unmodelled field through a mixed expression', () => {
    const q = celToBifrostQueryObject('complexity_tier in ["A","B"] && virtual_key_id == "vk"')!;
    expect(q.rules[1]).toMatchObject({ field: 'virtual_key_id', value: 'vk' });
  });
});
