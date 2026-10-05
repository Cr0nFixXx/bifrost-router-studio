/**
 * Client for the Bifrost management API (`/api/routing/rules`).
 *
 * This is the only module that talks to a running gateway. The store, the
 * canvas and the sync layer go through `BifrostApi`; nothing else builds URLs
 * or attaches an Authorization header.
 *
 * Two shapes matter here and they are deliberately distinct:
 *   - `ApiRule`     — what GET returns. Carries `id`, `created_at`, `scope`.
 *   - `ApiRuleCreate` / `ApiRuleUpdate` — what POST/PUT accept. They accept
 *     neither `id` nor the timestamps, and PUT cannot change `scope` at all.
 * Round-tripping a GET response straight back into a write silently fails, so
 * `toWriteShape` is the only sanctioned conversion.
 */
import type {
  ApiRule,
  ApiRuleCreate,
  ApiRuleUpdate,
  ApiTarget,
  RoutingFallback,
  RoutingRule,
  RoutingTarget,
} from '@/types/bifrost';
import { celToBifrostQueryObject } from '@/lib/bifrostQuery';

/** Normalized failure so the UI can tell 401 from 404 from "bridge is down". */
export class BifrostApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'BifrostApiError';
  }

  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

/** Where the token lives. Either the local bridge (which injects it) or direct. */
export interface ApiTransport {
  /** Absolute URL for a path below the routing prefix, e.g. `/rules`. */
  url: (path: string) => string;
  /** Bearer token to attach, or null when a proxy injects it for us. */
  token: string | null;
  /** Prefixes tried in order until one answers — Bifrost <2.0.0 differs. */
  prefixes: readonly string[];
}

/** Transport talking straight at Bifrost. Token must be supplied by the caller. */
export function directTransport(baseUrl: string, token: string | null): ApiTransport {
  const base = baseUrl.replace(/\/$/, '');
  return {
    url: (path) => `${base}${path}`,
    token,
    prefixes: ['/api/routing', '/api/governance'],
  };
}

/** Transport via scripts/local-bridge.mjs. The bridge holds the token. */
export function bridgeTransport(bridgeUrl: string): ApiTransport {
  const base = bridgeUrl.replace(/\/$/, '');
  return {
    url: (path) => `${base}/api/bifrost${path}`,
    token: null,
    prefixes: ['/api/routing', '/api/governance'],
  };
}

type Json = Record<string, unknown>;

function authHeaders(token: string | null): HeadersInit {
  return token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' };
}

async function readError(res: Response): Promise<BifrostApiError> {
  let body: unknown;
  let message = `${res.status} ${res.statusText}`.trim();
  try {
    body = await res.json();
    const err = (body as Json)?.error as Json | undefined;
    if (err && typeof err.message === 'string') message = err.message;
    else if (typeof (body as Json)?.message === 'string') message = (body as Json).message as string;
  } catch {
    /* non-JSON error body — the status line is all we have */
  }
  return new BifrostApiError(message, res.status, body);
}

/* ------------------------------ conversion ------------------------------ */

function toApiTarget(t: RoutingTarget): ApiTarget {
  const out: ApiTarget = { weight: t.weight };
  if (t.provider) out.provider = t.provider;
  if (t.model) out.model = t.model;
  if (t.api_key) out.key_id = t.api_key;
  return out;
}

export function apiTargetToRouting(t: ApiTarget): RoutingTarget {
  return {
    weight: t.weight,
    ...(t.provider ? { provider: t.provider } : {}),
    ...(t.model ? { model: t.model } : {}),
    ...(t.key_id ? { api_key: t.key_id } : {}),
  };
}

/**
 * Strip fallbacks down to what the API accepts. The object form is
 * `additionalProperties: false`, so `provider_key_name` (a config.json-only
 * alias) must not survive into a request.
 */
export function sanitizeFallback(fb: RoutingFallback): RoutingFallback | null {
  if (typeof fb === 'string') return fb || null;
  if (!fb || typeof fb !== 'object' || !fb.provider) return null;
  return { provider: fb.provider, ...(fb.model ? { model: fb.model } : {}), ...(fb.key_id ? { key_id: fb.key_id } : {}) };
}

/**
 * Canvas rule -> write body. Regenerates `query` from the CEL on every call so
 * the Bifrost dashboard's rule builder never drifts from the canvas.
 */
