# Freelance brief — Visual / rendering polish for an idle game

> Paste this (or parts of it) into your Fiverr job / first message. It's in English to
> widen the pool — translate to French if you're hiring a French-speaking studio.
> The companion file `DEV-ONBOARDING.md` is the technical doc you give once hired.

---

## The project in one paragraph

A finished-and-playable **civilisation idle game** built in **React 19 + Vite**, packaged
as a Windows desktop app via Electron. The centrepiece is a **full-screen procedural city
map rendered entirely in HTML5 Canvas 2D** — the city, river, roads, buildings, walking
citizens, day/night lighting and per-era visual themes are all *drawn in code*, frame by
frame. There are almost no image assets: it's a real-time canvas renderer plus a React/CSS
UI layered on top. The game logic, economy and content are **done and must not change** —
this job is purely about making it **look and feel better**.

## Tech stack

- React 19, Vite (dev server + build), JavaScript (no TypeScript).
- HTML5 **Canvas 2D** for the world (no game engine, no WebGL, no libraries — raw `ctx`).
- CSS (hand-written, ~12 files) for the UI skin. Aesthetic: **dark / gold / antique**.
- Electron for the desktop build. Vitest for tests.
- Code comments are in **French** (the renderer is heavily commented — this is helpful,
  not a blocker; you don't need to write French).

## What the work actually is

Improving an **existing, working** renderer and UI — not building from scratch. The
approach is **hybrid**: keep and push the procedural rendering for the "living" layer, and
integrate a few hand-made hero assets where they count. Examples of tasks (final list TBA):

- Make the canvas city map more beautiful and readable: lighting, colour palettes,
  depth/shading, water and reflections, roads, building silhouettes, night ambience.
  **This atmosphere layer — lighting, motion, reflections — is the biggest lever and is
  not yet maxed out; it's where "beautiful in motion" is won.**
- Smoother **animations and transitions** (agents, camera, era changes, crises).
- **Integrate selected hand-made hero assets** (wonders/monuments, central fire,
  landmarks, UI frames) into the canvas/UI — without breaking the per-era procedural
  theming. (Production of those assets may be a separate small art commission.)
- Polish the **React UI / CSS**: the building shop, HUD, panels, dialogs, era-skin
  transitions — cohesive "dark/gold/antique" look, micro-interactions.
- Keep it all **performant** (see constraints) and consistent across the game's eras.

> **Why hybrid (not full sprites):** the city evolves through ~20 eras, each re-themed
> automatically by the procedural renderer. Replacing buildings with sprites would mean
> drawing every building × every era by hand and would kill that automatic evolution.
> So the base stays procedural; assets are added only for hero elements.

## In scope

- Everything under `src/game/map/**` (the canvas renderer + procedural layout cosmetics).
- Everything under `src/components/**` and `src/styles/**` (React UI + CSS).
- UI image assets under `src/assets/**` if needed.

## Out of scope (do NOT change without written sign-off)

- `src/game/core/**` and `src/game/data/**` — game logic, balance, economy, content.
  The map and UI **read game state, they never modify it.**
- No new heavy dependencies / no rewrite to a game engine or WebGL without prior agreement.

## Hard constraints

- **Performance:** the canvas runs a real-time animation loop. It must hold ~60 fps,
  including on laptops with integrated GPUs. Don't regress frame time. (The codebase
  already caps render DPR and pauses drawing under modals for this reason.)
- **Tests stay green:** `npm test` (Vitest) must keep passing — there are tests guarding
  the procedural map generation.
- **No game-state mutations** from rendering/UI code.
- Match the existing **dark / gold / antique** art direction unless we agree to evolve it.

## What I provide

- Access to the repo on a dedicated branch (you never push to `main`; you open PRs).
- The `DEV-ONBOARDING.md` doc: how to run it, the architecture map, the editable
  boundary, conventions, and the git workflow.
- Reference screenshots and a short list of games whose look I'm aiming for.

## What I require from the dev

- A portfolio with **Canvas / HTML5 / game or interactive visual work** (not logos/flyers).
- Comfort with **raw Canvas 2D rendering** *and* **React + CSS**.
- Able to run a Vite/React repo locally and work from a branch with PRs.
- Cares about performance and writes readable, self-contained changes.

## Process (this protects both of us)

1. **Paid trial task first** — one small, self-contained visual improvement before any
   larger commitment. It tests both quality and collaboration. Candidate trial tasks:
   - Improve the **night lighting / glow** pass on the city map, or
   - Re-skin the **building shop panel** (CSS) to a more polished dark/gold look.
2. **Milestones**, not lump sum up front: e.g. mockup/proposal → implementation → polish.
3. **Branch + Pull Request** for every deliverable; I review before merging.
4. **IP & sources:** all work is mine on delivery (work-for-hire). For any produced
   assets I get the **source files** (`.aseprite/.psd/.svg`), not just exports.

## To apply, please answer (vetting filter)

1. Link 1–2 portfolio pieces that are **Canvas 2D or real-time rendered in the browser**.
2. How would you approach improving the *lighting/atmosphere* of a procedural canvas city
   without hurting frame rate?
3. Are you comfortable working in a French-commented JS codebase (you write code/English)?
4. Rough rate and availability, and whether you're open to a small paid trial task first.
