/** Target / Fallback / Provider / Model / Complexity custom nodes. */
import { memo } from 'react';
import { Target as TargetIcon, ShieldAlert, Server, Boxes, Layers, GitBranch, Filter } from 'lucide-react';
import { BaseNode, type PortDef } from './BaseNode';
import { Chip } from '@/components/ui/primitives';
import { useStore } from '@/store/useStore';
import { emitCondition } from '@/lib/cel';
import type { NodeProps } from 'reactflow';
import type {
  AnnotationNodeData,
  ComplexityNodeData,
  ConditionNodeData,
  FallbackNodeData,
  LogicNodeData,
  ModelNodeData,
  ProviderNodeData,
  TargetNodeData,
} from '@/types/workflow';

function useSimulatingNode(id: string): boolean {
  const sim = useStore((s) => s.sim);
  const idx = useStore((s) => s.simPlaybackIndex);
  return !!sim?.path.slice(0, idx + 1).some((step) => step.nodeId === id);
}

/* ----------------------------- Annotation -------------------------- */
function AnnotationNodeImpl({ id, data, selected }: NodeProps<AnnotationNodeData>) {
  const isBox = data.variant === 'box';
  const isMarker = data.variant === 'marker';
  const isPen = data.variant === 'pen';
  return (
    <div
      className={`relative rounded-2xl border ${selected ? 'ring-2 ring-neon' : ''} ${isBox ? 'bg-transparent border-dashed' : 'glass-strong'} p-3 min-w-[220px] max-w-[320px]`}
      style={{ borderColor: data.color, background: isMarker ? `${data.color}22` : isPen ? 'transparent' : undefined }}
    >
      <div className="text-xs font-semibold text-ink mb-1" style={{ color: data.color }}>{data.label}</div>
      <div className={`${isPen ? 'font-mono italic' : ''} whitespace-pre-wrap text-sm text-ink-muted leading-relaxed`}>{data.text}</div>
      <div className="mt-2 text-[9px] uppercase tracking-wider text-ink-faint">visual only · not saved to DB rules</div>
    </div>
  );
}
export const AnnotationNode = memo(AnnotationNodeImpl);

/* ----------------------------- Condition --------------------------- */
const conditionPorts: PortDef[] = [
  { id: 'in', type: 'target', label: 'rule', accent: '#a78bfa' },
  { id: 'out', type: 'source', label: 'out', accent: '#fbbf24' },
];
function ConditionNodeImpl({ id, data, selected }: NodeProps<ConditionNodeData>) {
  const isSimulating = useSimulatingNode(id);
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title={data.label || 'Condition'}
      subtitle={data.negate ? 'NOT condition' : 'CEL condition'}
      icon={<Filter size={16} />}
      accent="#fbbf24"
      accentSoft="rgba(251,191,36,0.15)"
      ports={conditionPorts}
    >
      <code className="block text-[11px] leading-relaxed text-ink-muted font-mono bg-canvas/60 rounded-lg px-2.5 py-2 border border-border break-words">
        {emitCondition({ ...data, id })}
      </code>
    </BaseNode>
  );
}
export const ConditionNode = memo(ConditionNodeImpl);

/* ------------------------------- Logic ----------------------------- */
const logicPorts: PortDef[] = [
  { id: 'in', type: 'target', label: 'in', accent: '#fbbf24' },
  { id: 'out', type: 'source', label: 'out', accent: '#fbbf24' },
];
function LogicNodeImpl({ id, data, selected }: NodeProps<LogicNodeData>) {
  const isSimulating = useSimulatingNode(id);
  const isAnd = data.combinator === '&&';
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title={isAnd ? 'AND' : 'OR'}
      subtitle="combine conditions"
      icon={<GitBranch size={16} />}
      accent={isAnd ? '#5eead4' : '#a78bfa'}
      accentSoft={isAnd ? 'rgba(94,234,212,0.15)' : 'rgba(167,139,250,0.15)'}
      ports={logicPorts}
    >
      <div className="flex items-center gap-2">
        <Chip tone={isAnd ? 'cyan' : 'violet'}>{isAnd ? 'all inputs must match' : 'any input may match'}</Chip>
      </div>
    </BaseNode>
  );
}
export const LogicNode = memo(LogicNodeImpl);

/* ------------------------------ Target ----------------------------- */
const targetPorts: PortDef[] = [
  { id: 'in', type: 'target', label: 'in', accent: '#22d3ee' },
  { id: 'fbout', type: 'source', label: 'fallback', accent: '#f87171' },
];
function TargetNodeImpl({ id, data, selected }: NodeProps<TargetNodeData>) {
  const isSimulating = useSimulatingNode(id);
  const routes = data.routes?.length ? data.routes : [{ provider: data.providerId, model: data.modelId, weight: data.weight, api_key: data.apiKeyId }];
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title={data.label}
      subtitle={routes.length > 1 ? `${routes.length} weighted models` : `${data.providerId || '?'} / ${data.modelId || '?'}`}
      icon={<TargetIcon size={16} />}
      accent="#22d3ee"
      accentSoft="rgba(34,211,238,0.15)"
      ports={targetPorts}
    >
      <div className="space-y-1.5">
        {routes.slice(0, 4).map((r, idx) => (
          <div key={idx} className="flex items-center gap-1.5 text-[10px]">
            <Chip tone="cyan">{r.provider || 'provider?'}</Chip>
            <span className="truncate text-ink-muted">{r.model || 'model?'}</span>
            <span className="ml-auto text-ink-faint">{((r.weight ?? 1) * 100).toFixed(0)}%</span>
          </div>
        ))}
        {routes.length > 4 && <div className="text-[10px] text-ink-faint">+ {routes.length - 4} more models</div>}
      </div>
    </BaseNode>
  );
}
export const TargetNode = memo(TargetNodeImpl);

