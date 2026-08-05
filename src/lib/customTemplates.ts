/**
 * User template packs — a local "marketplace" for reusable rule chains.
 *
 * Built-in templates live in `templates.ts`; this module persists user-authored
 * templates (and importable/exportable packs) in localStorage so they survive
 * reloads without a server. Stored templates are plain, serializable canvas
 * graphs (nodes + edges), exactly what `setGraph` consumes.
 */
import type { Edge } from 'reactflow';
import type { WFNode } from '@/types/workflow';
import { downloadFile } from '@/lib/io';

const KEY = 'bfrs-custom-templates';

export interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  nodes: WFNode[];
  edges: Edge[];
  createdAt: string;
}

export function listCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CustomTemplate[]) : [];
  } catch {
    return [];
  }
}

function persist(templates: CustomTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(templates));
  } catch {
    /* ignore quota errors */
  }
}

export function saveCustomTemplate(tpl: CustomTemplate): CustomTemplate[] {
  const all = listCustomTemplates().filter((t) => t.id !== tpl.id);
  const next = [tpl, ...all];
  persist(next);
  return next;
}

export function deleteCustomTemplate(id: string): CustomTemplate[] {
  const next = listCustomTemplates().filter((t) => t.id !== id);
  persist(next);
  return next;
}

/** Parse an exported pack (JSON array or single object) into templates. */
export function parseCustomPack(text: string): CustomTemplate[] {
  const obj = JSON.parse(text);
  const arr = Array.isArray(obj) ? obj : (Array.isArray(obj?.templates) ? obj.templates : null);
  if (!arr) throw new Error('Not a valid template pack.');
  return arr.map((t: any) => ({
    id: t.id ?? 'tpl_' + Math.random().toString(36).slice(2, 9),
    name: String(t.name ?? 'Untitled template'),
    description: String(t.description ?? ''),
    accent: String(t.accent ?? '#5eead4'),
    nodes: Array.isArray(t.nodes) ? t.nodes : [],
    edges: Array.isArray(t.edges) ? t.edges : [],
    createdAt: t.createdAt ?? new Date().toISOString(),
  }));
}

export function exportCustomPack(templates: CustomTemplate[]): void {
  downloadFile('bifrost-templates.json', JSON.stringify(templates, null, 2), 'application/json');
}
