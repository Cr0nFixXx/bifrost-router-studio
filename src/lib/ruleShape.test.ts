import { describe, it, expect } from 'vitest';
import {
  WEIGHT_GATE_EPSILON,
  WEIGHT_WARN_EPSILON,
  fallbacksForApi,
  fallbacksForConfig,
  fallbacksFromConfig,
  normalizeWeights,
  queryForRow,
  queryForWrite,
  weightSum,
} from '@/lib/ruleShape';
import { fallbackToParts } from '@/lib/modelRefs';

const t = (weight: number) => ({ provider: 'openai', model: 'gpt-4o-mini', weight });

describe('weightSum', () => {
  it('adds up weights and treats a missing one as 0', () => {
    expect(weightSum([t(1), t(0.5)])).toBe(1.5);
    expect(weightSum([{ weight: 1 }, {}])).toBe(1);
    expect(weightSum([])).toBe(0);
  });
});

describe('the two weight thresholds', () => {
  it('are not interchangeable: a sum the gate rejects is still below the warning', () => {
    // 0.0005 off: Bifrost answers 400, but on the canvas it is invisible.
    const drift = 1.0005;
    expect(Math.abs(drift - 1)).toBeGreaterThan(WEIGHT_GATE_EPSILON);
    expect(Math.abs(drift - 1)).toBeLessThan(WEIGHT_WARN_EPSILON);
  });

  it('float noise passes the gate', () => {
    expect(Math.abs(1.0000005 - 1)).toBeLessThan(WEIGHT_GATE_EPSILON);
  });

  it('a thousandth off is worth telling a human about', () => {
    expect(Math.abs(1.002 - 1)).toBeGreaterThan(WEIGHT_WARN_EPSILON);
  });
});

describe('normalizeWeights', () => {
  it('rescales to ratios and lets the last target absorb the residual', () => {
    const out = normalizeWeights([t(1), t(1), t(1)]);
    expect(weightSum(out)).toBeCloseTo(1, 9);
    expect(out[2].weight).toBeCloseTo(1 - out[0].weight - out[1].weight, 9);
  });

  it('keeps the ratios of an unequal split', () => {
    const out = normalizeWeights([t(3), t(1)]);
    expect(out[0].weight).toBeCloseTo(0.75, 6);
    expect(out[1].weight).toBeCloseTo(0.25, 6);
  });

  it('splits evenly when there is no ratio to preserve', () => {
    const out = normalizeWeights([t(0), t(0)]);
    expect(weightSum(out)).toBeCloseTo(1, 9);
    expect(out[0].weight).toBeCloseTo(0.5, 6);
  });

  it('returns a new array and leaves the input alone', () => {
    const input = [t(1), t(1)];
    const out = normalizeWeights(input);
    expect(out).not.toBe(input);
    expect(input[0].weight).toBe(1);
    expect(normalizeWeights([])).toEqual([]);
  });
});

describe('queryForWrite', () => {
  it('returns the builder object for a real expression', () => {
    const obj = queryForWrite('model == "gpt-4o-mini"');
    expect(obj).toBeTruthy();
    expect(obj!.combinator).toBe('and');
  });

  it('returns null when the parser cannot read the CEL', () => {
    expect(queryForWrite('this is not cel (((')).toBeNull();
  });
});

describe('queryForRow', () => {
  const cel = 'model == "gpt-4o-mini"';
  const stored = JSON.stringify({ id: 'grp_1', combinator: 'and', rules: [{ id: 'r_1', field: 'model', operator: '==', value: 'gpt-4o-mini' }] });

  it('keeps the stored query when the CEL did not change', () => {
    expect(queryForRow(cel, cel, stored)).toBe(stored);
  });

  it('regenerates when the CEL changed', () => {
    const fresh = queryForRow('model == "gpt-4o"', cel, stored);
    expect(fresh).not.toBe(stored);
    expect(fresh).toContain('gpt-4o');
  });

  it('regenerates when the stored value is not usable query-builder JSON', () => {
    expect(queryForRow(cel, cel, 'not json at all')).toContain('combinator');
    expect(queryForRow(cel, cel, null)).toContain('combinator');
  });

  it('regenerates when there is no previous row', () => {
    expect(queryForRow(cel, null, stored)).toContain('combinator');
  });
});

describe('fallbacksForApi', () => {
  it('drops the config.json-only alias and keeps the key id', () => {
    const out = fallbacksForApi([{ provider: 'openai', model: 'gpt-4o', provider_key_name: 'prod' }]);
    expect(out).toEqual([{ provider: 'openai', model: 'gpt-4o' }]);

    const pinned = fallbacksForApi([{ provider: 'openai', key_id: 'k-9' }]);
    expect(pinned).toEqual([{ provider: 'openai', key_id: 'k-9' }]);
  });

  it('drops entries Bifrost refuses: no provider, or empty', () => {
    expect(fallbacksForApi([{ provider: '' }, '', 'anthropic/claude'])).toEqual(['anthropic/claude']);
  });
});

describe('fallbacksForConfig and back', () => {
  it('pins by name when the id resolves', () => {
    const out = fallbacksForConfig([{ provider: 'openai', model: 'gpt-4o', key_id: 'k-9' }], (id) => (id === 'k-9' ? 'prod' : undefined));
    expect(out).toEqual([{ provider: 'openai', model: 'gpt-4o', provider_key_name: 'prod' }]);
  });

  it('keeps the key id rather than losing the pin when no name resolves', () => {
    const out = fallbacksForConfig([{ provider: 'openai', key_id: 'k-9' }], () => undefined);
    expect(out).toEqual([{ provider: 'openai', key_id: 'k-9' }]);
  });

  it('round-trips a pinned fallback back to the same id', () => {
    const toConfig = fallbacksForConfig([{ provider: 'openai', model: 'gpt-4o', key_id: 'k-9' }], (id) => (id === 'k-9' ? 'prod' : undefined));
    expect(toConfig).toEqual([{ provider: 'openai', model: 'gpt-4o', provider_key_name: 'prod' }]);
    const back = fallbacksFromConfig(toConfig, (n) => (n === 'prod' ? 'k-9' : undefined));
    expect(back).toEqual([{ provider: 'openai', model: 'gpt-4o', key_id: 'k-9' }]);
  });

  it('resolves a name back to an id on import', () => {
    const back = fallbacksFromConfig([{ provider: 'openai', provider_key_name: 'prod' }], (n) => (n === 'prod' ? 'k-9' : undefined));
    expect(back).toEqual([{ provider: 'openai', key_id: 'k-9' }]);
  });

  it('leaves a name that resolves to nothing unpinned rather than dropping the fallback', () => {
    const back = fallbacksFromConfig([{ provider: 'openai', provider_key_name: 'gone' }], () => undefined);
    expect(fallbackToParts(back[0]).provider).toBe('openai');
    expect(fallbackToParts(back[0]).key_id).toBeUndefined();
  });
});
