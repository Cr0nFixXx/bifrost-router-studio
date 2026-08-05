/**
 * Workspace import/export (JSON + XML) and Bifrost config.json projection.
 *
 * The workspace JSON is the full studio project (nodes, edges, providers,
 * meta). The config JSON is the Bifrost-compatible `governance.routing_rules`
 * payload. XML export is provided for enterprise tooling interop.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { RoutingRule } from '@/types/bifrost';
import type { WFNode } from '@/types/workflow';
import type { Edge } from 'reactflow';
import { workflowToRules, rulesToConfig, rulesToWorkflow } from './bifrostMapper';

export interface WorkspaceProject {
  app: 'bifrost-router-studio';
  version: string;
  name: string;
  direction: 'LR' | 'TB';
  nodes: WFNode[];
  edges: Edge[];
  updatedAt: string;
}

export function exportWorkspaceJSON(project: Omit<WorkspaceProject, 'app' | 'version' | 'updatedAt'>): string {
  const payload: WorkspaceProject = {
    ...project,
    app: 'bifrost-router-studio',
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportConfigJSON(nodes: WFNode[], edges: Edge[], providers: Record<string, unknown>): string {
  const rules = workflowToRules(nodes, edges);
  return JSON.stringify(rulesToConfig(rules, providers), null, 2);
}

export function parseWorkspaceJSON(text: string): WorkspaceProject {
  const obj = JSON.parse(text);
  if (obj.app !== 'bifrost-router-studio' || !Array.isArray(obj.nodes)) {
    throw new Error('Not a valid Bifrost Router Studio workspace file.');
  }
  return obj as WorkspaceProject;
}

/** Import a Bifrost config.json (governance.routing_rules) into rule objects. */
export function parseConfigJSON(text: string): { rules: RoutingRule[]; providers: Record<string, unknown> } {
  const obj = JSON.parse(text);
  const rules: RoutingRule[] = obj?.governance?.routing_rules ?? obj?.routing_rules ?? [];
  const providers = obj?.providers ?? {};
  return { rules, providers };
}

/* ------------------------------- XML ------------------------------- */

const builder = new XMLBuilder({ format: true, indentBy: '  ', ignoreAttributes: false, attributeNamePrefix: '@_' });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function exportWorkspaceXML(project: Omit<WorkspaceProject, 'app' | 'version' | 'updatedAt'>): string {
  const rules = workflowToRules(project.nodes, project.edges);
  const xmlObj = {
    BifrostRouterStudio: {
      '@_version': '1.0.0',
      Project: {
        '@_name': project.name,
        '@_direction': project.direction,
        '@_updatedAt': new Date().toISOString(),
      },
      RoutingRules: {
        Rule: rules.map((r) => ({
          '@_id': r.id,
          '@_name': r.name,
          '@_priority': r.priority,
          '@_scope': r.scope,
          '@_enabled': r.enabled,
          '@_chainRule': r.chain_rule,
          CELExpression: r.cel_expression,
          Targets: {
            Target: r.targets.map((t) => ({
              '@_provider': t.provider ?? '',
              '@_model': t.model ?? '',
              '@_weight': t.weight,
            })),
          },
          Fallbacks: { Fallback: r.fallbacks.map((f) => ({ '#text': f })) },
        })),
      },
    },
  };
  return builder.build(xmlObj);
}

/** Parse a workspace previously exported via `exportWorkspaceXML`. */
export function parseWorkspaceXML(text: string): WorkspaceProject {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });
  const obj = parser.parse(text);
  const root = obj?.BifrostRouterStudio;
  if (!root) throw new Error('Not a valid Bifrost Router Studio XML workspace.');

  const proj = root.Project ?? {};
  const ruleNodes = toArray(root.RoutingRules?.Rule);

  const rules: RoutingRule[] = ruleNodes.map((r: any): RoutingRule => {
    const attrs = r?.['@_'] ?? {};
    const targets = toArray(r?.Targets?.Target).map((t: any) => ({
      provider: t?.['@_provider'] || undefined,
      model: t?.['@_model'] || undefined,
      weight: Number(t?.['@_weight'] ?? 1),
    }));
    const fallbacks = toArray(r?.Fallbacks?.Fallback).map((f: any) =>
      typeof f === 'string' ? f : f?.['#text'] ?? '',
    );
    return {
      id: attrs.id ?? `rule_${Math.random().toString(36).slice(2, 8)}`,
      name: attrs.name ?? 'Imported Rule',
      description: attrs.description,
      enabled: attrs.enabled !== 'false',
      chain_rule: attrs.chainRule === 'true',
      cel_expression: typeof r?.CELExpression === 'string' ? r.CELExpression : '',
      targets,
      fallbacks: fallbacks.filter(Boolean),
      scope: (attrs.scope as RoutingRule['scope']) ?? 'global',
      scope_id: attrs.scope_id ?? null,
      priority: Number(attrs.priority ?? 0),
    };
  });

  const { nodes, edges } = rulesToWorkflow(rules);
  return {
    app: 'bifrost-router-studio',
    version: root['@_version'] ?? '1.0.0',
    name: proj['@_name'] ?? 'Imported Workspace',
    direction: proj['@_direction'] === 'TB' ? 'TB' : 'LR',
    nodes,
    edges,
    updatedAt: proj['@_updatedAt'] ?? new Date().toISOString(),
  };
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function downloadFile(filename: string, content: string | Uint8Array, mime = 'application/json') {
  const blob =
    content instanceof Uint8Array
      ? new Blob([new Uint8Array(content)], { type: mime })
      : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
