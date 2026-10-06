# TESTING.md — Regressionsprüfung & Abnahme

Stand: **keine CI.** Alles läuft lokal über Vitest. Diese Datei beschreibt den Ist-Stand und die
Kriterien, nach denen eine Änderung als fertig gilt.

## Kommandos

```bash
npm test           # Vitest, einmal
npm run test:watch # Vitest, Watch-Modus
npm run typecheck  # tsc --noEmit
npm run build      # copy-wasm + tsc --noEmit + vite build
```

## Test-Landkarte

95 Tests in 14 Dateien.

| Testdatei | Tests | Deckt ab |
| --- | --- | --- |
| `sync.test.ts` | 17 | `sync.ts` Diff/Apply, `bifrostApi.ts` Konverter, Fehlernormalisierung |
| `cel.test.ts` | 11 | Parser/Compiler, Visual↔CEL Round-Trip |
| `bifrostMapper.test.ts` | 9 | Graph ⇄ Rules, `rulesToWorkflow` Hydration |
| `validation.test.ts` | 9 | Diagnostics (Gewichte, Zyklen, CEL, Scopes) |
| `gatewayExport.test.ts` | 8 | LiteLLM-YAML, OpenAI-Model-Groups |
| `diff.test.ts` | 6 | Canvas-vs-DB-Diff |
| `modelRefs.test.ts` | 6 | `provider/model`-Helfer, Fallback-Parts |
| `ruleOrder.test.ts` | 5 | Priority-Reorder innerhalb einer Scope-Gruppe |
| `aiDraft.test.ts` | 4 | AI-Draft-Normalisierung und -Validierung |
| `bifrostQuery.test.ts` | 3 | CEL → react-querybuilder JSON |
| `customTemplates.test.ts` | 3 | Template-Packs |
| `io.test.ts` | 2 | Import/Export der Workspace-Formate |
| `theme.test.ts` | 2 | Theme-Tokens |

`bifrostDb.test.ts` wird von `io.test.ts` mitabgedeckt.

## Abnahme-Kriterien (DoD)

Eine Änderung ist fertig, wenn:

1. `npm run typecheck` clean ist (keine `any` in `src/types/*`).
2. `npm test` grün ist — **95 Tests, 14 Dateien**, keine Auslassungen.
3. `npm run build` durchläuft.
4. Für Code, der Routing-Regeln berührt: der Visual↔CEL-Round-Trip hält, und Gewichte summieren
   weiter auf `1`.

Für Änderungen am **API-Modus** zusätzlich manuell gegen eine laufende Instanz bzw. einen Mock:

```bash
BFRS_BIFROST_URL=http://localhost:8080 BFRS_BIFROST_TOKEN=<key> npm run bridge

curl -s localhost:8787/api/health                                  # bifrost.authOk: true
curl -s localhost:8787/api/bifrost/api/routing/rules               # Regel-Liste
curl -s -w '%{http_code}' localhost:8787/api/bifrost/api/config     # 403 — Whitelist hält
```

Dazu End-to-End: Connect hydriert den Canvas, eine Änderung erzeugt genau einen PUT, eine
unveränderte Regel **keinen** Request, ein Scope-Wechsel ergibt DELETE + POST statt PUT, und
`ttft_timeout_ms` serverseitig löst keinen Push aus.

## Unbestätigte Checks

Diese Punkte sind noch nicht durch einen automatisierten Test abgedeckt:

- **CI** — es gibt keinen GitHub-Actions-Workflow. Ein `npm test` + `npm run build` pro PR ist
  offen.
- **End-to-End gegen echtes Bifrost** — die API-Modus-Tests liefen bisher gegen einen Mock.
  Ein Regressionslauf gegen eine reale Instanz steht aus.
- **Visuelle Regression** — Modale, Canvas-Rendering und Theme sind nicht screenshot-getestet.
- **Barrierefreiheit** — ARIA und Fokusverhalten sind manuell geprüft, nicht automatisiert.

## Relevante Gotchas

Fallstricke, die Tests typischerweise nicht fangen, stehen in
[`CLAUDE.md`](./CLAUDE.md#fallstricke-gotchas) — dort liegen auch die API-Constraints, an denen
ein Test schweigend vorbeiläuft.