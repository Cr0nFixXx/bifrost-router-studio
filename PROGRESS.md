# PROGRESS.md — Engineering Log

Status tracking for the project.

> This is the **detailed engineering log**: every code change, with reasoning and the validation run
> at the time. [`CHANGELOG.md`](./CHANGELOG.md) is the simplified, feature- and bug-fix-oriented view
> of the same history. [`TODO.md`](./TODO.md) holds what is still open.
>
> **Versioning note:** the first entries are marked `v1.x` — that is the **pre-alpha line**, kept here
> for history. Versioning was restarted at `v0.2.x` when the app became a public, released tool, and
> build numbers (`YYMMDDHH`, Europe/Berlin) were added then. `v1.x` and `v0.x` are therefore two
> separate lines, not a single sequence, and their numbers are not comparable. Current: **0.2.9**.

## v1.0.0 — Initial build ✅

(See prior changelog.) Delivered: Vite+React+TS app, React Flow canvas with custom nodes/edges,
Bifrost schema mapping, visual + manual CEL, Rule-Chain Wizard, simulation playground, live
validation, provider/model manager, templates, import/export, mock auth + dashboard.

## v1.1.0 — Client-side SQLite (sql.js) refactor ✅

**Headline change:** removed the Express + `better-sqlite3` backend. The app became a **pure
browser tool** — it opens, edits and exports the Bifrost SQLite file in-memory via
[sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WASM). No native build.

> Superseded twice since: the optional local bridge re-introduced a Node process for file paths,
> and v0.2.9 added an API mode that talks to a live gateway. See those entries below.

### What changed
- [x] Replaced `better-sqlite3`/Express with **`sql.js` (WASM)**. Added `scripts/copy-wasm.mjs`
      to serve `sql-wasm.wasm` from `/public`.
- [x] New DB layer (`src/lib/db/bifrostDb.ts`): the single module touching SQLite; typed CRUD for
      `routing_rules`/`providers`/`models`, `exportConfig`/`importConfig`, `exportBytes`, `detectKind`.
- [x] App gating switched from mock auth → **database connection state**. New
      `ConnectScreen` (open file / sample / blank / resume cached session via IndexedDB).
- [x] Removed `server/`, `src/lib/api.ts`, `Login`, `UserDashboard`.

### TODO items implemented
- [x] **Strict port enforcement** — `onConnect` validates `PORT_RULES` via `isValidConnection`.
- [x] **Real CEL parser** — recursive-descent lexer+parser replaces the best-effort parser;
      perfect visual↔CEL round-trips (verified on 10 cases, incl. `in [...]` and `!(...)`).
- [x] **Undo/redo** — command history with coalesced text edits (`mod+z` / `mod+shift+z`).
- [x] **Keyboard shortcuts** — add/delete/duplicate nodes, save, expert toggle, sidebar collapse.
- [x] **Per-scope rule lists** — new `RulesPanel` (grouped by scope, priority reorder, focus/delete).

### Validation & testing
- [x] `tsc --noEmit` clean; `vite build` clean (sql.js bundles, WASM served as `application/wasm`).
- [x] Runtime checks: sql.js insert→query→export→reopen round-trip; CEL parser 10/10 stable;
      canvas↔DB mapping round-trip (incl. chains through intermediate complexity nodes).

### Known limitations
- Browsers can't write back to an arbitrary path, so **Save** = in-memory + IndexedDB cache,
  and **Download** = the modified `.sqlite` file. (This is a browser constraint, not a bug.)
- ~~XML import not implemented (workspace/config `.json` import is).~~ **Corrected in v1.2.0:**
  XML import was already present and only mislabeled as a TODO.

## v1.2.0 — Diff viewer, rule versioning & drag-to-reorder ✅

**Headline change:** rules are now versionable and diffable. The canvas can be compared
field-by-field against the live database before saving, and named snapshots can be saved,
diffed and rolled back — entirely client-side.

### What changed
- [x] New diff engine `src/lib/diff.ts` (`diffRules` / `summarizeDiff`) — pure, unit-tested.
- [x] New priority-reorder engine `src/lib/ruleOrder.ts` (`reorderWithinGroup`) — pure, unit-tested.
      Dragging in the Rules panel reorders the global first-match priority list while leaving other
      scopes untouched.
- [x] New IndexedDB snapshot store `src/lib/db/snapshots.ts`; store actions `saveSnapshot`,
      `loadSnapshots`, `restoreSnapshot`, `deleteSnapshot`, `previewSnapshotDiff`, `applyRuleset`,
      `getCanvasRules`, `reorderRulesByIds`, `previewDbDiff`, `openDbDiff`, `showDiff`, `closeDiff`.
- [x] `DiffModal` (`panels/DiffModal.tsx`) mounted in `App.tsx`; `TopBar → Diff` button
      (+ `mod+shift+d`) shows the canvas-vs-DB delta with a "Save to database" action.
- [x] `HistoryPanel` (`panels/HistoryPanel.tsx`) added as a new `history` tab in `RightPanel`
      for snapshot save / diff / restore / delete.
- [x] Rules panel `Reorder.Group` now wired (was a no-op `onReorder`) to pointer drag-reorder.
- [x] 11 new unit tests (5 `ruleOrder`, 6 `diff`); suite now **36 passing**.

### Validation & testing
- [x] `tsc --noEmit` clean; `vite build` clean; `vitest run` → 36/36 passing.
- [x] Production build served and smoke-tested (HTTP 200; bundle contains the new UI strings).

### Notes / deferred
- **XML import** was already implemented (was mislabeled TODO) — documented as done.
- Multi-user collaboration remains open (see TODO.md); it needs a sync server, which the browser-first
  architecture deliberately does not ship. Telemetry, theming tokens and the gateway-export adapters
  listed here as open were all delivered in the entries that follow.

## v1.3.0 — Gateway export, telemetry overlay & accessibility pass ✅

**Headline change:** rules can now leave the building. Added best-effort exporters to other LLM
gateways, a synthetic capacity-telemetry overlay on the canvas, and an accessibility pass.

> The telemetry overlay was **removed** in v0.2.8 as unused, together with its settings control.
> The synthetic-metrics idea was judged to mislead in a browser-only tool with no live data.
> The gateway exporters remain.

### What changed
- [x] Gateway export adapters `src/lib/gatewayExport.ts`: `toLiteLLM()` (LiteLLM `config.yaml` with
      `model_list` + `router_settings.fallbacks`, CEL preserved as comments) and
      `toOpenAIModelGroups()` (OpenAI-compatible model-groups JSON with weights + `condition`).
      Wired into the `TopBar → Export` menu (`litellm` / `openai` kinds + `downloadFile`).
- [x] Telemetry overlay: `lib/telemetry.ts` (`nodeMetrics` — deterministic per-node synthetic
      readings + `STATUS_COLOR`); store flag `telemetryOn` + `toggleTelemetry`; `TelemetryBadge` on
      target/fallback/provider nodes; `TopBar → Telemetry` toggle; canvas legend.
      **Removed in v0.2.8** as unused, and `lib/telemetry.ts` deleted.
- [x] Accessibility pass: `Modal` gains `role="dialog"`, `aria-modal="true"`, `aria-label` and
      initial focus (`tabIndex=-1` + `panelRef`); `aria-live="polite"` / `role="status"` on the
      validation banner, diff summary and dirty indicator.
- [x] 7 new unit tests for `gatewayExport` (LiteLLM structure, CEL-as-comment, fallbacks, weighted
      model groups, disabled-rule omission); suite now **43 passing**.

### Validation & testing
- [x] `tsc --noEmit` clean; `vite build` clean; `vitest run` → 43/43 passing.
- [x] Production build served and smoke-tested; bundle contains the new UI strings and modal
      dialog semantics (`role:"dialog"`, `aria-modal`).

### Deferred (still open)
- Multi-select / group boxes, theming tokens, full canvas keyboard nav, templates marketplace,
  mobile companion view, Node bridge, multi-user collab (needs a server).

## v1.4.0 — Multi-select/grouping, theming tokens & template gallery ✅

**Headline change:** the canvas is now multi-selectable and groupable, the accent is themeable,
and there's a real template gallery (built-in + user packs).

### What changed
- [x] **Multi-select & group boxes**: React Flow multi-select (Shift/Cmd+click, Shift+drag marquee);
      `groupSelected` / `ungroupSelected` store actions create/tear-down visual group container nodes
      (React Flow parent nodes) from the current selection; `deleteSelected` now removes every selected
      node plus its grouped descendants; context-menu + `Ctrl/⌘+G` / `Ctrl/⌘+Shift+G` shortcuts; a
      selection hint on the canvas; `autoLayout` skips grouped nodes so clusters survive reflow.
      New files: `types` (`group` kind + `GroupNodeData`), `nodes/GroupNode.tsx`, node-types wiring.
- [x] **Theming tokens**: `lib/theme.ts` (`THEME_PRESETS`, `setPreset`, `setHue`, `hslToRgb`,
      localStorage persistence); `neon.DEFAULT` now reads `rgb(var(--neon-rgb)/<alpha>)` and the
      `glow` shadow uses the same variable; `TopBar` accent popover + applied on app mount. Surfaces
      and the functional node colors remain fixed.
- [x] **Template gallery / marketplace**: `lib/customTemplates.ts` (localStorage CRUD + pack
      import/export) and `panels/TemplateGallery.tsx` (Built-in / Custom tabs) wired via a new
      `templatesOpen` UI flag. Save the current canvas as a template; share packs as JSON.
- [x] 5 new unit tests (theme hsl->rgb, custom-template pack parsing); suite now **48 passing**.

### Validation
- [x] `tsc --noEmit` clean; `vite build` clean; `vitest run` → 48/48 passing.
- [x] Production build smoke-tested; bundle contains the new UI strings.

### Deferred (still open in TODO)
- Multi-user collaboration (requires a sync server), Mobile companion view, Optional Node bridge.

## v1.4.1 — Native Bifrost SQLite compatibility fix ✅

### What changed
- [x] Fixed real Bifrost DB import where `routing_rules` has no `targets` JSON column and stores targets
      in `routing_targets`; this previously surfaced as `JSON.parse: unexpected character...`/invalid JSON
      while opening `config.sqlite`.
- [x] `bifrostDb.ts` now supports both schemas:
      - Studio schema: `routing_rules.targets` JSON + local `providers`/`models` tables.
      - Native Bifrost schema: `routing_rules` + `routing_targets` + `config_providers`/`config_keys`/`config_models`.
- [x] Native DB reads now project 2 routing rules, 5 routing targets, 23 providers and model catalog entries
      from the attached real `config.sqlite` without JSON parsing errors.
- [x] Generic TopBar Import is defensive: SQLite files (including renamed `.sqlite.txt` uploads) are detected
      via the `SQLite format 3` file header and routed to database opening instead of JSON parsing.
- [x] Added a native-schema unit test; suite now **49 passing**.

### Validation
- [x] Renamed uploaded `/home/user/uploads/config.sqlite.txt` → `/home/user/uploads/config.sqlite` and verified
      it is a valid SQLite 3 database.
- [x] `tsc --noEmit` clean; `vitest run` → 49/49 passing; `vite build` clean.

## v1.4.2 — Nested rule groups, rule-level fallbacks & CEL lint fix ✅

### What changed
- [x] Rebuilt the visual CEL Rule Builder as a recursive/nested group editor:
      AND/OR per group, `Add Rule`, `Add Rule Group`, nested visual connector lines,
      group removal, condition negation plus group/row context menus (`⋯` / right-click)
      with add/switch/clear and wrap/duplicate/delete actions.
- [x] Fixed fallback semantics: Bifrost fallbacks are now treated as rule-level
      `routing_rules.fallbacks`, not as one fallback per target. The canvas mapper now
      uses a dedicated trigger fallback port, de-duplicates reachable fallbacks and sorts them by fallback `order`.
- [x] Preserved native `routing_targets.key_id` via `TargetNodeData.apiKeyId`, so opening and
      saving native Bifrost DBs no longer silently drops target key ids.
- [x] Fixed CEL validation false positive: `==` no longer triggers
      `Use "==" for equality, not "=".`; only a single bare `=` is flagged.

### Validation
- [x] Added tests for proper CEL equality validation and rule-level fallback round-tripping.
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v1.4.3 — UI interaction fixes ✅

