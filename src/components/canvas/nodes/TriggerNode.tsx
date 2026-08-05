/**
 * Trigger node — the visual representation of a Bifrost routing rule.
 * Holds the CEL expression (or complexity tier), scope, priority and
 * chain-rule flag. The canvas -> rules mapper reads these fields.
 */
import { memo } from 'react';
import { Zap, Link2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { BaseNode, type PortDef } from './BaseNode';
import { Chip } from '@/components/ui/primitives';
import type { NodeProps } from 'reactflow';
import type { TriggerNodeData } from '@/types/workflow';

const ports: PortDef[] = [{ id: 'out', type: 'source', label: 'targets', accent: '#a78bfa' }];

function TriggerNodeImpl({ id, data, selected }: NodeProps<TriggerNodeData>) {
  const update = useStore((s) => s.updateNodeData);
  const sim = useStore((s) => s.sim);
  const simPlaybackIndex = useStore((s) => s.simPlaybackIndex);
  const isSimulating = !!sim?.path.slice(0, simPlaybackIndex + 1).some((step) => step.nodeId === id);
  const isComplexity = data.triggerKind === 'complexity';
  const accent = isComplexity ? '#fbbf24' : '#a78bfa';

  return (
    <BaseNode
      id={id}
      selected={selected}
      title={data.label}
      subtitle={`priority ${data.priority} · ${data.scope}`}
      icon={isComplexity ? <Zap size={16} /> : <Link2 size={16} />}
      accent={accent}
      accentSoft={isComplexity ? 'rgba(251,191,36,0.15)' : 'rgba(167,139,250,0.15)'}
      ports={ports}
      simulating={isSimulating}
      headerRight={
        <button
          onClick={(e) => {
            e.stopPropagation();
            update(id, { enabled: !data.enabled });
          }}
          className={`ml-1 h-4 w-7 rounded-full transition-colors ${data.enabled ? 'bg-neon-green/70' : 'bg-surface-3'}`}
          title={data.enabled ? 'Enabled' : 'Disabled'}
        >
          <span
            className={`block h-3.5 w-3.5 rounded-full bg-ink transition-transform ${
              data.enabled ? 'translate-x-3' : 'translate-x-0.5'
            }`}
          />
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip tone={isComplexity ? 'amber' : 'violet'}>{isComplexity ? 'Complexity' : data.triggerKind}</Chip>
          {data.chainRule && <Chip tone="cyan">chain re-eval</Chip>}
          {data.scope !== 'global' && <Chip tone="neutral">{data.scope}</Chip>}
        </div>
        {data.chainRule && (
          <div className="rounded-md border border-neon-amber/20 bg-neon-amber/10 px-2 py-1 text-[10px] text-neon-amber">
            after match: re-evaluate rules with resolved provider/model
          </div>
        )}
        <code className="block text-[11px] leading-relaxed text-ink-muted font-mono bg-canvas/60 rounded-lg px-2.5 py-2 border border-border break-words max-h-20 overflow-hidden">
          {data.celExpression || 'true'}
        </code>
      </div>
    </BaseNode>
  );
}

export const TriggerNode = memo(TriggerNodeImpl);
