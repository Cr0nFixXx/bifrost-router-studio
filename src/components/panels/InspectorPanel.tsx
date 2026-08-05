/**
 * Right-panel inspector. Edits the selected node. The Trigger editor includes
 * the visual CEL builder (conditions -> expression), scope/priority/chain
 * controls, and — in Expert mode — a raw JSON view. Weights, providers, models
 * and fallbacks are edited here too.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sliders,
  Code2,
  Heading,
  AlignLeft,
  Flag,
  Tag,
  Plus,
  Trash2,
  Gauge,
  Layers3,
  Hash,
  Settings2,
  GitBranch,
  Filter,
} from 'lucide-react';
import { useSelectedNode, useStore } from '@/store/useStore';
import { Button, Chip, EmptyState, Toggle } from '@/components/ui/primitives';
import { inferProviderFromModelValue, modelCandidates, stripProviderPrefix } from '@/lib/modelRefs';
import {
  compileGroup,
  newCondition,
  parseExpression,
  validateCEL,
  uid,
} from '@/lib/cel';
import type {
  CELComparison,
  CELCondition,
  CELField,
  CELGroup,
  ComplexityTier,
  RuleScope,
} from '@/types/bifrost';

const FIELDS: Array<{ value: CELField; label: string; numeric?: boolean }> = [
  { value: 'model', label: 'model' },
  { value: 'provider', label: 'provider' },
  { value: 'request_type', label: 'request_type' },
  { value: 'header', label: 'header', },
  { value: 'param', label: 'param' },
  { value: 'team_name', label: 'team_name' },
  { value: 'customer_id', label: 'customer_id' },
  { value: 'virtual_key_name', label: 'virtual_key_name' },
  { value: 'budget_used', label: 'budget_used', numeric: true },
  { value: 'tokens_used', label: 'tokens_used', numeric: true },
  { value: 'request', label: 'request (rate)', numeric: true },
  { value: 'request_size', label: 'request_size', numeric: true },
  { value: 'time_hour', label: 'time.hour', numeric: true },
  { value: 'complexity_tier', label: 'complexity_tier' },
];

const OPS: CELComparison[] = ['==', '!=', '>', '<', '>=', '<=', 'in', 'startsWith', 'endsWith', 'contains', 'matches'];

export function InspectorPanel() {
  const node = useSelectedNode();
  const expertMode = useStore((s) => s.expertMode);

  if (!node) {
    return (
      <EmptyState
        icon={<Sliders size={30} />}
        title="Nothing selected"
        description="Select a node on the canvas to configure it, or use the palette to add new elements."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Inspector</div>
          <div className="text-sm font-semibold text-ink capitalize">{node.data.kind} node</div>
          <div className="text-[10px] text-ink-faint">{expertMode ? 'Expert: raw JSON, key IDs, exact weights and advanced fields visible.' : 'Simple: compact editing; enable Expert for key IDs, exact weights and raw JSON.'}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone="neutral">{node.data.kind}</Chip>
          <Chip tone={expertMode ? 'violet' : 'green'}>{expertMode ? 'expert' : 'simple'}</Chip>
        </div>
      </div>

      {node.data.kind === 'trigger' && <TriggerEditor node={node as any} />}
      {node.data.kind === 'condition' && <ConditionNodeEditor node={node as any} />}
      {node.data.kind === 'logic' && <LogicNodeEditor node={node as any} />}
      {(node.data.kind === 'target') && <TargetEditor node={node as any} />}
      {(node.data.kind === 'fallback') && <FallbackEditor node={node as any} />}
      {(node.data.kind === 'provider' || node.data.kind === 'model') && <MetaEditor node={node as any} />}
      {node.data.kind === 'annotation' && <AnnotationEditor node={node as any} />}
      {node.data.kind === 'group' && <GroupEditor node={node as any} />}

      {(expertMode || node.data.kind === 'trigger') && <RawJson node={node} />}
    </div>
  );
}


function AnnotationEditor({ node }: { node: any }) {
  const update = useStore((s) => s.updateNodeData);
  const data = node.data;
  return (
    <div className="space-y-4">
      <Field icon={<Heading size={12} />} label="Label">
        <input className="input" value={data.label ?? ''} onChange={(e) => update(node.id, { label: e.target.value })} />
      </Field>
      <Field icon={<AlignLeft size={12} />} label="Text">
        <textarea className="input resize-none h-24" value={data.text ?? ''} onChange={(e) => update(node.id, { text: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field icon={<Tag size={12} />} label="Visual type">
          <select className="input" value={data.variant ?? 'sticky'} onChange={(e) => update(node.id, { variant: e.target.value })}>
            {['sticky', 'box', 'marker', 'pen'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field icon={<Hash size={12} />} label="Color">
          <input type="color" className="input h-10 p-1" value={data.color ?? '#fbbf24'} onChange={(e) => update(node.id, { color: e.target.value })} />
        </Field>
      </div>
      <p className="text-[11px] text-ink-faint">Nur visuelle Arbeitsflächen-Notiz: wird nicht in Bifrost routing_rules geschrieben.</p>
    </div>
  );
}

function GroupEditor({ node }: { node: any }) {
  const update = useStore((s) => s.updateNodeData);
  return (
    <Field icon={<Layers3 size={14} />} label="Group label">
      <input
        className="input"
        value={node.data.label ?? ''}
        onChange={(e) => update(node.id, { label: e.target.value })}
        placeholder="Group name"
      />
    </Field>
  );
}

/* ----------------------------- fields ------------------------------ */

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}


