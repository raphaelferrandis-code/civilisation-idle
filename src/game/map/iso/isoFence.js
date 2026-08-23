// LES CLÔTURES — ce qui borde un lot, et la BANDE qui les blitte d'un coup.
//
// Extraites d'isoRenderer.js le 2026-08-23 (Q10). Deux bandeaux du fichier, un seul
// sujet : la pose (quelles arêtes portent une clôture, à quelle ère) et la
// COMPOSITION — `per` panneaux cuits UNE FOIS dans un canevas hors écran, mis en
// cache par (côté, ère, nombre), puis blittés en un seul drawImage. Répéter le
// panneau AU DESSIN coûtait +17 ms sur 955 items ; c'est mesuré, pas supposé.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, deux sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ ELLES ATTENDAIENT LE TISSU URBAIN. Leur seule dépendance entrante vers le
// peintre était `COUR` — partie le même jour dans isoTissu.js. Encore un gros bloc
// libéré par une feuille, pas par un effort sur le bloc lui-même.
//
// ⚠ La RÈGLE de pose vit dans `fenceEdges.js` (module pur, aucun import), partagée
// avec le compteur de `tissuMetrics`. Ici, seulement le RENDU.
import { CM } from '../layout.js';
import { depthOf, ISO_X, ISO_Y } from './projection.js';
import { isoArt } from './isoArt.js';
import { COUR } from './isoTissu.js';
import { plazaEraForBand, personHT, inkBox } from './isoPlaza.js';
import { fenceEdges, fenceInputs, FENCE } from '../fenceEdges.js';

// ── CLÔTURES (lot L9, docs/PLAN-TISSU-URBAIN.md) ────────────────────────────
// L'art était livré depuis le 2026-07-30 et la règle de pose écrite ET testée
// (`fenceEdges.js`) : il ne manquait que ce branchement. Le compteur exigé par le plan
// est arrivé avant (`__tissu().fences`) et il a levé le doute — 90 arêtes à la
// bande 3, 563 à la bande 7, pour un plafond de 4 000.
//
// ⚠ PASSE VIVANTE, JAMAIS LA CUISSON DU SOL. Une clôture est sur une ARÊTE, donc à
// cheval sur deux cellules, et un décor à cheval cuit dans le sol se fait rogner au
// défilement — c'est le refus tombé sept fois sur la jonction herbe/ville. Poussée
// ici comme les lampadaires, le problème n'existe pas.
//
// ⚠ AUCUNE BRANCHE DE DESSIN À ÉCRIRE. Les PNG vivent dans `iso/plaza/`, donc
// `propImage` les résout depuis (prop `fence`, variant = côté, ère) et
// `drawIsoPlazaProp` les blitte : même art et même tri que les bancs, exactement ce
// que le plan annonçait (« même pipeline que les bancs »).
//
// `p` = hauteur en fraction d'HABITANT, l'étalon du mobilier de place. Un garde-corps
// arrive à la taille — pas un mur, pas une palissade.
// Molette : `__fences(false)` éteint, `__fences({ p: 0.7 })` règle.
// ✅ **ALLUMÉ le 2026-08-06, après la composition en BANDES.** Historique des trois
// étapes, parce que chacune a corrigé la précédente et que le chemin compte :
//
// Étape 1, un panneau par arête : ça ne ferme pas la ligne, et c'est de
// l'arithmétique, pas un réglage.
//   arête de cellule à l'écran : hypot(32, 16) = 35,8 px à zoom 1
//   encre du sprite            : 21 px de large (canvas 34×34, encre 21×31)
// Il restait ~11 px de vide entre deux voisins, et les panneaux se lisaient comme des
// BLOCS DE PIERRE ABANDONNÉS sur le sable — y compris centré sur la plus longue suite
// contiguë (13 arêtes). `minRun` écarte les isolés (92 → 68 poses à 3) sans rien fermer.
//
// Étape 2, RÉPÉTER le panneau le long de l'arête (`per`, calculé) : ✅ visuellement
// c'est LA solution. Le garde-corps devient une ligne continue qui suit la berge,
// exactement ce que le plan décrivait. Et il n'a pas fallu découper le sprite : la
// palissade est faite de planches verticales uniformes, le panneau entier se répète
// sans couture, donc pas de poteau d'about doublé (la crainte du plan).
//
// ⛔ MAIS LE COÛT NE PASSE PAS. Profilé à zoom 1, caméra épinglée sur la berge, A/B
// rejoué dans les deux sens (un seul sens ne prouve rien) :
//   sans clôtures : 56,0 ms puis 53,6 ms rejoué   ·   0 dessinée
//   avec          : 72,3 ms                        ·   955 dessinées
// Soit **+17 ms, ~+30 % de la frame** pour 955 items. (Valeurs absolues gonflées par
// la pane, cf. PERF-CARTE-REPRISE §7 — c'est la PROPORTION qui compte.) La cause est
// mécanique : 7 panneaux par arête, parce que chaque panneau est minuscule.
//
// Étape 3, la DÉCOUPE (intuition de Raph, et la mesure a dit pourquoi) : ne pas
// répéter le panneau AU DESSIN mais composer la ligne UNE FOIS dans un canevas hors
// écran — même geste que l'aqueduc modulaire et que le bake des quais — puis blitter
// UNE bande par arête. Le tri peintre garde sa granularité par cellule.
// ✅ Coût après composition, A/B rejoué TROIS fois, caméra épinglée :
//   sans 78,4 / 71,7 / 65,8 ms   ·   avec 86,7 / 67,2 / 69,9 ms  (108 clôtures)
// Écart moyen +2,6 ms pour une variance de ±8, et un tour sur trois donne les
// clôtures PLUS RAPIDES : c'est dans le bruit. On passe de +17 ms à indétectable.
//
// ⚠ Le parvis des merveilles a été COUPÉ (`FENCE.wonders = false`) : ses arêtes
// qualifient mais tombent en plein pavé ouvert, sans rien à border, et se lisent comme
// des blocs abandonnés. Le quai et la berge bâtie longent l'eau — là c'est une ligne.
//
// `p` = hauteur en fraction d'HABITANT, l'étalon du mobilier de place.
// `minRun` = longueur minimale d'une suite d'arêtes contiguës.
// Molette : `__fences(false)` éteint, `__fences({ p, minRun })` règle.
// ⚠ `minRun` REMIS À 1 le 2026-08-06, quand les quais ont été abandonnés au profit
// des places et des parvis. Il avait été posé à 3 pour écarter les panneaux isolés
// d'une berge ; sur une ENCEINTE il est nocif — un anneau TOURNE, donc chaque côté ne
// fait que 3 ou 4 cellules et le filtre lui coupe les coins. Le laisser à 3 vidait la
// ceinture d'une place de ses angles, et ce qui restait se lisait comme des débris.
export const FENCE_ISO = { on: true, p: 0.62, minRun: 1 };
const NO_FENCES = [];

