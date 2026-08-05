/**
 * Collapsible left sidebar: brand, primary navigation, the draggable node
 * palette, and quick actions. Collapses to an icon rail.
 */
import { motion } from 'framer-motion';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Workflow,
  LayoutTemplate,
  Wand2,
  Server,
  Play,
  Database,
  Zap,
  GitBranch,
  Filter,
  Target,
  ShieldAlert,
  Plus,
  ChevronsUpDown,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { TEMPLATES } from '@/lib/templates';
import type { NodeKind } from '@/types/workflow';
import { EmptyState } from '@/components/ui/primitives';
import { useState } from 'react';
import { Modal, Button } from '@/components/ui/primitives';

const PALETTE: Array<{ kind: NodeKind; label: string; icon: React.ReactNode; color: string }> = [
  { kind: 'trigger', label: 'Rule', icon: <Zap size={15} />, color: '#a78bfa' },
  { kind: 'condition', label: 'Condition', icon: <Filter size={15} />, color: '#fbbf24' },
  { kind: 'logic', label: 'AND / OR', icon: <GitBranch size={15} />, color: '#5eead4' },
  { kind: 'target', label: 'Target', icon: <Target size={15} />, color: '#22d3ee' },
  { kind: 'fallback', label: 'Fallback', icon: <ShieldAlert size={15} />, color: '#f87171' },
];

export function Sidebar() {
  const collapsed = useStore((s) => s.leftCollapsed);
  const toggle = useStore((s) => s.toggleLeft);
  const addNode = useStore((s) => s.addNode);
  const leftWidth = useStore((s) => s.leftWidth);
  const setLeftWidth = useStore((s) => s.setLeftWidth);
  const setWizardOpen = useStore((s) => s.setWizardOpen);
  const setRightTab = useStore((s) => s.setRightTab);
  const applyTemplate = useStore((s) => s.applyTemplate);
  const [tplOpen, setTplOpen] = useState(false);

  const onDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData('application/bifrost-node', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 64 : leftWidth }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="relative z-20 h-full glass border-r border-border flex flex-col shrink-0"
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3 h-14 border-b border-border">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-neon to-neon-violet text-canvas font-bold shadow-glow">
            ⚡
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold text-ink truncate">Bifrost Studio</div>
              <div className="text-[10px] text-ink-faint truncate">Router Planner</div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {/* Actions */}
          <NavGroup collapsed={collapsed}>
            <NavItem collapsed={collapsed} icon={<Wand2 size={16} />} label="Rule-Chain Wizard" onClick={() => setWizardOpen(true)} accent="#a78bfa" />
            <NavItem collapsed={collapsed} icon={<LayoutTemplate size={16} />} label="Templates" onClick={() => setTplOpen(true)} />
            <NavItem collapsed={collapsed} icon={<Play size={16} />} label="Simulation" onClick={() => setRightTab('simulation')} />
            <NavItem collapsed={collapsed} icon={<Server size={16} />} label="Providers & Models" onClick={() => setRightTab('providers')} />
          </NavGroup>

          {/* Palette */}
          {!collapsed && (
            <div>
              <div className="label px-1">Node Palette</div>
              <div className="space-y-1.5">
                {PALETTE.map((p) => (
                  <div
                    key={p.kind}
                    draggable
                    onDragStart={(e) => onDragStart(e, p.kind)}
                    onDoubleClick={() => addNode(p.kind)}
                    className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-surface-2/60 border border-border cursor-grab active:cursor-grabbing hover:border-border-strong transition-colors"
                    title="Drag onto canvas (or double-click to add)"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: `${p.color}22`, color: p.color }}>
                      {p.icon}
                    </span>
                    <span className="text-xs text-ink-muted group-hover:text-ink flex-1">{p.label}</span>
                    <Plus size={13} className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-ink-faint px-1 mt-2 leading-relaxed">
                Drag nodes onto the canvas or double-click to drop them at the cursor.
              </p>
            </div>
          )}
        </div>

        {!collapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-neon/30 z-30"
            onPointerDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = leftWidth;
              const move = (ev: PointerEvent) => setLeftWidth(startW + (ev.clientX - startX));
              const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className="flex items-center justify-center gap-2 h-11 border-t border-border text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </motion.aside>

      <TemplatesModal open={tplOpen} onClose={() => setTplOpen(false)} onPick={applyTemplate} />
    </>
  );
}

function NavGroup({ children }: { children: React.ReactNode; collapsed: boolean }) {
  return <div className="space-y-1">{children}</div>;
}

function NavItem({
  icon,
  label,
  onClick,
  accent,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: string;
  collapsed: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
      style={accent ? undefined : undefined}
    >
      <span style={{ color: accent ?? '#9a9aa3' }}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function TemplatesModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Rule-Chain Templates" subtitle="Start from a battle-tested routing pattern" width="max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onPick(t.id);
              onClose();
            }}
            className="text-left rounded-xl border border-border bg-surface-2/50 p-4 hover:border-border-strong hover:bg-surface-2 transition-all group"
          >
            <div className="h-1 w-10 rounded-full mb-3" style={{ background: t.accent }} />
            <div className="text-sm font-semibold text-ink mb-1.5">{t.name}</div>
            <p className="text-xs text-ink-faint leading-relaxed">{t.description}</p>
            <div className="mt-3 text-xs text-neon opacity-0 group-hover:opacity-100 transition-opacity">Use template →</div>
          </button>
        ))}
      </div>
      {TEMPLATES.length === 0 && <EmptyState icon={<ChevronsUpDown size={28} />} title="No templates yet" />}
    </Modal>
  );
}
