# MILESTONES.md — Zielbild & große Vorhaben

Wohin das Projekt reisen soll: **größere Funktionsumfänge mit eigenem Gewicht**, nicht
Arbeitsschritte.

> Die detaillierte Arbeitsliste mit Priorität steht in [`TODO.md`](./TODO.md). Hier landet nur,
> was ein eigenes Thema ist — mit Ziel, Umfang und grober Richtung, ohne Implementierungsplan.

## Zielbild

Der Studio-Editor wird vom reinen DB-Editor zum vollständigen Werkzeug für den Betrieb einer
Bifrost-Gateway: nicht mehr nur Regeln planen und exportieren, sondern sie gegen eine laufende
Instanz prüfen, veröffentlichen und den Ist-Zustand über die Zeit nachvollziehen.

Der Browser bleibt die Standardumgebung — der optionale Bridge-Prozess ist die Schleuse, über die
alles läuft, was ein Browser nicht selbst darf.

## Tailwind v4 migrieren

**Warum:** `npm audit` meldet 7 Advisories, die alle aus `tailwindcss@3` kommen — `braces` (high,
Stack-Exhaustion über tief verschachtelte Glob-Muster) und `postcss-selector-parser` (moderate,
quadratische Komplexität beim Selektor-Parsen). Die betroffene Spanne ist `0.5.0 - 3.4.19`, und
`3.4.19` ist die letzte v3. Es gibt keinen Patch innerhalb von v3; nur `tailwindcss@4` behebt beide.

**Umfang:** Config-Format v3 → v4 (`tailwind.config.js` wird zu CSS-First-Konfiguration),
PostCSS-Verdrahtung von `@tailwind`-Direktiven auf `@import "tailwindcss"`, mögliche Änderungen an
generiertem CSS. Danach [`DESIGN.md`](./DESIGN.md) gegen das Ergebnis prüfen — die Palette ist von
Hand abgestimmt und darf nicht still verrutschen.

**Erster Schritt:** Ein Branch, der nur die Migration macht. Danach das generierte CSS vor und nach
der Migration diffen und die Abweichungen auflisten, statt sie zu überraschen.

**Warum das nicht sofort:** Keines der Pakete erreicht den Browser — `npm audit --omit=dev` meldet
0, und im `dist`-Bundle kommen sie nicht vor. Die DoS braucht ein bösartiges Glob-Muster in der
eigenen Tailwind-Config, also Schreibrecht auf dem Repo. Der Preis ist eine Major-Migration an einer
Stelle, an der das Projekt eine verbindliche Vorgabe hat; der Nutzen ist ein Build-only-DoS ohne
erreichbare Trust-Grenze. `source-map-js` (hoch) war derselbe Fall und wurde separat auf 1.2.2
gehoben — das war kostenlos, weil `postcss` `^1.2.1` ohnehin erlaubt.

**Nicht** `npm audit fix --force` laufen lassen: das nimmt diese Migration ungefragt mit und macht
sie in einem Schritt, ohne dass das CSS-Diff jemand ansieht.

---

<!-- Themen hier anlegen. Format:

## <Thema>

**Warum:** <das Problem, das gelöst wird>
**Umfang:** <grob, was dazugehört>
**Erster Schritt:** <die eine Sache, mit der es beginnt>

Beispiele aus der Vergangenheit: die Umstellung auf sql.js (weg von einem Node-Backend), der
Live-Gateway-Sync via Management-API, die visuelle Query-Builder-Anbindung an Bifrost.
-->

<!-- Platzhalter: bewusst leer. Einträge entstehen, wenn ein Vorhaben den Charakter einer
     Route hat — nicht für jede Feature-Idee. -->