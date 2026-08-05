import { describe, expect, it } from 'vitest';
import { inferProviderFromModelValue, modelCandidates, modelValueForSelection, stripProviderPrefix } from './modelRefs';

describe('modelRefs', () => {
  it('strips selected provider prefix from model ids', () => {
    expect(stripProviderPrefix('vercel/anthropic/claude-sonnet-4.6', 'vercel')).toBe('anthropic/claude-sonnet-4.6');
    expect(stripProviderPrefix('gpt-4o', 'openai')).toBe('gpt-4o');
  });

  it('uses model field before id when selecting catalog values', () => {
    expect(modelValueForSelection({ id: 'vercel/anthropic/claude', provider: 'vercel', model: 'anthropic/claude' }, 'vercel')).toBe('anthropic/claude');
    expect(modelValueForSelection({ id: 'vercel/anthropic/claude', provider: 'vercel' }, 'vercel')).toBe('anthropic/claude');
  });

  it('filters target candidates by provider and returns unprefixed models', () => {
    const c = [
      { id: 'vercel/anthropic/claude', provider: 'vercel' },
      { id: 'openai/gpt-4o', provider: 'openai' },
    ];
    expect(modelCandidates(c, 'vercel', true)).toEqual(['anthropic/claude']);
    expect(modelCandidates(c, '', true)).toEqual([]);
  });

  it('infers provider from provider/model values', () => {
    expect(inferProviderFromModelValue('vercel/anthropic/claude', ['openai', 'vercel'])).toBe('vercel');
    expect(inferProviderFromModelValue('anthropic/claude', ['openai', 'vercel'])).toBe(null);
  });
});
