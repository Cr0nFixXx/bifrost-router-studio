import { create } from 'zustand';
import type { Diagnostic } from '@/lib/validation';
import type { ProviderConfig, RoutingRule } from '@/types/bifrost';
import systemPrompt from '@/lib/ai/systemPrompt.md?raw';

export type AiProviderKind = 'openai-compatible';
export type AiRole = 'user' | 'assistant' | 'system';

export interface AiMessage {
  id: string;
  role: AiRole;
  content: string;
  createdAt: string;
}

export interface AiDraftRecord {
  id: string;
  messageId: string;
  createdAt: string;
  json: unknown;
  title: string;
}

export interface AiContextOptions {
  selectedRules: boolean;
  providerModelCatalog: boolean;
  fullCanvas: boolean;
  diagnostics: boolean;
  simulation: boolean;
}

export interface AiRequestContext {
  selectedRules: RoutingRule[];
  allRules?: RoutingRule[];
  providers?: ProviderConfig[];
  modelCatalog?: Array<{ id: string; provider?: string; label?: string; model?: string }>;
  diagnostics?: Diagnostic[];
  simulation?: unknown;
}

interface AiAssistantState {
  enabled: boolean;
  open: boolean;
  providerKind: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  rememberApiKey: boolean;
  temperature: number;
  maxTokens: number;
  context: AiContextOptions;
  messages: AiMessage[];
  busy: boolean;
  error: string | null;
  lastDraftJson: unknown | null;
  drafts: AiDraftRecord[];
  activeDraftId: string | null;
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  testMessage: string | null;
  load: () => void;
  persist: () => void;
  setOpen: (open: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setProviderSettings: (patch: Partial<Pick<AiAssistantState, 'baseUrl' | 'model' | 'apiKey' | 'rememberApiKey' | 'temperature' | 'maxTokens'>>) => void;
  setContext: (patch: Partial<AiContextOptions>) => void;
  clearChat: () => void;
  selectDraft: (id: string) => void;
  testConnection: () => Promise<boolean>;
  sendMessage: (content: string, context: AiRequestContext) => Promise<void>;
}

const KEY = 'bfrs-ai-assistant-v1';
let activeAbort: AbortController | null = null;
let chatGeneration = 0;

const defaultContext: AiContextOptions = {
  selectedRules: true,
  providerModelCatalog: true,
  fullCanvas: false,
  diagnostics: false,
  simulation: false,
};

const sys = systemPrompt;

function id() {
  return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter(Boolean) as string[];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return null;
}

function draftTitle(json: unknown): string {
  const obj = json && typeof json === 'object' ? json as any : null;
  const rules = Array.isArray(obj?.rules) ? obj.rules : Array.isArray(obj?.routing_rules) ? obj.routing_rules : obj?.name ? [obj] : [];
  if (rules.length === 1) return String(rules[0]?.name ?? '1 rule draft');
  if (rules.length > 1) return `${rules.length} rule drafts`;
  return 'JSON draft';
}

function addDraftFromText(messageId: string, text: string): Partial<AiAssistantState> {
  const json = extractJson(text);
  if (!json) return { lastDraftJson: null, activeDraftId: null };
  const rec: AiDraftRecord = { id: id(), messageId, createdAt: new Date().toISOString(), json, title: draftTitle(json) };
  return { lastDraftJson: json, activeDraftId: rec.id, drafts: [rec, ...useAiAssistant.getState().drafts].slice(0, 30) };
}

function parseOpenAIStreamChunk(raw: string): string {
  let out = '';
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const json = JSON.parse(data);
      out += json?.choices?.[0]?.delta?.content ?? '';
    } catch {
      // Some non-standard endpoints may emit plain text data chunks.
      out += data;
    }
  }
  return out;
}

