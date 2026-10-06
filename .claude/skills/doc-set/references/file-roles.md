# Rollenverteilung der Doku-Files

Jede Information gehört in genau eine Datei. Diese Matrix ist die Entscheidungsgrundlage für
`doc-set`; sie beschreibt **den tatsächlichen Dateibestand dieses Repos**.

## Inhalt

1. [Die neun Rollen](#die-neun-rollen)
2. [Dateien, die es absichtlich nicht gibt](#dateien-die-es-absichtlich-nicht-gibt)
3. [Zuständigkeitsprüfung](#zuständigkeitsprüfung)

---

## Die neun Rollen

| Datei | Zuständig für | Ausdrücklich **nicht** für |
| --- | --- | --- |
| `README.md` | Was die App kann, Setup, Kommandos, Nutzer-Sicht | Architektur-Details, Versionsregeln, Historien |
| `CLAUDE.md` | Konventionen, Architektur-Regeln, **Fallstricke** | Historie, Funktionskatalog, Nutzer-Sicht |
| `ARCHITECTURE.md` | Daten- und Transport-Schicht, Modul-Landkarte, Bifrost-Schema-Vertrag | Konventionen, Gotchas, Testkommandos |
| `DESIGN.md` | Design-System, Farbtokens, Bewegung, UX-Regeln | Logik, Datenmodell, Tests |
| `TESTING.md` | Test-Kommandos, Abdeckungs-Landkarte, Abnahme-Kriterien | Testergebnisse der Historie, bekannte Bugs |
| `MILESTONES.md` | Große Vorhaben, Zielbild | Arbeitsschritte, Prioritäten, Erledigtes |
| `TODO.md` | Offene Punkte, bekannte Grenzen, offene Fragen — **mit Priorität** | Chronologie, Erledigtes, Architektur |
| `PROGRESS.md` | Chronologisches Code-Protokoll: was, warum, wie validiert | Release-Zusammenfassung, offene Punkte |
| `CHANGELOG.md` | Versionierter Verlauf: Features und Bugfixes | Begründungen, Validierungsdetails, offene Punkte |

### Kopplungen

Die Rollen sind nicht unabhängig — drei Verbindungen sind bewusst so gebaut:

- **`CHANGELOG.md` ↔ `PROGRESS.md`** — dieselbe Historie, zwei Blickwinkel. CHANGELOG ist die
  Kurzfassung für Nutzer (was kam raus), PROGRESS das Protokoll für Entwickler (warum, und wie
  wurde es geprüft). Überschneidung ist gewollt und erwünscht.
- **`TODO.md` ↔ `MILESTONES.md`** — TODO ist die Detail-Arbeitsliste, MILESTONES der Ort, an dem
  ein Vorhaben den Charakter einer Route bekommt. Alles in MILESTONES hat einen Gegenstand in
  TODO, aber nicht umgekehrt.
- **`CLAUDE.md` ↔ alles andere** — ist Source of Truth für Fallstricke. Andere Dateien
  **verlinken** auf den Anker (`[Fallstricke](./CLAUDE.md#fallstricke-gotchas)`), sie kopieren
  sie nie.

## Dateien, die es absichtlich nicht gibt

Zwei Kandidaten wurden in der Ausarbeitung erwogen und verworfen:

| Kandidat | Warum nicht | Wann doch |
| --- | --- | --- |
| `HANDOFF.md` | Überschneidet sich mit `README.md` (Ist-Stand) und `CLAUDE.md` (Fallstricke). Eine vierte Datei mit demselben Inhalt unter anderem Namen. | Wenn ein Agent-Handoff echten Mehrwert hat, den keine andere Datei trägt — dann aber mit eigenem Inhalt, nicht als Kopie. |
| `PLAN.md` | Doppelte die AI-Phasen in `TODO.md` und die Plan-Datei der Harness. | Wenn ausgearbeitete Planungen eine eigene Lebensdauer bekommen, die weder `TODO.md` noch `MILESTONES.md` tragen können. |

Falls jemand eine dieser Dateien vorschlägt, ist die ehrliche Antwort nicht „nein", sondern die
Frage nach dem Mehrwert — und die Rollenprüfung oben.

## Zuständigkeitsprüfung

Wenn du unsicher bist, ob eine Information hierher gehört, geh diese Fragen durch:

**Gehört es nach `CLAUDE.md`?**
Ist es eine Regel, die man befolgen muss, oder eine Falle, in die man tappen kann? Dann ja.
Ein "mach X nicht" gehört immer dorthin, auch wenn es selten vorkommt.

**Gehört es nach `PROGRESS.md` oder `CHANGELOG.md`?**
War es eine einmalige Entscheidung oder ein einmaliges Ereignis? Dann mindestens nach `PROGRESS.md`.
Kam etwas in einer Version **für Nutzer** heraus? Dann zusätzlich nach `CHANGELOG.md`.

**Gehört es nach `TODO.md`?**
Steht es noch aus? Dann ja, mit Priorität. Eine TODO-Liste ohne Prioritäten ist eine Einkaufsliste,
keine Arbeitsliste.

**Gehört es nach `ARCHITECTURE.md`?**
Verweist es darauf, *wo* Code wohnt oder *was* die Schichten tun? Dann ja.
Verweist es auf eine Regel, die man befolgen muss? Dann nach `CLAUDE.md`.

**Passt es in keine Rolle?**
Dann ist die Information entweder zu klein (dann gehört sie in einen bestehenden Abschnitt) oder
noch nicht entschieden (dann ist es kein Doku-Problem, sondern ein Design-Problem). Beides ist
ein guter Grund, **nicht** einfach eine neue Datei anzulegen.