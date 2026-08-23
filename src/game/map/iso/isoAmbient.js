// L'AMBIANCE — les petits signes de vie posés PAR-DESSUS la ville.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Trois passes légères, réunies par
// ce qu'elles ont en commun : elles ne décident de rien, elles se posent au-dessus
// d'une ville déjà peinte.
//   · les PARTICULES — feuilles, lucioles, motes d'énergie. Champ PROCÉDURAL SANS
//     ÉTAT : chaque particule est une fonction pure de (temps, index), donc rien à
//     faire vivre, rien à resynchroniser après un pan.
//   · la FUMÉE des cheminées d'habitation.
//   · le CHEVRON qui signale un bâtiment neuf, le temps de `REVEAL_PIN_MS`.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, six sortantes. Vérifiée ligne à ligne contre la version
// commitée.
import { CM, cmHash, treeCanvasT } from '../layout.js';
import { worldToScreen, visibleCellBounds } from './projection.js';
import { isoWildForest } from './isoWildForest.js';
import { _frac, _rnd } from './isoMath.js';
import { addGlow } from './isoStreet.js';

// ── PARTICULES D'AMBIANCE (feuilles / lucioles / motes d'énergie) ────────────
// Champ PROCÉDURAL SANS ÉTAT : chaque particule a une position = fonction PURE de
// (now, graine) → aucun tableau qui gonfle, bouclage sans couture, et captures
// REPRODUCTIBLES (même now → même image). Ancré sur la végétation (arbres déco +
// forêt sauvage). Par ère : feuilles qui tombent (jour) + lucioles (nuit) ; à
// l'ère cosmique (band ≥ 7) elles cèdent la place à des MOTES d'énergie montantes.
const AMBIENT = { on: true, leaves: 1, sparks: 1 };
if (typeof window !== 'undefined') {
  window.__ambient = (o) => { if (o) Object.assign(AMBIENT, o); return { ...AMBIENT }; };
}
// Palette de feuilles mortes (ambre/or/rouille + deux verts qui traînent).
const LEAF_COLS = ['196,120,45', '214,158,58', '170,86,38', '150,120,50', '120,150,60'];
// Ancres de végétation visibles (base monde + rayon + graine), plafonnées. Mémoïsé
// par (layout, bornes) : ne se reconstruit qu'au changement de cadrage/plan.
function isoVegAnchors(L, b) {
  const cache = CM._vegAnchors;
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + ':' + b.gx0 + ':' + b.gy0 + ':' + b.gx1 + ':' + b.gy1;
  if (cache && cache.sig === sig) return cache.list;
  const T = CM.TILE, list = [];
  const push = (gx, gy, jx, jy, r) => {
    if (gx < b.gx0 || gx > b.gx1 || gy < b.gy0 || gy > b.gy1) return;
    if (list.length >= 260) return;                 // garde-fou perf
    list.push({ wx: (gx + 0.5 + jx) * T, wy: (gy + 0.9 + jy) * T, r: r || 0.7, s: (cmHash('veg:' + gx + ':' + gy) >>> 0) });
  };
  for (const tr of (L.trees || [])) push(tr.gx, tr.gy, 0, 0, tr.r);
  for (const wt of isoVegForestSample(L, b)) push(wt.gx, wt.gy, wt.jx || 0, wt.jy || 0, wt.r);
  CM._vegAnchors = { sig, list };
  return list;
}
// Sous-échantillon de la forêt (1 arbre sur 2) : assez d'ancres pour la vie, sans
// noyer l'écran ni le coût (la forêt peut compter des centaines d'arbres).
function isoVegForestSample(L, b) {
  const full = isoWildForest(L, b);
  if (full.length <= 130) return full;
  const out = [];
  for (let i = 0; i < full.length; i += 2) out.push(full[i]);
  return out;
}