### What changed
- [x] Fixed right-click handling for both canvas and nested Rule Builder menus:
      pane/node context menus now reliably open, stop event propagation correctly, and canvas
      add-node actions use React Flow coordinates instead of raw screen coordinates.
- [x] Fixed right-side navigation behavior: selecting Rules, History, Providers or Simulation now
      also expands the right panel if it was collapsed; the Simulation tab label is consistent.
- [x] The Rules tab now reflects the current canvas rule projection instead of only the last saved
      DB mirror, so unsaved visual edits are visible there.
- [x] Validation warnings/errors are now expandable. Clicking the validation banner shows a detailed
      diagnostics list; clicking a diagnostic selects the affected node and opens the Inspector.
- [x] Validation fallback warnings now match native Bifrost semantics: fallback checks are per rule,
      not per target, and target discovery handles intermediate router nodes.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.
- [x] Rules-tab reordering now updates trigger-node priorities on the canvas as well as the DB/rules mirror, so drag/up/down controls visibly take effect before saving.

## v1.4.4 — Context menu hardening, simulation playground & graph semantics ✅

### What changed
- [x] Hardened right-click context menu with capture-phase native `contextmenu`/right-button fallback
      handling on the React Flow wrapper; custom menu now uses a very high z-index and correct flow
      coordinates for Add Node.
- [x] Added a Simulation playground: editable provider/model/request type/complexity/team/customer,
      numeric budget/tokens, arbitrary headers (`key: value`) and a “force primary failure” switch for
      deterministic fallback testing.
- [x] Increased auto-layout and DB-import spacing so loaded nodes are not packed tightly.
- [x] Changed visual fallback docking: imported rules now render `Target -> Model -> Fallback`; fallbacks
      attach to model nodes, while serialization still writes rule-level `routing_rules.fallbacks`.
- [x] Chain rules are now visualized with labeled `chain rule` edges between trigger nodes in priority
      order. Chain visualization edges are ignored by schema mapping/validation so they do not pollute
      rule targets.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.
- [x] Simulation CEL evaluator now maps CEL string helpers like `.contains()`/`.matches()` to browser-executable JavaScript equivalents for the playground.

## v1.4.5 — Context-menu portal, correct chain-rule semantics & alias input ✅

### What changed
- [x] Context menu now renders through a `document.body` portal with max z-index, viewport clamping,
      native capture-phase `contextmenu` handling and right-button mouseup fallback. This removes React Flow
      stacking-context and event-swallowing failure modes.
- [x] Right panel tabs were made wider/more deterministic with explicit button types and a fixed 5-column tab strip.
- [x] Removed misleading chain-rule edges. Bifrost `chain_rule` means “after match, re-evaluate all rules with the resolved provider/model context”, not “connect this rule to the next rule”. The UI now shows this as a chain re-eval state on the trigger, not as a false direct relation.
- [x] Provider/model fields now support aliases via free-text datalist inputs. Native `config_keys.aliases_json` is read into provider keys/model catalog suggestions when present.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v1.4.6 — Start of Rule/Condition/Logic graph refactor ✅

### What changed
- [x] Added first-class `Condition` and `AND/OR Logic` node kinds, canvas rendering, inspector editors, palette entries and context-menu entries.
- [x] Rule/Trigger nodes now act as rule metadata/entry nodes; CEL can be represented as a connected Condition/Logic graph.
- [x] DB/rule import now parses CEL into visual Logic/Condition nodes and routes `Rule -> Logic/Condition graph -> Target -> Fallback`.
- [x] Canvas-to-Bifrost serialization compiles the connected Logic/Condition graph back into `routing_rules.cel_expression`.
- [x] Target nodes now contain provider/model/key/weight directly for new imports; `ModelNode` remains available only for old workspaces / compatibility.
- [x] Fallbacks are again visually docked to Target nodes while still saved as rule-level `routing_rules.fallbacks`.
- [x] Removed misleading chain-rule relation edges. Chain rules are now presented as a rule property: “after match, re-evaluate all rules with resolved provider/model context”.
- [x] Provider/model alias usage improved through free-text datalist inputs and `config_keys.aliases_json` catalog ingestion where present.
- [x] Added a visible “⋯ Menu” canvas fallback button that opens the same context menu as right-click.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v1.4.7 — Rule node becomes metadata-only ✅

### What changed
- [x] Removed the CEL editor from the Rule/Trigger node inspector. Rule node now only edits name, description, scope/scope_id and priority; raw node data is always shown for rule nodes.
- [x] Rule CEL is now inferred from connected Condition/AND/OR Logic nodes. A Rule can dock directly to a Condition node or to a Logic node; serialization compiles the connected condition graph into `routing_rules.cel_expression`.
- [x] Moved CEL editing into the Rule-Chain Wizard: the trigger step now has a CEL editor / rule-builder area with validation diagnostics and a quick-condition helper.
- [x] Wizard creation now materializes the entered CEL as visual Condition/Logic nodes via `rulesToWorkflow`, instead of storing CEL only inside the rule node.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v1.4.8 — Edge editing, animated simulation, light mode & more templates ✅

### What changed
- [x] Connections/edges can now be labeled and deleted directly on the canvas: select an edge, click its label control to edit, or use the trash button to remove the connection.
- [x] Simulation is now animated over time: path rows reveal step-by-step, active edges dash/pulse in sequence, and involved nodes pulse as playback reaches them.
- [x] Added a light theme mode alongside dark mode. The palette popover now includes Dark/Light mode controls and persists the choice in localStorage.
- [x] Core Tailwind color tokens now read CSS variables, enabling live theme switching without changing node functional colors.
- [x] Added more built-in templates: Alias Normalizer, Speech/TTS Routing, Claude CLI Routing, Budget Spillover, and Premium Reasoning Lane.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v1.4.9 — Dashboard, exports and canvas polish ✅

### What changed
- [x] Added user dashboard panel with rule/target/provider/edge counts and validation health.
- [x] Added settings panel for theme mode/accent, expert mode, telemetry and layout controls.
- [x] Removed Model node from creation UI/registration for new workspaces; Target now owns provider/model/key/weight.
- [x] Increased import/layout spacing further to reduce overlap in large CEL graphs.
- [x] Added Markdown, PNG and JPG exports.
- [x] Updated README, TODO, DESIGN and CLAUDE docs.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` passing; `vite build` clean.

## Security maintenance — npm audit clean ✅

> Unversioned here because it changed dependencies rather than app behaviour. Filed under `0.2.1`
> in the CHANGELOG.

### What changed
- [x] Upgraded `vite` from v5 to `^8.1.3` to remove vulnerable `esbuild`/Vite dev-server advisory chain.
- [x] Upgraded `vitest` to `^4.1.9`, removing the vulnerable Vitest/Vite/Vite-node/@vitest/mocker chain.
- [x] Upgraded `@vitejs/plugin-react` to `^6.0.3` for compatibility with the newer Vite major.
- [x] Upgraded `fast-xml-parser` to `^5.9.3` to resolve XMLBuilder comment/CDATA injection advisory.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean on Vite 8.

## v0.2.1 Build 26070603 — Workspace shell and visual tools ✅

### What changed
- [x] Added `APP_VERSION=0.2.1` and `APP_BUILD=26070603`; package version set to `0.2.1`.
- [x] Dashboard and Settings are now independent modal pages opened from the TopBar, not right-panel tabs.
- [x] RightPanel reverted to routing/editor tabs only: Inspector, Rules, History, Providers, Simulation.
- [x] Left and right side menus are resizable via mouse drag handles.
- [x] Multi-selection improved: drag selection plus Ctrl/Cmd/Shift-click toggling.
- [x] Added visual-only Annotation node type for sticky notes, boxes, marker highlights and pen notes.
- [x] Annotation nodes are available from the palette/context menu and editable in the Inspector.
- [x] Model node removed from new-workspace UI/creation. Target owns provider/model/key/weight.
- [x] Docs updated: README, TODO, DESIGN, CLAUDE, PROGRESS.

### Notes
- Aggregating multiple target models/fallback models into a single per-rule list node is recommended as the next larger schema/UI refactor. Current change keeps Bifrost-compatible Target/Fallback nodes but removes standalone Model nodes.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v0.2.1 Build 26070603 — Aggregated Target/Fallback nodes + full-rule simulation ✅

> Continuation of the same build stamp as the "Workspace shell and visual tools" entry above — the
> build number was not bumped between the two, so the headings would otherwise be indistinguishable.

### What changed
- [x] Started the target/fallback aggregation refactor: imported/saved rules now use one Target node per rule with multiple weighted provider/model routes (`routes[]`).
- [x] Fallbacks are now grouped into one Fallback node per rule with an ordered fallback list (`fallbacks[]`).
- [x] Target and Fallback inspectors now edit route/fallback lists directly.
- [x] Simulation now reveals the complete matched rule path: Rule → Condition/Logic inputs → selected Target → Fallback, instead of only activating the fallback edge.
- [x] Canvas edge highlighting now animates all revealed edges within the simulated rule subgraph.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 51/51 passing; `vite build` clean.

## v0.2.2 Build 26070603 — Help/search/settings/model fetch/diff polish ✅

### What changed
- [x] Version bumped to `0.2.2`; build remains `26070603` for the current Berlin hour.
- [x] Added top-level Help modal with graph model, shortcuts, search and privacy notes.
- [x] Added advanced Search modal with matching across rules, CEL, provider/model data and node IDs; results can highlight canvas nodes.
- [x] Added local user settings store (`useUserSettings`) with projects/workspaces, model API configuration and visual background tools.
- [x] Added external `/v1/models` fetch support in Provider Manager with optional bearer token.
- [x] Added `CHANGELOG.md`.
- [x] Added selected nodes/rules JSON export.
- [x] Disabled rules now grey out their connected rule chains.
- [x] Diff modal restyled to a GitHub/code-editor-style hunk view.
- [x] Visual sticky/box/marker/pen tools moved to background overlays stored in user settings instead of DB/routing nodes.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` passing; `vite build` clean.

## v0.2.2 Build 26070619 — Workspace controls, local file handle & visual tool fixes ✅

### What changed
- [x] Build number updated from `26070603` to `26070619` after checking Europe/Berlin time.
- [x] Deleted `/home/user/uploads` and all uploaded files because they are currently unused.
- [x] Vite dev server now binds to `0.0.0.0` for access outside localhost.
- [x] Added local SQLite file-handle opening on the connect screen. Direct browser filepath reads are explained as unavailable without File System Access API / picker permission.
- [x] Disabled rule chains now grey out connected Condition/Logic nodes as well.
- [x] Drag-selection only activates while Ctrl/Cmd/Shift is held.
- [x] Added canvas lock plus Drag/Pan vs Select mode controls in Settings and canvas toolbar.
- [x] Sticky notes and visual boxes can now be moved and resized.
- [x] Marker and pen tools now free-draw on the canvas background and are stored in user settings.
- [x] Added Ctrl+K shortcut for the advanced search modal.

### Validation
- [x] `tsc --noEmit` clean.

## v0.2.3 Build 26070701 — Visual tool controls and Local Bridge ✅

### What changed
- [x] Version bumped to `0.2.3`; build updated after Europe/Berlin time check to `26070701`.
- [x] Added color picker for visual boxes, marker and pen tools.
- [x] Added marker/pen stroke-size control on canvas toolbar and Settings.
- [x] Expanded Help into detailed sections for graph model, canvas operation, visual tools, Local Bridge, search, diff/export and shortcuts.
- [x] Added optional server-side Local Bridge (`scripts/local-bridge.mjs`, `npm run bridge`) for opening SQLite DB/config.json files by server filepath.
- [x] Connect screen can now fetch SQLite DBs or Bifrost config JSON through the Local Bridge.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.4 Build 26070812 — Dropdowns, visual controls and Wizard CEL builder ✅