/* ----------------------- condition / logic nodes -------------------- */

function ConditionNodeEditor({ node }: { node: any }) {
  const data = node.data;
  const edges = useStore((s) => s.edges);
  const usageCount = new Set(edges.filter((e) => e.source === node.id).map((e) => e.target)).size;
  const update = (patch: any) => useStore.getState().updateNodeData(node.id, patch);
  return (
    <div className="space-y-4">
      {usageCount > 1 && (
        <div className="rounded-lg border border-neon/25 bg-neon/10 px-3 py-2 text-xs text-neon">
          Shared condition · used by {usageCount} logic/route nodes. Editing this condition affects every connected rule.
        </div>
      )}
      <Field icon={<Heading size={12} />} label="Label">
        <input className="input" value={data.label ?? ''} onChange={(e) => update({ label: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field icon={<Filter size={12} />} label="Field">
          <select className="input text-xs" value={data.field} onChange={(e) => update({ field: e.target.value as CELField })}>
            {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field icon={<Code2 size={12} />} label="Operator">
          <select className="input text-xs" value={data.op} onChange={(e) => update({ op: e.target.value as CELComparison })}>
            {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
        </Field>
      </div>
      {(data.field === 'header' || data.field === 'param') && (
        <Field icon={<Hash size={12} />} label={data.field === 'header' ? 'Header key' : 'Param key'}>
          <input className="input text-xs" value={data.headerName ?? ''} onChange={(e) => update({ headerName: e.target.value })} />
        </Field>
      )}
      <Field icon={<Tag size={12} />} label="Value / alias">
        <input className="input text-xs" value={data.value ?? ''} onChange={(e) => update({ value: e.target.value })} placeholder={data.op === 'in' ? 'a, b, c' : 'value'} />
      </Field>
      <div className="flex items-center justify-between rounded-lg bg-surface-2/60 px-3 py-2">
        <span className="text-xs text-ink">Negate condition</span>
        <Toggle checked={!!data.negate} onChange={(v) => update({ negate: v })} />
      </div>
    </div>
  );
}

function LogicNodeEditor({ node }: { node: any }) {
  const data = node.data;
  const update = (patch: any) => useStore.getState().updateNodeData(node.id, patch);
  return (
    <div className="space-y-4">
      <Field icon={<GitBranch size={12} />} label="Logic">
        <div className="grid grid-cols-2 gap-2">
          {(['&&', '||'] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => update({ combinator: op, label: op === '&&' ? 'AND' : 'OR' })}
              className={`rounded-lg px-3 py-2 text-xs border ${data.combinator === op ? 'bg-neon/15 border-neon/40 text-neon' : 'border-border text-ink-muted hover:bg-surface-2'}`}
            >
              {op === '&&' ? 'AND' : 'OR'}
            </button>
          ))}
        </div>
      </Field>
      <p className="text-[11px] text-ink-faint leading-relaxed">
        Connect Condition nodes into this logic node, then connect this logic node to a Target. Nested AND/OR groups are represented by connecting one Logic node into another.
      </p>
    </div>
  );
}

/* --------------------------- trigger editor ------------------------ */

function TriggerEditor({ node }: { node: any }) {
  const update = useStore((s) => s.updateNodeData);
  const data = node.data;

  return (
    <div className="space-y-4">
      <Field icon={<Heading size={12} />} label="Name">
        <input className="input" value={data.label} onChange={(e) => update(node.id, { label: e.target.value })} />
      </Field>

      <Field icon={<AlignLeft size={12} />} label="Beschreibung">
        <textarea className="input resize-none h-16" value={data.description ?? ''} onChange={(e) => update(node.id, { description: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field icon={<Flag size={12} />} label="Scope">
          <select className="input" value={data.scope} onChange={(e) => update(node.id, { scope: e.target.value })}>
            {(['global', 'customer', 'team', 'virtual_key'] as RuleScope[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field icon={<Hash size={12} />} label="Priority">
          <input type="number" className="input" value={data.priority} onChange={(e) => update(node.id, { priority: Number(e.target.value) })} />
        </Field>
      </div>

      {data.scope !== 'global' && (
        <Field icon={<Tag size={12} />} label="Scope ID">
          <input className="input" placeholder="team-uuid-…" value={data.scopeId ?? ''} onChange={(e) => update(node.id, { scopeId: e.target.value })} />
        </Field>
      )}

      <div className="rounded-lg bg-surface-2/50 border border-border px-3 py-2 text-[11px] text-ink-faint leading-relaxed">
        CEL wird jetzt über verbundene <span className="text-ink-muted">Condition</span>- und <span className="text-ink-muted">AND/OR Logic</span>-Nodes definiert. Diese Rule-Node dient nur als Label-/Scope-/Priority-Anker.
      </div>
    </div>
  );
}

/* -------------------------- condition editor ----------------------- */

function ConditionEditor({ group, onChange }: { group: CELGroup; onChange: (g: CELGroup) => void }) {
  return <RuleGroupEditor group={group} onChange={onChange} depth={0} />;
}

type RuleItem = CELCondition | CELGroup;

function isCondition(item: RuleItem): item is CELCondition {
  return 'field' in item;
}

function cloneRuleItem<T extends RuleItem>(item: T): T {
  if (isCondition(item)) return { ...item, id: uid('cond') } as T;
  return {
    ...item,
    id: uid('grp'),
    conditions: item.conditions.map((child) => cloneRuleItem(child)),
  } as T;
}

function emptyRuleGroup(combinator: '&&' | '||' = '&&'): CELGroup {
  return { id: uid('grp'), combinator, conditions: [newCondition()] };
}

function RuleGroupEditor({
  group,
  onChange,
  onRemove,
  depth,
}: {
  group: CELGroup;
  onChange: (g: CELGroup) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const setCombinator = (combinator: '&&' | '||') => onChange({ ...group, combinator });
  const addCond = () => onChange({ ...group, conditions: [...group.conditions, newCondition()] });
  const addGroup = () => onChange({ ...group, conditions: [...group.conditions, emptyRuleGroup()] });
  const setChild = (id: string, next: RuleItem) =>
    onChange({ ...group, conditions: group.conditions.map((c) => (c.id === id ? next : c)) });
  const removeChild = (id: string) =>
    onChange({ ...group, conditions: group.conditions.filter((c) => c.id !== id) });
  const duplicateChild = (item: RuleItem) =>
    onChange({ ...group, conditions: [...group.conditions, cloneRuleItem(item)] });
  const wrapChild = (item: RuleItem) =>
    onChange({
      ...group,
      conditions: group.conditions.map((c) =>
        c.id === item.id ? { id: uid('grp'), combinator: '&&', conditions: [c] } : c,
      ),
    });

  return (
    <div
      className={`relative rounded-xl border ${depth === 0 ? 'border-border bg-canvas/35 p-3' : 'border-border/80 bg-surface-2/35 p-2.5'} ${depth > 0 ? 'ml-3' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setGroupMenuOpen(true);
      }}
    >
      {depth > 0 && <div className="absolute -left-3 top-5 h-px w-3 bg-border-strong" />}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => setCombinator('&&')}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold border ${group.combinator === '&&' ? 'bg-ink text-canvas border-ink' : 'bg-surface-3 text-ink-muted border-border hover:text-ink'}`}
        >
          AND
        </button>
        <button
          type="button"
          onClick={() => setCombinator('||')}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold border ${group.combinator === '||' ? 'bg-ink text-canvas border-ink' : 'bg-surface-3 text-ink-muted border-border hover:text-ink'}`}
        >
          OR
        </button>
        <Button size="sm" variant="outline" onClick={addCond}>
          <Plus size={13} /> Add Rule
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup}>
          <Plus size={13} /> Add Rule Group
        </Button>
        <span className="ml-auto text-[10px] text-ink-faint">Level {depth + 1}</span>
        <div className="relative">
          <button type="button" onClick={() => setGroupMenuOpen((o) => !o)} className="rounded px-2 py-1 text-ink-faint hover:bg-surface-3 hover:text-ink" title="Group context menu">
            ⋯
          </button>
          {groupMenuOpen && (
            <div className="absolute right-0 top-7 z-20 min-w-44 rounded-lg border border-border bg-surface shadow-depth p-1" onMouseLeave={() => setGroupMenuOpen(false)}>
              <MenuAction label="Add rule" onClick={() => { addCond(); setGroupMenuOpen(false); }} />
              <MenuAction label="Add rule group" onClick={() => { addGroup(); setGroupMenuOpen(false); }} />
              <MenuAction label="Switch to AND" onClick={() => { setCombinator('&&'); setGroupMenuOpen(false); }} />
              <MenuAction label="Switch to OR" onClick={() => { setCombinator('||'); setGroupMenuOpen(false); }} />
              <MenuAction label="Clear group" danger onClick={() => { onChange({ ...group, conditions: [] }); setGroupMenuOpen(false); }} />
              {onRemove && <MenuAction label="Delete group" danger onClick={() => { onRemove(); setGroupMenuOpen(false); }} />}
            </div>
          )}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-ink-faint hover:bg-neon-red/10 hover:text-neon-red" title="Remove group">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="relative space-y-2 pl-3 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-border-strong">
        {group.conditions.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-ink-faint">
            Empty group. Add a rule or rule group. Empty root compiles to <code>true</code>.
          </div>
        )}

        {group.conditions.map((item) => (
          <div key={item.id} className="relative before:absolute before:-left-3 before:top-5 before:h-px before:w-3 before:bg-border-strong">
            {isCondition(item) ? (
              <ConditionRow
                condition={item}
                onChange={(next) => setChild(item.id, next)}
                onRemove={() => removeChild(item.id)}
                onDuplicate={() => duplicateChild(item)}
                onWrap={() => wrapChild(item)}
              />
            ) : (
              <RuleGroupEditor
                group={item}
                depth={depth + 1}
                onChange={(next) => setChild(item.id, next)}
                onRemove={() => removeChild(item.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  onDuplicate,
  onWrap,
}: {
  condition: CELCondition;
  onChange: (c: CELCondition) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onWrap: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const setField = (field: CELField) =>
    onChange({
      ...condition,
      field,
      headerName: field === 'header' || field === 'param' ? condition.headerName : undefined,
      op: normalizeOpForField(field, condition.op),
    });

  return (
    <motion.div
      layout
      className="relative rounded-lg border border-border bg-surface-2/60 p-2"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(true);
      }}
    >
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(130px,1fr)_minmax(90px,0.8fr)_minmax(130px,1.3fr)_auto]">
        <select className="input text-xs" value={condition.field} onChange={(e) => setField(e.target.value as CELField)}>
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {(condition.field === 'header' || condition.field === 'param') ? (
          <input
            className="input text-xs"
            placeholder={condition.field === 'header' ? 'header key' : 'param key'}
            value={condition.headerName ?? ''}
            onChange={(e) => onChange({ ...condition, headerName: e.target.value })}
          />
        ) : (
          <select className="input text-xs" value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value as CELComparison })}>
            {opsForField(condition.field).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}

        {(condition.field === 'header' || condition.field === 'param') ? (
          <div className="grid grid-cols-[0.75fr_1fr] gap-2">
            <select className="input text-xs" value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value as CELComparison })}>
              {opsForField(condition.field).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <ValueEditor condition={condition} onChange={onChange} />
          </div>
        ) : (
          <ValueEditor condition={condition} onChange={onChange} />
        )}

        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...condition, negate: !condition.negate })}
            title="Negate (NOT)"
            className={`h-8 rounded px-2 text-[11px] font-mono ${condition.negate ? 'bg-neon-red/20 text-neon-red' : 'text-ink-faint hover:bg-surface-3 hover:text-ink'}`}
          >
            !
          </button>
          <button type="button" onClick={() => setMenuOpen((o) => !o)} className="h-8 rounded px-2 text-ink-faint hover:bg-surface-3 hover:text-ink" title="Context menu">
            ⋯
          </button>
          <button type="button" onClick={onRemove} className="h-8 rounded px-2 text-ink-faint hover:bg-neon-red/10 hover:text-neon-red" title="Remove rule">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="absolute right-8 top-9 z-20 min-w-40 rounded-lg border border-border bg-surface shadow-depth p-1" onMouseLeave={() => setMenuOpen(false)}>
          <MenuAction label="Wrap in group" onClick={() => { onWrap(); setMenuOpen(false); }} />
          <MenuAction label="Duplicate rule" onClick={() => { onDuplicate(); setMenuOpen(false); }} />
          <MenuAction label="Delete rule" danger onClick={() => { onRemove(); setMenuOpen(false); }} />
        </div>
      )}
    </motion.div>
  );
}

function ValueEditor({ condition, onChange }: { condition: CELCondition; onChange: (c: CELCondition) => void }) {
  const requestTypes = ['chat_completion', 'text_completion', 'responses', 'embedding', 'speech', 'transcription', 'translation', 'image_generation', 'moderation'];
  const complexityTiers = ['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'];
  const selectValues = condition.field === 'request_type' ? requestTypes : condition.field === 'complexity_tier' ? complexityTiers : null;

  if (selectValues && condition.op !== 'in' && !['contains', 'startsWith', 'endsWith', 'matches'].includes(condition.op)) {
    return (
      <select className="input text-xs" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
        <option value="">— select —</option>
        {selectValues.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }

  return (
    <input
      className="input text-xs"
      placeholder={condition.op === 'in' ? 'a, b, c' : 'value'}
      value={condition.value}
      onChange={(e) => onChange({ ...condition, value: e.target.value })}
    />
  );
}

function MenuAction({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded px-2.5 py-1.5 text-left text-xs ${danger ? 'text-neon-red hover:bg-neon-red/10' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {label}
    </button>
  );
}

function opsForField(field: CELField): CELComparison[] {
  if (FIELDS.find((f) => f.value === field)?.numeric) return ['==', '!=', '>', '<', '>=', '<=', 'in'];
  return OPS;
}

function normalizeOpForField(field: CELField, op: CELComparison): CELComparison {
  const allowed = opsForField(field);
  return allowed.includes(op) ? op : '==';
}

/* --------------------------- target editor ------------------------- */

function TargetEditor({ node }: { node: any }) {
  const data = node.data;
  const expertMode = useStore((st) => st.expertMode);
  const providers = useStore((st) => st.providers);
  const catalog = useStore((st) => st.modelCatalog);
  const update = (patch: any) => useStore.getState().updateNodeData(node.id, patch);
  const routes = data.routes?.length ? data.routes : [{ provider: data.providerId, model: data.modelId, api_key: data.apiKeyId, weight: data.weight ?? 1 }];
  const setRoute = (idx: number, patch: Record<string, unknown>) => {
    const next = routes.map((r: any, i: number) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      merged.model = stripProviderPrefix(String(merged.model ?? ''), String(merged.provider ?? ''));
      return merged;
    });
    update({ routes: next, providerId: next[0]?.provider ?? '', modelId: next[0]?.model ?? '', apiKeyId: next[0]?.api_key ?? '', weight: next[0]?.weight ?? 1 });
  };
  const removeRoute = (idx: number) => {
    const next = routes.filter((_: any, i: number) => i !== idx);
    update({ routes: next, providerId: next[0]?.provider ?? '', modelId: next[0]?.model ?? '', apiKeyId: next[0]?.api_key ?? '', weight: next[0]?.weight ?? 1, label: next.length > 1 ? `${next.length} Targets` : data.label });
  };
  const addRoute = () => update({ routes: [...routes, { provider: '', model: '', weight: 0 }] });

  return (
    <div className="space-y-4">
      <Field icon={<Heading size={12} />} label="Label">
        <input className="input" value={data.label} onChange={(e) => update({ label: e.target.value })} />
      </Field>
      <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-ink-faint font-semibold">Models / weighted targets</span>
          <button className="text-xs text-neon hover:text-ink" onClick={addRoute}>+ add model</button>
        </div>
        {routes.map((r: any, i: number) => (
          <div key={i} className={expertMode ? 'grid grid-cols-[1fr_1fr_90px_80px_auto] gap-1.5 items-center' : 'grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center'}>
            <ProviderDropdown value={r.provider ?? ''} onChange={(v: string) => setRoute(i, { provider: v })} providers={providers} catalog={catalog} current={{ ...data, providerId: r.provider }} />
            <ModelDropdown value={r.model ?? ''} onChange={(v: string) => setRoute(i, { model: v })} catalog={catalog} current={{ ...data, providerId: r.provider, modelId: r.model }} providers={providers} requireProvider />
            {expertMode && <KeyDropdown value={r.api_key ?? ''} onChange={(v: string) => setRoute(i, { api_key: v })} providers={providers} providerId={r.provider} />}
            {expertMode && <input type="number" min={0} max={1} step={0.05} className="input text-xs" value={r.weight ?? 1} onChange={(e) => setRoute(i, { weight: Number(e.target.value) })} title="weight" />}
            <button className="text-ink-faint hover:text-neon-red px-1" onClick={() => removeRoute(i)}>×</button>
          </div>
        ))}
        <div className="text-[10px] text-ink-faint">Weights should sum to 1.0 · current {routes.reduce((a: number, r: any) => a + Number(r.weight ?? 0), 0).toFixed(2)}</div>
      </div>
    </div>
  );
}

function FallbackEditor({ node }: { node: any }) {
  const data = node.data;
  const providers = useStore((st) => st.providers);
  const catalog = useStore((st) => st.modelCatalog);
  const update = (patch: any) => useStore.getState().updateNodeData(node.id, patch);
  const fallbacks = data.fallbacks?.length ? data.fallbacks : [[data.providerId, data.modelId].filter(Boolean).join('/')].filter(Boolean);
  const setFallback = (idx: number, value: string) => {
    const next = fallbacks.map((f: string, i: number) => i === idx ? value : f);
    const [provider, ...modelParts] = (next[0] ?? '').split('/');
    update({ fallbacks: next, providerId: provider ?? '', modelId: modelParts.join('/'), label: next.length > 1 ? `${next.length} Fallbacks` : (modelParts.join('/') || provider || 'Fallback') });
  };
  const addFallback = () => update({ fallbacks: [...fallbacks, ''] });
  const removeFallback = (idx: number) => {
    const next = fallbacks.filter((_: string, i: number) => i !== idx);
    const [provider, ...modelParts] = (next[0] ?? '').split('/');
    update({ fallbacks: next, providerId: provider ?? '', modelId: modelParts.join('/') });
  };
  return (
    <div className="space-y-4">
      <Field icon={<Heading size={12} />} label="Label">
        <input className="input" value={data.label} onChange={(e) => update({ label: e.target.value })} />
      </Field>
      <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-ink-faint font-semibold">Fallback chain</span>
          <button className="text-xs text-neon hover:text-ink" onClick={addFallback}>+ add fallback</button>
        </div>
        {fallbacks.map((fb: string, i: number) => {
          const [prov, ...modelParts] = fb.split('/');
          const model = modelParts.join('/');
          const providerIds = Array.from(new Set([...(providers?.map((p: any) => p.id) ?? []), ...(providers?.map((p: any) => p.type).filter(Boolean) ?? [])]));
          const updateFb = (provider: string, modelValue: string) => {
            const inferred = provider || inferProviderFromModelValue(modelValue, providerIds) || '';
            const cleanModel = stripProviderPrefix(modelValue, inferred);
            setFallback(i, [inferred, cleanModel].filter(Boolean).join('/'));
          };
          return (
          <div key={i} className="grid grid-cols-[28px_1fr_1fr_auto] gap-1.5 items-center">
            <span className="text-[10px] text-ink-faint text-right">#{i + 1}</span>
            <ProviderDropdown value={prov ?? ''} onChange={(v: string) => updateFb(v, model)} providers={providers} catalog={catalog} current={{ ...data, providerId: prov }} />
            <ModelDropdown value={model} onChange={(v: string) => updateFb(prov, v)} catalog={catalog} current={{ ...data, providerId: prov, modelId: model }} providers={providers} />
            <button className="text-ink-faint hover:text-neon-red px-1" onClick={() => removeFallback(i)}>×</button>
          </div>
          );
        })}
      </div>
    </div>
  );
}


function ProviderDropdown({ value, onChange, providers, catalog, current }: any) {
  const providerIds = Array.from(new Set([
    ...(providers?.map((p: any) => p.id) ?? []),
    ...(providers?.map((p: any) => p.type).filter(Boolean) ?? []),
    ...(catalog?.map((m: any) => m.provider).filter(Boolean) ?? []),
    current?.providerId,
  ].filter(Boolean)));
  const listId = `providers-${current?.kind ?? 'node'}-${String(current?.providerId ?? 'all').replace(/[^A-Za-z0-9_-]/g, '_')}`;
  return (
    <>
      <input className="input text-xs" list={listId} value={value ?? ''} placeholder="provider" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{providerIds.map((id: string) => <option key={id} value={id} />)}</datalist>
    </>
  );
}

function ModelDropdown({ value, onChange, catalog, current, providers, requireProvider = false }: any) {
  const providerId = String(current?.providerId ?? '');
  const candidates = modelCandidates(catalog ?? [], providerId, requireProvider);
  const listId = `models-${providerId || 'all'}-${current?.kind ?? 'node'}-${requireProvider ? 'required' : 'optional'}`.replace(/[^A-Za-z0-9_-]/g, '_');
  const disabled = requireProvider && !providerId;
  return (
    <>
      <input
        className="input text-xs"
        list={listId}
        value={value ?? ''}
        disabled={disabled}
        placeholder={disabled ? 'select provider first' : 'model / alias'}
        onChange={(e) => onChange(stripProviderPrefix(e.target.value, providerId))}
      />
      <datalist id={listId}>{candidates.map((m: string) => <option key={m} value={m} />)}</datalist>
    </>
  );
}

function KeyDropdown({ value, onChange, providers, providerId }: any) {
  const keys: string[] = (providers ?? [])
    .filter((p: any) => !providerId || p.id === providerId || p.type === providerId)
    .flatMap((p: any) => p.keys ?? [])
    .map((k: any, idx: number) => k.key_id ?? k.id ?? k.name ?? k.value ?? `key-${idx + 1}`)
    .filter(Boolean);
  const listId = `keys-${String(providerId || 'all').replace(/[^A-Za-z0-9_-]/g, '_')}`;
  return (
    <>
      <input className="input text-xs" list={listId} value={value ?? ''} placeholder="key id" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{Array.from(new Set<string>(keys)).map((k: string) => <option key={k} value={k} />)}</datalist>
    </>
  );
}

function ProviderSelect({ value, onChange, providers, catalog, current }: any) {
  const providerIds = Array.from(new Set([
    ...(providers?.map((p: any) => p.id) ?? []),
    ...(providers?.map((p: any) => p.type).filter(Boolean) ?? []),
    ...(catalog?.map((m: any) => m.provider).filter(Boolean) ?? []),
    current?.providerId,
  ].filter(Boolean)));
  const listId = `providers-${current?.kind ?? 'node'}`;
  return (
    <>
      <input className="input text-xs" list={listId} value={value ?? ''} placeholder="provider or alias" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {providerIds.map((id: string) => <option key={id} value={id} />)}
      </datalist>
    </>
  );
}

function ModelSelect({ value, onChange, catalog, current }: any) {
  const providerId = String(current?.providerId ?? '');
  const candidates = modelCandidates(catalog ?? [], providerId, false);
  const listId = `models-${providerId || 'all'}-${current?.kind ?? 'node'}`.replace(/[^A-Za-z0-9_-]/g, '_');
  return (
    <>
      <input className="input text-xs" list={listId} value={value ?? current?.modelId ?? ''} placeholder="model or alias" onChange={(e) => onChange(stripProviderPrefix(e.target.value, providerId))} />
      <datalist id={listId}>{candidates.map((m: string) => <option key={m} value={m} />)}</datalist>
    </>
  );
}

/* -------------------------- complexity editor ---------------------- */

function ComplexityEditor({ node }: { node: any }) {
  const data = node.data;
  const tiers: ComplexityTier[] = ['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'];
  return (
    <div className="space-y-4">
      <Field icon={<Layers3 size={12} />} label="Complexity tier">
        <div className="grid grid-cols-2 gap-2">
          {tiers.map((t) => (
            <button
              key={t}
              onClick={() => {
                useStore.getState().updateNodeData(node.id, { tier: t });
                // also reflect on connected trigger if any
              }}
              className={`rounded-lg px-3 py-2 text-xs border transition-colors ${
                data.tier === t ? 'bg-neon-amber/15 border-neon-amber/40 text-neon-amber' : 'border-border text-ink-muted hover:bg-surface-2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <p className="text-[11px] text-ink-faint leading-relaxed">
        Bifrost auto-classifies each request into a tier. Connect this node from a Trigger condition
        like <code className="text-ink-muted">complexity_tier == &quot;{data.tier}&quot;</code> to route it.
      </p>
    </div>
  );
}

/* ---------------------------- meta editor -------------------------- */

function MetaEditor({ node }: { node: any }) {
  const data = node.data;
  const update = (patch: any) => useStore.getState().updateNodeData(node.id, patch);
  return (
    <div className="space-y-4">
      <Field icon={<Heading size={12} />} label="Label">
        <input className="input" value={data.label} onChange={(e) => update({ label: e.target.value })} />
      </Field>
      <Field icon={<Settings2 size={12} />} label="Provider ID">
        <input className="input" value={data.providerId ?? ''} onChange={(e) => update({ providerId: e.target.value })} spellCheck={false} />
      </Field>
      {data.kind === 'model' && (
        <Field icon={<Hash size={12} />} label="Model ID">
          <input className="input" value={data.modelId ?? ''} onChange={(e) => update({ modelId: e.target.value })} spellCheck={false} />
        </Field>
      )}
    </div>
  );
}

/* ------------------------------ raw json --------------------------- */

function RawJson({ node }: { node: any }) {
  const json = JSON.stringify(node.data, null, 2);
  return (
    <div className="rounded-xl border border-border bg-canvas/70">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-ink-faint border-b border-border flex items-center gap-1.5">
        <Code2 size={12} /> Raw node data
      </div>
      <pre className="text-[10px] font-mono text-ink-muted p-3 overflow-x-auto max-h-48 leading-relaxed">{json}</pre>
    </div>
  );
}