export function drawIsoAmbient(now) {
  const L = CM.layout;
  if (!L || CM.lodActive || !AMBIENT.on) return;    // pas de particules en vue d'ensemble
  // Vie de la carte (option joueur) : on retire des ANCRES entières, on ne rend
  // pas toutes les particules translucides — une pluie de fantômes est plus
  // fatigante que moins de feuilles, et le contraste de l'image reste intact.
  const ambK = CM.ambianceK ?? 1;
  if (ambK <= 0) return;
  const thin = (a) => ambK >= 1 || (a.s % 1000) / 1000 < ambK;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const band = (L.counts && L.counts.eraBand) | 0;
  const n = CM.nightF || 0;
  const cosmic = band >= 7;
  const b = visibleCellBounds(T * z);
  const anchors = isoVegAnchors(L, b);
  if (!anchors.length) return;
  const t = now || 0;
  const fleck = Math.max(1, Math.round(T * z * 0.05));   // taille d'une feuille (px écran)

  // ── FEUILLES (ères pré-cosmiques, surtout de JOUR) : chute + tangage, fondu aux
  //    deux bouts (naît sous la canopée, disparaît au sol → pas de pop).
  if (!cosmic && AMBIENT.leaves > 0) {
    // BUDGET DE MOUVEMENT : l'œil ne suit que quelques choses à la fois. Quand
    // une nuée traverse, elle prend la vedette et les feuilles s'effacent un peu,
    // sinon les deux couches se concurrencent et l'image devient agitée.
    const leafK = CM._birdsOn ? 0.55 : 1;
    const dayDim = (1 - 0.65 * n) * leafK;               // s'effacent la nuit
    if (dayDim > 0.05) {
      const prevAA = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      for (const a of anchors) {
        if ((a.s % 2) !== 0) continue;                   // ~1 arbre sur 2 perd des feuilles
        if (!thin(a)) continue;
        const p = worldToScreen(a.wx, a.wy);
        const th = T * z * treeCanvasT(a.r);             // hauteur du sprite d'arbre (suit l'ère)
        const topY = p.y - th * 0.78, canW = th * 0.42, fall = th * 1.25;   // tombe JUSQU'AU SOL
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i), sd2 = _rnd(a.s, i + 9);
          const ph = _frac(t / (3800 + sd * 3200) + sd);
          const fade = Math.sin(ph * Math.PI);
          if (fade < 0.06) continue;
          const ly = topY + ph * fall;
          // dérive latérale NETTE (s'éloigne du tronc en tombant) + léger tangage :
          // la feuille quitte la canopée et se lit sur le sol, pas noyée dans le feuillage.
          const drift = (sd2 < 0.5 ? -1 : 1) * ph * canW * 0.9;
          const lx = p.x + (sd - 0.5) * canW * 0.5 + drift + Math.sin(ph * Math.PI * 3 + sd2 * 6.28) * canW * 0.32;
          ctx.fillStyle = `rgba(${LEAF_COLS[(a.s + i) % LEAF_COLS.length]},${(fade * dayDim * AMBIENT.leaves * 0.9).toFixed(3)})`;
          const tumble = _frac(ph * 5) < 0.5;             // bascule 1×2 / 2×1 → chute qui vrille
          ctx.fillRect(Math.round(lx - fleck / 2), Math.round(ly - fleck / 2),
            tumble ? fleck : Math.max(1, Math.round(fleck * 0.6)),
            tumble ? Math.max(1, Math.round(fleck * 0.6)) : fleck);
        }
      }
      ctx.imageSmoothingEnabled = prevAA;
    }
  }

  // ── LUCIOLES (nuit, ères pré-cosmiques) & MOTES D'ÉNERGIE (cosmique, jour+nuit) :
  //    glows additifs. Lucioles = errance en Lissajous + clignotement ; motes = montée.
  const sparksNight = !cosmic && n > 0.18;
  if ((cosmic || sparksNight) && AMBIENT.sparks > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of anchors) {
      if (!thin(a)) continue;
      const p = worldToScreen(a.wx, a.wy);
      const th = T * z * treeCanvasT(a.r);
      if (cosmic) {
        if ((a.s % 3) !== 0) continue;                   // ~1/3 des ancres
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i + 5), sd2 = _rnd(a.s, i + 21);
          const ph = _frac(t / (5000 + sd * 4000) + sd);
          const fade = Math.sin(ph * Math.PI);
          if (fade < 0.05) continue;
          const my = (p.y - th * 0.1) - ph * th * 1.1;   // monte
          const mx = p.x + (sd - 0.5) * th * 0.4 + Math.sin(ph * Math.PI * 2 + sd2 * 6.28) * th * 0.15;
          const col = (a.s + i) & 1 ? '150,230,255' : '200,160,255';   // cyan / magenta
          addGlow(ctx, mx, my, Math.max(2, T * z * 0.09) * (0.8 + 0.4 * fade), col, Math.min(0.7, fade * AMBIENT.sparks * 0.7));
          ctx.fillStyle = `rgba(235,250,255,${(fade * AMBIENT.sparks * 0.85).toFixed(3)})`;
          ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
        }
      } else {
        if ((a.s % 3) !== 1) continue;                   // ~1/3 des ancres
        const hoverY = p.y - th * 0.4, rx = th * 0.32, ry = th * 0.24;
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i + 3), sd2 = _rnd(a.s, i + 17);
          const fx = p.x + Math.sin(t * (0.0007 + sd * 0.0006) + sd * 6.28) * rx;
          const fy = hoverY + Math.cos(t * (0.0009 + sd2 * 0.0006) + sd2 * 6.28) * ry;
          // clignotement DOUX (jamais tout à fait éteint) → une nuée qui scintille
          // en permanence, plus lisible qu'un allumage franc trop épars.
          const bl = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.003 + sd * 0.003) + sd2 * 6.28));
          const a2 = bl * n * AMBIENT.sparks;
          if (a2 < 0.03) continue;
          addGlow(ctx, fx, fy, Math.max(3, T * z * 0.14), '190,235,130', Math.min(0.75, a2 * 0.72));
          ctx.fillStyle = `rgba(228,255,180,${(a2 * 0.9).toFixed(3)})`;
          ctx.fillRect(Math.round(fx), Math.round(fy), fleck > 2 ? 2 : 1, fleck > 2 ? 2 : 1);
        }
      }
    }
    ctx.restore();
  }
}