### What changed
- [x] Version bumped to `0.2.4`; build updated after Europe/Berlin time check to `26070812`.
- [x] Target routes now have dropdown-style provider/model/key suggestions.
- [x] Fallback rows now have provider/model dropdown-style suggestions.
- [x] Visual tool color controls apply to visual boxes, marker and pen.
- [x] Marker/pen stroke-size controls now persist into newly drawn strokes.
- [x] Rule-Chain Wizard now includes a nested visual CEL builder with full AND/OR grouping and condition rows.
- [x] Wizard supports parsing typed CEL back into the visual builder.
- [x] Simple/Expert mode is more visibly distinct in Inspector and Target editing.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.4 Build 26070818 — AI Assistant planning docs ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26070818`.
- [x] Added separate TODO section for AI Rule Assistant / Routing Copilot planning.
- [x] Captured agreed decisions: OpenAI-compatible first, review-only apply, prompt-language response, whole-canvas default context, no AI proxy initially.
- [x] Added optional server-side user/config store plan with configurable SQLite/PostgreSQL backend.

### Validation
- [x] Documentation/build metadata update only.

## v0.2.5 Build 26070822 — AI Assistant context layer ✅

### What changed
- [x] Version bumped to `0.2.5`; build updated after Europe/Berlin time check to `26070822`.
- [x] Added `useAiAssistant` store with OpenAI-compatible provider settings, context options, chat history and draft extraction.
- [x] Added top-level AI Assistant modal with chat, context selector and review-only draft panel.
- [x] Default AI context is selected rules + provider/model catalog; full canvas/diagnostics/simulation are opt-in.
- [x] Added AI Assistant settings section and TopBar AI button.
- [x] Added Ctrl/Cmd+J shortcut to open the AI Assistant.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.5 Build 26070822 — AI Draft Review/Apply ✅

### What changed
- [x] Added `src/lib/aiDraft.ts` to normalize and validate AI rule draft JSON.
- [x] AI Draft Review now shows rule count, diff count, risks, validation errors and warnings.
- [x] Added GitHub-style diff preview for AI drafts vs current canvas.
- [x] Added explicit Apply to Canvas button for valid drafts. AI still never modifies canvas automatically.
- [x] Applying an AI draft updates the canvas only; SQLite DB changes still require normal Save.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.5 Build 26070902 — Build metadata correction ✅

### What changed
- [x] Build updated after final Europe/Berlin time check to `26070902`.

### Validation
- [x] `tsc --noEmit` clean after metadata update.

## v0.2.5 Build 26070915 — TODO correction for AI phases ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26070915`.
- [x] Corrected `TODO.md` under “AI Rule Assistant / Routing Copilot — Planung”.
- [x] Marked completed AI Assistant items: settings, OpenAI-compatible API call, chat modal, context selection, draft validation, diff review and explicit canvas apply.
- [x] Corrected the mistaken “Phase 6” wording: current implementation covers Phase 1 partly, Phase 2, and Phase 3 Apply-to-Canvas.
- [x] Left incomplete items unchecked: test connection, Anthropic, server-side persistence, template save, Wizard handoff, risk score and audit trail.

### Validation
- [x] `tsc --noEmit` clean after TODO/build metadata update.

## v0.2.6 Build 26070915 — AI Chat Markdown + Phase 1 completion ✅

### What changed
- [x] Version bumped to `0.2.6`; build updated after Europe/Berlin time check to `26070915`.
- [x] Added `MarkdownMessage` renderer for AI chat messages with safe React rendering for headings, lists, blockquotes, inline code, fenced code blocks, links, bold and italic.
- [x] Added AI Provider “Test connection” button in Settings.
- [x] Updated TODO status: AI Assistant Phase 1 is now complete.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.6 Build 26070917 — AI streaming, draft history and modal fixes ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26070917`.
- [x] AI chat now streams OpenAI-compatible `text/event-stream` responses chunk-by-chunk.
- [x] Added waiting/streaming animation while AI responses are in flight.
- [x] Added selectable AI draft history so earlier JSON drafts in the current chat can be reviewed/applied later.
- [x] AI chat Markdown renderer now wraps long prose and code lines without horizontal layout breakage.
- [x] Diff modal can render above the AI chat modal via higher z-index.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.6 Build 26071000 — AI draft copy + complex CEL import fix ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26071000`.
- [x] Fixed Draft Review “Copy JSON” button with robust clipboard fallback and JSON download fallback.
- [x] Extended CEL parser/import support for AI-generated Bifrost-style CEL:
  - single quoted strings and arrays
  - `request_size`
  - dotted field `time.hour`
  - header keys with single quotes
- [x] Fixed complex AI rule imports so CEL is materialized as Condition/Logic nodes instead of a blank/wrong single Condition node.
- [x] Added regression tests for AI-generated complex CEL and rulesToWorkflow condition/logic node creation.

### Validation
- [x] `tsc --noEmit` clean; full test/build/audit run after implementation.

## v0.2.6 Build 26071001 — AI Phase 3b progress ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26071001`.
- [x] AI drafts can now be saved as custom templates from the Draft Review panel.
- [x] Added “Explain selected rule” quick action to the AI chat.
- [x] Updated TODO Phase 3b status; remaining item is Wizard handoff / richer explain output.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.6 Build 26071001 — AI Phase 3b completion ✅

### What changed
- [x] AI drafts can now be opened in the Rule-Chain Wizard for manual editing.
- [x] AI Draft Review now includes risk score and risk reasons.
- [x] TODO Phase 3b marked complete.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.6 Build 26071003 — Build metadata correction ✅

### What changed
- [x] Build updated after final Europe/Berlin time check to `26071003`.
- [x] Corrected duplicate TODO Phase 3b Wizard-handoff line to completed.

### Validation
- [x] `tsc --noEmit` clean after metadata/TODO update.

## v0.2.6 Build 26071004 — AI follow-up repetition fix ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26071004`.
- [x] Fixed chat follow-up prompt construction: current user message is no longer duplicated in the request payload.
- [x] Added explicit system instruction to answer the latest user message and not repeat the previous assistant response unless requested.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.6 Build 26071017 — AI schema hardening and non-standard draft normalization ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26071017`.
- [x] Strengthened AI system prompt with the exact required schema and supported CEL fields.
- [x] Added normalizer support for AI outputs that incorrectly use `conditions`/`logic` and singular `target`.
- [x] Added CEL normalization for common AI mistakes (`request.headers`, `request.model`, `int()`, `request.body.stream`, `/v1/chat/completions`, Markdown links, HTML entities).
- [x] Added regression test for non-standard AI draft normalization.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.6 Build 26071319 — Final build metadata correction ✅

### What changed
- [x] Build updated after final Europe/Berlin time check to `26071319`.

### Validation
- [x] `tsc --noEmit` clean after metadata update.

## v0.2.6 Build 26071320 — AI chat polish, rule duplication, current-schema templates ✅

### What changed
- [x] Build updated after final Europe/Berlin time check to `26071320`.
- [x] Added duplicate/copy/export controls for whole rules in node context menu and Rules panel.
- [x] Added AI chat file upload support for `.json`, `.txt`, `.md`, `.xml`, `.yaml` and `.yml`.
- [x] Added per-message copy buttons in AI chat.
- [x] Made “Context sent to AI” collapsible.
- [x] Moved AI system prompt to a separate markdown file: `src/lib/ai/systemPrompt.md`.
- [x] Changed waiting text to “Assistant is thinking”.
- [x] Rewrote built-in templates to current schema using `rulesToWorkflow`.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 54/54 passing; `vite build` clean before final metadata update.
- [x] `tsc --noEmit` clean after final metadata update.

## v0.2.6 Build 26071322 — AI weight normalization and wizard layering fix ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26071322`.
- [x] AI system prompt now explicitly requires `targets[].weight` to sum to exactly 1.0.
- [x] AI draft normalizer now automatically normalizes malformed target weights, e.g. 1/1/1 becomes ~0.333/0.333/0.334, instead of producing a warning.
- [x] Added regression test for weight normalization.
- [x] Rule-Chain Wizard modal now renders above the AI chat modal, and opening a draft in the Wizard closes the AI chat to avoid hidden modal layering.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 55/55 passing; `vite build` clean before final metadata update.
- [x] `tsc --noEmit` clean after final metadata update.

## v0.2.6 Build 26071517 — SQL Browser for routing table ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26071517`.
- [x] Added `SqlBrowserPanel` as a top-level modal opened from the TopBar SQL button.
- [x] SQL Browser displays routing rule rows and routing target/fallback projections.
- [x] Direct row edits can update name, description, priority, scope, enabled, chain_rule, CEL, targets JSON and fallbacks JSON.
- [x] Direct create/delete/save operations write through the existing BifrostDb layer and refresh the canvas.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.7 Build 26071519 — SQL Browser original table fields ✅

### What changed
- [x] Version bumped to `0.2.7`; build updated after Europe/Berlin time check to `26071519`.
- [x] `BifrostDb` now exposes original `routing_rules` and `routing_targets` rows with controlled save/delete methods.
- [x] SQL Browser has `routing_rules` / `routing_targets` tabs.
- [x] Normal mode shows only requested Normal fields; Expert mode shows all requested Expert fields too.
- [x] Edits for both routing tables refresh the in-memory DB and canvas.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.7 Build 26071519 — SQL Browser inline editing and modal resize ✅

### What changed
- [x] SQL Browser supports inline editing directly in the `routing_rules` and `routing_targets` tables.
- [x] Inline edits commit on blur/Enter through the existing BifrostDb methods and refresh the canvas.
- [x] Removed the Quick Add Rule button from the canvas toolbar.
- [x] Modal windows now use a native resize handle.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.7 Build 26073022 — Save Fix for duplicate routing_rules.id ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26073022`.
- [x] Added pre-save repair for duplicate persisted Rule IDs (`data.ruleId`).
- [x] Duplicate Rule nodes now receive fresh DB rule IDs before saving, preventing `UNIQUE constraint failed: routing_rules.id`.
- [x] Duplicating a selected Rule node no longer copies its persisted `ruleId`.
- [x] Validation now emits an error for duplicate persisted rule IDs so the issue is visible before saving.
- [x] `saveToDb` catches failures, resets busy state and surfaces the error in store state.
- [x] Added regression test for duplicate persisted rule ID validation.

### Validation
- [x] `tsc --noEmit` clean; full tests/build/audit run after implementation.

## v0.2.7 Build 26073022 — Security follow-up ✅

### What changed
- [x] Ran `npm audit fix` after audit reported new `fast-xml-parser` and `postcss` advisories.
- [x] `npm audit` is clean again.

### Validation
- [x] `tsc --noEmit` clean; `vitest run` → 56/56 passing; `vite build` clean; `npm audit` → 0 vulnerabilities.

## v0.2.7 Build 26073023 — UID ruleId enforcement ✅

### What changed
- [x] Build updated after final Europe/Berlin time check to `26073023`.
- [x] Added `src/lib/ruleIds.ts` for UUID generation/validation.
- [x] New Rule nodes now receive UUID `ruleId` values immediately.
- [x] Copying a single Rule node now generates a fresh UUID `ruleId` instead of copying the original.
- [x] Duplicating a whole rule now uses a fresh UUID, not an `old-id-copy-*` suffix.
- [x] Save preflight repairs missing, non-UUID or duplicate `ruleId` values before writing to SQLite.
- [x] Validation now warns about non-UUID rule IDs and errors on duplicate persisted rule IDs.
- [x] AI draft normalizer replaces non-UUID AI rule ids with UUIDs.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 58/58 passing; `vite build` clean before final metadata update.
- [x] `tsc --noEmit` clean after final metadata update.

## v0.2.7 Build 26073100 — Simple shared conditions / Expert expanded conditions ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26073100`.
- [x] `rulesToWorkflow` now supports `dedupeConditions` for Simple-mode condition sharing.
- [x] DB refresh uses current mode: Simple deduplicates identical Condition nodes; Expert keeps per-rule Conditions.
- [x] Added TopBar buttons: `Simplify conditions` and `Expand conditions`.
- [x] Shared Condition nodes show an Inspector hint when used by multiple logic/route nodes.
- [x] Added regression test for condition dedupe with target isolation.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 59/59 passing; `vite build` clean before final metadata update.
- [x] `tsc --noEmit` clean after final metadata update.

## v0.2.7 Build 26073100 — Shared-condition disabled-state and curved edges ✅

### What changed
- [x] Fixed disabled-rule grey-out propagation so shared Condition nodes can be greyed for the disabled rule without greying unrelated rules that reuse the same condition.
- [x] Disabled-state traversal now follows the disabled rule's directed route and includes Logic-node condition inputs without traversing outward through shared conditions.
- [x] Replaced React Flow smooth-step edges with Bezier edges for curved connections.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.7 Build 26073100 — TopBar cleanup and structured vertical layout ✅

