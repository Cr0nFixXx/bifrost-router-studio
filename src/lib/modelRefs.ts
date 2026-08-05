export interface ModelRefLike {
  id?: string;
  provider?: string;
  label?: string;
  model?: string;
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
