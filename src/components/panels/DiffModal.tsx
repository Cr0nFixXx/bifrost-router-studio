/**
 * Diff viewer modal — renders the result of `diffRules` as a human-readable
 * list of added / removed / modified / unchanged rules with field-level detail.
 * Reused for both the "canvas vs live database" viewer and snapshot history.
 */
import { useStore } from '@/store/useStore';
import { Modal, Chip, Button } from '@/components/ui/primitives';
import { Check, Plus, Minus, Pencil, RotateCcw, AlertTriangle } from 'lucide-react';
import { summarizeDiff, type ChangeKind, type RuleDiff } from '@/lib/diff';

const KIND_META: Record<ChangeKind, { label: string; tone: 'green' | 'red' | 'amber' | 'neutral'; icon: React.ReactNode }> = {
  added: { label: 'Added', tone: 'green', icon: <Plus size={12} /> },
  removed: { label: 'Removed', tone: 'red', icon: <Minus size={12} /> },
  modified: { label: 'Modified', tone: 'amber', icon: <Pencil size={12} /> },
  unchanged: { label: 'Unchanged', tone: 'neutral', icon: <Check size={12} /> },
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  enabled: 'Enabled',
  chain_rule: 'Chain rule',
  scope: 'Scope',
  scope_id: 'Scope ID',
  priority: 'Priority',
  cel_expression: 'CEL expression',
  targets: 'Targets',
  fallbacks: 'Fallbacks',
};

function renderValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return '∅';
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

function CodeLine({ sign, text, tone }: { sign: '+' | '-' | ' '; text: string; tone?: 'add' | 'del' }) {
  return (
    <div className={`grid grid-cols-[34px_1fr] font-mono text-[11px] leading-relaxed ${tone === 'add' ? 'bg-neon-green/10' : tone === 'del' ? 'bg-neon-red/10' : ''}`}>
      <span className={`select-none px-2 text-right border-r border-border ${tone === 'add' ? 'text-neon-green' : tone === 'del' ? 'text-neon-red' : 'text-ink-faint'}`}>{sign}</span>
      <pre className="px-3 py-0.5 whitespace-pre-wrap break-words text-ink-muted">{text}</pre>
    </div>
  );
}

function DiffRow({ d }: { d: RuleDiff }) {
  const meta = KIND_META[d.kind];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-canvas">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <Chip tone={meta.tone}><span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span></Chip>
        <span className="text-sm text-ink truncate">{d.name}</span>
        <span className="ml-auto text-[10px] font-mono text-ink-faint">{d.id}</span>
      </div>

      {d.kind === 'modified' && d.changes.map((c) => (
        <div key={c.field} className="border-b border-border/70 last:border-b-0">
          <div className="bg-surface/80 px-3 py-1 text-[11px] font-semibold text-ink-faint">@@ {FIELD_LABELS[c.field] ?? c.field} @@</div>
          <CodeLine sign="-" tone="del" text={renderValue(c.before)} />
          <CodeLine sign="+" tone="add" text={renderValue(c.after)} />
        </div>
      ))}
      {d.kind === 'added' && <CodeLine sign="+" tone="add" text={`rule ${d.name} added`} />}
      {d.kind === 'removed' && <CodeLine sign="-" tone="del" text={`rule ${d.name} removed`} />}
    </div>
  );
}

export function DiffModal() {
  const view = useStore((s) => s.diffView);
  const close = useStore((s) => s.closeDiff);
  const open = !!view;
  const summary = view ? summarizeDiff(view.diffs) : null;
  const visible = view ? view.diffs.filter((d) => d.kind !== 'unchanged') : [];

  return (
    <Modal
      open={open}
      onClose={close}
      title={view?.title ?? ''}
      subtitle={view?.subtitle}
      width="max-w-3xl"
      zIndexClass="z-[90]"
      footer={
        view?.onRestore ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                view.onRestore?.();
              }}
            >
              <RotateCcw size={14} /> {view.restoreLabel ?? 'Apply'}
            </Button>
          </div>
        ) : undefined
      }
    >
      {view && summary && (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap" role="status" aria-live="polite">
            <Chip tone="green">{summary.added} added</Chip>
            <Chip tone="amber">{summary.modified} modified</Chip>
            <Chip tone="red">{summary.removed} removed</Chip>
            <Chip tone="neutral">{summary.unchanged} unchanged</Chip>
          </div>

          {/* Hints, never blockers: the gateway owns the provider whitelist, and
              a catalog kept in the client only runs behind it. */}
          {view.hints && view.hints.length > 0 && (
            <div className="mb-4 rounded-lg border border-neon-amber/30 bg-neon-amber/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neon-amber">
                <AlertTriangle size={13} />
                {view.hints.length} {view.hints.length === 1 ? 'Hinweis' : 'Hinweise'} — Übertragen ist trotzdem möglich
              </div>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px] text-ink-muted">
                {view.hints.map((h) => (
                  <li key={h.id}><span className="text-ink">{h.name}</span>: {h.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="text-center py-10 text-sm text-ink-faint">
              No differences — the two rule sets match exactly.
            </div>
          ) : (
            <div className="space-y-2">{visible.map((d) => <DiffRow key={d.id} d={d} />)}</div>
          )}
        </div>
      )}
    </Modal>
  );
}