### What changed
- [x] Removed telemetry toggle/overlay/badges from the UI as unnecessary.
- [x] TopBar now wraps controls instead of overlapping the database identity text.
- [x] Auto-layout now lays out per rule/component instead of using one global layer stack.
- [x] Vertical layout now keeps each rule as a structured top-to-bottom column; horizontal layout keeps each rule as a left-to-right row.
- [x] Shared condition nodes are positioned once and reused in simple mode.
- [x] Connections remain curved Bezier edges.

### Validation
- [x] `tsc --noEmit` clean; full tests/build/audit run after implementation.

## v0.2.7 Build 26073102 — Build metadata correction ✅

### What changed
- [x] Build updated after final Europe/Berlin time check to `26073102`.

### Validation
- [x] `tsc --noEmit` clean after metadata update.

## v0.2.8 Build 26073103 — TopBar compact mode, export DB move, resizable SQL columns ✅

### What changed
- [x] Version bumped to `0.2.8`; build updated after Europe/Berlin time check to `26073103`.
- [x] Moved SQLite DB download into Export menu.
- [x] TopBar labels hide on narrower screens, leaving icon-only controls with titles.
- [x] Modal windows can be resized wider/taller within viewport constraints.
- [x] SQL Browser columns can be resized by dragging header separators.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.8 Build 26080423 — Bifrost query builder state generation ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080423`.
- [x] Added `src/lib/bifrostQuery.ts` to convert Studio CEL into Bifrost/react-querybuilder state.
- [x] `createNativeRule` and `updateNativeRule` now generate `routing_rules.query` when CEL changes or query is missing.
- [x] SQL Browser direct row saves now auto-fill missing/invalid `query` from `cel_expression`.
- [x] Existing valid query state is preserved when CEL is unchanged.
- [x] Added tests for query generation and native DB persistence.

### Validation
- [x] Full typecheck/test/build/audit run after implementation.

## v0.2.8 Build 26080500 — Provider/model dropdown normalization ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080500`.
- [x] Added `src/lib/modelRefs.ts` helpers for provider/model reference normalization.
- [x] Target model dropdown now only shows models for the selected provider and strips duplicated provider prefixes.
- [x] Fallback model dropdown remains provider-optional and can infer provider from `provider/model` values.
- [x] Added unit tests for model reference normalization.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.8 Build 26080500 — Save-time Bifrost query backfill ✅

### What changed
- [x] Added `BifrostDb.ensureRoutingRuleQueries()` to backfill missing/invalid `routing_rules.query` from CEL.
- [x] `saveToDb()` now calls query backfill after replacing rules and before caching/exporting bytes.
- [x] `downloadDb()` also backfills queries before exporting the SQLite file.
- [x] Added regression test for missing query backfill.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.8 Build 26080502 — Complexity node removal, Simulation header fix, TopBar View menu ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080502`.
- [x] Removed Complexity Router from UI creation surfaces and React Flow node registration.
- [x] Added migration for legacy Complexity nodes to `complexity_tier == <tier>` Condition nodes when loading graphs/templates.
- [x] Fixed Simulation header textarea by keeping local text state and parsing on blur/run.
- [x] Moved Horizontal/Vertical, Simplify/Expand and Expert Mode into a compact View dropdown.
- [x] Removed remaining Telemetry UI controls/overlays/badges.

### Validation
- [x] `npm audit` → 0 vulnerabilities.
- [x] `tsc --noEmit` clean; `vitest run` → 67/67 passing; `vite build` clean before final metadata update.
- [x] `tsc --noEmit` clean after final metadata update.

## v0.2.8 Build 26080518 — README overview and AGPL metadata ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080518`.
- [x] Reworked README into a concise overview with capabilities, core concepts, startup, local bridge and documentation links.
- [x] Removed README sections that duplicate other docs: Project Structure, Version/Build, License, Recent UI additions and changelog-like history blocks.
- [x] Set package license metadata to `AGPL-3.0-only`.

### Validation
- [x] `tsc --noEmit` clean after documentation/package metadata update.

## v0.2.8 Build 26080518 — README screenshots ✅

### What changed
- [x] Copied uploaded screenshots into `docs/screenshots/`.
- [x] Added screenshot section to README for canvas, AI Assistant and SQL Browser.
- [x] Did not commit `/home/user/uploads` contents.

### Validation
- [x] `tsc --noEmit` clean after documentation/image update.

## v0.2.8 Build 26080520 — DB export extension fix ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080520`.
- [x] Database export now defaults to `.db` instead of `.sqlite` (e.g. `config.db`).

### Validation
- [x] `tsc --noEmit` clean.

## v0.2.8 Build 26080521 — Modal edge resize and node clipboard ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080521`.
- [x] Dashboard/Settings/Search/Help/AI/SQL modals now start narrower by default and can still be resized larger.
- [x] Modal resizing now works from the window edges via custom handles.
- [x] Added selected-node clipboard in store.
- [x] Added Ctrl/Cmd+Shift+C to copy selected nodes and Ctrl/Cmd+Shift+V to paste them with fresh IDs/ruleIds.
- [x] Ctrl/Cmd/Shift-click on nodes now stops event propagation to avoid pane deselection.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.8 Build 26080522 — Modal overlay hardening ✅

### What changed
- [x] Build updated after Europe/Berlin time check to `26080522`.
- [x] Modal primitive now renders through `document.body` portal to avoid local stacking contexts.
- [x] Modal wrapper uses `pointer-events-none`; only backdrop and panel are interactive.
- [x] Modal resize listeners are centrally cleaned up on close/unmount to prevent stuck pointer handlers.
- [x] Close button, Escape and backdrop click all use the same cleanup path.

### Validation
- [x] `tsc --noEmit` clean; tests/build/audit run after implementation.

## v0.2.8 Build 26100506 — Bifrost 2.2.3 fallback key pinning ✅

> Backfilled after the fact. These three commits shipped between the modal-overlay work and v0.2.9
> but had no entry here.

### What changed
- [x] Fallbacks accept the Bifrost ≥ 2.2.3 object form `{ provider, model, key_id }` in addition to
      the legacy `"provider/model"` string, so a fallback can pin a specific provider key.
- [x] `config.json` export resolves a pinned `key_id` to its `config_keys.name` and emits
      `provider_key_name`; import resolves that alias back to a key id.
- [x] Workspace XML export/import carries the pin via `@_key_id`, so the round-trip no longer
      silently drops key pinning.
- [x] Diagnostics added for a fallback without a provider (rejected by Bifrost 2.2.4+) and for
      pinned fallbacks (Bifrost ≤ 2.2.2 cannot decode the row and disables all routing rules).
- [x] AI drafts keep fallback key pins and drop fallbacks that have no provider.
- [x] XML workspace import no longer drops every rule attribute (id, name, priority, scope, enabled).

### Validation
- [x] `tsc --noEmit` clean; `vitest run` passing; `vite build` clean.

## v0.2.9 Build 26100507 — API mode: live gateway sync ✅

### What changed
- [x] Added a second, exclusive Connect mode for a live Bifrost gateway. `connectionSource:
      'file' | 'api'` in `useStore` decides which source the canvas mirrors; file mode is untouched
      and stays the default.
- [x] New `src/lib/bifrostApi.ts`: the single module that talks to a gateway. CRUD, the
      `<2.0.0` prefix fallback (`/api/governance/routing-rules`), and `BifrostApiError` carrying
      the status so 401 / 404 / "bridge down" stay distinguishable.
- [x] New `src/lib/sync.ts`: `diffRules` compares canvas rules against the gateway over the write
      shape, `applyDiff` runs create → update → delete and stops at the first failure.
- [x] `toWriteShape` / `toUpdateShape` keep the GET and write shapes apart and regenerate `query`
      from the CEL on every push.
- [x] Rules that exist only in the Bifrost dashboard hydrate into the canvas and are editable.
- [x] Unmodelled fields (`scope`, `scope_id`, `priority`, `ttft_timeout_ms`) are preserved across
      a push instead of being reset, and never trigger a push on their own.
- [x] Auto-sync: debounced 800 ms toggle in `useUserSettings.autoSync`, **off by default**.
      `syncNow()` is always reachable from the TopBar, which also shows the unsynced count.
- [x] Store guards: `saveToDb`, Diff, SQL Browser and the SQLite export are hidden in API mode;
      `markDirty()` routes to `scheduleSync()` instead of the IndexedDB cache.
- [x] `scripts/local-bridge.mjs` is now a whitelist proxy for the gateway — only the version,
      health and routing-rule routes pass through. Methods extended to POST/PUT/DELETE.
- [x] `GET /api/health` reports gateway URL, reachability, version and token validity.
- [x] Direct browser transport kept as a fallback; token is session-only, never persisted.
- [x] New settings: `bifrostApiUrl` + `autoSync`. No token field — the bridge owns the secret.

### API constraints that shaped the design
- `PUT /api/routing/rules/{id}` is partial but supplying `targets` replaces the whole list, so a
  push always carries a complete rule body — never a field delta.
- The update schema has no `scope`/`scope_id`, so a scope change is delete + create with a new id.
- The GET shape carries `id`/`created_at`/`updated_at`, which no write schema accepts.
- Bifrost's CORS defaults to `*`, which is why direct mode works locally but is not the default.

### Bugs found by testing against a mock gateway, all fixed
- [x] `scope_id` was sent in the PUT body; the update schema rejects it.
- [x] A scope change emitted a delete without a create, which would have dropped the rule from the
      gateway entirely.
- [x] The bridge whitelist matched `/routing/rules` instead of `/api/routing/rules` → every
      request 403'd.
- [x] The bridge double-encoded bodies, delivering the rule to the gateway as a string.

### Validation
- [x] `src/lib/sync.test.ts` — 17 cases covering no-op diffs, full write shape on update, scope
      moves, weight rejection, error normalization and apply ordering.
- [x] Full suite: 95 tests passing, `tsc --noEmit` clean, production build succeeds.
- [x] End-to-end against a mock gateway: 18/18 — bridge connect, create, update, delete, unchanged
      rules producing no traffic, server-only fields ignored, `query` regenerated, governance
      fallback, 401 vs status 0, and the write shape carrying no `id`/timestamps.
- [x] Bridge whitelist verified: `/api/config` returns 403.
- [x] Acceptance criteria and the full coverage map: [`TESTING.md`](./TESTING.md).

## v0.2.9 Build 26100604 — Documentation split, four project skills, dead version fork ✅ (backfilled)

Entry written after the fact: this build changed docs and added skills but never got an
engineering-log entry. Recovered from `git log`, so it is shorter than an entry recorded at the
time.

### What changed
- [x] `CLAUDE.md` was split from 242 self-contradicting lines into a nine-file doc set with one
      role per file. Created `ARCHITECTURE.md`, `TESTING.md`, `MILESTONES.md`.
- [x] Removed `src/lib/telemetry.ts` (no importers since v0.2.8) and its last doc mentions.
- [x] Four project skills under `.claude/skills/`: `doc-set`, `doc-audit`, `release-bump`,
      `gateway-smoke`, each with scripts and an eval set.
- [x] **Fixed a dead code path:** the Bifrost `<2.0.0` fallback requested `/api/governance/rules`,
      a route that does not exist — the real one is `/api/governance/routing-rules`. The fork was
      unreachable while every test still passed, because a mock that 404s the collection accepts a
      wrong path too. `VersionPrefix` now carries prefix *and* rules suffix.
- [x] `version()` bypassed the rules whitelist, so `/api/version` was rejected; now addressed
      directly.

### Validation
- [x] Full suite: 95 tests, `tsc --noEmit` clean, production build succeeds.
- [x] Gateway smoke extended to 20 checks, including a write through the legacy prefix — the only
      way to prove that path is right.

## v0.2.9 Build 26100619 — Documentation audit (skill eval iteration 2), copy-wasm removal ✅

**Headline:** the second evaluation run of the four project skills found **nine incorrect
statements in the docs**. All nine were verified against the code before being corrected.

### Why this shape
Eval run 1 had two defective tests: `doc-audit` eval 1 asserted a premise no file ever made
(telemetry), and `doc-set` had no rule separating a gotcha from a known limitation. Both were
rewritten, then the full run was repeated with-skill and baseline in isolated copies.

