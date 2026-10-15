# TODO.md — Roadmap, Limitations & Extensions

> Diese Datei ist die **Arbeitsliste**: was offen ist, was bewusst nicht gebaut wird, und welche
> Designfragen ungeklärt sind — mit Priorität. Erledigtes steht in
> [`PROGRESS.md`](./PROGRESS.md) (technisches Log) und [`CHANGELOG.md`](./CHANGELOG.md)
> (Feature- und Fix-Übersicht), **nicht hier**. Vorhaben, die eine eigene Route brauchen, stehen in
> [`MILESTONES.md`](./MILESTONES.md).

## Open work

### Priorität hoch
- [ ] **Tastaturnavigation der Canvas** — der Accessibility-Pass hat ARIA und Fokus abgedeckt, nicht
      die Bewegung. Pan/Zoom per Tastatur fehlt komplett.
- [ ] **Aggregierte Target/Fallback-Listen** — Drag-to-reorder der Zeilen und Validierung pro Zeile.
      Heute ist das der unangenehmste Teil der Oberfläche.
- [ ] **Größe der Hintergrund-Werkzeuge ändern** — Sticky Notes, Boxen und Marker lassen sich nur
      platzieren, nicht skalieren.

### Priorität mittel
- [ ] **`ttft_timeout_ms` am Routing-Target editierbar machen** — Bifrost 2.3.0 schreibt es an
      die *Targets* (1–300000 ms, Timeout-Code `ttft_timeout`/504), unser Typ trägt es an der
      *Rule* und schreibt es nie. **Blockiert an einer Verifikation, die noch fehlt:**
      `GET /api/routing/rules` gegen eine echte 2.3.0-Instanz — Rule oder `targets[i]`? — und ein
      PUT mit gesetztem Feld, das zurückgelesen wieder dasteht. Bleibt es nicht stehen, ist das
      Feld an der Rule und die ganze Runde entfällt. Wenn ja: Feld nach `ApiTarget` verschieben,
      `RoutingTarget.ttft_timeout_ms?: number`, Aufnahme in `apiRuleToRouting`, `toWriteShape`
      (`bifrostApi.ts`) **und** `writeFingerprint` (`sync.ts`) — beide enumerieren explizit, ein
      fehlender Fingerprint schreibt nie, ein überzähliger schreibt bei jedem Sync. Bereichsprüfung
      nur in `sync.ts rejectionReason`, nicht im Inspector und nicht in `validation.ts`.
      **Harte Grenze:** im nativen Bifrost-SQLite-Schema liegt das Target in `routing_targets`,
      ohne diese Spalte; die DB gehört dem Gateway. Studio-eigenes Schema und API-Modus
      funktionieren, das native Dateiformat nicht — dort sichtbar, aber gesperrt, mit Hinweis.
- [ ] **`toWriteShape` und `createNativeRule` schließen** — dieselbe Regel wird an zwei Orten
      unabhängig gedreht, mit abweichenden Antworten: `bifrostApi.ts` schreibt `weight: t.weight`
      roh durch, `bifrostDb.ts` schreibt `Number(t.weight ?? 1)`; `description` fehlt im
      Write-Shape, ist `''` in der DB-Zeile. Dazu die Boolean→SQL-Coercion viermal. Richtung ist
      „`ruleShape.ts` konsequent weiterziehen", nicht „irgendwann aufräumen".
- [ ] **`TopBar` exportiert config.json im API-Modus ohne Key-Namen** — `keyNameById()` kommt
      über `getDb()`, und im API-Modus ist das `[]`. Die Key-Pins aus `fallbacks` fallen thereby
      still aus dem Export. Braucht eine Entscheidung (was soll der Export ohne DB tun?), keine
      Fehlerbehandlung.
- [ ] **`query` mit deterministischen ids erzeugen** — `ruleShape.queryForWrite` mintet bei jedem
      Aufruf neue ids (`grp_…`, `r_…`). Deshalb schließt `sync.ts:97` das Feld aus dem
      Write-Fingerprint aus. Mit stabilen ids aus Feld/Op/Wert fiele der Ausschluss weg. **Nicht
      blind umsetzen:** es ändert den Payload, den das Gateway-Dashboard bekommt, also einen
      dokumentierten Vertrag. Erst gegen ein echtes Gateway prüfen, ob das Dashboard die
      wiederverwendeten ids akzeptiert.
- [ ] **Read-only SQL-Abfrager** im SQL Browser, hinter einer Statement-Allowlist. Power-User-Frage.
- [ ] **Snapshots pro Projekt** — Snapshots existieren, sind aber global und nicht an ein
      Nutzerprojekt gebunden.

### Braucht erst eine Architekturentscheidung
- [ ] **Serverseitige Persistenz & Audit Trail** — die Bridge speichert nichts; Settings, Projekte
      und Secrets liegen in `localStorage`. Hängt an den Designfragen unten.
- [ ] **Multi-User-Zusammenarbeit** — Präsenz-Cursor, geteilte Workspaces. Braucht einen Sync-Server
      und ist mit der browser-first-Architektur nicht vereinbar.
- [ ] **Mobile Begleitansicht** — nur-Lesen-Regelbrowser mit Deep-Links.

## Known limitations

