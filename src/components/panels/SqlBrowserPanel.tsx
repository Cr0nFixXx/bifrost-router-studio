import { useEffect, useMemo, useState } from 'react';
import { Database, Plus, RefreshCw, Save, Table2, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, Chip, EmptyState, Segmented } from '@/components/ui/primitives';
import type { RoutingRulesTableRow, RoutingTargetsTableRow } from '@/lib/db/bifrostDb';
import { validateCEL } from '@/lib/cel';
import { createRuleUid } from '@/lib/ruleIds';

type Tab = 'routing_rules' | 'routing_targets';
type FieldMode = 'normal' | 'expert';

const RULE_FIELDS: Array<{ key: keyof RoutingRulesTableRow; label: string; mode: FieldMode; kind?: 'text' | 'textarea' | 'number' | 'boolean' }> = [
  { key: 'id', label: 'id', mode: 'expert' },
  { key: 'config_hash', label: 'config_hash', mode: 'expert' },
  { key: 'name', label: 'name', mode: 'normal' },
  { key: 'description', label: 'description', mode: 'normal', kind: 'textarea' },
  { key: 'enabled', label: 'enabled', mode: 'normal', kind: 'boolean' },
  { key: 'cel_expression', label: 'cel_expression', mode: 'normal', kind: 'textarea' },
  { key: 'fallbacks', label: 'fallbacks', mode: 'normal', kind: 'textarea' },
  { key: 'query', label: 'query', mode: 'expert', kind: 'textarea' },
  { key: 'scope', label: 'scope', mode: 'normal' },
  { key: 'scope_id', label: 'scope_id', mode: 'expert' },
  { key: 'priority', label: 'priority', mode: 'normal', kind: 'number' },
  { key: 'created_at', label: 'created_at', mode: 'expert' },
  { key: 'updated_at', label: 'updated_at', mode: 'expert' },
  { key: 'chain_rule', label: 'chain_rule', mode: 'normal', kind: 'boolean' },
];

const TARGET_FIELDS: Array<{ key: keyof RoutingTargetsTableRow; label: string; mode: FieldMode; kind?: 'text' | 'number' }> = [
  { key: 'rule_id', label: 'rule_id', mode: 'expert' },
  { key: 'provider', label: 'provider', mode: 'normal' },
  { key: 'model', label: 'model', mode: 'normal' },
  { key: 'key_id', label: 'key_id', mode: 'expert' },
  { key: 'weight', label: 'weight', mode: 'expert', kind: 'number' },
];

function visible<T extends { mode: FieldMode }>(fields: T[], expert: boolean): T[] {
  return expert ? fields : fields.filter((f) => f.mode === 'normal');
}

const now = () => new Date().toISOString();

function blankRule(priority: number): RoutingRulesTableRow {
  return {
    id: createRuleUid(),
    config_hash: '',
    name: 'New SQL Browser Rule',
    description: '',
    enabled: 1,
    cel_expression: 'true',
    fallbacks: '[]',
    query: null,
    scope: 'global',
    scope_id: null,
    priority,
    created_at: now(),
    updated_at: now(),
    chain_rule: 0,
  };
}

function blankTarget(ruleId: string): RoutingTargetsTableRow {
  return { rowid: null, rule_id: ruleId, provider: '', model: '', key_id: null, weight: 1 };
}