export const useAiAssistant = create<AiAssistantState>((set, get) => ({
  enabled: false,
  open: false,
  providerKind: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  rememberApiKey: false,
  temperature: 0.2,
  maxTokens: 2500,
  context: defaultContext,
  messages: [],
  busy: false,
  error: null,
  lastDraftJson: null,
  drafts: [],
  activeDraftId: null,
  testStatus: 'idle',
  testMessage: null,
  load: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const v = JSON.parse(raw);
      set({
        enabled: !!v.enabled,
        baseUrl: v.baseUrl ?? 'https://api.openai.com/v1',
        model: v.model ?? 'gpt-4o-mini',
        rememberApiKey: !!v.rememberApiKey,
        apiKey: v.rememberApiKey ? (v.apiKey ?? '') : '',
        temperature: Number(v.temperature ?? 0.2),
        maxTokens: Number(v.maxTokens ?? 2500),
        context: { ...defaultContext, ...(v.context ?? {}) },
      });
    } catch { /* ignore */ }
  },
  persist: () => {
    try {
      const s = get();
      localStorage.setItem(KEY, JSON.stringify({
        enabled: s.enabled,
        baseUrl: s.baseUrl,
        model: s.model,
        rememberApiKey: s.rememberApiKey,
        apiKey: s.rememberApiKey ? s.apiKey : '',
        temperature: s.temperature,
        maxTokens: s.maxTokens,
        context: s.context,
      }));
    } catch { /* ignore */ }
  },
  setOpen: (open) => set({ open }),
  setEnabled: (enabled) => { set({ enabled }); get().persist(); },
  setProviderSettings: (patch) => { set(patch); get().persist(); },
  setContext: (patch) => { set({ context: { ...get().context, ...patch } }); get().persist(); },
  clearChat: () => {
    chatGeneration += 1;
    activeAbort?.abort();
    activeAbort = null;
    set({ messages: [], drafts: [], activeDraftId: null, lastDraftJson: null, error: null, busy: false });
  },
  selectDraft: (id) => {
    const draft = get().drafts.find((d) => d.id === id);
    if (draft) set({ activeDraftId: id, lastDraftJson: draft.json });
  },
  testConnection: async () => {
    const state = get();
    set({ testStatus: 'testing', testMessage: null });
    try {
      if (!state.enabled) throw new Error('AI Assistant is disabled.');
      if (!state.baseUrl.trim()) throw new Error('Missing AI base URL.');
      const res = await fetch(`${state.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(state.apiKey ? { authorization: `Bearer ${state.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: state.model,
          temperature: 0,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with OK only.' }],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      set({ testStatus: 'ok', testMessage: 'Connection OK.' });
      return true;
    } catch (err) {
      set({ testStatus: 'error', testMessage: (err as Error).message });
      return false;
    }
  },
  sendMessage: async (content, ctx) => {
    activeAbort?.abort();
    activeAbort = new AbortController();
    const requestGeneration = ++chatGeneration;
    const state = get();
    const user: AiMessage = { id: id(), role: 'user', content, createdAt: new Date().toISOString() };
    const assistantId = id();
    const assistantSeed: AiMessage = { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() };
    set({ messages: [...state.messages, user, assistantSeed], busy: true, error: null, lastDraftJson: null, activeDraftId: null });
    const stillCurrent = () => requestGeneration === chatGeneration && !!get().messages.find((m) => m.id === assistantId);
    const appendAssistant = (chunk: string) => {
      if (!chunk || !stillCurrent()) return;
      set({ messages: get().messages.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m) });
    };
    try {
      if (!state.enabled) throw new Error('AI Assistant is disabled in settings.');
      if (!state.baseUrl.trim()) throw new Error('Missing AI base URL.');
      const url = `${state.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const contextPayload: Record<string, unknown> = {};
      if (state.context.selectedRules) contextPayload.selectedRules = ctx.selectedRules;
      if (state.context.fullCanvas) contextPayload.allRules = ctx.allRules;
      if (state.context.providerModelCatalog) {
        contextPayload.providers = ctx.providers;
        contextPayload.modelCatalog = ctx.modelCatalog;
      }
      if (state.context.diagnostics) contextPayload.diagnostics = ctx.diagnostics;
      if (state.context.simulation) contextPayload.simulation = ctx.simulation;

      const res = await fetch(url, {
        signal: activeAbort.signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(state.apiKey ? { authorization: `Bearer ${state.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: state.model,
          temperature: state.temperature,
          max_tokens: state.maxTokens,
          stream: true,
          messages: [
            { role: 'system', content: sys },
            { role: 'system', content: 'Answer the latest user message. Do not repeat your previous assistant response unless the user explicitly asks you to repeat it.' },
            { role: 'system', content: `Context JSON:\n${JSON.stringify(contextPayload, null, 2)}` },
            ...[...state.messages.filter((m) => m.role !== 'system' && m.content.trim()).slice(-10), user]
              .map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      if (!stillCurrent()) return;

      let full = '';
      const contentType = res.headers.get('content-type') ?? '';
      if (res.body && (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson') || !contentType.includes('application/json'))) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (!stillCurrent()) { try { await reader.cancel(); } catch { /* ignore */ } return; }
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const chunk = parseOpenAIStreamChunk(part);
            full += chunk;
            appendAssistant(chunk);
          }
        }
        const tail = parseOpenAIStreamChunk(buffer);
        full += tail;
        appendAssistant(tail);
      } else {
        const json = await res.json();
        full = json?.choices?.[0]?.message?.content ?? json?.message?.content ?? '';
        appendAssistant(String(full));
      }
      if (!stillCurrent()) return;
      const currentText = get().messages.find((m) => m.id === assistantId)?.content || full;
      set({ ...addDraftFromText(assistantId, currentText), busy: false });
      if (requestGeneration === chatGeneration) activeAbort = null;
    } catch (err) {
      if ((err as Error).name === 'AbortError' || !stillCurrent()) return;
      const msg = (err as Error).message;
      set({
        error: msg,
        busy: false,
        messages: get().messages.map((m) => m.id === assistantId && !m.content ? { ...m, content: `Error: ${msg}` } : m),
      });
      if (requestGeneration === chatGeneration) activeAbort = null;
    }
  },
}));
