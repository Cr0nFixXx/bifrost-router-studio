import { describe, expect, it } from 'vitest';
import { normalizeAiDraft } from './aiDraft';

describe('normalizeAiDraft', () => {
  it('converts non-standard AI conditions/logic/target schema into a valid Bifrost rule draft', () => {
    const draft = {
      type: 'rule_draft',
      rules: [{
        name: 'Complex AI Rule',
        conditions: {
          C1: "request.headers['x-user-tier'] == 'vip'",
          C2: "request.model.startsWith('k-obs/')",
          C3: 'int(request.body.max_tokens) > 4096',
          C4: "[request.body.stream](http://request.body.stream) == false",
          C5: "request.url.path == '/v1/chat/completions'",
        },
        logic: {
          operator: 'and',
          rules: [
            { operator: 'or', rules: ['C1', 'C2'] },
            { operator: 'and', rules: ['C3', 'C4', 'C5'] },
          ],
        },
        target: { provider: 'openrouter', model: 'anthropic/claude-sonnet', weight: 1 },
        fallbacks: [{ provider: 'groq', model: 'llama-3.1-70b' }],
      }],
    };
    const normalized = normalizeAiDraft(draft);
    expect(normalized.validation.errors).toEqual([]);
    expect(normalized.rules).toHaveLength(1);
    const rule = normalized.rules[0];
    expect(rule.targets).toEqual([{ provider: 'openrouter', model: 'anthropic/claude-sonnet', weight: 1 }]);
    expect(rule.fallbacks).toEqual(['groq/llama-3.1-70b']);
    expect(rule.cel_expression).toContain('headers["x-user-tier"] == "vip"');
    expect(rule.cel_expression).toContain('model.startsWith("k-obs/")');
    expect(rule.cel_expression).toContain('tokens_used > 4096');
    expect(rule.cel_expression).toContain('params["stream"] == "false"');
    expect(rule.cel_expression).toContain('request_type == "chat_completion"');
  });

  it('normalizes target weights from AI drafts so they sum to 1.0', () => {
    const normalized = normalizeAiDraft({
      type: 'rule_draft',
      rules: [{
        name: 'Bad Weights',
        cel_expression: 'true',
        targets: [
          { provider: 'a', model: 'm1', weight: 1 },
          { provider: 'b', model: 'm2', weight: 1 },
          { provider: 'c', model: 'm3', weight: 1 },
        ],
        fallbacks: ['a/fallback'],
      }],
    });
    expect(normalized.validation.errors).toEqual([]);
    const sum = normalized.rules[0].targets.reduce((acc, t) => acc + t.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(normalized.validation.warnings.some((w) => w.includes('target weights sum'))).toBe(false);
  });


  it('replaces non-UUID AI rule ids with UUIDs', () => {
    const normalized = normalizeAiDraft({
      type: 'rule_draft',
      rules: [{ id: 'human-readable-id', name: 'UID Test', cel_expression: 'true', targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }], fallbacks: [] }],
    });
    expect(normalized.rules[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

});
