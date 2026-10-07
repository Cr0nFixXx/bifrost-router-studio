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

`src/lib/cel.ts` is the CEL authority:
- `compileGroup(group)` — visual condition tree → CEL string (supports `negate` for `!(...)`).
- `parseExpression(str)` — **real recursive-descent parser** (lexer + Pratt-style parser) →
  condition tree. Guarantees visual↔CEL round-trips for the supported subset.
- `validateCEL(str)` — lightweight linter (parens, quotes, `=`, dangling operators, parser warnings).
- `evalCEL(str, ctx)` (in the store) — **mock-only** evaluator for the simulation; never a security boundary.
- `src/lib/bifrostQuery.ts` — CEL → Bifrost's react-querybuilder JSON (`celToBifrostQuery`).

Supported variables match Bifrost: `model`, `provider`, `request_type`, `headers[...]`, `params[...]`,
`team_name`, `customer_id`, `virtual_key_name`, `budget_used`, `tokens_used`, `request`,
`request_size`, `time.hour`, `complexity_tier`.
Operators: `== != > < >= <= in startsWith endsWith contains matches`, combined with `&& || !`.
**`src/lib/cel.ts` is the authority for this list** — if it disagrees with the code here, the code wins.

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
  Address it directly; do not route it through `request()`.

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