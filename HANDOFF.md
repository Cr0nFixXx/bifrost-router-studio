# HANDOFF.md — Stand für die nächste Session

> Geschrieben als Übergabe, weil der Kontext der Erstellungs-Session voll war.
> Diese Datei ist der vollständige Stand — nicht die Chat-Historie lesen, das hier lesen.

**Projekt:** Bifrost Router Studio · **Version** 0.2.9 · **Build** 26100604
**Stand:** vier Skills geschrieben und evaluiert, zwei echte Bugs in `bifrostApi.ts` gefunden und gefixt, Iteration 2 ausstehend.

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

## Was offen ist: Iteration 2

Zwei Befunde aus Eval-Lauf 1, die einen zweiten Durchlauf brauchen.

### Aufgabe A — `doc-audit`-Testfragen austauschen

`.claude/skills/doc-audit/evals/evals.json`, Eval 1 hat eine **falsche Prämisse**:

> „Die README sagt, es gibt Telemetrie auf den Targets. Stimmt das noch?"

Die README erwähnt Telemetrie nirgends (seit v0.2.8 entfernt). Mit-Skill und Baseline gaben
identische Antworten — der Test diskriminiert nicht.

**Zwei Optionen:** eine Prämisse wählen, die tatsächlich falsch ist, oder eine Frage, die einen
*echten* Restbestand prüft. Kandidaten für echten Restbestand:

- `src/lib/telemetry.ts` ist gelöscht, `PROGRESS.md` führt die Funktion unter der v1.3.0-Überschrift
  weiter als `[x]` (mit Entfernungs-Vermerk, also nicht falsch — aber eine gute Übung im Umgang)
- Die Build-Nummer stand bis eben in `CLAUDE.md` — ein Beispiel für die Regel „Zahlen gehören in
  Code-Dateien, nicht in Doku"

**Wichtig:** Keine neue Datei erfinden, die es nicht gibt. Ein Audit-Test braucht einen echten
Befund, sonst misst er nichts.

### Aufgabe B — `doc-set`-Rollenmatrix schärfen

Die Frage „wo gehört hin, dass der Sync keine Konflikterkennung hat" wurde unterschiedlich
beantwortet:

| | Antwort |
| --- | --- |
| mit Skill | `CLAUDE.md` → *Fallstricke* |
| ohne Skill | `ARCHITECTURE.md` → *Sync-Semantik* |

Beide sind vertretbar, weil der Fall gleichzeitig Gotcha **und** bekannte Grenze ist.
`.claude/skills/doc-set/references/file-roles.md` trennt die beiden nicht.

**Erwartete Lösung:** eine Entscheidungsregel, die sagt, wann etwas Gotcha ist und wann bekannte
Grenze. Vorschlag zur Diskussion:

> Ein **Gotcha** beschreibt eine Falle mit einer konkreten Fehlerursache — „du tust X, und dann
> passiert Y unerwartet". Eine **bekannte Grenze** beschreibt, was das Produkt nicht kann, ohne
> dass jemand dadurch überrascht wird. Konflikterkennung fehlt: Niemand tut etwas Falsches, es gibt
> nur keine Prüfung → **bekannte Grenze** (`TODO.md`), nicht Gotcha.

Diese Regel gehört nach `file-roles.md` und als Testfall in `doc-set/evals/evals.json`.

---

## Wie der zweite Durchlauf läuft

Die Prozedur aus der Skill-Creator-Doku, konkret für dieses Repo:

1. Skills nach Aufgabe A und B überarbeiten
2. Kopien anlegen — die Evals haben Seiteneffekte, parallele Läufe im selben Repo kollidieren:
   ```bash
   rm -rf /tmp/evals && mkdir -p /tmp/evals
   for cfg in with baseline; do for s in doc-set doc-audit; do
     d=/tmp/evals/$s-$cfg; mkdir -p $d
     git ls-files -z | tar --null -T - -cf - | tar -xf - -C $d
     cp -r .claude $d/.claude
     ln -s "$PWD/node_modules" $d/node_modules
   done; done
   ```
3. Agenten starten — **mit `model: sonnet`**. Ohne Override schlägt der Default
   `k-obs/subagent-flash` fehl mit `Model is unavailable`.
4. Baseline bekommt **keinen** Skill-Pfad, sonst ist der Vergleich wertlos.
5. Ergebnisse nach `<skill>-workspace/iteration-2/eval-N/{with_skill,without_skill}/outputs/`
6. Vergleich: hat sich die Antwort gegenüber `iteration-1` verbessert?

Aus Iteration 1 liegen 15 Ergebnisdateien in den vier `*-workspace/`-Ordnern (gitignored).

---

## Fallen, die in dieser Session Zeit gekostet haben

**Subagent-Modell.** `model: sonnet` muss explizit gesetzt werden, sonst `Model is unavailable`.

**Ports.** `gateway-smoke/scripts/smoke.mjs` belegt 8080 und 8787. Für parallele Läufe:
`--port 19080 --bridge-port 19787`. Die Bridge selbst: `BFRS_BRIDGE_PORT`.

**Seiteneffekte der Evals.** `release-bump` schreibt in `package.json`, `gateway-smoke` startet
Server, `doc-set` legt Dateien an. Ohne Kopien kollidieren parallele Läufe.

**`bump.mjs` verändert `package.json`.** Vor dem nächsten `--check` prüfen, ob eine laufende Bridge
noch auf der alten Build-Nummer hängt — nicht nötig, aber gut zu wissen.

---

## Schnellprüfung

```bash
npm test                                   # 95 Tests, 14 Files
npm run build                              # tsc --noEmit + vite build
node .claude/skills/gateway-smoke/scripts/smoke.mjs   # 20/20, ~15 s
node .claude/skills/release-bump/scripts/bump.mjs --check
```

Alle vier Skills sind mit dem `quick_validate.py` aus dem skill-creator-Plugin geprüft.

## Nicht erledigt

- Iteration 2 der Skill-Evaluierung (Aufgaben A und B oben)
- API-Modus-Grenzen: keine Konflikterkennung, kein Offline-Queue, `ttft_timeout_ms`/`scope`/`priority`
  nicht im Canvas editierbar — steht in [`TODO.md`](./TODO.md)
- `CLAUDE.md` verweist noch nicht auf die vier Skills — sinnvoll, aber erst wenn sie stabil sind
- Plugins: 20 Stück sind aktiviert und wurden nie benutzt (~5.700 est. Tokens pro Session). Der
  Nutzer hat die Deaktivierung abgelehnt — nicht wieder vorschlagen, ohne gefragt zu werden