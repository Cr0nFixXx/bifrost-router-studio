import { afterEach, describe, expect, it, vi } from 'vitest';
import { BifrostApi, BifrostApiError, directTransport } from './bifrostApi';

const TOKEN = 'secret';

/** Stub fetch with a per-path handler; anything unhandled is a hard failure. */
function stubFetch(routes: Record<string, (url: string) => unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const path = url.replace('https://gw.test', '');
    const route = Object.entries(routes).find(([p]) => path.startsWith(p));
    if (!route) return new Response(JSON.stringify({ error: { message: 'no route' } }), { status: 404 });
    const body = route[1](path);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('BifrostApi catalog reads', () => {
  it('pages through /api/models and keeps each model on its own provider', async () => {
    // The handler defaults `limit` to 5, so a catalog larger than one page only
    // arrives complete if the client follows `total`. This mock answers three at
    // a time regardless of the requested limit, which also pins the short-page path.
    const all = Array.from({ length: 7 }, (_, i) => ({ name: `m-${i}`, provider: 'ocgoo' }));
    const calls = stubFetch({
      '/api/models': (path) => {
        const offset = Number(new URL('https://x' + path).searchParams.get('offset') ?? 0);
        return { models: all.slice(offset, offset + 3), total: all.length };
      },
    });

    const models = await new BifrostApi(directTransport('https://gw.test', TOKEN)).listModels();

    expect(models).toHaveLength(7);
    expect(models[0]).toEqual({ id: 'ocgoo/m-0', provider: 'ocgoo', model: 'm-0', label: 'm-0' });
    expect(models.map((m) => m.id)).toEqual(all.map((m) => `ocgoo/${m.name}`));
    expect(calls).toEqual([
      'https://gw.test/api/models?limit=500&offset=0',
      'https://gw.test/api/models?limit=500&offset=3',
      'https://gw.test/api/models?limit=500&offset=6',
    ]);
  });

  it('stops when a gateway ignores the requested limit', async () => {
    const calls = stubFetch({
      '/api/models': () => ({ models: [{ name: 'm', provider: 'ocgoo' }], total: 1 }),
    });
    await new BifrostApi(directTransport('https://gw.test', TOKEN)).listModels();
    expect(calls).toHaveLength(1);
  });

  it('addresses the catalog without a version prefix', async () => {
    const calls = stubFetch({ '/api/models': () => ({ models: [], total: 0 }) });
    await new BifrostApi(directTransport('https://gw.test', TOKEN)).listModels();
    // `/api/routing/api/models` would be the rewrite `request()` performs — and does not exist.
    expect(calls[0]).toBe('https://gw.test/api/models?limit=500&offset=0');
  });

  it('turns /api/providers plus its keys into canvas provider configs', async () => {
    stubFetch({
      '/api/providers/vercel/keys': () => ({ keys: [{ id: 'key-1', weight: 0.5, models: ['anthropic/claude'] }], total: 1 }),
      '/api/providers': () => ({ providers: [{ name: 'vercel', provider_status: 'active' }], total: 1 }),
    });

    const [provider] = await new BifrostApi(directTransport('https://gw.test', TOKEN)).listProviders();

    expect(provider.id).toBe('vercel');
    expect(provider.supported).toBe(true);
    expect(provider.keys[0].key_id).toBe('key-1');
  });

  it('surfaces a gateway that does not serve the catalog', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 }));
    await expect(new BifrostApi(directTransport('https://gw.test', TOKEN)).listModels()).rejects.toBeInstanceOf(BifrostApiError);
  });
});