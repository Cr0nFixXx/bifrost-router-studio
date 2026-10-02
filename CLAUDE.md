# CLAUDE.md — Agent / Contributor Guide

Context file for AI agents and developers working in this repository. It explains the
architecture, the Bifrost schema mapping, and the conventions to follow when extending the code.

## What this project is

A **client-side SQLite editor & visual planner** for Bifrost AI Gateway routing rules. There is
**no backend and no server**. SQLite runs in the browser via **`sql.js` (WASM)**, so the user
opens their Bifrost DB file, edits it in-memory, and downloads the modified file. No request
traffic is ever proxied and no data leaves the browser.

Mental model: **canvas graph ⇄ Bifrost `governance.routing_rules[]`**, backed by a SQLite file the
user supplies. The DB is the source of truth; the canvas is an editor on top of it.

## Bifrost schema mapping (the contract)

| Canvas element | Bifrost field | Notes |
| --- | --- | --- |
| `trigger` node | one `routing_rule` | `cel_expression`, `scope`, `scope_id`, `priority`, `chain_rule`, `enabled` |
| `target` node | `rule.targets[]` | `{ provider?, model?, weight }`; weights should sum to `1` |
| `fallback` node | `rule.fallbacks[]` | `"provider/model"` string, or `{ provider, model?, key_id? }` object for key pinning (Bifrost ≥ 2.2.3); helpers `fallbackToParts`/`fallbackToRef`/`fallbackFromParts` in `src/lib/modelRefs.ts` |
| `complexity` node | visual helper | the trigger's CEL encodes `complexity_tier == "…"` |
| `provider` node | `config.providers{}` | metadata only |

Mapper lives in `src/lib/bifrostMapper.ts`:
- `workflowToRules(nodes, edges)` — graph → rules. Uses BFS (`collectReachable`) so chains with
  intermediate complexity nodes still resolve correctly.
- `rulesToWorkflow(rules)` — rules → graph (used on DB load).
- `rulesToConfig` — emits the `{ providers, governance: { routing_rules } }` shape.

**Keep all graph↔schema translation in `bifrostMapper.ts`.** Do not inline mapping in components.

## State management

`src/store/useStore.ts` is the single source of truth (Zustand). It owns:
- the React Flow `nodes`/`edges` and `onNodesChange/onEdgesChange/onConnect`
- connection state (`connection`, `dbFileName`, `dbKind`, `busy`, `dirty`) and the live DB handle
  (`getDb()`, a module variable)
- `direction` (LR/TB), `expertMode`, sidebar collapse flags, `wizardOpen`, `activeRightTab`
- DB mirrors: `rules`, `providers`, `modelCatalog`
- `diagnostics` (recomputed via `recompute()` after any graph mutation)
- undo/redo history (`past`/`future` + `commit(tag?)` with text-edit coalescing)
- `sim`/`simRunning` (simulation result)

Key actions: `connectFromFile/connectSample/createNew/reconnectCached/disconnect`,
`refreshFromDb`, `saveToDb` (mirror canvas → `routing_rules` + providers, then cache), `downloadDb`,
`importConfig`. Node mutations go through `updateNodeData(id, patch)` and `addNode/deleteNode`.
After **any** mutation that changes topology or node data, `recompute()` refreshes diagnostics and
`markDirty()` flips the dirty flag + caches the DB to IndexedDB.

## CEL handling

`src/lib/cel.ts` is the CEL authority:
- `compileGroup(group)` — visual condition tree → CEL string (supports `negate` for `!(...)`).
- `parseExpression(str)` — **real recursive-descent parser** (lexer + Pratt-style parser) →
  condition tree. Guarantees visual↔CEL round-trips for the supported subset.
- `validateCEL(str)` — lightweight linter (parens, quotes, `=`, dangling operators, parser warnings).
- `evalCEL(str, ctx)` (in the store) — **mock-only** evaluator for the simulation; never a security boundary.

Supported variables match Bifrost: `model`, `provider`, `request_type`, `headers[...]`, `params[...]`,
`team_name`, `customer_id`, `virtual_key_name`, `budget_used`, `tokens_used`, `request`, `complexity_tier`.
Operators: `== != > < >= <= in startsWith endsWith contains matches`, combined with `&& || !`.

## Custom nodes / edges

- All nodes render through `canvas/nodes/BaseNode.tsx` (frosted card, accent bar, directional
  ports, diagnostic ring). Node bodies live in `nodes/*`.
