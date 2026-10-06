# Bifrost Management-API: Constraints, die man nicht erraten kann

Geprüft am 2026-10 gegen die Bifrost-Dokumentation und gegen eine laufende Instanz.

> Diese Liste ist eine **Kopie zum Nachschlagen** im Rahmen dieses Smoke-Tests. Die verbindliche
> Fassung steht als Gotchas in [`CLAUDE.md`](../../../CLAUDE.md#fallstricke-gotchas) — dort steht
> die Regel, nicht nur die Beobachtung. Bei einer Abweichung gilt `CLAUDE.md`.

## Endpunkte

| Operation | Methode + Pfad | Auth |
| --- | --- | --- |
| List | `GET /api/routing/rules?scope=&scope_id=` | Bearer |
| Create | `POST /api/routing/rules` | Bearer |
| Update | `PUT /api/routing/rules/{id}` | Bearer |
| Delete | `DELETE /api/routing/rules/{id}` | Bearer |
| Version | `GET /api/version` | **öffentlich** |
| Fork | dasselbe unter `/api/governance/routing-rules` | Bearer |

**Keine Pagination.** Die List-Antwort trägt `{rules, count}` und sonst nichts. Für realistische
Regelzahlen unproblematisch, aber es gibt keine Cursor.

## Auth

`Authorization: Bearer <token>`. Der Token ist entweder ein Management-API-Key oder
base64 von `admin-username:admin-password`.

**Virtuelle Keys (`sk-bf-*`) werden abgelehnt.** Ebenso das `x-api-key`-Header.

## Die sechs Constraints

### 1. `PUT` ersetzt `targets` vollständig

Das Update-Schema hat **null Pflichtfelder** — weggelassene Felder bleiben unverändert. Aber sobald
`targets` im Body steht, ist es die **komplette** Liste, nicht ein Delta. Eine Teil-Liste löscht
 Routen stillschweigend.

→ Push immer als vollständige Rule-Form senden, nie als Feld-Delta.

### 2. `scope` und `scope_id` fehlen im Update-Schema

Weder `/api/routing/rules/{id}` noch das `UpdateRoutingRuleRequest` enthalten sie. Ein Wechsel
zwischen `global` / `team` / `customer` / `virtual_key` ist damit serverseitig nur **Löschen plus
Neuanlegen** — mit neuer `id` und einem Fenster, in dem die Regel nicht existiert.

→ Ein Diff, der `scope` als änderbar behandelt, ist falsch. `diffRules` emittiert dafür
`delete` + `create`.

### 3. Die GET-Form passt in kein Write-Schema

`RoutingRule` trägt `id`, `created_at`, `updated_at`. Die Write-Schemata akzeptieren keines davon.

→ Ein unverändert zurückgeschicktes GET-Objekt scheitert. Der Weg führt immer über
`toWriteShape` / `toUpdateShape`.

### 4. `query` wird aus CEL generiert

Bifrost wertet zur Laufzeit `cel_expression` aus, sein Dashboard-Editor liest aber
`routing_rules.query`. Ohne Neuberechnung driftet die visuelle Regelansicht im Dashboard gegen
den Canvas.

→ Bei jedem Push neu aus dem CEL erzeugen. `celToBifrostQueryObject` in `src/lib/bifrostQuery.ts`.

### 5. Unmodellierte Felder gehören nicht in den Diff

`ttft_timeout_ms` (Streaming-Cutoff, 1–300000 ms) kennt der Canvas nicht. Fließt es in den
Fingerprint ein, schreibt jeder Sync, obwohl sich nichts geändert hat.

→ Nur Felder vergleichen, die der Canvas modelliert.

### 6. Der Pfad-Fork

Unter Bifrost < 2.0.0 liegen dieselben Routen unter `/api/governance/routing-rules`. Die alten
Pfade sind deprecated, aber noch vorhanden; entfernt werden sie erst im nächsten Major.

→ Einmal beim Connect per `/api/version` prüfen und den Prefix wählen.

## CORS und Erreichbarkeit

`client.allowed_origins` defaultet auf `["*"]`, es gibt kein TLS. Gegen ein lokales Bifrost
funktioniert der Direktmodus aus dem Browser also ohne jede Einrichtung.

Das ist **nicht** der empfohlene Betrieb: Bifrosts eigene Security-Doku rät ausdrücklich davon ab,
die Instanz ungeschützt zu exponieren. Für alles außer lokalen Testinstanzen gehört der Token in
die Bridge, nicht in den Browser.

## Rechte

`RoutingRules:View` / `:Create` / `:Update` / `:Delete`, abgeleitet aus der HTTP-Methode.

**Diese Scopes sind Enterprise-only.** Auf OSS gibt es keine Rechte pro Endpunkt — jeder
authentifizierte Aufrufer darf alles. Das Studio bietet deshalb keine Per-Key-Scope-Auswahl an; eine
solche UI würde eine Sicherheitsgrenze suggerieren, die es auf OSS nicht gibt.

## Quellen

- <https://docs.getbifrost.ai/api-reference/routing>
- <https://github.com/maximhq/bifrost/blob/dev/docs/providers/routing-rules.mdx>