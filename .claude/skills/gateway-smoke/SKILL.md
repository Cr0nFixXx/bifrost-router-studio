---
name: gateway-smoke
description: "Verifiziert die API-Modus-Anbindung gegen ein echtes Round-Trip: startet ein Mock-Gateway plus die lokale Bridge und fährt 31 Checks durch. Nutze diesen Skill immer wenn an src/lib/bifrostApi.ts, src/lib/sync.ts, scripts/local-bridge.mjs oder am API-Connect etwas geändert wurde, oder wenn jemand fragt ob der Sync zum Gateway noch funktioniert, ob die Bridge noch durchlässt oder ob die API-Constraints noch gelten. Auch bei 'teste die API anbindung', 'smoke test gateway', 'läuft der sync noch'."
---

# Gateway-Smoketest

## Worum es geht

Sechs Eigenschaften der Bifrost-Management-API fallen durch **weder `tsc` noch Vitest**:

- `PUT` ersetzt die gesamte Target-Liste statt sie zu ergänzen
- `scope` und `scope_id` fehlen im Update-Schema — ein Scope-Wechsel ist Löschen plus Neuanlegen
- die GET-Form enthält `id`, `created_at`, `updated_at`, die kein Write-Schema akzeptiert
- unveränderte Regeln dürfen **keinen** Request erzeugen
- ein rein serverseitiges Feld darf keinen Push auslösen
- die Bridge ist eine Whitelist und lehnt alles andere mit 403 ab
- `GET /api/models` paginiert mit `limit` 5 als Default — wer eine Seite liest, hat nicht den Katalog
- die Bridge muss den Query-String durchreichen, sonst liefert jede Seite eins denselben First Page
- `owned_by` ist Hersteller-Metadatum, nicht der Provider; der Provider ist das erste Id-Segment

Keine davon ist ein Tippfehler. Jede einzelne hat schon zu stiller Fehlfunktion geführt: eine
veraltete Kopie der Constraints im `CHANGELOG.md` hätte beim Push Regeln zerstört, ein
Whitelist-Prefix-Fehler (`/routing/rules` statt `/api/routing/rules`) hat alles mit 403 abgelehnt,
und das sah wie ein Routing-Problem aus.

Diese Checks gehören deshalb in einen echten Round-Trip, nicht in eine Unit-Test-Mock.

## Ausführen

```bash
node .claude/skills/gateway-smoke/scripts/smoke.mjs
```

Ein Aufruf. Das Skript startet Mock-Gateway und Bridge, fährt die Checks, räumt beide Prozesse
auf — auch bei Ctrl-C oder einem unbehandelten Fehler. Exit-Code 0 bei grün, 1 sonst.

Dauert etwa 15 Sekunden. Braucht Ports 8080 (Mock) und 8787 (Bridge) frei; belegt sind sie dabei.

## Was geprüft wird

| # | Check | Warum |
| --- | --- | --- |
| 1 | Connect + `listRules` | Grundlage für alles andere |
| 2 | Neue Regel → genau ein POST | kein versehentliches Doppel-Posting |
| 3 | Server vergibt eigene ID | die ID gehört dem Server, nicht dem Canvas |
| 4 | `query` aus CEL generiert | sonst driftet Bifrosts Rule-Builder |
| 5 | Geänderte Regel → genau ein PUT, vollständiges `targets` | PUT ersetzt die ganze Liste |
| 6 | PUT übernommen | — |
| 7 | Targets erhalten | eine Teil-Liste würde Routen löschen |
| 8 | Unveränderte Regel → 0 Requests | sonst schreibt jeder Sync |
| 9 | `ttft_timeout_ms` löst keinen Push aus | serverseitige Felder gehören nicht in den Diff |
| 10 | Scope-Wechsel → DELETE + POST statt PUT | Update-Schema kennt `scope` nicht |
| 11 | Scope-Wechsel ergibt neue ID | die alte wird wirklich ersetzt |
| 12 | Ungültige Gewichte → abgewiesen | ein 400 darf nicht den ganzen Batch killen |
| 13 | Löschen → DELETE | — |
| 14 | Fallback auf `/api/governance` | Bifrost < 2.0.0 |
| 15 | Falscher Token → 401 unterscheidbar | sonst ist „Bridge aus" nicht von „falscher Key" zu trennen |
| 16 | Bridge aus → status 0 | Netzwerkfehler ist nicht 401 |
| 17 | WriteShape ohne `id`/`created_at`/`updated_at` | Round-Trip eines GET-Objekts würde scheitern |
| 18 | Whitelist lehnt `/api/config` mit 403 ab | sonst hätte der Token mehr Reichweite als gedacht |
| 19 | Prioritäts-Tausch übersteht UNIQUE (scope, priority) | ein Swap 0↔1 ist sequentiell nicht auflösbar; ohne Ausweichen gibt der Mock exakt den 500er, den das echte Gateway liefert |