### What changed — skills
- [x] `doc-audit` eval 1 now uses a real false premise: `TESTING.md` claimed `bifrostDb.test.ts`
      was covered by `io.test.ts`. The file exists at `src/lib/db/`, has 10 tests, runs on its own.
- [x] `doc-set` gained *Gotcha oder bekannte Grenze?* in `references/file-roles.md`, plus a pointer
      from `SKILL.md`. Decision question: **can someone do something wrong by not knowing this?**
      Yes → `CLAUDE.md` fallstricke. No → `TODO.md` known limitations.

### What changed — the nine doc bugs
- [x] `CLAUDE.md` carried build `26100507` while the code said `26100604`. The versioning contract
      now points at `src/lib/version.ts` instead of restating the number — the root cause was the
      number being in a doc at all.
- [x] `ARCHITECTURE.md` described the WASM loader as `initSqlJs({ locateFile })` off `/sql-wasm.wasm`
      in `public/`. It actually resolves via Vite's `?url` asset import and has done so since the
      loader gained the comment `no stale public copy`.
- [x] `DESIGN.md` listed `Model` and `Complexity` as current elements and omitted `Condition` and
      `Logic`. Both listed ones still have a component in `SimpleNodes.tsx` but are registered
      nowhere — the agent that reported this called them "deleted", which is wrong; the table now
      describes the actual state.
- [x] `DESIGN.md`: section labels are `text-[11px]`, not `10px`.
- [x] `ARCHITECTURE.md`: `toWriteShape` lives in `bifrostApi.ts`, not `sync.ts`.
- [x] `TESTING.md`: the test-map footnote was a false justification for a missing table row. Row
      added, sum now matches the "95 tests / 14 files" headline.
- [x] `CLAUDE.md`: CEL variable list was missing `request_size` and `time.hour`.
- [x] `PROGRESS.md`: title said "Changelog" while the body and README called it an engineering log.
- [x] `HANDOFF.md`: one claim was stale and is now stated precisely.

### What changed — code
- [x] Removed `scripts/copy-wasm.mjs` and `public/sql-wasm.wasm`, plus the `copy-wasm` hooks in
      `dev` and `build`. Nothing read the copy since the loader moved to Vite's asset pipeline.
- [x] Build number bumped at both places: `src/lib/version.ts` and top-level `package.json:build`.

### What the evaluation actually showed
- [x] `doc-set` discriminates: with the skill the answer became `TODO.md` with a stated reason;
      the baseline still said `ARCHITECTURE.md`. In run 1 the skill itself had answered
      `CLAUDE.md`, so the new rule corrected a wrong answer.
- [x] `doc-audit` does **not** discriminate: both sides found the same defect in 10 vs 12 calls.
      For the broad audit the baseline found two findings the skill run did not. Honest
      conclusion: the skill organises a search, it does not find more than a careful one.
- [x] A harness bug in the sandbox procedure had left skills in every baseline copy at a nested
      `.claude/.claude/skills/` path, which would have made the comparison worthless. Fixed: the
      archive now excludes `.claude` and only the with-skill copies get it.

### Validation
- [x] `npm test` — 95 tests in 14 files, all passing.
- [x] `npm run build` succeeds **without** the removed pre-build step; the WASM lands as
      `dist/assets/sql-wasm-*.wasm`.
- [x] `node .claude/skills/release-bump/scripts/bump.mjs --check` — both build locations agree.
- [x] Every relative doc link across the doc set resolves to an existing file.
- [x] Both edited skills pass `quick_validate.py`.

## v0.2.9 Build 26100701 — Bridge aus dem LAN erreichbar (Vite-Proxy) ✅

### Symptom
Die App lief auf einem Server (Bifrost + BFRS auf 5173 + Bridge auf 8787), der Browser auf einem
anderen Rechner. BFRS war erreichbar, die Bridge nicht: `NetworkError when attempting to fetch
resource`. Getestet wurden `localhost:8787`, `127.0.0.1:8787` und die Server-IP — alle drei schlugen
fehl.

### Ursache
`local-bridge.mjs` bindet per Default auf `127.0.0.1` (`BFRS_BRIDGE_HOST`). Die beiden Testadressen
scheiterten aus verschiedenen Gründen, sahen aber gleich aus:
- `localhost:8787` im Browser bedeutet *den Browser-Rechner*, nicht den Gateway-Rechner. Dort läuft
  keine Bridge.
- Die Server-IP erreichte den Host, aber auf dem LAN-Interface lauschte nichts.

CORS war unbeteiligt: die Bridge setzt `access-control-allow-origin: *`. Der Fehler sah nach einem
CORS-Problem aus und war keines.

### What changed
- [x] `vite.config.ts`: `server.proxy` für `/bridge` → `http://127.0.0.1:8787` mit
      `rewrite`, das das Präfix entfernt. Der Dev-Server spricht damit im Namen des Browsers mit der
      Bridge; die Bridge selbst bleibt auf Loopback und der Management-Token verlässt den Host
      nicht. Nebeneffekt: kein zusätzlicher Firewall-Port, und alle Requests sind same-origin.
- [x] `ConnectScreen.tsx`: Default-Bridge-URL ist jetzt `${window.location.origin}/bridge` statt
      `http://localhost:8787`. Der Default war an jedem entfernten Client falsch. Das Feld bleibt
      editierbar.
- [x] Build-Nummer an beiden Stellen: `src/lib/version.ts` und `package.json:build`.
- [x] Doku: neuer README-Abschnitt "Reaching the bridge from another machine", Gotcha in
      `CLAUDE.md` (Bridge-Block) mit dem Hinweis, dass nur der Dev-Server proxyt.

### Bewusst nicht gemacht
- Kein `BFRS_BRIDGE_HOST=0.0.0.0` und keine Authentifizierung auf dem Proxy. `/bridge` ist so offen
  wie Port 5173 — dieselbe Trust-Grenze, die für die App ohnehin gilt.
- Kein `preview.proxy`: der Production-Build (`vite preview`) proxyt nicht. Bei Bedarf nachziehen.

### Validation
- [x] `npm run typecheck` sauber, `npm test` — 95 Tests in 14 Dateien, alle grün.
- [x] Bridge und Dev-Server lokal gestartet, alle drei Proxy-Checks bestanden:
      - `curl http://127.0.0.1:8787/api/health` → `200`
      - `curl http://127.0.0.1:5173/bridge/api/health` → identisches JSON (der `rewrite` stimmt)
      - `curl http://127.0.0.1:5173/bridge/api/bifrost/api-keys` → `403 Path not allowed by the
        bridge` (die Whitelist greift auch durch den Proxy)
- [x] `node .claude/skills/release-bump/scripts/bump.mjs --check` — beide Build-Stellen stimmen.
- [ ] Nicht auf dem Zielserver geprüft: die Kette Browser → LAN → 5173 → Proxy → Bridge über die
      tatsächliche Netzwerkstrecke. Die Proxy-Logik ist lokal verifiziert, die Erreichbarkeit von
      Port 5173 war bereits vorher gegeben.

## v0.2.9 Build 26100702 — Management-Token im Browser + optionales HTTPS ✅

### Anlass
Ein Env-Export pro Bridge-Neustart ist lästig. Gewünscht: das Token dort eingeben, wo auch die
Bridge-URL steht.

### Ausgangslage
Der Token konnte gar nicht durchkommen, an zwei Stellen:
- `local-bridge.mjs` las ihn ausschließlich aus der Env und überschrieb jeden eingehenden
  `authorization`-Header. Ein Browser-Token wäre stillschweigend verworfen worden.
- `bridgeTransport()` setzte `token: null`, sodass `authHeaders()` gar keinen Header erzeugte.

### What changed
- [x] `local-bridge.mjs`: `bifrostToken(requestToken)` — der Request gewinnt über die Env, die Env
      bleibt Fallback. Neu: `requestToken(req)` liest die Bearer-Credential aus dem Request. Eine
      Trust-Boundary, also mit Regex-Validierung und Längen-Cap; alles andere wird verworfen.
      `bifrostFetch()` und `bifrostStatus()` nehmen den Token durch, damit `/api/health` nicht
      dauerhaft „Token abgelehnt" meldet.
- [x] `bifrostApi.ts`: `bridgeTransport(bridgeUrl, token = null)` und
      `fetchBridgeHealth(bridgeUrl, token = null)`. Der Default hält alle bestehenden Aufrufer
      gültig, inklusive `smoke.mjs`.
- [x] `useStore.ts`: `checkBridge` / `connectApiViaBridge` nehmen den Token optional entgegen. Leer
      oder weggelassen → `null` → die Bridge nutzt ihre Env.
- [x] `ConnectScreen.tsx`: Passwort-Feld unter der Bridge-URL. Component-State, **nicht**
      `useUserSettings` — das persistiert in `localStorage`. Health-Check auf 300 ms debounced,
      weil er jetzt von zwei Feldern abhängt.
- [x] `vite.config.ts`: HTTPS aktiv, sobald **beide** Variablen `BFRS_TLS_KEY`/`BFRS_TLS_CERT`
      gesetzt sind. Default unverändert HTTP.
- [x] `gateway-smoke`: sechs neue Checks gegen zwei zusätzlich gestartete Bridges.
- [x] Build-Nummer an beiden Stellen.

### Zwei Fehler, die die Validierung gefunden hat
- **Doppeltes `Bearer`:** `requestToken` gab den kompletten Header zurück, `bifrostFetch` setzte
  nochmal `Bearer ` davor — `Bearer Bearer smoke-secret`, also 401, der wie ein falsches Token
  aussah. Jetzt gibt die Funktion nur die Credential zurück.
- **Falsche Testannahme:** zwei neue Checks schlugen fehl, weil `/api/version` im Mock **ohne**
  Auth serviert wird (der Studio prüft dort vor der Anmeldung). Die Checks testen jetzt
  `/api/routing/rules`, wo Auth erzwungen wird. Siehe unten — das ist auch für echte Bifrost-Instanzen
  offen.

### Was sich sicherheitlich ändert
Der Token verlässt den Server nicht mehr zwangsläufig. Er liegt im JS-Speicher (jedes XSS und jedes
bösartige Bundle-Paket kann ihn lesen — deshalb nicht persistiert) und wird einmal über das LAN
geschickt, bei HTTP im Klartext. Die Whitelist bleibt erhalten, weil der Token an die **Bridge**
geht, nicht ans Gateway: das ist der Unterschied zu „Direkt verbinden". Optional ist HTTPS
konfigurierbar.

### Validation
- [x] `npm run typecheck` sauber.
- [x] `npm test` — 95 Tests in 14 Dateien, alle grün.
- [x] `node .claude/skills/gateway-smoke/scripts/smoke.mjs` — **26/26** (vorher 20). Die neuen Checks:
      Browser-Token ohne Env funktioniert inklusive Schreib-Zyklus; Browser-Token schlägt falschen
      Env-Token; falscher Env-Token greift weiter, wenn der Browser keinen sendet; Header ohne
      `Bearer` wird verworfen statt weitergeleitet; Bridge ohne Token irgendwo meldet „kein Token".
- [x] `node .claude/skills/release-bump/scripts/bump.mjs --check` — beide Stellen stimmen.

### Offen
Ob echtes Bifrost `/api/version` ohne Auth ausliefert, ist ungeklärt (die Doku sagt nichts dazu).
Falls ja, ist die Statusanzeige „Token gültig" eine Anzeige, die nicht rot werden kann. Siehe
`TODO.md`.

### Nachtrag — TODO.md aufgeräumt (gleicher Build)

`TODO.md` widersprach seinem eigenen Kopf: Zeilen 6–8 sagen „completed work … not here", 36 % der
Datei waren trotzdem eine „Implemented ✅"-Liste, weitere ~45 erledigte `[x]`-Punkte im
KI-Abschnitt. All das steht bereits in `PROGRESS.md` und `CHANGELOG.md`.

- **195 → 83 Zeilen.** „Implemented ✅" ersatzlos gestrichen, KI-Abschnitt auf die offenen Punkte
  reduziert, die erledigten „Phasen" als Duplikate der offenen Punkte aufgelöst.
- **Die spekulative Server-Store-Spezifikation** (ENV-Variablennamen `BFRS_STORE_DRIVER` usw.)
  entfernt — sie stand als Planung im Detail, obwohl weder ein Bedarf noch eine Entscheidung
  dahintersteht. Offen bleiben die drei Designfragen, die tatsächlich eine Entscheidung brauchen.
