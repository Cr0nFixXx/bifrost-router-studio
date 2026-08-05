import type { ProviderConfig, RoutingRule, RoutingTarget } from '@/types/bifrost';
import { compileGroup, parseExpression, validateCEL } from '@/lib/cel';
import { createRuleUid, isRuleUid } from '@/lib/ruleIds';

export interface DraftValidation {
  errors: string[];
  warnings: string[];
}

export interface NormalizedAiDraft {
  rules: RoutingRule[];
  explanation?: string;
  risks: string[];
  riskScore: 'low' | 'medium' | 'high';
  riskReasons: string[];
  validation: DraftValidation;
}

const scopes = new Set(['global', 'customer', 'team', 'virtual_key']);

function asObject(v: unknown): Record<string, any> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null;
}

function normalizeTarget(raw: any): RoutingTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const provider = typeof raw.provider === 'string' ? raw.provider.trim() : undefined;
  const model = typeof raw.model === 'string' ? raw.model.trim() : undefined;
  const api_key = typeof raw.api_key === 'string' ? raw.api_key.trim() : typeof raw.key_id === 'string' ? raw.key_id.trim() : undefined;
  const weight = Number(raw.weight ?? 1);
  if (!provider && !model) return null;
  return { provider, model, ...(api_key ? { api_key } : {}), weight: Number.isFinite(weight) ? weight : 1 };
}

function normalizeFallback(raw: any): string | null {
  if (typeof raw === 'string') return raw.trim() || null;
  if (raw && typeof raw === 'object') {
    const provider = typeof raw.provider === 'string' ? raw.provider.trim() : '';
    const model = typeof raw.model === 'string' ? raw.model.trim() : '';
    return [provider, model].filter(Boolean).join('/') || null;
  }
  return null;
}

function decodeAiText(expr: string): string {
  return String(expr ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[([^\]]+)\]\([^\s)]+\)/g, '$1')
    .trim();
}

