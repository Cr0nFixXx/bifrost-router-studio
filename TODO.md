# TODO.md — Roadmap, Limitations & Extensions

> Status as of v1.2.0 (client-side SQLite via sql.js). Items marked ✅ are implemented.

## Implemented ✅
- [x] **Strict port enforcement** in `onConnect` (`isValidConnection` + `PORT_RULES`).
- [x] **Undo/redo** history (coalesced text edits) with `mod+z` / `mod+shift+z`.
- [x] **Real CEL parser** (recursive-descent) replacing the best-effort parser.
- [x] **Keyboard shortcuts** (add node, delete, duplicate, save, expert, collapse sidebars,
      `mod+shift+d` to diff the canvas against the database).
- [x] **Per-scope rule lists** (global / customer / team / virtual_key) with priority reorder.
- [x] **Client-side SQLite** — replaced `better-sqlite3`/Express with `sql.js` (WASM).
- [x] **Drag-to-reorder priority** in the Rules panel — pointer-drag within a scope group
      reorders the global first-match priority list (engine: `lib/ruleOrder.ts`).
- [x] **Diff viewer** *(proposed → implemented)* — `TopBar → Diff` (or `mod+shift+d`) shows the
      field-level delta between the canvas and the live `.sqlite` before saving
      (engine: `lib/diff.ts`, UI: `panels/DiffModal.tsx`).
- [x] **Rule versioning / snapshots** *(proposed → implemented)* — `RightPanel → History` tab
      saves named snapshots to IndexedDB, previews the diff vs the current canvas, and rolls
      back (persistence: `lib/db/snapshots.ts`). Client-side only, no server.
- [x] **Unit tests** (Vitest) for `bifrostMapper`, `validation`, `cel`, `bifrostDb`, plus the new
      `ruleOrder` and `diff` engines (36 tests passing).
- [x] **XML import** — workspace `.xml` is both exported (`exportWorkspaceXML`) and imported
      (`parseWorkspaceXML`, wired through `TopBar.onFile`). Previously listed as a TODO; it was
      already present.

## Future improvements
- [x] **Telemetry overlay** — `TopBar → Telemetry` toggles synthetic capacity metrics (p95 latency,
      error %, budget %, throughput) on target/fallback/provider nodes + a legend. Metrics are
      deterministic per node id and clearly labeled *synthetic* (no live data in a browser-only tool).
- [x] **Accessibility pass** — ARIA live regions for validation/diff/dirty state, modal `role="dialog"`
      + `aria-modal` + initial focus. (Full keyboard pan/zoom of the canvas still open.)
- [x] **Multi-select & group boxes** — Shift/Cmd-drag to box/multi-select; `Ctrl/⌘+G` groups the
      selection into a visual container node (and `Ctrl/⌘+Shift+G` ungroups) via the context menu or
      shortcuts. Grouped nodes are skipped by auto-layout so clusters stay intact.
- [x] **Theming tokens** — `TopBar → accent` popover with presets + a custom-hue slider; the primary
      accent (`neon`) is CSS-variable driven and persisted to localStorage. Surfaces and functional
      node colors stay fixed (design tokens preserved).
- [ ] **Multi-user collaboration** — presence cursors, shared workspaces (**requires a sync server**,
      out of scope for the current browser-only architecture).

## Proposed extensions (not started)
- [x] **Export to other gateways** — `Export` menu now offers LiteLLM `config.yaml` and OpenAI-compatible
      model-groups JSON (`lib/gatewayExport.ts`). Best-effort: CEL conditions are preserved as comments /
      a `condition` field since other gateways can't express them.
- [x] **Rule templates marketplace** — `TopBar → Templates` gallery of built-in templates plus
      user templates saved to localStorage; save the current canvas as a template and import/export
      shareable template packs as JSON (`lib/customTemplates.ts`).
