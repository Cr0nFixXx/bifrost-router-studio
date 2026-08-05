/**
 * Shared visual chrome for every custom node on the canvas.
 *
 * Handles the frosted-glass card, accent header, diagnostic ring, selection
 * glow, and directional connection ports (left/right in LR mode, top/bottom in
 * TB mode). Individual node types compose their body via children.
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { diagnosticsForNode } from '@/lib/validation';
import { AlertTriangle, AlertCircle } from 'lucide-react';

export interface PortDef {
  id: string;
  type: 'source' | 'target';
  label?: string;
  accent?: string;
}

const RING: Record<string, string> = {
  error: 'ring-2 ring-neon-red/70 shadow-[0_0_24px_-6px_rgba(248,113,113,0.6)]',
  warning: 'ring-2 ring-neon-amber/60',
  info: 'ring-2 ring-neon-cyan/50',
};

export const BaseNode: React.FC<{
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent: string;
  accentSoft: string;
  ports: PortDef[];
  selected?: boolean;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  simulating?: boolean;
}> = ({ id, title, subtitle, icon, accent, accentSoft, ports, selected, headerRight, children, simulating }) => {
  const direction = useStore((s) => s.direction);
  const diags = useStore((s) => diagnosticsForNode(s.diagnostics, id));
  const highlighted = useStore((s) => s.highlightedNodeIds.includes(id));
  const disabledChain = useStore((s) => {
    const disabledTriggers = s.nodes.filter((n) => n.data.kind === 'trigger' && !(n.data as any).enabled).map((n) => n.id);
    if (disabledTriggers.includes(id)) return true;

    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    const forward = new Map<string, string[]>();
    const reverse = new Map<string, string[]>();
    s.edges.forEach((e) => {
      if (e.sourceHandle === 'chainout' || e.targetHandle === 'chainin') return;
      const f = forward.get(e.source) ?? [];
      f.push(e.target);
      forward.set(e.source, f);
      const r = reverse.get(e.target) ?? [];
      r.push(e.source);
      reverse.set(e.target, r);
    });

    const addLogicInputs = (logicId: string, out: Set<string>) => {
      for (const src of reverse.get(logicId) ?? []) {
        const srcNode = byId.get(src);
        if (!srcNode || (srcNode.data.kind !== 'condition' && srcNode.data.kind !== 'logic')) continue;
        if (out.has(src)) continue;
        out.add(src);
        if (srcNode.data.kind === 'logic') addLogicInputs(src, out);
      }
    };

    const isSharedCondition = (nodeId: string) => {
      const node = byId.get(nodeId);
      if (node?.data.kind !== 'condition') return false;
      // If a condition has multiple incoming owners, do not traverse outward
      // from it for disabled-state propagation. Otherwise disabling one rule
      // would grey out unrelated rules that share this condition.
      return (reverse.get(nodeId) ?? []).length > 1;
    };

    for (const root of disabledTriggers) {
      const disabled = new Set<string>([root]);
      const queue = [...(forward.get(root) ?? [])];
      while (queue.length) {
        const cur = queue.shift()!;
        if (disabled.has(cur)) continue;
        disabled.add(cur);
        const curNode = byId.get(cur);
        if (curNode?.data.kind === 'logic') addLogicInputs(cur, disabled);
        if (isSharedCondition(cur)) continue;
        queue.push(...(forward.get(cur) ?? []));
      }
      if (disabled.has(id)) return true;
    }
    return false;
  });
  const error = diags.find((d) => d.level === 'error');
  const warn = diags.find((d) => d.level === 'warning');

  const isLR = direction === 'LR';
  const targets = ports.filter((p) => p.type === 'target');
  const sources = ports.filter((p) => p.type === 'source');

  const place = (list: PortDef[], i: number, type: 'source' | 'target') => {
    const total = list.length;
    const offset = ((i + 1) / (total + 1)) * 100;
    if (isLR) {
      return type === 'target'
        ? { left: -6, top: `${offset}%` }
        : { right: -6, top: `${offset}%` };
    }
    return type === 'target'
      ? { top: -6, left: `${offset}%` }
      : { bottom: -6, left: `${offset}%` };
  };

  const ringClass = error ? RING.error : warn ? RING.warning : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`relative min-w-[230px] max-w-[280px] rounded-2xl glass-strong ${
        highlighted ? 'ring-4 ring-neon shadow-glow' : selected ? 'ring-2 ring-neon shadow-glow' : ringClass
      } ${disabledChain ? 'opacity-40 grayscale' : ''} transition-all`}
    >
      {/* accent side-bar */}
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: accent }} />

      {/* Ports */}
      {targets.map((p, i) => (
        <Port key={p.id} def={p} style={place(targets, i, 'target')} isLR={isLR} type="target" />
      ))}
      {sources.map((p, i) => (
        <Port key={p.id} def={p} style={place(sources, i, 'source')} isLR={isLR} type="source" />
      ))}

      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg shrink-0"
          style={{ background: accentSoft, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink truncate leading-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-faint truncate">{subtitle}</div>}
        </div>
        {headerRight}
      </div>

      {/* Body */}
      {children && <div className="px-3 pb-3 pt-2.5">{children}</div>}

      {/* Diagnostic footer */}
      {diags.length > 0 && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5 text-[11px]">
          {error ? (
            <AlertCircle size={13} className="text-neon-red" />
          ) : (
            <AlertTriangle size={13} className="text-neon-amber" />
          )}
          <span className={error ? 'text-neon-red' : 'text-neon-amber'}>{error?.title ?? warn?.title}</span>
        </div>
      )}

      {simulating && (
        <span className="absolute -inset-0.5 rounded-2xl pointer-events-none animate-pulse-ring" style={{ color: accent }} />
      )}
    </motion.div>
  );
};

const Port: React.FC<{
  def: PortDef;
  style: React.CSSProperties;
  isLR: boolean;
  type: 'source' | 'target';
}> = ({ def, style, isLR, type }) => {
  const position = isLR ? (type === 'target' ? Position.Left : Position.Right) : type === 'target' ? Position.Top : Position.Bottom;
  return (
    <Handle
      id={def.id}
      type={type}
      position={position}
      style={{
        ...style,
        background: def.accent ?? '#5eead4',
      }}
    >
      {/* pill label */}
      <span
        className="absolute text-[9px] uppercase tracking-wide text-ink-faint whitespace-nowrap pointer-events-none"
        style={
          isLR
            ? type === 'target'
              ? { left: 12, top: -6 }
              : { right: 12, top: -6 }
            : type === 'target'
              ? { top: 12, left: -10 }
              : { bottom: 12, left: -10 }
        }
      >
        {def.label}
      </span>
    </Handle>
  );
};
