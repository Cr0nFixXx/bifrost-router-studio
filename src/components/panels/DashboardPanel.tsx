import { BarChart3, AlertCircle, AlertTriangle, CheckCircle2, Database, GitBranch, Server, Target } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Chip, EmptyState } from '@/components/ui/primitives';

export function DashboardPanel() {
  const rules = useStore((s) => s.getCanvasRules());
  const providers = useStore((s) => s.providers);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const diags = useStore((s) => s.diagnostics);
  const dbFileName = useStore((s) => s.dbFileName);

  const errors = diags.filter((d) => d.level === 'error').length;
  const warnings = diags.filter((d) => d.level === 'warning').length;
  const targets = nodes.filter((n) => n.data.kind === 'target').length;
  const fallbacks = nodes.filter((n) => n.data.kind === 'fallback').length;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-faint">User dashboard</div>
        <div className="text-sm font-semibold text-ink truncate">{dbFileName ?? 'Workspace'}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<GitBranch size={14} />} label="Rules" value={rules.length} />
        <Stat icon={<Target size={14} />} label="Targets" value={targets} />
        <Stat icon={<Server size={14} />} label="Providers" value={providers.length} />
        <Stat icon={<Database size={14} />} label="Edges" value={edges.length} />
      </div>

      <div className="rounded-xl border border-border bg-surface-2/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          {errors ? <AlertCircle size={15} className="text-neon-red" /> : warnings ? <AlertTriangle size={15} className="text-neon-amber" /> : <CheckCircle2 size={15} className="text-neon-green" />}
          <span className="text-sm font-semibold text-ink">Health</span>
          <span className="ml-auto flex gap-1">
            {errors > 0 && <Chip tone="red">{errors} errors</Chip>}
            {warnings > 0 && <Chip tone="amber">{warnings} warnings</Chip>}
            {errors === 0 && warnings === 0 && <Chip tone="green">valid</Chip>}
          </span>
        </div>
        {diags.length === 0 ? (
          <p className="text-xs text-ink-faint">No validation issues. The rule graph is ready to save/export.</p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {diags.slice(0, 6).map((d) => (
              <div key={d.id} className="rounded-lg bg-canvas/50 border border-border px-2 py-1.5">
                <div className={d.level === 'error' ? 'text-xs text-neon-red' : 'text-xs text-neon-amber'}>{d.title}</div>
                <div className="text-[10px] text-ink-faint truncate">{d.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rules.length === 0 && <EmptyState icon={<BarChart3 size={26} />} title="No rules yet" description="Use the wizard, templates, or canvas menu to create your first routing rule." />}

      {rules.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">Top rules</div>
          <div className="space-y-1.5">
            {rules.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="w-7 text-right font-mono text-ink-faint">{r.priority}</span>
                <span className="text-ink truncate flex-1">{r.name}</span>
                <Chip tone="neutral">{r.targets.length} targets</Chip>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">{icon} {label}</div>
      <div className="text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}
