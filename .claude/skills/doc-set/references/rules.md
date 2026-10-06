# Regeln für die Doku-Pflege

Jede Regel hier ist aus einem konkreten Fehler entstanden. Die rechte Spalte nennt ihn — wenn du
eine Regel nicht verstehst, lies dort nach, **was schiefging**.

## Inhalt

1. [Die Regeln](#die-regeln)
2. [Was nicht in die Doku gehört](#was-nicht-in-die-doku-gehört)

---

## Die Regeln

### 1. Eine Information, eine Datei

Wenn zwei Dateien dasselbe sagen, stimmt irgendwann nur noch eine davon. Verlinken statt kopieren:
`Details in [ARCHITECTURE.md](./ARCHITECTURE.md).`

*Woher:* `TODO.md` behauptete „36 tests passing", `PROGRESS.md` „95" — dieselbe Aussage, zwei
Werte, keiner wusste es.

### 2. Verlinken statt vervielfältigen

Wenn Inhalt A in B und C gebraucht wird, gehört er nach A, und B und C verlinken auf den Anker.

*Woher:* Die sechs API-Constraints standen in `CLAUDE.md`, `CHANGELOG.md` und — nach dem
Auslagern — in `ARCHITECTURE.md`. Beim Push ins Gateway hätte eine veraltete Kopie still
Regeln zerstört.

### 3. Jede Behauptung gegen den Code prüfen, bevor du sie als Fakt meldest

Nicht: „Die Datei sagt X". Sondern: „Der Code zeigt Y".

*Woher:* `TODO.md` führte die Telemetry-UI als `[x]`. Sie war in v0.2.8 entfernt worden,
`src/lib/telemetry.ts` stand ohne Importer im Repo.

### 4. Nichts erfinden, was du nicht belegen kannst

Wenn du eine Behauptung nicht auflösen kannst, markierst du sie als **UNBESTÄTIGT** und fragst
nach — statt zu raten.

*Woher:* `PROGRESS.md` behauptete in Zeile 36 „XML import not implemented". Sieben Zeilen später
stand im selben File, dass der Import längst existiert. Die alte Behauptung war nie
durchgestrichen worden.

### 5. Überschriften müssen zum Inhalt passen

Eine Überschrift ist eine Behauptung über den Inhalt. Wenn sie falsch ist, ist sie schlimmer als
keine Überschrift.

*Woher:* `## Future improvements` enthielt vier von fünf erledigten Punkten.
`## Proposed extensions (not started)` enthielt zwei von vier erledigten.

### 6. Versionierungsschemata nicht vermischen

In diesem Projekt: **`v1.x` ist die Pre-Alpha-Linie, `v0.x` die aktuelle.** Sie sind zwei
getrennte Linien, ihre Nummern sind nicht vergleichbar. Ab dem ersten öffentlichen Build kamen
`YYMMDDHH`-Buildnummern (Europe/Berlin) hinzu; die sind autoritativ.

*Woher:* Der Übergang `v1.4.9` → `v0.2.1` sah wie ein Versehen aus. Er war es nicht, aber ohne
Notiz wäre das nächste Mal wieder passiert.

### 7. Geprüfte Links in Doku-Files

Nach jedem Anlegen oder Umbau alle Verweise auflösen. Der Prüf-Block steht im `SKILL.md`.

*Woher:* Nach dem Auslagern zeigten erst die neu angelegten Files, dass alle `./ARCHITECTURE.md`-Verweise
auflösbar waren — vorher gab es diese Dateien nicht.

### 8. Keine Chronik in einer Datei, die etwas anderes bedeutet

`TODO.md` ist eine Arbeitsliste. `PROGRESS.md` ist ein Protokoll. `CHANGELOG.md` ist ein
Release-Index. Eine Datei, die zwei Rollen hat, tut keine davon gut.

*Woher:* `TODO.md` trug 20 `## v0.2.x completed`-Abschnitte, die `CHANGELOG.md` und
`PROGRESS.md` wörtlich wiederholten — dieselbe Information zum dritten Mal, an drei Stellen, alle
drei irgendwann veraltet.

### 9. Aktuellen Stand nicht hart codieren

Zahlen, die der Code auch kennt (Testanzahl, Zeilenzahl, aktuelle Version), stehen in Code, der
sich selbst aktualisiert. Schreibe stattdessen, **wie man sie ermittelt**.

*Woher:* Die Build-Nummer steht an zwei Stellen (`src/lib/version.ts` und `package.json`) — und
wurde zweimal nur an einer davon gesetzt, bis der Dokuaudit es aufgedeckt hat. Das ist ein Fall
für `release-bump`, aber die Lehre gilt: Zahlen, die an zwei Orten stehen, gehören nicht in Doku.

## Was nicht in die Doku gehört

- **Ableitbares.** Verzeichnisstruktur, Abhängigkeiten, `npm run`-Skripte, API-Signaturen — das
  steht im Code und ist mit zwei Kommandos aktueller als jeder Absatz.
- **Nummern, die woanders gepflegt werden.** Siehe Regel 9.
- **Funktionskataloge in `CLAUDE.md`.** Eine Liste „das Modul kann A, B und C" altert, sobald
  jemand C hinzufügt und es nicht nachzieht. Der Hinweis auf den Pfad reicht.
- **Erledigtes in `TODO.md`.** Es gehört nach `PROGRESS.md`, und von dort ins `CHANGELOG.md`.