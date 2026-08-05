/** Factory + helpers for creating workflow nodes of each kind. */
import { nanoid } from 'nanoid';
import type {
  AnnotationNodeData,
  ComplexityNodeData,
  ConditionNodeData,
  FallbackNodeData,
  GroupNodeData,
  LogicNodeData,
  ModelNodeData,
  NodeKind,
  ProviderNodeData,
  TargetNodeData,
  TriggerNodeData,
  WorkflowNodeData,
} from '@/types/workflow';
import { newGroup, uid } from './cel';
import { createRuleUid } from './ruleIds';

export function newId(kind: NodeKind) {
  return `${kind}_${nanoid(6)}`;
}

export function defaultData(kind: NodeKind): WorkflowNodeData {
  switch (kind) {
    case 'trigger':
      return {
        kind: 'trigger',
        label: 'New Rule',
        triggerKind: 'cel',
        celGroup: newGroup(),
        celExpression: 'true',
        enabled: true,
        ruleId: createRuleUid(),
        priority: 0,
        scope: 'global',
        scopeId: null,
        chainRule: false,
      } satisfies TriggerNodeData;
    case 'condition':
      return {
        kind: 'condition',
        label: 'Condition',
        field: 'model',
        op: '==',
        value: '',
      } satisfies ConditionNodeData;
    case 'logic':
      return {
        kind: 'logic',
        label: 'AND',
        combinator: '&&',
      } satisfies LogicNodeData;
    case 'provider':
      return {
        kind: 'provider',
        label: 'Provider',
        providerId: '',
        supported: true,
      } satisfies ProviderNodeData;
    case 'model':
      return {
        kind: 'model',
        label: 'Model',
        providerId: '',
        modelId: '',
        weight: 1,
      } satisfies ModelNodeData;
    case 'complexity':
      return {
        kind: 'complexity',
        label: 'COMPLEX',
        tier: 'COMPLEX',
      } satisfies ComplexityNodeData;
    case 'target':
      return {
        kind: 'target',
        label: 'Target',
        providerId: '',
        modelId: '',
        weight: 1,
      } satisfies TargetNodeData;
    case 'fallback':
      return {
        kind: 'fallback',
        label: 'Fallback',
        providerId: '',
        modelId: '',
        order: 0,
      } satisfies FallbackNodeData;
    case 'annotation':
      return { kind: 'annotation', label: 'Note', text: 'Sticky note', variant: 'sticky', color: '#fbbf24' } satisfies AnnotationNodeData;
    case 'group':
      return { kind: 'group', label: 'Group' } satisfies GroupNodeData;
    default:
      return { kind: 'target', label: 'Target', providerId: '', modelId: '', weight: 1 } as TargetNodeData;
  }
}

/** A short human-readable summary used in node footers & context menus. */
export function describeNode(data: WorkflowNodeData): string {
  switch (data.kind) {
    case 'trigger':
      return data.triggerKind === 'complexity' ? 'complexity → targets' : data.celExpression || 'true';
    case 'condition':
      return `${data.field} ${data.op} ${data.value}`;
    case 'logic':
      return data.combinator === '&&' ? 'AND' : 'OR';
    case 'provider':
      return data.providerId || 'unset';
    case 'model':
      return `${data.providerId}/${data.modelId || 'unset'}`;
    case 'complexity':
      return data.tier;
    case 'target':
      return `${data.providerId || '?'}/${data.modelId || '?'} · ${(data.weight * 100).toFixed(0)}%`;
    case 'fallback':
      return `${data.providerId || '?'}/${data.modelId || '?'}`;
    case 'annotation':
      return data.text;
    default:
      return '';
  }
}

export { uid };