## Wann laufen

**Nach jeder Änderung** an `src/lib/bifrostApi.ts`, `src/lib/sync.ts`,
`scripts/local-bridge.mjs`, `src/lib/bifrostQuery.ts` oder den API-Actions in `useStore.ts`.

`npm test` allein reicht nicht: Die Vitest-Suite deckt `sync.ts` mit einem gemockten Transport ab —
die Bridge und das echte Round-Trip-Verhalten prüft nur dieses Skript.

## Manuell durchspielen

Wenn du eine Bridge-Änderung mit eigenen Händen testen willst, statt sie nur grün zu sehen:

```bash
node .claude/skills/gateway-smoke/scripts/mock-bifrost.mjs &
BFRS_BIFROST_URL=http://localhost:8080 BFRS_BIFROST_TOKEN=secret npm run bridge
```

Dann im Studio: Connect-Screen → *Laufende Instanz* → Bridge-URL → *Mit Bridge verbinden*. Der
Canvas hydriert aus den Regeln des Mocks. Der Mock vergibt `srv-1`, `srv-2`, … und lehnt
POSTs mit Gewichten ab, die nicht auf 1 summieren — das Verhalten, an dem `rejectionReason` im
Studio sichtbar wird.

`mock-bifrost.mjs` kennt auch den Pre-2.0.0-Fork: `/api/governance/routing-rules` gibt dort 404,
damit der Fallback-Pfad im Client beobachtbar ist.

## Wenn etwas fehlschlägt

Die Fehlermeldung nennt den Check. Die häufigsten Ursachen:

| Symptom | Ursache |
| --- | --- |
| Check 1 schlägt fehl, „nicht erreichbar" | Ports 8080/8787 belegt, oder die Bridge ist ohne `BFRS_BIFROST_TOKEN` gestartet |
| Check 15/16 schlägt fehl | Falscher Token bzw. Bridge nicht erreichbar — prüfen, dass die Fehler **unterscheidbar** bleiben, statt beide zu `status 0` zu machen |
| Check 18 schlägt fehl | Whitelist in `scripts/local-bridge.mjs` verändert — siehe den Gotcha in `CLAUDE.md` |
| Ein Diff-Check schlägt fehl | `diffRules` schreibt bei unveränderten Regeln. Nachsehen, ob der Fingerprint über die Write-Shape läuft — `query` enthält eine frische UUID pro Aufruf und darf nie verglichen werden |

## Zugehörige Skills

- **`doc-set`** — wenn ein Check eine neue Erkenntnis über die API-Constraints liefert: die gehört
  als Gotcha nach `CLAUDE.md`, nicht in die Doku dieses Skills. Die Constraints selbst stehen in
  `references/api-constraints.md`, damit diese Skill sie ohne den Anker-Sprung lesen kann.
- **`doc-audit`** — wenn die Constraints in `CLAUDE.md` und den Bifrost-Docs auseinandergelaufen sind.