---
name: doc-set
description: "Regeln und Rollenverteilung für die Projekt-Dokumentation: welcher der neun Doku-Files eine Information gehört, wie neue Doku-Dateien angelegt werden und wie bestehende gepflegt bleiben. Nutze diesen Skill, sobald du etwas dokumentieren sollst und nicht weißt wohin — neue Konfigurationsoption, neues Feature, neue Doku-Datei, oder eine Frage wie 'wo schreib ich das hin'. Auch einsetzen, wenn jemand eine Doku-Datei vorschlägt, die es noch nicht gibt, oder wenn Doppelpassagen auftauchen."
---

# Doku-Set: wie dieses Projekt dokumentiert wird

## Worum es geht

Doku driftet vom Code, weil beide sich unabhängig ändern können. Die Gegenmaßnahme ist eine
Rollenverteilung: **jede Information gehört in genau eine Datei, alles andere verlinkt darauf.**

Der Skill beantwortet zwei Fragen:

1. **Wohin gehört das, was ich schreiben will?** → `references/file-roles.md`
2. **Wie schreibe und pflege ich es richtig?** → `references/rules.md`

Lies `references/file-roles.md`, bevor du eine Datei anlegst oder ein neues Dokument beginnst.
Lies `references/rules.md`, wenn du merkst, dass sich etwas wiederholt, oder wenn du eine
bestehende Datei umbaust.

## Der Ablauf in fünf Schritten

### 1. Bestimmen, was für eine Art Information es ist

Das entscheidet die Zieldatei. Frag dich, **was jemand damit anfangen will**:

| Die Person will… | Dann ist es ein… | Datei |
| --- | --- | --- |
| verstehen, was die App kann | Feature | `README.md` |
| beim Ändern des Codes keine Regeln brechen | Konvention / Gotcha | `CLAUDE.md` |
| nachsehen, wo welcher Code wohnt | Architektur | `ARCHITECTURE.md` |
| die Oberfläche verstehen | Design-Regel | `DESIGN.md` |
| wissen, ob eine Änderung fertig ist | Test / Abnahme | `TESTING.md` |
| wissen, wohin das Projekt will | Vorhaben | `MILESTONES.md` |
| wissen, was als Nächstes zu tun ist | Arbeitspunkt | `TODO.md` |
| nachvollziehen, warum etwas so ist | Entscheidung | `PROGRESS.md` |
| wissen, was in einer Version war | Release-Fakt | `CHANGELOG.md` |

Wenn du nicht entscheiden kannst, ist die Information wahrscheinlich noch nicht ausreichend
gedacht. Ein Halbsatz, der in keine Rolle passt, ist ein Zeichen dafür, dass die Entscheidung
fehlt — nicht dafür, dass eine neue Datei gebraucht wird.

### 2. Prüfen, ob es die Information schon gibt

Bevor du etwas schreibst, such nach ihr. Fast immer existiert sie schon irgendwo — in einem
Abschnitt, der veraltet ist, oder verstreut über zwei Dateien.

```bash
grep -rn "<Stichwort>" *.md
```

Findest du eine bestehende Stelle, ist die Frage nicht „schreibe ich neu", sondern **„ist diese
Stelle richtig?"** Bei `doc-audit` ist das ein eigener Vorgang.

### 3. Schreiben

- **Konkret sein.** `Database + API mode + Bridge (49 Zeilen) wandern raus`, nicht
  „Teile der Doku wurden ausgelagert".
- **Verlinken statt kopieren.** `Details in [ARCHITECTURE.md](./ARCHITECTURE.md).` Ein
  Markdown-Link mit Anker: `[Fallstricke](./CLAUDE.md#fallstricke-gotchas)`.
- **Keine Zahlen, die der Code schon hat.** Testzahlen, Versionsnummern und Zeilenzahlen stehen
  an anderer Stelle und veralten dort schneller als hier. Schreibe stattdessen *wie man sie
  ermittelt*: „Aktueller Stand: `npm test`".
- **Keine Chronik in einer Datei, die etwas anderes bedeutet.** `TODO.md` ist eine Arbeitsliste.
  Wenn du dort einen Abschnitt `## v0.2.7 completed` anlegst, hast du die Datei kaputt gemacht.
- **Überschriften müssen zum Inhalt passen.** Eine Überschrift „Future improvements" mit vier von
  fünf erledigten Punkten ist keine Roadmap, sie ist eine Lüge in Großbuchstaben.

### 4. Verlinkung prüfen

Nach jedem Anlegen oder Umbau:

```bash
for f in *.md; do
  grep -oP '\]\(\./\K[A-Za-z_]+\.md' "$f" | sort -u | while read -r t; do
    [ -f "$t" ] || echo "BROKEN in $f -> $t"
  done
done
```

Eine leere Ausgabe ist das Ziel. Neue Verweise auf Dateien, die du nicht anlegst, sind ein Fehler.

### 5. Prüfen, ob die Aussage stimmt

Nichts davon ersetzt `doc-audit`, aber es verhindert, dass die nächste falsche Behauptung entsteht:
Bevor du „die UI hat X" schreibst, prüf es. Ein `grep` kostet zwei Sekunden, ein falscher
Absatz kostet den nächsten Leser eine halbe Stunde.

## Neue Doku-Datei anlegen

Tu das nur, wenn **keine** bestehende Datei die Rolle hat. Bevor du sie anlegst, prüfe
`references/file-roles.md` — dort steht auch, warum `HANDOFF.md` und `PLAN.md` absichtlich nicht
existieren.

Wenn du sie anlegst, gehört in jede bestehende Doku ein Verweis auf sie, sonst findet sie niemand.
Und sie bekommt eine Kopfzeile, die sagt, wofür sie zuständig ist und wofür nicht — das „Nicht"
ist der Teil, der spätere Dopplungen verhindert.

## Beziehung zu den anderen Skills

- **`doc-audit`** findet Drift zwischen Code und Doku. Dieser Skill sagt, wie man Doku schreibt,
  damit die Drift gar nicht erst entsteht. Wenn du bemerkst, dass Doku nicht mehr stimmt:
  `doc-audit`. Wenn du wissen willst, wohin etwas gehört: dieser Skill.
- **`release-bump`** zieht dieses Regelwerk beim Versionswechsel durch — welche Dateien bei einem
  Release angefasst werden müssen.

## In diesem Projekt verortet

Die Rollenmatrix in `references/file-roles.md` beschreibt **dieses** Repo. Wenn sie nicht mehr zum
tatsächlichen Dateibestand passt (neue Datei, entfernte Datei), ist die Matrix veraltet und muss
angepasst werden — sie ist Doku über Doku, also besonders driftanfällig.