- [ ] **Mobile companion view** — read-only rule browsing with deep-link sharing.
- [ ] **Optional Node bridge** — for teams that want server-side persistence/audit; the DB layer is
  isolated in `bifrostDb.ts` so it could target a remote API later without touching the UI.

## Known limitations
- **No inference proxy** — by design. This tool plans & edits config; it does not route traffic.
- **Mock simulation** — CEL is evaluated against a fixed synthetic request context with randomized
  outcomes; it demonstrates the path but does not reflect live capacity metrics.
- **Browser write model** — "Save" updates the in-memory DB + IndexedDB cache; "Download" produces
  the modified `.sqlite` file (browsers cannot write back to an arbitrary filesystem path).
- **Single DB in memory** — one database is open at a time; switching opens a new in-memory copy.

## Added in latest iteration

- [x] Metadata-only Rule nodes with separate Condition and AND/OR Logic nodes.
- [x] Edge label editing and edge deletion on the canvas.
- [x] Animated simulation playback with request playground.
- [x] Light mode via CSS variable theme tokens.
- [x] Additional built-in templates.
- [x] Export as Markdown, PNG and JPG.
- [x] User dashboard and settings panel.

## v0.2.1 / Build 26070603 follow-up

- [x] Own Dashboard page/modal outside the side menu.
- [x] Own Settings page/modal outside the side menu.
- [x] Resizable left and right side panels.
- [x] Multi-select via mouse selection and Ctrl/Cmd/Shift-click.
- [x] Visual-only annotation nodes: sticky note, box, marker, pen.
- [x] Model node removed from new-workspace UI; Target node owns provider/model/key/weight.
- [ ] Optional next structural simplification: aggregate multiple targets/fallbacks into one per-rule Target-list and Fallback-list node.

## Aggregated route-node refactor progress

- [x] One Target node can now represent multiple weighted provider/model routes for a rule.
- [x] One Fallback node can now represent the ordered fallback chain for a rule.
- [x] Simulation highlights the full rule condition/logic route, not only fallback edges.
- [ ] Polish aggregated Target/Fallback list UX with drag-to-reorder rows and per-row validation.

## v0.2.2 follow-up

- [x] Help area.
- [x] Advanced search and node/rule highlighting.
- [x] User settings store for projects/workspaces and visual background tools.
- [x] External `/v1/models` fetch support.
- [x] CHANGELOG.md.
- [x] Export selected nodes/rules as JSON.
- [x] Grey out disabled rule chains.
- [x] GitHub/code-editor-style diff viewer.
- [x] Visual editing tools moved to background overlays saved in user settings.
- [ ] Drag/resize handles for visual background tools.
- [ ] Persist full workspace snapshots per user project.

## v0.2.3 completed

- [x] Visual tool color picker for boxes, marker and pen.
- [x] Marker/pen stroke size setting.
- [x] Expanded help area.
- [x] Optional local server bridge for server-side SQLite/config.json file paths.
- [x] Connect screen support for bridge-loaded SQLite DBs and config.json.

## v0.2.4 completed

- [x] Provider/model/key dropdown-style inputs.
- [x] Visual tool color selection for box/marker/pen.
- [x] Marker/pen stroke-size fix.
- [x] Full nested AND/OR condition builder in Rule-Chain Wizard.
- [x] Stronger simple/expert mode distinction.

## AI Rule Assistant / Routing Copilot — Planung und Status

### Zielbild
- [x] Optionaler AI-Assistent, aktivierbar/deaktivierbar über Settings.
- [x] AI schlägt Regeln, Rule Packs, CEL-Ausdrücke und Optimierungen vor, ändert aber niemals direkt Canvas oder DB automatisch.
- [x] Alle AI-Änderungen laufen über Review/Diff/Apply-Flow.
- [x] Standard-Kontext korrigiert nach Entscheidung: selected rules + Provider/Model-Katalog. Weitere Kontexte sind wählbar.
- [ ] Optionaler Modus für größeren Kontext: Full Canvas, Diagnostics und Simulation nur per Opt-in senden.

