/**
 * Rule diff + apply against the Bifrost management API.
 *
 * Pure logic, no React and no store access: give it the canvas rules and the
 * rules the API reports, get back the exact set of calls to make.
 *
 * Two API constraints shape everything here:
 *   - `targets` in a PUT replaces the whole list, so an update always carries a
 *     complete rule body. There is no per-field delta.
 *   - `scope` / `scope_id` are absent from the update schema, so moving a rule
 *     between scopes is a delete plus a create — with a new id and a window
 *     where the rule does not exist on the gateway.
 */
import type { ApiRule, ApiRuleCreate, ApiRuleUpdate, RoutingRule } from '@/types/bifrost';
import { BifrostApi, apiRuleToRouting, toWriteShape } from '@/lib/bifrostApi';

/** Why a rule was refused. Surfaced verbatim in the sync error chip. */
export interface RuleRejection {
  id: string;
  name: string;
  reason: string;
}

export interface RuleUpdate {
  id: string;
  rule: RoutingRule;
  write: ApiRuleUpdate;
}

export interface RuleDiff {
  create: ApiRuleCreate[];
  update: RuleUpdate[];
  delete: string[];
  rejected: RuleRejection[];
  unchanged: number;
}

/**
 * Bifrost rejects a rule whose weights do not sum to 1. Better to catch it
 * here than to get a 400 halfway through a batch.
 */
export function rejectionReason(rule: RoutingRule): string | null {
  if (!rule.cel_expression.trim()) return 'CEL-Bedingung ist leer';
  if (rule.targets.length === 0) return 'Keine Targets';
  if (rule.targets.some((t) => !(t.weight > 0))) return 'Gewichte müssen größer als 0 sein';
  const sum = rule.targets.reduce((acc, t) => acc + t.weight, 0);
  if (Math.abs(sum - 1) > 1e-6) return `Gewichte summieren zu ${sum.toFixed(3)}, nicht auf 1`;
  if (rule.scope !== 'global' && !rule.scope_id) return `Scope "${rule.scope}" benötigt eine scope_id`;
  return null;
}

/**
 * Fields the API considers part of the rule. Compared via the write shape so a
 * field the canvas does not model can never register as a spurious change.
 */
function writeFingerprint(rule: RoutingRule): string {
  const { query: _query, ...rest } = toWriteShape(rule);
  // `query` carries a freshly generated uuid per call, so it can never compare
  // equal. It is regenerated on every push anyway and needs no diffing.
  return JSON.stringify(rest);
}

/** PUT body: the create shape minus `scope`/`scope_id`, absent from the update schema. */
export function toUpdateShape(rule: RoutingRule): ApiRuleUpdate {
  const { scope: _scope, scope_id: _scopeId, ...rest } = toWriteShape(rule);
  return rest;
}

/**
 * Compare canvas rules against the gateway. Rejected rules are reported, not
 * pushed — a bad weight must not take the rest of the batch down with it.
 */
export function diffRules(local: RoutingRule[], remote: ApiRule[]): RuleDiff {
  const diff: RuleDiff = { create: [], update: [], delete: [], rejected: [], unchanged: 0 };
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localIds = new Set(local.map((r) => r.id));

  for (const rule of local) {
    const reason = rejectionReason(rule);
    if (reason) {
      diff.rejected.push({ id: rule.id, name: rule.name, reason });
      continue;
    }
    const existing = remoteById.get(rule.id);
    if (!existing) {
      diff.create.push(toWriteShape(rule));
      continue;
    }
    const remoteRule = apiRuleToRouting(existing);
    // PUT cannot change scope, so a moved rule needs a fresh id anyway.
    if (remoteRule.scope !== rule.scope || (remoteRule.scope_id ?? '') !== (rule.scope_id ?? '')) {
      diff.delete.push(rule.id);
      diff.create.push(toWriteShape(rule));
      continue;
    }
    if (writeFingerprint(remoteRule) === writeFingerprint(rule)) {
      diff.unchanged += 1;
      continue;
    }
    diff.update.push({ id: rule.id, rule, write: toUpdateShape(rule) });
  }

  for (const r of remote) {
    if (!localIds.has(r.id)) diff.delete.push(r.id);
  }
  return diff;
}

export function diffIsEmpty(diff: RuleDiff): boolean {
  return diff.create.length === 0 && diff.update.length === 0 && diff.delete.length === 0;
}

export interface ApplyResult {
  created: number;
  updated: number;
  deleted: number;
  /** Changes that did not make it, for the error chip and the retry button. */
  failed: number;
  error?: string;
}

/**
 * Run the diff. Order is create -> update -> delete, so a rule that moved
 * scope is written under its new id before the old one is dropped. The gateway
 * mints ids itself, so a create can never collide with a pending delete.
 *
 * Stops at the first failure: a partially applied batch is already ambiguous,
 * and retrying blindly would duplicate the creates.
 */
export async function applyDiff(api: BifrostApi, diff: RuleDiff): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, deleted: 0, failed: 0 };
  const remaining = diff.create.length + diff.update.length + diff.delete.length;

  try {
    for (const create of diff.create) {
      await api.createRule(create);
      result.created += 1;
    }
    for (const update of diff.update) {
      await api.updateRule(update.id, update.write);
      result.updated += 1;
    }
    for (const id of diff.delete) {
      await api.deleteRule(id);
      result.deleted += 1;
    }
  } catch (err) {
    const done = result.created + result.updated + result.deleted;
    result.failed = Math.max(0, remaining - done);
    result.error = (err as Error).message;
    return result;
  }
  return result;
}