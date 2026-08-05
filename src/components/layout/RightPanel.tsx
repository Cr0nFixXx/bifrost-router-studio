/**
 * Collapsible right panel. Hosts tabbed content (Inspector / Providers /
 * Simulation) and a persistent live-validation summary banner.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sliders, Server, Play, ListOrdered, PanelRightClose, PanelRightOpen, AlertTriangle, AlertCircle, CheckCircle2, History } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { InspectorPanel } from '@/components/panels/InspectorPanel';
import { ProviderManager } from '@/components/panels/ProviderManager';
import { SimulationPanel } from '@/components/panels/SimulationPanel';
import { RulesPanel } from '@/components/panels/RulesPanel';
import { HistoryPanel } from '@/components/panels/HistoryPanel';
import type { Diagnostic } from '@/lib/validation';

const TABS = [
  { id: 'inspector', label: 'Inspect', icon: <Sliders size={15} /> },
  { id: 'rules', label: 'Rules', icon: <ListOrdered size={15} /> },
  { id: 'history', label: 'History', icon: <History size={15} /> },
  { id: 'providers', label: 'Providers', icon: <Server size={15} /> },
  { id: 'simulation', label: 'Sim', icon: <Play size={15} /> },
] as const;

export function RightPanel() {
  const collapsed = useStore((s) => s.rightCollapsed);
  const toggle = useStore((s) => s.toggleRight);
  const tab = useStore((s) => s.activeRightTab);
  const setTab = useStore((s) => s.setRightTab);
  const diags = useStore((s) => s.diagnostics);
  const rightWidth = useStore((s) => s.rightWidth);
  const setRightWidth = useStore((s) => s.setRightWidth);

  const errors = diags.filter((d) => d.level === 'error').length;
  const warnings = diags.filter((d) => d.level === 'warning').length;

  if (collapsed) {
    return (
      <aside className="relative z-20 h-full glass border-l border-border flex flex-col items-center py-3 gap-2 w-14 shrink-0">
        <button onClick={toggle} className="text-ink-faint hover:text-ink p-2" title="Expand">
          <PanelRightOpen size={18} />
        </button>
        <div className="h-px w-6 bg-border" />
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`p-2.5 rounded-lg ${tab === t.id ? 'bg-neon/15 text-neon' : 'text-ink-muted hover:text-ink hover:bg-surface-2'}`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
        {(errors > 0 || warnings > 0) && (
          <div className="mt-auto grid place-items-center h-7 w-7 rounded-full bg-neon-amber/20 text-neon-amber text-[10px] font-bold" title={`${errors} errors, ${warnings} warnings`}>
            {errors || warnings}
          </div>
        )}
      </aside>
    );
  }

  return (
    <motion.aside
      initial={{ width: rightWidth }}
      animate={{ width: rightWidth }}
      exit={{ width: 0 }}
      className="relative z-20 h-full glass border-l border-border flex flex-col shrink-0"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-neon/30 z-30"
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = rightWidth;
          const move = (ev: PointerEvent) => setRightWidth(startW - (ev.clientX - startX));
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
      {/* Tabs */}
      <div className="flex items-center border-b border-border px-2 py-1.5 gap-1">
        <div className="grid grid-cols-5 gap-1 flex-1 min-w-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-w-0 flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                tab === t.id ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-2/60'
              }`}
              title={t.label}
            >
              {t.icon}
              <span className="truncate max-w-full">{t.label}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={toggle} className="text-ink-faint hover:text-ink p-2 ml-1 shrink-0" title="Collapse">
          <PanelRightClose size={18} />
        </button>
      </div>

      {/* Validation banner */}
      <ValidationBanner errors={errors} warnings={warnings} diagnostics={diags} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {tab === 'inspector' && <InspectorPanel />}
            {tab === 'rules' && <RulesPanel />}
            {tab === 'history' && <HistoryPanel />}
            {tab === 'providers' && <ProviderManager />}
            {tab === 'simulation' && <SimulationPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

function ValidationBanner({ errors, warnings, diagnostics }: { errors: number; warnings: number; diagnostics: Diagnostic[] }) {
  const [open, setOpen] = useState(false);

  if (errors === 0 && warnings === 0) {
    return (
      <div role="status" aria-live="polite" className="mx-3 mt-3 rounded-lg bg-neon-green/10 border border-neon-green/20 px-3 py-2 flex items-center gap-2 text-xs text-neon-green">
        <CheckCircle2 size={14} /> All checks passed — graph is valid.
      </div>
    );
  }

  const focusDiagnostic = (d: Diagnostic) => {
    const nodeId = d.nodeIds[0];
    if (nodeId) useStore.getState().selectNode(nodeId);
    useStore.getState().setRightTab('inspector');
  };

  return (
    <div className="mx-3 mt-3 rounded-lg bg-neon-amber/10 border border-neon-amber/20 overflow-hidden" role="status" aria-live="polite">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs text-neon-amber text-left hover:bg-neon-amber/15 transition-colors"
        title="Show validation details"
      >
        {errors > 0 ? <AlertCircle size={14} className="text-neon-red" /> : <AlertTriangle size={14} />}
        <span className="flex-1">
          {errors > 0 && <strong className="text-neon-red">{errors} error{errors > 1 ? 's' : ''}</strong>}
          {errors > 0 && warnings > 0 && ' · '}
          {warnings > 0 && <strong>{warnings} warning{warnings > 1 ? 's' : ''}</strong>}
        </span>
        <span className="text-[10px] text-ink-faint">{open ? 'hide' : 'show'}</span>
      </button>

      {open && (
        <div className="border-t border-neon-amber/20 p-2 space-y-1.5 max-h-56 overflow-y-auto">
          {diagnostics.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => focusDiagnostic(d)}
              className="w-full rounded-md bg-canvas/50 border border-border px-2.5 py-2 text-left hover:border-border-strong hover:bg-surface-2/70 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-xs">
                {d.level === 'error' ? <AlertCircle size={13} className="text-neon-red" /> : <AlertTriangle size={13} className="text-neon-amber" />}
                <span className={d.level === 'error' ? 'text-neon-red font-semibold' : 'text-neon-amber font-semibold'}>{d.title}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-ink-faint leading-relaxed">{d.detail}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
