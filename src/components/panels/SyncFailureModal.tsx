/**
 * Sync failure list — what the gateway refused, per rule.
 *
 * The status line can only say "3 nicht übertragen"; this names them. Every
 * entry is one change that did not make it, with the gateway's own wording,
 * because the gateway knows more about the rule than the studio does.
 */
import { useStore } from '@/store/useStore';
import { Modal, Button, Chip } from '@/components/ui/primitives';
import { AlertTriangle, Plus, Pencil, Trash2, Repeat } from 'lucide-react';
import type { SyncStatus } from '@/store/useStore';

const OP_META: Record<SyncStatus['failures'][number]['op'], { label: string; icon: React.ReactNode }> = {
  create: { label: 'Neu anlegen', icon: <Plus size={12} /> },
  update: { label: 'Ändern', icon: <Pencil size={12} /> },
  delete: { label: 'Löschen', icon: <Trash2 size={12} /> },
  move: { label: 'Scope wechseln', icon: <Repeat size={12} /> },
};

export function SyncFailureModal() {
  const syncNow = useStore((s) => s.syncNow);
  const close = useStore((s) => s.closeSyncFailures);
  const open = useStore((s) => s.syncFailuresOpen);
  const { failures, rejected, state } = useStore((s) => s.syncStatus);
  const busy = state === 'syncing';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nicht übertragen"
      subtitle="Was das Gateway abgelehnt hat. Die übrigen Regeln sind trotzdem angekommen."
      width="max-w-2xl"
      zIndexClass="z-[90]"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={close}>
            Schließen
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => { void syncNow(); close(); }}>
            Erneut versuchen
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {failures.length === 0 && rejected.length === 0 && (
          <div className="text-center py-8 text-sm text-ink-faint">Keine offenen Fehler.</div>
        )}

        {failures.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Chip tone="red">{failures.length} vom Gateway abgelehnt</Chip>
            </div>
            <ul className="list-disc pl-4 space-y-1.5 text-sm text-ink-muted">
              {failures.map((f, i) => {
                const meta = OP_META[f.op];
                return (
                  <li key={`${f.op}-${f.name}-${i}`}>
                    <span className="text-ink font-medium">{f.name}</span>
                    <span className="text-ink-faint"> — {meta.label}: </span>
                    <span>{f.message}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {rejected.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Chip tone="amber">{rejected.length} vor dem Push abgefangen</Chip>
            </div>
            <ul className="list-disc pl-4 space-y-1.5 text-sm text-ink-muted">
              {rejected.map((r) => (
                <li key={r.id}>
                  <span className="text-ink font-medium">{r.name}</span>
                  <span className="text-ink-faint"> — {r.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] text-ink-faint border-t border-border pt-3">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            Eine Regel mit ungültigem Provider-Fallback lehnt das Gateway ab. Das lässt sich nicht
            umgehen — der Fehlertext oben ist die vollständige Begründung.
          </span>
        </p>
      </div>
    </Modal>
  );
}
