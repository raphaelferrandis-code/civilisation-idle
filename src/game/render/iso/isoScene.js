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

import { Application, Container, Graphics, Sprite, Assets, TextureSource } from "pixi.js";
import { TILE_W, TILE_H, gridToScreen } from "./isoProjection.js";
import { createIsoCamera } from "./isoCamera.js";
import { computeCityGrid, roadGridCells } from "./cityLayout.js";
import { tileStyle, tileKey } from "./tileStyle.js";

const BG_COLOR = 0x0d1018;     // bleu nuit canonique (cohérent avec l'ambiance)
const GROUND_EARTH = 0x3b3326; // sol procédural (fallback) — terre chaude
const ROAD_PAVE = 0x9a8f78;    // chaussée pavée pierre claire
const ROAD_EDGE = 0x6b6253;    // liseré de chaussée

const GRID_N = 24;             // grille N×N — capacité du plan de ville
const BLOCK = 4;               // rue tous les 4 cases → îlots de 3×3 bâtissables

// Dossier des sprites de bâtiments (servi par Vite en dev et l'app en prod). Un
// bâtiment a un sprite si public/iso/<tileKey>.png existe (ex. "market_t2.png") ;
// sinon on retombe sur la boîte greybox. C'est le « simple branchement » Phase 7.
const SPRITE_BASE = import.meta.env.BASE_URL + "iso/";
const SPRITE_SCALE = 1.15;     // multiplicateur de présence (largeur normalisée à TILE_W)

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

  // Cases-route (quadrillage) — statiques, calculées une fois.
  const roadCells = roadGridCells(GRID_N, BLOCK);

  // Sol + routes. Reconstruit quand la tuile de sol (chargement async) arrive.
  const groundLayer = new Container();
  world.addChild(groundLayer);

  function buildGround() {
    for (const c of groundLayer.removeChildren()) c.destroy();
    const gtex = ensureTexture("ground_t2");
    // 1) Sol partout : sprite de tuile si dispo, sinon losange procédural (terre).
    for (let row = 0; row < GRID_N; row += 1) {
      for (let col = 0; col < GRID_N; col += 1) {
        const { x, y } = gridToScreen(col, row);
        if (gtex.state === "ok" && gtex.tex) {
          const s = new Sprite(gtex.tex);
          s.anchor.set(0.5, 0.5);
          s.position.set(x, y);
          s.scale.set(TILE_W / s.texture.width);
          groundLayer.addChild(s);
        } else {
          const g = new Graphics();
          const f = (col + row) % 2 === 0 ? 1 : 0.88;
          g.poly(groundDiamond(x, y)).fill({ color: shade(GROUND_EARTH, f) });
          groundLayer.addChild(g);
        }
      }
    }
    // 2) Routes : chaussée pavée sur les cases-rue. Les losanges contigus forment
    //    des rues continues automatiquement (raccord parfait, zéro couture).
    const roadG = new Graphics();
    for (const key of roadCells) {
      const [col, row] = key.split(",").map(Number);
      const { x, y } = gridToScreen(col, row);
      roadG.poly(groundDiamond(x, y)).fill({ color: ROAD_PAVE }).stroke({ width: 1, color: ROAD_EDGE, alpha: 0.5 });
    }
    groundLayer.addChild(roadG);
  }

  // Bâtiments : un conteneur d'objets (Sprite si le PNG existe, sinon boîte
  // greybox), ré-empilés à chaque changement dans l'ordre peintre (profondeur).
  const buildingsG = new Container();
  world.addChild(buildingsG);

  // Cache de textures par clé tileKey (ex. "market_t2"). États : "pending" (en
  // cours), "ok" (texture prête), "missing" (404 → fallback greybox). Chaque clé
  // n'est tentée qu'une fois ; quand une texture arrive, on replanifie un rendu.
  const texCache = new Map();
  function ensureTexture(key) {
    let e = texCache.get(key);
    if (e) return e;
    e = { state: "pending", tex: null };
    texCache.set(key, e);
    const url = SPRITE_BASE + key + ".png";
    // Le serveur de dev Vite renvoie index.html (200, text/html) pour un fichier
    // absent : on vérifie donc le content-type AVANT de décoder, sinon Pixi
    // essaierait de parser du HTML comme image. Pas d'image → fallback greybox.
    fetch(url)
      .then((r) => {
        const ct = r.headers.get("content-type") || "";
        if (!r.ok || !ct.startsWith("image")) { e.state = "missing"; return; }
        return Assets.load(url).then((tex) => { e.state = "ok"; e.tex = tex; scheduleRedraw(); });
      })
      .catch(() => { e.state = "missing"; });
    return e;
  }

  // Anti-rafale : plusieurs textures qui arrivent → un seul redraw groupé.
  let redrawQueued = false;
  function scheduleRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    queueMicrotask(() => { redrawQueued = false; buildGround(); redraw(); });
  }

  buildGround();   // sol + routes (statiques) ; reconstruit quand la tuile de sol arrive

  // État de rendu : dernier modèle reçu + override de palier (debug « avancer d'un
  // palier »). Palier effectif = override s'il existe, sinon celui du modèle.
  let lastModel = null;
  let tierOverride = null;
  const effectiveTier = () => tierOverride ?? lastModel?.era?.tier?.index ?? 1;

  function redraw() {
    for (const c of buildingsG.removeChildren()) c.destroy();
    if (lastModel && lastModel.buildings && lastModel.buildings.length) {
      const tier = effectiveTier();
      const { placements } = computeCityGrid(lastModel, { gridN: GRID_N, block: BLOCK });
      for (const p of placements) {
        const key = tileKey(p.kind, tier);
        const t = ensureTexture(key);
        if (t.state === "ok" && t.tex) {
          const { x, y } = gridToScreen(p.col, p.row);
          const s = new Sprite(t.tex);
          s.anchor.set(0.5, 1);                // ancre bas-centre (pied du bâtiment)
          s.position.set(x, y + TILE_H / 2);   // posé sur la pointe basse du losange
          // Normalise la largeur à la tuile (tailles natives mixtes : iso-tile
          // 64 px, map-object 112 px → même empreinte au sol).
          s.scale.set((TILE_W / s.texture.width) * SPRITE_SCALE);
          buildingsG.addChild(s);
        } else {
          const g = new Graphics();
          drawBuilding(g, p.col, p.row, p.kind, tier);  // fallback greybox
          buildingsG.addChild(g);
        }
      }
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
    app, world, groundLayer, buildingsG, camera, render, setModel, setTierOverride,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      camera.destroy();
      ro.disconnect();
      app.destroy(true, { children: true });
    }
  };
}
