/**
 * Provider & Model management. Lists configured providers and the model
 * catalog (built-in vendor list, with room to persist a custom list in the DB),
 * vendor fallback). Lets you add a provider inline and pick default models.
 */
import { useEffect, useState } from 'react';
import { Server, Boxes, Plus, RefreshCw, Check } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, EmptyState, Chip, IconButton } from '@/components/ui/primitives';
import { useUserSettings } from '@/store/useUserSettings';

export function ProviderManager() {
  const providers = useStore((s) => s.providers);
  const catalog = useStore((s) => s.modelCatalog);
  const fetchModels = useStore((s) => s.fetchModels);
  const setModelCatalog = useStore((s) => s.setModelCatalog);
  const modelApiUrl = useUserSettings((s) => s.modelApiUrl);
  const modelApiKey = useUserSettings((s) => s.modelApiKey);
  const setModelApi = useUserSettings((s) => s.setModelApi);
  const [apiUrl, setApiUrl] = useState(modelApiUrl);
  const [apiKey, setApiKey] = useState(modelApiKey);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (catalog.length === 0) fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [adding, setAdding] = useState(false);
  const [newProv, setNewProv] = useState({ id: '', type: 'openai', mode: 'proxy' as const });

  const fetchExternalModels = async () => {
    setFetchingExternal(true);
    setFetchError(null);
    try {
      setModelApi(apiUrl, apiKey);
      const res = await fetch(apiUrl || '/v1/models', {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      const arr = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
      const mapped = arr.map((m: any) => ({
        id: String(m.id ?? m.name ?? m.model ?? 'unknown'),
        label: String(m.id ?? m.name ?? m.model ?? 'unknown'),
        model: String(m.id ?? m.name ?? m.model ?? 'unknown'),
        provider: m.owned_by ?? m.provider ?? 'external',
      }));
      setModelCatalog(mapped);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetchingExternal(false);
    }
  };

  const grouped = catalog.reduce<Record<string, string[]>>((acc, m) => {
    const prov = m.provider ?? 'unknown';
    (acc[prov] ??= []).push(m.model ?? m.label ?? m.id);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Catalog</div>
          <div className="text-sm font-semibold text-ink">Providers & Models</div>
        </div>
        <div className="flex gap-1.5">
          <IconButton label="Refresh models" onClick={() => fetchModels()}>
            <RefreshCw size={15} />
          </IconButton>
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            <Plus size={13} /> Provider
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-faint">External /v1/models fetch</div>
        <input className="input text-xs" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.example.com/v1/models or /v1/models" />
        <input className="input text-xs" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Bearer token (optional)" type="password" />
        <Button size="sm" variant="outline" onClick={() => void fetchExternalModels()} disabled={fetchingExternal}>
          <RefreshCw size={13} /> {fetchingExternal ? 'Fetching…' : 'Fetch models'}
        </Button>
        {fetchError && <div className="text-[10px] text-neon-red">{fetchError}</div>}
      </div>

      {adding && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-xs" placeholder="provider id (e.g. openai)" value={newProv.id} onChange={(e) => setNewProv({ ...newProv, id: e.target.value })} />
            <input className="input text-xs" placeholder="type" value={newProv.type} onChange={(e) => setNewProv({ ...newProv, type: e.target.value })} />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={async () => {
              if (!newProv.id) return;
              await useStore.getState().upsertProvider({ id: newProv.id, type: newProv.type, mode: newProv.mode, supported: true, keys: [] });
              setAdding(false);
            }}
          >
            <Check size={13} /> Add provider
          </Button>
        </div>
      )}

      {/* Providers */}
      <Section title="Configured Providers" icon={<Server size={13} />} count={providers.length}>
        {providers.length === 0 && <p className="text-xs text-ink-faint">No providers configured yet.</p>}
        <div className="space-y-1.5">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-surface-2/50 border border-border px-3 py-2">
              <span className={`h-2 w-2 rounded-full ${p.supported ? 'bg-neon-green' : 'bg-ink-faint'}`} />
              <span className="text-sm text-ink capitalize">{p.id}</span>
              {p.supported ? <Chip tone="green">supported</Chip> : <Chip>tiered</Chip>}
              <span className="ml-auto text-[11px] text-ink-faint">{p.mode}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Models */}
      <Section title="Model Catalog" icon={<Boxes size={13} />} count={catalog.length}>
        {catalog.length === 0 ? (
          <EmptyState icon={<Boxes size={24} />} title="No models listed" description="Add a provider to populate its model catalog." />
        ) : (
          <div className="space-y-2">
            {Object.entries(grouped).map(([prov, models]) => (
              <div key={prov} className="rounded-lg bg-surface-2/40 border border-border overflow-hidden">
                <div className="px-3 py-1.5 bg-surface-2/80 text-[11px] font-semibold text-ink-muted capitalize flex items-center gap-1.5">
                  <Server size={11} /> {prov}
                </div>
                <div className="p-2 flex flex-wrap gap-1.5">
                  {models.map((m) => (
                    <span key={m} className="chip bg-surface-3 text-ink-muted font-mono text-[10px]">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-ink-faint">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-semibold">{title}</span>
        {count !== undefined && <span className="text-ink-faint">· {count}</span>}
      </div>
      {children}
    </div>
  );
}
