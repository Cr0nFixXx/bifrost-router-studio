# TODO.md — Roadmap, Limitations & Extensions

> Status as of v0.2.9. Items marked ✅ are implemented.
>
> This file is the **roadmap**: what is still open, what is deliberately not
> done, and the design questions not yet settled, with priorities. Completed
> work is recorded in [`PROGRESS.md`](./PROGRESS.md) (detailed engineering log)
> and [`CHANGELOG.md`](./CHANGELOG.md) (feature and bug-fix summary) — not here.
> Larger ideas that deserve a route of their own belong in
> [`MILESTONES.md`](./MILESTONES.md).

## Implemented ✅

Delivered features, listed for orientation. No status is maintained here — see the two logs above.

### Core editor
- [x] **Strict port enforcement** in `onConnect` (`isValidConnection` + `PORT_RULES`), self-loops blocked.
- [x] **Undo/redo** history (coalesced text edits) with `mod+z` / `mod+y` / `mod+shift+z`.
- [x] **Real CEL parser** (recursive-descent) replacing the best-effort parser.
- [x] **Keyboard shortcuts** — add/delete/duplicate nodes, save, expert toggle, sidebar collapse,
      `mod+shift+d` to diff the canvas against the database, `mod+k` search, `mod+j` AI assistant,
      `mod+g` / `mod+shift+g` group and ungroup, `mod+shift+c` / `mod+shift+v` clipboard.
- [x] **Per-scope rule lists** (global / customer / team / virtual_key) with priority reorder.
- [x] **Client-side SQLite** — replaced `better-sqlite3`/Express with `sql.js` (WASM).
- [x] **Diff viewer** — `TopBar → Diff` (or `mod+shift+d`) shows the field-level delta between the
      canvas and the live `.sqlite` before saving (engine: `lib/diff.ts`, UI: `panels/DiffModal.tsx`).
- [x] **Rule versioning / snapshots** — `RightPanel → History` saves named snapshots to IndexedDB,
      previews the diff vs the current canvas and rolls back (`lib/db/snapshots.ts`).
- [x] **XML import/export** — workspace `.xml` round-trips through `exportWorkspaceXML` /
      `parseWorkspaceXML`.
- [x] **Simple/Expert condition view** — shared, deduplicated Condition nodes vs per-rule ones,
      plus `Simplify conditions` / `Expand conditions`.
- [x] **Multi-select & group boxes** — Shift/Cmd-drag box select, `mod+g` grouping. Grouped nodes are
      skipped by auto-layout so clusters stay intact.
- [x] **Aggregated route nodes** — one Target node carries multiple weighted routes, one Fallback node
      the ordered chain.
- [x] **Accessibility pass** — ARIA live regions for validation/diff/dirty state, modal `role="dialog"`
      + `aria-modal` + initial focus.

### Data and compatibility
- [x] **Drag-to-reorder priority** in the Rules panel (`lib/ruleOrder.ts`).
- [x] **Dashboard `query` state** — generated from `cel_expression`, backfilled on save, preserved when
      the CEL is unchanged (`lib/bifrostQuery.ts`).
- [x] **Bifrost 2.2.3 fallback object form** `{ provider, model, key_id }` with key pinning, including
      the `config.json` `provider_key_name` alias.
- [x] **Pre-save duplicate `ruleId` repair** plus a validation diagnostic for it.
- [x] **Model node removed** from the palette and node registry; the Target node owns
      provider/model/key/weight.

### Surfaces
- [x] **Dashboard and Settings** as top-level modal pages from the TopBar (not right-panel tabs).
- [x] **SQL Browser** — table-oriented editor for `routing_rules` and `routing_targets` with inline
      editing, resizable columns and Normal/Expert field visibility.
- [x] **Resizable modals and side panels**; clipboard for nodes (`mod+shift+c` / `mod+shift+v`).
- [x] **Search & highlight** — `mod+k`, stronger neon ring that takes precedence over selection.
- [x] **Simulation playground** with animated playback along the matched route.
- [x] **Visual background tools** — sticky notes, boxes, markers and pen strokes as canvas overlays
      that never serialize to Bifrost tables.
