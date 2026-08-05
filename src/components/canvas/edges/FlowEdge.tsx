/**
 * Custom animated edge with a traveling data pulse. The pulse is drawn with
 * SVG <animateMotion> along the computed path; the dash animation is CSS-driven
 * for a "flowing" look. Edges intensify (glow + faster pulse) when `data.active`
 * is set during simulation.
 */
import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import { Trash2, Check } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { FlowEdgeData } from '@/types/workflow';

function FlowEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<FlowEdgeData>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });

  const active = data?.active;
  const color = active ? '#5eead4' : selected ? '#a78bfa' : '#3a3a44';
  const deleteEdge = useStore((s) => s.deleteEdge);
  const updateEdgeLabel = useStore((s) => s.updateEdgeLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data?.label ?? '');

  const save = () => {
    updateEdgeLabel(id, draft);
    setEditing(false);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: active ? 2.6 : 1.8,
          strokeDasharray: active ? '6 6' : selected ? '8 4' : undefined,
          strokeDashoffset: active ? 0 : undefined,
          filter: active ? 'drop-shadow(0 0 6px rgba(94,234,212,0.7))' : undefined,
          animation: active ? 'dashmove 0.55s linear infinite' : undefined,
        }}
      />
      {active && (
        <circle r={4} fill="#5eead4" className="flow-pulse" style={{ color: '#5eead4' }}>
          <animateMotion dur="1.1s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      {(data?.label || selected) && (
        <EdgeLabelRenderer>
          <div
            className="absolute nodrag nopan pointer-events-auto flex items-center gap-1 rounded-md bg-surface-2 border border-border text-ink-muted shadow-depth px-1.5 py-1"
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
          >
            {editing ? (
              <>
                <input
                  className="w-32 rounded bg-canvas border border-border px-1.5 py-0.5 text-[10px] text-ink outline-none"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  autoFocus
                />
                <button type="button" onClick={save} className="rounded p-1 text-neon hover:bg-surface-3" title="Save label">
                  <Check size={12} />
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="max-w-40 truncate text-[10px] hover:text-ink" title="Click to edit edge label">
                {data?.label || 'label edge'}
              </button>
            )}
            {selected && (
              <button type="button" onClick={() => deleteEdge(id)} className="rounded p-1 text-ink-faint hover:bg-neon-red/10 hover:text-neon-red" title="Delete connection">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeImpl);