- Register new node types in **two** places: `FlowCanvas.tsx` (`nodeTypes`) and the drag palette
  in `Sidebar.tsx` (`PALETTE`). Node `type` string must equal the key used in `nodeTypes`.
- Edges use `edges/FlowEdge.tsx` (`type: 'flow'`), which animates a traveling pulse when `data.active` is set.

## Port rules

`src/types/workflow.ts` declares `PORT_RULES` (e.g. `trigger.out → target.in | complexity.in`).
The store's `onConnect` enforces these via `isValidConnection(connection)` (strict) — invalid
connections are rejected before they are added. Self-loops are also blocked.

## Database (client-side, sql.js / WASM)

- `src/lib/sqljs/loader.ts`: singleton `initSqlJs({ locateFile })` pointed at `/sql-wasm.wasm`
  (copied into `public/` by `scripts/copy-wasm.mjs`). Exposes `openDatabase(buffer?)`.
- `src/lib/db/bifrostDb.ts`: **the only module that touches the DB**. Wraps a `sql.js.Database`
  and exposes typed CRUD for `routing_rules` / `providers` / `models`, plus
  `exportConfig()`/`importConfig()` (Bifrost `config.json` projection) and `exportBytes()`
  (serialize the whole DB for download / IndexedDB caching).
- `src/lib/db/sample.ts`: demo dataset used for *Open sample database*.
- `src/lib/db/persistence.ts`: IndexedDB cache of the last DB bytes so a reload can "resume".
- The live DB handle is kept in a **module variable** in `store/useStore.ts` (`getDb()`), NOT in
  reactive state (it wraps a WASM handle).
- Keep ALL SQLite access in `bifrostDb.ts`. Components/stores call its methods — never raw SQL.

> Migration note: this replaced the old Express + `better-sqlite3` backend. If you need a Node
> service later, re-add one, but the canonical architecture here is **browser-only**.

## Conventions

- **Strict TypeScript** everywhere; no `any` in shared types (`src/types/*`).
- Path alias `@/` → `src/`. Use it for all imports.
- Tailwind only for styling; keep the exact palette from `DESIGN.md` (no light mode).
- New UI primitives go in `components/ui/primitives.tsx`.
- Prefer small, focused files; colocate node bodies with `BaseNode`.

## Extending the codebase (checklist)

1. Add type(s) to `src/types/*`.
2. If it touches Bifrost: implement mapping in `bifrostMapper.ts` + tests mentally against the
   [routing-rules docs](https://docs.getbifrost.ai/providers/routing-rules).
3. Add store actions → call `recompute()` where topology/validation is affected.
4. Add/adjust `validation.ts` diagnostics.
5. Wire UI, register node types + palette, update docs.

## Current graph model

Rule/Trigger nodes are metadata anchors only. Conditions are represented as dedicated Condition nodes and nested AND/OR Logic nodes. The mapper compiles the connected condition graph into `routing_rules.cel_expression`. Target nodes contain provider/model/key/weight directly; Model nodes are deprecated/hidden and should not be used for new workspaces. Fallback nodes are visually connected from targets but serialize as rule-level `routing_rules.fallbacks`.

## Versioning contract

Current app version is `0.2.8`; do not change this version unless explicitly requested by the user. The build number must be updated for every code change using `YYMMDDHH` in Europe/Berlin time. Current build: `26100220`.

## Dashboard/settings placement

Dashboard and Settings are top-level modal pages opened from the TopBar. They are not right-panel tabs. RightPanel is reserved for Inspector, Rules, History, Providers and Simulation.

## Visual-only canvas nodes

`annotation` nodes are visual-only. They must be ignored by DB/routing-rule serialization and should never write into Bifrost SQLite routing tables.

## Build/version update

Current version: `0.2.8`. Current build: `26100220`. Do not change version unless explicitly requested. Update build on every code change using Europe/Berlin `YYMMDDHH`.

## User settings store

`src/store/useUserSettings.ts` persists user projects/workspaces, external model API settings and visual background elements in localStorage. Visual elements are canvas overlays and must not be serialized to Bifrost routing tables.

## Optional local bridge

The app remains browser-only by default. For user-requested server-side filepath support, an optional Node local bridge exists at `scripts/local-bridge.mjs` and can be started with `npm run bridge`. It exposes `/api/open?path=...` and `/api/list?path=...` under `BFRS_LOCAL_ROOT` by default. Absolute paths outside root require `BFRS_ALLOW_ABSOLUTE=1`.

Current version: `0.2.8`. Current build: `26100220`.
