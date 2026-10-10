# CLAUDE.md — Agent / Contributor Guide

**This file is the source of truth for conventions, architecture and gotchas.** It is not a history
of the project and does not describe what the app does for users.

| Need | Go to |
| --- | --- |
| Conventions, gotchas | **this file** |
| Data & transport layers, module map | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Tests, acceptance criteria | [`TESTING.md`](./TESTING.md) |
| Visual design, palette, UX rules | [`DESIGN.md`](./DESIGN.md) |
| What the app does, how to run it | [`README.md`](./README.md) |
| Why a change was made, when, validated how | [`PROGRESS.md`](./PROGRESS.md) |
| What shipped in which release | [`CHANGELOG.md`](./CHANGELOG.md) |
| Open work, known limitations | [`TODO.md`](./TODO.md) |
| Big ideas worth a route | [`MILESTONES.md`](./MILESTONES.md) |
| Ongoing state, gotchas, do-not-forget | [`HANDOFF.md`](./HANDOFF.md) |
| Bifrost's own semantics | [routing-rules docs](https://docs.getbifrost.ai/providers/routing-rules) |

## Agent skills

### Issue tracker

Issues liegen in den GitHub Issues dieses Repos (`gh` CLI). Siehe `docs/agents/issue-tracker.md`.

### Triage labels

Die fünf kanonischen Rollen, Label-Text == Name. Siehe `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` im Repo-Root. Siehe `docs/agents/domain.md`.

## What this project is

A **visual planner and editor for Bifrost AI Gateway routing rules**, browser-first. Mental model:
**canvas graph ⇄ Bifrost `governance.routing_rules[]`** — the canvas edits whichever source the user
picked: a SQLite file (default) or a live gateway. Details in
[`ARCHITECTURE.md`](./ARCHITECTURE.md), user-facing description in [`README.md`](./README.md).

No request traffic is ever proxied, in either mode.

## Conventions

- **Strict TypeScript** everywhere; no `any` in shared types (`src/types/*`).
- Path alias `@/` → `src/`. Use it for all imports.
- Tailwind only for styling; keep the exact palette from `DESIGN.md`. Dark is the default and the
  primary design target; light mode exists via CSS variables for bright environments and exports.
- New UI primitives go in `components/ui/primitives.tsx`.
- Prefer small, focused files; colocate node bodies with `BaseNode`.
- **Serialization boundaries** — `annotation` nodes and the visual elements in `useUserSettings` are
  canvas overlays. They must never reach the Bifrost routing tables, in either mode.
  `useUserSettings` holds no gateway token: it persists to `localStorage`, and the Connect screen's
  token field is component state on purpose, so a reload drops it.
- **UI placement** — Dashboard and Settings are top-level modals from the TopBar, not right-panel
  tabs. RightPanel is reserved for Inspector, Rules, History, Providers and Simulation.

## CEL handling

`src/lib/cel.ts` is the CEL authority — grammar, vocabulary **and** execution:
- `CEL_FIELDS: Record<CELField, CELFieldSpec>` — **the** field table: label, CEL token, `numeric` flag.
  Typed as a `Record` over the union on purpose: a new `CELField` member is a **compile error here**,
  which is the point. The editor, the wizard and `bifrostQuery` read this table; none of them keeps
  a copy. `queryFieldName` is the projection Bifrost's query payload needs (`header` → `headers`).
- `compileGroup(group)` — visual condition tree → CEL string (supports `negate` for `!(...)`).
- `compileCondition(field, op, value, headerName?)` — **the only way to build a condition string.**
  Do not interpolate one: the wizard did, and emitted `budget_used == "42"`, `time_hour == "9"`
  and `in "a, b"`, none of which the gateway reads. Quoting, indices and list syntax live here.
- `parseExpression(str)` — **real recursive-descent parser** (lexer + Pratt-style parser) →
  condition tree. Guarantees visual↔CEL round-trips for the supported subset. Returns `error` when
  it threw; the `group` is then a placeholder and must not be read as a parse.
- `evaluateCEL(str, ctx)` → `{ matched, warnings }` — **mock-only** evaluator for the simulation;
  never a security boundary. It returns warnings instead of a bare `boolean` because the simulation
  used to translate an undecidable condition into a silent `false`.
- `validateCEL(str)` — lightweight linter (parens, quotes, `=`, dangling operators, parser warnings).
- `src/lib/bifrostQuery.ts` — CEL → Bifrost's react-querybuilder JSON (`celToBifrostQuery`).

