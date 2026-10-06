# Rollenverteilung der Doku-Files

Jede Information gehört in genau eine Datei. Diese Matrix ist die Entscheidungsgrundlage für
`doc-set`; sie beschreibt **den tatsächlichen Dateibestand dieses Repos**.

## Inhalt

1. [Die neun Rollen](#die-neun-rollen)
2. [Dateien, die es absichtlich nicht gibt](#dateien-die-es-absichtlich-nicht-gibt)
3. [Gotcha oder bekannte Grenze?](#gotcha-oder-bekannte-grenze)
4. [Zuständigkeitsprüfung](#zuständigkeitsprüfung)

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

## Gotcha oder bekannte Grenze?

Beides klingt nach „wichtiges Problem", landet aber in **verschiedenen** Dateien. Der Unterschied
ist die entscheidende Frage, und deshalb lohnt die Reihenfolge: erst die Fehlerursache, dann die
Ablage.

**Ein Gotcha** beschreibt eine Falle mit konkreter Fehlerursache: *du tust X, und dann passiert Y
unerwartet*. Es hat drei Merkmale:

1. Es gibt ein **Fehlverhalten**, das jemand tun könnte.
2. Die **Ursache** ist benennbar — ein Pfad, ein Feld, eine Reihenfolge, ein Schema.
3. Wer es nicht weiß, **verliert Daten, Zeit oder bekommt stille Fehler**.

Beispiele aus diesem Projekt: `targets` in einem PUT ersetzt die ganze Liste (Ursache: die API
behandelt das Feld als vollständige Liste). Ein GET-Shape enthält Felder, die kein Write-Schema
akzeptiert (Ursache: getrennte Schemas). Wer das nicht weiß, überschreibt Regeln oder bekommt
einen 403, der wie ein Routing-Problem aussieht.

**Eine bekannte Grenze** beschreibt, was das Produkt nicht kann. Vier Merkmale:

1. Es gibt **kein Fehlverhalten** — niemand tut etwas Falsches.
2. Es gibt keine einzelne Ursache, die man beim Coden umgehen könnte.
3. Wer es nicht weiß, ist nicht überrascht — es ist schlicht der aktuelle Zuschnitt.
4. Es ist **offen**: entweder geplant (steht in `TODO.md`/`MILESTONES.md`) oder bewusst so
   entschieden.

Beispiele: Der Sync zum Gateway hat keine Konflikterkennung — wer parallel im Bifrost-Dashboard
etwas ändert, gewinnt einfach der letzte Push. `ttft_timeout_ms`, `scope` und `priority` sind im
Canvas nicht editierbar. Das ist der Zuschnitt, nicht eine Falle.

**Die Verwechslung ist teuer in beide Richtungen.** Ein Gotcha, der in `TODO.md` landet, wird nie
gelesen — die Datei wird erst beim nächsten Planungsdurchlauf geöffnet, und bis dahin verliert
jemand erneut Daten. Eine Grenze, die in `CLAUDE.md` landet, überschwemmt die Fallstricke mit
Dingen, vor denen niemand auf der Hut sein muss, und die echten Fallen verschwinden im Rauschen.

**Die eine Frage, die entscheidet:** *Kann jemand durch das Nicht-Wissen etwas Falsches tun?*
Wenn ja → `CLAUDE.md` (Fallstricke). Wenn nein → `TODO.md` (bekannte Grenzen).

**Der Grenzfall, der beide Seiten hat.** Manche Themen sind beides, und das ist kein Formfehler —
dann gehören **zwei Sätze an zwei Orten**, mit klarer Arbeitsteilung:

- `CLAUDE.md` bekommt nur die Falle, wenn es eine gibt: „Ein einzelner Push überschreibt
  parallele Änderungen — es gibt keinen Merge."
- `TODO.md` bekommt die Grenze als offenen Punkt mit Priorität: „Konflikterkennung fehlt,
  letzter Push gewinnt."

Konkretes Beispiel, das genau hierher gehört: **Konflikterkennung fehlt.** Niemand tut etwas
Falsches — es gibt schlicht keine Prüfung, ob jemand anderes zwischenzeitlich dieselbe Regel
geändert hat. Der Fehler ist nicht beim Codieren passierbar, sondern wäre erst beim Benutzen
auffällig. Das ist eine **bekannte Grenze** und gehört nach `TODO.md`. Sobald jemand eine
Konfliktprüfung baut und dabei in eine konkrete Falle tappen kann ("gleiche Regel gelöscht und
neu angelegt", "PUT geht durch, weil der Zeitstempel verrutscht ist"), wird daraus ein Gotcha und
gehört zusätzlich nach `CLAUDE.md`.

**Zweite Regel für den Grenzfall:** Eine bekannte Grenze, die sich in Code-Verhalten äußert, wird
in `ARCHITECTURE.md` beschrieben — *wie* der Sync heute entscheidet. `TODO.md` sagt, dass es
fehlt; `ARCHITECTURE.md` sagt, was stattdessen passiert. Auch das ist eine Arbeitsteilung, keine
Dopplung.

## Zuständigkeitsprüfung

Wenn du unsicher bist, ob eine Information hierher gehört, geh diese Fragen durch:

**Gehört es nach `CLAUDE.md`?**
Ist es eine Regel, die man befolgen muss, oder eine Falle, in die man tappen kann? Dann ja.
Ein "mach X nicht" gehört immer dorthin, auch wenn es selten vorkommt.
Zur Abgrenzung gegen bekannte Grenzen: siehe *Gotcha oder bekannte Grenze?* oben.

**Gehört es nach `TODO.md`?**
Kann jemand durch das Nicht-Wissen etwas Falsches tun? Wenn nein und es ist noch offen:
bekannte Grenze, dann ja.

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