/* ----------------------------- Fallback ---------------------------- */
const fallbackPorts: PortDef[] = [{ id: 'in', type: 'target', label: 'in', accent: '#f87171' }];
function FallbackNodeImpl({ id, data, selected }: NodeProps<FallbackNodeData>) {
  const isSimulating = useSimulatingNode(id);
  const fallbacks = data.fallbacks?.length ? data.fallbacks : [[data.providerId, data.modelId].filter(Boolean).join('/')].filter(Boolean);
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title={data.label}
      subtitle={fallbacks.length > 1 ? `${fallbacks.length} fallback models` : `${data.providerId || '?'} / ${data.modelId || '?'}`}
      icon={<ShieldAlert size={16} />}
      accent="#f87171"
      accentSoft="rgba(248,113,113,0.15)"
      ports={fallbackPorts}
    >
      <div className="space-y-1.5">
        {fallbacks.slice(0, 4).map((fb, idx) => (
          <div key={idx} className="flex items-center gap-2 text-[10px]">
            <Chip tone="red">#{idx + 1}</Chip>
            <span className="truncate text-ink-muted">{fb}</span>
          </div>
        ))}
        {fallbacks.length > 4 && <div className="text-[10px] text-ink-faint">+ {fallbacks.length - 4} more fallbacks</div>}
      </div>
    </BaseNode>
  );
}
export const FallbackNode = memo(FallbackNodeImpl);

/* ----------------------------- Provider ---------------------------- */
const providerPorts: PortDef[] = [{ id: 'out', type: 'source', label: 'out', accent: '#34d399' }];
function ProviderNodeImpl({ id, data, selected }: NodeProps<ProviderNodeData>) {
  const isSimulating = useSimulatingNode(id);
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title={data.label}
      subtitle={`provider: ${data.providerId || 'unset'}`}
      icon={<Server size={16} />}
      accent="#34d399"
      accentSoft="rgba(52,211,153,0.15)"
      ports={providerPorts}
    >
      <div className="flex items-center gap-2">
        <Chip tone="green">{data.providerId || 'unset'}</Chip>
        <Chip tone={data.supported ? 'green' : 'neutral'}>{data.supported ? 'supported' : 'off'}</Chip>
      </div>
    </BaseNode>
  );
}
export const ProviderNode = memo(ProviderNodeImpl);

/* ------------------------------- Model ----------------------------- */
const modelPorts: PortDef[] = [
  { id: 'in', type: 'target', label: 'in', accent: '#5eead4' },
  { id: 'fbout', type: 'source', label: 'fallback', accent: '#f87171' },
];
function ModelNodeImpl({ id, data, selected }: NodeProps<ModelNodeData>) {
  const isSimulating = useSimulatingNode(id);
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title={data.label}
      subtitle={`${data.providerId}/${data.modelId}`}
      icon={<Boxes size={16} />}
      accent="#5eead4"
      accentSoft="rgba(94,234,212,0.15)"
      ports={modelPorts}
    >
      <div className="text-xs text-ink-muted font-mono truncate">{data.modelId || 'model?'}</div>
    </BaseNode>
  );
}
export const ModelNode = memo(ModelNodeImpl);

/* ---------------------------- Complexity --------------------------- */
const complexityPorts: PortDef[] = [{ id: 'out', type: 'source', label: 'route', accent: '#fbbf24' }];
const TIER_TONE: Record<string, 'green' | 'cyan' | 'amber' | 'violet'> = {
  SIMPLE: 'green',
  MEDIUM: 'cyan',
  COMPLEX: 'amber',
  REASONING: 'violet',
};
function ComplexityNodeImpl({ id, data, selected }: NodeProps<ComplexityNodeData>) {
  const isSimulating = useSimulatingNode(id);
  return (
    <BaseNode
      id={id}
      selected={selected}
      simulating={isSimulating}
      title="Complexity Router"
      subtitle="auto-classified by Bifrost"
      icon={<Layers size={16} />}
      accent="#fbbf24"
      accentSoft="rgba(251,191,36,0.15)"
      ports={complexityPorts}
    >
      <div className="flex items-center gap-2">
        <Chip tone={TIER_TONE[data.tier] ?? 'amber'}>{data.tier}</Chip>
        <span className="text-[11px] text-ink-faint ml-auto">&rarr; target</span>
      </div>
    </BaseNode>
  );
}
export const ComplexityNode = memo(ComplexityNodeImpl);