// ── FUMÉE DE CHEMINÉE (habitations) ─────────────────────────────────────────
// Les bâtiments-moteur fument déjà, mais depuis l'INTÉRIEUR de leurs sprites
// (cityEngineSprites, posés par drawIsoEngineScene) : leur fumée est donc déjà
// triée à la profondeur du bâtiment. Les habitations, elles, sont des PNG sans
// cheminée animée. On leur ajoute un item 'smoke' DANS le tri peintre, à la
// profondeur du bâtiment plus un epsilon : ainsi la colonne passe derrière le
// bâtiment situé au nord au lieu d'être collée en surcouche plein écran, ce qui
// détruirait l'illusion de profondeur que tout le reste du rendu paie cher.
// La fumée d'habitation LEGACY (buildingShapes/renderBuildings) est gardée par
// !usePixelHouse et n'est jamais atteinte en iso : ne pas passer par là.
// Molette : __smoke({ on, share, puffs, rise }).
export const SMOKE_TUNE = { on: true, share: 7, puffs: 4, rise: 1 };
if (typeof window !== 'undefined') {
  window.__smoke = (o) => { if (o) Object.assign(SMOKE_TUNE, o); return { ...SMOKE_TUNE }; };
}

// Une cheminée ne fume que quand la scène le justifie : à la tombée du jour, la
// nuit, ou sous l'averse (il fait froid et humide). En plein midi dégagé, une
// ville entière qui fume est du bruit.
export function smokeSeason() {
  const n = CM.nightF || 0, r = CM.rainF || 0;
  const k = Math.max(n > 0.2 ? (n - 0.2) / 0.5 : 0, r > 0.3 ? (r - 0.3) / 0.5 : 0);
  return Math.min(1, k);
}