### Provider & API
- [x] Custom OpenAI-compatible API über `/chat/completions` unterstützt.
- [x] Dedizierter Test-Connection Button für AI Provider.
- [ ] Anthropic-compatible API (`/v1/messages`) später ergänzen.
- [x] Bifrost Gateway kann bereits als OpenAI-compatible Provider über Custom Base URL genutzt werden.
- [x] AI-Antwortsprache abhängig vom User Prompt; System Prompt erzwingt keine feste Sprache.
- [x] API-Key Speicherung konfigurierbar: Session-only oder optional localStorage (`rememberApiKey`).
- [ ] Server-side DB Speicherung für API Keys/AI Settings bevorzugt, aber noch nicht implementiert.
- [x] Aktuell kein AI Proxy über Local Bridge implementiert; bewusst zurückgestellt.

### Server-side User/Config Store — optional & konfigurierbar
- [ ] Optionalen lokalen Persistence-Service planen/implementieren, getrennt vom browser-only Default.
- [ ] Unterstützte Backends: SQLite lokal und PostgreSQL.
- [ ] Konfiguration z. B. über ENV:
  - `BFRS_STORE_DRIVER=sqlite|postgres`
  - `BFRS_STORE_SQLITE_PATH=.bifrost-router-studio/store.sqlite`
  - `BFRS_STORE_POSTGRES_URL=postgres://...`
- [ ] Speichern: User Settings, Projects/Workspaces, AI Settings, optional API Keys, Chat/Draft History, Visual Tools, Snapshots.
- [ ] Secrets/API Keys nur serverseitig speichern, mit optionaler Verschlüsselung/Keyring-Strategie.
- [x] Browser localStorage als Offline-Fallback für User Settings und optionale AI Key Speicherung vorhanden.
- [ ] Migration/Schema-Versionierung für SQLite/Postgres vorsehen.

### Chat & Review UX
- [x] Eigenes AI Assistant Modal mit Chat, Kontextauswahl und Draft Review Panel.
- [x] Prompt Templates / Quick Prompts für neue Rule, Optimierung, Erklärung und JSON Drafts.
- [x] Draft Schema wird normalisiert und validiert: `rules[]`, Erklärung, Risiken, CEL, Targets, Weights, Provider/Model-Warnungen.
- [ ] Simulation-Beispiele im Draft Schema unterstützen.
- [x] Drafts können explizit auf den Canvas angewendet werden.
- [x] Drafts können verworfen werden, indem Chat/Draft gelöscht oder nicht angewendet wird.
- [x] Drafts direkt im Rule-Chain Wizard öffnen.
- [x] Drafts als Template speichern.
- [x] Bestehender Diff Viewer wird für AI Draft Review verwendet.

### Safety & Guardrails
- [x] AI Output wird nie automatisch gespeichert oder direkt in die SQLite DB geschrieben.
- [x] AI Output verändert Canvas nur nach explizitem User-Klick auf Apply.
- [x] CEL validieren, Targets/Fallbacks prüfen, Weight Sum prüfen, Provider/Model-Katalog warnen.
- [x] Prompt-Injection-Schutz im System Prompt: DB-Inhalte/Rule-Namen/Descriptions als untrusted data behandeln.
- [x] Risk Score für AI-Vorschläge: broad CEL, fehlende Fallbacks, unbekannte Provider, Chain Rule, Scope-Probleme.
- [ ] Audit Trail für AI-Vorschläge: Prompt, Modell, Draft, angewendet/verworfen, Zeitpunkt.

### Phasen
- [x] Phase 1: Settings + OpenAI-compatible Call + Test Connection.
  - [x] Settings vorhanden.
  - [x] OpenAI-compatible Call vorhanden.
  - [x] Test Connection Button vorhanden.