- **Prioritäten ergänzt**, weil der Kopf sie versprochen hat und `Open work` eine unrangierte
  Flachliste war: hoch / mittel / braucht Architekturentscheidung.
- **Verifiziert statt geglaubt:** Light Mode existiert (`theme.ts`, `ThemeMode`/`toggleThemeMode`),
  Anthropic-API ist offen (null Treffer für `/v1/messages`), XML- und LiteLLM-Export existieren,
  `AiAssistantPanel.tsx` existiert. Neu aufgenommen und gegen den Code geprüft: es gibt keine
  Tastaturnavigation der Canvas (der einzige `keydown`-Handler in `FlowCanvas.tsx:153` trackt nur
  den Selection-Modifier), keine Resize-Handles in `canvas/nodes/` (null Treffer) und keine
  Projektbindung in `lib/db/snapshots.ts` (kein `projectId`).

**Zwei Folgefehler mitgezogen.** Durch die Token-Änderung aus dem vorigen Eintrag waren auch zwei
Aussagen in `ARCHITECTURE.md` falsch geworden — der Token komme „aus `BFRS_BIFROST_URL` +
`BFRS_BIFROST_TOKEN`" und die Bridge halte ihn. Beide korrigiert. Dazu zwei Abschnitte, die vorher
nirgends standen: die Neben-Stores mit ihren localStorage-Keys und der KI-Pfad mit der Aussage, dass
Drafts nur über den DiffModal und nur bei fehlerfreier Validierung an den Canvas kommen
(`AiAssistantPanel.tsx:92-107,304`).

Build-Nummer: Der Bump-Skript lief, änderte aber nichts — es rechnet `YYMMDDHH`, und dieser Eintrag
fällt in dieselbe Stunde wie 26100702. Kein Fehler, aber eine Eigenschaft des Formats: mehrere
Änderungen innerhalb einer Stunde teilen sich eine Build-Nummer.

Validation: `npm test` 95/95 grün, alle relativen Doku-Links auflösbar, Build-Check beide Stellen
gleich.

## v0.2.9 Build 26100702 — npm audit: source-map-js behoben, Tailwind-v4-Kette als Milestone

Build-Nummer unverändert: `YYMMDDHH` hat nur Stundenauflösung, dieser Eintrag fällt in dieselbe
Stunde wie die beiden vorigen. Drei getrennte Änderungen teilen sich damit 26100702.

### Befund
`npm install` meldete 8 Vulnerabilities (2 moderate, 6 high). Aufschlüsselung:

- **`npm audit --omit=dev` → 0.** Keine einzige Meldung betraf Produktions-Abhängigkeiten
  (`fast-xml-parser`, `framer-motion`, `lucide-react`, `nanoid`, `react`, `react-dom`, `reactflow`,
  `sql.js`, `zustand`). Alle acht waren transitive `devDependencies` von `tailwindcss@3` und
  `postcss`. Zusätzlich im gebauten `dist/assets/index-*.js` nach allen Paketnamen gesucht: null
  Treffer.
- **`source-map-js` (high)** — Advisories betreffen `1.0.0 - 1.2.1`, gepatcht ist `1.2.2`.
  `postcss@8.5.25` verlangte `^1.2.1` und erlaubt 1.2.2 also bereits; der Lockfile war nur auf eine
  alte Auflösung gepinnt. Mit `npm update source-map-js` ohne Breaking Change behoben.
- **`braces` (high) + `postcss-selector-parser` (moderate)** — die betroffene Tailwind-Spanne ist
  `0.5.0 - 3.4.19`, und `3.4.19` ist die letzte v3. Kein Patch innerhalb von v3 möglich; nur
  `tailwindcss@4` behebt beide.

### Warum keine Migration
Der DoS in `braces` braucht tief verschachtelte Glob-Muster. Die Muster stammen aus der eigenen
`tailwind.config.js` und laufen beim Build auf der Maschine des Entwicklers — wer sie schreiben kann,
hat bereits Schreibrecht auf dem Repo. Es gibt keine erreichbare Trust-Grenze, während die
Migration die verbindliche Palette aus `DESIGN.md` und die „Tailwind only"-Regel berührt. Als
Milestone mit CSS-Diff eingetragen, nicht als `npm audit fix --force`.

### What changed
- [x] `source-map-js` auf 1.2.2 gehoben. Audit: 8 → 7.
- [x] `MILESTONES.md`: erster Eintrag — Tailwind-v4-Migration mit Warum/Umfang/Erster Schritt.
- [x] `CLAUDE.md`: neuer Fallstrick-Block **Dependencies** — die 7 Advisories sind der bekannte
      Zustand, `npm audit fix --force` ist verboten, und ein Lockfile-Pin ist kein Override-Bedarf.
- [x] Build-Nummer.

Validation: `npm test` 95/95 grün, `npm run build` erfolgreich, `npm audit --omit=dev` 0.

## v0.2.9 Build 26100704 — Synchronisieren schrieb nichts ✅

### Anlass
„Wenn ich auf Synchronisieren klicke, ändert sich nichts im Bifrost Webpanel." Klick auf
**Synchronisieren**, Statuszeile meldet Erfolg (`idle`, frischer `lastSyncedAt`) — am Gateway
passiert nichts.

### Root Cause
`syncNow` diffte nicht den Canvas, sondern `get().rules`:

```ts
const local = get().rules.length ? get().rules : workflowToRules(get().nodes, get().edges);
```

`rules` wird nur bei `openApiSession` und `refreshFromApi` geschrieben — also beim Verbinden und
nach einem erfolgreichen Push. Jeder Canvas-Edit (`updateNodeData`, `addNode`, `deleteNode`,
`onConnect`, `onEdgesChange` …) schreibt ausschließlich `nodes`/`edges`. `rules` bleibt damit der
Connect-Snapshot.

Im API-Modus ist `rules.length > 0`, also greift der `workflowToRules`-Zweig nie. Der Diff
verglich das Gateway mit sich selbst: `unchanged`, `diffIsEmpty` → `early return`, **null HTTP-Calls**.
Der Erfolgszustand war der untersuchte Fehler — deshalb sah es nach Funktionieren aus.

Der Fallback-Zweig ist in API-Modus toter Code. Er hat vermutlich die Datei-Modus-Fälle abgedeckt,
in denen `rules` die DB liest — dort ist aber `saveToDb` zuständig, nicht `syncNow`.

### Zweiter Fund im selben Pfad
Beim Bauen des Regressionstests fiel ein CEL-Roundtrip-Bug auf: `parseExpression('true')` gab
`model == ""` zurück. `parseExpression` beendete den Zweig für eine immer-wahre Bedingung mit
`newGroup()` — und `newGroup()` ist der UI-Starter, der mit **einer leeren Condition** startet.
Zurückkompiliert wurde das zu `model == ""`, also schrieb ein Sync jede Catch-all-Regel
(`cel_expression: "true"`) als `model == ""` überschrieben. Betraf auch den Datei-Modus
(`saveToDb` → `workflowToRules`). Der Zweig gibt jetzt eine Gruppe ohne Conditions zurück.

### What changed
- [x] `useStore.ts`: `syncNow` difft `get().getCanvasRules()` — dieselbe Quelle, die `saveToDb`,
      `previewDbDiff` und die Snapshots benutzen. Eine Quelle für „was der Canvas sagt".
- [x] `cel.ts`: `parseExpression` liefert für `''`/`'true'` eine leere Gruppe statt `newGroup()`.
- [x] `src/store/syncNow.test.ts`: vier Tests über die echte Kette (`connectApiDirect` mit
      `fetch`-Mock → `syncNow`): Umbenennung → PUT, neue Regel → POST, gelöschte Regel → DELETE,
      unveränderter Zustand → kein Write.
- [x] Build-Nummer an beiden Stellen.

### Warum dieser Bug so lange unbemerkt blieb
Kein Test hat `syncNow` angefasst — `sync.test.ts` deckt nur die reine Diff-Logik ab, und die war
korrekt. Die Störung lag an der Übergabe `store → sync.ts`, also genau an der Naht, die eine
Unit-Test-Suite für reine Funktionen per Konstruktion nicht sieht. Der neue Test geht durch
`connectApiDirect`, weil das die einzige Ebene ist, an der der Fehler sichtbar wird.

Validation: `npm test` 99/99 grün (vorher 95), `npx tsc --noEmit` fehlerfrei, Regressionstest gegen
den ungepatchten Stand reproduziert alle drei Schreibfehler.

## v0.2.9 Build 26100715 — Sync isoliert, Prioritäts-Tausch, API-Diff ✅

### Anlass
Der Nutzer hat Build 26100704 gegen eine **echte** Bifrost-Instanz getestet. Der erste Fix griff —
Synchronisieren schrieb überhaupt nichts mehr — aber vier Symptome blieben:

1. „3 nicht übertragen", obwohl nur eine Regel kaputt war
2. Priority-Tausch → `500 "routing rule with priority 0 already exists for scope 'global'"`
3. Fallback mit totem Provider → `400`, ohne sichtbare Begründung
4. keine Diff-Ansicht im API-Modus

### Root Causes

