# DESIGN.md — Design System & UI/UX

A sophisticated, dark, "cyber-frosted" aesthetic — premium SaaS, zero visual overload.

## Color palette (strict — dark is the primary target, light is supported)

| Token | Hex | Usage |
| --- | --- | --- |
| `canvas` | `#090a0c` | App / page background |
| `surface` | `#131316` | Panels, glass base, cards |
| `surface-2` | `#1a1a1f` | Nested surfaces, inputs |
| `surface-3` | `#212128` | Raised chips, handles |
| `border` | `#27272e` | Hairline dividers |
| `border-strong` | `#34343d` | Hover borders |
| `neon` (teal) | `#5eead4` | Primary accent, active connections |
| `neon-cyan` | `#22d3ee` | Targets / info |
| `neon-violet` | `#a78bfa` | Triggers / links |
| `neon-pink` | `#f472b6` | highlights |
| `neon-amber` | `#fbbf24` | Complexity / warnings |
| `neon-green` | `#34d399` | Success / fallbacks |
| `neon-red` | `#f87171` | Errors / danger |
| `ink` | `#e7e7ea` | Primary text |
| `ink-muted` | `#9a9aa3` | Secondary text |
| `ink-faint` | `#6a6a73` | Tertiary / captions |

Configure in `tailwind.config.js` → `theme.extend.colors`.

## Surfaces & depth

- **Frosted glass**: `.glass` (`bg-surface/70` + `backdrop-blur-xl` + `border`). `.glass-strong`
  uses `bg-surface-2/80` + `blur-2xl` for modals.
- **Depth**: `shadow-depth` (soft, large, dark) for floating panels; `shadow-glow` (teal) and
  `shadow-glow-violet` for selected/active elements.
- **Canvas grid**: faint dotted React Flow background (`BackgroundVariant.Dots`, `#1c1c22`, gap 26).

## Typography

- Sans: **Inter** (UI). Mono: **JetBrains Mono** (CEL, expressions, IDs). Loaded via Google Fonts
  in `index.html`; class `font-mono` for code.
- Scale: page titles `text-lg`, section labels `text-[10px]` uppercase tracked (`tracking-wider`)
  via `.label`.

## Motion (Framer Motion)

- `Segmented` control: shared `layoutId="segmented-active"` sliding pill.
- `Modal`: `scale 0.96→1`, `y 12→0`, spring exit; backdrop blur fade.
- Nodes: spring `scale 0.94→1` on mount.
- Sidebar/RightPanel: width spring (`stiffness 320, damping 34`) for collapse/expand.
- Edge pulse: SVG `<animateMotion>` traveling dot + CSS `.edge-flow-anim` dashed flow.
- `animate-pulse-ring` keyframe for simulation-active nodes.

## Layout

```
┌───────────────────────────────────────────────────────┐
│ TopBar: project · H/V · Expert · Save/Sync/Import/Export│
├──────────┬──────────────────────────────┬──────────────┤
│ Sidebar  │  FlowCanvas (React Flow)     │ RightPanel   │
│ (palette │  - custom nodes/edges        │ - Inspector  │
│  + tools)│  - minimap / controls        │ - Providers  │
│          │  - context menu              │ - Simulation │
└──────────┴──────────────────────────────┴──────────────┘
```
- **Collapsible sidebars**: collapse to a 64px / 56px icon rail (see `Sidebar`, `RightPanel`).
- **Responsive**: the layout is desktop-first; the login and dashboard are responsive grids.
  On small viewports the canvas supports touch pan/zoom (React Flow `panOnDrag`, `zoomOnPinch`).

## Component anatomy

- **BaseNode**: accent side-bar, header (icon avatar + title + subtitle + optional `headerRight`),
  body slot, diagnostic footer (`error` ring-red / `warning` ring-amber). Ports render on the
  correct edge per `direction` (left/right in LR, top/bottom in TB) with tiny labels.
- **Primitives** (`components/ui/primitives.tsx`): `Button` (5 variants), `IconButton`, `Chip`,
  `Toggle`, `Segmented`, `Modal`, `EmptyState`. Reuse these — do not hand-roll buttons.

## Data viz conventions

| Element | Color |
| --- | --- |
| Trigger / rule | violet `#a78bfa` |
| Complexity | amber `#fbbf24` |
| Target | cyan `#22d3ee` |
| Fallback | red `#f87171` |
| Provider | green `#34d399` |
| Model | teal `#5eead4` |
| Active edge (sim) | teal glow + animated pulse |

## Accessibility & polish

- Focus rings on inputs (`focus:ring-2 focus:ring-neon/20`).
- `aria-label` on icon-only buttons; `role="switch"` on toggles.
- `prefers-reduced-motion`: Framer respects defaults; heavy loops (dash/pulse) are decorative.
- Scrollbars themed (`::webkit-scrollbar`) to match the dark surface.

## Theme mode update

The studio now supports both dark and light modes via CSS variables (`--canvas-rgb`, `--surface-rgb`, `--ink-rgb`, etc.). Functional node colors remain stable across modes. Dark mode remains the default and the primary design target; light mode is available for presentation/export and bright environments.

## Workspace annotations and layout

Visual annotation nodes (`annotation`) are intentionally non-persistent to Bifrost routing schema. They may be used as sticky notes, boxes, marker highlights or pen-style explanations on the canvas. The mapper ignores them when compiling `routing_rules`.

Side panels are user-resizable. Keep resize handles subtle (`w-1.5`, neon hover), and preserve the main canvas as the primary workspace.

## v0.2.2 search/help/background tools

Search highlighting uses a stronger neon ring (`ring-4 ring-neon shadow-glow`) and should take precedence over normal selection rings. Disabled rule chains use opacity + grayscale to make inactive routing paths obvious. Visual tools are rendered as canvas background overlays, not React Flow routing nodes.

## v0.2.3 visual tool controls

Visual background tools expose a shared color token and stroke-size slider. Marker uses the selected color with reduced opacity; pen uses the selected color as an opaque stroke. Sticky/box elements remain movable/resizable overlay objects stored in user settings.
