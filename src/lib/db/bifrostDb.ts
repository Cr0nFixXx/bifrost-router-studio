/**
 * Bifrost SQLite access layer (client-side, via sql.js).
 *
 * This is the ONLY place that talks to the SQLite file. It owns the WASM
 * Database handle and exposes typed CRUD for routing rules and providers.
 *
 * Supported SQLite layouts:
 *   1) Studio/app layout (used for new files created by this tool):
 *      routing_rules(..., targets JSON, fallbacks JSON, ...), providers(...), models(...)
 *   2) Native Bifrost layout (real gateway config-store):
 *      routing_rules(..., fallbacks JSON, query, ...), routing_targets(rule_id, provider, model, key_id, weight),
 *      config_providers/config_keys/config_models.
 *
 * Mapping: routing_rules(+routing_targets) <-> governance.routing_rules[].
 * See CLAUDE.md for the full contract.
 */
import { openDatabase, type Database } from '@/lib/sqljs/loader';
import { celToBifrostQuery, isUsableBifrostQuery } from '@/lib/bifrostQuery';
import { fallbackFromParts, fallbackToConfigForm, fallbackToParts } from '@/lib/modelRefs';
import type { SqlValue } from 'sql.js';
import type {
  BifrostConfig,
  ComplexityTier,
  ProviderConfig,
  ProviderRow,
  RoutingRule,
  RoutingRuleRow,
  RoutingTarget,
} from '@/types/bifrost';

type NativeRuleRow = {
  id: string;
  config_hash?: string | null;
  name: string;
  description?: string | null;
  enabled: number | boolean | string;
  cel_expression: string;
  fallbacks?: string | null;
  query?: string | null;
  scope: string;
  scope_id?: string | null;
  priority: number;
  created_at?: string;
  updated_at?: string;
  chain_rule?: number | boolean | string;
};

type NativeTargetRow = {
  provider: string | null;
  model: string | null;
  key_id?: string | null;
  weight: number | null;
};

type NativeProviderRow = {
  id: number;
  name: string;
  custom_provider_config_json?: string | null;
  open_ai_config_json?: string | null;
  status?: string | null;
};

type NativeKeyRow = {
  provider?: string | null;
  key_id: string;
  value: string;
  models_json?: string | null;
  aliases_json?: string | null;
  weight?: number | null;
  enabled?: number | boolean | string | null;
};

export type RoutingRulesTableRow = {
  id: string;
  config_hash: string | null;
  name: string;
  description: string | null;
  enabled: number;
  cel_expression: string;
  fallbacks: string | null;
  query: string | null;
  scope: string;
  scope_id: string | null;
  priority: number;
  created_at: string | null;
  updated_at: string | null;
  chain_rule: number;
};

export type RoutingTargetsTableRow = {
  rowid: number | null;
  rule_id: string;
  provider: string | null;
  model: string | null;
  key_id: string | null;
  weight: number;
};

