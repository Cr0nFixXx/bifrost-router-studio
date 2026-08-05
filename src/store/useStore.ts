/**
 * Central application store (Zustand).
 *
 * Owns: the React Flow graph, undo/redo history, layout/UI flags, the live
 * Bifrost DB handle (kept outside React state), the rule/provider caches, the
 * validation diagnostics, simulation state, and persistence.
 *
 * The DB connection is a singleton held in a module variable (NOT store state)
 * because it wraps a WASM handle; the store only mirrors its data.
 */
import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from 'reactflow';
import type { BifrostConfig, ProviderConfig, RoutingRule } from '@/types/bifrost';
import type { NodeKind, WFNode } from '@/types/workflow';
import { PORT_RULES } from '@/types/workflow';
import { defaultData, newId } from '@/lib/nodeFactory';
import { validateGraph, type Diagnostic } from '@/lib/validation';
import { autoLayout, type FlowDirection } from '@/lib/layout';
import { rulesToWorkflow, workflowToRules } from '@/lib/bifrostMapper';
import { reorderWithinGroup } from '@/lib/ruleOrder';
import { diffRules, type RuleDiff } from '@/lib/diff';
import {
  saveSnapshot as persistSnapshot,
  listSnapshots,
  getSnapshot,
  deleteSnapshot as dropSnapshot,
  type RuleSnapshot,
} from '@/lib/db/snapshots';
import { TEMPLATES } from '@/lib/templates';
import { BifrostDb, type RoutingRulesTableRow, type RoutingTargetsTableRow } from '@/lib/db/bifrostDb';
import { createSampleDb } from '@/lib/db/sample';
import { builtInCatalog } from '@/lib/models';
import { cacheDb, loadCachedDb, clearCachedDb } from '@/lib/db/persistence';
import { downloadFile } from '@/lib/io';
import { createRuleUid, isRuleUid } from '@/lib/ruleIds';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface HistorySnapshot {
  nodes: WFNode[];
  edges: Edge[];
}

export interface SimStep {
  nodeId: string;
  kind: string;
  label: string;
  status: 'pending' | 'current' | 'done' | 'fail';
  note?: string;
}

export interface SimResult {
  matched: boolean;
  chosenTarget?: string;
  fallbacksTried: string[];
  elapsedMs: number;
  path: SimStep[];
}

export interface SimInput {
  model: string;
  provider: string;
  request_type: string;
  team_name: string;
  customer_id: string;
  virtual_key_name: string;
  complexity_tier: string;
  budget_used: number;
  tokens_used: number;
  request: number;
  headers: Record<string, string>;
  forcePrimaryFailure: boolean;
}

const DEFAULT_SIM_INPUT: SimInput = {
  model: 'gpt-4o',
  provider: 'openai',
  request_type: 'chat_completion',
  team_name: 'ml-ops',
  customer_id: 'acme',
  virtual_key_name: 'dev-key',
  complexity_tier: 'COMPLEX',
  budget_used: 42,
  tokens_used: 31,
  request: 18,
  headers: { 'x-tier': 'premium', 'x-region': 'us-east', client: 'claude' },
  forcePrimaryFailure: false,
};

export interface DiffView {
  title: string;
  subtitle?: string;
  diffs: RuleDiff[];
  onRestore?: () => void;
  restoreLabel?: string;
}

interface StudioState {
  /* connection */
  connection: ConnectionState;
  dbFileName: string | null;
  dbKind: string | null;
  busy: boolean;
  dirty: boolean;
  error: string | null;

  /* graph */
  nodes: WFNode[];
  edges: Edge[];
  direction: FlowDirection;
  diagnostics: Diagnostic[];
  selectedNodeId: string | null;

  /* ui */
  expertMode: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  wizardOpen: boolean;
  wizardDraft: RoutingRule | null;
  templatesOpen: boolean;
  dashboardOpen: boolean;
  settingsOpen: boolean;
  sqlBrowserOpen: boolean;
  helpOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  highlightedNodeIds: string[];
  canvasLocked: boolean;
  canvasMode: 'select' | 'drag';
  leftWidth: number;
  rightWidth: number;
  activeRightTab: 'inspector' | 'providers' | 'simulation' | 'rules' | 'history';

  /* bifrost data (mirror of the DB) */
  rules: RoutingRule[];
  providers: ProviderConfig[];
  modelCatalog: Array<{ id: string; provider?: string; label?: string; model?: string }>;

  /* history */
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  _lastCommit: { tag: string; t: number } | null;

  /* simulation */
  sim: SimResult | null;
  simRunning: boolean;
  simInput: SimInput;
  simPlaybackIndex: number;

  /* connection actions */
  connectFromFile: (file: File) => Promise<void>;
  connectSample: () => Promise<void>;
  createNew: () => Promise<void>;
  reconnectCached: () => Promise<void>;
  disconnect: () => void;
  refreshFromDb: () => void;
  saveToDb: () => Promise<void>;
  downloadDb: () => void;
  importConfig: (config: BifrostConfig) => Promise<void>;
  upsertRoutingRuleDirect: (rule: RoutingRule) => Promise<void>;
  deleteRoutingRuleDirect: (id: string) => Promise<void>;
  listRoutingRulesTableRows: () => RoutingRulesTableRow[];
  listRoutingTargetsTableRows: () => RoutingTargetsTableRow[];
  saveRoutingRuleTableRow: (originalId: string | null, row: RoutingRulesTableRow) => Promise<void>;
  deleteRoutingRuleTableRow: (id: string) => Promise<void>;
  saveRoutingTargetTableRow: (row: RoutingTargetsTableRow) => Promise<void>;
  deleteRoutingTargetTableRow: (rowid: number) => Promise<void>;

