/**
 * Right-click context menu for the canvas and individual nodes.
 * Provides Add Node (per kind), Group, Export, Delete, etc.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Trash2,
  Copy,
  Group,
  Ungroup,
  Download,
  Maximize2,
  Workflow,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { exportWorkspaceJSON, downloadFile } from '@/lib/io';
import type { NodeKind } from '@/types/workflow';

export interface ContextMenuState {
  x: number;
  y: number;
  flowX?: number;
  flowY?: number;
  nodeId?: string;
}

const ADD_KINDS: Array<{ kind: NodeKind; label: string }> = [
  { kind: 'trigger', label: 'Rule' },
  { kind: 'condition', label: 'Condition' },
  { kind: 'logic', label: 'AND / OR' },
  { kind: 'target', label: 'Target' },
  { kind: 'fallback', label: 'Fallback' },
  { kind: 'provider', label: 'Provider' },
];

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  return { menu, setMenu };
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const addNode = useStore((s) => s.addNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const duplicateRule = useStore((s) => s.duplicateRule);
  const copyRuleJson = useStore((s) => s.copyRuleJson);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupSelected = useStore((s) => s.ungroupSelected);
  const setGraph = useStore((s) => s.setGraph);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handler, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', handler, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!menu) return null;

  const position = {
    left: Math.min(menu.x, window.innerWidth - 230),
    top: Math.min(menu.y, window.innerHeight - 260),
  };
  const addPosition = { x: menu.flowX ?? menu.x - 100, y: menu.flowY ?? menu.y - 40 };

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  const menuNode = (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[2147483647] min-w-[200px] glass-strong rounded-xl shadow-depth p-1.5 text-sm"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.nodeId ? (
        <>
          <MenuRow icon={<Group size={14} />} label="Group selection" onClick={() => act(() => groupSelected())} />
          <MenuRow icon={<Ungroup size={14} />} label="Ungroup" onClick={() => act(() => ungroupSelected())} />
          <MenuRow
            icon={<Copy size={14} />}
            label="Duplicate node"
            onClick={() => act(() => {
              const n = nodes.find((x) => x.id === menu.nodeId);
              if (n) addNode(n.data.kind, { x: n.position.x + 40, y: n.position.y + 40 }, { ...(n.data as object) });
            })}
          />
          {nodes.find((x) => x.id === menu.nodeId)?.data.kind === 'trigger' && (
            <>
              <MenuRow icon={<Copy size={14} />} label="Duplicate whole rule" onClick={() => act(() => menu.nodeId && duplicateRule((nodes.find((x) => x.id === menu.nodeId)?.data as any)?.ruleId ?? menu.nodeId))} />
              <MenuRow icon={<Download size={14} />} label="Copy/export rule JSON" onClick={() => act(() => menu.nodeId && copyRuleJson((nodes.find((x) => x.id === menu.nodeId)?.data as any)?.ruleId ?? menu.nodeId))} />
            </>
          )}
          <div className="h-px bg-border my-1" />
          <MenuRow
            icon={<Trash2 size={14} />}
            label="Delete node"
            danger
            onClick={() => act(() => menu.nodeId && deleteNode(menu.nodeId))}
          />
        </>
      ) : (
        <>
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-faint">Add Node</div>
          {ADD_KINDS.map((k) => (
            <MenuRow
              key={k.kind}
              icon={<Plus size={14} />}
              label={k.label}
              onClick={() => act(() => addNode(k.kind, addPosition))}
            />
          ))}
          <div className="h-px bg-border my-1" />
          <MenuRow
            icon={<Maximize2 size={14} />}
            label="Auto-arrange"
            onClick={() => act(() => useStore.getState().autoArrange())}
          />
          <MenuRow
            icon={<Download size={14} />}
            label="Export workspace JSON"
            onClick={() => act(() => {
              downloadFile('workspace.json', exportWorkspaceJSON({ name: useStore.getState().dbFileName ?? 'project', direction: useStore.getState().direction, nodes, edges }));
            })}
          />
          <MenuRow icon={<Workflow size={14} />} label="Load Bootstrap template" onClick={() => act(() => useStore.getState().applyTemplate('cost-optimization'))} />
        </>
      )}
    </motion.div>
  );

  return createPortal(menuNode, document.body);
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-surface-2 ${
        danger ? 'text-neon-red' : 'text-ink-muted hover:text-ink'
      }`}
    >
      <span className={danger ? 'text-neon-red' : 'text-ink-faint'}>{icon}</span>
      {label}
    </button>
  );
}