- **Kein Inference-Proxy** — by design. Das Werkzeug plant und editiert Konfiguration; es leitet
  keinen Traffic.
- **Modellkatalog im API-Modus kommt jetzt vom Gateway** — `fetchModels` liest `GET /api/models`,
  `fetchProviders` liest `GET /api/providers` samt Keys. Bleibt als Rest: ein Provider ohne Keys hat
  auch keine Modelle und taucht deshalb in keiner der beiden Listen auf. Er fällt in
  `providerWarnings` weiter als unbekannt durch, obwohl das Gateway ihn kennt — der Hinweis ist
  also keine lokale Ersatzliste mehr, aber weiterhin kein Befund.
- **Simulation ist ein Mock** — CEL läuft gegen einen festen synthetischen Request-Kontext mit
  randomisierten Ergebnissen. Sie zeigt den Pfad, keine Live-Kapazität.
- **Header-Lookup in der Simulation ist case-insensitiv** — `headers["X-Tier"]` findet `x-tier`.
  HTTP verlangt das, aber ob echtes Bifrost es auch so macht, ist **nicht** gegen ein echtes Gateway
  verifiziert. Bei Abweichung entscheidet die Simulation anders als das Gateway.
- **Browser-Sreibmodell** — im File-Modus schreibt „Save" in die In-Memory-DB plus den
  IndexedDB-Cache, „Download" erzeugt die geänderte `.sqlite`. Zurück an einen beliebigen Pfad
  schreiben kann der Browser nicht.
- **Eine Quelle im Speicher** — zurzeit eine Datenbank oder ein Gateway; ein Wechsel öffnet eine
  neue Kopie. Der Modus ist seit Build 26101020 eine Entscheidung (`openFileSource`), aber der
  Wechsel selbst ist weiterhin destruktiv: eine geöffnete Datei wird beim Gateway-Connect
  geschlossen, und umgekehrt.
- **Simulation ohne Live-Daten** — kein Link auf echte Bifrost-Metriken.

### API-Modus
- **Keine Konflikterkennung** — beim Connect gewinnt die API, danach der Canvas. Parallele Edits im
  Bifrost-Dashboard werden beim nächsten Push überschrieben.
- **Scope-Wechsel sind zerstörend** — Biflosts Update-Endpoint kann `scope` nicht ändern, also ist
  ein Verschieben Delete + Create: die Regel existiert kurz nicht und bekommt eine neue id.
- **Keine Offline-Queue** — ist die Bridge aus, bleiben Änderungen bis zum nächsten manuellen Push
  unsynchron.
- **Keine RBAC-Scopes pro Key** — bei Bifrost Enterprise-only, deshalb bietet die UI sie nicht an.
- **Direktmodus hält den Token im Browser-Speicher** — nur für die Sitzung, nie persistiert, aber
  nicht für mehr als eine lokale Testinstanz geeignet.
- **Dasselbe gilt für das Token-Feld im Connect-Screen.** Seit Build 26100702 lässt sich der
  Gateway-Token dort eingeben, statt ihn in der Bridge-Umgebung zu setzen. Session-only, nie
  persistiert, und die Requests gehen weiterhin *durch* die Bridge. Anders als im Direktmodus
  quert der Token aber das Netz — im Klartext, solange der Dev-Server ohne
  `BFRS_TLS_KEY`/`BFRS_TLS_CERT` läuft. Für alles außerhalb eines vertrauenswürdigen LANs HTTPS
  einschalten.
- **„Token gültig" ist womöglich eine Anzeige, die nicht rot werden kann** — ob echtes Bifrost
  `/api/version` ohne Auth ausliefert, ist ungeklärt; der Mock tut es, und die Doku sagt nichts
  dazu. Falls ja, fällt ein falsches Token erst beim Verbinden auf, nicht in der Statuszeile.

## AI Rule Assistant — offene Punkte

- [ ] Full Canvas Optimizer und AI-generierte Simulationskontexte.
- [ ] Opt-in-Kontext für große Setups: Full Canvas, Diagnostics und Simulation nur auf Anforderung
      mitschicken. Default ist bewusst eng — ausgewählte Rules plus Provider-/Model-Katalog.
- [ ] Anthropic-kompatible API (`/v1/messages`) zusätzlich zu OpenAI-compatible.
- [ ] Simulation-Beispiele im Draft-Schema.
- [ ] Audit Trail für AI-Vorschläge: Prompt, Modell, Draft, angewendet/verworfen, Zeitpunkt.
- [ ] Serverseitige Ablage für API Keys und AI-Settings — hängt an der Secret-Storage-Frage unten.

## Offene Designfragen

- [ ] **Auth/Benutzerkonzept** für einen serverseitigen Store: Single-user lokal, Multi-user später
      oder Profile ohne Login?
- [ ] **Secret Storage**: plain lokale DB verboten? OS-Keyring? Passphrase-Verschlüsselung? ENV-only?
- [ ] **Umfang des serverseitigen Stores** — auch Workspaces und DB-Snapshots, oder nur Settings
      und AI-History?
- [ ] **Kontextumfang für die KI** — darf sie vollständige SQLite-Inhalte sehen oder nur den
      normalisierten Canvas-/Provider-Kontext?
- [ ] **Maximale Kontextgröße und Kürzungsstrategie** bei großen Routing-Setups.
