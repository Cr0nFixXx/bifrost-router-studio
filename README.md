## ⚡ Bifrost Router Studio

> A premium, dark-mode **client-side SQLite editor & visual planner** for the routing rules
> of a [Bifrost AI Gateway](https://docs.getbifrost.ai/providers/routing-rules). Open your
> Bifrost `config`-store (`.sqlite`/`.db`) straight from disk, edit triggers, targets,
> fallbacks and providers on a canvas, and export the modified database — **no backend, no
> server, no data leaves your browser.**

This is **not** an inference proxy. It only reads/writes the SQLite file you choose, entirely
in-browser via [sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WASM).

---

## ✨ Features

- **Pure client-side SQLite (WASM)** — `sql.js` runs SQLite in the browser, so the app opens,
  edits and exports a *real* Bifrost DB file with zero server. The `.wasm` is served from
  `/sql-wasm.wasm`.
- **Connect to any Bifrost DB** — open a file, start from a bundled sample, create a blank DB,
  or resume your last cached session (persisted in IndexedDB).
- **Visual workflow canvas** (React Flow) — custom nodes for Triggers, Targets, Fallbacks,
  Complexity Routers, Providers & Models, with directional ports and a dark neon theme.
- **Bifrost schema mapping** — canvas ⇄ `governance.routing_rules[]` (trigger → `cel_expression`,
  targets → weighted `targets[]`, fallbacks → `"provider/model"` strings) + `providers{}`.
- **Visual CEL builder + real parser** — compose conditions or edit CEL; a genuine
  recursive-descent parser guarantees visual↔CEL round-trips. Live validation as you type.
- **Rule-Chain Wizard** — generate an entire trigger→target→fallback chain from a natural-language
  intent in 5 guided steps.
- **Per-scope Rules panel** — rules grouped by scope (global/customer/team/virtual_key) with
  priority reordering.
- **Undo/redo** — full command history (coalesced text edits) with `mod+z` / `mod+shift+z`.
- **Keyboard shortcuts** — add nodes, delete, duplicate, save, toggle expert, collapse sidebars.
- **Strict port enforcement** — connections are validated against the declared port rules.
- **Simulation playground** — run a mock request through the chain and watch the routing path.
- **Diff viewer** — compare the canvas against the live `.sqlite` field-by-field before
  saving (or via `mod+shift+d`), with a one-click *Save to database* action.
- **Rule versioning** — save named snapshots, preview the diff vs the current canvas, and roll
  back, all client-side via the **History** tab (IndexedDB; no server).
- **Live validation** — cycles, no-target triggers, weight sums ≠ 1, invalid CEL, missing scope
  IDs, and more — flagged directly on the canvas.
- **Templates, import/export** — workspace `.json`, Bifrost `config.json`, `.xml`, and the live
  `.sqlite` file.
- **Gateway export** — export the current rules as a LiteLLM `config.yaml` or OpenAI-compatible
  model-groups JSON from the Export menu (best-effort; CEL conditions preserved as comments).
- **Capacity telemetry overlay** — toggle synthetic per-node metrics (latency / error budget /
  throughput) on the canvas to reason about capacity-based routing.
- **Multi-select & grouping** — box/multi-select nodes on the canvas and group a selection into a
  visual container (`Ctrl/⌘+G` to group, `Ctrl/⌘+Shift+G` to ungroup; also via the right-click menu).
- **Themeable accent** — pick a preset or a custom hue from the TopBar; the accent is yours, the
  strict dark surfaces stay put.
- **Template gallery** — apply built-in rule-chain templates or save and share your own template packs.
- **Accessibility** — ARIA live regions for validation & diff, modal dialog semantics with focus.
- **Frosted-glass dark UI** — collapsible sidebars, H/V flow switch, Framer Motion.

## 🧱 Tech Stack

| Layer | Choice |
| --- | --- |
| Build | Vite + React 18 + TypeScript |
| State | Zustand |
| Canvas | React Flow (`reactflow`) |
| Styling | Tailwind CSS + Framer Motion |
| Database | **`sql.js`** — SQLite in WASM, no native module, no server |
| XML | `fast-xml-parser` |

> **Why not `better-sqlite3`?** It requires a native build toolchain and a Node backend. This
> app is intentionally a pure browser tool: `sql.js` (WASM) lets users open & edit a Bifrost
> SQLite file directly, with nothing to install beyond `npm install`.

## 🚀 Getting Started

```bash
npm install      # also copies sql-wasm.wasm into /public (see scripts/copy-wasm.mjs)
npm run dev      # Vite dev server on http://localhost:5173
```

Then on the Connect screen: **open a `.sqlite`/`.db` file**, or pick *Open sample database*.

### Scripts

```bash
npm run dev        # dev server
npm run build      # copy wasm + type-check + production build
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

> Browsers can't write back to an arbitrary filesystem path, so **Save** updates the in-memory
> DB (and caches it in IndexedDB) while **Download** gives you the modified `.sqlite` file.

## 🧩 Project Structure

```
bifrost-router-dashboard/
├── index.html  vite.config.ts  tailwind.config.js
├── scripts/copy-wasm.mjs       # copies sql.js wasm -> public/sql-wasm.wasm
├── public/sql-wasm.wasm        # SQLite WASM binary (served at /sql-wasm.wasm)
└── src/
    ├── main.tsx / App.tsx / index.css
    ├── types/                  # bifrost.ts, workflow.ts
    ├── store/useStore.ts       # central Zustand store (+ undo/redo, history)
    ├── lib/
    │   ├── sqljs/loader.ts     # sql.js singleton (WASM) init
    │   ├── db/bifrostDb.ts     # Bifrost SQLite access layer (CRUD + config projection)
    │   ├── db/sample.ts        # demo dataset
    │   ├── db/persistence.ts   # IndexedDB session cache
    │   └── cel, bifrostMapper, validation, layout, io, models, templates, nodeFactory
    └── components/
        ├── auth/ConnectScreen.tsx
        ├── layout/{Sidebar,TopBar,RightPanel}.tsx
        ├── canvas/FlowCanvas.tsx + nodes/ + edges/ + ContextMenu.tsx
        ├── panels/{InspectorPanel,SimulationPanel,ProviderManager,RulesPanel}.tsx
        ├── wizard/RuleChainWizard.tsx
        └── ui/primitives.tsx
```

See [CLAUDE.md](./CLAUDE.md), [DESIGN.md](./DESIGN.md), [PROGRESS.md](./PROGRESS.md) and
[TODO.md](./TODO.md) for architecture, design, status and roadmap.

## ⚖️ License

MIT — reference UI/editor for the Bifrost AI Gateway.

## Recent UI additions

- **Metadata-only Rule nodes**: Rule nodes now hold name, description, scope and priority. CEL is represented by connected Condition and AND/OR Logic nodes.
- **Edge editing**: select a connection to label or delete it directly on the canvas.
- **Animated simulation**: the request playground animates node/edge traversal step-by-step.
- **Light mode**: use the Palette/Settings controls to switch between dark and light UI modes.
- **Exports**: workspace export now includes Markdown reports and PNG/JPG canvas image exports.
- **More templates**: added alias normalization, TTS, Claude CLI, budget spillover and premium reasoning templates.

## Version / Build

- Aktuelle Version: **0.2.8**
- Aktuelle Build: **26080502**

## Workspace productivity additions

- Dashboard and Settings now open as their own top-level modal pages from the top bar, not inside the right inspector menu.
- Left and right side panels can be resized with mouse drag handles.
- Multi-select supports drag-selection plus Ctrl/Cmd/Shift-click toggling.
- Visual-only annotation nodes are available for sticky notes, boxes, marker highlights and pen-style notes. These do not modify Bifrost DB routing rules.

## Aggregated Target/Fallback nodes

Rules can now be displayed more compactly: a single Target node may contain multiple weighted provider/model routes, and a single Fallback node may contain the ordered fallback chain. This keeps dense routing rules readable while still exporting to native Bifrost `targets[]` and `fallbacks[]`.

## 0.2.2 additions

- Help and advanced Search are top-level modals opened from the TopBar.
- Search highlights matching rules/nodes on the canvas.
- Provider panel can fetch external OpenAI-compatible model catalogs from `/v1/models`.
- Selected nodes can be exported as JSON.
- Disabled rules grey out their connected rule chain.
- Diff viewer uses a code-editor/GitHub-style hunk layout.
- Visual canvas tools are now background overlays stored in local user settings, not routing nodes.

## 0.2.3 Local Bridge

For server-side file paths, start the optional local bridge:

```bash
BFRS_LOCAL_ROOT=/path/to/bifrost/configs npm run bridge
```

Then open `config.sqlite`, `config.json`, or a relative file under that root from the Connect screen. To allow arbitrary absolute paths, explicitly set:

```bash
BFRS_ALLOW_ABSOLUTE=1 npm run bridge
```

Visual tools now support color selection and marker/pen size controls.

## 0.2.4 additions

- Target route rows now use dropdown-style suggestions for provider, model and key ID.
- Marker/Pen size and visual tool color are configurable and persisted.
- Rule-Chain Wizard now includes a nested AND/OR CEL builder capable of creating complete Bifrost-style conditions.
- Simple/Expert mode is more distinct: Expert exposes key IDs, weights and raw JSON while Simple keeps editing compact.

## SQL Browser

The TopBar SQL button opens a routing-table browser for direct `routing_rules` / `routing_targets` projection edits. Changes are applied to the in-memory SQLite database and the canvas is refreshed immediately. Download the SQLite file afterwards to persist outside the browser.

## 0.2.7 SQL Browser update

The SQL Browser now exposes original `routing_rules` and `routing_targets` table fields. Normal mode shows common operational fields; Expert mode reveals IDs, hashes, raw query, timestamps, scope IDs, key IDs and weights.

## 0.2.7 SQL Browser inline editing

SQL Browser table cells are inline editable. Press Enter or blur a cell to write the row through the controlled `BifrostDb` access layer. Use Expert mode to expose all original routing table fields.

## 0.2.8 UI polish

- The SQLite DB download action now lives inside the Export menu.
- TopBar actions collapse their labels on narrower screens and remain icon-accessible via titles.
- Modal windows can be resized wider/taller within the viewport.
- SQL Browser table columns can be resized by dragging header separators.