- [x] Phase 2: Chat UI + strukturierte Rule Drafts + Review Panel.
- [x] Phase 3: Apply Draft to Canvas nach Review.
- [x] Phase 3b: Save as Template + Explain Selected Rule.
- [ ] Phase 4: Full Canvas Optimizer + AI-generated Simulation Contexts.
- [ ] Phase 5: Optional server-side persistence for users/projects/secrets.

### Bereits implementierte Dateien/Funktionen
- [x] `src/store/useAiAssistant.ts` — AI Settings, Chat State, OpenAI-compatible Request, Context-Auswahl.
- [x] `src/components/panels/AiAssistantPanel.tsx` — Chat UI, Quick Prompts, Context Toggles, Draft Review.
- [x] `src/lib/aiDraft.ts` — Draft Normalisierung, Validierung, Merge mit Canvas Rules.
- [x] TopBar AI Button und `Ctrl/Cmd+J` Shortcut.
- [x] AI Settings Bereich in Settings Modal.

### Offene Designfragen
- [ ] Auth/Benutzerkonzept für serverseitigen Store: Single-user local, Multi-user später oder Profile ohne Login?
- [ ] Secret Storage: plain local DB verboten? OS keyring? passphrase encryption? ENV-only?
- [ ] Soll der serverseitige Store auch Workspaces/DB Snapshots versionieren oder nur Settings/AI History?
- [ ] Soll AI Zugriff auf komplette SQLite-Inhalte bekommen oder nur normalisierten Canvas/Provider-Kontext? Aktueller Default: selected rules + Provider/Model-Katalog.
- [ ] Welche maximale Kontextgröße und Kürzungsstrategie bei großen Routing-Setups?

## v0.2.6 AI Chat Markdown / Phase 1 Abschluss

- [x] AI Chat rendert Markdown (Headings, Listen, Blockquotes, Inline-Code, Code-Fences, Links, Bold/Italic).
- [x] AI Provider Test Connection Button in Settings ergänzt.
- [x] Phase 1 vollständig abgeschlossen: Settings + OpenAI-compatible Call + Test Connection.

## v0.2.6 Chat Streaming / Draft History / Markdown

- [x] AI chat streams OpenAI-compatible responses chunk-by-chunk where supported.
- [x] AI chat shows a waiting/streaming animation while responses are in flight.
- [x] AI chat renders Markdown safely (no raw HTML injection).
- [x] AI draft history lists all JSON drafts from the current chat so older answers can be selected and applied.
- [x] Diff modal z-index fixed so AI diff previews appear above the AI chat modal.
- [x] Long one-line chat text/code wraps without breaking the chat layout.

## v0.2.6 AI Phase 3b Fortschritt

- [x] AI Draft kann als Custom Template gespeichert werden.
- [x] Quick Action "Explain selected rule" im AI Chat ergänzt.
- [x] Draft direkt im Rule-Chain Wizard öffnen.
- [x] Explainer mit dediziertem strukturierten Output/Risk Score erweitern.

## v0.2.6 AI Phase 3b Abschluss / Risk Score

- [x] AI Drafts können in den Rule-Chain Wizard übergeben werden.
- [x] AI Draft Review zeigt Risk Score und Risk Reasons.
- [x] Phase 3b abgeschlossen: Save as Template + Explain Selected Rule + Wizard handoff.
- [ ] Audit Trail für AI-Vorschläge weiterhin offen.

## v0.2.6 SQL Browser

- [x] SQL Browser modal for routing rules and target/fallback projections.
- [x] Direct edit of routing rule metadata, CEL, targets JSON and fallbacks JSON.
- [x] Direct create/delete/save row operations against the in-memory SQLite DB.
- [x] Canvas refresh after direct SQL Browser edits.
- [ ] Future: arbitrary read-only SQL query runner with safe statement allowlist.

## v0.2.7 SQL Browser original table fields

