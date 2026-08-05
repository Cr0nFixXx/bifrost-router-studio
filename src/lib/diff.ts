/**
 * Diff engine for routing rules.
 *
 * Compares two rule sets (by `id`) and reports added / removed / modified /
 * unchanged rules, with field-level changes for modified rules. Used both for
 * the "diff canvas vs live DB before saving" viewer and for snapshot history.
 */
import type { RoutingRule } from '@/types/bifrost';

export type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

export const COMPARED_FIELDS = [
  'name',
  'enabled',
  'chain_rule',
  'scope',
  'scope_id',
  'priority',
  'cel_expression',
  'targets',
  'fallbacks',
] as const;

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface RuleDiff {
  id: string;
  name: string;
  kind: ChangeKind;
  changes: FieldChange[];
}

function fieldChanges(a: RoutingRule, b: RoutingRule): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of COMPARED_FIELDS) {
    const ak = f as keyof RoutingRule;
    const av = JSON.stringify(a[ak] ?? null);
    const bv = JSON.stringify(b[ak] ?? null);
    if (av !== bv) {
      out.push({ field: f, before: a[ak], after: b[ak] });
    }
  }
  return out;
}

export function diffRules(base: RoutingRule[], next: RoutingRule[]): RuleDiff[] {
  const baseMap = new Map(base.map((r) => [r.id, r]));
  const nextMap = new Map(next.map((r) => [r.id, r]));
  const ids = new Set<string>([...baseMap.keys(), ...nextMap.keys()]);

  const out: RuleDiff[] = [];
  for (const id of ids) {
    const a = baseMap.get(id);
    const b = nextMap.get(id);
    if (a && !b) {
      out.push({ id, name: a.name, kind: 'removed', changes: [] });
    } else if (!a && b) {
      out.push({ id, name: b.name, kind: 'added', changes: [] });
    } else {
      const changes = fieldChanges(a!, b!);
      out.push({ id, name: a!.name, kind: changes.length ? 'modified' : 'unchanged', changes });
    }
  }

  const order: Record<ChangeKind, number> = { added: 0, modified: 1, removed: 2, unchanged: 3 };
  out.sort((x, y) => order[x.kind] - order[y.kind] || x.name.localeCompare(y.name));
  return out;
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  dirty: boolean;
}

export function summarizeDiff(diffs: RuleDiff[]): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, unchanged: 0, dirty: false };
  for (const d of diffs) {
    summary[d.kind] += 1;
    if (d.kind !== 'unchanged') summary.dirty = true;
  }
  return summary;
}
