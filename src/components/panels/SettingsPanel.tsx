import { Palette, Settings, Zap, Activity, LayoutGrid, Bot } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button, Toggle } from '@/components/ui/primitives';
import { THEME_PRESETS, loadThemeMode, setHue, setPreset, setThemeMode, type ThemeMode } from '@/lib/theme';
import { useUserSettings } from '@/store/useUserSettings';
import { useAiAssistant } from '@/store/useAiAssistant';

export function SettingsPanel() {
  const expertMode = useStore((s) => s.expertMode);
  const toggleExpert = useStore((s) => s.toggleExpert);
  const direction = useStore((s) => s.direction);
  const canvasLocked = useStore((s) => s.canvasLocked);
  const setCanvasLocked = useStore((s) => s.setCanvasLocked);
  const canvasMode = useStore((s) => s.canvasMode);
  const setCanvasMode = useStore((s) => s.setCanvasMode);
  const setDirection = useStore((s) => s.setDirection);
  const autoArrange = useStore((s) => s.autoArrange);
  const [mode, setMode] = useState<ThemeMode>(() => loadThemeMode());
  const projects = useUserSettings((s) => s.projects);
  const activeProjectId = useUserSettings((s) => s.activeProjectId);
  const addProject = useUserSettings((s) => s.addProject);
  const setActiveProject = useUserSettings((s) => s.setActiveProject);
  const removeProject = useUserSettings((s) => s.removeProject);
  const visualElements = useUserSettings((s) => s.visualElements);
  const clearVisualElements = useUserSettings((s) => s.clearVisualElements);
  const visualToolColor = useUserSettings((s) => s.visualToolColor);
  const visualToolSize = useUserSettings((s) => s.visualToolSize);
  const setVisualToolColor = useUserSettings((s) => s.setVisualToolColor);
  const setVisualToolSize = useUserSettings((s) => s.setVisualToolSize);
  const [projectName, setProjectName] = useState('');
  const ai = useAiAssistant();

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-faint">Settings</div>
        <div className="text-sm font-semibold text-ink">Studio preferences</div>
      </div>

      <Section icon={<Palette size={14} />} title="Theme">
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(['dark', 'light'] as ThemeMode[]).map((m) => (
            <button key={m} type="button" onClick={() => { setThemeMode(m); setMode(m); }} className={`rounded-lg border px-3 py-2 text-xs ${mode === m ? 'border-neon bg-neon/10 text-neon' : 'border-border text-ink-muted hover:bg-surface-2'}`}>
              {m === 'dark' ? 'Dark mode' : 'Light mode'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2 mb-3">
          {THEME_PRESETS.map((p) => <button key={p.id} title={p.name} onClick={() => setPreset(p.id)} className="h-7 w-7 rounded-full border border-border" style={{ background: `rgb(${p.rgb.join(' ')})` }} />)}
        </div>
        <input type="range" min={0} max={360} defaultValue={170} onChange={(e) => setHue(Number(e.target.value))} className="w-full accent-neon" />
      </Section>


      <Section icon={<Bot size={14} />} title="AI Assistant">
        <Row label="Enable AI Assistant"><Toggle checked={ai.enabled} onChange={ai.setEnabled} /></Row>
        <label className="block mb-2"><span className="text-[10px] text-ink-faint">OpenAI-compatible base URL</span><input className="input text-xs mt-1" value={ai.baseUrl} onChange={(e) => ai.setProviderSettings({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></label>
        <label className="block mb-2"><span className="text-[10px] text-ink-faint">Model</span><input className="input text-xs mt-1" value={ai.model} onChange={(e) => ai.setProviderSettings({ model: e.target.value })} placeholder="gpt-4o-mini" /></label>
        <label className="block mb-2"><span className="text-[10px] text-ink-faint">API key</span><input type="password" className="input text-xs mt-1" value={ai.apiKey} onChange={(e) => ai.setProviderSettings({ apiKey: e.target.value })} placeholder="Stored only if remember is enabled" /></label>
        <Row label="Remember API key in localStorage"><Toggle checked={ai.rememberApiKey} onChange={(v) => ai.setProviderSettings({ rememberApiKey: v })} /></Row>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="text-[10px] text-ink-faint">Temperature</span><input type="number" min={0} max={2} step={0.1} className="input text-xs mt-1" value={ai.temperature} onChange={(e) => ai.setProviderSettings({ temperature: Number(e.target.value) })} /></label>
          <label><span className="text-[10px] text-ink-faint">Max tokens</span><input type="number" min={512} max={16000} step={256} className="input text-xs mt-1" value={ai.maxTokens} onChange={(e) => ai.setProviderSettings({ maxTokens: Number(e.target.value) })} /></label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void ai.testConnection()} disabled={ai.testStatus === 'testing'}>
            {ai.testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          {ai.testStatus !== 'idle' && <span className={`text-[11px] ${ai.testStatus === 'ok' ? 'text-neon-green' : ai.testStatus === 'error' ? 'text-neon-red' : 'text-ink-faint'}`}>{ai.testMessage}</span>}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">Default context for AI is selected rules plus provider/model catalog. The assistant is review-only and never changes the canvas directly.</p>
      </Section>

      <Section icon={<Settings size={14} />} title="User workspace / projects">
        <div className="flex gap-2 mb-3">
          <input className="input text-xs" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="New project name" />
          <Button size="sm" onClick={() => { addProject(projectName); setProjectName(''); }}>Add</Button>
        </div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {projects.length === 0 && <div className="text-xs text-ink-faint">No projects saved yet.</div>}
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-canvas/50 px-2 py-1.5 text-xs">
              <button className={activeProjectId === p.id ? 'text-neon' : 'text-ink'} onClick={() => setActiveProject(p.id)}>{p.name}</button>
              <span className="ml-auto text-ink-faint">{new Date(p.updatedAt).toLocaleDateString()}</span>
              <button className="text-ink-faint hover:text-neon-red" onClick={() => removeProject(p.id)}>×</button>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<LayoutGrid size={14} />} title="Visual canvas tools">
        <Row label={`${visualElements.length} background visual elements`}><Button size="sm" variant="outline" onClick={clearVisualElements}>Clear all</Button></Row>
        <div className="grid grid-cols-[auto_1fr] gap-3 items-center mb-2">
          <span className="text-xs text-ink-muted">Color</span>
          <input type="color" value={visualToolColor} onChange={(e) => setVisualToolColor(e.target.value)} className="h-9 w-16 rounded border border-border bg-surface-2 p-1" />
          <span className="text-xs text-ink-muted">Pen/marker size</span>
          <input type="range" min={1} max={48} value={visualToolSize} onChange={(e) => setVisualToolSize(Number(e.target.value))} className="w-full accent-neon" />
        </div>
        <p className="text-[11px] text-ink-faint">Sticky notes, boxes, markers and pen strokes are stored in user settings and do not alter the Bifrost DB.</p>
      </Section>

      <Section icon={<Settings size={14} />} title="Editor">
        <Row label="Expert mode"><Toggle checked={expertMode} onChange={toggleExpert} /></Row>
      </Section>

      <Section icon={<LayoutGrid size={14} />} title="Canvas layout">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Button variant={direction === 'LR' ? 'primary' : 'outline'} size="sm" onClick={() => setDirection('LR')}>Horizontal</Button>
          <Button variant={direction === 'TB' ? 'primary' : 'outline'} size="sm" onClick={() => setDirection('TB')}>Vertical</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Button variant={canvasMode === 'drag' ? 'primary' : 'outline'} size="sm" onClick={() => setCanvasMode('drag')}>Drag/Pan mode</Button>
          <Button variant={canvasMode === 'select' ? 'primary' : 'outline'} size="sm" onClick={() => setCanvasMode('select')}>Select mode</Button>
        </div>
        <Row label="Lock workspace"><Toggle checked={canvasLocked} onChange={setCanvasLocked} /></Row>
        <Button variant="outline" size="sm" onClick={autoArrange}><Zap size={13} /> Auto-arrange</Button>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface-2/40 p-3"><div className="flex items-center gap-1.5 mb-3 text-[11px] uppercase tracking-wider text-ink-faint font-semibold">{icon}{title}</div>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between rounded-lg bg-canvas/50 border border-border px-3 py-2 text-xs text-ink-muted mb-2"><span>{label}</span>{children}</div>;
}
