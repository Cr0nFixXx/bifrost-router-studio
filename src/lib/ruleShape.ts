/**
 * The decisions every path into a `RoutingRule` has to make the same way: how
 * weights are summed and when a sum counts as broken, when `query` is
 * regenerated, and which key a pinned fallback carries in which output format.
 *
 * Mappers stay in their own modules — `apiRuleToRouting` is a transport shape,
 * `nativeRowToRule` a SQL row, `normalizeAiDraft` untrusted input, and
 * `rulesToWorkflow` the inverse projection back into the graph. They call in
 * here for the decisions, so each of those is written down exactly once.
 */
import type { RoutingFallback, RoutingTarget } from '@/types/bifrost';
import type { BifrostQueryGroup } from '@/lib/bifrostQuery';
import { celToBifrostQuery, celToBifrostQueryObject, isUsableBifrostQuery } from '@/lib/bifrostQuery';
import { fallbackFromParts, fallbackToConfigForm, fallbackToParts } from '@/lib/modelRefs';

/**
 * How far a weight sum may drift from 1 before it counts as broken.
 *
 * Two thresholds, because two different questions are being asked:
 *
 * - `WEIGHT_GATE_EPSILON` is what Bifrost itself enforces. Below float noise: a
 *   rejection here becomes a 400 the user cannot act on.
 * - `WEIGHT_WARN_EPSILON` is what a human should be told about. Anything under a
 *   thousandth is invisible on the canvas, and nagging about it is noise.
 */
export const WEIGHT_GATE_EPSILON = 1e-6;
export const WEIGHT_WARN_EPSILON = 1e-3;

/**
 * Sum of the target weights. Missing or non-numeric weights count as 0.
 *
 * Takes a structural shape rather than `RoutingTarget[]` because the inspector
 * sums loose route objects while sync sums real targets, and both answers have
 * to agree.
 */
export function weightSum(targets: ReadonlyArray<{ weight?: number | null }>): number {
  let sum = 0;
  for (const t of targets) {
    const w = Number(t?.weight ?? 0);
    if (Number.isFinite(w)) sum += w;
  }
  return sum;
}

/**
 * Rescale weights so they sum to exactly 1, keeping their ratios. A sum of 0
 * (or no targets) becomes an even split, since there is no ratio to preserve.
 * The last target absorbs the rounding residual so the total is exact.
 *
 * Returns a new array; the input is not touched.
 */
export function normalizeWeights(targets: readonly RoutingTarget[]): RoutingTarget[] {
  if (targets.length === 0) return [];
  const sum = weightSum(targets);
  const out = targets.map((t) => ({ ...t }));

  const raw = sum > 0 ? out.map((t) => Number((Number(t.weight ?? 0) / sum).toFixed(6))) : out.map(() => Number((1 / out.length).toFixed(6)));

  const scaled = raw.reduce((a, w) => a + w, 0);
  if (Math.abs(scaled - 1) > WEIGHT_GATE_EPSILON) {
    const last = raw.length - 1;
    raw[last] = Number((raw[last] + (1 - scaled)).toFixed(6));
  }

  raw.forEach((weight, i) => { out[i].weight = weight; });
  return out;
}

/* ---------------------------------- query ---------------------------------- */

/**
 * The dashboard query-builder object for a CEL expression, as the management API
 * takes it.
 *
 * Always regenerated, never read back: `query` is derived state, and a PUT
 * replaces it wholesale. The ids inside are minted per call, which is why a
 * diff must exclude this field rather than compare it.
 */
export function queryForWrite(cel: string): BifrostQueryGroup | null {
  return celToBifrostQueryObject(cel);
}

/**
 * The `query` column value for a persisted row. The stored query survives when
 * the CEL did not change and the stored value is still usable; otherwise it is
 * regenerated from `cel`. `previousCel` is the CEL the row was built from, or
 * null when there is no previous row.
 *
 * This policy is deliberately the opposite of `queryForWrite`: the DB knows what
 * the row looked like, the API write path does not.
 */
export function queryForRow(cel: string, previousCel: string | null, storedQuery: unknown): string | null {
  if (previousCel !== null && previousCel === cel && isUsableBifrostQuery(storedQuery)) {
    return typeof storedQuery === 'string' ? storedQuery : JSON.stringify(storedQuery);
  }
  return celToBifrostQuery(cel);
}

/* --------------------------------- fallbacks -------------------------------- */

/**
 * Fallbacks as the management API accepts them: object entries keep `key_id`
 * and lose the config.json-only `provider_key_name`, which the write schema
 * rejects. Entries without a provider are dropped — Bifrost refuses them.
 */
export function fallbacksForApi(fallbacks: readonly RoutingFallback[]): RoutingFallback[] {
  const out: RoutingFallback[] = [];
  for (const fb of fallbacks) {
    if (!fb) continue;
    if (typeof fb === 'string') {
      if (fb.trim()) out.push(fb);
      continue;
    }
    const { provider, model } = fallbackToParts(fb);
    if (!provider) continue;
    // Deliberately not `fallbackToParts(...).key_id`: that also resolves
    // `provider_key_name`, and a config.json *name* sent as a `key_id` pins
    // nothing. Only a real id survives into a request. The entry stays an
    // object when it came in as one — a pinned fallback needs the shape.
    const key_id = String(fb.key_id ?? '').trim();
    out.push({ provider, ...(model ? { model } : {}), ...(key_id ? { key_id } : {}) });
  }
  return out;
}

/**
 * Fallbacks in config.json form. config.json pins a key by name where the DB
 * pins it by id, so a `keyName` that does not resolve must leave the `key_id` in
 * place — otherwise the pin is silently lost on export.
 */
export function fallbacksForConfig(
  fallbacks: readonly RoutingFallback[],
  keyName: (keyId: string) => string | undefined,
): RoutingFallback[] {
  return fallbacks
    .filter((fb) => !!fb && (typeof fb === 'object' || String(fb).trim() !== ''))
    .map((fb) => (typeof fb === 'object' ? fallbackToConfigForm(fb, keyName(fallbackToParts(fb).key_id ?? '')) : String(fb).trim()));
}

/**
 * The inverse: config.json form back into stored form. A `key_id` that is
 * already there wins; otherwise `provider_key_name` is resolved through
 * `keyId`, and a name that resolves to nothing keeps the entry unpinned rather
 * than dropping the fallback.
 */
export function fallbacksFromConfig(
  fallbacks: readonly RoutingFallback[],
  keyId: (name: string) => string | undefined,
): RoutingFallback[] {
  const out: RoutingFallback[] = [];
  for (const fb of fallbacks) {
    if (!fb || typeof fb !== 'object') {
      const text = String(fb ?? '').trim();
      if (text) out.push(text);
      continue;
    }
    const { provider, model } = fallbackToParts(fb);
    if (!provider) continue;
    const kept = String(fb.key_id ?? '').trim();
    const name = String(fb.provider_key_name ?? '').trim();
    out.push(fallbackFromParts(provider, model, kept || (name ? keyId(name) : undefined)));
  }
  return out;
}
