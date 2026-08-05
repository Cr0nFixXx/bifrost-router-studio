/**
 * History panel — client-side "version control" for routing rules.
 *
 * Lists saved rule-set snapshots (persisted in IndexedDB per database file),
 * lets the user save a new snapshot, preview the diff between the current
 * canvas and any snapshot, roll back to a snapshot, or delete one.
 */
import { useEffect, useState } from 'react';
import { Camera, Trash2, RotateCcw, GitCompare, History, Clock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, IconButton, Chip, EmptyState } from '@/components/ui/primitives';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return secs + 's ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

export function HistoryPanel() {
  const snapshots = useStore((s) => s.snapshots);
  const loadSnapshots = useStore((s) => s.loadSnapshots);
  const saveSnapshot = useStore((s) => s.saveSnapshot);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);
  const previewSnapshotDiff = useStore((s) => s.previewSnapshotDiff);
  const showDiff = useStore((s) => s.showDiff);
  const closeDiff = useStore((s) => s.closeDiff);

  const [label, setLabel] = useState('');

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const onSave = async () => {
    await saveSnapshot(label);
    setLabel('');
  };

  const onPreview = async (id: string, snapLabel: string) => {
    const diffs = await previewSnapshotDiff(id);
    if (!diffs) return;
    showDiff({
      title: 'Diff: current canvas → snapshot',
      subtitle: snapLabel,
      diffs,
      onRestore: () => {
        void restoreSnapshot(id);
        closeDiff();
        loadSnapshots();
      },
      restoreLabel: 'Restore this snapshot',
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-faint">Rule history</div>
        <div className="text-sm font-semibold text-ink">{snapshots.length} snapshots</div>
      </div>

      {/* Save a new snapshot */}
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSave();
          }}
          placeholder="Snapshot label (optional)…"
          className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-border px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-neon/20"
        />
        <Button variant="primary" size="sm" onClick={onSave}>
          <Camera size={14} /> Save
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <EmptyState
          icon={<History size={28} />}
          title="No snapshots yet"
          description="Save a snapshot to capture the current rules. You can diff against it later or roll back to it."
        />
      ) : (
        <div className="space-y-2">
          {snapshots.map((snap) => (
            <div key={snap.id} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Camera size={14} className="text-neon-violet shrink-0" />
                <span className="text-sm text-ink truncate flex-1">{snap.label}</span>
                <span className="text-[10px] text-ink-faint inline-flex items-center gap-1 shrink-0">
                  <Clock size={11} /> {timeAgo(snap.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Chip tone="neutral">{snap.ruleCount} rules</Chip>
                <div className="ml-auto flex items-center gap-0.5">
                  <IconButton label="Diff against current canvas" onClick={() => onPreview(snap.id, snap.label)}>
                    <GitCompare size={14} />
                  </IconButton>
                  <IconButton label="Restore this snapshot" onClick={() => void restoreSnapshot(snap.id)}>
                    <RotateCcw size={14} />
                  </IconButton>
                  <IconButton label="Delete snapshot" onClick={() => void deleteSnapshot(snap.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
