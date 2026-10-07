import type { RoutingFallback } from '@/types/bifrost';

export interface ModelRefLike {
  id?: string;
  provider?: string;
  label?: string;
  model?: string;
}

export interface FallbackParts {
  provider: string;
  model?: string;
  key_id?: string;
}

/** A catalog entry with the fields every consumer reads, made non-optional. */
export type CatalogEntry = ModelRefLike & { id: string; label: string; model: string };

export function stripProviderPrefix(value: string | undefined | null, provider?: string | null): string {
  const v = String(value ?? '').trim();
  const p = String(provider ?? '').trim();
  if (!v || !p) return v;
  return v.toLowerCase().startsWith(`${p.toLowerCase()}/`) ? v.slice(p.length + 1) : v;
}

/**
 * Split a model id at its FIRST slash. In Bifrost the leading segment is always
 * the provider config name and everything after it is the model — including
 * vendor prefixes, so `EdenAI/cloudflare/@cf/meta-llama/llama-2-7b` yields
 * provider `EdenAI`. An id without a slash is a bare model with no provider.
 */
export function splitModelId(value: string | undefined | null): { provider: string; model: string } {
  const v = String(value ?? '').trim();
  const cut = v.indexOf('/');
  return cut < 0 ? { provider: '', model: v } : { provider: v.slice(0, cut), model: v.slice(cut + 1) };
}

/**
 * Map a gateway model listing into catalog entries. `owned_by` is deliberately
 * ignored: Bifrost carries it as model-vendor metadata next to `architecture`
 * and `pricing`, so `nvidianim/meta/llama2-70b` reports `meta` and using it as
 * the provider relocates the model away from the gateway config it lives under.
 */
export function mapGatewayModels(rows: GatewayModelLike[]): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const row of rows) {
    const raw = String(row?.model ?? row?.name ?? row?.id ?? '').trim();
    if (!raw) continue;
    // An explicit `provider` field wins and means the name is already bare
    // (`{name: "meta/llama2-70b", provider: "nvidianim"}` — stripping the first
    // segment here would eat the vendor prefix). Without it the id carries the
    // provider in first position.
    const declared = String(row?.provider ?? '').trim();
    const { provider: fromId, model } = declared ? { provider: declared, model: raw } : splitModelId(raw);
    const provider = declared || fromId;
    out.push({ id: provider ? `${provider}/${model}` : model, provider: provider || undefined, model, label: model });
  }
  return out;
}

/** Minimal shape of a gateway model row. `owned_by` is absent on purpose. */
export interface GatewayModelLike {
  name?: string | null;
  model?: string | null;
  id?: string | null;
  provider?: string | null;
}

/**
 * Every provider id the UI should offer: configured providers (by id and by
 * type), plus whatever the model catalog knows, plus the node's current value.
 * The catalog belongs in here — in API mode `providers` is empty until the
 * gateway answers, and without it the provider dropdown has nothing to show.
 */
export function providerOptions(
  providers: Array<{ id?: string; type?: string }> = [],
  catalog: Array<{ provider?: string }> = [],
  current?: string | null,
): string[] {
  return Array.from(
    new Set(
      [
        ...providers.map((p) => p.id),
        ...providers.map((p) => p.type),
        ...catalog.map((m) => m.provider),
        current,
      ].filter((v): v is string => !!v),
    ),
  );
}

export function inferProviderFromModelValue(value: string, providers: string[]): string | null {
  const v = String(value ?? '').trim();
  const first = v.split('/')[0];
  if (!first) return null;
  return providers.find((p) => p.toLowerCase() === first.toLowerCase()) ?? null;
}

export function providerMatchesModel(entry: ModelRefLike, provider?: string | null): boolean {
  const p = String(provider ?? '').trim();
  if (!p) return true;
  if (entry.provider && entry.provider.toLowerCase() === p.toLowerCase()) return true;
  if (entry.id && entry.id.toLowerCase().startsWith(`${p.toLowerCase()}/`)) return true;
  return false;
}

export function modelValueForSelection(entry: ModelRefLike, provider?: string | null): string {
  const raw = String(entry.model ?? entry.label ?? entry.id ?? '').trim();
  return stripProviderPrefix(raw, provider);
}

export function modelCandidates(catalog: ModelRefLike[], provider?: string | null, requireProvider = false): string[] {
  const p = String(provider ?? '').trim();
  if (requireProvider && !p) return [];
  const filtered = catalog.filter((m) => providerMatchesModel(m, p));
  const source = filtered.length || p ? filtered : catalog;
  return Array.from(new Set(source.map((m) => modelValueForSelection(m, p)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/* --------------------------- fallbacks (Bifrost >= 2.2.3) --------------------------- */

/** Split a fallback entry into its parts. Strings are `"provider/model"`, `"provider/"` keeps the incoming model. */
export function fallbackToParts(fb: RoutingFallback): FallbackParts {
  if (fb && typeof fb === 'object') {
    return { provider: fb.provider ?? '', model: fb.model || undefined, key_id: fb.key_id || fb.provider_key_name || undefined };
  }
  const [provider, ...modelParts] = String(fb ?? '').split('/');
  return { provider: provider ?? '', model: modelParts.join('/') || undefined };
}

/** Legacy string form of a fallback entry (used for display and exports that cannot carry a pin). */
export function fallbackToRef(fb: RoutingFallback): string {
  const { provider, model } = fallbackToParts(fb);
  if (!provider) return '';
  return `${provider}/${model ?? ''}`;
}

/** Object form only when a key is pinned — otherwise stay on the compact string form. */
export function fallbackFromParts(provider: string | null | undefined, model?: string | null, key_id?: string | null): RoutingFallback {
  const p = String(provider ?? '').trim();
  const m = String(model ?? '').trim();
  const k = String(key_id ?? '').trim();
  if (k) return { provider: p, ...(m ? { model: m } : {}), key_id: k };
  return p ? `${p}/${m}` : '';
}

/**
 * config.json form of a fallback: Bifrost pins keys by `provider_key_name`, the DB by
 * `key_id`. Without a resolvable name the entry keeps `key_id` so no pin is lost.
 */
export function fallbackToConfigForm(fb: RoutingFallback, keyName?: string): RoutingFallback {
  const { provider, model, key_id } = fallbackToParts(fb);
  if (!provider) return '';
  if (keyName) return { provider, ...(model ? { model } : {}), provider_key_name: keyName };
  if (key_id) return { provider, ...(model ? { model } : {}), key_id };
  return fallbackToRef(fb);
}
