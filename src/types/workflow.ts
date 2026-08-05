/** React Flow node/edge data models for the workflow canvas. */

import type { Node, Edge } from 'reactflow';
import type { CELGroup, ComplexityTier, RoutingTarget, TriggerKind } from './bifrost';

export type NodeKind =
  | 'trigger'
  | 'condition'
  | 'logic'
  | 'provider'
  | 'model'
  | 'target'
  | 'fallback'
  | 'complexity'
  | 'annotation'
  | 'group';

export interface TriggerNodeData {
  kind: 'trigger';
  label: string;
  triggerKind: TriggerKind;
  celGroup: CELGroup;
  celExpression: string;
  enabled: boolean;
  /** Linked persisted rule id (if this trigger represents a saved rule). */
  ruleId?: string;
  priority: number;
  scope: string;
  scopeId?: string | null;
  chainRule: boolean;
  description?: string;
}


export interface ConditionNodeData {
  kind: 'condition';
  label: string;
  field: import('./bifrost').CELField;
  op: import('./bifrost').CELComparison;
  value: string;
  headerName?: string;
  negate?: boolean;
}

export interface LogicNodeData {
  kind: 'logic';
  label: string;
  combinator: '&&' | '||';
}

export interface ProviderNodeData {
  kind: 'provider';
  label: string;
  providerId: string;
  supported: boolean;
}

export interface ModelNodeData {
  kind: 'model';
  label: string;
  providerId: string;
  modelId: string;
  weight: number;
}

export interface ComplexityNodeData {
  kind: 'complexity';
  label: string;
  tier: ComplexityTier;
  outputNodeId?: string; // which target this tier routes to
}

export interface TargetNodeData {
  kind: 'target';
  label: string;
  providerId: string;
  modelId: string;
  /** Aggregated target routes for the rule. New canvases prefer this over one target node per model. */
  routes?: RoutingTarget[];
  /** Native Bifrost routing_targets.key_id, preserved when present. */
  apiKeyId?: string;
  weight: number;
}

export interface FallbackNodeData {
  kind: 'fallback';
  label: string;
  providerId: string;
  modelId: string;
  /** Aggregated fallback entries as provider/model strings. */
  fallbacks?: string[];
  /** Order in the fallback chain (0 = first fallback). */
  order: number;
}


export interface AnnotationNodeData {
  kind: 'annotation';
  label: string;
  text: string;
  variant: 'sticky' | 'box' | 'marker' | 'pen';
  color: string;
}

export interface GroupNodeData {
  kind: 'group';
  label: string;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | ConditionNodeData
  | LogicNodeData
  | ProviderNodeData
  | ModelNodeData
  | ComplexityNodeData
  | TargetNodeData
  | FallbackNodeData
  | AnnotationNodeData
  | GroupNodeData;

export type WFNode = Node<WorkflowNodeData>;
export type WFEdge = Edge;

/** Custom edge data for animated/pulsing flow edges. */
export interface FlowEdgeData {
  active?: boolean;
  label?: string;
  port?: string;
}

export const PORT_RULES: Record<string, string[]> = {
  // "source port" -> allowed "target port" handles
  'trigger.out': ['logic.in', 'condition.in', 'target.in'],
  'condition.out': ['logic.in', 'target.in'],
  'logic.out': ['logic.in', 'target.in'],
  'target.fbout': ['fallback.in'],
  // Legacy/deprecated model nodes are still accepted for old workspaces.
  'target.out': ['model.in'],
  'model.fbout': ['fallback.in'],
  'provider.out': ['target.in'],
};
