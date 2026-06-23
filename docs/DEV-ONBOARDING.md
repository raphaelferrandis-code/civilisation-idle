# Developer onboarding — Civilisation Idle (visual / rendering work)

Welcome. This game is **finished and playable**; your job is to improve how it **looks and
feels**. Read this once before touching anything. Code comments throughout are in French —
you don't need to write French, but the renderer is well documented if you read it.

## Run it

```bash
npm install
npm run dev        # Vite dev server → open the printed http://localhost URL
npm test           # Vitest — MUST stay green
npm run build      # production web build
npm run electron   # run the desktop (Electron) shell against a build
```

Node 18+ recommended. The game is a single-page React app; everything happens in the
browser tab during development.

## The 30-second architecture

- `src/App.jsx` — top-level shell, switches between views (City, Prestige, Ruins,
  Heritage, Myths, Chronicle), handles era-change banners and global UI state.
- **The hero screen is `CityView`** (`src/components/views/CityView.jsx`): a full-screen
  procedural **Canvas** city map with the HUD and building shop docked on top as overlays.

### The map is 100% procedural Canvas 2D (no sprites)

Everything you see on the map is **drawn in code** every frame — there are no image
assets for the world. The pipeline:

- `src/components/map/CityMapCanvas.jsx` — React component that owns the `<canvas>` and
  starts the runtime.
- `src/game/map/cityMapRuntime.js` — the animation loop, resize/DPR handling, camera,
  input, and the per-frame draw order. **Start here to understand rendering.**
- `src/game/map/renderWorld.js` — ground, terrain, **river & reflections**, trees,
  vestiges, **night & street lights**, bridges, walls, plazas, mist, quays, health tint,
  **roads & road markings**, crisis effects. (The big one.)
- `src/game/map/renderBuildings.js` — building tiles, wonders, central fire, minimap.
- `src/game/map/agents.js` — citizens, vehicles, ships walking/driving around + their
  "thought" bubbles.
- `src/game/map/cityEngineSprites.js`, `engineSprites.js`, `buildingShapes.js` — the
  per-building drawing routines (silhouettes/shapes drawn with `ctx`).
- `src/game/map/layout.js` + `src/game/map/procedural/**` — *where* things go: road graph,
  water model, building placement, walls, city personality, per-era visual config, seed.
- `src/game/data/eraThemes.js` — colour palettes / themes per era ("band").

Performance is deliberate: render DPR is capped (`CM_MAX_RENDER_DPR`) and drawing is
paused whenever a `<dialog>` modal is open. Respect this — the loop must stay ~60 fps on
integrated GPUs.

### The UI is React + CSS

- `src/components/ui/**` — HUD, **building shop** (`BuildingShop.jsx`), topbar, status
  panel, crisis bar, tickers, rolling numbers.
- `src/components/views/**` — the non-map screens.
- `src/styles/**` — ~12 hand-written CSS files (`views.css` is the largest). Art
  direction: **dark / gold / antique**. Design tokens live in `variables.css`.

## What you may change vs. what is off-limits

**You may freely edit:**
- `src/game/map/**` — the renderer and procedural cosmetics.
- `src/components/**` — React UI.
- `src/styles/**` — CSS.
- `src/assets/**` — UI images.

**Do NOT change without explicit written sign-off:**
- `src/game/core/**` — game state, mechanics, balance, the tick loop.
- `src/game/data/**` — buildings, upgrades, myths, world content & numbers.

Golden rule: **rendering and UI consume game state read-only.** Never mutate `state` from
draw code. If you think a visual change requires a logic change, ask first.

## Conventions

- Keep the **dark / gold / antique** look unless a change is agreed in advance.
- Hold the frame rate. If a new effect is expensive, cache it (the renderer already caches
  glow sprites in offscreen canvases — follow that pattern) or gate it by quality.
- Keep `npm test` green; if you change procedural layout, run the map tests.
- Match the style of the file you're editing (the render files use `/* eslint-disable */`
  on purpose — they're hot, hand-tuned code).

## Delivering work

1. Branch off `main`: `git checkout -b visual/<short-name>`.
2. Commit focused changes; **open a Pull Request** — do not push to `main`.
3. In the PR, include **before/after screenshots or a short clip**, and note any
   performance impact.
4. All delivered work is the project owner's (work-for-hire); provide source files for any
   produced assets.