  /* graph actions */
  onNodesChange: (c: NodeChange[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  onNodeDragStop: () => void;
  deleteEdge: (id: string) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  addNode: (kind: NodeKind, position?: { x: number; y: number }, data?: Record<string, unknown>) => string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  duplicateRule: (ruleId: string) => void;
  copyRuleJson: (ruleId: string) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  setGraph: (nodes: WFNode[], edges: Edge[]) => void;
  applyTemplate: (templateId: string) => void;

  /* history */
  commit: (tag?: string) => void;
  undo: () => void;
  redo: () => void;

  /* ui actions */
  setDirection: (d: FlowDirection) => void;
  autoArrange: () => void;
  simplifyConditions: () => void;
  expandConditions: () => void;
  toggleExpert: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setRightTab: (tab: StudioState['activeRightTab']) => void;
  selectNode: (id: string | null) => void;
  setWizardOpen: (open: boolean) => void;
  setWizardDraft: (draft: RoutingRule | null) => void;
  setTemplatesOpen: (open: boolean) => void;
  setDashboardOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSqlBrowserOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setHighlightedNodeIds: (ids: string[]) => void;
  setCanvasLocked: (locked: boolean) => void;
  setCanvasMode: (mode: 'select' | 'drag') => void;
  setModelCatalog: (models: Array<{ id: string; provider?: string; label?: string; model?: string }>) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  toggleNodeSelection: (id: string) => void;

  /* derived */
  recompute: () => void;
  markDirty: () => void;

  /* data actions */
  fetchModels: () => void;
  upsertProvider: (provider: ProviderConfig) => Promise<void>;
  reorderRulePriority: (ruleId: string, direction: 'up' | 'down') => void;

  /* canvas -> rules projection + diffing */
  getCanvasRules: () => RoutingRule[];
  reorderRulesByIds: (ids: string[]) => void;
  previewDbDiff: () => RuleDiff[];
  diffView: DiffView | null;
  showDiff: (view: DiffView) => void;
  closeDiff: () => void;
  openDbDiff: () => void;

  /* rule-set snapshots (lightweight version control) */
  snapshots: RuleSnapshot[];
  loadSnapshots: () => Promise<void>;
  saveSnapshot: (label?: string) => Promise<void>;
  restoreSnapshot: (id: string) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  previewSnapshotDiff: (id: string) => Promise<RuleDiff[] | null>;
  applyRuleset: (rules: RoutingRule[], providers?: ProviderConfig[]) => void;

  /* simulation */
  setSimInput: (patch: Partial<SimInput>) => void;
  resetSimInput: () => void;
  runSimulation: () => Promise<void>;
  clearSimulation: () => void;
}

/* The live WASM database handle (kept out of reactive state). */
let activeDb: BifrostDb | null = null;
let simPlaybackTimer: ReturnType<typeof setInterval> | null = null;
export const getDb = () => activeDb;

const snapshot = (s: StudioState): HistorySnapshot => ({ nodes: s.nodes, edges: s.edges });


function syncChainEdges(_nodes: WFNode[], edges: Edge[]): Edge[] {
  // Older builds drew chain_rule as trigger -> next-trigger edges. That was a
  // wrong relation: Bifrost re-evaluates all routing rules with a new context
  // after a match. Strip stale chain visualization edges instead of preserving
  // a misleading direct dependency.
  return edges.filter((e) => e.sourceHandle !== 'chainout' && e.targetHandle !== 'chainin');
}

function migrateLegacyComplexityNodes(nodes: WFNode[]): WFNode[] {
  return nodes.map((node) => {
    if ((node.data as any).kind !== 'complexity') return node;
    const tier = (node.data as any).tier ?? 'COMPLEX';
    return {
      ...node,
      type: 'condition',
      data: {
        kind: 'condition',
        label: `complexity_tier == ${tier}`,
        field: 'complexity_tier',
        op: '==',
        value: tier,
      },
    } as WFNode;
  });
}

function repairDuplicateRuleIds(nodes: WFNode[]): { nodes: WFNode[]; repaired: number; ids: string[] } {
  const seen = new Set<string>();
  const repairedIds: string[] = [];
  let repaired = 0;
  const makeFresh = () => {
    let fresh = createRuleUid();
    while (seen.has(fresh) || nodes.some((n) => n.id === fresh)) fresh = createRuleUid();
    return fresh;
  };
  const next = nodes.map((node) => {
    if (node.data.kind !== 'trigger') return node;
    const data = node.data as any;
    const current = data.ruleId;
    const ruleId = isRuleUid(current) ? current : makeFresh();
    if (!isRuleUid(current)) {
      seen.add(ruleId);
      repaired += 1;
      repairedIds.push(String(current ?? node.id));
      return { ...node, data: { ...node.data, ruleId } as WFNode['data'] } as WFNode;
    }
    if (!seen.has(ruleId)) {
      seen.add(ruleId);
      return node;
    }

    // A duplicated Rule node must become a new persisted rule. Keep the
    // React Flow node id stable and generate a fresh UUID DB id.
    const fresh = makeFresh();
    seen.add(fresh);
    repaired += 1;
    repairedIds.push(ruleId);
    return { ...node, data: { ...node.data, ruleId: fresh } as WFNode['data'] } as WFNode;
  });
  return { nodes: next, repaired, ids: repairedIds };
}

export const useStore = create<StudioState>((set, get) => ({
  connection: 'disconnected',
  dbFileName: null,
  dbKind: null,
  busy: false,
  dirty: false,
  error: null,

  nodes: [],
  edges: [],
  direction: 'LR',
  diagnostics: [],
  selectedNodeId: null,

  expertMode: false,
  leftCollapsed: false,
  rightCollapsed: false,
  wizardOpen: false,
  wizardDraft: null,
  templatesOpen: false,
  dashboardOpen: false,
  settingsOpen: false,
  sqlBrowserOpen: false,
  helpOpen: false,
  searchOpen: false,
  searchQuery: '',
  highlightedNodeIds: [],
  canvasLocked: false,
  canvasMode: 'drag',
  leftWidth: 260,
  rightWidth: 420,
  activeRightTab: 'inspector',

  rules: [],
  providers: [],
  modelCatalog: [],

  past: [],
  future: [],
  _lastCommit: null,

  sim: null,
  simRunning: false,
  simInput: DEFAULT_SIM_INPUT,
  simPlaybackIndex: 0,

  diffView: null,
  snapshots: [],

  /* --------------------------- connect ----------------------------- */
  connectFromFile: async (file) => {
    set({ connection: 'connecting', busy: true, error: null });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      activeDb = await BifrostDb.open(buf);
      set({ dbFileName: file.name, dbKind: activeDb.detectKind(), connection: 'connected', busy: false });
      get().refreshFromDb();
      await cacheDb(activeDb.exportBytes(), file.name);
    } catch (err) {
      set({ error: (err as Error).message, connection: 'disconnected', busy: false });
    }
  },

  connectSample: async () => {
    set({ connection: 'connecting', busy: true, error: null });
    try {
      activeDb = await createSampleDb();
      set({ dbFileName: 'sample-bifrost.db', dbKind: 'bifrost-routing', connection: 'connected', busy: false });
      get().refreshFromDb();
    } catch (err) {
      set({ error: (err as Error).message, connection: 'disconnected', busy: false });
    }
  },

  createNew: async () => {
    set({ connection: 'connecting', busy: true, error: null });
    try {
      activeDb = await BifrostDb.open();
      set({ dbFileName: 'untitled-bifrost.db', dbKind: 'empty', connection: 'connected', busy: false });
      get().refreshFromDb();
    } catch (err) {
      set({ error: (err as Error).message, connection: 'disconnected', busy: false });
    }
  },

  reconnectCached: async () => {
    set({ connection: 'connecting', busy: true, error: null });
    try {
      const cached = await loadCachedDb();
      if (!cached) throw new Error('No cached session');
      activeDb = await BifrostDb.open(cached.bytes);
      set({ dbFileName: cached.fileName, dbKind: activeDb.detectKind(), connection: 'connected', busy: false });
      get().refreshFromDb();
    } catch (err) {
      set({ error: (err as Error).message, connection: 'disconnected', busy: false });
    }
  },

  disconnect: () => {
    activeDb?.close();
    activeDb = null;
    set({
      connection: 'disconnected',
      dbFileName: null,
      dbKind: null,
      nodes: [],
      edges: [],
      rules: [],
      providers: [],
      modelCatalog: [],
      diagnostics: [],
      selectedNodeId: null,
      dashboardOpen: false,
      settingsOpen: false,
      sqlBrowserOpen: false,
      helpOpen: false,
      searchOpen: false,
      searchQuery: '',
      highlightedNodeIds: [],
      canvasLocked: false,
      canvasMode: 'drag',
      dirty: false,
    });
  },

  refreshFromDb: () => {
    if (!activeDb) return;
    const rules = activeDb.listRules();
    const providers = activeDb.listProviders();
    const { nodes, edges } = rulesToWorkflow(rules, { dedupeConditions: !get().expertMode });
    set({ rules, providers, nodes, edges: syncChainEdges(nodes, edges), dirty: false, selectedNodeId: null });
    get().fetchModels();
    get().recompute();
  },

  saveToDb: async () => {
    if (!activeDb) return;
    set({ busy: true, error: null });
    try {
      const repair = repairDuplicateRuleIds(get().nodes);
      if (repair.repaired > 0) {
        console.warn(`[Bifrost Router Studio] Repaired ${repair.repaired} duplicate rule id(s) before saving`, repair.ids);
        set({ nodes: repair.nodes });
      }
      // Mirror the canvas graph -> routing rules in the DB.
      const rules = workflowToRules(repair.nodes, get().edges);
      activeDb.replaceAllRules(rules);
      // Backfill Bifrost dashboard query-builder JSON for every saved native rule.
      activeDb.ensureRoutingRuleQueries();
      // Persist providers edited in the UI.
      for (const p of get().providers) activeDb.upsertProvider(p);
      await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.db');
      set({ rules: activeDb.listRules(), providers: activeDb.listProviders(), dirty: false, busy: false });
      get().recompute();
    } catch (err) {
      set({ error: (err as Error).message, busy: false });
      throw err;
    }
  },

  downloadDb: () => {
    if (!activeDb) return;
    activeDb.ensureRoutingRuleQueries();
    const name = get().dbFileName ?? 'bifrost.db';
    downloadFile(name.replace(/\.(db|sqlite|sqlite3)$/i, '') + '.db', activeDb.exportBytes(), 'application/x-sqlite3');
  },

  importConfig: async (config) => {
    if (!activeDb) throw new Error('No database connected');
    activeDb.importConfig(config);
    set({ dirty: true });
    get().refreshFromDb();
  },
  upsertRoutingRuleDirect: async (rule) => {
    if (!activeDb) throw new Error('No database connected');
    const exists = !!activeDb.getRule(rule.id);
    if (exists) activeDb.updateRule(rule.id, rule);
    else activeDb.createRule(rule);
    await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.sqlite');
    get().refreshFromDb();
  },
  deleteRoutingRuleDirect: async (id) => {
    if (!activeDb) throw new Error('No database connected');
    activeDb.deleteRule(id);
    await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.sqlite');
    get().refreshFromDb();
  },
  listRoutingRulesTableRows: () => activeDb?.listRoutingRulesTableRows() ?? [],
  listRoutingTargetsTableRows: () => activeDb?.listRoutingTargetsTableRows() ?? [],
  saveRoutingRuleTableRow: async (originalId, row) => {
    if (!activeDb) throw new Error('No database connected');
    activeDb.saveRoutingRuleTableRow(originalId, row);
    await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.sqlite');
    get().refreshFromDb();
  },
  deleteRoutingRuleTableRow: async (id) => {
    if (!activeDb) throw new Error('No database connected');
    activeDb.deleteRoutingRuleTableRow(id);
    await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.sqlite');
    get().refreshFromDb();
  },
  saveRoutingTargetTableRow: async (row) => {
    if (!activeDb) throw new Error('No database connected');
    activeDb.saveRoutingTargetTableRow(row);
    await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.sqlite');
    get().refreshFromDb();
  },
  deleteRoutingTargetTableRow: async (rowid) => {
    if (!activeDb) throw new Error('No database connected');
    activeDb.deleteRoutingTargetTableRow(rowid);
    await cacheDb(activeDb.exportBytes(), get().dbFileName ?? 'bifrost.sqlite');
    get().refreshFromDb();
  },

  /* ----------------------------- graph ----------------------------- */
  onNodesChange: (changes) => {
    if (get().canvasLocked && changes.some((c) => c.type !== 'select')) return;
    set({ nodes: applyNodeChanges(changes, get().nodes) as WFNode[] });
    if (changes.some((c) => c.type === 'remove')) {
      get().commit();
      get().markDirty();
      get().recompute();
    }
  },
  onEdgesChange: (changes) => {
    if (get().canvasLocked) return;
    set({ edges: applyEdgeChanges(changes, get().edges) });
    get().commit();
    get().markDirty();
    get().recompute();
  },
  onConnect: (connection) => {
    if (get().canvasLocked) return;
    if (!isValidConnection(connection)) return; // strict port enforcement
    get().commit();
    set({
      edges: addEdge(
        {
          ...connection,
          type: 'flow',
          sourceHandle: connection.sourceHandle ?? 'out',
          targetHandle: connection.targetHandle ?? 'in',
        },
        get().edges,
      ),
    });
    get().markDirty();
    get().recompute();
  },
  onNodeDragStop: () => {
    get().commit('drag');
    get().markDirty();
  },
  deleteEdge: (id) => {
    if (get().canvasLocked) return;
    get().commit('edge:delete');
    set({ edges: get().edges.filter((e) => e.id !== id) });
    get().markDirty();
    get().recompute();
  },
  updateEdgeLabel: (id, label) => {
    if (get().canvasLocked) return;
    set({
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data ?? {}), label: label.trim() || undefined } } : e,
      ),
    });
    get().markDirty();
  },

  addNode: (kind, position, data) => {
    if (get().canvasLocked) return '';
    get().commit();
    const id = newId(kind);
    const nodeData = { ...defaultData(kind), ...(data ?? {}) } as WFNode['data'];
    if (kind === 'trigger') (nodeData as any).ruleId = createRuleUid();
    const node: WFNode = {
      id,
      type: kind,
      position: position ?? { x: 280 + Math.random() * 120, y: 140 + Math.random() * 120 },
      data: nodeData,
    };
    set({ nodes: [...get().nodes, node], selectedNodeId: id });
    get().markDirty();
    get().recompute();
    return id;
  },

  updateNodeData: (id, patch) => {
    if (get().canvasLocked) return;
    get().commit(`edit:${id}`);
    const nodes = get().nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...patch } as WFNode['data'] } : n,
    );
    set({ nodes, edges: syncChainEdges(nodes, get().edges) });
    get().markDirty();
    get().recompute();
  },

  deleteNode: (id) => {
    if (get().canvasLocked) return;
    get().commit();
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
    get().markDirty();
    get().recompute();
  },

  deleteSelected: () => {
    if (get().canvasLocked) return;
    const nodes = get().nodes;
    const toDelete = new Set<string>();
    const addWithDescendants = (id: string) => {
      toDelete.add(id);
      for (const m of nodes) if (m.parentNode === id) addWithDescendants(m.id);
    };
    for (const n of nodes) if (n.selected) addWithDescendants(n.id);
    if (get().selectedNodeId) addWithDescendants(get().selectedNodeId!);
    if (toDelete.size === 0) return;
    get().commit();
    set({
      nodes: nodes.filter((n) => !toDelete.has(n.id)),
      edges: get().edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)),
      selectedNodeId: get().selectedNodeId && toDelete.has(get().selectedNodeId!) ? null : get().selectedNodeId,
    });
    get().markDirty();
    get().recompute();
  },

  groupSelected: () => {
    const nodes = get().nodes;
    const sel = nodes.filter((n) => n.selected && n.data.kind !== 'group');
    if (sel.length < 2) return;
    const PAD = 36;
    const SIZE = { w: 248, h: 132 };
    const minX = Math.min(...sel.map((n) => n.position.x)) - PAD;
    const minY = Math.min(...sel.map((n) => n.position.y)) - PAD - 14;
    const maxX = Math.max(...sel.map((n) => n.position.x + SIZE.w)) + PAD;
    const maxY = Math.max(...sel.map((n) => n.position.y + SIZE.h)) + PAD;
    const w = maxX - minX;
    const h = maxY - minY;
    const gid = newId('group');
    const groupNode = {
      id: gid,
      type: 'group',
      position: { x: minX, y: minY },
      data: { kind: 'group', label: 'Group' },
      selected: true,
      zIndex: 0,
      style: { width: w, height: h },
    } as WFNode;
    const childIds = new Set(sel.map((n) => n.id));
    const updated = nodes.map((n) =>
      childIds.has(n.id)
        ? ({
            ...n,
            parentNode: gid,
            extent: 'parent' as const,
            selected: false,
            position: { x: n.position.x - minX, y: n.position.y - minY },
          } as WFNode)
        : n,
    );
    get().commit();
    set({ nodes: [groupNode, ...updated], selectedNodeId: gid });
    get().markDirty();
    get().recompute();
  },

  ungroupSelected: () => {
    const nodes = get().nodes;
    const groupIds = nodes.filter((n) => n.selected && n.data.kind === 'group').map((n) => n.id);
    if (groupIds.length === 0) return;
    const groupSet = new Set(groupIds);
    const groupPos = new Map(nodes.filter((n) => groupSet.has(n.id)).map((n) => [n.id, n.position]));
    const updated = nodes.flatMap((n) => {
      if (groupSet.has(n.id)) return [] as WFNode[];
      if (n.parentNode && groupSet.has(n.parentNode)) {
        const g = groupPos.get(n.parentNode)!;
        return [
          ({
            ...n,
            parentNode: undefined,
            extent: undefined,
            selected: false,
            position: { x: n.position.x + g.x, y: n.position.y + g.y },
          } as WFNode),
        ];
      }
      return [n];
    });
    get().commit();
    set({ nodes: updated, selectedNodeId: null });
    get().markDirty();
    get().recompute();
  },

  duplicateSelected: () => {
    const id = get().selectedNodeId;
    const node = get().nodes.find((n) => n.id === id);
    if (node) {
      const patch: Record<string, unknown> = { ...(node.data as object) };
      if (node.data.kind === 'trigger') {
        delete (patch as any).ruleId;
        patch.label = `${(node.data as any).label ?? 'Rule'} copy`;
      }
      const newId = get().addNode(node.data.kind, { x: node.position.x + 48, y: node.position.y + 48 }, patch);
      set({ selectedNodeId: newId });
    }
  },
  duplicateRule: (ruleId) => {
    if (get().canvasLocked) return;
    const rules = get().getCanvasRules();
    const src = rules.find((r) => r.id === ruleId);
    if (!src) return;
    const maxPriority = rules.length ? Math.max(...rules.map((r) => r.priority ?? 0)) : 0;
    const copy: RoutingRule = {
      ...src,
      id: createRuleUid(),
      name: `${src.name} copy`,
      priority: maxPriority + 1,
      created_at: undefined,
      updated_at: undefined,
    };
    const { nodes, edges } = rulesToWorkflow([...rules, copy]);
    get().commit('duplicate-rule');
    set({ nodes, edges: syncChainEdges(nodes, edges), selectedNodeId: copy.id });
    get().markDirty();
    get().recompute();
  },
  copyRuleJson: (ruleId) => {
    const rule = get().getCanvasRules().find((r) => r.id === ruleId);
    if (!rule) return;
    downloadFile(`${rule.name.replace(/[^a-z0-9_-]+/gi, '_') || 'rule'}.json`, JSON.stringify({ type: 'rule_draft', rules: [rule] }, null, 2), 'application/json');
  },

  setGraph: (nodes, edges) => {
    get().commit();
    const migratedNodes = migrateLegacyComplexityNodes(nodes);
    set({ nodes: migratedNodes, edges: syncChainEdges(migratedNodes, edges), selectedNodeId: null });
    get().markDirty();
    get().recompute();
  },

  applyTemplate: (templateId) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    get().commit();
    const { nodes, edges } = tpl.build();
    const migratedNodes = migrateLegacyComplexityNodes(nodes);
    set({ nodes: migratedNodes, edges: syncChainEdges(migratedNodes, edges), selectedNodeId: null });
    get().markDirty();
    get().recompute();
  },

  /* ---------------------------- history ---------------------------- */
  commit: (tag) => {
    const now = Date.now();
    const last = get()._lastCommit;
    if (tag && last && last.tag === tag && now - last.t < 700) {
      set({ _lastCommit: { tag, t: now } });
      return;
    }
    set({
      past: [...get().past, snapshot(get())].slice(-60),
      future: [],
      _lastCommit: tag ? { tag, t: now } : null,
    });
  },
  undo: () => {
    const past = get().past;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      future: [snapshot(get()), ...get().future].slice(0, 60),
      past: past.slice(0, -1),
      nodes: prev.nodes,
      edges: prev.edges,
      _lastCommit: null,
    });
    get().markDirty();
    get().recompute();
  },
  redo: () => {
    const future = get().future;
    if (future.length === 0) return;
    const next = future[0];
    set({
      past: [...get().past, snapshot(get())],
      future: future.slice(1),
      nodes: next.nodes,
      edges: next.edges,
      _lastCommit: null,
    });
    get().markDirty();
    get().recompute();
  },

  /* ------------------------------ ui ------------------------------- */
  setDirection: (direction) => {
    set({ direction });
    get().autoArrange();
  },
  autoArrange: () => set({ nodes: autoLayout(get().nodes, get().edges, get().direction) }),
  simplifyConditions: () => {
    const rules = get().getCanvasRules();
    const { nodes, edges } = rulesToWorkflow(rules, { dedupeConditions: true });
    get().commit('simplify-conditions');
    set({ nodes, edges: syncChainEdges(nodes, edges), selectedNodeId: null });
    get().markDirty();
    get().recompute();
  },
  expandConditions: () => {
    const rules = get().getCanvasRules();
    const { nodes, edges } = rulesToWorkflow(rules, { dedupeConditions: false });
    get().commit('expand-conditions');
    set({ nodes, edges: syncChainEdges(nodes, edges), selectedNodeId: null });
    get().markDirty();
    get().recompute();
  },
  toggleExpert: () => set({ expertMode: !get().expertMode }),
  toggleLeft: () => set({ leftCollapsed: !get().leftCollapsed }),
  toggleRight: () => set({ rightCollapsed: !get().rightCollapsed }),
  setRightTab: (activeRightTab) => set({ activeRightTab, rightCollapsed: false }),
  selectNode: (selectedNodeId) => set({
    selectedNodeId,
    nodes: get().nodes.map((n) => ({ ...n, selected: selectedNodeId ? n.id === selectedNodeId : false })),
  }),
  toggleNodeSelection: (id) => set({
    selectedNodeId: id,
    nodes: get().nodes.map((n) => n.id === id ? { ...n, selected: !n.selected } : n),
  }),
  setWizardOpen: (wizardOpen) => set({ wizardOpen }),
  setWizardDraft: (wizardDraft) => set({ wizardDraft }),
  setTemplatesOpen: (open) => set({ templatesOpen: open }),
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSqlBrowserOpen: (open) => set({ sqlBrowserOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setHighlightedNodeIds: (highlightedNodeIds) => set({ highlightedNodeIds }),
  setCanvasLocked: (canvasLocked) => set({ canvasLocked }),
  setCanvasMode: (canvasMode) => set({ canvasMode }),
  setLeftWidth: (width) => set({ leftWidth: Math.max(180, Math.min(520, width)) }),
  setRightWidth: (width) => set({ rightWidth: Math.max(300, Math.min(720, width)) }),

  recompute: () => set({ diagnostics: validateGraph(get().nodes, get().edges) }),
  markDirty: () => {
    if (!get().dirty) set({ dirty: true });
    const db = getDb();
    const name = get().dbFileName;
    if (db && name) cacheDb(db.exportBytes(), name).catch(() => {});
  },

  /* ---------------------------- data ------------------------------- */
  fetchModels: () => {
    if (!activeDb) {
      set({ modelCatalog: builtInCatalog() });
      return;
    }
    const m = activeDb.listModels();
    set({ modelCatalog: m.length ? m : builtInCatalog() });
  },
  setModelCatalog: (modelCatalog) => set({ modelCatalog }),
  upsertProvider: async (provider) => {
    if (activeDb) activeDb.upsertProvider(provider);
    const providers = activeDb ? activeDb.listProviders() : [...get().providers.filter((p) => p.id !== provider.id), provider];
    set({ providers });
    get().markDirty();
  },
  reorderRulePriority: (ruleId, direction) => {
    const sorted = get().getCanvasRules();
    const idx = sorted.findIndex((r) => r.id === ruleId);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapWith];
    const map = { [a.id]: b.priority, [b.id]: a.priority };
    if (activeDb) activeDb.reorderRules(map);
    const nodes = get().nodes.map((n) => {
      if (n.data.kind !== 'trigger') return n;
      const id = n.data.ruleId ?? n.id;
      return map[id] === undefined ? n : { ...n, data: { ...n.data, priority: map[id] } };
    });
    set({
      nodes,
      edges: syncChainEdges(nodes, get().edges),
      rules: get().rules.map((r) => ({ ...r, priority: map[r.id] ?? r.priority })),
    });
    get().commit('reorder');
    get().markDirty();
    get().recompute();
  },

  /* -------------------------- simulation --------------------------- */
  setSimInput: (patch) => set({ simInput: { ...get().simInput, ...patch } }),
  resetSimInput: () => set({ simInput: DEFAULT_SIM_INPUT }),
  runSimulation: async () => {
    if (simPlaybackTimer) {
      clearInterval(simPlaybackTimer);
      simPlaybackTimer = null;
    }
    set({ simRunning: true, sim: null, simPlaybackIndex: 0 });
    const result = await simulate(get().nodes, get().edges, get().simInput);
    set({ sim: result, simRunning: false, simPlaybackIndex: 0 });
    simPlaybackTimer = setInterval(() => {
      const cur = useStore.getState().simPlaybackIndex;
      const max = useStore.getState().sim?.path.length ?? 0;
      if (cur >= max - 1) {
        if (simPlaybackTimer) clearInterval(simPlaybackTimer);
        simPlaybackTimer = null;
        return;
      }
      useStore.setState({ simPlaybackIndex: cur + 1 });
    }, 550);
  },
  /* --------------------------- diffing ----------------------------- */
  getCanvasRules: () => workflowToRules(get().nodes, get().edges),
  reorderRulesByIds: (ids) => {
    if (ids.length === 0) return;
    const map = reorderWithinGroup(get().getCanvasRules(), ids);
    if (activeDb) activeDb.reorderRules(map);
    const nodes = get().nodes.map((n) => {
      if (n.data.kind !== 'trigger') return n;
      const id = n.data.ruleId ?? n.id;
      return map[id] === undefined ? n : { ...n, data: { ...n.data, priority: map[id] } };
    });
    set({
      nodes,
      edges: syncChainEdges(nodes, get().edges),
      rules: get().rules.map((r) => ({ ...r, priority: map[r.id] ?? r.priority })),
    });
    get().commit('reorder');
    get().markDirty();
    get().recompute();
  },
  previewDbDiff: () => diffRules(activeDb ? activeDb.listRules() : [], get().getCanvasRules()),
  showDiff: (view) => set({ diffView: view }),
  closeDiff: () => set({ diffView: null }),
  openDbDiff: () => {
    const diffs = get().previewDbDiff();
    get().showDiff({
      title: 'Diff: canvas → live database',
      subtitle: 'These are the changes Save would write into the .sqlite file.',
      diffs,
      onRestore: () => {
        get().saveToDb();
        get().closeDiff();
      },
      restoreLabel: 'Save to database',
    });
  },

  /* ----------------------- snapshot versioning ---------------------- */
  loadSnapshots: async () => {
    const name = get().dbFileName;
    if (!name) {
      set({ snapshots: [] });
      return;
    }
    set({ snapshots: await listSnapshots(name) });
  },
  saveSnapshot: async (label) => {
    const name = get().dbFileName ?? 'untitled';
    const snap = await persistSnapshot(name, {
      label: (label ?? '').trim() || `Snapshot ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      rules: get().getCanvasRules(),
      providers: get().providers,
    });
    set({ snapshots: [snap, ...get().snapshots] });
  },
  deleteSnapshot: async (id) => {
    const name = get().dbFileName;
    if (!name) return;
    await dropSnapshot(name, id);
    set({ snapshots: get().snapshots.filter((s) => s.id !== id) });
  },
  restoreSnapshot: async (id) => {
    const name = get().dbFileName;
    if (!name) return;
    const snap = await getSnapshot(name, id);
    if (!snap) return;
    get().applyRuleset(snap.rules, snap.providers);
  },
  previewSnapshotDiff: async (id) => {
    const name = get().dbFileName;
    if (!name) return null;
    const snap = await getSnapshot(name, id);
    if (!snap) return null;
    return diffRules(get().getCanvasRules(), snap.rules);
  },
  applyRuleset: (rules, providers) => {
    const { nodes, edges } = rulesToWorkflow(rules, { dedupeConditions: !get().expertMode });
    if (activeDb) {
      activeDb.replaceAllRules(rules);
      for (const prov of providers ?? []) activeDb.upsertProvider(prov);
    }
    set({
      nodes,
      edges,
      rules: activeDb ? activeDb.listRules() : rules,
      providers: providers ?? get().providers,
    });
    get().commit('restore');
    get().markDirty();
    get().recompute();
  },

  clearSimulation: () => {
    if (simPlaybackTimer) clearInterval(simPlaybackTimer);
    simPlaybackTimer = null;
    set({ sim: null, simPlaybackIndex: 0, simRunning: false });
  },
}));

/* --------------------------- port rules ----------------------------- */
/* Strict connection validation using the declared PORT_RULES table. A source
 * handle may only connect to a compatible target handle, e.g. a trigger's
 * "out" may target "target.in" or "complexity.in", never a "fallback.in". */
function handleName(h?: string | null): string {
  return (h ?? 'out').split('.').pop() ?? 'out';
}

export function isValidConnection(connection: Connection): boolean {
  const nodes = useStore.getState().nodes;
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source || !target) return false;
  if (source.id === target.id) return false; // no self-loops

  const from = `${source.data.kind}.${handleName(connection.sourceHandle)}`;
  const to = `${target.data.kind}.${handleName(connection.targetHandle)}`;
  const allowed = PORT_RULES[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/* ----------------------------- simulation --------------------------- */
/**
 * Mock request traversal. Picks the first enabled trigger whose CEL is truthy
 * under a synthetic request context, then walks its target/fallback chain,
 * failing fallbacks probabilistically to demonstrate the routing path.
 */
async function simulate(nodes: WFNode[], edges: Edge[], input: SimInput = DEFAULT_SIM_INPUT): Promise<SimResult> {
  const start = performance.now();
  const path: SimStep[] = [];

  const ctx: Record<string, unknown> = {
    model: input.model,
    provider: input.provider,
    request_type: input.request_type,
    team_name: input.team_name,
    customer_id: input.customer_id,
    virtual_key_name: input.virtual_key_name,
    complexity_tier: input.complexity_tier,
    budget_used: input.budget_used,
    tokens_used: input.tokens_used,
    request: input.request,
    headers: input.headers ?? {},
    params: {},
  };

  const triggers = nodes.filter((n) => n.data.kind === 'trigger');
  const projectedRules = workflowToRules(nodes, edges);
  const ruleForTrigger = (t: WFNode) => projectedRules.find((r) => r.id === ((t.data as any).ruleId ?? t.id));
  const evaluate = (expr: string): boolean => {
    try {
      return evalCEL(expr, ctx);
    } catch {
      return false;
    }
  };

  const sorted = [...triggers].sort((a, b) => ((a.data as any).priority ?? 0) - ((b.data as any).priority ?? 0));
  const matched = sorted.find((t) => evaluate(ruleForTrigger(t)?.cel_expression ?? (t.data as any).celExpression ?? 'true'));

  for (const t of sorted) {
    path.push({
      nodeId: t.id,
      kind: 'trigger',
      label: t.data.label,
      status: t.id === matched?.id ? 'current' : 'pending',
      note: t.id === matched?.id ? 'condition matched' : 'evaluated, no match',
    });
  }

  if (!matched) {
    return { matched: false, fallbacksTried: [], elapsedMs: performance.now() - start, path };
  }

  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (e.sourceHandle === 'chainout' || e.targetHandle === 'chainin') return;
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  });

  const reachable = (startId: string, kind: string): WFNode[] => {
    const out: WFNode[] = [];
    const seen = new Set<string>([startId]);
    const queue = [...(adj.get(startId) ?? [])];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      if (node.data.kind === kind) out.push(node);
      else queue.push(...(adj.get(id) ?? []));
    }
    return out;
  };

  const pathTo = (startId: string, endId: string): WFNode[] => {
    const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.id === endId) return cur.path.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as WFNode[];
      if (seen.has(cur.id)) continue;
      seen.add(cur.id);
      for (const next of adj.get(cur.id) ?? []) queue.push({ id: next, path: [...cur.path, next] });
    }
    return [];
  };

  const targets = reachable(matched.id, 'target');

  const weights = targets.map((t) => {
    const routes = (t.data as any).routes;
    return routes?.length ? routes.reduce((acc: number, r: any) => acc + Number(r.weight ?? 0), 0) : ((t.data as any).weight ?? 0);
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let r = Math.random() * total;
  let chosenIdx = 0;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosenIdx = i;
      break;
    }
  }
  const chosen = targets[chosenIdx];
  if (chosen) {
    const fullRoute = pathTo(matched.id, chosen.id).slice(1);
    const emitted = new Set<string>();
    const emitNode = (n: WFNode, note: string, status: SimStep['status'] = 'done') => {
      if (emitted.has(n.id)) return;
      emitted.add(n.id);
      path.push({ nodeId: n.id, kind: n.data.kind, label: (n.data as any).label ?? n.data.kind, status, note });
    };
    const emitLogicInputs = (logicId: string) => {
      const inputs = edges
        .filter((e) => e.target === logicId)
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n): n is WFNode => !!n && (n.data.kind === 'condition' || n.data.kind === 'logic'));
      for (const input of inputs) {
        if (input.data.kind === 'logic') emitLogicInputs(input.id);
        emitNode(input, 'condition evaluated');
      }
    };
    for (const n of fullRoute) {
      if (n.data.kind === 'logic') emitLogicInputs(n.id);
      emitNode(n, n.id === chosen.id ? `selected (${(weights[chosenIdx] * 100).toFixed(0)}% route weight)` : 'rule condition path', n.id === chosen.id ? 'current' : 'done');
    }
  }
  targets.forEach((t, i) => {
    if (i === chosenIdx) return;
    path.push({
      nodeId: t.id,
      kind: 'target',
      label: t.data.label,
      status: 'pending',
      note: 'not selected',
    });
  });

  if (!chosen) return { matched: true, elapsedMs: performance.now() - start, path, fallbacksTried: [] };

  const chosenModel = reachable(chosen.id, 'model')[0];
  if (chosenModel) {
    path.push({ nodeId: chosenModel.id, kind: 'model', label: chosenModel.data.label, status: 'current', note: 'model endpoint' });
  }
  const fallbackAnchor = chosenModel ?? chosen;
  const fallbacks = reachable(fallbackAnchor.id, 'fallback');

  const fallbacksTried: string[] = [];
  const primaryOk = input.forcePrimaryFailure ? false : Math.random() > 0.35;
  if (primaryOk) {
    path.push({ nodeId: fallbackAnchor.id, kind: fallbackAnchor.data.kind, label: fallbackAnchor.data.label, status: 'done', note: '200 OK' });
  } else {
    path.push({ nodeId: fallbackAnchor.id, kind: fallbackAnchor.data.kind, label: fallbackAnchor.data.label, status: 'fail', note: 'upstream 503' });
    for (const fb of fallbacks) {
      const ok = Math.random() > 0.2;
      fallbacksTried.push(`${fb.data.label}`);
      path.push({
        nodeId: fb.id,
        kind: 'fallback',
        label: fb.data.label,
        status: ok ? 'done' : 'fail',
        note: ok ? 'recovered' : 'also failed',
      });
      if (ok) break;
    }
  }

  return { matched: true, chosenTarget: (chosenModel ?? chosen).data.label, fallbacksTried, elapsedMs: performance.now() - start, path };
}

/**
 * Tiny CEL evaluator for the supported subset of variables/operators, used only
 * to drive the mock simulation. NOT a security boundary.
 */
function evalCEL(expr: string, ctx: Record<string, unknown>): boolean {
  if (!expr || expr.trim() === 'true') return true;
  const jsExpr = expr
    .replace(/\.contains\(/g, '.includes(')
    .replace(/\.matches\(([^)]+)\)/g, (_m, pattern) => `.match(new RegExp(${pattern}))`);
  const keys = Object.keys(ctx);
  const fn = new Function(
    ...keys,
    `"use strict"; try { return !!(${jsExpr}); } catch(e){ return false; }`,
  );
  return Boolean(fn(...keys.map((k) => ctx[k])));
}

/** Convenience selector for the currently selected node. */
export function useSelectedNode(): WFNode | null {
  return useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null);
}

export { workflowToRules };