// ── LA BANDE : `per` panneaux composés UNE FOIS, blittés en UN drawImage ────────
// C'est la « découpe » du plan, et la mesure a dit pourquoi elle est nécessaire :
// répéter le panneau AU DESSIN coûtait +17 ms (955 items, ~+30 % de frame).
// Ici la répétition est cuite dans un canevas hors écran, mis en cache par
// (côté, ère, nombre) — il y en a au plus 4 × 5 × quelques valeurs de `per`.
//
// ⚠ LE SENS DE LA DIAGONALE N'EST PAS LE MÊME DES DEUX CÔTÉS. Une arête n/s avance
// en +x dans le monde, soit (+2, +1) à l'écran ; une arête e/w avance en +y, soit
// (−2, +1). Composer les deux dans le même sens collerait la moitié des clôtures
// à contresens de leur berge.
//
// ⚠ On compose à la RÉSOLUTION NATIVE du sprite (jamais à l'échelle écran) : la bande
// est alors indépendante du zoom, et un seul canevas sert à tous les zooms — sinon on
// recuirait à chaque cran, exactement le point noir du sol.
const _fenceStrips = new Map();
export function fenceStrip(side, era, per) {
  const key = side + ':' + era + ':' + per;
  const hit = _fenceStrips.get(key);
  if (hit !== undefined) return hit;
  const art = isoArt('plaza/fence-' + side + '-' + era);
  if (!art.ready || !art.img) return null;            // pas décodé : on NE met pas en cache
  const bb = inkBox(art.img);
  if (!bb || !bb.w || !bb.h) return null;
  const step = bb.w;                                  // les panneaux s'aboutent
  const drop = step * (ISO_Y / ISO_X);                // la marche de la diagonale
  const right = side === 'n' || side === 's';         // sens d'avance à l'écran
  const cw = Math.max(1, Math.round(per * step));
  const ch = Math.max(1, Math.round((per - 1) * drop + bb.h));
  const c = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(cw, ch)
    : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < per; i += 1) {
    // Le premier panneau est en HAUT de la bande (il est le plus au nord) ; les
    // suivants descendent. Horizontalement ils partent de la gauche pour n/s et de
    // la droite pour e/w.
    const dx = right ? i * step : (cw - bb.w - i * step);
    const dy = i * drop;
    g.drawImage(art.img, bb.x0, bb.y0, bb.w, bb.h, Math.round(dx), Math.round(dy), bb.w, bb.h);
  }
  const rec = { canvas: c, cw, ch, panelH: bb.h, per, right };
  _fenceStrips.set(key, rec);
  return rec;
}
let _fenceCache = { key: '', list: null };
export function isoFencesFor(L, band) {
  const era = plazaEraForBand(band);
  if (!L || !FENCE_ISO.on || !FENCE.on || !era) return NO_FENCES;
  const key = CM.layoutRecomputeAt + ':' + band + ':' + FENCE_ISO.p
    + ':' + FENCE_ISO.minRun + ':' + (COUR.on ? 1 : 0) + ':' + FENCE.cap;
  if (_fenceCache.key === key && _fenceCache.list) return _fenceCache.list;
  const T = CM.TILE;
  const hT = personHT() * FENCE_ISO.p;
  const list = [];
  // ⚠ Les entrées viennent de `fenceInputs`, jamais d'un `matOf` local : le compteur
  // et la pose doivent voir la MÊME carte de matières, sinon `__tissu()` annonce un
  // nombre qui n'est pas celui des panneaux dessinés. Une copie a déjà dérivé ici.
  const brutes = fenceEdges(fenceInputs(L));
  // FILTRE DE LIGNE (cf. FENCE_ISO.minRun). Une arête ne se garde que si elle
  // appartient à une suite contiguë assez longue, le long de SON axe : les côtés
  // n/s se suivent en gx à gy fixe, les côtés e/w en gy à gx fixe.
  let edges = brutes;
  if (FENCE_ISO.minRun > 1) {
    const vues = new Set();
    for (const e of brutes) vues.add(e.side + ':' + e.gx + ':' + e.gy);
    const long = (e) => {
      const horiz = e.side === 'n' || e.side === 's';
      let n = 1;
      for (const dir of [-1, 1]) {
        let gx = e.gx, gy = e.gy;
        for (;;) {
          if (horiz) gx += dir; else gy += dir;
          if (!vues.has(e.side + ':' + gx + ':' + gy)) break;
          n += 1;
        }
      }
      return n;
    };
    edges = brutes.filter((e) => long(e) >= FENCE_ISO.minRun);
  }
  // COMBIEN DE PANNEAUX PAR ARÊTE. C'est ici que se joue la continuité, et ça se
  // calcule au lieu de se deviner : une arête de cellule mesure hypot(hw, hh) px à
  // l'écran, un panneau en mesure `hT × T × (largeur d'encre / hauteur d'encre)`.
  // Un seul panneau par arête laissait 11 px de vide — le défaut vu en capture.
  //
  // ⚠ Pas besoin de DÉCOUPER le sprite : la palissade est faite de planches
  // verticales uniformes, donc le panneau entier se répète sans couture visible. La
  // découpe en 3 tranches (comme l'aqueduc) ne servirait qu'à éviter des poteaux
  // d'about répétés — or ce panneau n'en a pas, ses bords sont des planches.
  const FENCE_INK = 21 / 31;                       // encre mesurée sur les 20 PNG
  const edgePx = Math.hypot(T * ISO_X, T * ISO_Y); // longueur d'une arête, à zoom 1
  const panelPx = Math.max(1, hT * T * FENCE_INK);
  const per = Math.max(1, Math.min(10, Math.ceil(edgePx / panelPx)));
  for (const e of edges) {
    // UNE fiche par arête, pas une par panneau : la répétition est CUITE dans la
    // bande (cf. `fenceStrip`). La profondeur se prend au MILIEU de l'arête, plus
    // représentative que son coin, et chaque arête trie donc pour elle-même — le
    // peintre garde sa granularité par cellule.
    const horiz = e.side === 'n' || e.side === 's';
    const sx = e.gx + (e.side === 'e' ? 1 : 0);            // coin de DÉPART de l'arête
    const sy = e.gy + (e.side === 's' ? 1 : 0);
    const mx = (sx + (horiz ? 0.5 : 0)) * T;
    const my = (sy + (horiz ? 0 : 0.5)) * T;
    list.push({
      kind: 'fence', side: e.side, per, hT,
      wx: sx * T, wy: sy * T,                              // ancre = coin de départ
      d: depthOf(mx, my),
    });
  }
  _fenceCache = { key, list };
  CM._fences = list;
  if (typeof window !== 'undefined') window.__fencesCount = list.length;
  return list;
}
if (typeof window !== 'undefined') {
  window.__fences = (arg) => {
    if (arg === false) FENCE_ISO.on = false;
    else if (arg && typeof arg === 'object') { FENCE_ISO.on = true; Object.assign(FENCE_ISO, arg); }
    else FENCE_ISO.on = true;
    _fenceCache = { key: '', list: null };
    return { ...FENCE_ISO, poses: window.__fencesCount | 0, dessinees: CM._fencesDrawn | 0 };
  };
}