export function toWriteShape(rule: RoutingRule): ApiRuleCreate {
  return {
    name: rule.name,
    cel_expression: rule.cel_expression,
    scope: rule.scope,
    priority: rule.priority,
    targets: rule.targets.map(toApiTarget),
    ...(rule.description ? { description: rule.description } : {}),
    enabled: rule.enabled,
    chain_rule: rule.chain_rule,
    ...(rule.scope_id ? { scope_id: rule.scope_id } : {}),
    fallbacks: rule.fallbacks.map(sanitizeFallback).filter((f): f is RoutingFallback => f !== null),
    query: celToBifrostQueryObject(rule.cel_expression) ?? undefined,
  };
}

/**
 * GET response -> canvas rule. Fields the canvas has no node for (`ttft_timeout_ms`,
 * raw `query`) are not carried over; `ApiRule` keeps them so a diff can tell
 * "user changed this" from "canvas never knew about this".
 */
export function apiRuleToRouting(rule: ApiRule): RoutingRule {
  return {
    id: rule.id,
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    enabled: rule.enabled !== false,
    chain_rule: rule.chain_rule === true,
    cel_expression: rule.cel_expression,
    targets: (rule.targets ?? []).map(apiTargetToRouting),
    fallbacks: rule.fallbacks ?? [],
    scope: rule.scope,
    scope_id: rule.scope_id ?? null,
    priority: rule.priority,
    ...(rule.created_at ? { created_at: rule.created_at } : {}),
    ...(rule.updated_at ? { updated_at: rule.updated_at } : {}),
  };
}

/* -------------------------------- client -------------------------------- */

export class BifrostApi {
  /** Resolved on first successful call; see `pickPrefix`. */
  private prefix: string | null = null;

  constructor(private readonly transport: ApiTransport) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const last: BifrostApiError[] = [];
    for (const prefix of this.prefix ? [this.prefix] : this.transport.prefixes) {
      let res: Response;
      try {
        res = await fetch(this.transport.url(`${prefix}${path}`), {
          method,
          headers: authHeaders(this.transport.token),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        // Network-level failure (bridge down, CORS). Trying the other prefix
        // cannot help, so surface it immediately.
        throw new BifrostApiError((err as Error).message || 'Bifrost ist nicht erreichbar', 0);
      }
      // A 404 on a bare list means the whole prefix is missing (wrong fork);
      // on an item path it means the rule is gone. Only the former is worth
      // retrying against the other prefix.
      if (res.status === 404 && path === '/rules' && !this.prefix) {
        last.push(await readError(res));
        continue;
      }
      if (!res.ok) throw await readError(res);
      this.prefix = prefix;
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
    throw new BifrostApiError(
      `Bifrost antwortet auf keiner der bekannten API-Pfade (${this.transport.prefixes.join(', ')}). Ist die Instanz mindestens 2.0.0?`,
      last[0]?.status ?? 404,
    );
  }

  async listRules(): Promise<ApiRule[]> {
    const data = await this.request<{ rules?: ApiRule[] }>('GET', '/rules');
    return data.rules ?? [];
  }

  async createRule(rule: ApiRuleCreate): Promise<ApiRule> {
    const data = await this.request<{ rule?: ApiRule }>('POST', '/rules', rule);
    return (data.rule ?? (rule as unknown as ApiRule)) as ApiRule;
  }

  async updateRule(id: string, patch: ApiRuleUpdate): Promise<ApiRule> {
    const data = await this.request<{ rule?: ApiRule }>('PUT', `/rules/${encodeURIComponent(id)}`, patch);
    return (data.rule ?? (patch as unknown as ApiRule)) as ApiRule;
  }

  async deleteRule(id: string): Promise<void> {
    await this.request<void>('DELETE', `/rules/${encodeURIComponent(id)}`);
  }

  /** Version string of the gateway, e.g. `v2.3.1`. Used for the API-fork check. */
  async version(): Promise<string> {
    const data = await this.request<{ version?: string }>('GET', '/version');
    return data.version ?? '';
  }
}

/** Reported by the bridge's /api/health so the UI can explain a failed connect. */
export interface BridgeBifrostStatus {
  url: string;
  reachable: boolean;
  version?: string;
  authOk: boolean;
  reason?: string;
}

export interface BridgeHealth {
  ok: boolean;
  root: string;
  port: number;
  host: string;
  bifrost?: BridgeBifrostStatus;
}

export async function fetchBridgeHealth(bridgeUrl: string): Promise<BridgeHealth> {
  const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/health`);
  if (!res.ok) throw await readError(res);
  return (await res.json()) as BridgeHealth;
}