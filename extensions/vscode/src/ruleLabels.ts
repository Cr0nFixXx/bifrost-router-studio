/**
 * Rule -> tree label projection. Pure string helpers, deliberately free of any
 * `vscode` import so the Vitest run (which cannot resolve the `vscode` module)
 * can exercise them directly. `rulesTree.ts` wraps these into TreeItems.
 */
import type { RoutingRule, RoutingTarget, RoutingFallback } from '@/types/bifrost';
import { fallbackToParts } from '@/lib/modelRefs';

/** A disabled rule stays visible and says so — hiding it invites "where did it go?". */
export function ruleLabel(rule: RoutingRule): string {
  return rule.enabled ? rule.name : `${rule.name} (aus)`;
}

/** Priority and scope are what the gateway orders and partitions by. */
export function ruleDescription(rule: RoutingRule): string {
  const scope = rule.scope_id ? `${rule.scope}:${rule.scope_id}` : rule.scope;
  return `#${rule.priority} · ${scope}`;
}

/** A target pins its key as `api_key`; a fallback uses `key_id`. Not a typo. */
export function targetLabel(target: RoutingTarget): string {
  const ref = [target.provider, target.model].filter(Boolean).join('/');
  const pinned = target.api_key ? ` · key ${target.api_key}` : '';
  return `${ref || '(leer)'} · ${target.weight}${pinned}`;
}

/**
 * `fallbackToRef` drops a pinned key, so a pinned and an unpinned fallback would
 * read identically in the tree. Build the label from the parts instead.
 */
export function fallbackLabel(fallback: RoutingFallback): string {
  const { provider, model, key_id } = fallbackToParts(fallback);
  if (!provider) return '(leer)';
  const pinned = key_id ? ` · key ${key_id}` : '';
  return `${provider}/${model ?? ''}${pinned}`;
}

export function ruleTooltip(rule: RoutingRule): string {
  const lines = [
    ruleLabel(rule),
    ruleDescription(rule),
    '',
    `CEL: ${rule.cel_expression}`,
  ];
  if (rule.description) lines.splice(2, 0, rule.description);
  if (rule.chain_rule) lines.push('chain rule');
  if (rule.targets.length) {
    lines.push('', `Targets (${rule.targets.length}):`);
    for (const t of rule.targets) lines.push(`  ${targetLabel(t)}`);
  }
  if (rule.fallbacks.length) {
    lines.push('', `Fallbacks (${rule.fallbacks.length}):`);
    for (const f of rule.fallbacks) lines.push(`  ${fallbackLabel(f)}`);
  }
  return lines.join('\n');
}
