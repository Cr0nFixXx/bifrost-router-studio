# PROGRESS.md — Changelog

Status tracking for the project.

## v1.1.0 — Client-side SQLite (sql.js) refactor ✅

**Headline change:** removed the Express + `better-sqlite3` backend. The app is now a **pure
browser tool** — it opens, edits and exports the Bifrost SQLite file in-memory via
[sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WASM). No server, no native build.

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
- XML import not implemented (workspace/config `.json` import is).

## v1.0.0 — Initial build ✅

(See prior changelog.) Delivered: Vite+React+TS app, React Flow canvas with custom nodes/edges,
Bifrost schema mapping, visual + manual CEL, Rule-Chain Wizard, simulation playground, live
validation, provider/model manager, templates, import/export, mock auth + dashboard.

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
- Multi-user collaboration, telemetry overlay, theming tokens and the gateway-export adapters
  remain open (see TODO.md); multi-user needs a sync server outside the browser-only design.

## v1.3.0 — Gateway export, telemetry overlay & accessibility pass ✅

**Headline change:** rules can now leave the building. Added best-effort exporters to other LLM
gateways, a synthetic capacity-telemetry overlay on the canvas, and an accessibility pass.

### What changed
- [x] Gateway export adapters `src/lib/gatewayExport.ts`: `toLiteLLM()` (LiteLLM `config.yaml` with
      `model_list` + `router_settings.fallbacks`, CEL preserved as comments) and
      `toOpenAIModelGroups()` (OpenAI-compatible model-groups JSON with weights + `condition`).
      Wired into the `TopBar → Export` menu (`litellm` / `openai` kinds + `downloadFile`).
- [x] Telemetry overlay: `lib/telemetry.ts` (`nodeMetrics` — deterministic per-node synthetic
      readings + `STATUS_COLOR`); store flag `telemetryOn` + `toggleTelemetry`; `TelemetryBadge` on
      target/fallback/provider nodes; `TopBar → Telemetry` toggle; canvas legend.
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
