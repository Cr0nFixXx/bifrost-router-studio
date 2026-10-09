import { describe, it, expect } from 'vitest';
import {
  compileGroup, parseExpression, validateCEL, newGroup,
  CEL_FIELDS, ALL_OPS, opsForField, queryFieldName, evaluateCEL,
} from './cel';
import type { CELCondition, CELField } from '@/types/bifrost';

describe('cel parser', () => {
  it('compiles a single condition', () => {
    const g = newGroup();
    g.conditions[0] = { id: 'c1', field: 'model', op: '==', value: 'gpt-4o' };
    expect(compileGroup(g)).toBe('model == "gpt-4o"');
  });

  it('round-trips a variety of expressions (10/10 stable)', () => {
    const cases = [
      'headers["x-tier"] == "premium"',
      'complexity_tier in ["COMPLEX", "REASONING"]',
      'budget_used > 85',
      'model.startsWith("gpt-4") && team_name == "ml-ops"',
      'provider == "openai" || provider == "anthropic"',
      '!(complexity_tier in ["SIMPLE","MEDIUM"])',
      'tokens_used < 50 || headers["x-p"] == "high"',
      '!(provider == "openai")',
      'customer_id == "acme" && headers["x-env"] in ["staging","test"]',
      'request_type == "embedding"',
    ];
    for (const expr of cases) {
      const { group, warnings } = parseExpression(expr);
      expect(warnings).toEqual([]);
      const recompiled = compileGroup(group);
      // re-parse the recompiled expression and recompile again — must be stable
      const stable = compileGroup(parseExpression(recompiled).group) === recompiled;
      expect(stable, `unstable for: ${expr}`).toBe(true);
    }
  });

  it('preserves &&/|| grouping via parentheses', () => {
    const { group } = parseExpression('a == "1" || b == "2"');
    expect(group.combinator).toBe('||');
  });

  it('parses a nested group', () => {
    const { group } = parseExpression('(a == "1" && b == "2") || c == "3"');
    const first = group.conditions[0];
    expect('combinator' in first && first.combinator).toBe('&&');
  });


  it('parses Bifrost-style AI generated CEL with dotted fields and single quotes', () => {
    const expr = "(budget_used > 70 && request_size < 5000 && complexity_tier != 'SIMPLE') || (budget_used > 50 && time.hour >= 0 && time.hour < 6) || (headers['x-priority'] != 'critical' && headers['x-customer-tier'] in ['free', 'starter'])";
    const { group, warnings } = parseExpression(expr);
    expect(warnings).toEqual([]);
    const out = compileGroup(group);
    expect(out).toContain('request_size < 5000');
    expect(out).toContain('time.hour >= 0');
    expect(out).toContain('headers["x-priority"] != "critical"');
    expect(out).toContain('headers["x-customer-tier"] in ["free", "starter"]');
  });

  it('round-trips the negate flag', () => {
    const { group } = parseExpression('!(provider == "openai")');
    const cond = group.conditions[0];
    expect('negate' in cond && cond.negate).toBe(true);
    expect(compileGroup(group)).toBe('!(provider == "openai")');
  });
});

describe('cel validator', () => {
  it('flags empty expression as a warning', () => {
    expect(validateCEL('').some((d) => d.severity === 'warning')).toBe(true);
  });
  it('flags single equals sign', () => {
    expect(validateCEL('model = "x"').some((d) => d.severity === 'error')).toBe(true);
  });
  it('does not flag proper equality operators', () => {
    expect(validateCEL('provider == "openai" && model != "bad"').filter((d) => d.message.includes('Use "=="'))).toEqual([]);
  });
  it('flags dangling operator', () => {
    expect(validateCEL('model == ').some((d) => d.severity === 'error')).toBe(true);
  });
  it('accepts a valid expression', () => {
    expect(validateCEL('budget_used > 80')).toEqual([]);
  });
});

describe('field table', () => {
  /** A request-shaped context with every field CEL_FIELDS knows about. */
  const fullCtx = () => ({
    model: 'gpt-4o', provider: 'openai', request_type: 'chat_completion',
    headers: { 'x-tier': 'premium' }, params: { stream: 'true' },
    team_name: 'ml-ops', customer_id: 'acme', virtual_key_name: 'dev-key',
    budget_used: 42, tokens_used: 31, request: 18, request_size: 1200,
    time: { hour: 3 }, complexity_tier: 'COMPLEX',
  });

  it('covers exactly the CELField union', () => {
    expect(Object.keys(CEL_FIELDS).length).toBe(14);
  });

  it('queryFieldName drops the index from indexed fields', () => {
    expect(queryFieldName('header')).toBe('headers');
    expect(queryFieldName('param')).toBe('params');
  });

  it('queryFieldName matches the token for every other field', () => {
    for (const [field, spec] of Object.entries(CEL_FIELDS)) {
      if (field === 'header' || field === 'param') continue;
      expect(queryFieldName(field as CELField)).toBe(spec.cel);
    }
  });

  it('emits numeric fields unquoted', () => {
    expect(compileGroup({ id: 'g', combinator: '&&', conditions: [
      { id: 'c', field: 'budget_used', op: '>', value: '85' },
    ] })).toBe('budget_used > 85');
    expect(compileGroup({ id: 'g', combinator: '&&', conditions: [
      { id: 'c', field: 'time_hour', op: '==', value: '3' },
    ] })).toBe('time.hour == 3');
  });

  it('withholds the string methods from numeric fields', () => {
    for (const op of ['startsWith', 'endsWith', 'contains', 'matches'] as const) {
      expect(opsForField('budget_used')).not.toContain(op);
      expect(opsForField('model')).toContain(op);
    }
  });

  it('allows every operator on string fields', () => {
    expect(opsForField('model')).toEqual(ALL_OPS);
  });

  it('every operator a field offers survives a parse round-trip', () => {
    for (const [field, spec] of Object.entries(CEL_FIELDS)) {
      for (const op of opsForField(field as CELField)) {
        const value = op === 'in' ? 'a, b' : spec.numeric ? '3' : 'a';
        const c: CELCondition = {
          id: 'c', field: field as CELField, op,
          value, headerName: 'x-thing',
        };
        const { warnings } = parseExpression(compileGroup({ id: 'g', combinator: '&&', conditions: [c] }));
        expect(warnings, `${field} ${op}`).toEqual([]);
      }
    }
  });
});

