# Verifikations-Kommandos

Nachschlagewerk für Schritt 2 des `doc-audit`. Nach Fehlerklasse sortiert, nicht nach
Dokumenttyp — in der Praxis weiß man zuerst, *was* man prüft, und nicht, in welcher Datei es
behauptet war.

**Grundregel:** Was du nicht auflösen kannst, markierst du als **UNBESTÄTIGT**. Raten erzeugt
Behauptungen, die in der nächsten Session wieder geglaubt werden.

## Inhalt

1. [Existiert das überhaupt?](#existiert-das-überhaupt)
2. [Wird es benutzt?](#wird-es-benutzt)
3. [Stimmen die Zahlen?](#stimmen-die-zahlen)
4. [Ist die Aussage noch wahr?](#ist-die-aussage-noch-wahr)
5. [Version und Build](#version-und-build)
6. [Doku-Links und Querverweise](#doku-links-und-querverweise)
7. [Strukturelle Dopplungen](#strukturelle-dopplungen)
8. [Konkrete Baustellen dieses Projekts](#konkrete-baustellen-dieses-projekts)

---

## Existiert das überhaupt?

```bash
ls src/lib/
grep -rn "export function <name>" src/
grep -rn "import.*from '@/lib/<datei>'" src/
```

Null Treffer bei einem Feature, das die Doku als aktiv führt = veraltete Dokumentation. Das ist
der häufigste Befund und der billigste.

## Wird es benutzt?

Eine Datei ohne Importer ist tot. Sie zu löschen ist fast immer richtig — aber prüf vorher, ob
sie im Build oder in einer Doku referenziert wird:

```bash
grep -rn "from '@/lib/<datei>'" src/ | grep -v "^src/lib/<datei>"
grep -rn "<datei>" .claude/ *.md vite.config.ts 2>/dev/null
```

Beispiel aus diesem Projekt: `src/lib/telemetry.ts` hatte null Importe, nachdem die zugehörige UI
in v0.2.8 entfernt worden war — die Doku führte die Funktion aber weiter als `[x]`.

## Stimmen die Zahlen?

```bash
# Testanzahl
for f in src/lib/*.test.ts; do echo "$(basename $f .test.ts): $(grep -c '^\s*it(\|^\s*test(' $f)"; done
npm test 2>&1 | grep -E 'Test Files|Tests '

# Dateigröße einer Doku-Datei
wc -c < CLAUDE.md

# Codezeilen in einem Modul
wc -l < src/store/useStore.ts
```

Der Unterschied zwischen „Doku sagt 36 Tests" und `npm test` sagt „95 Tests" war in diesem Projekt
der direkte Auslöser für den ersten Doku-Audit.

## Ist die Aussage noch wahr?

Wenn eine Doku behauptet, etwas existiere, aber nicht **wo**:

```bash
grep -rn "<stichwort>" src/          # Feature-Existenz
grep -rn "<stichwort>" src/ --include=*.ts --include=*.tsx | wc -l
grep -rn "nodeTypes" src/components/canvas/FlowCanvas.tsx   # Node registriert?
```

Für Behauptungen über Verhalten, die man nicht per grep bestätigen kann (Simulation, Diff-Viewer,
Verhalten nach einem Klick): **nicht behaupten**. Als UNBESTÄTIGT markieren und in der
Verifikation-Runde nachfragen.

## Version und Build

Die Build-Nummer steht an **zwei** Stellen. Das Prüfen beider ist der wichtigste Einzelschritt,
weil ein Auseinanderlaufen hier nicht auffällt, sondern erst Wochen später:

```bash
grep -n "APP_VERSION\|APP_BUILD" src/lib/version.ts
jq -r '.version, .build' package.json
```

Weicht eins ab: `release-bump`.

## Doku-Links und Querverweise

```bash
for f in *.md; do
  grep -oP '\]\(\./\K[A-Za-z_]+\.md' "$f" | sort -u | while read -r t; do
    [ -f "$t" ] || echo "BROKEN in $f -> $t"
  done
done
```

Auf Anker prüfen, wenn eine Datei umbenannt oder verschoben wurde:

```bash
grep -rn '\.md#' *.md | while IFS=: read -r f l a; do
  t=$(echo "$a" | grep -oP '\./\K[A-Za-z_]+\.md#\K[^)]+')
  [ -z "$t" ] && continue
  grep -qi "^#\+ .*" "$(echo "$a" | grep -oP '\./\K[A-Za-z_]+\.md')" && \
    grep -qiP "^#+ $(echo "$t" | tr '-' ' ' | sed 's/\b\(.\)/\u\1/g')" "$(echo "$a" | grep -oP '\./\K[A-Za-z_]+\.md')" || echo "ANCHOR? $f:$l"
done
```

Grober, aber schnell: `grep -oP '\./\K[A-Za-z_]+\.md#\K[^)]+' *.md | sort -u` und dann von Hand
gegen die tatsächlichen Überschriften prüfen.

## Strukturelle Dopplungen

```bash
# Identische Überschriften innerhalb einer Datei
grep -h '^## ' TODO.md | sort | uniq -d

# Identische Überschriften über Dateien
grep -h '^## ' *.md | sort | uniq -d

# Wie oft kommt dieselbe Versionsnummer im File vor?
grep -c -E '[0-9]{10}' CLAUDE.md

# Innere Wiederholung: denselben Textabschnitt in einer Datei
awk '/^## /{h=$0} {print h"\t"$0}' CLAUDE.md | sort | uniq -c | sort -rn | head
```

Der letzte Befund fand in `CLAUDE.md` drei Regeln, die **zweimal** im selben File standen —
Node-Registrierung, annotation-Serialisierung, Build-Nummer.

Zusätzlich prüfen, ob eine Überschrift zum Inhalt passt:

```bash
# Wie viele Punkte unter "Future improvements" sind erledigt?
awk '/^## Future improvements/{f=1;next} /^## /{f=0} f&&/^- \[[ x]\]/{print}' TODO.md
```

`[x]` unter einer „Future"-Überschrift ist ein Widerspruch, kein Detail.

## Konkrete Baustellen dieses Projekts

Nur als **Anlass zum Prüfen** — nicht als Wissen. Alles davon kann inzwischen anders sein.

| Baustelle | Prüfkommando |
|---|---|
| Telemetry noch dokumentiert, aber entfernt | `grep -rn telemetry src/` (soll 0 sein) |
| `complexity`-/`model`-Node als aktiv geführt | `grep -n "complexity" src/components/canvas/FlowCanvas.tsx` |
| Testzahl in einer Doku | `npm test 2>&1 \| grep Tests` |
| Build-Nummer auseinander | siehe *Version und Build* |
| Versionsschema v1.x vs v0.x | `grep -h '^## v' PROGRESS.md \| sort -u` |
| Light-Mode-Widerspruch | `grep -in 'light mode' DESIGN.md CLAUDE.md` |
| API-Modus vergessen | `grep -n connectionSource src/store/useStore.ts` |