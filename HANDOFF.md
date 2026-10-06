# HANDOFF.md — Stand für die nächste Session

> Geschrieben als Übergabe, weil der Kontext der Erstellungs-Session voll war.
> Diese Datei ist der vollständige Stand — nicht die Chat-Historie lesen, das hier lesen.

**Projekt:** Bifrost Router Studio · aktuelle Version/Build: siehe `src/lib/version.ts`
(Hier genannte Zahlen sind nach dem nächsten Bump veraltet — deshalb keine hier.)
**Stand:** vier Skills geschrieben und über zwei Eval-Läufe bewertet, zwei echte Bugs in
`bifrostApi.ts` und neun Doku-Bugs gefunden — alle neun angewendet, `copy-wasm.mjs` entfernt.

---

## Was in dieser Session passiert ist

### 1. API-Modus (v0.2.9) — implementiert und committet

Der Connect-Screen hat zwei exklusive Modi: SQLite-Datei (Default, unverändert) und eine laufende
Bifrost-Instanz über die Management-API. Details in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### 2. Doku-Set auf neun Files aufgeteilt

`CLAUDE.md` war auf 242 Zeilen gewachsen und widersprach sich selbst. Neu entstanden:
[`ARCHITECTURE.md`](./ARCHITECTURE.md), [`TESTING.md`](./TESTING.md), [`MILESTONES.md`](./MILESTONES.md).
Rollenverteilung und Regeln stehen in `.claude/skills/doc-set/references/`.

### 3. Vier Skills angelegt

| Skill | Triggert bei | Enthält |
| --- | --- | --- |
| `doc-set` | „wo gehört das hin", neue Doku-Datei | Rollenmatrix, Pflegeregeln |
| `doc-audit` | „prüf die Doku", Doku stimmt nicht | Verifikations-Kommandos |
| `release-bump` | jede Code-Änderung (Build-Vertrag) | `scripts/bump.mjs` |
| `gateway-smoke` | nach Änderungen an API-Modus/Bridge | `scripts/smoke.mjs` (20 Checks) + Mock |

### 4. Eval-Lauf 1 — zwei echte Bugs gefunden

**Bug 1 (schwer):** Der Bifrost-<2.0.0-Fallback fragte `/api/governance/rules`. Diese Route gibt
es nicht, richtig ist `/api/governance/routing-rules`. Der Fall war tot. **Gefunden vom
Baseline-Agenten, nicht vom Skill** — der eigene Smoke-Test hatte es übersehen, weil ein Mock, der
die Collection mit 404 beantwortet, einen falschen Pfad genauso akzeptiert.

Fix in [src/lib/bifrostApi.ts](src/lib/bifrostApi.ts): `VersionPrefix` trägt Prefix **und**
Rules-Suffix, `resolve()` setzt sie zusammen.

**Bug 2:** `version()` lief durch die Rules-Whitelist, die `/api/version` nicht enthält. Jetzt
direkt adressiert.

**Bug 3 (im Skill selbst):** `bump.mjs` benutzte eine Regex, die `scripts.build` statt des
Top-Level-`build` traf — hätte beim nächsten Release das Vite-Kommando zerstört. Jetzt JSON-Parse.

---

## Eval-Lauf 2 — abgeschlossen

Beide Aufgaben sind umgesetzt, beide haben gewirkt. Der Lauf hat zusätzlich **neun echte Doku-Bugs**
gefunden, die vorher niemand gesehen hatte.

### Aufgabe A — erledigt

