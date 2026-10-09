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
