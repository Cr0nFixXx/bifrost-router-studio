/**
 * Multi-step Rule-Chain Wizard. Generates an entire rule chain (trigger ->
 * targets -> fallbacks) from a high-level description. The final step materializes
 * the nodes onto the canvas and wires them together.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Wand2,
  Target,
  Zap,
  ShieldAlert,
  Rocket,
  Code2,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Modal, Button, Chip } from '@/components/ui/primitives';
import { CEL_FIELDS, compileGroup, newCondition, newGroup, opsForField, parseExpression, validateCEL } from '@/lib/cel';
import { fallbackFromParts, fallbackToParts } from '@/lib/modelRefs';
import { newId } from '@/lib/nodeFactory';
import { rulesToWorkflow } from '@/lib/bifrostMapper';
import type { CELComparison, CELCondition, CELField, CELGroup, TriggerKind } from '@/types/bifrost';

const STEPS = [
  { id: 0, label: 'Intent', icon: <Sparkles size={14} /> },
  { id: 1, label: 'Trigger', icon: <Zap size={14} /> },
  { id: 2, label: 'Targets', icon: <Target size={14} /> },
  { id: 3, label: 'Fallbacks', icon: <ShieldAlert size={14} /> },
  { id: 4, label: 'Review', icon: <Rocket size={14} /> },
];

const INTENT_PRESETS = [
  'Route premium users to the fastest provider',
  'Send complex prompts to a frontier model, simple ones to a cheap model',
  'Fail over across vendors for high availability',
  'Budget-aware routing to a cheaper provider when spend is high',
];

export function RuleChainWizard() {
  const open = useStore((s) => s.wizardOpen);
  const setOpen = useStore((s) => s.setWizardOpen);
  const setGraph = useStore((s) => s.setGraph);
  const wizardDraft = useStore((s) => s.wizardDraft);
  const setWizardDraft = useStore((s) => s.setWizardDraft);

  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    intent: '',
    name: '',
    triggerKind: 'cel' as TriggerKind,
    field: 'model' as any,
    op: '==' as any,
    value: '',
    celExpression: 'model == \"gpt-4o\"',
    headerName: 'x-tier',
    tier: 'COMPLEX',
    targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }],
    fallbacks: [{ provider: 'anthropic', model: 'claude-3-7-sonnet-latest' }],
  });
  const [celGroup, setCelGroup] = useState<CELGroup>(() => parseExpression('model == "gpt-4o"').group);

  const applyCelGroup = (group: CELGroup) => {
    setCelGroup(group);
    setForm((f) => ({ ...f, celExpression: compileGroup(group) }));
  };

  useEffect(() => {
    if (!open || !wizardDraft) return;
    const expr = wizardDraft.cel_expression || 'true';
    const parsed = parseExpression(expr).group;
    setCelGroup(parsed);
    setForm({
      intent: wizardDraft.description ?? '',
      name: wizardDraft.name,
      triggerKind: expr.includes('complexity_tier') ? 'complexity' : 'cel',
      field: 'model',
      op: '==',
      value: '',
      celExpression: expr,
      headerName: 'x-tier',
      tier: 'COMPLEX',
      targets: wizardDraft.targets.map((t) => ({ provider: t.provider ?? '', model: t.model ?? '', weight: t.weight ?? 1 })),
      fallbacks: wizardDraft.fallbacks.map((f) => {
        const { provider, model } = fallbackToParts(f);
        return { provider, model: model ?? '' };
      }),
    });
    setStep(1);
  }, [open, wizardDraft]);

  const close = () => {
    setOpen(false);
    setWizardDraft(null);
    setTimeout(() => {
      setStep(0);
      setForm({
        intent: '', name: '', triggerKind: 'cel', field: 'model', op: '==', value: '', celExpression: 'model == \"gpt-4o\"',
        headerName: 'x-tier', tier: 'COMPLEX', targets: [{ provider: 'openai', model: 'gpt-4o', weight: 1 }],
        fallbacks: [{ provider: 'anthropic', model: 'claude-3-7-sonnet-latest' }],
      });
      setCelGroup(parseExpression('model == "gpt-4o"').group);
    }, 200);
  };

  const quickCelExpression = (): string => {
    if (form.field === 'header' || form.field === 'param') {
      const base = form.field === 'header' ? 'headers' : 'params';
      return `${base}["${form.headerName}"] ${form.op} "${form.value}"`;
    }
    return `${form.field} ${form.op} "${form.value}"`;
  };

  const celExpression = (): string => {
    if (form.triggerKind === 'complexity') return `complexity_tier == "${form.tier}"`;
    return form.celExpression.trim() || quickCelExpression();
  };

  const create = () => {
    const ruleId = newId('trigger');
    const { nodes: builtNodes, edges: builtEdges } = rulesToWorkflow([
      {
        id: ruleId,
        name: form.name || 'Generated Rule',
        description: form.intent,
        enabled: true,
        chain_rule: false,
        cel_expression: celExpression(),
        targets: form.targets.map((t) => ({ provider: t.provider, model: t.model, weight: t.weight })),
        fallbacks: form.fallbacks.map((f) => fallbackFromParts(f.provider, f.model)).filter(Boolean),
        scope: 'global',
        scope_id: null,
        priority: 0,
      },
    ], { x: 80, y: 120 + Math.min(nodes.length, 12) * 24 });

    setGraph([...nodes, ...builtNodes], [...edges, ...builtEdges]);
    const trigger = builtNodes.find((n) => n.data.kind === 'trigger');
    if (trigger) useStore.getState().selectNode(trigger.id);
    useStore.getState().setRightTab('inspector');
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Rule-Chain Wizard"
      subtitle="Generate a complete routing chain in a few steps"
      width="max-w-2xl"
      zIndexClass="z-[95]"
      footer={
        <>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={14} /> Back
            </Button>
          )}
          <span className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight size={14} />
            </Button>
          ) : (
            <Button onClick={create}>
              <Wand2 size={14} /> Create chain
            </Button>
          )}
        </>
      }
    >
      {/* Stepper */}
      <div className="flex items-center justify-between mb-6 px-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`grid place-items-center h-7 w-7 rounded-full text-xs transition-colors ${step >= i ? 'bg-neon text-canvas' : 'bg-surface-3 text-ink-faint'}`}>
              {step > i ? <Check size={13} /> : s.icon}
            </div>
            <span className={`text-[11px] hidden sm:block ${step === i ? 'text-ink' : 'text-ink-faint'}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        ))}
      </div>

      <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="min-h-[240px]">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <span className="label">Describe the routing intent</span>
              <textarea
                className="input resize-none h-24"
                placeholder="e.g. Route premium users to GPT-4o and fall back to Claude if OpenAI is down"
                value={form.intent}
                onChange={(e) => setForm({ ...form, intent: e.target.value, name: e.target.value.slice(0, 40) })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {INTENT_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setForm({ ...form, intent: p, name: p.slice(0, 40) })}
                  className="text-left text-xs rounded-lg border border-border bg-surface-2/50 px-3 py-2 hover:border-neon/40 hover:bg-surface-2 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <span className="label">Trigger type</span>
              <div className="grid grid-cols-2 gap-2">
                {(['cel', 'complexity'] as TriggerKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setForm({ ...form, triggerKind: k })}
                    className={`rounded-lg px-3 py-2.5 text-sm border text-left transition-colors ${
                      form.triggerKind === k ? 'border-neon/50 bg-neon/10 text-ink' : 'border-border text-ink-muted hover:bg-surface-2'
                    }`}
                  >
                    <div className="font-medium capitalize">{k === 'cel' ? 'CEL condition' : 'Complexity tier'}</div>
                    <div className="text-[11px] text-ink-faint">{k === 'cel' ? 'header / model / capacity' : 'auto-classified difficulty'}</div>
                  </button>
                ))}
              </div>
            </div>
            {form.triggerKind === 'complexity' ? (
              <div>
                <span className="label">Tier</span>
                <select className="input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                  {['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wider text-ink-faint font-semibold flex items-center gap-1.5">
                      <Code2 size={13} /> Vollständiger CEL Rule Builder
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setCelGroup(parseExpression(form.celExpression).group)}>Parse text → visual</Button>
                  </div>
                  <WizardGroupEditor group={celGroup} onChange={applyCelGroup} />
                  <textarea
                    className="input font-mono text-[11px] h-20 resize-none"
                    value={form.celExpression}
                    onChange={(e) => setForm({ ...form, celExpression: e.target.value })}
                    placeholder={'headers["tier"] == "premium" && (model.contains("opus") || provider == "anthropic")'}
                  />
                  {validateCEL(form.celExpression).map((d, i) => (
                    <div key={i} className={`text-[10px] ${d.severity === 'error' ? 'text-neon-red' : 'text-neon-amber'}`}>
                      {d.severity}: {d.message}
                    </div>
                  ))}
                  <p className="text-[10px] text-ink-faint leading-relaxed">
                    Unterstützt verschachtelte AND/OR Gruppen wie Bifrost. Beim Erstellen wird die CEL automatisch in Condition-/AND-/OR-Nodes zerlegt.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="label">Quick field</span>
                    <select className="input" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}>
                      {['model', 'provider', 'request_type', 'header', 'param', 'budget_used', 'request_size', 'time_hour', 'team_name'].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="label">Operator</span>
                    <select className="input" value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })}>
                      {['==', '!=', '>', '<', '>=', '<=', 'contains', 'in'].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  {(form.field === 'header' || form.field === 'param') && (
                    <div>
                      <span className="label">Header/param name</span>
                      <input className="input" value={form.headerName} onChange={(e) => setForm({ ...form, headerName: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <span className="label">Value</span>
                    <input className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="premium" />
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, celExpression: quickCelExpression() })}>
                  <Wand2 size={13} /> Use quick condition
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Targets</span>
              <Button size="sm" variant="outline" onClick={() => setForm({ ...form, targets: [...form.targets, { provider: 'groq', model: 'llama-3.1-70b-versatile', weight: 0 }] })}>
                <Target size={13} /> Add target
              </Button>
            </div>
            {form.targets.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_80px_auto] gap-2 items-center">
                <input className="input text-xs" value={t.provider} onChange={(e) => updateT(i, { provider: e.target.value })} placeholder="provider" />
                <input className="input text-xs" value={t.model} onChange={(e) => updateT(i, { model: e.target.value })} placeholder="model" />
                <input type="number" step={0.1} min={0} max={1} className="input text-xs" value={t.weight} onChange={(e) => updateT(i, { weight: Number(e.target.value) })} title="weight" />
                <button onClick={() => setForm({ ...form, targets: form.targets.filter((_, j) => j !== i) })} className="text-ink-faint hover:text-neon-red p-1">
                  <ShieldAlert size={14} />
                </button>
              </div>
            ))}
            <p className="text-[11px] text-ink-faint">Weights feed the weighted-random selection. They should sum to 1.0.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Fallbacks (by position)</span>
              <Button size="sm" variant="outline" onClick={() => setForm({ ...form, fallbacks: [...form.fallbacks, { provider: '', model: '' }] })}>
                <ShieldAlert size={13} /> Add fallback
              </Button>
            </div>
            {form.fallbacks.length === 0 && <p className="text-xs text-ink-faint">No fallbacks. The rule will surface failures directly to the caller.</p>}
            {form.fallbacks.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input className="input text-xs" value={f.provider} onChange={(e) => updateF(i, { provider: e.target.value })} placeholder="provider" />
                <input className="input text-xs" value={f.model} onChange={(e) => updateF(i, { model: e.target.value })} placeholder="model" />
                <button onClick={() => setForm({ ...form, fallbacks: form.fallbacks.filter((_, j) => j !== i) })} className="text-ink-faint hover:text-neon-red p-1">
                  <ShieldAlert size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-2">
              <Row label="Name" value={form.name || 'Generated Rule'} />
              <Row label="Trigger" value={celExpression()} code />
              <Row label="Targets" value={form.targets.map((t) => `${t.provider}/${t.model} (${(t.weight * 100).toFixed(0)}%)`).join(', ')} />
              <Row label="Fallbacks" value={form.fallbacks.map((f) => `${f.provider}/${f.model}`).join(', ') || 'none'} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Chip tone="neon">1 trigger</Chip>
              <Chip tone="cyan">{form.targets.length} targets</Chip>
              <Chip tone="red">{form.fallbacks.length} fallbacks</Chip>
            </div>
          </div>
        )}
      </motion.div>
    </Modal>
  );

  function updateT(i: number, patch: any) {
    setForm({ ...form, targets: form.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  }
  function updateF(i: number, patch: any) {
    setForm({ ...form, fallbacks: form.fallbacks.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  }
}



function WizardGroupEditor({ group, onChange, depth = 0, onRemove }: { group: CELGroup; onChange: (g: CELGroup) => void; depth?: number; onRemove?: () => void }) {
  const setChild = (idx: number, next: CELCondition | CELGroup) => onChange({ ...group, conditions: group.conditions.map((c, i) => i === idx ? next : c) });
  const removeChild = (idx: number) => onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  return (
    <div className={`rounded-lg border border-border bg-canvas/40 p-2 space-y-2 ${depth ? 'ml-3' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['&&', '||'] as const).map((op) => <button key={op} type="button" onClick={() => onChange({ ...group, combinator: op })} className={`rounded px-2 py-1 text-[11px] border ${group.combinator === op ? 'border-neon bg-neon/10 text-neon' : 'border-border text-ink-muted'}`}>{op === '&&' ? 'AND' : 'OR'}</button>)}
        <button type="button" className="text-[11px] text-neon" onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition()] })}>+ condition</button>
        <button type="button" className="text-[11px] text-neon" onClick={() => onChange({ ...group, conditions: [...group.conditions, newGroup()] })}>+ group</button>
        {onRemove && <button type="button" className="ml-auto text-[11px] text-neon-red" onClick={onRemove}>remove group</button>}
      </div>
      {group.conditions.map((item, idx) => 'field' in item ? (
        <WizardConditionRow key={item.id} cond={item} onChange={(next) => setChild(idx, next)} onRemove={() => removeChild(idx)} />
      ) : (
        <WizardGroupEditor key={item.id} group={item} depth={depth + 1} onChange={(next) => setChild(idx, next)} onRemove={() => removeChild(idx)} />
      ))}
    </div>
  );
}

