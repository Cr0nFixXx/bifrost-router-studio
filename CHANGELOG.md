# Changelog

## 0.2.8 — Build 26100506

- Added Bifrost 2.2.3 fallback object form `{ provider, model, key_id }` and key pinning in the Fallback inspector.
- `config.json` export/import resolves pinned `key_id` <-> `provider_key_name`.
- Added diagnostics for a fallback without provider (Bifrost 2.2.4 rejects it) and for pinned fallbacks (Bifrost <= 2.2.2 cannot decode them).
- AI drafts keep fallback key pins and drop fallbacks without provider.
- Workspace XML export/import carries pinned fallback keys via `@_key_id`.
- Fixed XML workspace import dropping every rule attribute (id, name, priority, scope, enabled).
- TopBar config.json export now resolves pinned fallback `key_id` to `provider_key_name` via `config_keys`.

## 0.2.2 — Build 26070619

- Updated build number after checking Europe/Berlin time.
- Deleted unused uploads directory.
- Vite dev server now binds to `0.0.0.0`.
- Added browser-safe local SQLite file-handle opening flow.
- Disabled rules now grey out connected condition/logic chains.
- Drag-selection requires Ctrl/Cmd/Shift.
- Added canvas lock and Drag/Pan vs Select mode controls.
- Sticky/box background visuals can be moved/resized; marker/pen are free-draw tools.
- Added Ctrl+K search shortcut.

## 0.2.2 — Build 26070603

- Added top-level Help modal.
- Added advanced Search modal with rule/node matching and canvas highlighting.
- Added local user settings store for projects/workspaces, model API settings and visual background tools.
- Added external `/v1/models` fetch support in Providers panel.
- Added selected nodes/rules JSON export.
- Changed disabled rules to visually grey out their connected rule chain.
- Restyled Diff modal into a GitHub/code-editor-like hunk view.
- Moved visual sticky/box/marker/pen tools to background canvas overlays stored in user settings instead of DB/routing nodes.
- Continued aggregated Target/Fallback node UX and full-rule simulation highlighting.

## 0.2.1 — Build 26070603

- Added independent Dashboard and Settings modal pages.
- Added resizable sidebars and improved multi-select.
- Added visual annotation prototype, PNG/JPG/Markdown exports, light mode, more templates and animated simulation.
- Security maintenance: upgraded Vite/Vitest/fast-xml-parser; `npm audit` clean.

## 0.2.3 — Build 26070701

- Added visual tool color selection and marker/pen stroke size controls.
- Expanded Help with detailed graph model, canvas usage, visual tools, Local Bridge and shortcuts.
- Added optional local server bridge (`npm run bridge`) for server-side SQLite/config.json filepath loading.
- Connect screen can open SQLite DBs or Bifrost config JSON through the Local Bridge.
- Added canvas lock and drag/select mode refinements, Ctrl/Cmd/Shift-only selection box and Ctrl+K search shortcut.

## 0.2.4 — Build 26070812

- Added provider/model/key dropdown-style datalist inputs for target routes and fallbacks.
- Added visual tool color selection for visual boxes, marker and pen.
- Fixed marker/pen stroke width persistence so size changes affect new strokes.
- Expanded the Rule-Chain Wizard with a nested visual CEL builder supporting AND/OR groups and conditions, plus text-to-visual parsing.
- Improved Simple vs Expert mode: Simple is compact; Expert exposes raw JSON, key IDs, exact weights and advanced fields.

## 0.2.4 — Build 26070818

- Updated build number after Europe/Berlin time check.
- Added dedicated TODO planning section for AI Rule Assistant / Routing Copilot.
- Planned optional configurable server-side user/config store with SQLite or PostgreSQL backends.

## 0.2.5 — Build 26070822

- Added AI Assistant foundation with Custom OpenAI-compatible chat/completions provider.
- Added AI settings in Settings modal.
- Added review-only AI Assistant modal/chat with prompt templates.
- Added selectable AI context; default context is selected rules plus provider/model catalog.
- Added JSON draft extraction/review panel without automatic canvas changes.
- Added TopBar AI button and Ctrl/Cmd+J shortcut.

## 0.2.5 — Build 26070822 Continued

- Added AI draft normalization and validation.
- Added AI draft diff preview against current canvas.
- Added explicit review-only Apply to Canvas action for valid AI drafts.

## 0.2.5 — Build 26070902

- Updated build metadata after final Europe/Berlin time check for the AI draft review/apply implementation.

