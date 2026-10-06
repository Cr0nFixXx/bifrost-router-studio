# ARCHITECTURE.md — Daten- und Transport-Schicht

Wie der Studio-Code aufgebaut ist: welche Schicht spricht mit was, und wo die Grenzen liegen.

| Need | Go to |
| --- | --- |
| Conventions, Fallstricke | [`CLAUDE.md`](./CLAUDE.md) |
| Tests, Abnahme-Kriterien | [`TESTING.md`](./TESTING.md) |
| Was die App kann | [`README.md`](./README.md) |

## Zwei Modi

Die App redet mit zwei möglichen Quellen. `connectionSource: 'file' | 'api'` in
`src/store/useStore.ts` entscheidet, welche aktiv ist.

| | File-Modus | API-Modus |
| --- | --- | --- |
| Quelle | SQLite-Datei des Nutzers | laufende Bifrost-Instanz |
| Transport | keiner, alles im Browser | `fetch` → Bridge oder direkt |
| Schreibpfad | `bifrostDb.replaceAllRules()` → Datei-Download | `POST`/`PUT`/`DELETE /api/routing/rules` |
| Handle | `getDb()` | `getApi()` |
| Extra | — | optionale Bridge hält den Management-Token |

Beide Modi füllen dieselben Store-Felder (`rules`, `nodes`, `edges`), laufen durch denselben
Mapper und erzeugen dieselben Diagnostics. Der Canvas unterscheidet die Modi nicht.

In **keinem** Modus wird Inference-Traffic geproxyt.

## Canvas ⇄ Bifrost-Vertrag

| Canvas-Element | Bifrost-Feld | Anmerkung |
| --- | --- | --- |
| `trigger` Knoten | ein `routing_rule` | `cel_expression`, `scope`, `scope_id`, `priority`, `chain_rule`, `enabled` |
| `target` Knoten | `rule.targets[]` | `{ provider?, model?, api_key?, weight }`; Gewichte müssen `1` ergeben |
| `fallback` Knoten | `rule.fallbacks[]` | `"provider/model"` oder `{ provider, model?, key_id? }` für Key-Pinning (Bifrost ≥ 2.2.3); Helfer in `src/lib/modelRefs.ts` |
| `provider` Knoten | `config.providers{}` | nur Metadaten |

**Graph-Modell:** Rule-Knoten sind reine Metadaten-Anker. Bedingungen sind eigene Condition-Knoten
plus verschachtelte AND/OR-Logik-Knoten; der Mapper kompiliert den verbundenen Bedingungsgraphen
nach `routing_rules.cel_expression`. Target-Knoten halten provider/model/key/weight direkt.
Fallback-Knoten sind visuell von Targets verbunden, serialisieren aber als regel-level
`routing_rules.fallbacks`.

**Legacy-Knoten:** `complexity` und `model` existieren noch in `src/types/workflow.ts` und
`nodeFactory.ts`, aber **nicht** in Palette oder `nodeTypes`. Sie überleben nur, damit alte
Workspaces migriert werden können (`complexity → Condition` mit `complexity_tier == tier`).

**Mapper** — `src/lib/bifrostMapper.ts`:
- `workflowToRules(nodes, edges)` — Graph → Rules. BFS über `collectReachable`, damit eine Regel
  auch dann auflöst, wenn ihre Targets über Zwischenknoten erreicht werden.
- `rulesToWorkflow(rules)` — Rules → Graph (beim DB-Laden und beim API-Connect).
- `rulesToConfig` — erzeugt `{ providers, governance: { routing_rules } }`.

## Daten-Schicht (File-Modus)

- `src/lib/sqljs/loader.ts` — Singleton, lädt die WASM über Vites Asset-Import
  (`sql.js/dist/sql-wasm.wasm?url`), nicht über einen Pfad unter `public/`. Liefert `openDatabase(buffer?)`.
- `src/lib/db/bifrostDb.ts` — **das einzige Modul, das SQLite anfasst.** Wickelt eine
  `sql.js.Database` ein und liefert typisierte CRUD für `routing_rules` / `providers` / `models`,
  dazu `exportConfig()`/`importConfig()` (Bifrost-`config.json`-Projektion) und `exportBytes()`
  (serialisiert die ganze DB für Download / IndexedDB-Cache).
