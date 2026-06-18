/* ============================================================================
 * isoScene.js — Scène PixiJS isométrique (impératif), Phase 1.
 *
 *   Pixi est piloté en mode IMPÉRATIF (créé dans un useEffect, jamais reconstruit
 *   par React) : plus simple à déboguer et plus stable pour un jeu à boucle de
 *   rendu. React ne fait qu'héberger le <canvas> ; tout le dessin vit ici.
 *
 *   Phase 1 = prouver la chaîne : une Application Pixi pixel-perfect + UNE tuile
 *   iso losange au centre. Pas de données de jeu, pas de caméra (Phase 2), pas de
 *   bâtiments (Phase 3). Juste : « le nouveau monde s'affiche, net ».
 * ========================================================================== */

import { Application, Container, Graphics, TextureSource } from "pixi.js";

// Ratio iso classique 2:1. Taille de référence pour Phase 1 — la taille de tuile
// définitive sera figée au manifeste (Phase 5).
export const TILE_W = 128;
export const TILE_H = 64;

const BG_COLOR = 0x0d1018;     // bleu nuit canonique (cohérent avec l'ambiance)
const TILE_FILL = 0x1b2230;    // sol sombre
const TILE_EDGE = 0xd6a84b;    // or canonique : l'arête du losange

/**
 * Monte une scène iso dans `host` (un élément DOM dimensionné).
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function createIsoScene(host) {
  // Pixel art : les futures textures s'échantillonnent au plus proche (pas de flou).
  try {
    TextureSource.defaultOptions.scaleMode = "nearest";
  } catch {
    /* selon la version : ignoré si l'API bouge, sans impact en Phase 1 */
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
  // (contrainte perf du projet). On arrête la boucle continue de Pixi et on rend
  // explicitement quand quelque chose change (init, resize, et plus tard caméra).
  app.ticker.stop();
  const render = () => app.render();

  // Conteneur « monde » : tout le contenu de la ville y vivra (future caméra).
  const world = new Container();
  app.stage.addChild(world);

  // Une tuile iso losange centrée sur (0,0), ancrée en son centre.
  const tile = new Graphics()
    .poly([0, -TILE_H / 2, TILE_W / 2, 0, 0, TILE_H / 2, -TILE_W / 2, 0])
    .fill({ color: TILE_FILL, alpha: 0.92 })
    .stroke({ width: 2, color: TILE_EDGE, alpha: 0.9 });
  // Point repère au centre (le futur point d'ancrage « pied de tuile »).
  tile.circle(0, 0, 2).fill({ color: TILE_EDGE });
  world.addChild(tile);

  // Recentre le monde dans le host (indépendant du timing du renderer) et rend.
  const layout = () => {
    world.position.set(host.clientWidth / 2, host.clientHeight / 2);
    render();
  };
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(host);

  // Poignée de debug (dev uniquement) : inspection de la scène depuis la console
  // ou les outils de preview, utile pour vérifier chaque phase sans screenshot.
  if (import.meta.env && import.meta.env.DEV && typeof window !== "undefined") {
    window.__iso = { app, world, tile, render };
  }

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ro.disconnect();
      if (typeof window !== "undefined" && window.__iso && window.__iso.app === app) {
        delete window.__iso;
      }
      // removeView:true retire le <canvas> du DOM ; children:true détruit la scène.
      app.destroy(true, { children: true });
    }
  };
}