## 0.2.5 — Build 26070915

- Corrected TODO status for the AI Rule Assistant planning section.
- Renamed the mistaken “Phase 6” work to Phase 1/2/3 status and marked implemented subtasks accordingly.
- Documented remaining AI Assistant gaps: test connection, template save, wizard handoff, risk score, audit trail and server-side persistence.

## 0.2.6 — Build 26070915

- Added safe Markdown rendering for AI chat messages.
- Added AI provider “Test connection” button in Settings.
- Marked AI Assistant Phase 1 as complete in TODO.

## 0.2.6 — Build 26070917

- Added OpenAI-compatible streaming response handling in AI chat.
- Added waiting/streaming animation.
- Added selectable draft history for all JSON drafts in the current AI chat.
- Fixed AI diff preview modal appearing behind the AI chat.
- Fixed long one-line chat text/code wrapping to avoid horizontal scrollbar layout breakage.

## 0.2.6 — Build 26071000

- Fixed AI draft JSON copy button with clipboard fallback and JSON download fallback.
- Fixed CEL parsing for AI-generated expressions using single quotes, `request_size`, `time.hour`, and header `in` lists.
- Added tests for complex AI-generated CEL and workspace conversion into Condition/Logic nodes.

## 0.2.6 — Build 26071001

- Added “Save template” action for valid AI drafts.
- Added “Explain selected rule” quick action in AI Assistant chat.
- Updated TODO Phase 3b status.

## 0.2.6 — Build 26071001 Continued

- Added AI Draft “Open in Wizard” handoff.
- Added risk score and risk reasons to AI Draft Review.
- Marked AI Phase 3b as complete in TODO.

## 0.2.6 — Build 26071003

- Updated build metadata after final Europe/Berlin time check for AI Phase 3b completion.
- Corrected duplicate TODO Phase 3b line for Wizard handoff.

## 0.2.6 — Build 26071004

- Fixed AI follow-up requests repeating the previous assistant answer by building the request history from the pre-request chat state and adding an anti-repeat instruction.

## 0.2.6 — Build 26071017

- Hardened AI system prompt to require the exact Bifrost rule draft schema (`cel_expression`, `targets[]`, `fallbacks[]`).
- Added compatibility normalization for non-standard AI outputs using `conditions`/`logic`/singular `target`.
- Normalized common AI CEL mistakes such as `request.headers`, `request.model`, `request.body.max_tokens`, `request.body.stream`, `request.url.path`, Markdown links and HTML entities.
- Added regression coverage for non-standard AI draft normalization.

## 0.2.6 — Build 26071319

- Corrected build metadata after final Europe/Berlin time check.

## 0.2.6 — Build 26071320

- Added full-rule duplication/export controls to rule context menu and Rules panel.
- Added AI chat file uploads for `.json`, `.txt`, `.md`, `.xml`, `.yaml`/`.yml`.
- Added per-message copy buttons in AI chat.
- Changed AI context panel into a collapsible dropdown.
- Moved AI system prompt into `src/lib/ai/systemPrompt.md`.
- Simplified waiting copy to “Assistant is thinking”.
- Rebuilt built-in templates to use the current Rule → Condition/Logic → aggregated Target/Fallback schema.
- Corrected build metadata after final Europe/Berlin time check.

## 0.2.6 — Build 26071322

- Fixed AI target weight warnings by enforcing weight-sum guidance in the system prompt and auto-normalizing draft target weights to 1.0 in the draft normalizer.
- Fixed “Open in Wizard” appearing behind the AI chat by raising the wizard modal z-index and closing the AI chat on wizard handoff.
- Added regression test for AI draft weight normalization.

## 0.2.6 — Build 26071517

- Added SQL Browser modal for routing rules with direct in-memory SQLite edits.
- Added TopBar SQL button.
- Added direct edit/create/delete of routing rules, targets JSON and fallbacks JSON projections.

## 0.2.7 — Build 26071519

- SQL Browser now displays and edits original `routing_rules` table fields with Normal/Expert visibility.
- SQL Browser now displays and edits original `routing_targets` table fields with Normal/Expert visibility.
- Added raw routing table accessors and mutators in the SQLite access layer.

## 0.2.7 — Build 26071519 Continued

- Added inline cell editing to SQL Browser for `routing_rules` and `routing_targets`.
- Removed the Quick Add Rule canvas button.
- Made modal windows resizable.

## 0.2.7 — Build 26073022