describe('cel evaluator', () => {
  const ctx = {
    model: 'gpt-4o', provider: 'openai', request_type: 'chat_completion',
    headers: { 'x-tier': 'premium' }, params: { stream: 'true' },
    team_name: 'ml-ops', customer_id: 'acme', virtual_key_name: 'dev-key',
    budget_used: 42, tokens_used: 31, request: 18, request_size: 1200,
    time: { hour: 3 }, complexity_tier: 'COMPLEX',
  };

  it('evaluates `in` as membership, not as a JS index lookup', () => {
    // JS `in` on an array tests indices, so this was silently always false.
    expect(evaluateCEL('complexity_tier in ["COMPLEX","REASONING"]', ctx).matched).toBe(true);
    expect(evaluateCEL('complexity_tier in ["SIMPLE","MEDIUM"]', ctx).matched).toBe(false);
  });

  it('evaluates time.hour against the context', () => {
    expect(evaluateCEL('time.hour >= 0 && time.hour < 6', ctx).matched).toBe(true);
    const none = evaluateCEL('time.hour >= 0', { ...ctx, time: {} });
    expect(none.matched).toBe(false);
    expect(none.warnings.join(' ')).toContain('time.hour');
  });

  it('warns instead of silently failing on a missing request_size', () => {
    const { request_size, ...withoutSize } = ctx;
    const out = evaluateCEL('request_size > 1000', withoutSize);
    expect(out.matched).toBe(false);
    expect(out.warnings.join(' ')).toContain('request_size');
  });

  it('warns instead of silently failing on a missing param', () => {
    const out = evaluateCEL('params["stream"] == "true"', { ...ctx, params: {} });
    expect(out.matched).toBe(false);
    expect(out.warnings.join(' ')).toContain('params');
  });

  it('compares numerically without warning', () => {
    expect(evaluateCEL('budget_used > 85', ctx)).toEqual({ matched: false, warnings: [] });
    expect(evaluateCEL('budget_used < 85', ctx).matched).toBe(true);
  });

  it('matches a quoted number against a numeric context value', () => {
    expect(evaluateCEL('budget_used == "42"', ctx).matched).toBe(true);
  });

  it('applies negate', () => {
    expect(evaluateCEL('!(provider == "openai")', ctx).matched).toBe(false);
    expect(evaluateCEL('!(provider == "anthropic")', ctx).matched).toBe(true);
  });

  it('reports the parser flattening a negated group', () => {
    const out = evaluateCEL('!(provider == "openai" && team_name == "ml-ops")', ctx);
    expect(out.warnings.join(' ')).toContain('flattened');
  });

  it('does not turn an undecidable negated condition into true', () => {
    const out = evaluateCEL('!(request_size > 1000)', { ...ctx, request_size: undefined });
    expect(out.matched).toBe(false);
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it('survives an invalid regex', () => {
    const out = evaluateCEL('model.matches("[")', ctx);
    expect(out.matched).toBe(false);
    expect(out.warnings.join(' ')).toContain('regex');
  });

  it('matches headers case-insensitively', () => {
    expect(evaluateCEL('headers["X-TIER"] == "premium"', ctx).matched).toBe(true);
  });

  it('supports the string methods', () => {
    expect(evaluateCEL('model.startsWith("gpt-4")', ctx).matched).toBe(true);
    expect(evaluateCEL('model.endsWith("4o")', ctx).matched).toBe(true);
    expect(evaluateCEL('model.contains("4o")', ctx).matched).toBe(true);
    expect(evaluateCEL('model.matches("^gpt-4o$")', ctx).matched).toBe(true);
  });

  it('reports a parse error instead of falling through to the placeholder group', () => {
    const out = evaluateCEL('model == ', ctx);
    expect(out.matched).toBe(false);
    expect(out.warnings.join(' ')).toContain('parse error');
  });

  it('treats `true` as a match with nothing to report', () => {
    expect(evaluateCEL('true', ctx)).toEqual({ matched: true, warnings: [] });
  });

  it('decides every field of the table without a warning', () => {
    // headerName must exist in ctx.headers (`x-tier`) resp. ctx.params (`stream`).
    const headerName = Object.keys(ctx.headers)[0];
    const paramName = Object.keys(ctx.params)[0];
    for (const [field, spec] of Object.entries(CEL_FIELDS)) {
      const name = field === 'header' ? headerName : field === 'param' ? paramName : 'x-tier';
      const out = evaluateCEL(
        compileGroup({ id: 'g', combinator: '&&', conditions: [
          { id: 'c', field: field as CELField, op: '==', value: spec.numeric ? '1' : 'x', headerName: name },
        ] }),
        ctx,
      );
      expect(out.warnings, field).toEqual([]);
    }
  });

  it('short-circuits a satisfied OR even when the other branch is undecidable', () => {
    const out = evaluateCEL('request_size > 1000 || model == "gpt-4o"', ctx);
    expect(out.matched).toBe(true);
  });
});
