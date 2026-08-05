/**
 * Convert Studio/CEL conditions into Bifrost's react-querybuilder `query` JSON.
 *
 * Bifrost evaluates `cel_expression` at runtime, but the management UI uses the
 * optional `routing_rules.query` builder state to populate the visual editor.
 */
import type { CELCondition, CELGroup, CELComparison, CELField } from '@/types/bifrost';
import { parseExpression } from '@/lib/cel';

export interface BifrostQueryRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueSource: 'value';
}

export interface BifrostQueryGroup {
  id: string;
  combinator: 'and' | 'or';
  rules: Array<BifrostQueryRule | BifrostQueryGroup>;
  not?: boolean;
}

type QueryNode = BifrostQueryRule | BifrostQueryGroup;

function qid(prefix = 'q'): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const OPERATOR_MAP: Record<CELComparison, string> = {
  '==': '=',
  '!=': '!=',
  '>': '>',
  '<': '<',
  '>=': '>=',
  '<=': '<=',
  in: 'in',
  startsWith: 'beginsWith',
  endsWith: 'endsWith',
  contains: 'contains',
  matches: 'matches',
};

const FIELD_MAP: Record<CELField, string> = {
  model: 'model',
  provider: 'provider',
  request_type: 'request_type',
  header: 'headers',
  param: 'params',
  team_name: 'team_name',
  customer_id: 'customer_id',
  virtual_key_name: 'virtual_key_name',
  budget_used: 'budget_used',
  tokens_used: 'tokens_used',
  request: 'request',
  request_size: 'request_size',
  time_hour: 'time.hour',
  complexity_tier: 'complexity_tier',
};

function queryValue(c: CELCondition): string {
  const value = String(c.value ?? '');
  if (c.field === 'header' || c.field === 'param') return `${c.headerName ?? ''}:${value}`;
  return value;
}

export function conditionToBifrostQuery(c: CELCondition): QueryNode {
  const rule: BifrostQueryRule = {
    id: qid('cond'),
    field: FIELD_MAP[c.field] ?? c.field,
    operator: OPERATOR_MAP[c.op] ?? c.op,
    value: queryValue(c),
    valueSource: 'value',
  };
  if (!c.negate) return rule;
  return { id: qid('not'), combinator: 'and', not: true, rules: [rule] };
}

export function groupToBifrostQuery(group: CELGroup): BifrostQueryGroup {
  return {
    id: qid('grp'),
    combinator: group.combinator === '||' ? 'or' : 'and',
    rules: group.conditions.map((item) => ('field' in item ? conditionToBifrostQuery(item) : groupToBifrostQuery(item))),
  };
}

/** Returns a query-builder object, or null if the CEL is unsupported by parser. */
export function celToBifrostQueryObject(celExpression: string): BifrostQueryGroup | null {
  const src = (celExpression ?? '').trim();
  if (!src || src === 'true') return { id: qid('grp'), combinator: 'and', rules: [] };
  const parsed = parseExpression(src);
  if (parsed.warnings.length > 0) return null;
  return groupToBifrostQuery(parsed.group);
}

/** Returns JSON text suitable for the SQLite `routing_rules.query` TEXT column. */
export function celToBifrostQuery(celExpression: string): string | null {
  const obj = celToBifrostQueryObject(celExpression);
  return obj ? JSON.stringify(obj) : null;
}

export function isUsableBifrostQuery(raw: unknown): boolean {
  if (!raw) return false;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!obj && typeof obj === 'object' && typeof (obj as any).combinator === 'string' && Array.isArray((obj as any).rules);
  } catch {
    return false;
  }
}
