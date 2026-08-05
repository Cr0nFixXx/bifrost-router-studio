import { describe, expect, it } from 'vitest';
import { celToBifrostQueryObject } from './bifrostQuery';

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
});
