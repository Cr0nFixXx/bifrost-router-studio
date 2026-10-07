/** Shared Bifrost types used across the client (UI, store, DB layer). */

export type RuleScope = 'global' | 'customer' | 'team' | 'virtual_key';

export interface RoutingTarget {
  provider?: string;
  model?: string;
  api_key?: string;
  weight: number;
}

/**
 * Fallback entry, Bifrost >= 2.2.3. Legacy form is the string `"provider/model"`
 * (`"provider/"` keeps the incoming model). The object form additionally pins a
 * provider key. Pinning requires Bifrost 2.2.3+ — earlier releases fail to
 * decode the row and disable all routing rules.
 * config.json uses `provider_key_name` instead of `key_id`.
 */
export interface RoutingFallbackObject {
  provider: string;
  model?: string;
  key_id?: string;
  /** config.json alias for `key_id`, resolved to a key id when the config loads. Accepted on import. */
  provider_key_name?: string;
}

export type RoutingFallback = string | RoutingFallbackObject;

export type TriggerKind =
  | 'cel'
  | 'provider'
  | 'model'
  | 'http-header'
  | 'request_type'
  | 'complexity';

export type ComplexityTier = 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'REASONING';

export interface RoutingRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  chain_rule: boolean;
  cel_expression: string;
  targets: RoutingTarget[];
  fallbacks: RoutingFallback[];
  scope: RuleScope;
  scope_id?: string | null;
  priority: number;
  created_at?: string;
  updated_at?: string;
}

/* Bifrost management API (/api/routing/rules) ---------------------------- */

/** Target as the management API speaks it: `key_id` instead of the DB's `api_key`. */
export interface ApiTarget {
  provider?: string | null;
  model?: string | null;
  key_id?: string | null;
  weight: number;
}

/**
 * Body accepted by POST /api/routing/rules. `scope` is mandatory here and
 * absent from the update schema — a scope change has to be delete + create.
 */
export interface ApiRuleCreate {
  name: string;
  cel_expression: string;
  scope: RuleScope;
  priority: number;
  targets: ApiTarget[];
  scope_id?: string;
  description?: string;
  enabled?: boolean;
  chain_rule?: boolean;
  fallbacks?: RoutingFallback[];
  query?: unknown;
}

/**
 * Body accepted by PUT /api/routing/rules/{id}. Every field is optional, but
 * supplying `targets` replaces the whole target list — so callers send the
 * complete rule, never a delta.
 */
export type ApiRuleUpdate = Partial<Omit<ApiRuleCreate, 'scope'>>;

/** Rule as returned by GET /api/routing/rules. Never send this back verbatim. */
export interface ApiRule extends ApiRuleCreate {
  id: string;
  chain_rule?: boolean;
  /** Streaming cutoff, 1–300000 ms. Not modelled in the canvas. */
  ttft_timeout_ms?: number | null;
  /** Raw query-builder JSON from the Bifrost dashboard. */
  query?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderConfig {
  id: string;
  type: string;
  supported: boolean;
  mode: 'proxy' | 'manage' | 'off';
  keys: Array<{ value: string; key_id?: string; weight?: number; models?: string[]; aliases?: string[] }>;
  model_name_override?: Record<string, string>;
  forward_headers?: string[];
}

/* --- gateway catalog reads: /api/models, /api/providers (see Bifrost handlers) --- */

/** One row of `GET /api/models`. `provider` is the config name, NOT the model vendor. */
export interface ApiModel {
  name: string;
  provider: string;
  is_deprecated?: boolean;
  accessible_by_keys?: string[];
}

/** One row of `GET /api/providers`. Bifrost names a provider after its config id. */
export interface ApiProvider {
  name: string;
  provider_status?: string;
  status?: string;
  description?: string;
}

/** One key of `GET /api/providers/{provider}/keys`. `value` arrives redacted. */
export interface ApiProviderKey {
  id: string;
  name?: string;
  value?: unknown;
  models?: string[] | null;
  weight?: number;
  enabled?: boolean;
  status?: string;
}

/* SQLite row shapes (snake_case on disk, camelCase in the app). */
export interface RoutingRuleRow {
  id: string;
  name: string;
  description: string | null;
  enabled: number;
  chain_rule: number;
  cel_expression: string;
  targets: string;
  fallbacks: string;
  scope: string;
  scope_id: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderRow {
  id: string;
  type: string;
  supported: number;
  mode: string;
  keys: string;
  model_name_override: string;
  forward_headers: string;
}

export interface BifrostConfig {
  providers: Record<string, ProviderConfig>;
  governance: { routing_rules: RoutingRule[] };
}

/* CEL visual builder primitives -------------------------------------- */

export type CELField =
  | 'model'
  | 'provider'
  | 'request_type'
  | 'header'
  | 'param'
  | 'team_name'
  | 'customer_id'
  | 'virtual_key_name'
  | 'budget_used'
  | 'tokens_used'
  | 'request'
  | 'request_size'
  | 'time_hour'
  | 'complexity_tier';

export type CELComparison =
  | '=='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'in'
  | 'startsWith'
  | 'endsWith'
  | 'contains'
  | 'matches';

export interface CELCondition {
  id: string;
  field: CELField;
  op: CELComparison;
  value: string;
  headerName?: string; // for header/param fields
  negate?: boolean; // renders as !(condition)
}

export interface CELGroup {
  id: string;
  combinator: '&&' | '||';
  conditions: Array<CELCondition | CELGroup>;
}

export const REQUEST_TYPES = [
  'chat_completion',
  'embedding',
  'batch',
  'image_generation',
  'moderation',
  'transcription',
  'translation',
] as const;
