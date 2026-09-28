// LE FOYER DU CAMPEMENT — validé par Raph le 2026-09-28.
//
// Un feu commun au cœur du camp de tentes (bande 0), posé là où les sentiers se
// rejoignent (cf. CAMP_HEARTH et `campHearth` dans layout.js). Art EXISTANT,
// aucune génération : le sol du foyer des Conteurs et sa bande de flamme animée
// (`storyteller-fire`, 7 images de 96×80, alignées pixel pour pixel sur le sol).
// Retirés des Conteurs le 2026-08-05 parce qu'une scène plate ne faisait pas un
// bâtiment ; un feu au sol, lui, est plat par nature.
// ⚠ Le sol est `camp-hearth.png`, COPIE de `storyteller-back.png` SANS le livre
// ouvert (demande de Raph) : 209 px repeints dans x 37..56, y 57..68 — terre
// claire unie en haut, motif du bord recopié des flancs en bas. L'original des
// Conteurs reste intact sur le disque. Encre inchangée (81 px de large).
// ⚠ La flamme est `camp-hearth-fire.png`, COPIE NETTOYÉE de `storyteller-fire`
// (Raph, 2026-09-28 : « clean et pas des pixels perdus ») : le BLOC rouge sombre
// coiffé d'un rebord gris droit qui dépassait derrière la flamme est remplacé
// par le disque de terre, et les étincelles détachées sont retirées. Refaite par
// `scripts/pixelsPerdus.mjs --apply` ; l'original reste intact.
//
// ⚠ GRAIN ÉGALISÉ (docs/PLAN-EGALISATION-GRAIN.md) : un pixel du foyer vaut un
// pixel de tente à l'écran. Les habitations sont mises à l'échelle
// k = unité / HOUSE_UNIT, avec unité = largeur du lot (0,78 × losange) ; le
// foyer prend le même k, d'où ~1,4 tuile de large pour ses 81 px d'encre.
import { worldToScreen, ISO_X } from './projection.js';
import { drawIsoGroundedArt } from './isoGroundProps.js';
import { HOUSE_UNIT, HOUSE_LOT_WF } from '../spriteScale.js';
import { queueFlameGlow, FLAME_COL } from '../flameGlow.js';
import { CM } from '../layout.js';

const BASE = '/pixelart/agents/buildings/';
const FIRE_FRAME_W = 96, FIRE_FRAME_H = 80, FIRE_FRAMES = 7;
const FIRE_FRAME_MS = 120;
const HEARTH_INK_W = 81;       // encre mesurée de camp-hearth.png (sur 96)

const art = {};
function hearthArt(name) {
  let e = art[name];
  if (!e) {
    e = art[name] = { img: null, ready: false, bbox: null };
    if (typeof Image !== 'undefined') {
      const im = new Image();
      im.onload = () => { e.img = im; e.ready = true; };
      im.src = BASE + name + '.png';
    }
  }
  return e;
}

export function drawIsoCampHearth(ctx, wx, wy, T, z, now) {
  const ground = hearthArt('camp-hearth');
  if (!ground.ready) return;
  const p = worldToScreen(wx, wy);
  // Même k que les habitations : 1 px d'art = (lot 1×1 à 0,78) / HOUSE_UNIT.
  const k = (2 * HOUSE_LOT_WF * T * z * ISO_X) / HOUSE_UNIT;
  const g = drawIsoGroundedArt(ctx, ground, p.x, p.y, HEARTH_INK_W * k);
  if (!g) return;
  // La flamme, image par image, sur la MÊME boîte que le sol (même canvas 96×80).
  // Figée sur l'image 0 quand le joueur coupe la vie de la carte (« aucune »).
  const fire = hearthArt('camp-hearth-fire');
  if (fire.ready) {
    const alive = (CM.ambianceK ?? 1) > 0;
    const f = alive ? Math.floor((now || 0) / FIRE_FRAME_MS) % FIRE_FRAMES : 0;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fire.img, f * FIRE_FRAME_W, 0, FIRE_FRAME_W, FIRE_FRAME_H, g.x, g.y, g.w, g.h);
    ctx.imageSmoothingEnabled = prev;
  }
  // Lueur : déposée au tri peintre (couche de lumière), donc masquée par les
  // tentes qui passent devant. Centre du feu ≈ milieu de l'encre, un peu haut.
  queueFlameGlow(g.x + g.w * 0.5, g.y + g.h * 0.46, g.w * 0.22, FLAME_COL, now, (wx + wy) * 0.013, 1);
}
