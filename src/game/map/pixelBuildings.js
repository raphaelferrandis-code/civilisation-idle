"use strict";
// Couche pixel-art des bâtiments-moteur (derrière le flag pixelBuildingsFlag).
// DA verrouillée « station qui grandit » (cf cueilleurs). Le sprite = le SITE
// STATIQUE ; le personnage qui marche reste un agent animé séparé (agents.js).
// Repli sur le rendu procédural (engineSprites/cityEngineSprites) si : flag OFF,
// époque cosmique, sprite absent du manifeste, ou pas encore chargé.
//   Clé = <buildingId>-s<stage>-t<tier>  (stage 0-3 = palier d'ère du moteur,
//   tier 0-3 = palier d'achat cmEngineTier). Fichier : /pixelart/buildings/<clé>.png

import { CM } from './layout.js';

export const pixelBuildingsFlag = { on: true };

// Manifeste des sprites RÉELLEMENT présents (étendre au fil des générations) :
// on ne tente de charger QUE ces clés → zéro requête 404 pour les bâtiments
// encore en procédural.
const AVAILABLE = new Set([
  // Approche STATIQUE abandonnée (2026-06-29) : les sprites-bâtiment plats (marchés,
  // guildes, hôtels des monnaies, banques) ont été refusés et supprimés. Tous les
  // bâtiments-moteur passent désormais par la SCÈNE procédurale (props PixelLab +
  // agent animé, cf. cityEngineSprites.js), comme cueilleurs/entrepôts/caravanes.
  // Ce manifeste reste en place (repli/extension futurs) mais est vide pour l'instant.
]);

const cache = new Map();   // clé -> { img, ready }
function ensure(key) {
  let e = cache.get(key);
  if (e) return e;
  e = { img: new Image(), ready: false };
  e.img.onload = () => { e.ready = true; };
  e.img.src = '/pixelart/buildings/' + key + '.png';
  cache.set(key, e);
  return e;
}

const stageOf = (ei) => (ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3);

// Renvoie true si un sprite pixel a été dessiné (→ le procédural est sauté pour
// cette tuile). band/ei viennent de CM.layout.counts (passés par l'appelant).
export function drawPixelBuilding(t, x, y, w, h, now, band, ei) {
  if (!pixelBuildingsFlag.on || band >= 7) return false;
  const id = t.buildingId || t.variant;
  const key = id + '-s' + stageOf(ei) + '-t' + (t.tier || 0);
  if (!AVAILABLE.has(key)) return false;
  const e = ensure(key);
  if (!e.ready) return false;               // pas encore chargé → procédural cette frame
  const ctx = CM.ctx;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;        // pixel net (pas de lissage bilinéaire)
  ctx.drawImage(e.img, x, y, w, h);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Dev : bascule le rendu pixel des bâtiments. __pixelBuildings(false) → procédural.
if (typeof window !== 'undefined') {
  window.__pixelBuildings = (on) => { pixelBuildingsFlag.on = on !== false; return pixelBuildingsFlag.on; };
}