- [x] SQL Browser shows original `routing_rules` fields with Normal/Expert visibility.
- [x] SQL Browser shows original `routing_targets` fields with Normal/Expert visibility.
- [x] Expert mode reveals `id`, `config_hash`, `query`, `scope_id`, timestamps, `rule_id`, `key_id`, `weight`.
- [x] Normal mode shows operational fields only.
- [x] Direct edits write through `BifrostDb` and refresh canvas.

## v0.2.7 SQL Browser inline editing / modal polish

- [x] Inline editing for `routing_rules` table cells.
- [x] Inline editing for `routing_targets` table cells.
- [x] Enter/blur commits inline cell edits through the DB layer.
- [x] Removed Quick Add Rule button from canvas toolbar.
- [x] Modal windows are resizable via native resize handle.

## v0.2.7 Save Fix — Duplicate routing_rules.id

- [x] Pre-save duplicate `ruleId` repair for Rule nodes.
- [x] Rule node duplication no longer copies persisted `ruleId`.
- [x] Live validation flags duplicate persisted rule IDs before saving.
- [x] Save path catches errors and resets busy state.
- [x] Regression test for duplicate persisted rule ID validation.

## v0.2.7 Simple/Expert Condition View

- [x] Simple mode can rebuild DB-loaded rules with shared/deduplicated Condition nodes.
- [x] Expert mode can rebuild rules with separate per-rule Condition nodes.
- [x] Added `Simplify conditions` button.
- [x] Added `Expand conditions` button.
- [x] Shared Condition inspector warning shows when one Condition feeds multiple rules/logic nodes.
- [x] Regression test verifies shared Conditions do not leak targets between rules.

## v0.2.7 Shared-condition disabled-state + curved edges

- [x] Disabled-rule grey-out no longer propagates through shared Condition nodes into unrelated rules.
- [x] Logic nodes still pull in their condition inputs for disabled-state highlighting.
- [x] Connections changed from stepped/eckig to curved Bezier edges.

## v0.2.8 TopBar / Modal / SQL Browser polish

- [x] Move SQLite DB download into Export menu.
- [x] Compact TopBar labels to icons on narrower screens.
- [x] Make modal windows width/height resizable within viewport.
- [x] Make SQL Browser columns resizable by dragging header handles.

## v0.2.8 Bifrost query builder state fix

- [x] Generate `routing_rules.query` from `cel_expression` for native Bifrost DB writes.
- [x] Preserve existing valid query builder state when CEL is unchanged.
- [x] Regenerate query builder state when CEL changes or query is missing/invalid.
- [x] SQL Browser row save auto-fills missing/invalid query from CEL.
- [x] Added tests for CEL → Bifrost react-querybuilder JSON and native DB query persistence.

## v0.2.8 Model/provider dropdown bugfix

- [x] Target model dropdown requires provider selection before showing models.
- [x] Target model values strip the selected provider prefix before saving.
- [x] Fallback model dropdown remains provider-optional.
- [x] Fallback model selection can infer provider from `provider/model` catalog values when provider is empty.
- [x] Added model reference helper tests.

## v0.2.8 Save-time query backfill

- [x] Save now automatically backfills missing/invalid `routing_rules.query` from `cel_expression`.
- [x] Download DB also ensures query-builder state exists before exporting.
- [x] Added regression test for `ensureRoutingRuleQueries()`.

## v0.2.8 Complexity removal / Simulation headers / TopBar view menu

- [x] Removed Complexity Router from palette, context menu, node registration and shortcut creation.
- [x] Added legacy workspace migration from Complexity node to Condition node (`complexity_tier == tier`).
- [x] Fixed Simulation headers editor so partial lines can be typed before parsing.
- [x] Simulation header parsing now happens on blur/run instead of every keystroke.
- [x] Moved direction, simplify/expand and Expert toggle into a compact View dropdown.
- [x] Removed unused Telemetry UI remnants from earlier cleanup.