const APP_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS routing_rules (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    enabled        INTEGER NOT NULL DEFAULT 1,
    chain_rule     INTEGER NOT NULL DEFAULT 0,
    cel_expression TEXT NOT NULL DEFAULT 'true',
    targets        TEXT NOT NULL DEFAULT '[]',
    fallbacks      TEXT NOT NULL DEFAULT '[]',
    scope          TEXT NOT NULL DEFAULT 'global',
    scope_id       TEXT,
    priority       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rules_priority ON routing_rules(priority ASC);
  CREATE INDEX IF NOT EXISTS idx_rules_scope ON routing_rules(scope, scope_id);

  CREATE TABLE IF NOT EXISTS providers (
    id                   TEXT PRIMARY KEY,
    type                 TEXT NOT NULL,
    supported            INTEGER NOT NULL DEFAULT 1,
    mode                 TEXT NOT NULL DEFAULT 'proxy',
    keys                 TEXT NOT NULL DEFAULT '[]',
    model_name_override  TEXT NOT NULL DEFAULT '{}',
    forward_headers      TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS models (
    id          TEXT PRIMARY KEY,
    provider    TEXT,
    label       TEXT,
    meta        TEXT,
    updated_at  TEXT
  );
`;

export class BifrostDb {
  private columnCache = new Map<string, Set<string>>();

  private constructor(private readonly db: Database) {}

  /** Open from a file buffer (or create a brand-new database). */
  static async open(buffer?: Uint8Array): Promise<BifrostDb> {
    const db = await openDatabase(buffer);
    const instance = new BifrostDb(db);
    instance.migrate();
    return instance;
  }

  /** Replace the underlying handle (used after re-importing a DB file). */
  static wrap(db: Database): BifrostDb {
    const instance = new BifrostDb(db);
    instance.migrate();
    return instance;
  }

  /* ----------------------------- helpers ---------------------------- */

  private all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    stmt.free();
    return out;
  }

  private get<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const row = stmt.step() ? (stmt.getAsObject() as T) : undefined;
    stmt.free();
    return row;
  }

  private run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
    this.columnCache.clear();
  }

  private tableExists(name: string): boolean {
    return !!this.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]);
  }

  private columns(table: string): Set<string> {
    const cached = this.columnCache.get(table);
    if (cached) return cached;
    if (!this.tableExists(table)) {
      const empty = new Set<string>();
      this.columnCache.set(table, empty);
      return empty;
    }
    const cols = new Set(this.all<{ name: string }>(`PRAGMA table_info(${quoteIdent(table)})`).map((c) => c.name));
    this.columnCache.set(table, cols);
    return cols;
  }

  private hasColumn(table: string, column: string): boolean {
    return this.columns(table).has(column);
  }

  private isNativeRoutingSchema(): boolean {
    // Native Bifrost stores targets in a separate routing_targets table. The old
    // Studio schema stores a JSON column named `targets` directly on routing_rules.
    return this.tableExists('routing_rules') && !this.hasColumn('routing_rules', 'targets');
  }

  private isNativeProviderSchema(): boolean {
    return this.tableExists('config_providers');
  }

  private isAppRoutingSchema(): boolean {
    return this.tableExists('routing_rules') && this.hasColumn('routing_rules', 'targets');
  }

  /* ------------------------------ schema ---------------------------- */

  migrate(): void {
    const hasRoutingRules = this.tableExists('routing_rules');

    // Empty/new DB: create the compact Studio schema.
    if (!hasRoutingRules) {
      this.db.run(APP_SCHEMA_SQL);
      this.columnCache.clear();
      return;
    }

    // Existing Studio DB: ensure companion tables/indexes still exist.
    if (this.isAppRoutingSchema()) {
      this.db.run(APP_SCHEMA_SQL);
      this.columnCache.clear();
      return;
    }

    // Native Bifrost DB: do not add Studio shadow tables. We read/write the real
    // routing_rules + routing_targets/config_* tables directly.
  }

  /** Heuristic: is this file likely a Bifrost DB we can work with? */
  detectKind(): 'bifrost-routing' | 'empty' | 'unknown' {
    const tables = this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).map((t) => t.name);
    if (
      tables.includes('routing_rules') ||
      tables.includes('routing_targets') ||
      tables.includes('providers') ||
      tables.includes('config_providers')
    ) return 'bifrost-routing';
    if (tables.length === 0) return 'empty';
    return 'unknown';
  }

  /* --------------------------- rule CRUD ---------------------------- */

  listRules(): RoutingRule[] {
    if (this.isNativeRoutingSchema()) return this.listNativeRules();

    const rows = this.all<RoutingRuleRow>(
      'SELECT * FROM routing_rules ORDER BY priority ASC, name ASC',
    );
    return rows.map(rowToRule);
  }

  getRule(id: string): RoutingRule | null {
    if (this.isNativeRoutingSchema()) {
      const row = this.get<NativeRuleRow>('SELECT * FROM routing_rules WHERE id = ?', [id]);
      return row ? this.nativeRowToRule(row) : null;
    }
    const row = this.get<RoutingRuleRow>('SELECT * FROM routing_rules WHERE id = ?', [id]);
    return row ? rowToRule(row) : null;
  }

  createRule(rule: RoutingRule): RoutingRule {
    if (this.isNativeRoutingSchema()) return this.createNativeRule(rule);

    const now = new Date().toISOString();
    this.run(
      `INSERT INTO routing_rules
       (id,name,description,enabled,chain_rule,cel_expression,targets,fallbacks,scope,scope_id,priority,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        rule.id,
        rule.name,
        rule.description ?? null,
        rule.enabled ? 1 : 0,
        rule.chain_rule ? 1 : 0,
        rule.cel_expression,
        JSON.stringify(rule.targets ?? []),
        JSON.stringify(rule.fallbacks ?? []),
        rule.scope,
        rule.scope_id ?? null,
        rule.priority,
        now,
        now,
      ],
    );
    return this.getRule(rule.id)!;
  }

  updateRule(id: string, patch: Partial<RoutingRule>): RoutingRule {
    const existing = this.getRule(id);
    if (!existing) throw new Error(`Rule ${id} not found`);
    const now = new Date().toISOString();
    const next: RoutingRule = { ...existing, ...patch, id, updated_at: now };

    if (this.isNativeRoutingSchema()) return this.updateNativeRule(id, next, existing);

    this.run(
      `UPDATE routing_rules SET
         name=?, description=?, enabled=?, chain_rule=?, cel_expression=?,
         targets=?, fallbacks=?, scope=?, scope_id=?, priority=?, updated_at=?
       WHERE id=?`,
      [
        next.name,
        next.description ?? null,
        next.enabled ? 1 : 0,
        next.chain_rule ? 1 : 0,
        next.cel_expression,
        JSON.stringify(next.targets ?? []),
        JSON.stringify(next.fallbacks ?? []),
        next.scope,
        next.scope_id ?? null,
        next.priority,
        now,
        id,
      ],
    );
    return next;
  }

  deleteRule(id: string): boolean {
    if (this.isNativeRoutingSchema()) {
      if (this.tableExists('routing_targets')) this.run('DELETE FROM routing_targets WHERE rule_id = ?', [id]);
      this.run('DELETE FROM routing_rules WHERE id = ?', [id]);
      return this.db.getRowsModified() > 0;
    }
    this.run('DELETE FROM routing_rules WHERE id = ?', [id]);
    return this.db.getRowsModified() > 0;
  }

  reorderRules(priorityMap: Record<string, number>): void {
    const now = new Date().toISOString();
    for (const [id, priority] of Object.entries(priorityMap)) {
      this.run('UPDATE routing_rules SET priority = ?, updated_at = ? WHERE id = ?', [priority, now, id]);
    }
  }

  replaceAllRules(rules: RoutingRule[]): void {
    if (this.isNativeRoutingSchema()) {
      const oldMeta = new Map<string, NativeRuleRow>();
      for (const row of this.all<NativeRuleRow>('SELECT * FROM routing_rules')) oldMeta.set(row.id, row);

      this.run('BEGIN TRANSACTION');
      try {
        if (this.tableExists('routing_targets')) this.run('DELETE FROM routing_targets');
        this.run('DELETE FROM routing_rules');
        for (const r of rules) this.createNativeRule(r, oldMeta.get(r.id));
        this.run('COMMIT');
      } catch (err) {
        this.run('ROLLBACK');
        throw err;
      }
      return;
    }

    this.run('DELETE FROM routing_rules');
    for (const r of rules) this.createRule(r);
  }

  /* ------------------------- native rule helpers -------------------- */

  private listNativeRules(): RoutingRule[] {
    const rows = this.all<NativeRuleRow>(
      'SELECT * FROM routing_rules ORDER BY priority ASC, name ASC',
    );
    return rows.map((row) => this.nativeRowToRule(row));
  }

  private nativeRowToRule(r: NativeRuleRow): RoutingRule {
    return {
      id: String(r.id),
      name: r.name,
      description: r.description ?? undefined,
      enabled: toBool(r.enabled, true),
      chain_rule: toBool(r.chain_rule, false),
      cel_expression: r.cel_expression,
      targets: this.nativeTargetsForRule(String(r.id)),
      fallbacks: parseJson<RoutingRule['fallbacks']>(r.fallbacks, []),
      scope: (r.scope as RoutingRule['scope']) ?? 'global',
      scope_id: r.scope_id ?? null,
      priority: Number(r.priority ?? 0),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  private nativeTargetsForRule(ruleId: string): RoutingTarget[] {
    if (!this.tableExists('routing_targets')) return [];
    const rows = this.all<NativeTargetRow>(
      'SELECT provider, model, key_id, weight FROM routing_targets WHERE rule_id = ? ORDER BY rowid ASC',
      [ruleId],
    );
    return rows.map((r) => ({
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
      api_key: r.key_id ?? undefined,
      weight: Number(r.weight ?? 1),
    }));
  }

  private createNativeRule(rule: RoutingRule, old?: NativeRuleRow): RoutingRule {
    const now = new Date().toISOString();
    const cols = this.columns('routing_rules');
    const query = old && old.cel_expression === rule.cel_expression && isUsableBifrostQuery(old.query) ? (old.query ?? null) : celToBifrostQuery(rule.cel_expression);
    const values: Record<string, SqlValue> = {
      id: rule.id,
      config_hash: old?.config_hash ?? '',
      name: rule.name,
      description: rule.description ?? '',
      enabled: rule.enabled ? 1 : 0,
      cel_expression: rule.cel_expression,
      fallbacks: JSON.stringify(rule.fallbacks ?? []),
      query,
      scope: rule.scope,
      scope_id: rule.scope_id ?? null,
      priority: rule.priority,
      created_at: old?.created_at ?? rule.created_at ?? now,
      updated_at: now,
      chain_rule: rule.chain_rule ? 1 : 0,
    };
    const insertCols = Object.keys(values).filter((c) => cols.has(c));
    this.run(
      `INSERT INTO routing_rules (${insertCols.map(quoteIdent).join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`,
      insertCols.map((c) => values[c]),
    );
    this.replaceNativeTargets(rule.id, rule.targets ?? []);
    return this.getRule(rule.id)!;
  }

  private updateNativeRule(id: string, next: RoutingRule, previous: RoutingRule): RoutingRule {
    const now = new Date().toISOString();
    const row = this.get<NativeRuleRow>('SELECT * FROM routing_rules WHERE id = ?', [id]);
    const cols = this.columns('routing_rules');
    const values: Record<string, SqlValue> = {
      name: next.name,
      description: next.description ?? '',
      enabled: next.enabled ? 1 : 0,
      cel_expression: next.cel_expression,
      fallbacks: JSON.stringify(next.fallbacks ?? []),
      query: row && previous.cel_expression === next.cel_expression && isUsableBifrostQuery(row.query) ? (row.query ?? null) : celToBifrostQuery(next.cel_expression),
      scope: next.scope,
      scope_id: next.scope_id ?? null,
      priority: next.priority,
      updated_at: now,
      chain_rule: next.chain_rule ? 1 : 0,
    };
    const updateCols = Object.keys(values).filter((c) => cols.has(c));
    this.run(
      `UPDATE routing_rules SET ${updateCols.map((c) => `${quoteIdent(c)}=?`).join(', ')} WHERE id=?`,
      [...updateCols.map((c) => values[c]), id],
    );
    this.replaceNativeTargets(id, next.targets ?? []);
    return this.getRule(id)!;
  }

  private replaceNativeTargets(ruleId: string, targets: RoutingTarget[]): void {
    if (!this.tableExists('routing_targets')) {
      // Native Bifrost should have this table, but creating it makes imported or
      // reduced test fixtures still writable without inventing a JSON column.
      this.run(`
        CREATE TABLE IF NOT EXISTS routing_targets (
          rule_id  varchar(255) NOT NULL,
          provider varchar(255),
          model    varchar(255),
          key_id   varchar(255),
          weight   REAL NOT NULL DEFAULT 1
        );
      `);
    }
    this.run('DELETE FROM routing_targets WHERE rule_id = ?', [ruleId]);
    for (const t of targets) {
      this.run(
        'INSERT INTO routing_targets (rule_id, provider, model, key_id, weight) VALUES (?,?,?,?,?)',
        [ruleId, t.provider ?? null, t.model ?? null, t.api_key ?? null, Number(t.weight ?? 1)],
      );
    }
  }

  /* ------------------------- provider CRUD -------------------------- */

  listProviders(): ProviderConfig[] {
    if (this.isNativeProviderSchema()) return this.listNativeProviders();

    const rows = this.all<ProviderRow>('SELECT * FROM providers ORDER BY id ASC');
    return rows.map(rowToProvider);
  }

  upsertProvider(provider: ProviderConfig): ProviderConfig {
    if (this.isNativeProviderSchema()) return this.upsertNativeProvider(provider);

    this.run(
      `INSERT INTO providers (id,type,supported,mode,keys,model_name_override,forward_headers)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         type=excluded.type, supported=excluded.supported, mode=excluded.mode,
         keys=excluded.keys, model_name_override=excluded.model_name_override,
         forward_headers=excluded.forward_headers`,
      [
        provider.id,
        provider.type,
        provider.supported ? 1 : 0,
        provider.mode,
        JSON.stringify(provider.keys ?? []),
        JSON.stringify(provider.model_name_override ?? {}),
        JSON.stringify(provider.forward_headers ?? []),
      ],
    );
    return provider;
  }

  private listNativeProviders(): ProviderConfig[] {
    const providers = this.all<NativeProviderRow>('SELECT * FROM config_providers ORDER BY name ASC');
    return providers.map((p) => {
      const keys = this.tableExists('config_keys')
        ? this.all<NativeKeyRow>(`SELECT provider, key_id, value, models_json, ${this.hasColumn('config_keys', 'aliases_json') ? 'aliases_json' : 'NULL AS aliases_json'}, weight, enabled FROM config_keys WHERE provider_id = ? ORDER BY id ASC`, [p.id])
        : [];
      const custom = parseJson<Record<string, unknown>>(p.custom_provider_config_json, {});
      const firstKeyProvider = keys.find((k) => k.provider)?.provider;
      const type = String(custom.base_provider_type ?? firstKeyProvider ?? p.name);
      return {
        id: p.name,
        type,
        supported: p.status !== 'error',
        mode: 'proxy',
        keys: keys.map((k) => ({
          value: k.value,
          key_id: k.key_id,
          weight: Number(k.weight ?? 1),
          models: parseJson<string[]>(k.models_json, []),
          aliases: aliasValues(k.aliases_json),
        })),
        model_name_override: {},
        forward_headers: [],
      };
    });
  }

  private upsertNativeProvider(provider: ProviderConfig): ProviderConfig {
    // Keep existing native provider/key rows non-destructive. Saving the canvas
    // calls upsertProvider for every provider; rewriting config_keys here would
    // risk overwriting encrypted/secret gateway metadata that the visual router
    // does not model.
    const existing = this.get<NativeProviderRow>('SELECT * FROM config_providers WHERE name = ?', [provider.id]);
    if (existing) return provider;

    const now = new Date().toISOString();
    this.run('INSERT INTO config_providers (name, created_at, updated_at) VALUES (?,?,?)', [provider.id, now, now]);
    const inserted = this.get<{ id: number }>('SELECT id FROM config_providers WHERE name = ?', [provider.id]);
    if (inserted && this.tableExists('config_keys')) {
      for (const [idx, key] of (provider.keys ?? []).entries()) {
        this.run(
          `INSERT INTO config_keys
           (name, provider_id, provider, key_id, value, models_json, weight, enabled, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            `${provider.id} key ${idx + 1}`,
            inserted.id,
            provider.type,
            `${provider.id}-${idx + 1}`,
            key.value,
            JSON.stringify(key.models ?? []),
            key.weight ?? 1,
            1,
            now,
            now,
          ],
        );
      }
    }
    return provider;
  }

  /* ----------------------------- models ----------------------------- */

  listModels(): Array<{ id: string; provider?: string; label?: string }> {
    if (this.isNativeProviderSchema()) return this.listNativeModels();

    return this.all<{ id: string; provider: string | null; label: string | null }>(
      'SELECT id, provider, label FROM models ORDER BY provider, label',
    ).map((m) => ({ id: m.id, provider: m.provider ?? undefined, label: m.label ?? undefined }));
  }

  upsertModels(models: Array<{ id: string; provider?: string; label?: string }>): void {
    if (this.isNativeProviderSchema()) return;

    for (const m of models) {
      this.run(
        'INSERT OR REPLACE INTO models (id, provider, label, meta, updated_at) VALUES (?,?,?,?,?)',
        [m.id, m.provider ?? null, m.label ?? m.id, '{}', new Date().toISOString()],
      );
    }
  }

  private listNativeModels(): Array<{ id: string; provider?: string; label?: string }> {
    const out = new Map<string, { id: string; provider?: string; label?: string }>();
    const add = (provider: string | null | undefined, model: string | null | undefined) => {
      if (!model || model === '*') return;
      const id = [provider, model].filter(Boolean).join('/');
      out.set(id, { id, provider: provider ?? undefined, label: model });
    };

    if (this.tableExists('routing_targets')) {
      for (const r of this.all<{ provider: string | null; model: string | null }>('SELECT DISTINCT provider, model FROM routing_targets')) {
        add(r.provider, r.model);
      }
    }

    if (this.tableExists('config_models')) {
      for (const r of this.all<{ provider: string | null; model: string | null }>(`
        SELECT p.name AS provider, m.name AS model
        FROM config_models m
        LEFT JOIN config_providers p ON p.id = m.provider_id
      `)) add(r.provider, r.model);
    }

    if (this.tableExists('config_keys')) {
      const aliasSelect = this.hasColumn('config_keys', 'aliases_json') ? 'k.aliases_json AS aliases_json' : 'NULL AS aliases_json';
      const keyRows = this.all<{ provider_name: string | null; provider: string | null; models_json: string | null; aliases_json: string | null }>(`
        SELECT p.name AS provider_name, k.provider AS provider, k.models_json AS models_json, ${aliasSelect}
        FROM config_keys k
        LEFT JOIN config_providers p ON p.id = k.provider_id
      `);
      for (const row of keyRows) {
        const provider = row.provider_name ?? row.provider;
        for (const model of parseJson<string[]>(row.models_json, [])) add(provider, model);
        for (const alias of aliasValues(row.aliases_json)) add(provider, alias);
      }
    }

    return [...out.values()].sort((a, b) => `${a.provider ?? ''}/${a.label ?? a.id}`.localeCompare(`${b.provider ?? ''}/${b.label ?? b.id}`));
  }


  /* --------------------- raw routing SQL tables --------------------- */

  listRoutingRulesTableRows(): RoutingRulesTableRow[] {
    if (!this.tableExists('routing_rules')) return [];
    const c = this.columns('routing_rules');
    const select = (name: keyof RoutingRulesTableRow, fallback: string) => c.has(name) ? quoteIdent(name) : `${fallback} AS ${quoteIdent(name)}`;
    return this.all<RoutingRulesTableRow>(`
      SELECT
        ${select('id', "''")},
        ${select('config_hash', 'NULL')},
        ${select('name', "''")},
        ${select('description', 'NULL')},
        ${select('enabled', '1')},
        ${select('cel_expression', "'true'")},
        ${select('fallbacks', "'[]'")},
        ${select('query', 'NULL')},
        ${select('scope', "'global'")},
        ${select('scope_id', 'NULL')},
        ${select('priority', '0')},
        ${select('created_at', 'NULL')},
        ${select('updated_at', 'NULL')},
        ${select('chain_rule', '0')}
      FROM routing_rules
      ORDER BY priority ASC, name ASC
    `).map((r) => ({
      ...r,
      enabled: Number(r.enabled ?? 0),
      priority: Number(r.priority ?? 0),
      chain_rule: Number(r.chain_rule ?? 0),
    }));
  }

  listRoutingTargetsTableRows(): RoutingTargetsTableRow[] {
    if (this.tableExists('routing_targets')) {
      return this.all<RoutingTargetsTableRow>(`
        SELECT rowid, rule_id, provider, model, key_id, weight
        FROM routing_targets
        ORDER BY rule_id ASC, rowid ASC
      `).map((r) => ({ ...r, rowid: Number(r.rowid), weight: Number(r.weight ?? 1) }));
    }

    // Studio compact schema has no physical routing_targets table; expose the
    // JSON targets as virtual rows for visibility. Saving target rows will create
    // a physical routing_targets table only for native/reduced fixtures.
    const out: RoutingTargetsTableRow[] = [];
    for (const rule of this.listRules()) {
      rule.targets.forEach((t, idx) => out.push({
        rowid: null,
        rule_id: rule.id,
        provider: t.provider ?? null,
        model: t.model ?? null,
        key_id: t.api_key ?? null,
        weight: Number(t.weight ?? 1),
      }));
    }
    return out;
  }

  saveRoutingRuleTableRow(originalId: string | null, row: RoutingRulesTableRow): void {
    const now = new Date().toISOString();
    if (!this.tableExists('routing_rules')) this.migrate();
    const c = this.columns('routing_rules');
    const exists = originalId ? !!this.get<{ id: string }>('SELECT id FROM routing_rules WHERE id = ?', [originalId]) : false;
    const values: Record<string, SqlValue> = {
      id: row.id,
      config_hash: row.config_hash ?? '',
      name: row.name,
      description: row.description ?? '',
      enabled: row.enabled ? 1 : 0,
      cel_expression: row.cel_expression || 'true',
      fallbacks: row.fallbacks ?? '[]',
      query: isUsableBifrostQuery(row.query) ? row.query : celToBifrostQuery(row.cel_expression),
      scope: row.scope || 'global',
      scope_id: row.scope_id ?? null,
      priority: Number(row.priority ?? 0),
      created_at: row.created_at ?? now,
      updated_at: row.updated_at ?? now,
      chain_rule: row.chain_rule ? 1 : 0,
    };
    const cols = Object.keys(values).filter((k) => c.has(k));
    if (exists && originalId) {
      this.run(
        `UPDATE routing_rules SET ${cols.map((col) => `${quoteIdent(col)}=?`).join(', ')} WHERE id=?`,
        [...cols.map((col) => values[col]), originalId],
      );
      if (row.id !== originalId && this.tableExists('routing_targets')) {
        this.run('UPDATE routing_targets SET rule_id = ? WHERE rule_id = ?', [row.id, originalId]);
      }
    } else {
      this.run(
        `INSERT INTO routing_rules (${cols.map(quoteIdent).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        cols.map((col) => values[col]),
      );
    }
  }

  deleteRoutingRuleTableRow(id: string): void {
    if (this.tableExists('routing_targets')) this.run('DELETE FROM routing_targets WHERE rule_id = ?', [id]);
    if (this.tableExists('routing_rules')) this.run('DELETE FROM routing_rules WHERE id = ?', [id]);
  }

  saveRoutingTargetTableRow(row: RoutingTargetsTableRow): RoutingTargetsTableRow {
    if (!this.tableExists('routing_targets')) {
      this.run(`
        CREATE TABLE IF NOT EXISTS routing_targets (
          rule_id  varchar(255) NOT NULL,
          provider varchar(255),
          model    varchar(255),
          key_id   varchar(255),
          weight   REAL NOT NULL DEFAULT 1
        );
      `);
    }
    const weight = Number(row.weight ?? 1);
    if (row.rowid != null && this.get('SELECT rowid FROM routing_targets WHERE rowid = ?', [row.rowid])) {
      this.run(
        'UPDATE routing_targets SET rule_id=?, provider=?, model=?, key_id=?, weight=? WHERE rowid=?',
        [row.rule_id, row.provider ?? null, row.model ?? null, row.key_id ?? null, weight, row.rowid],
      );
      return { ...row, weight };
    }
    this.run(
      'INSERT INTO routing_targets (rule_id, provider, model, key_id, weight) VALUES (?,?,?,?,?)',
      [row.rule_id, row.provider ?? null, row.model ?? null, row.key_id ?? null, weight],
    );
    const inserted = this.get<{ rowid: number }>('SELECT last_insert_rowid() AS rowid');
    return { ...row, rowid: inserted?.rowid ?? null, weight };
  }

  deleteRoutingTargetTableRow(rowid: number): void {
    if (!this.tableExists('routing_targets')) return;
    this.run('DELETE FROM routing_targets WHERE rowid = ?', [rowid]);
  }

  /**
   * Ensure every native Bifrost routing rule has a visual query-builder state.
   * Bifrost runtime uses `cel_expression`, but its dashboard editor relies on
   * `routing_rules.query`. This backfills missing/invalid query values from CEL.
   */
  ensureRoutingRuleQueries(): number {
    if (!this.tableExists('routing_rules') || !this.hasColumn('routing_rules', 'query')) return 0;
    const rows = this.all<{ id: string; cel_expression: string; query: string | null }>(
      'SELECT id, cel_expression, query FROM routing_rules',
    );
    let updated = 0;
    for (const row of rows) {
      if (isUsableBifrostQuery(row.query)) continue;
      const generated = celToBifrostQuery(row.cel_expression);
      if (!generated) continue;
      this.run('UPDATE routing_rules SET query = ? WHERE id = ?', [generated, row.id]);
      updated += 1;
    }
    return updated;
  }

  /* --------------------- config.json projection --------------------- */

  /** `key_id` -> `config_keys.name`. config.json pins keys by name, the DB by id. */
  keyNameById(): Map<string, string> {
    const names = new Map<string, string>();
    if (!this.tableExists('config_keys') || !this.hasColumn('config_keys', 'name')) return names;
    for (const row of this.all<{ key_id: string | null; name: string | null }>('SELECT key_id, name FROM config_keys')) {
      if (row.key_id && row.name) names.set(String(row.key_id), String(row.name));
    }
    return names;
  }

  exportConfig(): BifrostConfig {
    const providers: Record<string, ProviderConfig> = {};
    for (const p of this.listProviders()) providers[p.id] = p;
    const names = this.keyNameById();
    const rules = this.listRules().map((rule) => ({
      ...rule,
      fallbacks: rule.fallbacks.map((fb) => {
        const { key_id } = fallbackToParts(fb);
        return fallbackToConfigForm(fb, key_id ? names.get(key_id) : undefined);
      }),
    }));
    return { providers, governance: { routing_rules: rules } };
  }

  importConfig(config: BifrostConfig): { rules: number; providers: number } {
    const keyIds = new Map(Array.from(this.keyNameById(), ([keyId, name]) => [name, keyId]));
    for (const raw of config.governance?.routing_rules ?? []) {
      const rule: RoutingRule = {
        ...raw,
        fallbacks: raw.fallbacks.map((fb) => {
          if (!fb || typeof fb !== 'object') return fb;
          const { provider, model } = fallbackToParts(fb);
          const keyId = fb.key_id ?? (fb.provider_key_name ? keyIds.get(fb.provider_key_name) : undefined);
          return fallbackFromParts(provider, model, keyId);
        }).filter((fb) => fb !== ''),
      };
      this.createRule(rule);
    }
    for (const [id, prov] of Object.entries(config.providers ?? {})) {
      this.upsertProvider({ ...prov, id });
    }
    return {
      rules: config.governance?.routing_rules?.length ?? 0,
      providers: Object.keys(config.providers ?? {}).length,
    };
  }

  /* --------------------------- lifecycle ---------------------------- */

  /** Serialize the whole database back to bytes (for download / persistence). */
  exportBytes(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}

/* --------------------------- row mappers --------------------------- */

function rowToRule(r: RoutingRuleRow): RoutingRule {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    enabled: toBool(r.enabled, true),
    chain_rule: toBool(r.chain_rule, false),
    cel_expression: r.cel_expression,
    targets: parseJson<RoutingRule['targets']>(r.targets, []),
    fallbacks: parseJson<RoutingRule['fallbacks']>(r.fallbacks, []),
    scope: (r.scope as RoutingRule['scope']) ?? 'global',
    scope_id: r.scope_id ?? null,
    priority: Number(r.priority ?? 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToProvider(r: ProviderRow): ProviderConfig {
  return {
    id: r.id,
    type: r.type,
    supported: toBool(r.supported, true),
    mode: (r.mode as ProviderConfig['mode']) ?? 'proxy',
    keys: parseJson<ProviderConfig['keys']>(r.keys, []),
    model_name_override: parseJson<Record<string, string>>(r.model_name_override, {}),
    forward_headers: parseJson<string[]>(r.forward_headers, []),
  };
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function aliasValues(raw: unknown): string[] {
  const parsed = parseJson<unknown>(raw, []);
  if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  if (parsed && typeof parsed === 'object') {
    const vals = new Set<string>();
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (k) vals.add(k);
      if (typeof v === 'string' && v) vals.add(v);
      if (Array.isArray(v)) v.forEach((x) => { if (typeof x === 'string' && x) vals.add(x); });
    }
    return [...vals];
  }
  return [];
}

function toBool(value: unknown, fallback = false): boolean {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Complexity tiers referenced anywhere (kept for completeness/exports). */
export type { ComplexityTier };
