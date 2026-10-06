# Checkliste: Dokumentation nach einem Bump

Die Zuordnung, *welche* Datei was bekommt. Jede Regel hier steht in `doc-set`, aber die
Zuordnung in dieser Form hat beim Aufräumen des Doku-Sets mehrmals gebraucht.

## Inhalt

1. [Nach jedem Code-Commit](#nach-jedem-code-commit)
2. [Wenn eine Version rausgeht](#wenn-eine-version-rausgeht)
3. [Wenn eine Konvention oder ein Gotcha dazukommt](#wenn-eine-konvention-oder-ein-gotcha-dazukommt)
4. [Was nicht reingehört](#was-nicht-reingehört)

---

## Nach jedem Code-Commit

- [ ] Build-Nummer gesetzt: `node .claude/skills/release-bump/scripts/bump.mjs`
- [ ] Beide Stellen stimmen überein — macht das Skript selbst, aber `git diff` zeigt es
- [ ] `npm test && npm run build` grün

Nichts weiter. Ein reiner Build-Bump mit Code-Änderung braucht **keinen** CHANGELOG-Eintrag —
der Build-Zähler ist das Versionsdatum.

## Wenn eine Version rausgeht

- [ ] App-Version angehoben: `bump.mjs --version X.Y.Z`
- [ ] `CHANGELOG.md` — ein Eintrag, neueste Version oben. Nur **Features und Bugfixes**, kein
      Begründungsprosa. Ein Bug, den niemand gemerkt hat, braucht auch keinen Eintrag.
- [ ] `PROGRESS.md` — ein ausführlicher Eintrag: was geändert wurde, warum, und **wie es
      validiert wurde**. Das ist der Unterschied zum CHANGELOG.
- [ ] `TODO.md` — Punkte abhaken, die mit dieser Version erledigt sind. Neu Aufgenommenes mit
      Priorität.
- [ ] `CLAUDE.md` — nur wenn sich eine Konvention oder ein Gotcha geändert hat. Eine neue
      Build-Nummer gehört **nicht** dorthin, die steht in den beiden Code-Dateien.

### Reihenfolge

`CHANGELOG` und `PROGRESS` **neueste Version oben**. `PROGRESS` ist chronologisch aufsteigend
(ältester Eintrag oben, weil er zuerst passiert ist), das ist der bestehende Aufbau dieses Projekts.

## Wenn eine Konvention oder ein Gotcha dazukommt

- [ ] `CLAUDE.md` → *Fallstricke* oder *Conventions*. Das ist die Datei, die in **jeder** Session
      geladen wird — hier steht nur, was man nicht intuitiv errät.
- [ ] Nicht in `CHANGELOG.md` wiederholen. Ein Verweis reicht.
- [ ] Ein Gotcha, der bei einer Code-Änderung aufgefallen ist, gehört hierhin — nicht nur ins
      `PROGRESS.md`. Sonst ist er beim nächsten Mal derselben Änderung nicht mehr auffindbar.

## Was nicht reingehört

| Nicht rein | Warum |
| --- | --- |
| Testzahlen und Zeilenzahlen in `CHANGELOG.md` | stehen in Code, der sich selbst aktualisiert |
| Die Build-Nummer in `CLAUDE.md` | steht in zwei Dateien und wird von `bump.mjs` geschrieben |
| Erledigtes in `TODO.md` | gehört nach `PROGRESS.md`, von dort ins `CHANGELOG.md` |
| Arbeitsschritte in `MILESTONES.md` | dort nur Vorhaben, die den Charakter einer Route haben |
| Der Build im Commit-Befehl | zwei Quellen für dieselbe Zahl |

## Prüfen vor dem Commit

```bash
grep -A5 -i "versioning contract" CLAUDE.md   # Regel noch gültig?
node .claude/skills/release-bump/scripts/bump.mjs --check
git diff --stat
npm test && npm run build
```

`git diff --stat` zeigt genau die Änderungen, die du gemacht hast — nichts, was du nicht
beabsichtigt hast.