**A — `applyDiff` brach beim ersten Fehler ab.** Ein `try` um drei sequentielle Schleifen; `failed`
zählte auch Calls, die nie versucht wurden. Eine kaputte Regel blockierte den ganzen Batch. Das
Verhalten war in `sync.test.ts` als *gewünscht* festgeschrieben („stops at the first failure and
counts what did not make it", `failed === 2`) — der Test musste mitbewusst umgeschrieben werden.

**B — Das Gateway hat UNIQUE (scope, priority).** Ein Tausch 0↔1 ist sequentiell nicht auflösbar.
`reorderWithinGroup` vergibt lückenlose 0..n-1, also genau die kollidierenden Einzel-PUTs. Das
Datei-Schema hat nur `CREATE INDEX idx_rules_priority` (kein UNIQUE) — deshalb funktioniert
Drag&Drop lokal einwandfrei und bricht erst am Gateway. **Keine Stelle im Repo kannte die
Constraint:** kein Typ definiert eine Priority-Range, `rejectionReason` prüft Priority nicht, und
der Mock-Gateway hat sie nicht simuliert. Ein Swap im Smoke-Test wäre grün durchgelaufen.

**C — Die Begründung existierte im Store, aber nicht auf dem Bildschirm.** `syncStatus.error` und
`syncStatus.rejected` hatten laut grep keinen einzigen Consumer in irgendeiner `.tsx`; gerendert
wurde nur `pending`, die Zahl.

**D — Keine API-Diff.** `openDbDiff` ist an `activeDb` gebunden (im API-Modus `null`), der Button
war mit `{!isApi && …}` gar nicht gerendert. Ursache tiefer: es gibt zwei Module namens
`diffRules` mit unvereinbaren Rückgabetypen — `diff.ts` (Feld-Detail, das der DiffModal rendert)
und `sync.ts` (Call-Liste).

**C′ — Targets und Fallbacks werden unterschiedlich validiert.** Der 400 lautet
`fallbacks[1] "Test/prefix/model" is invalid: must use a known provider prefix` — das ist der
*Fallback*. Die offizielle Doku nennt für Targets gar keine Provider-Whitelist, für Fallbacks nur
die Form `provider/model`. Die serverseitige Prefix-Prüfung der Fallbacks ist **nirgends
dokumentiert**.

### Entscheidungen, die der Nutzer getroffen hat
- Scope-Wechsel werden gekoppelt (Create und Delete als eine Einheit)
- Fehlerdetails per Klick auf die Statuszeile, in einem Modal
- Die API-Diff bekommt einen „Übertragen"-Button
- **Das Studio blockiert keine Provider** — das Gateway entscheidet

### What changed
- [x] `mock-bifrost.mjs`: `priorityTaken()` simuliert UNIQUE (scope, priority) in POST und PUT.
      Nur wenn `body.priority` im Body steht — sonst würde die Constraint bei jedem Update ohne
      Priority-Change greifen. Fehlerform an der realen Gateway-Form, damit `readError` sie liest.
- [x] `sync.ts`: `RuleDiff.moves` (gekoppelte Scope-Wechsel), `ApplyResult.failures` (pro
      Änderung), `applyDiff` mit try/catch je Operation statt je Batch.
- [x] `sync.ts`: `planPriorityPhases` — Regeln, deren *Ziel*-priorität belegt ist, weichen auf
      Werte oberhalb aller bekannten aus. Eine Regel auf eine freie Priorität braucht das nicht und
      bleibt ein einfacher PUT. Kann eine Regel nicht ausweichen, wird sie aus Phase 2 ausgeschlossen
      und gemeldet, statt halb angewendet zu werden.
- [x] `sync.ts`: `providerWarnings` — **nicht blockierend**, gegen `modelCatalog`. Im API-Modus
      stammt der Katalog aus `builtInCatalog()`, einer statischen Liste im Repo, nicht vom Gateway.
      Deshalb ist der Text als Hinweis formuliert und blockiert nichts.
- [x] `useStore.ts`: `SyncStatus.failures`, `openApiDiff`/`previewApiDiff`, `syncFailuresOpen`,
      `DiffView.hints`. `refreshFromApi()` läuft **nur** bei sauberem Lauf — sonst verwürfe sie die
      Edits, die das Gateway gerade abgelehnt hat.
- [x] `TopBar.tsx`: Diff-Button in beiden Modi, Statuszeile im Fehlerfall als Button.
- [x] `SyncFailureModal.tsx` (neu), `DiffModal.tsx` rendert `hints`.

### Zwei Fehler, die die Validierung gefunden hat
- **Datenverlust beim Teil-Erfolg:** In einem ersten Entwurf stand `get().refreshFromApi()` statt
  `if (!pending) get().refreshFromApi()`. `refreshFromApi` baut den Canvas aus dem Gateway neu auf
  — bei `pending > 0` hätte es genau die Edits verworfen, die gerade nicht übertragen wurden. Der
  Test „behält den Canvas-Zustand" sichert das jetzt ab.
- **Testfehler, der sich als Codefehler tarnte:** Der erste Priority-Test griff mit `nodes[0]` und
  `nodes[1]` auf — das sind Trigger *und* Target, nicht zwei Trigger. Die Debug-Ausgabe
  (`CANVAS [[r1, 1], [r2, 1]]`) zeigte zwei Regeln auf Priorität 1. Tests suchen die Trigger jetzt
  über `data.ruleId`.

### Der Mock war der Grund, warum das nie gefunden wurde
`mock-bifrost.mjs` speicherte Regeln in einem flachen `Map` und prüfte bei PUT nur 404, scope und
Gewichtssumme. Ein Priority-Swap lieferte zwei erfolgreiche PUTs und lief grün. Mit der Simulation
liefert genau derselbe Aufruf den 500er, den das echte Gateway schickt — verifiziert durch
Deaktivieren des Dodgings: `27/28`, mit der Meldung des Users wörtlich.

Validation: `npm test` 106/106 grün, `npx tsc --noEmit` fehlerfrei, `npm run build` erfolgreich,
`gateway-smoke` 28/28. Regressionsnachweis: ohne `sync.ts` fallen die Kern-Tests in `sync.test.ts`
und `syncNow.test.ts` um; ohne Dodging fällt der Smoke-Check mit exakter 500er-Meldung.

## v0.2.9 Build 26100722 — Provider und Modelle kommen vom Gateway ✅

### Auslöser
Ein Nutzer meldete zwei Symptome: die Provider-Dropdowns an Target und Fallback laden nicht die in
Bifrost konfigurierten Provider, und ein „Fetch models" im Provider-Tab ordnet Modelle falschen
Providern zu. Dazu kamen rund 17 Regeln mit dem Hinweis *„steht nicht im Modell-Katalog"*, obwohl
der Push durchging.

### Was wirklich kaputt war
- **Der Katalog kam nie vom Gateway.** `openApiSession` setzt `providers: []`, und `fetchModels()`
  fiel ohne `activeDb` auf `builtInCatalog()` zurück — 12 fest verdrahtete Vendor-Modelle in
  `src/lib/models.ts`. `vercel`, `ocgoo`, `NaraRouter`, `oczen`, `opencode-zen` fehlten dort alle.
  Jeder echte Gateway-Provider sah für `providerWarnings` unbekannt aus.
- **`owned_by` ist nicht der Provider.** `ProviderManager` mappt `provider: m.owned_by ?? …`.
  Bifrost führt `owned_by` als Hersteller-Metadatum (`core/schemas/models.go`, direkt neben
  `architecture` und `pricing`). Aus `nvidianim/meta/llama2-70b` wurde so `meta` — jeder Klick auf
  „Fetch models" verteilte den Katalog auf die Hersteller statt auf die Konfigurationen.
- **Die Provider-Liste für den Rückschluss kannte den Katalog nicht.** Sie stand dreimal im
  InspectorPanel kopiert, und die Fassung in `FallbackEditor` zählte nur `providers`, nie
  `modelCatalog` — im API-Modus also eine leere Liste.

### Änderungen
- [x] `modelRefs.ts`: `splitModelId` (trennt am **ersten** `/`, Vendor-Präfixe bleiben im Modell),
      `mapGatewayModels` (explizites `provider`-Feld, sonst das erste Id-Segment — **`owned_by`
      wird nie gelesen**), `providerOptions` (eine Liste statt drei Kopien).
- [x] `bifrostApi.ts`: `plainRequest` für Pfade ohne Versionspräfix, `listModels` (folgt `total`),
      `listProviders`, `listProviderKeys`. Neue Typen `ApiModel`, `ApiProvider`, `ApiProviderKey`.
- [x] `useStore`: `fetchModels` liest im API-Modus das Gateway, `fetchProviders` neu.
      **Bei Fehler bleibt der Katalog leer** — `providerWarnings` schweigt dann, statt 12 Modelle
      gegen echte Provider zu halten. Im File-Modus bleibt die DB die Quelle.
- [x] Bridge: Whitelist um `/api/models`, `/api/providers`, `/api/providers/{p}/keys` erweitert —
      Read-only, liefert Namen, Key-IDs und redacted Values, kein Schlüsselmaterial.

### Zwei Bugs, die die neuen Tests gefunden haben
- **`/api/models` paginiert mit `limit` 5 als Default.** Ein Client, der eine Seite liest, glaubt
  einen vollständigen Katalog zu haben und verliert alles ab dem sechsten Modell. `listModels`
  folgt jetzt `total` und springt um die tatsächlich empfangene Zeilenzahl weiter — sonst
  überspringt er Zeilen, sobald das Gateway eine kurze Seite liefert, und läuft in eine Endlosschleife,
  wenn es `limit` ignoriert.
- **Die Bridge hat den Query-String verworfen** (nur `url.pathname`). Jede paginierte Anfrage bekam
  Seite eins zurück, wieder und wieder — als vollständiger Katalog aussehend, weil `total` stimmte.
- **`mapGatewayModels` hätte bei deklariertem Provider den Vendor-Präfix weggecut.** Der erste
  Entwurf splittete die Id immer; bei `{name: "meta/llama2-70b", provider: "nvidianim"}` ergab das
  `nvidianim/llama2-70b` statt `nvidianim/meta/llama2-70b`.

### Validierung
- `npm run typecheck`, `npm run build` clean.
- Vitest: **115 Tests in 15 Dateien**, grün (vorher 95 in 14).
- `gateway-smoke`: **31/31** (vorher 28). Der Mock hat die beiden Fallen eingebaut, die den echten
  Bug ausgelöst haben — ein Modell mit `owned_by: "meta"` und eine Fünf-Zeilen-Seite. Der
  Query-String-Bug der Bridge fiel genau deshalb auf.

## v0.2.9 Build 26100802 — Eine Projektion: `state.rules` entfernt ✅

### Auslöser
Ein Architektur-Review (Kandidaten A–E, see `/tmp/architecture-review-20261007-232945.html`)
zeigte, dass die letzten acht Commits ausnahmslos Sync-/API-Fixes waren — jeder davon ein
Einzelfall an einer anderen Stelle derselben Logik. Das war kein Zufall, sondern ein fehlender
Seam. Der erste Kandidat daraus war die Frage, ob `rules` im Store überhaupt etwas hält.

### Was wirklich kaputt war
`rules: RoutingRule[]` war ein **Connect-Snapshot** neben dem Canvas. Canvas-Edits zogen nicht nach.
`syncNow` diffe deshalb korrekt `getCanvasRules()` — das war der Fix aus `4ce1938` („Synchronisieren
schrieb nichts"). Drei weitere Call-Sites vertrauten dem Snapshot trotzdem:

- **`TopBar.tsx:91` — der teuerste Fund.** `toLiteLLM` und `toOpenAIModelGroups` bekamen
  `useStore((s) => s.rules)`. Regel auf dem Canvas umbenennen, LiteLLM-YAML exportieren → die Datei
  enthält den **alten** Namen. Stiller Datenverlust beim Export.
- **`reorderRulePriority` (:1210)** und **`reorderRulesByIds` (:1253)** schrieben beide
  `rules: get().rules.map(r => ({ ...r, priority: map[r.id] ?? r.priority }))` zurück. Die Priority
  kommt aus `data.priority` am Trigger-Knoten — der Snapshot-Write war reine Buchhaltung, die
  zufällig den Wert zurücksetzte, den der Canvas gerade gesetzt hatte.
- **`RulesPanel.tsx:37`** `rules.length ? rules : storedRules` — der Fallback ist unerreichbar: jeder
  Pfad, der `rules` füllte, baute die Nodes aus genau diesen Rules, also ist die Canvas-Projektion
  leer ⟺ `rules` leer.

### Änderungen
- [x] `StudioState.rules` entfernt, mit allen neun Schreibstellen (`openApiSession`,
      `refreshFromApi`, `refreshFromDb`, `saveToDb`, `disconnect`, `applyRuleset`, beide Reorder).
      Die umgebenden Locals (`routingRules`, `activeDb.listRules()`) bleiben — sie speisen
      `rulesToWorkflow` bzw. den Config-Export.
- [x] `TopBar` und `RulesPanel` projizieren jetzt selbst über `workflowToRules(nodes, edges)` —
      mit `useMemo` auf `[nodes, edges]`. Damit ist der Export-Bug behoben.
- [x] `syncNow.test.ts:66` `rules: []` entfernt. Kein Verhaltenswechsel, aber unter `strict` ein
      Excess-Property-Fehler — musste im selben Commit fallen.
- [x] Neu `src/store/rules.test.ts`: Reorder wirkt sofort in `getCanvasRules()`, und eine
      Canvas-Edit ist dort sichtbar. Damit ist die Invariante festgenagelt.
- [x] `CLAUDE.md`: die Gotcha wurde von der Warnung („nimm nicht `state.rules`") auf die
      Invariante umgeschrieben („es gibt kein `state.rules` — füg es nicht wieder hinzu").

### Bewusst nicht gemacht
- **Keine Memoization von `workflowToRules`.** ~9 Store-Stellen und 6 Komponenten rufen sie auf, ein
  reiner BFS über einen Graphen im Speicher. Ein Cache auf `nodes`/`edges` wäre die zweite Sache,
  die veralten kann — genau der Fehler, den diese Runde beseitigt.
- **Kein `queryForWrite`-Determinismus** (kommt in Kandidat A): stabile ids würden den
  `writeFingerprint`-Ausschluss ersetzen, ändern aber den Payload für das Gateway-Dashboard.
  Verschoben nach `TODO.md`.

### Validierung
- `npm run typecheck` clean. Die drei erwarteten Fehler (TopBar, RulesPanel, syncNow.test) waren
  die vollständige Liste der Leser — kein viertes Opfer.
- Vitest: **117 Tests in 17 Dateien**, grün (vorher 115 in 16 — `syncNow.test.ts` fehlte in der
  `TESTING.md`-Tabelle, mit ergänzt).
- `npm run build` erfolgreich.
- Noch **nicht** manuell geprüft: der Export-Fall im Browser (Canvas-Edit → LiteLLM-YAML → neuer
  Name in der Datei). Der Test pinnt die Projektion, nicht den Klickpfad.

## v0.2.9 Build 26100823 — `cel.ts` wird Ausführungs- und Vokabular-Autorität ✅

### Auslöser
Kandidat D aus dem Architektur-Review. Der Review nannte ihn „worth exploring" — das Vermessen für
diesen Plan hat etwas Schlimmeres gefunden: **die Simulation entschied anders als das Gateway, ohne
Fehler und ohne Log**, und ihr Ergebnis ging in den AI-Kontext (`AiAssistantPanel.tsx:40` →
`useAiAssistant.ts:250`).

### Was wirklich kaputt war
- **`in` war JS-`in`.** `evalCEL` (`useStore.ts:1549`) reichte den Ausdruck nach zwei String-Rewrites
  an `new Function`. `complexity_tier in ["COMPLEX","REASONING"]` prüfte damit Array-**Indizes** —
  Index 0 existiert, Index 1 nicht, also immer `false`. Bedingungen mit `in` haben nie matcht.
- **`time.hour` und `request_size` fehlten im Kontext** (`useStore.ts:1396-1409`). Der generierte Code
  hatte einen `catch`, der `false` zurückgab. Unsichtbar. `cel.test.ts:47` dokumentiert
  `time.hour >= 0 && time.hour < 6` als unterstütztes Konstrukt — die Simulation konnte es nie
  auswerten.
- **`params` war fest `{}`.** Jede `params[...]`-Bedingung likewise.
- **Sechs Feldtabellen.** `cel.ts` `FIELD_TO_CEL`, `bifrostQuery.ts` `FIELD_MAP`,
  `InspectorPanel.tsx` `FIELDS`, `RuleChainWizard.tsx` `WIZARD_FIELDS` — letztere mit **13** Feldern,
  `request` fehlte. Dazu `KNOWN_FIELDS` (null Leser, vier Felder die es in `CELField` nicht gibt) und
  `OPS` (null Leser) in `cel.ts`. Ein neues Feld verlangte Änderungen an sechs Dateien, ohne
  Compilerfehler wenn eine fehlte.

### Was geändert wurde
- **`CEL_FIELDS: Record<CELField, CELFieldSpec>`** in `cel.ts` — Label, CEL-Token, `numeric`-Flag.
  Als `Record` typisiert: ein neues `CELField`-Member bricht `tsc`. Genau der Compilerfehler, der
  ausblieb. Inspector und Wizard lesen die Tabelle, `bifrostQuery` nutzt `queryFieldName` als
  Projektion, `isNumericField` ist ein Tabellenzugriff.
- **`evaluateCEL(str, ctx)` → `{ matched, warnings }`**, auf dem `CELGroup`-Baum aus
  `parseExpression`. Nicht `boolean` und nicht `throw`: ein `boolean` kann „matcht nicht" nicht von
  „kann ich nicht sagen" unterscheiden — das war die Fehlerursache; ein `throw` bricht `simulate`
  ab, das den ersten passenden Trigger sucht. Ein Feld, das der Kontext nicht liefert, erzeugt eine
  Warnung. Die Kommaliste für `in` teilt sich mit `emitValue` — zwei Aufspaltungen würden
  gegeneinander driften.
- **`ParseResult.error`** unterscheidet Parse-Fehler von der Platzhaltergruppe. Ohne das liefe der
  Evaluator auf `newGroup()` und meldete `model == ""` → `false`, ohne Warnung.
- **Kontext vervollständigt:** `time.hour` aus der Uhr (kein Playground-Feld — die Anfrage kommt
  jetzt), `request_size` und `params` als echte `SimInput`-Felder mit Panel-Bedienung. Header
  case-insensitiv, wie HTTP es verlangt.
- **`resolveFallbackEdit`** in `modelRefs.ts`. `updateFb` rief `providerOptions` mit zwei Argumenten
  und ließ das dritte weg, das `ProviderDropdown` übergibt. Folge: ein Provider, der weder konfiguriert
  noch im Katalog ist, konnte nicht inferiert werden, `fallbackFromParts` bekam `''`, und der
  Fallback-Eintrag verschwand beim Tippen im Modell-Feld — während das Datalist genau diesen Wert
  anbot. Die Regel war einmal implementiert, ohne Test, an einer Stelle.
- **Gelöscht:** `evalCEL` (16 Zeilen `new Function`), `KNOWN_FIELDS`, `OPS`, `FIELD_TO_CEL`,
  `isNumericField`, `bifrostQuery.FIELD_MAP`, die Wizard-Tabellen, und vier tote Funktionen in
  `InspectorPanel.tsx` (`ConditionEditor`, `ProviderSelect`, `ModelSelect`, `ComplexityEditor` — alle
  mit null Aufrufern).

### Verifikation
182 Tests in 19 Dateien, `npm run build` durch, gateway-smoke **31/31**.

Die Simulationstests sind der eigentliche Beweis, weil sie den Storepfad fahren und nicht nur die
Funktion: `src/store/simulation.test.ts` ruft echte `runSimulation()`-Aufrufe gegen einen echten
Canvas auf. `in`, `time.hour`, `request_size`, `params` und Header-Case matchen jetzt — **alle sechs
Fälle lieferten vorher `false`**. Eine kaputte Regex meldet `not evaluable: invalid regex` als Notiz
statt still `false`.

### Bewusst nicht gemacht
- **`RuleChainWizard.quickCelExpression`** baut CEL per String-Interpolation: numerische Werte immer
  gequotet (`budget_used == "42"`), `time_hour` statt `time.hour`, `in` ohne Klammern. Echter Bug —
  aber die Datei ist ohne jsdom nicht testbar, und der Blast Radius ist eine Wizard-UI. Steht in
  `TODO.md`.
- **`celTokenToField` streng machen.** Der `default:`-Zweig fällt still auf `model`; `virtual_key_id
  == "x"` parst zu `model == "x"` ohne Warnung. Ein strenger Parser lässt `celToBifrostQueryObject`
  öfter `null` liefern, und `ruleShape.queryForWrite` schreibt dann öfter `query: null`. Echter
  Verhaltenswechsel im Sync, eigener Commit. Steht in `TODO.md`.
- **`ValueEditor.requestTypes` (9 Werte) gegen `REQUEST_TYPES` (7).** Die Union ist zu eng, nicht
  der Inspector zu weit — `aiDraft.ts:72` erzeugt `request_type == "responses"`, was in
  `REQUEST_TYPES` fehlt. Gateway-Frage, keine Refactor-Frage.
- **`syncMirror` / `setRoute` / `removeRoute`** aus `InspectorPanel` wandern nicht. Dünne Hüllen um
  `updateNodeData`; eine extrahierte Funktion hätte einen Aufrufer und würde den Body nur verschieben.

## v0.2.9 Build 26100803 — `ruleShape`: die geteilten Entscheidungen an einem Ort ✅

### Auslöser
Direkte Fortsetzung von Build 26100802. Kandidat A aus demselben Review: „Wie wird aus einer Regel
ein Gateway-Write" war viermal unabhängig implementiert, und drei dieser Entscheidungen waren an
mehreren Stellen mit **verschiedenen** Ergebnissen belegt.

### Was wirklich kaputt war
- **Gewichtssummen: drei Schwellen für dieselbe Frage.** `sync.ts:49` wirft bei `>1e-6`,
  `validation.ts:94` warnt bei `>0.001`, `aiDraft.ts:173` normalisiert still bei `>0.001`, und
  `InspectorPanel.tsx:607` rechnet die Summe ein viertes Mal inline. Ein Gewicht von `0.9995` ist im
  Sync ein Fehler, in der Simulation nicht existent.
- **`query` hatte zwei gegenläufige Policies.** `bifrostApi.ts:171` regeneriert immer aus dem CEL,
  `bifrostDb.ts:415/451` behält den gespeicherten Wert, wenn das CEL unverändert ist. `sync.ts:97`
  braucht einen Sonderfall („trägt eine frische uuid, kann nie gleich sein"), nur um die erste
  Policy zu umgehen.
- **Fallback-Pinning: vier Pfade, zwei Implementierungen.** `modelRefs.ts` entscheidet, dann
  projizieren `bifrostApi.ts:149`, `bifrostMapper.ts:159` und `bifrostDb.ts:833` — die letzten
  beiden unabhängig voneinander.
- **`splitModelId` war zweimal da.** `sync.ts:84` machte `f.split('/')[0]` per Hand nach, ohne Test.
- **`collectReachable` dreifach dupliziert**, keine der drei exportiert (`bifrostMapper.ts:33`,
  `validation.ts:46`, `useStore.ts:1447`) — dieselbe BFS mit demselben `chainout`/`chainin`-Ausschluss.

### Änderungen
- [x] Neu `src/lib/ruleShape.ts`. Besitzt **Entscheidungen, nicht Mapper**: `apiRuleToRouting`
      bleibt im Transportmodul, `nativeRowToRule` im SQL-Modul, `normalizeAiDraft` bleibt
      Untrusted-Input-Behandlung. `rulesToWorkflow` ist ohnehin kein Normalisierer, sondern die
      inverse Projektion. Interface: `WEIGHT_GATE_EPSILON`, `WEIGHT_WARN_EPSILON`, `weightSum`,
      `normalizeWeights`, `queryForWrite`, `queryForRow`, `fallbacksForApi`, `fallbacksForConfig`,
      `fallbacksFromConfig`.
- [x] `normalizeWeights` gibt ein **neues** Array zurück. `aiDraft.ts` mutierte in place und las
      danach `targets[last]` neu — eine Umstellung, die die Auswertungsreihenfolge ändert. Der
      Test `aiDraft.test.ts` (unverändert, grün) ist der Beweis, dass es ein Umzug war.
- [x] `collectReachable` wird aus `bifrostMapper.ts` exportiert; die beiden Kopien in
      `validation.ts` und `useStore.ts` sind gelöscht. Bewusst **nicht** nach `ruleShape` — Graph-
      Traversal ist keine Regelform.
- [x] `sanitizeFallback` gelöscht (kein Aufrufer außerhalb `bifrostApi.ts`), ersetzt durch
      `fallbacksForApi`.
- [x] `sync.ts:84` nutzt jetzt `fallbackToParts(f).provider`.
- [x] Neu `ruleShape.test.ts` (21 Fälle) und `providerWarnings`-Tests in `sync.test.ts` — die
      Funktion war exportiert, pur und hatte **null** Tests.
- [x] `bifrostDb.test.ts`: der Reuse-Zweig von `queryForRow` hatte keinen Fall. Neu: natives Schema,
      `updateRule` auf ein Nicht-CEL-Feld → Query-String byte-identisch, plus Gegenprobe.

### Ein Bug, den der neue Test gefunden hat
`fallbacksForApi` war zuerst über `fallbackToParts(...).key_id` gebaut. Das löst auch
`provider_key_name` auf — ein **config.json-Name**, der als `key_id` ans Gateway geht und dort
nichts pinnt. Der alte `sanitizeFallback` hat das Alias verworfen; die neue Funktion muss es
ebenfalls. Jetzt liest sie `fb.key_id` direkt. Der Kommentar an der Stelle sagt, warum.

Zweiter Fund beim selben Test: `fallbacksForApi` gab ohne Pin die kompakte String-Form
(`"openai/gpt-4o"`) zurück, wo `sanitizeFallback` ein Objekt lieferte. Das hätte den Payload
verändert. Ein Objekt bleibt jetzt ein Objekt.

### Abgelehnt
- Ein gemeinsamer `toRoutingRule(raw: unknown)`-Trichter für die vier Mapper — vier strukturell
  unähnliche Eingaben, eine imaginäre Interface.
- `WeightPolicy` als injizierbare Konfiguration — zwei Konstanten mit dokumentiertem Grund.
- `collectReachable` in `ruleShape` — Traversal ist Graph-Sache.
- **`queryForWrite` mit deterministischen ids.** Stabile ids aus Feld/Op/Wert würden den
  `writeFingerprint`-Ausschluss ersetzen — verlockend, aber es ändert den Payload, den das
  Gateway-Dashboard bekommt. Notiert in `TODO.md`, nicht hier.

### Validierung
- `npm run typecheck` clean, `npm run build` erfolgreich.
- Vitest: **144 Tests in 18 Dateien**, grün (vorher 115 in 16). `aiDraft.test.ts`,
  `modelRefs.test.ts`, `bifrostMapper.test.ts`, `validation.test.ts` blieben unverändert — dass sie
  weiter grün sind, ist der Beweis, dass jeder Schritt ein Umzug war.
- `gateway-smoke`: **31/31**. Geprüft wurde unter anderem „Ungültige Gewichte werden abgewiesen
  statt gepusht" — das ist die Schnittstelle zwischen `rejectionReason` mit
  `WEIGHT_GATE_EPSILON` und dem, was der Mock antwortet.
