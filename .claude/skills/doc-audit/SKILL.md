---
name: doc-audit
description: "Findet Drift zwischen Dokumentation und Code in diesem Projekt. Nutze diesen Skill, sobald jemand fragt ob die Docs noch stimmen, ob eine Behauptung noch wahr ist, ob Dateien zu lang oder doppelt sind, oder wenn vor einer Freigabe Doku auf einen alten Stand gebracht werden soll. Auch bei 'räume CLAUDE.md auf', 'prüf die Doku', 'die README stimmt nicht mehr', oder wenn jemand eine tote Datei, eine veraltete Feature-Liste oder widersprüchliche Versionen vermutet."
---

# Doku-Audit: Drift zwischen Code und Dokumentation finden

## Worum es geht

Doku driftet vom Code, weil beide sich unabhängig ändern. Der übliche Fehler bei einem Audit ist,
dass die Datei **geglaubt** statt **geprüft** wird: Man liest, was `TODO.md` behauptet, und
berichtet es als Fakt. In diesem Projekt hat das eine Telemetry-UI als aktives Feature
weitergetragen, die seit drei Versionen entfernt war.

Diese Reihenfolge ist deshalb nicht optional:

> **Erst messen, dann verifizieren, dann fragen, dann anwenden.**

Ein Audit, das mit dem Interview beginnt, produziert eine Liste von Entscheidungen über Dinge,
deren Status niemand geprüft hat.

## Schritt 1 — Messen

Bevor du irgendetwas beurteilst, brauchst du Zahlen. Ohne sie ist ein Vorschlag nur eine Meinung.

```bash
# Umfang und Abschnittsgrößen
for f in *.md; do echo "$(wc -l < $f) $f"; done | sort -rn
awk '/^## /{if(h)print n"  "h; h=$0; n=0; next}{n++}END{print n"  "h}' CLAUDE.md

# Doppelte Überschriften
grep -h '^## ' *.md | sort | uniq -d

# Wie oft taucht dieselbe Versionsnummer auf?
grep -n -E '0\.[0-9]+\.[0-9]+|[0-9]{10}' *.md | grep -i version
```

Zwei Dinge, die dabei sofort auffallen und einen Großteil der Arbeit ersetzen: doppelte
Überschriften derselben Datei, und dieselbe Zahl an mehreren Stellen im selben File.

## Schritt 2 — Verifizieren

**Jede Behauptung wird gegen den Code geprüft, bevor sie in den Bericht geht.** Die Kommandos für
die Fälle, die in diesem Projekt immer wieder vorkommen, stehen in
`references/verify-commands.md` — dort nachschauen statt sie neu zu erfinden.

Die drei teuersten Fehlerquellen, jeweils mit dem Kommando, das sie aufdeckt:

| Fehlerquelle | Kommando |
| --- | --- |
| Ein Feature existiert nicht mehr | `grep -rn "<behauptung>" src/` — null Treffer heißt: Dokumentation veraltet |
| Eine Datei wird nicht benutzt | `grep -rn "from '@/lib/x'" src/ \| grep -v "^src/lib/x"` — null Importe heißt: tote Datei |
| Eine Zahl stimmt nicht | `for f in src/lib/*.test.ts; do grep -c "^\s*it(" $f; done` |

**Was du nicht auflösen kannst, markierst du als UNBESTÄTIGT.** Nicht raten, nicht aus dem
Gedächtnis ergänzen. Eine ehrliche Lücke ist brauchbar, eine erfundene Tatsache nicht — sie
wandert in die nächste Session und wird dort wieder geglaubt.

## Schritt 3 — Berichten

Zuerst ein kurzer Befund in zwei, drei Sätzen: was du gefunden hast, was es kostet, ob es
rückgängig zu machen ist. Alles, was die Entscheidung nicht ändert, gehört in die Tabelle, nicht
in die Einleitung.

Dann eine Tabelle. **Nur Verifiziertes** hinein, UNBESTÄTIGtes mit diesem Marker:

