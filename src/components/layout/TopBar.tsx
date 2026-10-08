/**
 * Top navigation for the connected editor: database identity + dirty state,
 * flow-direction switch, Expert mode, Save/Download the SQLite file, import a
 * workspace/config, export (workspace .json / config.json / .xml), and switch
 * or disconnect the current database.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Upload,
  Save,
  GitCompare,
  Database,
  FileJson,
  FileCode,
  ChevronDown,
  LogOut,
  Loader2,
  Plug,
  Waypoints,
  Network,
  Palette,
  LayoutTemplate,
  BarChart3,
  Settings,
  Search,
  HelpCircle,
  Bot,
  Minimize2,
  Maximize2,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { getDb, useStore } from '@/store/useStore';
import { useUserSettings } from '@/store/useUserSettings';
import { useAiAssistant } from '@/store/useAiAssistant';
import { Toggle, Button, IconButton } from '@/components/ui/primitives';
import {
  downloadBlob,
  downloadFile,
  exportConfigJSON,
  exportWorkspaceJSON,
  exportWorkspaceXML,
  parseConfigJSON,
  parseWorkspaceJSON,
  parseWorkspaceXML,
} from '@/lib/io';
import { toLiteLLM, toOpenAIModelGroups } from '@/lib/gatewayExport';
import { workflowToRules } from '@/lib/bifrostMapper';
import { workflowToMarkdown, workflowToRaster } from '@/lib/canvasExport';
import { APP_BUILD, APP_VERSION } from '@/lib/version';
import { THEME_PRESETS, setPreset, setHue, loadThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme';

export function TopBar() {
  const dbFileName = useStore((s) => s.dbFileName);
  const dbKind = useStore((s) => s.dbKind);
  const dirty = useStore((s) => s.dirty);
  const isApi = useStore((s) => s.connectionSource === 'api' && s.connection === 'connected');
  const apiLabel = useStore((s) => s.apiLabel);
  const syncStatus = useStore((s) => s.syncStatus);
  const syncNow = useStore((s) => s.syncNow);
  const autoSync = useUserSettings((s) => s.autoSync);
  const setAutoSync = useUserSettings((s) => s.setAutoSync);
  const direction = useStore((s) => s.direction);
  const setDirection = useStore((s) => s.setDirection);
  const simplifyConditions = useStore((s) => s.simplifyConditions);
  const expandConditions = useStore((s) => s.expandConditions);
  const expertMode = useStore((s) => s.expertMode);
  const toggleExpert = useStore((s) => s.toggleExpert);
  const saveToDb = useStore((s) => s.saveToDb);
  const downloadDb = useStore((s) => s.downloadDb);
  const openDbDiff = useStore((s) => s.openDbDiff);
  const openApiDiff = useStore((s) => s.openApiDiff);
  const openSyncFailures = useStore((s) => s.openSyncFailures);
  const setTemplatesOpen = useStore((s) => s.setTemplatesOpen);
  const setDashboardOpen = useStore((s) => s.setDashboardOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setSqlBrowserOpen = useStore((s) => s.setSqlBrowserOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setAiOpen = useAiAssistant((s) => s.setOpen);
  const aiEnabled = useAiAssistant((s) => s.enabled);
  const importConfig = useStore((s) => s.importConfig);
  const setGraph = useStore((s) => s.setGraph);
  const disconnect = useStore((s) => s.disconnect);
  const busy = useStore((s) => s.busy);

  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const providers = useStore((s) => s.providers);
  // Projected from the canvas, not read from a snapshot: exporting after an
  // edit must write the edited rules to disk.
  const rules = useMemo(() => workflowToRules(nodes, edges), [nodes, edges]);
  const connectFromFile = useStore((s) => s.connectFromFile);

  const [exportOpen, setExportOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => loadThemeMode());
  const viewRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewOpen) return;
    const onDown = (e: MouseEvent) => {
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [viewOpen]);

  useEffect(() => {
    if (!themeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [themeOpen]);
  const fileRef = useRef<HTMLInputElement>(null);
  const dbRef = useRef<HTMLInputElement>(null);

  const providerMap = Object.fromEntries(providers.map((p) => [p.id, p]));

  const doExport = async (kind: 'workspace' | 'config' | 'xml' | 'litellm' | 'openai' | 'png' | 'jpg' | 'markdown' | 'selected' | 'db') => {
    if (kind === 'db') { downloadDb(); setExportOpen(false); return; }
    if (kind === 'workspace') downloadFile(`${baseName()}.workspace.json`, exportWorkspaceJSON({ name: dbFileName ?? 'project', direction, nodes, edges }));
    if (kind === 'config') {
      const db = getDb();
      const keyNames = Object.fromEntries(db ? db.keyNameById() : []);
      downloadFile('config.json', exportConfigJSON(nodes, edges, providerMap, keyNames));
    }
    if (kind === 'xml') downloadFile(`${baseName()}.xml`, exportWorkspaceXML({ name: dbFileName ?? 'project', direction, nodes, edges }), 'application/xml');
    if (kind === 'litellm') { downloadFile(`${baseName()}.litellm.yaml`, toLiteLLM(rules, providers), 'text/yaml'); setExportOpen(false); return; }
    if (kind === 'openai') { downloadFile(`${baseName()}.model-groups.json`, JSON.stringify(toOpenAIModelGroups(rules, providers), null, 2), 'application/json'); setExportOpen(false); return; }
    if (kind === 'markdown') { downloadFile(`${baseName()}.md`, workflowToMarkdown(nodes as any, edges, providers), 'text/markdown'); setExportOpen(false); return; }
    if (kind === 'selected') {
      const selectedNodes = nodes.filter((n) => n.selected);
      const selectedIds = new Set(selectedNodes.map((n) => n.id));
      const selectedEdges = edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target));
      downloadFile(`${baseName()}.selected.json`, JSON.stringify({ app: 'bifrost-router-studio', kind: 'selection', nodes: selectedNodes, edges: selectedEdges }, null, 2));
      setExportOpen(false); return;
    }
    if (kind === 'png') { downloadBlob(`${baseName()}.png`, await workflowToRaster(nodes as any, edges, 'image/png')); setExportOpen(false); return; }
    if (kind === 'jpg') { downloadBlob(`${baseName()}.jpg`, await workflowToRaster(nodes as any, edges, 'image/jpeg')); setExportOpen(false); return; }
    setExportOpen(false);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Be defensive: users often select a real SQLite DB named config.sqlite
      // (or a renamed .txt upload) via the generic Import button. Do not read
      // binary SQLite as text and feed it into JSON.parse.
      if (/\.(db|sqlite3?|sqlite\.txt|db\.txt)$/i.test(file.name) || await hasSqliteMagic(file)) {
        await connectFromFile(file);
        return;
      }

      const text = await file.text();
      if (/\.xml$/i.test(file.name)) {
        const ws = parseWorkspaceXML(text);
        setGraph(ws.nodes, ws.edges);
        setDirectionLocal(ws.direction);
        return;
      }
      if (/config\.json$/i.test(file.name)) {
        const { rules, providers: provs } = parseConfigJSON(text);
        await importConfig({ providers: provs as any, governance: { routing_rules: rules } });
        return;
      }
      const ws = parseWorkspaceJSON(text);
      setGraph(ws.nodes, ws.edges);
      setDirectionLocal(ws.direction);
    } catch (err) {
      alert('Import failed: ' + (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  const setDirectionLocal = (d: 'LR' | 'TB') => {
    if (d && d !== direction) setDirection(d);
  };

  const baseName = () => (dbFileName ?? 'project').replace(/\.(db|sqlite|sqlite3)$/i, '') || 'project';

  return (
    <header className="relative z-30 min-h-14 shrink-0 glass border-b border-border flex flex-wrap items-center gap-2 px-3 py-2">
      {/* DB identity */}
      <div className="flex items-center gap-2 min-w-0 max-w-[260px] shrink">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-neon/10 text-neon shrink-0">
          {isApi ? <Cloud size={16} /> : <Database size={16} />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate leading-tight">{isApi ? (apiLabel ?? 'Gateway') : (dbFileName ?? 'No database')}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-ink-faint" role="status" aria-live="polite">
            {isApi ? (
              <>
                <span className={`h-1.5 w-1.5 rounded-full ${syncStatus.state === 'error' ? 'bg-neon-red' : syncStatus.state === 'syncing' ? 'bg-neon-amber' : dirty ? 'bg-neon-amber' : 'bg-neon-green'}`} />
                {syncStatus.state === 'error' ? (
                  // The number alone is not actionable — open the list that names
                  // the rules and the gateway's own reason for each.
                  <button type="button" onClick={openSyncFailures} className="hover:text-ink underline underline-offset-2 decoration-dotted">
                    {syncStatus.pending} nicht übertragen
                  </button>
                ) : (
                  <span>
                    {syncStatus.state === 'syncing'
                      ? 'synchronisiert…'
                      : dirty
                        ? 'Änderungen ausstehend'
                        : 'synchronisiert'}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className={`h-1.5 w-1.5 rounded-full ${dirty ? 'bg-neon-amber' : 'bg-neon-green'}`} />
                {dirty ? 'unsaved changes' : 'in sync'}
                {dbKind && <span className="ml-1 opacity-70">· {dbKind}</span>}
              </>
            )}
          </div>
        </div>
      </div>

      {isApi && (
        <>
          <Button variant="subtle" size="sm" onClick={() => void syncNow()} disabled={syncStatus.state === 'syncing'} title="Regeln jetzt an das Gateway übertragen">
            {syncStatus.state === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden 2xl:inline">Synchronisieren</span>
          </Button>
          <label className="flex items-center gap-1.5 text-[10px] text-ink-faint select-none" title="Jede Änderung automatisch übertragen (debounced)">
            <input type="checkbox" className="accent-neon" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            Auto-Sync
          </label>
        </>
      )}

      <div className="h-6 w-px bg-border" />

      <div className="relative shrink-0" ref={viewRef}>
        <Button variant="subtle" size="sm" onClick={() => setViewOpen((o) => !o)} title="View and layout options">
          <Maximize2 size={14} /> <span className="hidden 2xl:inline">View</span> <ChevronDown size={13} />
        </Button>
        {viewOpen && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="absolute left-0 top-10 z-50 w-56 glass-strong rounded-xl shadow-depth p-2 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-faint px-1">Direction</div>
            <div className="grid grid-cols-2 gap-1">
              <button className={`rounded-lg px-2 py-1.5 text-xs border ${direction === 'LR' ? 'border-neon bg-neon/10 text-neon' : 'border-border text-ink-muted hover:bg-surface-2'}`} onClick={() => { setDirection('LR'); setViewOpen(false); }}>Horizontal</button>
              <button className={`rounded-lg px-2 py-1.5 text-xs border ${direction === 'TB' ? 'border-neon bg-neon/10 text-neon' : 'border-border text-ink-muted hover:bg-surface-2'}`} onClick={() => { setDirection('TB'); setViewOpen(false); }}>Vertical</button>
            </div>
            <div className="h-px bg-border" />
            <button className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-surface-2 hover:text-ink" onClick={() => { simplifyConditions(); setViewOpen(false); }}><Minimize2 size={13} className="inline mr-1.5" />Simplify conditions</button>
            <button className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-surface-2 hover:text-ink" onClick={() => { expandConditions(); setViewOpen(false); }}><Maximize2 size={13} className="inline mr-1.5" />Expand conditions</button>
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-ink-muted">
              <span>Expert mode</span><Toggle checked={expertMode} onChange={toggleExpert} label="Expert mode" />
            </div>
          </motion.div>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 min-w-0">
        {/* No SQLite handle in API mode — the gateway is the target, not a file. */}
        {!isApi && (
          <Button variant="outline" size="sm" onClick={saveToDb} disabled={busy} title="Save changes to in-memory SQLite">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <span className="hidden 2xl:inline">Save</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void (isApi ? openApiDiff() : openDbDiff())}
          disabled={isApi && busy}
          title={isApi ? 'Show what Übertragen would write to the gateway' : 'Show unsaved changes vs the database'}
        >
          <GitCompare size={14} /> <span className="hidden 2xl:inline">Diff</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setDashboardOpen(true)} title="Open dashboard">
          <BarChart3 size={14} /> <span className="hidden 2xl:inline">Dashboard</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setSqlBrowserOpen(true)} title="Open SQL routing table browser" disabled={isApi}>
          <Database size={14} /> <span className="hidden 2xl:inline">SQL</span>
        </Button>

        <Button variant={aiEnabled ? 'primary' : 'ghost'} size="sm" onClick={() => setAiOpen(true)} title="AI Rule Assistant">
          <Bot size={14} /> <span className="hidden 2xl:inline">AI</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setSearchOpen(true)} title="Advanced search">
          <Search size={14} /> <span className="hidden 2xl:inline">Search</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} title="Help">
          <HelpCircle size={14} /> <span className="hidden 2xl:inline">Help</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)} title="Open the template gallery">
          <LayoutTemplate size={14} /> <span className="hidden 2xl:inline">Templates</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} title="Open settings">
          <Settings size={14} /> <span className="hidden 2xl:inline">Settings</span>
        </Button>
        <span className="hidden xl:inline text-[10px] text-ink-faint px-1" title={`Build ${APP_BUILD}`}>v{APP_VERSION}</span>

        <div className="relative" ref={themeRef}>
          <IconButton label="Accent theme" onClick={() => setThemeOpen((o) => !o)} active={themeOpen}>
            <Palette size={17} />
          </IconButton>
          {themeOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-11 z-50 w-56 glass-strong rounded-xl shadow-depth p-3 space-y-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-ink-faint">Accent</div>
              <div className="grid grid-cols-6 gap-2">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.name}
                    onClick={() => setPreset(p.id)}
                    className="h-6 w-6 rounded-full border border-white/10 transition-transform hover:scale-110"
                    style={{ background: 'rgb(' + p.rgb.join(' ') + ')' }}
                  />
                ))}
              </div>
              <div>
                <div className="text-[10px] text-ink-faint mb-1">Mode</div>
                <div className="grid grid-cols-2 gap-1">
                  {(['dark', 'light'] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setThemeMode(mode); setThemeModeState(mode); }}
                      className={`rounded-lg border px-2 py-1 text-xs ${themeMode === mode ? 'border-neon bg-neon/10 text-neon' : 'border-border text-ink-muted hover:bg-surface-2'}`}
                    >
                      {mode === 'dark' ? 'Dark' : 'Light'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-ink-faint mb-1">Custom hue</div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  defaultValue={170}
                  onChange={(e) => setHue(Number(e.target.value))}
                  className="w-full accent-neon"
                />
              </div>
            </motion.div>
          )}
        </div>

        <Button variant="subtle" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> <span className="hidden 2xl:inline">Import</span>
        </Button>
        <input ref={fileRef} type="file" accept=".json,.xml,.db,.sqlite,.sqlite3,.txt" className="hidden" onChange={onFile} />

        <div className="relative">
          <Button variant="subtle" size="sm" onClick={() => setExportOpen((o) => !o)}>
            <Download size={14} /> <span className="hidden 2xl:inline">Export</span> <ChevronDown size={13} />
          </Button>
          {exportOpen && (
            <Menu onClose={() => setExportOpen(false)}>
              {!isApi && <MenuItem icon={<Database size={14} />} label="SQLite DB (.sqlite)" onClick={() => void doExport('db')} />}
              <div className="my-1 h-px bg-border" />
              <MenuItem icon={<FileJson size={14} />} label="Workspace (.json)" onClick={() => void doExport('workspace')} />
              <MenuItem icon={<FileCode size={14} />} label="Bifrost config.json" onClick={() => void doExport('config')} />
              <MenuItem icon={<FileCode size={14} />} label="Workspace (.xml)" onClick={() => void doExport('xml')} />
              <div className="my-1 h-px bg-border" />
              <MenuItem icon={<Waypoints size={14} />} label="LiteLLM config (yaml)" onClick={() => void doExport('litellm')} />
              <MenuItem icon={<Network size={14} />} label="Model groups (OpenAI)" onClick={() => void doExport('openai')} />
              <div className="my-1 h-px bg-border" />
              <MenuItem icon={<FileJson size={14} />} label="Selected nodes/rules (.json)" onClick={() => void doExport('selected')} />
              <MenuItem icon={<FileCode size={14} />} label="Markdown report (.md)" onClick={() => void doExport('markdown')} />
              <MenuItem icon={<FileCode size={14} />} label="Canvas image (.png)" onClick={() => void doExport('png')} />
              <MenuItem icon={<FileCode size={14} />} label="Canvas image (.jpg)" onClick={() => void doExport('jpg')} />
            </Menu>
          )}
        </div>

        <IconButton label="Open another database" onClick={() => dbRef.current?.click()}>
          <Plug size={17} />
        </IconButton>
        <input ref={dbRef} type="file" accept=".db,.sqlite,.sqlite3,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) connectFromFile(f); e.target.value = ''; }} />

        <IconButton label="Disconnect" onClick={disconnect}>
          <LogOut size={17} />
        </IconButton>
      </div>
    </header>
  );
}

async function hasSqliteMagic(file: File): Promise<boolean> {
  const header = await file.slice(0, 16).arrayBuffer();
  return new TextDecoder().decode(header).startsWith('SQLite format 3');
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute right-0 top-10 z-50 min-w-[210px] glass-strong rounded-xl shadow-depth p-1.5"
      onMouseLeave={onClose}
    >
      {children}
    </motion.div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-sm text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
    >
      <span className="text-ink-faint">{icon}</span>
      {label}
    </button>
  );
}
