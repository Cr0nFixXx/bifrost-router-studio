import { describe, expect, it } from 'vitest';
import {
  fallbackFromParts,
  fallbackToParts,
  fallbackToRef,
  inferProviderFromModelValue,
  mapGatewayModels,
  modelCandidates,
  modelValueForSelection,
  providerOptions,
  splitModelId,
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

  it('splits at the first slash only — vendor prefixes stay in the model', () => {
    expect(splitModelId('nvidianim/meta/llama2-70b')).toEqual({ provider: 'nvidianim', model: 'meta/llama2-70b' });
    expect(splitModelId('EdenAI/cloudflare/@cf/meta-llama/llama-2-7b-chat-hf-lora')).toEqual({
      provider: 'EdenAI',
      model: 'cloudflare/@cf/meta-llama/llama-2-7b-chat-hf-lora',
    });
    expect(splitModelId('gpt-4o')).toEqual({ provider: '', model: 'gpt-4o' });
  });

  it('maps gateway models by provider, never by owned_by', () => {
    const [entry] = mapGatewayModels([
      { name: 'meta/llama2-70b', provider: 'nvidianim', owned_by: 'meta' } as { name: string; provider: string },
    ]);
    expect(entry).toEqual({ id: 'nvidianim/meta/llama2-70b', provider: 'nvidianim', model: 'meta/llama2-70b', label: 'meta/llama2-70b' });
  });

  it('falls back to the id prefix when a listing carries no provider field', () => {
    expect(mapGatewayModels([{ id: 'ocgoo/ocgo-o' }])).toEqual([
      { id: 'ocgoo/ocgo-o', provider: 'ocgoo', model: 'ocgo-o', label: 'ocgo-o' },
    ]);
  });

  it('offers providers from config and catalog alike, deduplicated', () => {
    const ids = providerOptions(
      [{ id: 'openai', type: 'azure' }],
      [{ provider: 'vercel' }, { provider: 'openai' }],
      'my-local-alias',
    );
    expect(ids).toEqual(['openai', 'azure', 'vercel', 'my-local-alias']);
  });
});