Supported variables match Bifrost: `model`, `provider`, `request_type`, `headers[...]`, `params[...]`,
`team_name`, `customer_id`, `virtual_key_name`, `budget_used`, `tokens_used`, `request`,
`request_size`, `time.hour`, `complexity_tier`.
Operators: `== != > < >= <= in startsWith endsWith contains matches`, combined with `&& || !`.
**`CEL_FIELDS` is the authority for this list** — if this text disagrees with the code, the code wins.

Two things the parser cannot represent, and callers must not assume otherwise:
- `!(a && b)` is **flattened** with a warning. `negate` only ever applies to a single condition.
- A field the union does not model (`virtual_key_id`) is **not** guessed: the parser keeps
  the verbatim token on `CELCondition.token` and warns, and the compiler and the query
  builder emit it as written. `field` stays `model` and drives only the visual editor.

That second one drives a rule worth stating: a parser warning is not one thing.
`celToBifrostQueryObject` withholds the payload for a *flattened negation* or *trailing
tokens* — the tree would mean the opposite of the text — but keeps it for an *unknown
field*, because the token travels along. Do not collapse that distinction to
`warnings.length > 0`; it ships a rule inverted.

## Rule shape

`src/lib/ruleShape.ts` owns the decisions every path into a `RoutingRule` has to make the same way:
`WEIGHT_GATE_EPSILON` / `WEIGHT_WARN_EPSILON` / `weightSum` / `normalizeWeights`,
`queryForWrite` / `queryForRow`, `fallbacksForApi` / `fallbacksForConfig` / `fallbacksFromConfig`.
Do not reintroduce a weight threshold, a `query` regeneration or a key-pinning rule in a caller —
each was implemented in four places and the copies had drifted. Mappers stay in their own modules
(`apiRuleToRouting` transport, `nativeRowToRule` SQL, `normalizeAiDraft` untrusted input); they call
in here for the decision.

## Custom nodes / edges
- All nodes render through `canvas/nodes/BaseNode.tsx` (frosted card, accent bar, directional
  ports, diagnostic ring). Node bodies live in `nodes/*`.
- Register new node types in **two** places: `FlowCanvas.tsx` (`nodeTypes`) and the drag palette
  in `Sidebar.tsx` (`PALETTE`). Node `type` string must equal the key used in `nodeTypes`.
- Edges use `edges/FlowEdge.tsx` (`type: 'flow'`), which animates a traveling pulse when `data.active` is set.
- `src/types/workflow.ts` declares `PORT_RULES`. The store's `onConnect` enforces them via
  `isValidConnection(connection)` (strict) — invalid connections are rejected before they are
  added, and self-loops are blocked.

## Versioning contract

**Do not change the app version unless the user explicitly asks.** The current version and build
number live in `src/lib/version.ts` — that file is the source of truth, not this one, which is why
this section states no number.
The build number must be bumped on **every** code change, using `YYMMDDHH` in Europe/Berlin time,
in **both** `src/lib/version.ts` and the top-level `"build"` field in `package.json`.
Release history: [`CHANGELOG.md`](./CHANGELOG.md).

## Extending the codebase