- [x] **Theming tokens** — accent presets + custom-hue slider, CSS-variable driven and persisted.
- [x] **Light mode** via CSS variables; dark mode stays the default and the primary design target.
- [x] **Templates gallery** plus user templates in localStorage and shareable JSON template packs
      (`lib/customTemplates.ts`).
- [x] **Rule-Chain Wizard** with a full nested AND/OR condition builder.
- [x] **Optional local bridge** (`scripts/local-bridge.mjs`) for server-side file paths.
- [x] **Exports** — workspace JSON, Bifrost `config.json`, workspace XML, LiteLLM YAML, OpenAI model
      groups, selected nodes/rules JSON, Markdown, PNG, JPG, edited SQLite DB.

### Live gateway (API mode, v0.2.9)
- [x] Second exclusive Connect mode against a running Bifrost instance over its management API.
      `connectionSource: 'file' | 'api'` decides the source; file mode is unchanged and still default.
- [x] `src/lib/bifrostApi.ts` — the only module that talks to a gateway. `ApiRule` (GET) and
      `ApiRuleCreate`/`ApiRuleUpdate` (POST/PUT) are separate types so a GET response can never be
      round-tripped into a write.
- [x] `src/lib/sync.ts` — diff + apply per rule: PUT for changed, POST for new, DELETE for removed.
- [x] Rules created in the Bifrost dashboard hydrate into the canvas and are editable.
- [x] Unmodelled fields (`scope`, `scope_id`, `priority`, `ttft_timeout_ms`) are read-only and preserved
      across a push.
- [x] `query` regenerated from the CEL on every push so Bifrost's rule builder matches the canvas.
- [x] Auto-sync toggle (debounced 800 ms), **off by default**; manual `Synchronisieren` in the TopBar.
- [x] Bridge is a whitelist proxy; the management token stays in `BFRS_BIFROST_TOKEN`.
- [x] Unit tests (Vitest) across the mapper, validation, CEL, DB layer, `ruleOrder`, `diff`, model
      refs, query builder and the sync engine.

## Open work

- [ ] **Multi-user collaboration** — presence cursors, shared workspaces. Requires a sync server and is
      out of scope for the current browser-first architecture.
- [ ] **Mobile companion view** — read-only rule browsing with deep-link sharing.
- [ ] **Server-side persistence & audit trail** — the local bridge handles file paths and API proxying,
      but stores nothing. User settings, projects and secrets still live in localStorage.
- [ ] **Drag/resize handles for visual background tools** (sticky notes, boxes, markers, pen strokes).
- [ ] **Persist full workspace snapshots per user project** — snapshots exist, but are global rather
      than scoped to a project.
- [ ] **Polish aggregated Target/Fallback list UX** — drag-to-reorder rows and per-row validation.
- [ ] **Full keyboard pan/zoom of the canvas** — the accessibility pass covered ARIA and focus, not
      navigation.
- [ ] **Arbitrary read-only SQL query runner** in the SQL Browser, behind a safe statement allowlist.

## Known limitations

- **No inference proxy** — by design. This tool plans and edits config; it does not route traffic.
- **Mock simulation** — CEL is evaluated against a fixed synthetic request context with randomized
  outcomes; it demonstrates the path but does not reflect live capacity metrics.
- **Browser write model** — in file mode, "Save" updates the in-memory DB + IndexedDB cache;
  "Download" produces the modified `.sqlite` file. Browsers cannot write back to an arbitrary path.
- **Single source in memory** — one database or gateway at a time; switching opens a new copy.
- **Manual simulation only** — there is no link to live Bifrost metrics from a browser tool.

### API mode specifics
- **No conflict detection** — the API wins at connect, the canvas wins afterwards. Edits made in the
  Bifrost dashboard in parallel are overwritten by the next push.
