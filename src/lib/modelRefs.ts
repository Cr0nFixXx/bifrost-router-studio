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

export function stripProviderPrefix(value: string | undefined | null, provider?: string | null): string {
  const v = String(value ?? '').trim();
  const p = String(provider ?? '').trim();
  if (!v || !p) return v;
  return v.toLowerCase().startsWith(`${p.toLowerCase()}/`) ? v.slice(p.length + 1) : v;
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
