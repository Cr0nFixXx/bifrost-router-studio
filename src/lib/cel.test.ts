import { describe, it, expect } from 'vitest';
import { compileGroup, parseExpression, validateCEL, newGroup } from './cel';

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
