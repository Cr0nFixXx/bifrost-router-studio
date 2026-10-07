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
  /** Scope changes, as indivisible create+delete pairs. See `ScopeMove`. */
  moves: ScopeMove[];
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
 * Non-blocking hints about providers the model catalog does not list.
 *
 * Deliberately not a validation and deliberately not a blocker. The gateway owns
 * the provider whitelist — a fallback like "Test/prefix/model" is rejected there
 * with a 400 — and a list kept in the client runs behind whatever the gateway
 * does next. Duplicate that logic here and you get rules blocked that would have
 * worked.
 *
 * In API mode the catalog comes from `builtInCatalog()`, a static list in this
 * repo rather than the gateway's own. So "not in the catalog" is a hint, not a
 * finding — which is exactly why it must not stop the push.
 *
 * Targets are included even though only fallbacks are known to be prefix-checked
 * today: if a gateway turns out to be stricter, the hint is already there.
 */
export function providerWarnings(
  rules: RoutingRule[],
  catalog: Array<{ provider?: string }>,
): RuleRejection[] {
  const known = new Set(catalog.map((m) => m.provider).filter((p): p is string => !!p));
  if (known.size === 0) return [];

  const out: RuleRejection[] = [];
  for (const rule of rules) {
    const unknown = new Set<string>();
    for (const t of rule.targets) if (t.provider && !known.has(t.provider)) unknown.add(t.provider);
    for (const f of rule.fallbacks) {
      const provider = typeof f === 'string' ? f.split('/')[0] : f.provider;
      if (provider && !known.has(provider)) unknown.add(provider);
    }
    if (unknown.size > 0) {
      out.push({
        id: rule.id,
        name: rule.name,
        reason: `${[...unknown].join(', ')} steht nicht im Modell-Katalog — das Gateway lehnt diese Regel vermutlich ab`,
      });
    }
  }
  return out;
}
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
  const diff: RuleDiff = { create: [], update: [], delete: [], moves: [], rejected: [], unchanged: 0 };
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
    // PUT cannot change scope, so a moved rule needs a fresh id anyway — and
    // the pair stays together, so a rejected create cannot take the old rule
    // down with it.
    if (remoteRule.scope !== rule.scope || (remoteRule.scope_id ?? '') !== (rule.scope_id ?? '')) {
      diff.moves.push({ name: rule.name, deleteId: rule.id, create: toWriteShape(rule) });
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
  return (
    diff.create.length === 0 &&
    diff.update.length === 0 &&
    diff.delete.length === 0 &&
    diff.moves.length === 0
  );
}

/**
 * A scope change: the rule is created under a new id and the old one is dropped.
 *
 * Create and delete belong together. Run them apart and a failed create leaves
 * the rule deleted on the gateway with nothing in its place — the canvas still
 * has it, the gateway does not. So the pair travels as one unit.
 */
export interface ScopeMove {
  name: string;
  /** The old rule that leaves the gateway. */
  deleteId: string;
  /** Write shape without `id`; the gateway mints the new one. */
  create: ApiRuleCreate;
}

export interface ApplyFailure {
  op: 'create' | 'update' | 'delete' | 'move';
  /** Rule name, or the id for a rule the canvas no longer has. */
  name: string;
  /** The gateway's own wording — it knows more about the rule than we do. */
  message: string;
}

export interface ApplyResult {
  created: number;
  updated: number;
  deleted: number;
  /** Changes that did not make it, for the error chip and the retry button. */
  failed: number;
  /** One entry per change that did not make it. Without this, "3 failed" is a
   *  number the user cannot act on. */
  failures: ApplyFailure[];
}

/**
 * Which priority changes have to dodge first.
 *
 * The gateway holds UNIQUE (scope, priority), so swapping 0 and 1 cannot be
 * written sequentially: the first rule takes the priority the second still
 * holds. A rule moving onto a *free* priority needs no ceremony — it is just a
 * PUT. Only the ones whose target is currently occupied have to step aside
 * first, onto priorities above everything the gateway reports, so the real
 * values become free.
 *
 * `remote` must be the state just read from the gateway — it is the only
 * reliable answer to "which priorities are taken".
 */
export function planPriorityPhases(
  updates: RuleUpdate[],
  remote: ApiRule[],
): { dodge: Array<{ id: string; priority: number }>; after: Array<{ id: string; priority: number }> } {
  const heldBy = new Map(remote.map((r) => [r.priority, r.id]));
  const moving: Array<{ id: string; priority: number }> = [];
  for (const u of updates) {
    const target = u.write.priority;
    if (target == null) continue;
    const holder = heldBy.get(target);
    if (holder !== undefined && holder !== u.id) moving.push({ id: u.id, priority: target });
  }
  const highest = remote.reduce((max, r) => Math.max(max, Number(r.priority ?? -1)), -1);
  return {
    dodge: moving.map((m, i) => ({ id: m.id, priority: highest + 1 + i })),
    after: moving,
  };
}

/**
 * Run the diff against the gateway.
 *
 * Every change is isolated: one rule the gateway refuses must not hold back the
 * rest of the batch, or a single bad fallback strands every other edit. Failures
 * are collected per change so the UI can name them.
 *
 * Order is create -> move -> update -> delete. A scope move creates before it
 * deletes, and skips the delete when the create failed — that is the whole point
 * of keeping the pair together.
 */
export async function applyDiff(api: BifrostApi, diff: RuleDiff, remote: ApiRule[]): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, deleted: 0, failed: 0, failures: [] };

  const fail = (op: ApplyFailure['op'], name: string, err: unknown) => {
    result.failed += 1;
    result.failures.push({ op, name, message: (err as Error)?.message ?? String(err) });
  };

  for (const create of diff.create) {
    try {
      await api.createRule(create);
      result.created += 1;
    } catch (err) {
      fail('create', create.name, err);
    }
  }

  for (const move of diff.moves) {
    try {
      await api.createRule(move.create);
      result.created += 1;
    } catch (err) {
      // The old rule stays. Deleting it now would remove it without replacement.
      fail('move', move.name, err);
      continue;
    }
    try {
      await api.deleteRule(move.deleteId);
      result.deleted += 1;
    } catch (err) {
      // The new rule exists under the new scope; only the old one lingers. The
      // next sync sees a stale rule the canvas no longer has and removes it.
      fail('delete', move.name, err);
    }
  }

  // Rules whose target priority is occupied step aside first — see
  // planPriorityPhases. A rule that could not step aside is left untouched and
  // reported: writing its real priority now would collide a second time.
  const { dodge } = planPriorityPhases(diff.update, remote);
  const blocked = new Set<string>();
  for (const step of dodge) {
    const update = diff.update.find((u) => u.id === step.id);
    try {
      await api.updateRule(step.id, { priority: step.priority });
    } catch (err) {
      blocked.add(step.id);
      fail('update', update?.rule.name ?? step.id, err);
    }
  }

  for (const update of diff.update) {
    if (blocked.has(update.id)) continue;
    try {
      await api.updateRule(update.id, update.write);
      result.updated += 1;
    } catch (err) {
      fail('update', update.rule.name, err);
    }
  }

  for (const id of diff.delete) {
    try {
      await api.deleteRule(id);
      result.deleted += 1;
    } catch (err) {
      fail('delete', id, err);
    }
  }

  return result;
}