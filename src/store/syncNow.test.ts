import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';
import type { ApiRule, RoutingRule } from '@/types/bifrost';
import { toWriteShape } from '@/lib/bifrostApi';

const base: RoutingRule = {
  id: 'r1', name: 'A', enabled: true, chain_rule: false,
  cel_expression: 'true',
  targets: [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
  fallbacks: [], scope: 'global', scope_id: null, priority: 0,
};

const remoteOf = (r: RoutingRule): ApiRule => ({ ...toWriteShape(r), id: r.id } as ApiRule);

describe('syncNow', () => {
  let calls: string[];
  let stored: ApiRule[];

  beforeEach(() => {
    calls = [];
    stored = [remoteOf(base)];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(method);
      if (method === 'GET') return new Response(JSON.stringify({ rules: stored }), { status: 200 });
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (method === 'PUT') stored = stored.map((r) => (r.id === body.id || r.id === 'r1' ? { ...r, ...body } : r));
      if (method === 'POST') stored = [...stored, { ...body, id: `new${stored.length}` } as ApiRule];
      if (method === 'DELETE') {
        const url = String(_url);
        stored = stored.filter((r) => !url.endsWith(r.id));
      }
      return new Response(JSON.stringify({ rule: body }), { status: 200 });
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); useStore.setState({ nodes: [], edges: [], rules: [] }); });

  const connect = async () => {
    await useStore.getState().connectApiDirect('http://gw.test', 'tok');
    expect(useStore.getState().connection).toBe('connected');
    return useStore.getState().nodes[0].id as string;
  };

  it('schreibt eine Canvas-Umbenennung ans Gateway', async () => {
    const triggerId = await connect();
    useStore.getState().updateNodeData(triggerId, { label: 'A renamed' });
    await useStore.getState().syncNow();
    expect(calls).toContain('PUT');
    expect(stored[0].name).toBe('A renamed');
  });

  it('schreibt eine neue Canvas-Regel ans Gateway', async () => {
    await connect();
    const t = useStore.getState().addNode('trigger', { x: 0, y: 400 }, { label: 'Neu', celExpression: 'true' } as never);
    const g = useStore.getState().addNode('target', { x: 300, y: 400 }, { label: 'g', providerId: 'openai', modelId: 'gpt-4o-mini', weight: 1 } as never);
    useStore.getState().onConnect({ source: t, target: g, sourceHandle: 'out', targetHandle: 'in' } as never);
    await useStore.getState().syncNow();
    expect(calls).toContain('POST');
    expect(stored.map((r) => r.name)).toContain('Neu');
  });

  it('löscht eine auf dem Canvas entfernte Regel', async () => {
    const triggerId = await connect();
    useStore.getState().deleteNode(triggerId);
    await useStore.getState().syncNow();
    expect(calls).toContain('DELETE');
    expect(stored).toHaveLength(0);
  });

  it('schreibt ohne Änderung nichts', async () => {
    await connect();
    calls.length = 0;
    await useStore.getState().syncNow();
    expect(calls.filter((c) => c !== 'GET')).toHaveLength(0);
  });
});
