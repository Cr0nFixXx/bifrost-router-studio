---
name: release-bump
description: "Setzt die Build-Nummer an beiden Stellen, an denen dieses Projekt sie führt, und zieht die Dokumentation nach. Nutze diesen Skill bei jeder Code-Änderung, weil der Versionsvertrag verlangt, dass der Build bei JEDER Änderung steigt, und immer wenn jemand 'neue Version', 'build number', 'bump', 'prepare release' oder 'prepare release' sagt. Auch einsetzen, wenn jemand die App-Version auf ein neues Release heben will."
---

# Release-Bump

## Worum es geht

Der Versionsvertrag dieses Projekts verlangt zwei Dinge, und beide werden bei einem Bump gern
vergessen:

1. **Die Build-Nummer steigt bei jeder Code-Änderung.** Sie steht an **zwei** Stellen.
2. **Die App-Version ändert sich nur auf ausdrückliche Anweisung.**

Der Fehler, den diese Skill verhindert, ist kein Wissenproblem: Die Build-Nummer stand zweimal an
nur einer Stelle gesetzt, und es gab keinen Fehler — nur ein Projekt, das eine alte Build meldete.

## Schritt 1 — Die Projektregel lesen, nicht annehmen

```bash
grep -A5 -i "versioning contract" CLAUDE.md
```

Dort steht, **welches** Format gilt und **ob** die App-Version angefasst werden darf. Die Regel
gehört ins Projekt, nicht in diesen Skill — sonst altert der Skill gegen die Projektregel, ohne
dass jemand etwas bemerkt.

Ist in `CLAUDE.md` ein Verweis auf diese Skill vorhanden, folge ihm. Fehlt er, trage ihn bei
Gelegenheit nach — aber erst, wenn der Release fertig ist.

## Schritt 2 — Bump ausführen

```bash
node .claude/skills/release-bump/scripts/bump.mjs
```

Das Skript macht alles Wesentliche in einem Schritt:

- ermittelt `YYMMDDHH` in Europe/Berlin
- setzt `APP_BUILD` in `src/lib/version.ts` **und** das Top-Level-`"build"` in `package.json`
- **liest beide Dateien neu von der Platte und vergleicht sie**, bricht bei Abweichung mit
  Exit-Code 1 ab
- lässt `APP_VERSION` unangetastet

Nur der Ist-Stand prüfen, ohne zu schreiben:

```bash
node .claude/skills/release-bump/scripts/bump.mjs --check
```

Die App-Version mit anheben, **nur** wenn ausdrücklich darum gebeten wurde:

```bash
node .claude/skills/release-bump/scripts/bump.mjs --version 0.3.0
```

Das Skript aufzurufen ist billiger, als die Regel selbst zu befolgen — es verhindert den
Ableitungsfehler, und der ist in diesem Projekt zweimal passiert.

## Schritt 3 — Dokumentation nachziehen

Das Skript schreibt keine Doku, weil nicht jeder Build eine neue Version ist. Die Zuordnung
steht in `references/checklist.md`; die Kurzform:

| Was passiert | Wohin |
| --- | --- |
| Feature oder Bugfix, der in der Version rausgeht | `CHANGELOG.md` |
| Code-Änderung mit Begründung und Validierung | `PROGRESS.md` |
| Neue Konvention oder neuer Fallstrick | `CLAUDE.md` |
| Punkt wird abgeschlossen oder kommt neu auf | `TODO.md` |
| Großes Vorhaben nimmt Form an | `MILESTONES.md` |

Der wichtigste Unterschied: `CHANGELOG.md` ist die Kurzfassung für Nutzer, `PROGRESS.md` das
Protokoll mit der Begründung. Wenn etwas nur in eine davon passt, ist die Frage nicht „in beide",
sondern: **Braucht jemand im Review wissen, *warum*?**

Nur der Build-Bump ohne Code-Änderung braucht **keinen** CHANGELOG-Eintrag.

## Schritt 4 — Prüfen

```bash
npm test && npm run build
git diff --stat
```

`git diff` muss genau die beiden erwarteten Stellen zeigen. Wenn dort mehr steht als die
Änderungen, die du gemacht hast, ist etwas schiefgelaufen.

## Was nicht in diesen Schritt gehört

- **`npm publish`, `git tag`, `git push`** — nicht Teil eines Bumps. Der Versionsvertrag sagt
  nichts über Releases aus, und das Entscheiden darüber gehört dem Menschen.
- **Den Build im Commit-Befehl wiederholen.** Das Skript hat ihn bereits geschrieben; steht er
  auch in der Commit-Nachricht, entstehen zwei Quellen für dieselbe Zahl.
- **Die App-Version „sicherheitshalber" mitheben.** Sie gilt nur auf ausdrückliche Anweisung.

## Zugehörige Skills

- **`doc-set`** — wenn die Dokumentations-Schritte unklar sind: welches File wofür zuständig ist.
- **`doc-audit`** — wenn der Bump zeigt, dass `package.json` und `src/lib/version.ts`
  auseinandergelaufen sind, oder wenn der Build-Nummern-Eintrag in `CLAUDE.md` alt ist.