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

const second: RoutingRule = { ...base, id: 'r2', name: 'B', priority: 1 };

const remoteOf = (r: RoutingRule): ApiRule => ({ ...toWriteShape(r), id: r.id } as ApiRule);

/** The gateway rejects a fallback whose provider prefix it does not know. */
const KNOWN_PREFIXES = new Set(['openai/', 'anthropic/', 'azure/', 'groq/', 'vertex/', 'bedrock/']);
const badFallback = (rule: { fallbacks: unknown }): boolean =>
  (rule.fallbacks as string[]).some((f) => !KNOWN_PREFIXES.has(`${String(f).split('/')[0]}/`));

describe('syncNow', () => {
  let calls: string[];
  let stored: ApiRule[];
  let seq: number;

  beforeEach(() => {
    calls = [];
    stored = [remoteOf(base)];
    seq = 0;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(method);
      if (method === 'GET') return new Response(JSON.stringify({ rules: stored }), { status: 200 });

      const id = decodeURIComponent(String(url).split('/').pop() ?? '');
      const body = JSON.parse(String(init?.body ?? '{}'));
      const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status });

      if (method === 'POST') {
        if (badFallback(body)) return fail(400, `fallbacks[0] "${body.fallbacks?.[0]}" is invalid: must use a known provider prefix`);
        seq += 1;
        stored = [...stored, { ...body, id: `srv-${seq}` } as ApiRule];
        return new Response(JSON.stringify({ rule: body }), { status: 200 });
      }
      if (method === 'PUT') {
        const current = stored.find((r) => r.id === id);
        if (!current) return fail(404, 'routing rule not found');
        if (badFallback({ fallbacks: body.fallbacks ?? current.fallbacks })) {
          return fail(400, `fallbacks[0] "${body.fallbacks?.[0]}" is invalid: must use a known provider prefix`);
        }
        // UNIQUE (scope, priority) — the constraint the studio only learned
        // from a 500 on the first priority swap.
        const taken = stored.find((r) => r.id !== id && r.scope === current.scope && r.priority === body.priority);
        if (taken) return fail(500, `Failed to update routing rule in database: routing rule with priority ${body.priority} already exists for scope '${current.scope}'`);
        stored = stored.map((r) => (r.id === id ? { ...r, ...body } : r));
        return new Response(JSON.stringify({ rule: body }), { status: 200 });
      }
      if (method === 'DELETE') {
        stored = stored.filter((r) => r.id !== id);
        return new Response(JSON.stringify({ message: 'deleted' }), { status: 200 });
      }
      return fail(405, 'method not allowed');
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); useStore.setState({ nodes: [], edges: [], rules: [] }); });

  const connect = async () => {
    await useStore.getState().connectApiDirect('http://gw.test', 'tok');
    expect(useStore.getState().connection).toBe('connected');
  };

  /** Node ids of the triggers, in gateway rule-id order — the canvas interleaves
   *  them with target and condition nodes, so positional indexing is wrong. */
  const triggerOf = (ruleId: string): string => {
    const node = useStore.getState().nodes.find((n) => (n.data as { ruleId?: string }).ruleId === ruleId);
    if (!node) throw new Error(`no trigger for ${ruleId}`);
    return node.id;
  };

  it('schreibt eine Canvas-Umbenennung ans Gateway', async () => {
    await connect();
    useStore.getState().updateNodeData(triggerOf('r1'), { label: 'A renamed' });
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
    await connect();
    useStore.getState().deleteNode(triggerOf('r1'));
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

  it('tauscht zwei Prioritäten, obwohl das Gateway (scope, priority) unique hält', async () => {
    stored = [remoteOf(base), remoteOf(second)];
    await connect();
    // Swap on the canvas: r1 gets priority 1, r2 gets 0.
    useStore.getState().updateNodeData(triggerOf('r1'), { priority: 1 });
    useStore.getState().updateNodeData(triggerOf('r2'), { priority: 0 });
    await useStore.getState().syncNow();

    expect(useStore.getState().syncStatus.pending).toBe(0);
    expect(stored.map((r) => [r.id, r.priority])).toEqual([['r1', 1], ['r2', 0]]);
  });

  it('überträgt die gute Regel, auch wenn eine andere am Gateway scheitert', async () => {
    // A rule the gateway will refuse, and a healthy one that must still land.
    stored = [remoteOf(base), remoteOf({ ...second, name: 'Broken', fallbacks: ['Test/prefix/model'] })];
    await connect();
    useStore.getState().updateNodeData(triggerOf('r1'), { label: 'A renamed' });
    useStore.getState().updateNodeData(triggerOf('r2'), { label: 'Broken renamed' });
    await useStore.getState().syncNow();

    const status = useStore.getState().syncStatus;
    expect(status.state).toBe('error');
    expect(status.pending).toBe(1);
    expect(status.failures[0]).toMatchObject({ op: 'update', name: 'Broken renamed' });
    expect(status.failures[0].message).toMatch(/known provider prefix/);
    // The point of the whole exercise: the healthy rule is not stranded.
    expect(stored.find((r) => r.id === 'r1')?.name).toBe('A renamed');
  });

  it('behält den Canvas-Zustand, wenn nicht alles übertragen wurde', async () => {
    stored = [remoteOf(base), remoteOf({ ...second, name: 'Broken', fallbacks: ['Test/prefix/model'] })];
    await connect();
    useStore.getState().updateNodeData(triggerOf('r2'), { label: 'Broken renamed' });
    await useStore.getState().syncNow();

    // refreshFromApi would rebuild the canvas from the gateway and throw the
    // refused edit away, so it must not run on a partial success.
    const kept = useStore.getState().getCanvasRules().find((r) => r.name === 'Broken renamed');
    expect(kept).toBeDefined();
    expect(useStore.getState().dirty).toBe(true);
  });
});
