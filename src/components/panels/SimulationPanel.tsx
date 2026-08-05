/**
 * Simulation playground. Runs the mock request traversal and shows the routed
 * path step-by-step: matched trigger, probabilistically-selected target, and
 * any fallbacks that fired (or failed).
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, RotateCcw, CheckCircle2, XCircle, Clock, ArrowRight, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button, EmptyState } from '@/components/ui/primitives';

const STATUS_TONE: Record<string, string> = {
  pending: 'text-ink-faint',
  current: 'text-neon',
  done: 'text-neon-green',
  fail: 'text-neon-red',
};

function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function parseHeaders(text: string): { headers: Record<string, string>; invalid: string[] } {
  const headers: Record<string, string> = {};
  const invalid: string[] = [];
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const idx = line.indexOf(':');
    if (idx < 1) {
      invalid.push(line);
      return;
    }
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return { headers, invalid };
}

export function SimulationPanel() {
  const run = useStore((s) => s.runSimulation);
  const clear = useStore((s) => s.clearSimulation);
  const sim = useStore((s) => s.sim);
  const running = useStore((s) => s.simRunning);
  const input = useStore((s) => s.simInput);
  const playbackIndex = useStore((s) => s.simPlaybackIndex);
  const setInput = useStore((s) => s.setSimInput);
  const resetInput = useStore((s) => s.resetSimInput);
  const rules = useStore((s) => s.getCanvasRules());
  const [headersText, setHeadersText] = useState(() => formatHeaders(input.headers));
  const [invalidHeaderLines, setInvalidHeaderLines] = useState<string[]>([]);

  useEffect(() => {
    setHeadersText(formatHeaders(input.headers));
  }, [input.headers]);

  const commitHeaders = () => {
    const parsed = parseHeaders(headersText);
    setInvalidHeaderLines(parsed.invalid);
    setInput({ headers: parsed.headers });
    return parsed;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Playground</div>
          <div className="text-sm font-semibold text-ink">Request Simulation</div>
        </div>
        <div className="flex gap-1.5">
          {sim && (
            <button onClick={clear} className="text-ink-faint hover:text-ink p-1.5" title="Clear">
              <RotateCcw size={16} />
            </button>
          )}
          <Button size="sm" onClick={() => { commitHeaders(); run(); }}>
            <Play size={13} /> {running ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-surface-2/50 border border-border p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-faint font-semibold">
          <SlidersHorizontal size={13} /> Request playground
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PlayField label="Provider" value={input.provider} onChange={(v) => setInput({ provider: v })} />
          <PlayField label="Model" value={input.model} onChange={(v) => setInput({ model: v })} />
          <PlaySelect label="Request type" value={input.request_type} onChange={(v) => setInput({ request_type: v })} options={['chat_completion', 'text_completion', 'responses', 'embedding', 'speech', 'transcription', 'translation', 'image_generation', 'moderation']} />
          <PlaySelect label="Complexity" value={input.complexity_tier} onChange={(v) => setInput({ complexity_tier: v })} options={['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING']} />
          <PlayField label="Team" value={input.team_name} onChange={(v) => setInput({ team_name: v })} />
          <PlayField label="Customer" value={input.customer_id} onChange={(v) => setInput({ customer_id: v })} />
          <PlayNumber label="Budget %" value={input.budget_used} onChange={(v) => setInput({ budget_used: v })} />
          <PlayNumber label="Tokens" value={input.tokens_used} onChange={(v) => setInput({ tokens_used: v })} />
        </div>
        <div>
          <label className="text-[10px] text-ink-faint">Headers, one per line: <code>key: value</code></label>
          <textarea
            className="input text-xs font-mono h-20 resize-none mt-1"
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            onBlur={commitHeaders}
            placeholder={'user-agent: claude-cli\nx-tier: premium'}
          />
          {invalidHeaderLines.length > 0 && (
            <div className="mt-1 text-[10px] text-neon-amber">
              Ignored header line(s) without <code>:</code>: {invalidHeaderLines.join(', ')}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" checked={input.forcePrimaryFailure} onChange={(e) => setInput({ forcePrimaryFailure: e.target.checked })} className="accent-neon" />
            Force primary failure to test fallbacks
          </label>
          <button onClick={() => { resetInput(); setInvalidHeaderLines([]); }} className="text-[11px] text-ink-faint hover:text-ink">Reset</button>
        </div>
      </div>

      {!sim && !running && (
        <EmptyState
          icon={<Play size={28} />}
          title="Run a dry pass"
          description="Watch a mock request travel through your rule chain and see which provider/model it would resolve to."
        />
      )}

      {running && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-2/60 animate-pulse" />
          ))}
        </div>
      )}

      <AnimatePresence>
        {sim && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={<Clock size={13} />} label="Latency" value={`${sim.elapsedMs.toFixed(1)}ms`} />
              <Stat icon={sim.matched ? <CheckCircle2 size={13} /> : <XCircle size={13} />} label="Matched" value={sim.matched ? 'yes' : 'no'} tone={sim.matched ? 'green' : 'red'} />
              <Stat icon={<ArrowRight size={13} />} label="Outcome" value={sim.chosenTarget ? 'routed' : 'default'} />
            </div>

            {/* Path */}
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">Routing path</div>
              <div className="space-y-1.5">
                {sim.path.map((step, i) => {
                  const revealed = i <= playbackIndex;
                  const current = i === playbackIndex;
                  return (
                  <motion.div
                    key={step.nodeId + i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: revealed ? 1 : 0.35, x: 0, scale: current ? 1.02 : 1 }}
                    transition={{ duration: 0.22 }}
                    className={`flex items-center gap-2.5 text-xs rounded-md px-1.5 py-1 ${current ? 'bg-neon/10 ring-1 ring-neon/25' : ''}`}
                  >
                    <span className={`grid place-items-center h-5 w-5 rounded-full ${step.status === 'done' ? 'bg-neon-green/15' : step.status === 'fail' ? 'bg-neon-red/15' : step.status === 'current' ? 'bg-neon/15' : 'bg-surface-3'}`}>
                      {step.status === 'done' ? (
                        <CheckCircle2 size={12} className="text-neon-green" />
                      ) : step.status === 'fail' ? (
                        <XCircle size={12} className="text-neon-red" />
                      ) : (
                        <span className={`h-1.5 w-1.5 rounded-full ${step.status === 'current' ? 'bg-neon' : 'bg-ink-faint'}`} />
                      )}
                    </span>
                    <span className={`font-medium ${STATUS_TONE[step.status]}`}>{step.label}</span>
                    {step.note && <span className="text-ink-faint truncate">· {step.note}</span>}
                  </motion.div>
                  );
                })}
              </div>
            </div>

            {sim.fallbacksTried.length > 0 && (
              <div className="rounded-lg bg-neon-amber/10 border border-neon-amber/20 px-3 py-2 flex items-center gap-2 text-xs text-neon-amber">
                <AlertTriangle size={14} />
                {sim.fallbacksTried.length} fallback(s) engaged: {sim.fallbacksTried.join(' → ')}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlayField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-ink-faint">{label}</span>
      <input className="input text-xs mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function PlayNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-ink-faint">{label}</span>
      <input type="number" className="input text-xs mt-1" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function PlaySelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-ink-faint">{label}</span>
      <select className="input text-xs mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'green' | 'red' }) {
  const c = tone === 'green' ? 'text-neon-green' : tone === 'red' ? 'text-neon-red' : 'text-ink';
  return (
    <div className="rounded-lg bg-surface-2/60 border border-border px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-ink-faint">
        {icon} {label}
      </div>
      <div className={`text-sm font-semibold ${c}`}>{value}</div>
    </div>
  );
}
