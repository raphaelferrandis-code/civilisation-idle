/* ============================================================================
 * isoScene.js — Scène PixiJS isométrique (impératif), Phase 4.
 *
 *   Pixi est piloté en mode IMPÉRATIF (créé dans un useEffect, jamais reconstruit
 *   par React) : plus simple à déboguer et plus stable pour un jeu à boucle de
 *   rendu. React ne fait qu'héberger le <canvas> et POUSSER le modèle de rendu.
 *
 *   Phase 3 = poser les BÂTIMENTS (setModel). Phase 4 = leur APPARENCE évolue avec
 *   l'âge : chaque boîte est dessinée via tileStyle(kind, palier). `setTierOverride`
 *   force un palier pour tester le vieillissement (bouton debug). Toujours zéro art.
 * ========================================================================== */

import { Application, Container, Graphics, TextureSource } from "pixi.js";
import { TILE_W, TILE_H, gridToScreen } from "./isoProjection.js";
import { createIsoCamera } from "./isoCamera.js";
import { computeCityPlacements } from "./cityLayout.js";
import { tileStyle } from "./tileStyle.js";

const BG_COLOR = 0x0d1018;     // bleu nuit canonique (cohérent avec l'ambiance)
const GROUND_A = 0x161c28;     // damier sombre (case paire)
const GROUND_B = 0x1b2230;     // damier sombre (case impaire) — lit le relief iso
const GRID_LINE = 0x2a3346;    // joint discret entre tuiles

const GRID_N = 20;             // grille N×N (greybox) — capacité du plan de ville

// Sommets d'un losange iso plein (tuile de sol) centré sur (x,y).
function groundDiamond(x, y) {
  return [x, y - TILE_H / 2, x + TILE_W / 2, y, x, y + TILE_H / 2, x - TILE_W / 2, y];
}

// Assombrit/éclaircit une couleur 0xRRGGBB par un facteur.
function shade(color, f) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// Dessine une boîte iso (cube extrudé) posée AU SOL sur la tuile (col,row), avec
// l'apparence type × palier. Empreinte réduite pour laisser voir le sol autour.
function drawBuilding(g, col, row, kind, tier) {
  const { x, y } = gridToScreen(col, row);
  const { color: base, height: h, foot } = tileStyle(kind, tier);
  const hw = TILE_W * foot, hh = TILE_H * foot;

  // Coins au sol (élévation 0) et coins du toit (élévation h).
  const Bx = x, By = y + hh, Lx = x - hw, Ly = y, Rx = x + hw, Ry = y;
  const Ttx = x, Tty = y - hh - h, Rtx = x + hw, Rty = y - h, Btx = x, Bty = y + hh - h, Ltx = x - hw, Lty = y - h;

  // Face gauche (plus claire), face droite (plus sombre), puis toit (par-dessus).
  g.poly([Lx, Ly, Bx, By, Btx, Bty, Ltx, Lty]).fill({ color: shade(base, 0.62) });
  g.poly([Bx, By, Rx, Ry, Rtx, Rty, Btx, Bty]).fill({ color: shade(base, 0.48) });
  g.poly([Ttx, Tty, Rtx, Rty, Btx, Bty, Ltx, Lty])
    .fill({ color: base })
    .stroke({ width: 1, color: shade(base, 1.25), alpha: 0.45 });
}

/**
 * Monte une scène iso dans `host` (un élément DOM dimensionné).
 * @returns {Promise<{ destroy, setModel, ... }>}
 */
export async function createIsoScene(host) {
  // Pixel art : les futures textures s'échantillonnent au plus proche (pas de flou).
  try {
    TextureSource.defaultOptions.scaleMode = "nearest";
  } catch {
    /* selon la version : ignoré si l'API bouge, sans impact ici */
  }

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: BG_COLOR,
    backgroundAlpha: 1,
    antialias: false,
    roundPixels: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });

  app.canvas.style.display = "block";
  host.appendChild(app.canvas);

  // Rendu À LA DEMANDE : on arrête la boucle continue de Pixi ; chaque changement
  // (resize, pan, zoom, achat) appelle render() une fois. (Contrainte perf projet.)
  app.ticker.stop();
  const render = () => app.render();

  // Conteneur « monde » : la caméra agit sur sa position/échelle.
  const world = new Container();
  app.stage.addChild(world);

  // Sol : grille N×N de tuiles iso en damier, batchée dans un seul Graphics.
  const ground = new Graphics();
  for (let row = 0; row < GRID_N; row += 1) {
    for (let col = 0; col < GRID_N; col += 1) {
      const { x, y } = gridToScreen(col, row);
      ground
        .poly(groundDiamond(x, y))
        .fill({ color: (col + row) % 2 === 0 ? GROUND_A : GROUND_B })
        .stroke({ width: 1, color: GRID_LINE, alpha: 0.6 });
    }
  }
  world.addChild(ground);

  // Bâtiments : un seul Graphics redessiné à l'achat (ordre de dessin = profondeur).
  const buildingsG = new Graphics();
  world.addChild(buildingsG);

  // État de rendu : dernier modèle reçu + override de palier (debug « avancer d'un
  // palier »). Palier effectif = override s'il existe, sinon celui du modèle.
  let lastModel = null;
  let tierOverride = null;
  const effectiveTier = () => tierOverride ?? lastModel?.era?.tier?.index ?? 1;

  function redraw() {
    buildingsG.clear();
    if (lastModel && lastModel.buildings && lastModel.buildings.length) {
      const tier = effectiveTier();
      const placements = computeCityPlacements(lastModel, { gridN: GRID_N });
      for (const p of placements) drawBuilding(buildingsG, p.col, p.row, p.kind, tier);
    }
    render();
  }

  // (Re)construit la ville depuis le modèle de rendu (getCityRenderModel).
  function setModel(model) { lastModel = model; redraw(); }
  // Force un palier visuel (1..5) ; null = palier réel du modèle (debug).
  function setTierOverride(tier) { tierOverride = tier == null ? null : tier; redraw(); }

  // Caméra : pan + zoom. Vue initiale centrée sur la case centrale (cœur de ville).
  const camera = createIsoCamera({ host, world, render, initialZoom: 0.5 });
  const cCol = Math.floor(GRID_N / 2);
  const center = gridToScreen(cCol, cCol);
  camera.centerOn(center.x, center.y);

  // Resize : le renderer suit (resizeTo) ; on garde le pan/zoom courant, on rend.
  const ro = new ResizeObserver(render);
  ro.observe(host);

  let destroyed = false;
  // Internes exposés : le hôte React pose la poignée de debug `window.__iso`
  // uniquement sur la scène CONSERVÉE, pousse le modèle, et réutilise ces refs.
  return {
    app, world, ground, buildingsG, camera, render, setModel, setTierOverride,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      camera.destroy();
      ro.disconnect();
      app.destroy(true, { children: true });
    }
  };
}
