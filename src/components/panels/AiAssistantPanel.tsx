import { AlertTriangle, Bot, CheckCircle2, Copy, GitCompare, LayoutTemplate, Paperclip, Send, Settings2, Sliders, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useAiAssistant } from '@/store/useAiAssistant';
import { useStore } from '@/store/useStore';
import { Button, Chip, EmptyState, Toggle } from '@/components/ui/primitives';
import { rulesToWorkflow, workflowToRules } from '@/lib/bifrostMapper';
import { mergeDraftRules, normalizeAiDraft } from '@/lib/aiDraft';
import { diffRules } from '@/lib/diff';
import { MarkdownMessage } from '@/components/ui/MarkdownMessage';
import { saveCustomTemplate } from '@/lib/customTemplates';

export function AiAssistantPanel() {
  const [input, setInput] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ai = useAiAssistant();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const providers = useStore((s) => s.providers);
  const modelCatalog = useStore((s) => s.modelCatalog);
  const diagnostics = useStore((s) => s.diagnostics);
  const sim = useStore((s) => s.sim);
  const showDiff = useStore((s) => s.showDiff);
  const closeDiff = useStore((s) => s.closeDiff);
  const setGraph = useStore((s) => s.setGraph);
  const setWizardOpen = useStore((s) => s.setWizardOpen);
  const setWizardDraft = useStore((s) => s.setWizardDraft);

  const allRules = useMemo(() => workflowToRules(nodes as any, edges), [nodes, edges]);
  const selectedRules = useMemo(() => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    return allRules.filter((r) => selectedIds.has(r.id) || nodes.some((n) => selectedIds.has(n.id) && ((n.data as any).ruleId === r.id)));
  }, [nodes, allRules]);

  const sendPrompt = async (content: string) => {
    if (!content.trim()) return;
    setInput('');
    await ai.sendMessage(content, { selectedRules, allRules, providers, modelCatalog, diagnostics, simulation: sim });
  };

  const send = async () => sendPrompt(input);

  const explainSelected = async () => {
    const base = selectedRules.length
      ? 'Explain the selected Bifrost routing rule(s), including CEL logic, targets, fallbacks, risks, and suggested tests. Do not create a draft unless I ask.'
      : 'No rule is selected. Explain how to select a rule and what information you need to analyze it.';
    await sendPrompt(base);
  };


  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const parts: string[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const lang = ext === 'yaml' || ext === 'yml' ? 'yaml' : ext === 'md' ? 'md' : ext === 'xml' ? 'xml' : ext === 'json' ? 'json' : 'text';
      parts.push(`Attached file: ${file.name}
\`\`\`${lang}
${text.slice(0, 20000)}
\`\`\``);
    }
    setInput((prev) => [prev, ...parts].filter(Boolean).join('\n\n'));
    if (fileRef.current) fileRef.current.value = '';
  };

  const copyMessage = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      // ignore, message remains visible for manual selection
    }
  };

  const normalizedDraft = useMemo(() => ai.lastDraftJson ? normalizeAiDraft(ai.lastDraftJson, allRules, providers, modelCatalog) : null, [ai.lastDraftJson, allRules, providers, modelCatalog]);
  const draftText = ai.lastDraftJson ? JSON.stringify(ai.lastDraftJson, null, 2) : '';
  const mergedRules = normalizedDraft ? mergeDraftRules(allRules, normalizedDraft.rules) : allRules;
  const draftDiffs = normalizedDraft ? diffRules(allRules, mergedRules).filter((d) => d.kind !== 'unchanged') : [];

  const applyDraftToCanvas = () => {
    if (!normalizedDraft || normalizedDraft.validation.errors.length) return;
    const { nodes: nextNodes, edges: nextEdges } = rulesToWorkflow(mergedRules);
    setGraph(nextNodes as any, nextEdges);
  };

  const previewDraft = () => {
    if (!normalizedDraft) return;
    showDiff({
      title: 'Diff: current canvas → AI draft',
      subtitle: `${normalizedDraft.rules.length} drafted rule(s). Review required before applying.`,
      diffs: diffRules(allRules, mergedRules),
      restoreLabel: 'Apply AI draft to canvas',
      onRestore: () => {
        applyDraftToCanvas();
        closeDiff();
      },
    });
  };

  const copyDraftJson = async () => {
    setCopyStatus(null);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(draftText);
      else {
        const ta = document.createElement('textarea');
        ta.value = draftText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyStatus('Copied');
    } catch (err) {
      // Last fallback: download a small JSON file so the user can still access it.
      const blob = new Blob([draftText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-draft.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCopyStatus('Clipboard blocked — downloaded JSON');
    }
    setTimeout(() => setCopyStatus(null), 1800);
  };

  const saveDraftAsTemplate = () => {
    setTemplateStatus(null);
    if (!normalizedDraft || normalizedDraft.validation.errors.length) return;
    const { nodes: tplNodes, edges: tplEdges } = rulesToWorkflow(normalizedDraft.rules);
    const name = normalizedDraft.rules.length === 1 ? normalizedDraft.rules[0].name : `AI Draft Pack (${normalizedDraft.rules.length} rules)`;
    saveCustomTemplate({
      id: `ai_tpl_${Date.now().toString(36)}`,
      name,
      description: normalizedDraft.explanation ?? `Generated by AI Assistant from ${normalizedDraft.rules.length} drafted rule(s).`,
      accent: '#a78bfa',
      nodes: tplNodes as any,
      edges: tplEdges,
      createdAt: new Date().toISOString(),
    });
    setTemplateStatus('Saved as template');
    setTimeout(() => setTemplateStatus(null), 2200);
  };


  const openDraftInWizard = () => {
    if (!normalizedDraft?.rules.length) return;
    setWizardDraft(normalizedDraft.rules[0]);
    setWizardOpen(true);
    ai.setOpen(false);
  };

  return (
    <div className="grid h-[78vh] min-h-0 grid-cols-1 gap-4 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-2/40">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <Bot size={16} className="text-neon" />
          <div className="text-sm font-semibold text-ink">AI Rule Assistant</div>
          <Chip tone={ai.enabled ? 'green' : 'red'}>{ai.enabled ? 'enabled' : 'disabled'}</Chip>
          <span className="ml-auto text-[10px] text-ink-faint">Context: {selectedRules.length} selected rules · {providers.length} providers · {modelCatalog.length} models</span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4">
          {ai.messages.length === 0 && <EmptyState icon={<Wand2 size={28} />} title="Ask for a routing rule" description="Example: Create a premium-user rule with OpenRouter primary and Gemini fallback. Drafts are review-only and never applied automatically." />}
          {ai.messages.map((m) => (
            <div key={m.id} className={`min-w-0 rounded-xl border px-3 py-2 ${m.role === 'user' ? 'ml-10 border-neon/30 bg-neon/10' : 'mr-10 border-border bg-canvas/70'}` }>
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-faint">
                <span>{m.role}</span>
                <button type="button" className="ml-auto rounded px-1 py-0.5 normal-case tracking-normal hover:bg-surface-2 hover:text-ink" onClick={() => void copyMessage(m.content)}>copy</button>
              </div>
              <MarkdownMessage text={m.content} />
            </div>
          ))}
          {ai.busy && (
            <div className="mr-10 rounded-xl border border-border bg-canvas/70 px-3 py-3">
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <span className="h-2 w-2 rounded-full bg-neon animate-pulse" />
                Assistant is thinking
                <span className="inline-flex gap-0.5"><span className="animate-bounce">.</span><span className="animate-bounce [animation-delay:120ms]">.</span><span className="animate-bounce [animation-delay:240ms]">.</span></span>
              </div>
            </div>
          )}
          {ai.error && <div className="rounded-lg border border-neon-red/30 bg-neon-red/10 px-3 py-2 text-xs text-neon-red break-words">{ai.error}</div>}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border p-3">
          {!ai.enabled && <div className="text-[11px] text-neon-amber">Enable and configure the assistant in Settings before sending.</div>}
          <div className="flex flex-wrap gap-1.5">
            {[
              'Create a new cost-aware routing rule with fallback.',
              'Explain the selected rule and point out risks.',
              'Optimize selected rules for high availability.',
              'Generate a Bifrost rule draft JSON only.',
            ].map((p) => <button key={p} type="button" onClick={() => setInput(p)} className="rounded-full border border-border px-2.5 py-1 text-[10px] text-ink-faint hover:text-neon hover:border-neon/40">{p}</button>)}
            <button type="button" onClick={() => void explainSelected()} disabled={ai.busy} className="rounded-full border border-neon/30 px-2.5 py-1 text-[10px] text-neon hover:bg-neon/10 disabled:opacity-40">Explain selected rule</button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Paperclip size={13} /> Attach</Button>
            <span className="text-[10px] text-ink-faint">.json .txt .md .xml .yaml</span>
            <input ref={fileRef} type="file" multiple accept=".json,.txt,.md,.xml,.yaml,.yml" className="hidden" onChange={(e) => void attachFiles(e.target.files)} />
          </div>
          <textarea className="input resize-none h-24" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Beschreibe die gewünschte Regel oder frage nach Optimierungen…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send(); }} />
          <div className="flex items-center gap-2">
            <Button onClick={() => void send()} disabled={ai.busy || !input.trim()}><Send size={14} /> {ai.busy ? 'Sending…' : 'Send'}</Button>
            <Button variant="ghost" onClick={ai.clearChat}><Trash2 size={14} /> Clear</Button>
            <span className="ml-auto text-[10px] text-ink-faint">Ctrl/Cmd+Enter to send</span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <button type="button" onClick={() => setContextOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-ink">
            <Settings2 size={15} /> Context sent to AI
            <span className="ml-auto text-[10px] text-ink-faint">{contextOpen ? 'hide' : 'show'}</span>
          </button>
          {contextOpen && (
            <div className="mt-3 space-y-3">
              <ContextToggle label="Selected rules" checked={ai.context.selectedRules} onChange={(v) => ai.setContext({ selectedRules: v })} detail={`${selectedRules.length} selected`} />
              <ContextToggle label="Provider/model catalog" checked={ai.context.providerModelCatalog} onChange={(v) => ai.setContext({ providerModelCatalog: v })} detail={`${providers.length}/${modelCatalog.length}`} />
              <ContextToggle label="Full canvas rules" checked={ai.context.fullCanvas} onChange={(v) => ai.setContext({ fullCanvas: v })} detail={`${allRules.length} rules`} />
              <ContextToggle label="Diagnostics" checked={ai.context.diagnostics} onChange={(v) => ai.setContext({ diagnostics: v })} detail={`${diagnostics.length} issues`} />
              <ContextToggle label="Last simulation" checked={ai.context.simulation} onChange={(v) => ai.setContext({ simulation: v })} detail={sim ? 'available' : 'none'} />
              <p className="text-[10px] text-ink-faint leading-relaxed">Default is privacy-conscious: selected rules plus provider/model catalog only.</p>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="mb-2 flex shrink-0 items-center gap-2 text-sm font-semibold text-ink">Draft review</div>
          <div className="min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          {ai.drafts.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">Draft history in this chat</div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {ai.drafts.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => ai.selectDraft(d.id)}
                    className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${ai.activeDraftId === d.id ? 'border-neon bg-neon/10 text-neon' : 'border-border bg-canvas/50 text-ink-muted hover:text-ink'}`}
                  >
                    <div className="truncate font-medium">{d.title}</div>
                    <div className="text-[10px] text-ink-faint">{new Date(d.createdAt).toLocaleTimeString()}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!ai.lastDraftJson || !normalizedDraft ? (
            <p className="text-xs text-ink-faint leading-relaxed">If the assistant returns a JSON rule draft, it appears here for validation, diff preview and explicit apply. No canvas changes are applied automatically.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Draft rules" value={normalizedDraft.rules.length} />
                <MiniStat label="Diffs" value={draftDiffs.length} />
                <div className="rounded-lg border border-border bg-canvas/50 px-2 py-1.5"><div className="text-[10px] text-ink-faint">Risk</div><div className={`text-lg font-semibold ${normalizedDraft.riskScore === 'high' ? 'text-neon-red' : normalizedDraft.riskScore === 'medium' ? 'text-neon-amber' : 'text-neon-green'}`}>{normalizedDraft.riskScore}</div></div>
              </div>

              {normalizedDraft.validation.errors.length > 0 && (
                <div className="rounded-lg border border-neon-red/30 bg-neon-red/10 p-2 text-xs text-neon-red">
                  <div className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle size={13} /> Validation errors</div>
                  <ul className="list-disc pl-4 space-y-0.5">{normalizedDraft.validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
              {normalizedDraft.validation.warnings.length > 0 && (
                <div className="rounded-lg border border-neon-amber/30 bg-neon-amber/10 p-2 text-xs text-neon-amber">
                  <div className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle size={13} /> Warnings</div>
                  <ul className="list-disc pl-4 space-y-0.5">{normalizedDraft.validation.warnings.slice(0, 5).map((w) => <li key={w}>{w}</li>)}</ul>
                </div>
              )}
              {normalizedDraft.riskReasons.length > 0 && (
                <div className="rounded-lg border border-border bg-canvas/60 p-2 text-xs text-ink-muted">
                  <div className="font-semibold mb-1 flex items-center gap-1 text-ink"><AlertTriangle size={13} /> Risk reasons</div>
                  <ul className="list-disc pl-4 space-y-0.5">{normalizedDraft.riskReasons.slice(0, 6).map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
              {normalizedDraft.validation.errors.length === 0 && (
                <div className="rounded-lg border border-neon-green/25 bg-neon-green/10 p-2 text-xs text-neon-green flex items-center gap-1.5"><CheckCircle2 size={13} /> Draft schema looks valid. Preview the diff before applying.</div>
              )}

              <pre className="max-h-[300px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-lg bg-canvas border border-border p-3 text-[11px] text-ink-muted">{draftText}</pre>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyDraftJson()}><Copy size={13} /> Copy JSON</Button>
                <Button size="sm" variant="outline" onClick={previewDraft}><GitCompare size={13} /> Preview diff</Button>
                <Button size="sm" variant="outline" onClick={saveDraftAsTemplate} disabled={normalizedDraft.validation.errors.length > 0}><LayoutTemplate size={13} /> Save template</Button>
                <Button size="sm" variant="outline" onClick={openDraftInWizard} disabled={normalizedDraft.validation.errors.length > 0 || normalizedDraft.rules.length === 0}><Sliders size={13} /> Open in Wizard</Button>
                <Button size="sm" variant="primary" onClick={applyDraftToCanvas} disabled={normalizedDraft.validation.errors.length > 0}>Apply to canvas</Button>
                <Chip tone="amber">explicit review required</Chip>
                {copyStatus && <span className="text-[11px] text-neon-green">{copyStatus}</span>}
                {templateStatus && <span className="text-[11px] text-neon-green">{templateStatus}</span>}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}


function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-canvas/50 px-2 py-1.5"><div className="text-[10px] text-ink-faint">{label}</div><div className="text-lg font-semibold text-ink">{value}</div></div>;
}

function ContextToggle({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (v: boolean) => void; detail: string }) {
  return <div className="flex items-center gap-3 rounded-lg border border-border bg-canvas/50 px-3 py-2"><Toggle checked={checked} onChange={onChange} /><span className="text-xs text-ink flex-1">{label}</span><span className="text-[10px] text-ink-faint">{detail}</span></div>;
}
