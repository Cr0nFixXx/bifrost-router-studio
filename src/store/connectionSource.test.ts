import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getApi, getDb, useStore } from '@/store/useStore';

/**
 * The mode is a decision, not an observation.
 *
 * `connectionSource` and the two handles had to be set together at five places
 * and four of them forgot. The damage was not cosmetic: "Open another database"
 * set `activeDb` and left `connectionSource === 'api'`, so `markDirty` scheduled
 * a sync to a gateway the user had already left — a file session writing to a
 * live gateway, with the debounce still armed.
 *
 * `BifrostDb.open` and `createSampleDb` are mocked because they load the sql.js
 * WASM through a Vite asset import that has no path under vitest's node
 * environment. What is under test is the decision, not the loader.
 */
vi.mock('@/lib/db/bifrostDb', () => ({
  BifrostDb: { open: vi.fn(async () => fakeDb()) },
}));
vi.mock('@/lib/db/sample', () => ({ createSampleDb: vi.fn(async () => fakeDb()) }));
vi.mock('@/lib/db/persistence', () => ({
  cacheDb: vi.fn(async () => {}),
  loadCachedDb: vi.fn(async () => null),
}));

function fakeDb() {
  return {
    detectKind: () => 'bifrost-routing',
    exportBytes: () => new Uint8Array([1]),
    close: vi.fn(),
    listRules: () => [],
    listProviders: () => [],
    listModels: () => [],
  };
}

async function enterApiMode(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
  await useStore.getState().connectApiDirect('http://gateway.invalid', 'tok');
  vi.unstubAllGlobals();
  expect(useStore.getState().connectionSource).toBe('api');
  expect(getApi()).not.toBeNull();
}

describe('the connection source is one decision', () => {
  beforeEach(() => {
    useStore.getState().disconnect();
  });

  it('never leaves a file session flagged as an API session', async () => {
    await enterApiMode();

    // The exact path the bug lived on: open a file without disconnecting first.
    await useStore.getState().connectSample();

    expect(useStore.getState().connectionSource).toBe('file');
    // The old client has to die with the switch. A handle that outlives its
    // session is what `syncNow` reaches for.
    expect(getApi()).toBeNull();
    expect(getDb()).not.toBeNull();
  });

  it('reports a new file as file even when it starts from a gateway session', async () => {
    await enterApiMode();
    await useStore.getState().createNew();
    expect({ source: useStore.getState().connectionSource, hasApi: getApi() !== null })
      .toEqual({ source: 'file', hasApi: false });
  });

  it('reports a file opened by picker as file even from a gateway session', async () => {
    await enterApiMode();
    const file = new File([new Uint8Array([1])], 'test.sqlite');
    await useStore.getState().connectFromFile(file);
    expect({ source: useStore.getState().connectionSource, hasApi: getApi() !== null })
      .toEqual({ source: 'file', hasApi: false });
  });

  it('closes the file handle it replaces', async () => {
    const first = await useStore.getState().connectSample();
    expect(first).toBeUndefined();

    const before = getDb()!;
    await useStore.getState().connectSample();
    // Two sessions on one handle would leak the WASM database the first one held.
    expect(getDb()).not.toBe(before);
  });

  it('leaves neither handle behind on disconnect', async () => {
    await useStore.getState().connectSample();
    expect(getDb()).not.toBeNull();

    useStore.getState().disconnect();
    expect({ db: getDb(), api: getApi(), source: useStore.getState().connectionSource })
      .toEqual({ db: null, api: null, source: 'file' });
  });

  it('takes the gateway when a file session was open first', async () => {
    await useStore.getState().connectSample();
    await enterApiMode();
    expect({ source: useStore.getState().connectionSource, db: getDb(), hasApi: getApi() !== null })
      .toEqual({ source: 'api', db: null, hasApi: true });
  });
});

/**
 * The SQL browser reads the SQLite file directly, so it needs a file handle.
 * The guard used to be `disabled={isApi}` on the TopBar button — the panel
 * still opened from anywhere else, and then `listRoutingRulesTableRows`
 * returned `?? []`, which looks exactly like an empty database.
 */
describe('openSqlBrowser', () => {
  beforeEach(() => {
    useStore.getState().disconnect();
    useStore.setState({ sqlBrowserOpen: false, error: null });
  });

  it('refuses without a file and says why', () => {
    useStore.getState().openSqlBrowser();
    expect(useStore.getState().sqlBrowserOpen).toBe(false);
    expect(useStore.getState().error).toMatch(/SQLite-Datei/);
  });

  it('refuses in gateway mode', async () => {
    await enterApiMode();
    useStore.getState().openSqlBrowser();
    expect(useStore.getState().sqlBrowserOpen).toBe(false);
    expect(useStore.getState().error).toMatch(/Gateway-Modus/);
  });

  it('opens when a file is connected', async () => {
    await useStore.getState().connectSample();
    useStore.getState().openSqlBrowser();
    expect(useStore.getState().sqlBrowserOpen).toBe(true);
    expect(useStore.getState().error).toBeNull();
  });
});