- Fixed save failure caused by duplicated Rule node `ruleId` / `routing_rules.id` values.
- Added pre-save duplicate rule-id repair for duplicated Rule nodes.
- Rule node duplication now strips copied persisted `ruleId`.
- Added validation diagnostic for duplicate persisted rule IDs.

## 0.2.7 — Build 26073022 Security follow-up

- Updated lockfile via `npm audit fix` to resolve newly reported `fast-xml-parser` and `postcss` advisories.

## 0.2.7 — Build 26073023

- Enforced UUID-style rule IDs for new Rule nodes, duplicated Rule nodes, duplicated whole rules and AI-generated drafts.
- Save now auto-repairs missing, non-UUID or duplicate `data.ruleId` values before writing to SQLite.
- Added validation warning for Rule nodes without a UUID `ruleId` and retained error for duplicate persisted rule IDs.

## 0.2.7 — Build 26073100

- Added Simple-mode condition deduplication for DB-loaded/rebuilt workflows.
- Added “Simplify conditions” and “Expand conditions” buttons.
- Expert mode expansion keeps per-rule condition nodes.
- Added shared condition inspector hint and regression test ensuring shared conditions do not leak targets across rules.

## 0.2.7 — Build 26073100 Continued

- Fixed disabled rule visual state leaking through shared condition nodes to other rules.
- Changed graph connections from stepped/square edges to curved Bezier edges.

## 0.2.7 — Build 26073100 Continued 2

- Removed Telemetry UI/overlay controls.
- Made the TopBar wrap safely to avoid overlap between database identity and controls.
- Reworked auto-layout to lay out each rule component structurally, improving Horizontal/Vertical switching and vertical readability.

## 0.2.7 — Build 26073102

- Corrected build metadata after final Europe/Berlin time check for the TopBar/layout cleanup.

## 0.2.8 — Build 26073103

- Moved “Download SQLite file” from TopBar into the Export menu.
- TopBar button labels now collapse to icon-only on narrower screens.
- Modal windows are resizable within the viewport.
- SQL Browser columns are resizable via header drag handles.

## 0.2.8 — Build 26080423

- Added CEL → Bifrost react-querybuilder `query` JSON generation.
- Native Bifrost DB saves now populate `routing_rules.query` so Bifrost's visual rule editor can reopen rules.
- SQL Browser saves auto-generate missing/invalid `query` from `cel_expression`.
- Added regression tests for query JSON generation and native DB query persistence.

## 0.2.8 — Build 26080500

- Fixed target/fallback model dropdown values duplicating provider prefixes in DB writes.
- Target model dropdown now filters strictly by selected provider and is disabled until a provider is selected.
- Fallback model dropdown remains provider-optional and can infer provider from provider-prefixed model selections.

## 0.2.8 — Build 26080500 Continued

- Added save-time backfill for missing/invalid `routing_rules.query` values from `cel_expression`.
- SQLite DB export now also ensures Bifrost dashboard query-builder state is present.

## 0.2.8 — Build 26080502

- Removed the visual Complexity Router node; `complexity_tier` remains available as a normal Condition field.
- Added legacy migration from old Complexity nodes to Condition nodes.
- Fixed Simulation header editor so users can clear and type new header lines.
- Moved layout/view controls into a compact View dropdown to avoid ugly TopBar wrapping between Expand and Save.
- Removed remaining Telemetry UI remnants.

## 0.2.8 — Build 26080518

- Declared project license as AGPL-3.0-only in package metadata.
- Simplified README to focus on overview, usage, local bridge and documentation map.
- Removed detailed project structure, license, version/build and changelog-style sections from README.

## 0.2.8 — Build 26080518 Screenshots

- Added README screenshots for canvas overview, AI Rule Assistant and SQL Browser.

## 0.2.8 — Build 26080520

- Changed SQLite database export default extension from `.sqlite` to `.db`.

## 0.2.8 — Build 26080521

- Modal windows now start at narrower default sizes while remaining edge-resizable.
- Added edge resize handles for modals instead of relying only on the bottom-right native resize affordance.
- Added Ctrl/Cmd+Shift+C and Ctrl/Cmd+Shift+V for copying/pasting selected nodes and internal edges.
- Reinforced Ctrl/Cmd/Shift-click node multi-select handling.

## 0.2.8 — Build 26080522

- Hardened modal close behavior by rendering modals through a body portal.
- Separated modal wrapper/backdrop/panel pointer events to avoid invisible overlays blocking the UI.
- Added guaranteed resize-listener cleanup when modals close or unmount.