function normalizeAiCel(expr: string): string {
  let s = decodeAiText(expr);
  s = s.replace(/\brequest\.headers\s*\[/g, 'headers[');
  s = s.replace(/\brequest\.params\s*\[/g, 'params[');
  s = s.replace(/\brequest\.model\b/g, 'model');
  s = s.replace(/\brequest\.provider\b/g, 'provider');
  s = s.replace(/\brequest\.body\.max_tokens\b/g, 'tokens_used');
  s = s.replace(/\bint\(([^()]+)\)/g, '$1');
  s = s.replace(/has\(\s*request\.body\.messages\s*\)\s*&&\s*size\(\s*request\.body\.messages\s*\)\s*>\s*0/g, 'request_size > 0');
  s = s.replace(/size\(\s*request\.body\.messages\s*\)\s*>\s*0/g, 'request_size > 0');
  s = s.replace(/\brequest\.body\.stream\s*==\s*false\b/g, 'params["stream"] == "false"');
  s = s.replace(/\brequest\.body\.stream\s*==\s*true\b/g, 'params["stream"] == "true"');
  s = s.replace(/\brequest\.url\.path\s*==\s*['"]\/v1\/chat\/completions['"]/g, 'request_type == "chat_completion"');
  s = s.replace(/\brequest\.url\.path\s*==\s*['"]\/v1\/responses['"]/g, 'request_type == "responses"');
  const parsed = parseExpression(s);
  return parsed.warnings.length === 0 ? compileGroup(parsed.group) : s;
}

function compileStructuredLogic(rawConditions: unknown, rawLogic: unknown, warnings: string[], ruleName: string): string | null {
  const conditions = asObject(rawConditions);
  const logic = asObject(rawLogic);
  if (!conditions || !logic) return null;
  warnings.push(`${ruleName}: converted non-standard AI conditions/logic schema into cel_expression.`);
  const compileRef = (ref: unknown): string => {
    if (typeof ref !== 'string') return compileNode(ref);
    const expr = conditions[ref];
    if (typeof expr !== 'string') {
      warnings.push(`${ruleName}: logic references unknown condition id "${ref}".`);
      return 'true';
    }
    return normalizeAiCel(expr);
  };
  const compileNode = (node: unknown): string => {
    if (typeof node === 'string') return compileRef(node);
    const obj = asObject(node);
    if (!obj) return 'true';
    const op = String(obj.operator ?? obj.op ?? obj.combinator ?? 'and').toLowerCase();
    const rules = Array.isArray(obj.rules) ? obj.rules : Array.isArray(obj.conditions) ? obj.conditions : [];
    if (op === 'not') {
      const inner = rules.length === 1 ? compileNode(rules[0]) : rules.map(compileNode).join(' && ');
      return `!(${inner || 'true'})`;
    }
    const joiner = op === 'or' || op === '||' ? ' || ' : ' && ';
    const parts = rules.map(compileNode).filter(Boolean);
    if (parts.length === 0) return 'true';
    return parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`;
  };
  return compileNode(logic).replace(/^\((.*)\)$/s, '$1');
}

function extractRules(input: unknown): { rules: any[]; explanation?: string; risks: string[] } {
  const obj = asObject(input);
  if (!obj) return { rules: [], risks: [] };
  const rules = Array.isArray(obj.rules)
    ? obj.rules
    : Array.isArray(obj.routing_rules)
      ? obj.routing_rules
      : Array.isArray(obj?.governance?.routing_rules)
        ? obj.governance.routing_rules
        : (obj.name || obj.cel_expression || obj.targets) ? [obj] : [];
  const risks = Array.isArray(obj.risks) ? obj.risks.map(String) : [];
  return { rules, explanation: typeof obj.explanation === 'string' ? obj.explanation : undefined, risks };
}


function assessRisk(rules: RoutingRule[], warnings: string[], declaredRisks: string[]): { riskScore: 'low' | 'medium' | 'high'; riskReasons: string[] } {
  const reasons = new Set<string>();
  declaredRisks.forEach((r) => reasons.add(r));
  warnings.forEach((w) => reasons.add(w));
  for (const r of rules) {
    if (!r.fallbacks.length) reasons.add(`${r.name}: no fallback chain.`);
    if (r.chain_rule) reasons.add(`${r.name}: chain_rule enabled; verify re-evaluation behaviour.`);
    if (r.scope === 'global') reasons.add(`${r.name}: global scope can affect all traffic.`);
    if (r.cel_expression === 'true') reasons.add(`${r.name}: matches every request.`);
    if (r.cel_expression.length > 240 || (r.cel_expression.match(/\|\|/g)?.length ?? 0) >= 3) reasons.add(`${r.name}: complex/broad CEL expression.`);
    if (r.targets.length > 3) reasons.add(`${r.name}: many weighted targets; check cost and availability assumptions.`);
  }
  const count = reasons.size;
  return { riskScore: count >= 5 ? 'high' : count >= 2 ? 'medium' : 'low', riskReasons: [...reasons].slice(0, 12) };
}

export function normalizeAiDraft(input: unknown, existingRules: RoutingRule[] = [], providers: ProviderConfig[] = [], modelCatalog: Array<{ id: string; provider?: string; label?: string; model?: string }> = []): NormalizedAiDraft {
  const { rules: rawRules, explanation, risks } = extractRules(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const providerIds = new Set(providers.flatMap((p) => [p.id, p.type].filter(Boolean)));
  const modelIds = new Set(modelCatalog.flatMap((m) => [m.id, m.model, m.label].filter(Boolean) as string[]));
  const existingByName = new Map(existingRules.map((r) => [r.name.toLowerCase(), r]));
  const used = new Set(existingRules.map((r) => r.id));
  const nextPriority = existingRules.length ? Math.max(...existingRules.map((r) => r.priority ?? 0)) + 1 : 0;

  const out: RoutingRule[] = [];
  rawRules.forEach((r, idx) => {
    const obj = asObject(r);
    if (!obj) {
      errors.push(`Rule #${idx + 1} is not an object.`);
      return;
    }
    const name = String(obj.name ?? obj.label ?? `AI Draft Rule ${idx + 1}`).trim();
    const matchedExisting = existingByName.get(name.toLowerCase());
    let id = matchedExisting?.id ?? (isRuleUid(obj.id) ? String(obj.id) : createRuleUid());
    if (used.has(id) && !matchedExisting) id = createRuleUid();
    used.add(id);
    const structuredCel = compileStructuredLogic(obj.conditions, obj.logic, warnings, name);
    const rawCel = structuredCel ?? (String(obj.cel_expression ?? obj.cel ?? 'true').trim() || 'true');
    const cel = normalizeAiCel(rawCel);
    if (!structuredCel && cel !== rawCel) warnings.push(`${name}: normalized AI CEL into Bifrost-compatible field names.`);
    const celErrors = validateCEL(cel).filter((d) => d.severity === 'error');
    if (celErrors.length) errors.push(`${name}: invalid CEL: ${celErrors.map((e) => e.message).join(', ')}`);
    const rawTargets = Array.isArray(obj.targets) ? obj.targets : obj.target ? [obj.target] : [];
    if (!Array.isArray(obj.targets) && obj.target) warnings.push(`${name}: non-standard singular target converted to targets[].`);
    const targets = rawTargets.map(normalizeTarget).filter(Boolean) as RoutingTarget[];
    if (targets.length === 0) errors.push(`${name}: no targets provided.`);
    const sum = targets.reduce((acc, t) => acc + Number(t.weight ?? 0), 0);
    if (targets.length && Math.abs(sum - 1) > 0.001) {
      if (sum > 0) {
        targets.forEach((t) => { t.weight = Number((Number(t.weight ?? 0) / sum).toFixed(6)); });
        const normalizedSum = targets.reduce((acc, t) => acc + Number(t.weight ?? 0), 0);
        if (targets.length > 0 && Math.abs(normalizedSum - 1) > 0.000001) {
          targets[targets.length - 1].weight = Number((Number(targets[targets.length - 1].weight ?? 0) + (1 - normalizedSum)).toFixed(6));
        }
      } else {
        const equal = Number((1 / targets.length).toFixed(6));
        targets.forEach((t) => { t.weight = equal; });
        const normalizedSum = targets.reduce((acc, t) => acc + Number(t.weight ?? 0), 0);
        targets[targets.length - 1].weight = Number((Number(targets[targets.length - 1].weight ?? 0) + (1 - normalizedSum)).toFixed(6));
      }
    }
    for (const t of targets) {
      if (t.provider && providerIds.size && !providerIds.has(t.provider)) warnings.push(`${name}: provider "${t.provider}" is not in the configured provider catalog.`);
      if (t.model && modelIds.size && !modelIds.has(t.model)) warnings.push(`${name}: model "${t.model}" is not in the current model catalog.`);
    }
    const fallbacks = (Array.isArray(obj.fallbacks) ? obj.fallbacks : []).map(normalizeFallback).filter(Boolean) as string[];
    const scopeRaw = String(obj.scope ?? 'global');
    const scope = scopes.has(scopeRaw) ? scopeRaw as RoutingRule['scope'] : 'global';
    if (scope !== scopeRaw) warnings.push(`${name}: unknown scope "${scopeRaw}" normalized to global.`);
    if (scope !== 'global' && !obj.scope_id) warnings.push(`${name}: non-global scope has no scope_id.`);

    out.push({
      id,
      name,
      description: typeof obj.description === 'string' ? obj.description : explanation,
      enabled: obj.enabled !== false,
      chain_rule: !!obj.chain_rule,
      cel_expression: cel,
      targets,
      fallbacks,
      scope,
      scope_id: obj.scope_id ?? null,
      priority: Number.isFinite(Number(obj.priority)) ? Number(obj.priority) : nextPriority + idx,
    });
  });

  if (!rawRules.length) errors.push('No rules found in AI draft. Expected { "rules": [...] } or a single rule object.');
  const assessed = assessRisk(out, warnings, risks);
  return { rules: out, explanation, risks, ...assessed, validation: { errors, warnings } };
}

export function mergeDraftRules(existing: RoutingRule[], draft: RoutingRule[]): RoutingRule[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of draft) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}