- **Scope changes are destructive** — Bifrost's update endpoint cannot change `scope`, so a move is
  delete + create: the rule briefly does not exist and gets a new id.
- **No offline queue** — if the bridge is down, changes stay unsynced until the next manual push.
- **No per-key RBAC scopes** — those are Enterprise-only on Bifrost, so the UI does not offer them.
- **Direct mode keeps the token in browser memory** — session-only, never persisted, but still not
  suitable for anything beyond a local test instance.

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
- [x] Bifrost Gateway kann bereits als OpenAI-compatible Provider über Custom Base URL genutzt werden.
- [x] AI-Antwortsprache abhängig vom User Prompt; System Prompt erzwingt keine feste Sprache.
- [x] API-Key Speicherung konfigurierbar: Session-only oder optional localStorage (`rememberApiKey`).
- [ ] Anthropic-compatible API (`/v1/messages`) später ergänzen.
- [ ] Server-side DB Speicherung für API Keys/AI Settings bevorzugt, aber noch nicht implementiert.

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
- [x] Drafts können explizit auf den Canvas angewendet werden.
- [x] Drafts können verworfen werden, indem Chat/Draft gelöscht oder nicht angewendet wird.
- [x] Drafts direkt im Rule-Chain Wizard öffnen.
- [x] Drafts als Template speichern.
- [x] Bestehender Diff Viewer wird für AI Draft Review verwendet.
- [x] Risk Score für AI-Vorschläge: broad CEL, fehlende Fallbacks, unbekannte Provider, Chain Rule, Scope-Probleme.
- [ ] Simulation-Beispiele im Draft Schema unterstützen.

### Safety & Guardrails
- [x] AI Output wird nie automatisch gespeichert oder direkt in die SQLite DB geschrieben.
- [x] AI Output verändert Canvas nur nach explizitem User-Klick auf Apply.
- [x] CEL validieren, Targets/Fallbacks prüfen, Weight Sum prüfen, Provider/Model-Katalog warnen.
- [x] Prompt-Injection-Schutz im System Prompt: DB-Inhalte/Rule-Namen/Descriptions als untrusted data behandeln.
- [ ] Audit Trail für AI-Vorschläge: Prompt, Modell, Draft, angewendet/verworfen, Zeitpunkt.

### Phasen
- [x] Phase 1: Settings + OpenAI-compatible Call + Test Connection.
- [x] Phase 2: Chat UI + strukturierte Rule Drafts + Review Panel.
- [x] Phase 3: Apply Draft to Canvas nach Review.
- [x] Phase 3b: Save as Template + Explain Selected Rule.
- [ ] Phase 4: Full Canvas Optimizer + AI-generated Simulation Contexts.
- [ ] Phase 5: Optional server-side persistence for users/projects/secrets.

### Bereits implementierte Dateien/Funktionen
- `src/store/useAiAssistant.ts` — AI Settings, Chat State, OpenAI-compatible Request, Context-Auswahl.
- `src/components/panels/AiAssistantPanel.tsx` — Chat UI, Quick Prompts, Context Toggles, Draft Review.
- `src/lib/aiDraft.ts` — Draft Normalisierung, Validierung, Merge mit Canvas Rules.

### Offene Designfragen
- [ ] Auth/Benutzerkonzept für serverseitigen Store: Single-user local, Multi-user später oder Profile ohne Login?
- [ ] Secret Storage: plain local DB verboten? OS keyring? passphrase encryption? ENV-only?
- [ ] Soll der serverseitige Store auch Workspaces/DB Snapshots versionieren oder nur Settings/AI History?
- [ ] Soll AI Zugriff auf komplette SQLite-Inhalte bekommen oder nur normalisierten Canvas/Provider-Kontext? Aktueller Default: selected rules + Provider/Model-Katalog.
- [ ] Welche maximale Kontextgröße und Kürzungsstrategie bei großen Routing-Setups?