`doc-audit` Eval 1 hat jetzt eine echte falsche Prämisse: [TESTING.md:35](TESTING.md#L35) behauptet,
`bifrostDb.test.ts` werde von `io.test.ts` mitabgedeckt. Die Datei existiert unter
`src/lib/db/`, hat 10 Tests, läuft eigenständig — und wer nur in `src/lib/` sucht, findet sie nicht.

**Ergebnis: der Test diskriminiert nicht.** Mit Skill und Baseline finden denselben Befund mit
gleicher Beweisführung (12 vs. 10 Calls). Ehrlich: für die Frage *existiert diese Behauptung noch*
ist ein Regelwerk neutral — das Modell prüft von sich aus nach.

### Aufgabe B — erledigt, wirkt

Neue Sektion *Gotcha oder bekannte Grenze?* in
[`.claude/skills/doc-set/references/file-roles.md`](./.claude/skills/doc-set/references/file-roles.md)
plus ein Verweis aus dem SKILL.md, weil die Zweideutigkeit in Schritt 1 entstand.

| | Iteration 1 | Iteration 2 |
| --- | --- | --- |
| mit Skill | `CLAUDE.md` Fallstricke | **`TODO.md`, begründet** |
| ohne Skill | `ARCHITECTURE.md` Sync-Semantik | `ARCHITECTURE.md` Sync-Semantik |

Die Baseline-Antwort ist über beide Iterationen stabil. Die Skill-Antwort hat sich von einer
vertretbaren, aber falschen Einordnung zur begründeten korrigiert: *niemand tut etwas Falsches,
es fehlt schlicht eine Prüfung*.

**Was der Skill wirklich bewegt:** begründeter, nicht richtiger. Die Baseline-Antwort auf eval-3
ist nicht falsch — sie priorisiert nur anders, weil sie die Frage nach dem *Ort* stellt statt nach
der *Art*.

### Der eigentliche Befund des Laufs

**Kein einziger der neun Doku-Bugs stammt aus einem Lauf mit Skill — außer einem.** Die Baseline
fand mehr und fand tiefer. Das revidiert die Aussage aus Eval-Lauf 1 in die andere Richtung.

### Neun Doku-Bugs, alle gegen den Code verifiziert

| # | Fundstelle | Befund |
| --- | --- | --- |
| 1 | [`CLAUDE.md:70`](./CLAUDE.md#L70) | Build `26100507`, tatsächlich `26100604`. Der Versioning-Vertrag widerspricht dem Code. |
| 2 | [`ARCHITECTURE.md:56`](./ARCHITECTURE.md#L56) | Loader als `initSqlJs({ locateFile })` auf `public/` beschrieben. Real löst er über Vites `?url`-Pipeline auf; `copy-wasm.mjs` ist toter Ballast. |
| 3 | [`DESIGN.md:85`](./DESIGN.md#L85) | Dataviz-Tabelle führte `Model` und `Complexity` als aktuelle Elemente, fehlte aber `Condition` und `Logic`. Beide sind legacy — Komponente da, aber weder in `nodeTypes` noch in der Palette. |
| 4 | [`DESIGN.md:40`](./DESIGN.md#L40) | Section-Labels sind `text-[11px]`, nicht `text-[10px]`. |
| 5 | [`ARCHITECTURE.md:72`](./ARCHITECTURE.md#L72) | `toWriteShape` liegt in `bifrostApi.ts`, nicht in `sync.ts` (das importiert es nur). |
| 6 | [`TESTING.md:35`](./TESTING.md#L35) | `bifrostDb.test.ts` als mitabgedeckt deklariert; Tabelle summiert 85 statt 95. |
| 7 | [`CLAUDE.md:40`](./CLAUDE.md#L40) | CEL-Variablenliste unvollständig: `request_size` und `time.hour` fehlen. |
| 8 | [`PROGRESS.md:1`](./PROGRESS.md#L1) | Überschrift „Changelog", während der Dateikörper und README es Engineering-Log nennen — Selbstwiderspruch. |
| 9 | eigene Position | „CLAUDE.md verweist noch nicht auf die vier Skills" — trifft nur noch teilweise zu (`gateway-smoke` wird an einer Stelle genannt). |

**Alle neun sind angewendet.** Ein Befund war beim Nachprüfen halb falsch: die Baseline behauptete,
der Model-Node sei gelöscht — tatsächlich existiert `ModelNode` weiter, er ist nur nicht mehr
registriert. Die Korrektur in `DESIGN.md` beschreibt den Ist-Zustand statt die Behauptung zu
übernehmen.

Befunde 2, 3, 4 und 7 stammen aus dem **mit-Skill**-Lauf. Die Baseline fand 1, 2, 4, 5, 6 und
die PROGRESS-Inkonsistenz.

### Was Eval-Lauf 2 über die Testanlage lehrt

- **doc-audit braucht breite Aufträge, doc-set braucht schmale.** Der Voll-Audit lief in 66–68
  Calls und fand 7 Befunde; die Beratungsfragen in 6–12 Calls. Der Test mit der besten
  Trefferquote war der größte.
- **Die Baseline ist hier stärker, nicht schwächer.** Zwei Befunde hat nur sie gefunden
  (DESIGN.md:85, CLAUDE.md:40) — beide sind Details, die ein Audit-Fokus übersieht.
- **`doc-set` diskriminiert nur bei echter Mehrdeutigkeit.** eval-1 (keine Mehrdeutigkeit) →
  identische Antworten. eval-3 (Mehrdeutigkeit) → klarer Unterschied.

### Verfahrensfehler, der in Iteration 1 noch latent war

Der Sandbox-Befehl aus HANDOFF.md war falsch: `git ls-files` liefert `.claude/settings.local.json`
mit, und `cp -r .claude $d/.claude` legte deshalb **nested** `.claude/.claude/skills/` an. Alle
Baseline-Läufe hatten die Skills und zitierten sie. Korrigiert:

```bash
git ls-files -z | grep -zv '^\.claude/' | tar --null -T - -cf - | tar -xf - -C $d
# Skills nur in die with-Kopien:
[ "$cfg" = "with" ] && cp -r .claude "$d/.claude"
```

---

## Was offen ist

### Neun Doku-Bugs — erledigt

Alle neun angewendet. Zusätzlich entschieden: **`scripts/copy-wasm.mjs` und `public/sql-wasm.wasm`
sind entfernt**, samt `copy-wasm`-Aufrufen in `dev` und `build`. Belegt mit einem kompletten
`npm run build` ohne die Vorstufe — die WASM landet als Vite-Asset in `dist/assets/`.

Bewusst **nicht** übernommen: die Formulierung von Befund 3 aus dem Agenten-Report („Model-Node
gelöscht"). Prüfen hat gezeigt, dass die Komponente existiert und nur die Registrierung fehlt —
die Doku beschreibt den Ist-Zustand, nicht die Annahme.

### Vier Fehlschläge durch den Provider

`doc-audit eval-3` ist in beiden Konfigurationen an API-Stream-Abbrüchen
(`provider closed the stream`) viermal gestorben, inklusive einmal bei einem Lauf mit nur
18 Calls. Nicht auf den Auftrag zurückzuführen — `npm test` braucht 7 s, ist also nicht die
Ursache. Falls das wieder auftritt: Auftrag verkleinern, nicht den Provider wechseln.

### Nicht erledigt

- **`CLAUDE.md` verweist nur an einer Stelle auf einen Skill** (Nennung von `gateway-smoke` in den
  Fallstricken). Die vier Skills stehen weder in der Rolle-Tabelle noch in einer eigenen Sektion.
  Ergänzen, wenn der Status der Skills feststeht.
- Die doc-Skills wurden **nicht** bewertet als Gate für Commits. Der Befund oben sagt eher das
  Gegenteil: sie sind eine gute Lektürehilfe, keine Fehlerquelle.
- Kein Viewer geöffnet — die Auswertung lief über den Vergleich der Antworten, weil nur vier
  Tests liefen und die Abweichungen direkt sichtbar waren.
- API-Modus-Grenzen: keine Konflikterkennung, kein Offline-Queue, `ttft_timeout_ms`/`scope`/`priority`
  nicht im Canvas editierbar — steht in [`TODO.md`](./TODO.md)
- Plugins: 20 Stück sind aktiviert und wurden nie benutzt (~5.700 est. Tokens pro Session). Der
  Nutzer hat die Deaktivierung abgelehnt — nicht wieder vorschlagen, ohne gefragt zu werden

## Schnellprüfung

```bash
npm test                                   # 95 Tests, 14 Files
npm run build                              # tsc --noEmit + vite build
node .claude/skills/gateway-smoke/scripts/smoke.mjs   # 20/20, ~15 s
node .claude/skills/release-bump/scripts/bump.mjs --check
```

Alle vier Skills sind mit dem `quick_validate.py` aus dem skill-creator-Plugin geprüft.