1. Add type(s) to `src/types/*`.
2. If it touches Bifrost: implement mapping in `bifrostMapper.ts` (file mode) or `sync.ts` /
   `bifrostApi.ts` (API mode), and test mentally against the
   [routing-rules docs](https://docs.getbifrost.ai/providers/routing-rules).
3. Add store actions → call `recompute()` where topology/validation is affected.
4. Add/adjust `validation.ts` diagnostics.
5. Wire UI, register node types + palette, then update docs: `PROGRESS.md` for what changed and how
   it was validated, `CHANGELOG.md` if it is a feature or bug fix, `TODO.md` if it closes or opens
   an item, this file if it changes a convention or a gotcha.

When is a change *done* — acceptance criteria, test coverage, manual API-mode checks — see
[`TESTING.md`](./TESTING.md).

## Fallstricke (gotchas)

Each of these was hit for real; several cost silent data loss or a silent 403. Full history in
[`PROGRESS.md`](./PROGRESS.md).

**Writing to the gateway**
- **An empty diff is not a success signal.** `syncNow` reports `idle` and a fresh `lastSyncedAt`
  whether it wrote ten rules or zero, so "the chip is green" proves nothing about the gateway.
  Verify a write by re-reading the panel.
- **There is no `state.rules` — do not add one back.** The store used to hold a connect-time snapshot
  beside the canvas, and diffing or reading it compared the gateway with itself, or exported the
  snapshot to disk while the canvas said something else. Every reader projects from the canvas now:
  `getCanvasRules()` in the store, `workflowToRules(nodes, edges)` in components. A cache would
  reintroduce exactly the bug, with a second way to go stale.
- **The gateway holds UNIQUE (scope, priority).** A swap of 0 and 1 cannot be written sequentially —
  the first rule takes the priority the second still holds, and the gateway answers 500. Only rules
  whose *target* priority is occupied need `planPriorityPhases` to step them out of the way first;
  the file-mode schema has no such constraint, so drag-and-drop works locally and only breaks at the
  gateway. The mock simulates it (`mock-bifrost.mjs`, `priorityTaken`) — without that simulation every
  reordering looks healthy.
- **Isolate every change in `applyDiff`.** One rule the gateway refuses must not strand the rest of
  the batch; that was the original behaviour and it meant a single bad fallback held back every
  other edit. Failures are collected per change in `ApplyResult.failures` — a bare count is a number
  the user cannot act on. Scope changes travel as one `ScopeMove`, create and delete together: a
  rejected create must not take the old rule down with it.
- **Never `refreshFromApi()` after a partial sync.** It rebuilds the canvas from the gateway and
  would throw away the very edits the gateway just refused.
- **Targets and fallbacks are validated differently.** Fallbacks carry a server-side provider-prefix
  check that rejects with 400 and is **not documented**; targets are documented as plain optional
  strings. Do not add a provider whitelist to the client — it runs behind the gateway and blocks
  rules that would have worked. `providerWarnings` is a hint shown before the push, deliberately not
  a blocker.
- Never round-trip a GET response into POST/PUT. `id`, `created_at`, `updated_at` and `scope` are in
  the read shape but not in any write schema. Go through `toWriteShape` / `toUpdateShape`.
- `scope`/`scope_id` are absent from the update schema. Moving a rule between scopes is delete +
  create — it changes the rule's id. A "field diff" that treats scope as updatable is wrong.
- `targets` in a PUT replaces the entire list. A partial `targets` array silently drops routes.
- Generate `query` from CEL on every push, or Bifrost's rule builder drifts from the canvas.
- Never let a server-only field (`ttft_timeout_ms`) enter the diff, or every sync writes.
- The version prefix and the rules suffix travel **together**: `/api/routing` + `/rules` =
  `/api/routing/rules`, but `/api/governance` + `/rules` is a path that does not exist — the legacy
  suffix is `/routing-rules`. Getting this wrong kills the <2.0.0 fallback while every test still
  passes, because a mock that 404s the collection happily accepts a wrong path too.
  `gateway-smoke` covers it by *writing* through the legacy prefix.
- `/api/version` sits outside the version-prefix scheme and outside the bridge's rules whitelist.
  Address it directly; do not route it through `request()`. The same holds for the catalog reads
  `/api/models`, `/api/providers` and `/api/providers/{p}/keys` — `request()` would rewrite them to
  `/api/routing/api/models`. They go through `plainRequest()`, which uses the transport directly.
- **`/api/models` pages at five rows by default.** The handler defaults `limit` to 5 and returns
  `total` alongside, so a client that reads one page and stops shows a catalog that looks complete
  and is missing everything past the fifth model. `listModels()` follows `total`; a gateway that
  ignores `limit` entirely is handled by advancing by the rows actually received.
- **The first path segment of a model id is the provider**, always — `nvidianim/meta/llama2-70b`
  is provider `nvidianim` with vendor prefix `meta` in the model, and extra prefixes are normal
  (`EdenAI/cloudflare/@cf/meta-llama/…`). `owned_by` in a gateway model row is **vendor metadata**
  (`core/schemas/models.go`), never the provider; using it moves every model off the config it
  belongs to. `mapGatewayModels` reads the explicit `provider` field, else the id's first segment.
- **The bridge must forward the query string.** It used to pass only `url.pathname`, which made
  every paged call answer with page one — an endlessly repeated first page rather than an error.

**Bridge (`scripts/local-bridge.mjs`)**
- The management token has two sources and **the request wins over the environment**
  (`bifrostToken(requestToken)`). A field that is silently ignored whenever `BFRS_BIFROST_TOKEN` is
  set is worse than no field. Consequence: anything that can reach the bridge can override the
  server-side credential — acceptable only because the bridge stays on loopback. If it is ever
  exposed, this precedence becomes the hole.
- `requestToken()` returns the credential **without** the `Bearer ` prefix; `bifrostFetch` adds it
  back. Forwarding the raw header produces `Bearer Bearer …` and a 401 that looks like a wrong token.
- `authOk` in `/api/health` comes from probing `/api/version`, which `mock-bifrost.mjs` serves
  **unauthenticated** ([mock-bifrost.mjs:120](.claude/skills/gateway-smoke/scripts/mock-bifrost.mjs#L120)).
  Against the mock the status light is therefore always green, and whether real Bifrost protects
  that path is unverified — so "Token gültig" may be a status light that cannot go red. Do not write
  a smoke check that infers auth from `/api/version`; use `/api/routing/rules`.
- `host` defaults to `127.0.0.1`. A browser on another machine therefore cannot reach the bridge
  by IP — and `localhost:8787` in *its* address bar points at the browser host, not the gateway
  host. Both surface as the same opaque `NetworkError`, which sends you hunting for a CORS bug that
  isn't there. The dev server proxies `/bridge/*` (see `vite.config.ts`); the Connect screen
  defaults to `<origin>/bridge`. Only the dev server proxies it — a production build needs
  `preview.proxy` or a real reverse proxy.
- The dev server serves HTTPS when **both** `BFRS_TLS_KEY` and `BFRS_TLS_CERT` are set. Mixed
  content then bites: on an `https://` page the browser blocks `fetch()` against `http://`, so a
  hand-typed `http://localhost:8787` bridge URL fails with no error worth reading.
- The whitelist matches the path **including** `/api`. The client sends `/api/bifrost` + `/api/routing`
  + `/rules`; matching `/routing/rules` alone rejects everything with a 403 that looks like a routing
  problem.
- The whitelist covers the read-only catalog routes `/api/models`, `/api/providers` and
  `/api/providers/{p}/keys`, because the studio has no other source for the gateway's real provider
  and model names. They return names, key ids and redacted values — no key material — which is what
  keeps them out of the same bucket as `/api/config` and `/api/api-keys`.
- Forward the request body **verbatim**. It is already text; `JSON.stringify`-ing it again delivers a
  string to the gateway instead of a rule object.
- The bridge is a whitelist proxy by design. Do not "just forward `/api/*`" — that would put the
  management token in reach of `/api/config` and `/api/api-keys`.
- No token configured is **not** a fallback to unauthenticated: answer 503 with a readable reason.

**Versioning**
- Two places carry the build number: `src/lib/version.ts` and the top-level `"build"` in
  `package.json`. Bumping one and not the other is easy to miss.
- `v1.x` in the logs is the pre-alpha line, `v0.x` the current one. They are not comparable; do not
  read a `v1.4.x` heading as newer than a `v0.2.x` one.

**Dependencies**
- **`npm audit` reporting 7 advisories is the known state**, not a regression. All of them are
  transitive `devDependencies` of `tailwindcss@3`: `npm audit --omit=dev` reports 0, and none of the
  packages appear in `dist/`. The fix is a Tailwind v4 migration — see `MILESTONES.md`.
- **Never run `npm audit fix --force`.** It installs `tailwindcss@4` as a side effect of a command
  that reads like a maintenance chore, rewriting the config format and potentially changing generated
  CSS in the same step nobody reviews. The migration is a milestone with a CSS diff, not a flag.
- A transitive advisory that the parent's range already allows is usually just a pinned lockfile.
  Check `npm view <parent>@<version> dependencies.<pkg>` before assuming a bump needs an override:
  `postcss` wanted `^1.2.1` all along, and `npm update source-map-js` resolved it without a breaking
  change.

**Node model**
- `complexity` and `model` node kinds are legacy. They exist for workspace migration and are not in
  the palette — adding them back silently resurrects deprecated UI.
- New node types must be registered in **both** `FlowCanvas.tsx` (`nodeTypes`) and `Sidebar.tsx`
  (`PALETTE`) with the same `type` string.

**Serialization**
- `annotation` nodes and `useUserSettings` visual elements are overlays. They must never reach the
  Bifrost routing tables, in either mode.

---

<!-- vibe-flow:start -->
# Vibe Flow — Workflow Guide

Use `/vibe-help` anytime for context-aware guidance on what to do next.

## Analysis

- **`CB`** Create Product Brief — A guided experience to nail down your product idea into an executive brief *(Radar)*
- **`MR`** Market Research — Market analysis, competitive landscape, customer needs and trends *(Radar)*
- **`DR`** Domain Research — Industry domain deep dive, subject matter expertise and terminology *(Radar)*
- **`TR`** Technical Research — Technical feasibility, architecture options and implementation approaches *(Radar)*

## Planning

- **`CP`** Create PRD — Expert led facilitation to produce your Product Requirements Document *(Rhythm)*
- **`VP`** Validate PRD — Validate a Product Requirements Document is comprehensive, lean, well organized and cohesive *(Rhythm)*
- **`EP`** Edit PRD — Update an existing Product Requirements Document *(Rhythm)*
- **`CU`** Create UX Design — Guidance through realizing the plan for your UX to inform architecture and implementation *(Prism)*

## Architecture

- **`CA`** Create Architecture — Guided workflow to document technical decisions to keep implementation on track *(Blueprint)*
- **`CE`** Create Epics & Stories — Create the Epics and Stories Listing — the specs that will drive development *(Rhythm)*
- **`IR`** Implementation Readiness — Ensure the PRD, UX, Architecture, and Epics/Stories are all aligned *(Blueprint)*

## Implementation

- **`DS`** Dev Story — Write the next or specified story's tests and code *(Pulse)*
- **`CR`** Code Review — Comprehensive code review across multiple quality facets *(Pulse)*
- **`SP`** Sprint Planning — Generate or update the record that sequences tasks for the full project *(Tempo)*
- **`CS`** Context Story — Prepare a story with all required context for implementation *(Tempo)*
- **`ER`** Epic Retrospective — Multi-agent review of all work completed across an epic *(Tempo)*
- **`CC`** Course Correction — Determine how to proceed if major need for change is discovered mid implementation *(Tempo)*
- **`SS`** Sprint Status — Review and update sprint progress *(Tempo)*
- **`QA`** Generate Tests — Generate API and E2E tests for existing features *(Signal)*

## Quick Flow

- **`QS`** Quick Spec — Architect a quick but complete technical spec with implementation-ready stories *(Dash)*
- **`QD`** Quick Dev — Implement a story tech spec end-to-end (core of Quick Flow) *(Dash)*
- **`QQ`** Quick Dev New — Unified quick flow — clarify intent, plan, implement, review, present *(Dash)*

## Utility

- **`BP`** Brainstorm — Expert guided facilitation through single or multiple brainstorming techniques *(Radar)*
- **`DP`** Document Project — Analyze an existing project to produce useful documentation for both human and LLM *(Echo)*
- **`GC`** Generate Project Context — Analyze the project and produce a context document for AI agents *(Echo)*
- **`SM`** Squad Mode — Bring multiple agent personas into one session to collaborate and discuss *(Maestro)*

<!-- vibe-flow:end -->

## TRUTHPACK-FIRST PROTOCOL (MANDATORY)

### BEFORE YOU WRITE A SINGLE LINE OF CODE, YOU MUST:
1. Read the relevant truthpack file(s) from `.vibecheck/truthpack/`
2. Cross-reference your planned change against the truthpack data
3. If the truthpack disagrees with your assumption, the truthpack wins

### Truthpack Files — The SINGLE Source of ALL Truth
| File | Contains |
|---|---|
| `product.json` | Tiers (Free/Pro/Team/Enterprise), prices, features, entitlements |
| `monorepo.json` | All packages, dependencies, entry points, build commands |
| `cli-commands.json` | Every CLI command, flags, subcommands, tier gates, exit codes |
| `integrations.json` | Third-party services (Stripe, GitHub, PostHog, OAuth), SDK versions |
| `copy.json` | Brand name, taglines, CTAs, page titles, descriptions |
| `error-codes.json` | Error codes, classes, HTTP status codes, exit codes, messages |
| `ui-pages.json` | Frontend routes, page components, auth requirements, layouts |
| `deploy.json` | Railway, Netlify, Docker, K8s, CI/CD pipelines, environments |
| `schemas.json` | Database tables, columns, migrations, Zod schemas, API contracts |
| `routes.json` | Verified API routes, methods, handlers |
| `env.json` | Verified environment variables |
| `auth.json` | Auth mechanisms, protected resources |
| `contracts.json` | API request/response contracts |

### Absolute Rules
1. **NEVER invent tier names** — read `product.json` first
2. **NEVER invent CLI flags** — read `cli-commands.json` first
3. **NEVER invent error codes** — read `error-codes.json` first
4. **NEVER guess package names** — read `monorepo.json` first
5. **NEVER hallucinate API routes** — read `routes.json` first
6. **NEVER fabricate env vars** — read `env.json` first
7. **NEVER guess prices or features** — read `product.json` first
8. **NEVER invent UI copy** — read `copy.json` first

### On Conflict
- The truthpack is RIGHT, your assumption is WRONG
- Run `vibecheck truthpack` to regenerate if you believe it is outdated
- NEVER silently override truthpack-verified data
- Violation = hallucination — must be corrected immediately

### Verification Badge (MANDATORY)
After EVERY response where you consulted or referenced any truthpack file, you MUST end your response with the following badge on its own line:

*Verified By VibeCheck ✅*

