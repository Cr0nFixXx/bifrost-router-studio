import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { BifrostDb } from './bifrostDb';
import type { RoutingRule } from '@/types/bifrost';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  const wasm = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
  SQL = await initSqlJs({ locateFile: () => wasm });
});

const newDb = () => BifrostDb.wrap(new SQL.Database());

const sampleRule = (over: Partial<RoutingRule> = {}): RoutingRule => ({
  id: 'r1',
  name: 'Sample',
  cel_expression: 'model == "gpt-4o"',
  targets: [{ provider: 'openai', model: 'gpt-4o', weight: 0.7 }, { provider: 'azure', model: 'gpt-4o', weight: 0.3 }],
  fallbacks: ['anthropic/claude-3-7-sonnet-latest'],
  scope: 'team',
  scope_id: 'team-1',
  priority: 10,
  enabled: true,
  chain_rule: false,
  ...over,
});

describe('BifrostDb (sql.js)', () => {
  it('creates the schema idempotently and detects kind', () => {
    const db = newDb();
    expect(db.detectKind()).toBe('bifrost-routing');
  });

  it('creates, reads, updates and deletes a rule', () => {
    const db = newDb();
    db.createRule(sampleRule());
    expect(db.listRules()).toHaveLength(1);

    db.updateRule('r1', { cel_expression: 'model == "gpt-4o-mini"', priority: 5 });
    const updated = db.getRule('r1')!;
    expect(updated.cel_expression).toBe('model == "gpt-4o-mini"');
    expect(updated.priority).toBe(5);
    // weights & fallbacks persisted as JSON text
    expect(updated.targets).toHaveLength(2);

    expect(db.deleteRule('r1')).toBe(true);
    expect(db.listRules()).toHaveLength(0);
  });

  it('reorders priorities', () => {
    const db = newDb();
    db.createRule(sampleRule({ id: 'a', priority: 0 }));
    db.createRule(sampleRule({ id: 'b', priority: 0 }));
    db.reorderRules({ a: 10, b: 5 });
    const rules = db.listRules();
    expect(rules.map((r) => r.id)).toEqual(['b', 'a']); // sorted ascending by priority
  });

  it('round-trips through exportBytes()', () => {
    const db = newDb();
    db.createRule(sampleRule());
    const bytes = db.exportBytes();
    const reopened = BifrostDb.wrap(new SQL.Database(new Uint8Array(bytes)));
    expect(reopened.getRule('r1')?.name).toBe('Sample');
    expect(reopened.listRules()).toHaveLength(1);
  });

  it('exports and imports a Bifrost config.json', () => {
    const db = newDb();
    db.importConfig({
      providers: { openai: { id: 'openai', type: 'openai', supported: true, mode: 'proxy', keys: [] } },
      governance: { routing_rules: [sampleRule({ id: 'x' })] },
    });
    const cfg = db.exportConfig();
    expect(cfg.providers.openai.id).toBe('openai');
    expect(cfg.governance.routing_rules).toHaveLength(1);
    expect(cfg.governance.routing_rules[0].id).toBe('x');
  });



  it('reads and writes native Bifrost routing_rules + routing_targets schema', () => {
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE routing_rules (
        id varchar(255) PRIMARY KEY,
        config_hash varchar(255),
        name varchar(255) NOT NULL,
        description TEXT,
        enabled numeric NOT NULL DEFAULT true,
        cel_expression TEXT NOT NULL,
        fallbacks TEXT,
        query TEXT,
        scope varchar(50) NOT NULL,
        scope_id varchar(255),
        priority INTEGER NOT NULL DEFAULT 0,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        chain_rule numeric NOT NULL DEFAULT false
      );
      CREATE TABLE routing_targets (
        rule_id varchar(255) NOT NULL,
        provider varchar(255),
        model varchar(255),
        key_id varchar(255),
        weight REAL NOT NULL DEFAULT 1
      );
      CREATE TABLE config_providers (
        id integer PRIMARY KEY AUTOINCREMENT,
        name varchar(50) NOT NULL,
        custom_provider_config_json text,
        status varchar(50),
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL
      );
      CREATE TABLE config_keys (
        id integer PRIMARY KEY AUTOINCREMENT,
        name varchar(255) NOT NULL,
        provider_id integer NOT NULL,
        provider varchar(50),
        key_id varchar(255) NOT NULL,
        value text NOT NULL,
        models_json text,
        weight real,
        enabled numeric DEFAULT true,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL
      );
    `);
    raw.run(
      `INSERT INTO routing_rules
       (id, config_hash, name, description, enabled, cel_expression, fallbacks, query, scope, scope_id, priority, created_at, updated_at, chain_rule)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['native-1', 'hash-1', 'Native', '', 1, 'provider == "openai"', '["anthropic/claude"]', '{"ui":true}', 'global', null, 0, '2026-01-01', '2026-01-01', 0],
    );
    raw.run(
      'INSERT INTO routing_targets (rule_id, provider, model, key_id, weight) VALUES (?,?,?,?,?)',
      ['native-1', 'openai', 'gpt-4o', 'key-1', 0.75],
    );
    raw.run(
      'INSERT INTO config_providers (name, custom_provider_config_json, status, created_at, updated_at) VALUES (?,?,?,?,?)',
      ['openai', '{"base_provider_type":"openai"}', 'success', '2026-01-01', '2026-01-01'],
    );
    raw.run(
      'INSERT INTO config_keys (name, provider_id, provider, key_id, value, models_json, weight, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['default', 1, 'openai', 'key-1', 'no_key', '["gpt-4o"]', 1, 1, '2026-01-01', '2026-01-01'],
    );

    const db = BifrostDb.wrap(raw);
    expect(db.detectKind()).toBe('bifrost-routing');
    expect(db.listRules()[0].targets).toEqual([{ provider: 'openai', model: 'gpt-4o', api_key: 'key-1', weight: 0.75 }]);
    expect(db.listRules()[0].fallbacks).toEqual(['anthropic/claude']);
    expect(db.listProviders()[0].id).toBe('openai');
    expect(db.listModels().some((m) => m.id === 'openai/gpt-4o')).toBe(true);

    db.updateRule('native-1', { targets: [{ provider: 'gemini', model: 'gemini-flash', weight: 1 }], fallbacks: [] });
    expect(db.getRule('native-1')?.targets).toEqual([{ provider: 'gemini', model: 'gemini-flash', api_key: undefined, weight: 1 }]);

    db.updateRule('native-1', { cel_expression: 'headers["user-agent"].startsWith("claude-cli") && model.contains("haiku")' });
    const query = JSON.parse(db.listRoutingRulesTableRows()[0].query!);
    expect(query.combinator).toBe('and');
    expect(query.rules[0]).toMatchObject({ field: 'headers', operator: 'beginsWith', value: 'user-agent:claude-cli' });
    expect(query.rules[1]).toMatchObject({ field: 'model', operator: 'contains', value: 'haiku' });
  });



  it('persists pinned fallbacks and projects key ids to config.json key names', () => {
    const pinned = [{ provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'key-1' }];

    // Studio schema: object form survives a create/read roundtrip untouched.
    const studio = newDb();
    studio.createRule(sampleRule({ fallbacks: pinned }));
    expect(studio.listRules()[0].fallbacks).toEqual(pinned);

    // Native schema: the DB row keeps key_id, config.json emits provider_key_name.
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE routing_rules (
        id varchar(255) PRIMARY KEY, config_hash varchar(255), name varchar(255) NOT NULL,
        description TEXT, enabled numeric NOT NULL DEFAULT true, cel_expression TEXT NOT NULL,
        fallbacks TEXT, query TEXT, scope varchar(50) NOT NULL, scope_id varchar(255),
        priority INTEGER NOT NULL DEFAULT 0, created_at datetime NOT NULL,
        updated_at datetime NOT NULL, chain_rule numeric NOT NULL DEFAULT false
      );
      CREATE TABLE routing_targets (rule_id varchar(255) NOT NULL, provider varchar(255), model varchar(255), key_id varchar(255), weight REAL NOT NULL DEFAULT 1);
      CREATE TABLE config_providers (id integer PRIMARY KEY AUTOINCREMENT, name varchar(50) NOT NULL, custom_provider_config_json text, status varchar(50), created_at datetime NOT NULL, updated_at datetime NOT NULL);
      CREATE TABLE config_keys (id integer PRIMARY KEY AUTOINCREMENT, name varchar(255) NOT NULL, provider_id integer NOT NULL, provider varchar(50), key_id varchar(255) NOT NULL, value text NOT NULL, models_json text, weight real, enabled numeric DEFAULT true, created_at datetime NOT NULL, updated_at datetime NOT NULL);
    `);
    raw.run(
      `INSERT INTO routing_rules
       (id, config_hash, name, description, enabled, cel_expression, fallbacks, query, scope, scope_id, priority, created_at, updated_at, chain_rule)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['pin-1', 'hash-1', 'Pinned', '', 1, 'provider == "openai"', JSON.stringify(pinned), null, 'global', null, 0, '2026-01-01', '2026-01-01', 0],
    );
    raw.run(
      'INSERT INTO config_keys (name, provider_id, provider, key_id, value, models_json, weight, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['default', 1, 'vertex', 'key-1', 'no_key', '[]', 1, 1, '2026-01-01', '2026-01-01'],
    );

    const native = BifrostDb.wrap(raw);
    expect(native.listRules()[0].fallbacks).toEqual(pinned);
    expect(native.exportConfig().governance.routing_rules[0].fallbacks)
      .toEqual([{ provider: 'vertex', model: 'gemini-2.5-pro', provider_key_name: 'default' }]);

    // ...and back: provider_key_name resolves to the key id again.
    const config = native.exportConfig();
    native.deleteRule('pin-1');
    native.importConfig(config);
    expect(native.listRules()[0].fallbacks).toEqual([{ provider: 'vertex', model: 'gemini-2.5-pro', key_id: 'key-1' }]);
  });

  it('keeps the key id when no config key name can be resolved', () => {
    const db = newDb();
    db.createRule(sampleRule({ fallbacks: [{ provider: 'vertex', key_id: 'gone' }] }));
    expect(db.exportConfig().governance.routing_rules[0].fallbacks).toEqual([{ provider: 'vertex', key_id: 'gone' }]);
  });

  it('backfills missing native routing_rules.query values from CEL', () => {
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE routing_rules (
        id varchar(255) PRIMARY KEY,
        name varchar(255) NOT NULL,
        enabled numeric NOT NULL DEFAULT true,
        cel_expression TEXT NOT NULL,
        fallbacks TEXT,
        query TEXT,
        scope varchar(50) NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        chain_rule numeric NOT NULL DEFAULT false
      );
      CREATE TABLE routing_targets (rule_id varchar(255) NOT NULL, provider varchar(255), model varchar(255), key_id varchar(255), weight REAL NOT NULL DEFAULT 1);
    `);
    raw.run(
      `INSERT INTO routing_rules (id, name, enabled, cel_expression, fallbacks, query, scope, priority, created_at, updated_at, chain_rule)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ['query-missing', 'Query Missing', 1, 'headers["user-agent"].startsWith("claude-cli") && model.contains("haiku")', '[]', null, 'global', 0, '2026-01-01', '2026-01-01', 0],
    );
    const db = BifrostDb.wrap(raw);
    expect(db.listRoutingRulesTableRows()[0].query).toBeNull();
    expect(db.ensureRoutingRuleQueries()).toBe(1);
    const query = JSON.parse(db.listRoutingRulesTableRows()[0].query!);
    expect(query.combinator).toBe('and');
    expect(query.rules[0]).toMatchObject({ field: 'headers', operator: 'beginsWith', value: 'user-agent:claude-cli' });
    expect(query.rules[1]).toMatchObject({ field: 'model', operator: 'contains', value: 'haiku' });
    expect(db.ensureRoutingRuleQueries()).toBe(0);
  });

  it('replaceAllRules clears previous rules', () => {
    const db = newDb();
    db.createRule(sampleRule({ id: 'old' }));
    db.replaceAllRules([sampleRule({ id: 'new1' }), sampleRule({ id: 'new2' })]);
    expect(db.listRules().map((r) => r.id)).toEqual(['new1', 'new2']);
  });
});
