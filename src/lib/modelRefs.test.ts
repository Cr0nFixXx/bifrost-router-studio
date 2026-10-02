import { describe, expect, it } from 'vitest';
import {
  fallbackFromParts,
  fallbackToParts,
  fallbackToRef,
  inferProviderFromModelValue,
  modelCandidates,
  modelValueForSelection,
  stripProviderPrefix,
} from './modelRefs';

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

  it('splits fallback entries in both the legacy string and the pinned object form', () => {
    expect(fallbackToParts('anthropic/claude')).toEqual({ provider: 'anthropic', model: 'claude', key_id: undefined });
    expect(fallbackToParts('anthropic/')).toEqual({ provider: 'anthropic', model: undefined, key_id: undefined });
    expect(fallbackToParts({ provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'k1' }))
      .toEqual({ provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'k1' });
    // config.json aliases the pinned key by name
    expect(fallbackToParts({ provider: 'vertex', provider_key_name: 'prod-key' }).key_id).toBe('prod-key');
  });

  it('keeps the compact string form unless a key is pinned', () => {
    expect(fallbackFromParts('anthropic', 'claude', '')).toBe('anthropic/claude');
    expect(fallbackFromParts('anthropic', '', undefined)).toBe('anthropic/');
    expect(fallbackFromParts('anthropic', '', 'k1')).toEqual({ provider: 'anthropic', key_id: 'k1' });
    expect(fallbackFromParts('', '', undefined)).toBe('');
    expect(fallbackToRef({ provider: 'vertex', model: 'gemini-2.5-pro' })).toBe('vertex/gemini-2.5-pro');
  });

  it('infers provider from provider/model values', () => {
    expect(inferProviderFromModelValue('vercel/anthropic/claude', ['openai', 'vercel'])).toBe('vercel');
    expect(inferProviderFromModelValue('anthropic/claude', ['openai', 'vercel'])).toBe(null);
  });
});