export function SqlBrowserPanel() {
  const expert = useStore((s) => s.expertMode);
  const dbFileName = useStore((s) => s.dbFileName);
  const nodes = useStore((s) => s.nodes);
  const rules = useStore((s) => s.listRoutingRulesTableRows);
  const targets = useStore((s) => s.listRoutingTargetsTableRows);
  const saveRule = useStore((s) => s.saveRoutingRuleTableRow);
  const deleteRule = useStore((s) => s.deleteRoutingRuleTableRow);
  const saveTarget = useStore((s) => s.saveRoutingTargetTableRow);
  const deleteTarget = useStore((s) => s.deleteRoutingTargetTableRow);
  const refreshFromDb = useStore((s) => s.refreshFromDb);

  const [tab, setTab] = useState<Tab>('routing_rules');
  const [ruleRows, setRuleRows] = useState<RoutingRulesTableRow[]>([]);
  const [targetRows, setTargetRows] = useState<RoutingTargetsTableRow[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RoutingRulesTableRow | null>(null);
  const [targetDraft, setTargetDraft] = useState<RoutingTargetsTableRow | null>(null);
  const [originalRuleId, setOriginalRuleId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const reload = () => {
    const rr = rules();
    const tt = targets();
    setRuleRows(rr);
    setTargetRows(tt);
    if (rr.length && !selectedRuleId) setSelectedRuleId(rr[0].id);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [nodes.length]);

  useEffect(() => {
    const r = ruleRows.find((row) => row.id === selectedRuleId) ?? null;
    setRuleDraft(r ? { ...r } : null);
    setOriginalRuleId(r?.id ?? null);
  }, [selectedRuleId, ruleRows]);

  useEffect(() => {
    const row = targetRows.find((t) => String(t.rowid ?? `${t.rule_id}:${t.provider}:${t.model}`) === selectedTargetKey) ?? null;
    setTargetDraft(row ? { ...row } : null);
  }, [selectedTargetKey, targetRows]);

  const ruleFields = visible(RULE_FIELDS, expert);
  const targetFields = visible(TARGET_FIELDS, expert);
  const celErrors = ruleDraft ? validateCEL(ruleDraft.cel_expression).filter((d) => d.severity === 'error') : [];

  const handleRefresh = () => { refreshFromDb(); reload(); setStatus('Refreshed from in-memory DB.'); };
  const handleAddRule = () => {
    const max = ruleRows.length ? Math.max(...ruleRows.map((r) => Number(r.priority ?? 0))) : -1;
    const row = blankRule(max + 1);
    setRuleRows([row, ...ruleRows]); setSelectedRuleId(row.id); setTab('routing_rules'); setStatus('New unsaved routing_rules row. Click Save row.');
  };
  const handleAddTarget = () => {
    const row = blankTarget(selectedRuleId ?? ruleRows[0]?.id ?? '');
    const key = `new:${Date.now()}`;
    setTargetRows([row, ...targetRows]); setSelectedTargetKey(key); setTargetDraft(row); setTab('routing_targets'); setStatus('New unsaved routing_targets row. Click Save target.');
  };

  const doSaveRule = async () => {
    if (!ruleDraft) return;
    setError(null); setStatus(null);
    try {
      const row = { ...ruleDraft, updated_at: now() };
      await saveRule(originalRuleId, row);
      reload(); setSelectedRuleId(row.id); setStatus('routing_rules row saved and canvas refreshed.');
    } catch (err) { setError((err as Error).message); }
  };
  const doDeleteRule = async () => {
    if (!ruleDraft || !confirm(`Delete routing_rules row ${ruleDraft.name}?`)) return;
    await deleteRule(ruleDraft.id); reload(); setSelectedRuleId(null); setStatus('routing_rules row deleted.');
  };
  const doSaveTarget = async () => {
    if (!targetDraft) return;
    setError(null); setStatus(null);
    try { await saveTarget(targetDraft); reload(); setStatus('routing_targets row saved and canvas refreshed.'); }
    catch (err) { setError((err as Error).message); }
  };
  const doDeleteTarget = async () => {
    if (!targetDraft?.rowid) { setError('Cannot delete a virtual/unsaved target row.'); return; }
    if (!confirm(`Delete routing_targets row ${targetDraft.rowid}?`)) return;
    await deleteTarget(targetDraft.rowid); reload(); setSelectedTargetKey(null); setStatus('routing_targets row deleted.');
  };

  const saveRuleInline = async (originalId: string, row: RoutingRulesTableRow) => {
    setError(null); setStatus(null);
    try {
      const next = { ...row, updated_at: now() };
      await saveRule(originalId, next);
      setRuleRows((rows) => rows.map((r) => r.id === originalId ? next : r));
      setSelectedRuleId(next.id);
      setStatus(`Inline saved routing_rules.${originalId === next.id ? next.id : `${originalId} → ${next.id}`}`);
      reload();
    } catch (err) { setError((err as Error).message); }
  };

  const saveTargetInline = async (row: RoutingTargetsTableRow) => {
    setError(null); setStatus(null);
    try {
      await saveTarget(row);
      setStatus(`Inline saved routing_targets row ${row.rowid ?? '(new)'}.`);
      reload();
    } catch (err) { setError((err as Error).message); }
  };

  const startColumnResize = (key: string, startX: number, currentWidth: number) => {
    const onMove = (event: PointerEvent) => {
      const next = Math.max(80, Math.min(640, currentWidth + event.clientX - startX));
      setColumnWidths((w) => ({ ...w, [key]: next }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px] gap-4 min-h-[640px]">
      <div className="rounded-xl border border-border bg-surface-2/40 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Database size={16} className="text-neon" />
          <div>
            <div className="text-sm font-semibold text-ink">Routing SQL Browser</div>
            <div className="text-[10px] text-ink-faint">{dbFileName ?? 'No DB'} · {expert ? 'Expert fields visible' : 'Normal fields only'}</div>
          </div>
          <span className="ml-auto" />
          <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'routing_rules', label: 'routing_rules' }, { value: 'routing_targets', label: 'routing_targets' }]} />
          <Button size="sm" variant="outline" onClick={handleRefresh}><RefreshCw size={13} /> Refresh</Button>
          {tab === 'routing_rules' ? <Button size="sm" onClick={handleAddRule}><Plus size={13} /> New rule</Button> : <Button size="sm" onClick={handleAddTarget}><Plus size={13} /> New target</Button>}
        </div>
        <div className="overflow-auto min-h-0 flex-1">
          {tab === 'routing_rules' ? <RulesTable rows={ruleRows} fields={ruleFields} selectedId={selectedRuleId} onSelect={setSelectedRuleId} onSave={saveRuleInline} widths={columnWidths} onResize={startColumnResize} /> : <TargetsTable rows={targetRows} fields={targetFields} selectedKey={selectedTargetKey} onSelect={setSelectedTargetKey} onSave={saveTargetInline} widths={columnWidths} onResize={startColumnResize} />}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2/40 p-4 overflow-y-auto max-h-[72vh]">
        {tab === 'routing_rules' ? (
          !ruleDraft ? <EmptyState title="No routing_rules row selected" /> : <RuleEditor row={ruleDraft} setRow={setRuleDraft} fields={ruleFields} celErrors={celErrors} onSave={doSaveRule} onDelete={doDeleteRule} />
        ) : (
          !targetDraft ? <EmptyState title="No routing_targets row selected" /> : <TargetEditor row={targetDraft} setRow={setTargetDraft} fields={targetFields} onSave={doSaveTarget} onDelete={doDeleteTarget} expert={expert} />
        )}
        {error && <div className="mt-3 rounded-lg border border-neon-red/30 bg-neon-red/10 p-2 text-xs text-neon-red">{error}</div>}
        {status && <div className="mt-3 rounded-lg border border-neon-green/30 bg-neon-green/10 p-2 text-xs text-neon-green">{status}</div>}
      </div>
    </div>
  );
}

function RulesTable({ rows, fields, selectedId, onSelect, onSave, widths, onResize }: { rows: RoutingRulesTableRow[]; fields: typeof RULE_FIELDS; selectedId: string | null; onSelect: (id: string) => void; onSave: (originalId: string, row: RoutingRulesTableRow) => Promise<void>; widths: Record<string, number>; onResize: (key: string, startX: number, currentWidth: number) => void }) {
  if (rows.length === 0) return <EmptyState title="No routing_rules rows" icon={<Table2 size={28} />} />;
  return (
    <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
      <thead className="sticky top-0 bg-surface border-b border-border text-ink-faint">
        <tr>{fields.map((f) => { const k = String(f.key); const w = widths[k] ?? (f.kind === 'textarea' ? 260 : 150); return <th key={k} className="relative px-3 py-2 font-medium whitespace-nowrap" style={{ width: w }}><span className="truncate block pr-2">{f.label}</span><button type="button" className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-neon/40" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onResize(k, e.clientX, w); }} /></th>; })}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onSelect(r.id)} className={`cursor-pointer border-b border-border/60 hover:bg-surface-2 ${selectedId === r.id ? 'bg-neon/10' : ''}`}>
            {fields.map((f) => (
              <td key={f.key} className="px-2 py-1 align-top" style={{ width: widths[String(f.key)] ?? (f.kind === 'textarea' ? 260 : 150) }}>
                <InlineCell
                  value={r[f.key]}
                  kind={f.kind}
                  fieldKey={String(f.key)}
                  onCommit={(value) => onSave(r.id, { ...r, [f.key]: value })}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TargetsTable({ rows, fields, selectedKey, onSelect, onSave, widths, onResize }: { rows: RoutingTargetsTableRow[]; fields: typeof TARGET_FIELDS; selectedKey: string | null; onSelect: (key: string) => void; onSave: (row: RoutingTargetsTableRow) => Promise<void>; widths: Record<string, number>; onResize: (key: string, startX: number, currentWidth: number) => void }) {
  if (rows.length === 0) return <EmptyState title="No routing_targets rows" icon={<Table2 size={28} />} />;
  return (
    <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
      <thead className="sticky top-0 bg-surface border-b border-border text-ink-faint">
        <tr>{fields.map((f) => { const k = String(f.key); const w = widths[k] ?? 150; return <th key={k} className="relative px-3 py-2 font-medium whitespace-nowrap" style={{ width: w }}><span className="truncate block pr-2">{f.label}</span><button type="button" className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-neon/40" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onResize(k, e.clientX, w); }} /></th>; })}</tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const key = String(r.rowid ?? `${r.rule_id}:${idx}`);
          return (
            <tr key={key} onClick={() => onSelect(key)} className={`cursor-pointer border-b border-border/60 hover:bg-surface-2 ${selectedKey === key ? 'bg-neon/10' : ''}`}>
              {fields.map((f) => (
                <td key={f.key} className="px-2 py-1 align-top" style={{ width: widths[String(f.key)] ?? 150 }}>
                  <InlineCell
                    value={r[f.key]}
                    kind={f.kind}
                    fieldKey={String(f.key)}
                    onCommit={(value) => onSave({ ...r, [f.key]: value })}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InlineCell({ value, kind, fieldKey, onCommit }: { value: any; kind?: string; fieldKey: string; onCommit: (value: any) => Promise<void> }) {
  const [local, setLocal] = useState(value == null ? '' : String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => setLocal(value == null ? '' : String(value)), [value]);
  const commit = async () => {
    const next = kind === 'number' ? Number(local || 0) : local === '' ? null : local;
    if (String(value ?? '') === String(next ?? '')) return;
    setSaving(true);
    await onCommit(next);
    setSaving(false);
  };
  if (kind === 'boolean') {
    return (
      <input
        type="checkbox"
        className="accent-neon"
        checked={!!Number(value)}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => void onCommit(e.target.checked ? 1 : 0)}
      />
    );
  }
  if (fieldKey === 'scope') {
    return (
      <select className="input text-[11px] py-1" value={local || 'global'} onClick={(e) => e.stopPropagation()} onChange={(e) => { setLocal(e.target.value); void onCommit(e.target.value); }}>
        {['global','customer','team','virtual_key'].map((s) => <option key={s}>{s}</option>)}
      </select>
    );
  }
  return (
    <input
      className={`input font-mono text-[11px] py-1 ${saving ? 'border-neon' : ''}`}
      value={local}
      type={kind === 'number' ? 'number' : 'text'}
      title="Inline editable — Enter or blur saves"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') { setLocal(value == null ? '' : String(value)); (e.currentTarget as HTMLInputElement).blur(); } }}
    />
  );
}

function RuleEditor({ row, setRow, fields, celErrors, onSave, onDelete }: { row: RoutingRulesTableRow; setRow: (r: RoutingRulesTableRow) => void; fields: typeof RULE_FIELDS; celErrors: ReturnType<typeof validateCEL>; onSave: () => void; onDelete: () => void }) {
  const update = (key: keyof RoutingRulesTableRow, value: any) => setRow({ ...row, [key]: value });
  return <div className="space-y-3"><div className="flex items-center gap-2"><Chip tone="cyan">routing_rules</Chip><span className="text-xs text-ink-faint font-mono truncate">{row.id}</span></div>{fields.map((f) => <SqlField key={f.key} label={`${f.label}${f.mode === 'expert' ? ' · Expert' : ''}`}>{renderInput(f.kind, row[f.key], (v) => update(f.key, v), f.key)}</SqlField>)}{celErrors.length > 0 && <div className="rounded-lg border border-neon-red/30 bg-neon-red/10 p-2 text-xs text-neon-red">{celErrors.map((d) => d.message).join(' · ')}</div>}<div className="flex gap-2 pt-2"><Button onClick={onSave}><Save size={14} /> Save row</Button><Button variant="danger" onClick={onDelete}><Trash2 size={14} /> Delete</Button></div><p className="text-[10px] text-ink-faint leading-relaxed">Direct edits update the in-memory SQLite DB and refresh the canvas. Download the DB file afterwards to persist changes outside the browser.</p></div>;
}
function TargetEditor({ row, setRow, fields, onSave, onDelete, expert }: { row: RoutingTargetsTableRow; setRow: (r: RoutingTargetsTableRow) => void; fields: typeof TARGET_FIELDS; onSave: () => void; onDelete: () => void; expert: boolean }) {
  const update = (key: keyof RoutingTargetsTableRow, value: any) => setRow({ ...row, [key]: value });
  return <div className="space-y-3"><div className="flex items-center gap-2"><Chip tone="violet">routing_targets</Chip><span className="text-xs text-ink-faint font-mono">rowid {row.rowid ?? 'new/virtual'}</span></div>{expert && <SqlField label="rowid · internal"><input className="input font-mono text-xs" value={row.rowid ?? 'new'} disabled /></SqlField>}{fields.map((f) => <SqlField key={f.key} label={`${f.label}${f.mode === 'expert' ? ' · Expert' : ''}`}>{renderInput(f.kind, row[f.key], (v) => update(f.key, v), f.key)}</SqlField>)}<div className="flex gap-2 pt-2"><Button onClick={onSave}><Save size={14} /> Save target</Button><Button variant="danger" onClick={onDelete} disabled={!row.rowid}><Trash2 size={14} /> Delete</Button></div><p className="text-[10px] text-ink-faint leading-relaxed">Normal mode shows provider/model. Expert mode shows rule_id, key_id and weight.</p></div>;
}
function renderInput(kind: string | undefined, value: any, onChange: (v: any) => void, key: string) {
  if (kind === 'boolean') return <input type="checkbox" checked={!!Number(value)} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />;
  if (kind === 'number') return <input type="number" className="input text-xs" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />;
  if (kind === 'textarea') return <textarea className="input font-mono text-[11px] h-24" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
  if (key === 'scope') return <select className="input text-xs" value={value ?? 'global'} onChange={(e) => onChange(e.target.value)}>{['global','customer','team','virtual_key'].map((s) => <option key={s}>{s}</option>)}</select>;
  return <input className="input font-mono text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
}
function SqlField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-faint">{label}</span>{children}</label>; }