export function drawIsoSmoke(box, s, now, k) {
  if (!box) return;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  // Source JUSTE AU-DESSUS du faîte, près de l'axe du sprite. On ne sait pas où
  // est la cheminée dans l'art (ce calibrage par variante reste à faire, cf. la
  // note des fenêtres allumées) : en partant au-dessus du toit plutôt que dessus,
  // la colonne se lit comme « de la fumée au-dessus de cette maison » et non
  // comme une bouffée qui sort du mauvais endroit.
  const ox = box.dx + box.dw * (0.42 + _rnd(s, 11) * 0.16);
  const oy = box.dy - T * z * 0.06;
  const rise = T * z * 1.5 * SMOKE_TUNE.rise;
  const wind = (CM.windX || 0) * 0.6 + 0.12;      // dérive par défaut quand il n'y a pas de vent
  const n = Math.max(1, Math.round(SMOKE_TUNE.puffs));
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i += 1) {
    const sd = _rnd(s, i + 20);
    const ph = _frac((now || 0) / (2600 + sd * 1800) + sd);
    // Naît dense et net, s'élargit et s'efface en montant : une bouffée qui
    // garderait sa taille lirait comme un sprite qui glisse.
    // Décroissance LINÉAIRE et non quadratique : au carré, la bouffée perdait
    // les trois quarts de son opacité sur le premier quart de sa montée et ne
    // se voyait plus du tout sur fond de nuit.
    const fade = (1 - ph) * 0.8 * k;
    if (fade < 0.02) continue;
    // Une bouffée naît à ~1/8 de tuile et triple en montant. Trop petite, elle
    // se confond avec le grain du sprite ; c'est l'écueil dans lequel sont
    // tombées les fenêtres allumées avant d'être retirées.
    const px = Math.max(2, Math.round(T * z * (0.12 + ph * 0.24)));
    const x = ox + wind * rise * ph + Math.sin(ph * 4 + sd * 6.28) * T * z * 0.06;
    const y = oy - ph * rise;
    ctx.fillStyle = `rgba(206,206,200,${fade.toFixed(3)})`;
    ctx.fillRect(Math.round(x - px / 2), Math.round(y - px / 2), px, px);
  }
  ctx.imageSmoothingEnabled = prevAA;
}

// ── CHEVRON « NOUVEAU BÂTIMENT » (A4) ────────────────────────────────────────
// Quand un achat fait sortir une maison-moteur de terre, le runtime estampille la
// tuile (t._revealPinAt, cf. cityMapRuntime). Ici on pose un chevron doré discret
// au-dessus, item du tri peintre à la profondeur du bâtiment (comme la fumée), le
// temps de REVEAL_PIN_MS. AUCUN recadrage caméra : c'est la moitié « pastille
// seule » de la fiche, le vol amorti reste à A9. Vectoriel comme les halos.
export const REVEAL_PIN_MS = 1200;
export function drawIsoRevealPin(box, born, now) {
  if (!box) return;
  const age = (now || 0) - born;
  if (age < 0 || age >= REVEAL_PIN_MS) return;
  // Fondu : montée rapide (~130 ms), plateau, chute douce (~360 ms).
  const a = Math.max(0, Math.min(1, Math.min(age / 130, (REVEAL_PIN_MS - age) / 360)));
  if (a <= 0.02) return;
  const ctx = CM.ctx;
  // Taille indexée sur la largeur RÉELLE du sprite (suit le zoom), bornée pour
  // rester discrète et ne pas écraser une petite maison au dézoom.
  const w = Math.max(4, Math.min(11, box.dw * 0.30));   // demi-largeur du chevron
  const h = w * 1.15;                                    // hauteur (pointe vers le bas)
  const bob = Math.sin(age / 130) * (w * 0.18);          // léger flottement
  const cx = Math.round(box.dx + box.dw / 2);
  const topY = Math.round(box.dy - h - w * 0.5 + bob);   // planant au-dessus du toit
  ctx.save();
  ctx.globalAlpha = a;
  // Chevron plein pointant vers le bas (repère « ici ») + liseré sombre pour le
  // détacher des toits clairs.
  ctx.beginPath();
  ctx.moveTo(cx - w, topY);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,206,84,0.96)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, w * 0.16);
  ctx.strokeStyle = 'rgba(70,46,8,0.85)';
  ctx.stroke();
  ctx.restore();
}

