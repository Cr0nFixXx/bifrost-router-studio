/**
 * Connect screen — the app's entry point.
 *
 * Two exclusive ways in:
 *   - File mode: open a Bifrost SQLite DB from disk (or sample / blank). Read
 *     into WASM, never leaves the browser. This is how the studio has always
 *     worked and remains the default.
 *   - API mode: connect to a running gateway over Bifrost's management API and
 *     sync rules to it directly. Prefers the optional local bridge so the
 *     management token stays out of the browser.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  Upload,
  Sparkles,
  FilePlus2,
  History,
  ShieldCheck,
  Workflow,
  Layers,
  Cpu,
  X,
  Cloud,
  Plug,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useUserSettings } from '@/store/useUserSettings';
import { parseConfigJSON } from '@/lib/io';
import type { BridgeHealth } from '@/lib/bifrostApi';
import { Button, IconButton } from '@/components/ui/primitives';

const FEATURES = [
  { icon: <Workflow size={16} />, title: 'Visual rule chains', desc: 'Drag triggers, targets & fallbacks onto an infinite canvas.' },
  { icon: <Database size={16} />, title: 'Edits the real Bifrost DB', desc: 'Opens your SQLite config-store in-browser via WASM — no server.' },
  { icon: <ShieldCheck size={16} />, title: 'Live validation', desc: 'Catch cycles, bad weights & invalid CEL as you build.' },
];

export function ConnectScreen() {
  const connectFromFile = useStore((s) => s.connectFromFile);
  const connectSample = useStore((s) => s.connectSample);
  const createNew = useStore((s) => s.createNew);
  const reconnectCached = useStore((s) => s.reconnectCached);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:8787');
  const [pathHint, setPathHint] = useState<string | null>(null);

  /* API mode */
  const [mode, setMode] = useState<'file' | 'api'>('file');
  const [directOpen, setDirectOpen] = useState(false);
  const [directToken, setDirectToken] = useState('');
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const bifrostApiUrl = useUserSettings((s) => s.bifrostApiUrl);
  const setBifrostApiUrl = useUserSettings((s) => s.setBifrostApiUrl);
  const connectApiViaBridge = useStore((s) => s.connectApiViaBridge);
  const connectApiDirect = useStore((s) => s.connectApiDirect);
  const checkBridge = useStore((s) => s.checkBridge);

  // Ask the bridge whether it has a reachable gateway with a valid token, so a
  // failed connect says *why* instead of "failed to fetch".
  useEffect(() => {
    if (mode !== 'api') return;
    let live = true;
    setHealthBusy(true);
    void checkBridge(bridgeUrl).then((h) => {
      if (!live) return;
      setHealth(h);
      setHealthBusy(false);
    });
    return () => {
      live = false;
    };
  }, [mode, bridgeUrl, checkBridge]);

  const b = health?.bifrost;

  const onFile = (file?: File) => {
    if (file) connectFromFile(file);
  };

  const openLocalFileHandle = async () => {
    setPathHint(null);
    const picker = (window as any).showOpenFilePicker;
    if (typeof picker === 'function') {
      const [handle] = await picker({
        types: [{ description: 'SQLite database', accept: { 'application/x-sqlite3': ['.sqlite', '.sqlite3', '.db'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      await connectFromFile(file);
      return;
    }
    setPathHint('Direkte Dateipfade sind im Browser aus Sicherheitsgründen nicht lesbar. Bitte nutze den Datei-Picker oder die optionale Local Bridge.');
    fileRef.current?.click();
  };

  const openServerPath = async () => {
    setPathHint(null);
    if (!localPath.trim()) {
      setPathHint('Bitte einen Server-Dateipfad oder relativen Pfad unter BFRS_LOCAL_ROOT angeben.');
      return;
    }
    try {
      const url = `${bridgeUrl.replace(/\/$/, '')}/api/open?path=${encodeURIComponent(localPath.trim())}`;
      const res = await fetch(url);
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try { message = (await res.json()).error ?? message; } catch { /* ignore */ }
        throw new Error(message);
      }
      const filename = decodeURIComponent(res.headers.get('x-bfrs-filename') ?? localPath.split(/[\/]/).pop() ?? 'config.sqlite');
      if (/\.json$/i.test(filename)) {
        const text = await res.text();
        const { rules, providers } = parseConfigJSON(text);
        await useStore.getState().createNew();
        await useStore.getState().importConfig({ providers: providers as any, governance: { routing_rules: rules } });
        return;
      }
      const blob = await res.blob();
      await connectFromFile(new File([blob], filename, { type: 'application/x-sqlite3' }));
    } catch (err) {
      setPathHint(`Local Bridge konnte den Pfad nicht öffnen: ${(err as Error).message}. Starte z.B. npm run bridge mit BFRS_LOCAL_ROOT=/pfad/zum/config-ordner.`);
    }
  };

  return (
    <div className="h-full w-full grid lg:grid-cols-2 overflow-auto">
      {/* Brand / feature side */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-grid-faint [background-size:32px_32px]">
        <div className="absolute inset-0 bg-gradient-to-br from-neon/5 via-transparent to-neon-violet/5 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-neon to-neon-violet text-canvas text-lg font-bold shadow-glow">⚡</div>
          <div>
            <div className="text-lg font-semibold text-ink">Bifrost Router Studio</div>
            <div className="text-xs text-ink-faint">Client-side SQLite editor for routing rules</div>
          </div>
        </div>
        <div className="relative space-y-4 max-w-sm">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="flex items-start gap-3 rounded-xl glass px-4 py-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neon/10 text-neon">{f.icon}</span>
              <div>
                <div className="text-sm font-medium text-ink">{f.title}</div>
                <div className="text-xs text-ink-faint">{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="relative text-[11px] text-ink-faint flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Cpu size={12} /> SQLite runs in WASM</span>
          <span className="flex items-center gap-1.5"><Layers size={12} /> No backend · no data leaves your browser</span>
        </div>
      </div>

      {/* Action side */}
      <div className="flex items-center justify-center p-6 bg-canvas">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-strong rounded-2xl p-7 shadow-depth"
        >
          <div className="flex items-center gap-2 text-neon mb-3">
            {mode === 'file' ? <Database size={16} /> : <Cloud size={16} />}
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              {mode === 'file' ? 'Connect to Bifrost DB' : 'Connect to Bifrost API'}
            </span>
          </div>

          <div className="flex gap-1 p-1 rounded-xl bg-surface-2/60 border border-border mb-4">
            {(['file', 'api'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-colors ${
                  mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {m === 'file' ? 'SQLite-Datei' : 'Laufende Instanz'}
              </button>
            ))}
          </div>

          {mode === 'api' ? (
            <>
              <h1 className="text-xl font-semibold text-ink mb-1">Regeln direkt synchronisieren</h1>
              <p className="text-xs text-ink-faint mb-4">
                Arbeitet gegen die Management-API einer laufenden Bifrost-Instanz. Der Token bleibt in der lokalen
                Bridge — nie im Browser.
              </p>

              <div className="mb-4 rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">Lokale Bridge</div>
                <input className="input text-xs" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="http://localhost:8787" />
                <div className="flex items-start gap-2 text-[10px] leading-relaxed">
                  <span className={`mt-0.5 shrink-0 ${!health ? 'text-ink-faint' : b?.authOk ? 'text-neon' : 'text-neon-red'}`}>
                    {healthBusy ? '·' : b?.authOk ? '●' : '○'}
                  </span>
                  <span className={b?.authOk ? 'text-neon' : 'text-ink-faint'}>
                    {healthBusy
                      ? 'Bridge wird geprüft…'
                      : b?.authOk
                        ? `${b.url} erreichbar${b.version ? ` (${b.version})` : ''}, Token gültig`
                        : (b?.reason ?? 'Bridge antwortet nicht. Starte sie mit npm run bridge.')}
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => void connectApiViaBridge(bridgeUrl)} disabled={busy || healthBusy}>
                  <Plug size={13} /> Mit Bridge verbinden
                </Button>
                <p className="text-[10px] text-ink-faint leading-relaxed">
                  Bridge-Start: <code>BFRS_BIFROST_URL=http://localhost:8080 BFRS_BIFROST_TOKEN=&lt;key&gt; npm run bridge</code>
                </p>
              </div>

              <button
                onClick={() => setDirectOpen((o) => !o)}
                className="w-full text-left text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink-muted mb-2"
              >
                {directOpen ? '▾' : '▸'} Direkt verbinden (ohne Bridge)
              </button>
              {directOpen && (
                <div className="mb-4 rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
                  <input
                    className="input text-xs"
                    value={bifrostApiUrl}
                    onChange={(e) => setBifrostApiUrl(e.target.value)}
                    placeholder="http://localhost:8080"
                  />
                  <input
                    className="input text-xs"
                    type="password"
                    value={directToken}
                    onChange={(e) => setDirectToken(e.target.value)}
                    placeholder="Management-Token (nur für diese Sitzung)"
                  />
                  <Button variant="outline" size="sm" className="w-full" onClick={() => void connectApiDirect(bifrostApiUrl, directToken)} disabled={busy}>
                    <Cloud size={13} /> Direkt verbinden
                  </Button>
                  <p className="text-[10px] text-ink-amber leading-relaxed">
                    Der Token wird nicht gespeichert, liegt aber für diese Sitzung im Browser-Speicher. Nur für lokale
                    Testinstanzen — in Produktion die Bridge verwenden.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-ink mb-1">Open your routing-rules database</h1>
              <p className="text-xs text-ink-faint mb-6">
                Choose a <code className="text-ink-muted">.sqlite</code>/<code className="text-ink-muted">.db</code> file that holds your Bifrost
                routing configuration. We read & write it in-memory with SQLite (WASM).
              </p>

              {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors mb-4 ${
              dragging ? 'border-neon bg-neon/5' : 'border-border hover:border-border-strong'
            }`}
          >
            <Upload size={26} className="mx-auto text-ink-faint mb-2" />
            <div className="text-sm text-ink mb-0.5">Drop a database file here</div>
            <div className="text-[11px] text-ink-faint">or click to browse</div>
            <input
              ref={fileRef}
              type="file"
              accept=".db,.sqlite,.sqlite3"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
            />
          </div>

          <div className="mb-4 rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">Lokaler SQLite-/config.json-Pfad</div>
            <input className="input text-xs" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="Local Bridge URL, e.g. http://localhost:8787" />
            <input className="input text-xs" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="config.sqlite, config.json or /absolute/path/config.sqlite" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void openServerPath()} disabled={busy}>
                <Database size={13} /> Open via Local Bridge
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void openLocalFileHandle()} disabled={busy}>
                <Upload size={13} /> Browser file handle
              </Button>
            </div>
            <p className="text-[10px] text-ink-faint leading-relaxed">Serverseitige Pfade benötigen die optionale Local Bridge: <code>npm run bridge</code> und optional <code>BFRS_LOCAL_ROOT=/path/to/configs</code> bzw. <code>BFRS_ALLOW_ABSOLUTE=1</code>.</p>
            {pathHint && <p className="text-[10px] text-neon-amber leading-relaxed">{pathHint}</p>}
          </div>

              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" onClick={connectSample} disabled={busy}>
                  <Sparkles size={15} /> Open sample database
                </Button>
                <Button variant="ghost" onClick={createNew} disabled={busy}>
                  <FilePlus2 size={15} /> Create a new empty database
                </Button>
                <Button variant="ghost" onClick={reconnectCached} disabled={busy}>
                  <History size={15} /> Resume last session
                </Button>
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-neon-red/10 text-neon-red flex items-start gap-2">
              <X size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {busy && (
            <div className="mt-4 text-center text-xs text-ink-faint flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block h-3 w-3 rounded-full border-2 border-neon border-t-transparent" />
              Connecting…
            </div>
          )}

          <p className="text-[10px] text-ink-faint mt-6 text-center leading-relaxed">
            {mode === 'api'
              ? 'Regeln werden live gegen die Management-API geschrieben. Auto-Sync ist aus — schalte ihn in den Einstellungen ein.'
              : 'This tool edits the routing_rules & providers tables of the file you open. It never proxies inference traffic. Back up production databases before editing.'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