- `src/lib/db/sample.ts` — Demo-Datensatz für *Open sample database*.
- `src/lib/db/persistence.ts` — IndexedDB-Cache der letzten DB-Bytes, damit ein Reload „resume" kann.

## Gateway-Schicht (API-Modus)

- `src/lib/bifrostApi.ts` — **das einzige Modul, das mit einem Gateway spricht.** CRUD, Fork-Fallback
  und `BifrostApiError` mit Status, damit 401 / 404 / „Bridge aus" unterscheidbar bleiben.
  `ApiRule` (GET) und `ApiRuleCreate`/`ApiRuleUpdate` (POST/PUT) sind bewusst getrennte Typen.
- `src/lib/sync.ts` — reine Diff-/Apply-Logik. `diffRules(local, remote)` liefert
  create/update/delete; `applyDiff` führt sie in dieser Reihenfolge aus und bricht beim ersten
  Fehler ab. `toUpdateShape` (hier) und `toWriteShape` (in `bifrostApi.ts`) konvertieren,
  `rejectionReason` weist schlechte Gewichte zurück.
- **Transports** — `bridgeTransport` (Default; die Bridge hält den Token) und `directTransport`
  (Token aus einem session-only Component-Feld, nie persistiert).
- **Auto-Sync** — debounced 800 ms, `useUserSettings.autoSync`, **default aus**. `syncNow()` ist
  immer aus dem TopBar aufrufbar.
- **Sync-Semantik** — die API gewinnt beim Connect, der Canvas danach. Es gibt **keine
  Konflikterkennung**: parallele Edits im Bifrost-Dashboard werden beim nächsten Push überschrieben.

Die sechs API-Constraints, an denen man hier leicht Regeln zerstört, stehen als Fallstricke in
[`CLAUDE.md`](./CLAUDE.md#fallstricke-gotchas). Nicht duplizieren — dorthin verweisen.

## Bridge

`npm run bridge` startet `scripts/local-bridge.mjs`. Sie bedient beide Modi:

- **File-Pfade** — `/api/open?path=…` und `/api/list?path=…` unter `BFRS_LOCAL_ROOT`. Absolute
  Pfade außerhalb des Roots brauchen `BFRS_ALLOW_ABSOLUTE=1`.
- **Gateway-Proxy** (API-Modus) — ein **Whitelist**-Proxy, kein generischer `/api/*`-Forwarder.
  Durchgelassen werden nur `/api/version`, `/api/health`, `/api/routing/rules[/{id}]` und
  `/api/governance/routing-rules[/{id}]`. Der Token wird injiziert aus `BFRS_BIFROST_URL` +
  `BFRS_BIFROST_TOKEN` (oder `BFRS_BIFROST_USER`/`BFRS_BIFROST_PASSWORD`).
  `GET /api/health` meldet Gateway-Erreichbarkeit, Version und Token-Gültigkeit, damit ein
  fehlgeschlagener Connect sich selbst erklären kann.

## Store-Verantwortlichkeiten

`src/store/useStore.ts` (Zustand) ist die einzige Quelle der Wahrheit für den UI-Zustand:

- React-Flow-`nodes`/`edges` und `onNodesChange`/`onEdgesChange`/`onConnect`
- Verbindungszustand (`connection`, `connectionSource`, `dbFileName`, `dbKind`, `busy`, `dirty`,
  `apiLabel`, `syncStatus`) plus `error`
- `direction` (LR/TB), `expertMode`, Sidebar-Collapse-Flags, `wizardOpen`, `activeRightTab`
- Spiegel: `rules`, `providers`, `modelCatalog`
- `diagnostics` (über `recompute()` nach jeder Graph-Mutation neu berechnet)
- Undo/Redo (`past`/`future` + `commit(tag?)` mit Text-Edit-Coalescing)
- `sim`/`simRunning` (Simulationsergebnis)

**Vertrag:** Nach jeder Mutation, die Topologie oder Node-Daten ändert, ruft `recompute()` die
Diagnostics neu auf und `markDirty()` setzt das Dirty-Flag. Im File-Modus cached `markDirty()`
zusätzlich die DB nach IndexedDB; im API-Modus plant `markDirty()` stattdessen den debounced Sync —
nur wenn Auto-Sync an ist.

`getDb()` und `getApi()` sind **Modulvariablen, kein reaktiver State**: Sie umschließen einen
WASM-Handle bzw. einen Fetch-Client. Nur ihre Daten liegen im Store gespiegelt.