```
| Datei:Zeile | Behauptung | Realität | Quelle der Wahrheit |
```

Die letzte Spalte ist nicht optional. Sie beantwortet die entscheidende Frage: **wo gehört das
hin?** Ein Befund ohne Zielort ist nur eine Beschwerde.

Danach die offenen Designfragen getrennt von den Fakten — die muss der Nutzer entscheiden, und
er entscheidet sie anders, wenn er sie als Frage sieht.

## Schritt 4 — Fragen

Höchstens zwei `AskUserQuestion`-Runden. Das ist eine Obergrenze, kein Ziel; wenn eine Runde
reicht, ist die zweite verschwendete Aufmerksamkeit.

Vier Regeln für die Fragen:

1. **Die empfohlene Option steht zuerst** und trägt „(Empfohlen)" im Label.
   `AskUserQuestion` hat keine Vorauswahl, also entscheidet die Reihenfolge, was als Default gelesen wird.
2. **Keine Frage, deren Antwort du selbst nachschlagen kannst.** Wenn eine Zahl oder ein Pfad
   die Frage entscheidet, ist das eine Verifikationsaufgabe aus Schritt 2, keine Frage.
3. **Höchstens vier Optionen pro Frage.** Bei mehr Gruppen: eine Sammelfrage mit Sammeloptionen.
4. **Materialfragen stellen, keine Geschmacksfragen.** „Soll ich das rauswerfen?" ist Geschmack.
   „Die Datei widerspricht sich selbst an zwei Stellen — welche Seite stimmt?" ist eine Frage mit
   einer Antwort.

Ein Gegenentwurf zu deiner Empfehlung gehört in die Frage, nicht in eine Nachricht davor. Wer
eine Option ablehnt, will die Begründung sehen, ohne dass er nachfragen muss.

## Schritt 5 — Anwenden

Erst wenn jede Gruppe bestätigt ist. Vorher wird keine Datei angefasst.

- **Eine Datei nach der anderen**, nicht alle auf einmal. Nach jeder Datei `npm test` laufen
  lassen — Doku-Änderungen dürfen nichts brechen, und wenn doch, willst du es sofort sehen.
- **Geänderte Dateien am Ende auflisten**, damit die Person sie in `git diff` findet.
- **Nicht committen.** Das bleibt beim Menschen, auch wenn er es die ganze Session nicht gesagt hat.
- **Was entfernt wurde, im Bericht festhalten.** Damit lässt sich ein späteres Undo aus dem
  Protokoll rekonstruieren, ohne das Git-Verlauf zu bemühen.

## Was in diesem Projekt typischerweise falsch ist

Diese Stellen sind erfahrungsgemäß die Baustellen — sie sind aber ein **Anlass zum Prüfen**, kein
Vorwissen. Verifiziere sie trotzdem:

- **`CLAUDE.md`** — grew historisch, hatte dreifache Versionsblöcke und eine Bridge-Beschreibung an
  drei Stellen. Trägt jetzt die Fallstricke; alles andere gehört raus.
- **`TODO.md`** — war einmal Chronik. Die Rolle ist jetzt: offene Punkte mit Priorität, keine
  Erledigt-Listen.
- **`PROGRESS.md`** — die Versionsschemata sind gemischt (Pre-Alpha `v1.x` und aktuell `v0.x`), das
  ist kein Fehler, sieht aber wie einer aus.
- **Feature-Listen** — dort steht regelmäßig etwas, das es im Code nicht mehr gibt.
- **`DESIGN.md`** — widersprach sich zwischen Überschrift und Fließtext.

## Zugehörige Skills

- **`doc-set`** — beantwortet „wo gehört das hin", wenn der Audit eine neue Stelle vorschlägt. Der
  Audit sagt *dass* etwas falsch ist; `doc-set` sagt wohin die Wahrheit gehört.
- **`release-bump`** — wenn der Audit zeigt, dass `package.json` und `src/lib/version.ts`
  auseinandergelaufen sind.