function WizardConditionRow({ cond, onChange, onRemove }: { cond: CELCondition; onChange: (c: CELCondition) => void; onRemove: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_0.8fr_1fr_auto] gap-1.5 items-center">
      <select className="input text-xs" value={cond.field} onChange={(e) => onChange({ ...cond, field: e.target.value as CELField })}>{Object.entries(CEL_FIELDS).map(([value, spec]) => <option key={value} value={value}>{spec.label}</option>)}</select>
      <select className="input text-xs" value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as CELComparison })}>{opsForField(cond.field).map((op) => <option key={op} value={op}>{op}</option>)}</select>
      <input className="input text-xs" value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder={cond.op === 'in' ? 'a, b, c' : 'value'} />
      <button type="button" className="text-ink-faint hover:text-neon-red" onClick={onRemove}>×</button>
      {(cond.field === 'header' || cond.field === 'param') && <input className="input text-xs col-span-2" value={cond.headerName ?? ''} onChange={(e) => onChange({ ...cond, headerName: e.target.value })} placeholder="header/param key" />}
      <label className="text-[10px] text-ink-faint flex items-center gap-1"><input type="checkbox" checked={!!cond.negate} onChange={(e) => onChange({ ...cond, negate: e.target.checked })} /> NOT</label>
    </div>
  );
}

function Row({ label, value, code }: { label: string; value: string; code?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`text-sm ${code ? 'font-mono text-neon' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
