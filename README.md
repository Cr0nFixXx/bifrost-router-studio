# ⚡ Bifrost Router Studio

A browser-based SQLite editor and visual routing-rule planner for **Bifrost AI Gateway**.
Open a Bifrost `.sqlite`/`.db` configuration store, inspect and edit routing rules visually, then export the modified database or interoperable config files.

The default app is client-side: SQLite runs in the browser through `sql.js`/WASM. An optional local bridge is available when you explicitly want server-side file-path access.

## What you can do

- Open a real Bifrost SQLite config store directly in the browser.
- Build routing rules visually with Rule, Condition, AND/OR Logic, Target and Fallback nodes.
- Edit rules through the canvas, the Rules panel, or the SQL Browser.
- Keep Bifrost-compatible `cel_expression`, `targets`, `fallbacks` and dashboard `query` state in sync.
- Compare canvas changes against the live SQLite DB before saving.
- Run request simulations and inspect the matched routing path.
- Use templates and the Rule-Chain Wizard to create complete routing flows faster.
- Ask the optional AI Assistant for review-only routing-rule drafts, explanations and optimizations.
- Export workspace JSON, Bifrost config JSON, Markdown, PNG/JPG and the edited SQLite DB.

## Core concepts

| Concept | Purpose |
| --- | --- |
| Rule | Metadata anchor: name, description, scope, priority and enabled state. |
| Condition | One CEL condition such as `headers["user-agent"].contains("claude")`. |
| Logic | AND/OR grouping for nested condition graphs. |
| Target | One or more weighted provider/model routes for a rule. |
| Fallback | Ordered fallback chain for a rule. |
| SQL Browser | Direct table-oriented editor for `routing_rules` and `routing_targets`. |
| AI Assistant | Review-only copilot for drafts and explanations; it never saves automatically. |

## Getting started

```bash
npm install
npm run dev
```

Open the app in your browser and choose one of:

- Open an existing `.sqlite`, `.sqlite3` or `.db` file.
- Open the bundled sample database.
- Create a new empty database.
- Resume the last cached browser session.

Browsers cannot overwrite arbitrary local files directly. Use **Save** to update the in-memory DB and browser cache, then export the edited SQLite file from the **Export** menu.

## Optional local file bridge

For server-side file paths, start the local bridge:

```bash
BFRS_LOCAL_ROOT=/path/to/bifrost/configs npm run bridge
```

Then the Connect screen can open relative paths such as:

```text
config.sqlite
config.json
subfolder/config.sqlite
```

To explicitly allow arbitrary absolute paths outside `BFRS_LOCAL_ROOT`:

```bash
BFRS_ALLOW_ABSOLUTE=1 npm run bridge
```

## Useful scripts

```bash
npm run dev        # start Vite dev server
npm run build      # copy WASM + type-check + production build
npm run preview    # preview production build
npm run typecheck  # TypeScript check
npm run test       # Vitest suite
npm run bridge     # optional local file bridge
```

## AI Assistant overview

The AI Assistant can use a custom OpenAI-compatible API endpoint. It is intentionally review-only:

1. You send a prompt and selected context.
2. The assistant proposes a draft or explanation.
3. The draft is validated and shown in a review panel.
4. You can preview a diff, open it in the wizard, save it as a template, or apply it to the canvas.
5. Database changes still require the normal save/export flow.

## Documentation map

- [`TODO.md`](./TODO.md) — roadmap and remaining tasks.
- [`PROGRESS.md`](./PROGRESS.md) — implementation history and validation notes.
- [`CHANGELOG.md`](./CHANGELOG.md) — release-style change log.
- [`DESIGN.md`](./DESIGN.md) — visual design and UX rules.
- [`CLAUDE.md`](./CLAUDE.md) — architecture notes and development contract.
