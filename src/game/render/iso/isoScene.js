/* ============================================================================
 * isoScene.js — Scène PixiJS isométrique (impératif), Phase 2.
 *
 *   Pixi est piloté en mode IMPÉRATIF (créé dans un useEffect, jamais reconstruit
 *   par React) : plus simple à déboguer et plus stable pour un jeu à boucle de
 *   rendu. React ne fait qu'héberger le <canvas> ; tout le dessin vit ici.
 *
 *   Phase 2 = une GRILLE iso de sol (greybox) + une CAMÉRA pan/zoom. Toujours
 *   aucune donnée de jeu ni bâtiment (Phase 3). On doit pouvoir se balader et
 *   zoomer sur une grille vide.
 * ========================================================================== */

import { Application, Container, Graphics, TextureSource } from "pixi.js";
import { TILE_W, TILE_H, gridToScreen } from "./isoProjection.js";
import { createIsoCamera } from "./isoCamera.js";

const BG_COLOR = 0x0d1018;     // bleu nuit canonique (cohérent avec l'ambiance)
const GROUND_A = 0x161c28;     // damier sombre (case paire)
const GROUND_B = 0x1b2230;     // damier sombre (case impaire) — lit le relief iso
const GRID_LINE = 0x2a3346;    // joint discret entre tuiles
const ORIGIN_EDGE = 0xd6a84b;  // or canonique : tuile centrale repère

const GRID_N = 16;             // grille N×N (greybox)

// Sommets d'un losange iso centré sur (x,y).
function diamond(x, y) {
  return [x, y - TILE_H / 2, x + TILE_W / 2, y, x, y + TILE_H / 2, x - TILE_W / 2, y];
}

/**
 * Monte une scène iso dans `host` (un élément DOM dimensionné).
 * @returns {Promise<{ destroy: () => void }>}
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

  // Rendu À LA DEMANDE : une carte quasi statique ne doit pas re-rendre 60 fps
  // (contrainte perf du projet). On arrête la boucle continue de Pixi ; chaque
  // changement (resize, pan, zoom) appelle render() une fois.
  app.ticker.stop();
  const render = () => app.render();

  // Conteneur « monde » : la caméra agit sur sa position/échelle.
  const world = new Container();
  app.stage.addChild(world);

  // Sol : grille N×N de tuiles iso, en damier, batchée dans un seul Graphics.
  const ground = new Graphics();
  for (let row = 0; row < GRID_N; row += 1) {
    for (let col = 0; col < GRID_N; col += 1) {
      const { x, y } = gridToScreen(col, row);
      ground
        .poly(diamond(x, y))
        .fill({ color: (col + row) % 2 === 0 ? GROUND_A : GROUND_B })
        .stroke({ width: 1, color: GRID_LINE, alpha: 0.6 });
    }
  }
  world.addChild(ground);

  // Tuile centrale repère (orientation) : arête or + point d'ancrage.
  const cCol = Math.floor(GRID_N / 2);
  const cCenter = gridToScreen(cCol, cCol);
  const origin = new Graphics()
    .poly(diamond(cCenter.x, cCenter.y))
    .stroke({ width: 2, color: ORIGIN_EDGE, alpha: 0.9 });
  origin.circle(cCenter.x, cCenter.y, 2).fill({ color: ORIGIN_EDGE });
  world.addChild(origin);

  // Caméra : pan (glisser) + zoom (molette), rendu à la demande.
  const camera = createIsoCamera({ host, world, render, initialZoom: 0.5 });
  // Vue initiale centrée sur le milieu géométrique de la grille.
  camera.centerOn(0, ((GRID_N - 1) * TILE_H) / 2);

  // Resize : le renderer suit (resizeTo) ; on garde le pan/zoom courant, on rend.
  const ro = new ResizeObserver(render);
  ro.observe(host);

  let destroyed = false;
  // Internes exposés : le hôte React pose la poignée de debug `window.__iso`
  // uniquement sur la scène CONSERVÉE (jamais une scène annulée par StrictMode),
  // et ces refs serviront aux phases suivantes.
  return {
    app, world, ground, camera, render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      camera.destroy();
      ro.disconnect();
      // removeView:true retire le <canvas> du DOM ; children:true détruit la scène.
      app.destroy(true, { children: true });
    }
  };
}
