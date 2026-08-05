/**
 * Template gallery — a local "marketplace" for reusable rule chains.
 *
 * Two tabs: built-in templates (shipped in `templates.ts`, applied via
 * `applyTemplate`) and user templates persisted in localStorage (save the
 * current canvas as a template, apply / delete, and import / export packs as
 * JSON so templates can be shared).
 */
import { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Plus, Trash2, Upload, Download, Check } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Modal, Button, IconButton, Segmented, EmptyState } from '@/components/ui/primitives';
import { TEMPLATES } from '@/lib/templates';
import {
  listCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  parseCustomPack,
  exportCustomPack,
  type CustomTemplate,
} from '@/lib/customTemplates';

type Tab = 'builtin' | 'custom';

function Card({
  name,
  description,
  accent,
  onApply,
  onDelete,
}: {
  name: string;
  description: string;
  accent: string;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 overflow-hidden flex flex-col">
      <div className="h-1.5 w-full" style={{ background: accent }} />
      <div className="p-3 flex-1 flex flex-col">
        <div className="text-sm font-semibold text-ink">{name}</div>
        <p className="text-[11px] text-ink-faint mt-1 flex-1 leading-relaxed">{description}</p>
        <div className="flex items-center gap-2 mt-3">
          <Button variant="primary" size="sm" onClick={onApply} className="flex-1">
            <Check size={14} /> Apply
          </Button>
          {onDelete && (
            <IconButton label="Delete template" onClick={onDelete}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function TemplateGallery() {
  const open = useStore((s) => s.templatesOpen);
  const setOpen = useStore((s) => s.setTemplatesOpen);
  const applyTemplate = useStore((s) => s.applyTemplate);
  const setGraph = useStore((s) => s.setGraph);

  const [tab, setTab] = useState<Tab>('builtin');
  const [custom, setCustom] = useState<CustomTemplate[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setCustom(listCustomTemplates());
  }, [open]);

  const saveCurrent = () => {
    const name = window.prompt('Template name', 'My template');
    if (!name) return;
    const description = window.prompt('Short description', '') ?? '';
    const st = useStore.getState();
    const tpl: CustomTemplate = {
      id: 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      name,
      description,
      accent: '#5eead4',
      nodes: st.nodes,
      edges: st.edges,
      createdAt: new Date().toISOString(),
    };
    setCustom(saveCustomTemplate(tpl));
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseCustomPack(await file.text());
      let all = listCustomTemplates();
      for (const t of imported) all = saveCustomTemplate(t);
      setCustom(all);
    } catch (err) {
      alert('Import failed: ' + (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Template gallery"
      subtitle="Reusable rule chains — built-in or your own saved packs."
      width="max-w-3xl"
    >
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: 'builtin', label: 'Built-in' },
            { value: 'custom', label: `Custom (${custom.length})` },
          ]}
        />
        {tab === 'custom' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveCurrent}>
              <Plus size={14} /> Save current
            </Button>
            <Button variant="subtle" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Import
            </Button>
            <Button variant="subtle" size="sm" onClick={() => exportCustomPack(custom)} disabled={custom.length === 0}>
              <Download size={14} /> Export
            </Button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={onImport} />
          </div>
        )}
      </div>

      {tab === 'builtin' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <Card
              key={t.id}
              name={t.name}
              description={t.description}
              accent={t.accent}
              onApply={() => {
                applyTemplate(t.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : custom.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={28} />}
          title="No custom templates yet"
          description="Save the current canvas as a template, or import a shared template pack (.json)."
          action={
            <Button variant="primary" size="sm" onClick={saveCurrent}>
              <Plus size={14} /> Save current canvas
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {custom.map((t) => (
            <Card
              key={t.id}
              name={t.name}
              description={t.description}
              accent={t.accent}
              onApply={() => {
                setGraph(t.nodes, t.edges);
                setOpen(false);
              }}
              onDelete={() => setCustom(deleteCustomTemplate(t.id))}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
