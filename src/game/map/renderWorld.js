// ⚠ CE FICHIER NE REND PLUS LE MONDE. Étapes 5 et 6 du plan de suppression du
// legacy (2026-08-23) : 2939 → ~735 lignes. Il ne reste que LES QUAIS et LA
// SIMULATION D'ÉMEUTE, tous deux consommés par le peintre iso. Son nom ment
// désormais — son renommage est la question ouverte Q5 du plan.
//
// ✔ LE `/* eslint-disable */` DE TÊTE A ÉTÉ RETIRÉ le 2026-08-23. Il couvrait le
// peintre top-down ; une fois celui-ci parti, ESLint ne signalait plus rien sur
// ce fichier — il le disait lui-même (« unused eslint-disable directive »).
// Le lint MORD donc de nouveau ici : c'est la porte que P24 constatait absente,
// et elle est rendue. Ne pas remettre ce commentaire magique sans raison écrite.
import { state } from '../core/state.js';
import { CM, CM_WONDERS, cmWonderSlot, cmWonderActive, WONDER_CLEAR_R } from './layout.js';
import { CM_DIRS, cityMapWalkRoadKey, roadStepAllowed } from './agents.js';
import { worldToScreen as isoWorldToScreen } from './iso/projection.js';

// Les trois hooks `setPlazaPropOnLoad` / `setMedianOnLoad` / `setRoadPavingOnLoad`
// vivaient ici : ils invalidaient les caches STATIQUE et SOL quand une tuile de
// place, de terre-plein ou de chaussée finissait de décoder. Ces trois caches
// appartenaient au pipeline top-down et n'existent plus. Leurs modules
// (`plazaProps.js`, `pixelMedian.js`, `roadPaving.js`) deviennent orphelins du
// même coup — c'est l'étape 6 qui les supprimera.

/* ---- legacy citymap rendering\draw-utils.js ---- */


/* ============================================================================
 * citymap-draw-utils.js - Petits helpers visuels partages par les renderers.
 *   Pas de boucle, pas de listeners, pas de gros rendu de scene.
 * ============================================================================ */

// `baseColor` et `cmLitColor` vivaient ici. Leurs derniers lecteurs — le bloc LOD
// de `renderBuildings.js` pour l'un, `buildingShapes.js` pour l'autre — sont partis
// à l'étape 6, le 2026-08-23. (Ne pas confondre `cmLitColor` avec
// `CM.cmLitColorStr`, la chaîne que cityMapRuntime publie encore : autre
// identifiant, toujours vivant.)

// Normale unitaire au sample i du fleuve (perpendiculaire à la tangente locale).
// Helper partagé par le fleuve, le gating des quais et le tracé des quais.
// ⚠ MESURÉ, NE PAS « OPTIMISER » : cette fonction est appelée ~15 000 fois par
// frame par `pt()` (tracé des quais) et alloue un {nx,ny} à chaque appel — cible
// évidente. Mémoriser le tableau des normales par layout a été implémenté puis
// RETIRÉ le 2026-07-24 : A/B alterné dans les deux sens, 6,7 ms contre 6,5 ms,
// soit rien. V8 élimine ces objets courts (analyse d'échappement). Le coût des
// quais est la RASTÉRISATION des chemins, pas le JS autour.
function cmRiverNormalAt(sm, i) {
  const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
  return { nx: -ty / tl, ny: tx / tl };
}

// Gating des quais : pour chaque sample du fleuve et chaque rive (+n / -n), la berge
// est-elle "urbaine" (proche d'une route) ? Calculé UNE fois par layout (clé =
// CM.layoutRecomputeAt), jamais par frame. Sert au tracé (cityMapDrawQuays) ET à
// retirer les roseaux sous le quai (boucle roseaux de cityMapDrawRiver).
// NB : gating PUR (urbain ou non) — la décision de dessiner dépend de l'ère/usure,
// évaluée par frame côté appelant (pas figée dans ce cache).
const QUAY_GATE_LAND = 1.0;   // échantillonnage : ~1 tuile au-delà du bord d'eau
// La clé porte le layout ET le mode `full` de la molette : depuis que le masque
// EFFECTIF du quai est calculé ici (cf. plus bas), il dépend de `full`, et un
// cache indexé sur le seul layout aurait servi l'ancien masque après bascule.
const gateKey = () => CM.layoutRecomputeAt + (quayWallTune.full ? ':f' : ':u');
function ensureQuayGate() {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) { CM.quayGate = null; CM.quayBankCells = null; return; }
  if (CM.quayGate && CM.quayGate.key === gateKey()) return;
  const sm = L.river.samples, n0 = sm.length, roadSet = L.roadSet;
  const urbanAt = (px, py) => {
    if (!roadSet) return false;
    const cgx = Math.floor(px), cgy = Math.floor(py);
    for (let dx = -1; dx <= 1; dx += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        if (roadSet.has((cgx + dx) + "," + (cgy + dy))) return true;
    return false;
  };
  const rawPlus = new Uint8Array(n0), rawMinus = new Uint8Array(n0);
  for (let i = 0; i < n0; i += 1) {
    const n = cmRiverNormalAt(sm, i), s = sm[i];
    for (let si = 0; si < 2; si += 1) {
      const side = si ? -1 : 1;
      const ewx = s.x + side * n.nx * s.hw, ewy = s.y + side * n.ny * s.hw;            // bord d'eau peint
      const lndx = ewx + side * n.nx * QUAY_GATE_LAND, lndy = ewy + side * n.ny * QUAY_GATE_LAND; // côté terre
      (si ? rawMinus : rawPlus)[i] = (urbanAt(ewx, ewy) || urbanAt(lndx, lndy)) ? 1 : 0;
    }
  }
  // Lissage : dilatation rayon 1 (continuité) + purge des runs d'un seul sample.
  const smoothSide = (arr) => {
    const d = new Uint8Array(n0);
    for (let i = 0; i < n0; i += 1) d[i] = (arr[i] || (i > 0 && arr[i - 1]) || (i < n0 - 1 && arr[i + 1])) ? 1 : 0;
    let i = 0;
    while (i < n0) {
      if (!d[i]) { i += 1; continue; }
      let j = i; while (j + 1 < n0 && d[j + 1]) j += 1;
      if (j === i) d[i] = 0;   // run d'un seul sample -> off
      i = j + 1;
    }
    return d;
  };
  const plus = smoothSide(rawPlus), minus = smoothSide(rawMinus);
  // Le PORT (seul riverain restant) INTERROMPT le quai sur son emprise : sa
  // scène pose son propre front d'eau (ponton) — la promenade passait dessous.
  // ⚠ La coupe porte sur l'intervalle X de la tuile sans test Y : n'y admettre
  // que de vrais riverains, un moteur terrestre trouerait les deux rives.
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== "river_ports") continue;
    const x0 = t.gx - 0.5, x1 = t.gx + (t.spanX || t.size || 1) + 0.5;
    for (let i = 0; i < n0; i += 1) {
      if (sm[i].x >= x0 && sm[i].x <= x1) { plus[i] = 0; minus[i] = 0; }
    }
  }
  // Cellules couvertes par le quai -> pas de roseaux dessus.
  const bankCells = new Set();
  for (let i = 0; i < n0; i += 1) {
    const n = cmRiverNormalAt(sm, i), s = sm[i];
    for (let si = 0; si < 2; si += 1) {
      if (!(si ? minus : plus)[i]) continue;
      const side = si ? -1 : 1;
      for (const off of [s.hw, s.hw + QUAY_GATE_LAND * 0.5, s.hw + QUAY_GATE_LAND])
        bankCells.add(Math.floor(s.x + side * n.nx * off) + "," + Math.floor(s.y + side * n.ny * off));
    }
  }
  // ── MASQUE EFFECTIF DU QUAI, ET POURQUOI IL VIT ICI ─────────────────────────
  // `plus`/`minus` disent seulement « la berge est-elle urbaine ». Ce que le quai
  // TRACE vraiment, c'est autre chose : en mode `full` il court partout SAUF sous
  // le port, et dans les deux modes il s'efface là où le fleuve est trop étroit
  // et aux deux extrémités. Ce calcul vivait dans cityMapDrawQuays, donc APRÈS le
  // dessin du fleuve dans la frame — inutilisable par le bas-fond du ruban, qui a
  // besoin de savoir où le quai NE trace PAS pour prendre le relais (Raph,
  // 2026-07-30 : « il n'y a plus de quais ni de liseré, ça fait une coupe nette »).
  // Remonté ici, il est calculé une fois par layout et lisible par tout le monde.
  const QUAY_MIN_HW = 1.6, QUAY_END = 3;
  const drawPlus = new Uint8Array(n0), drawMinus = new Uint8Array(n0);
  const naturalOff = new Uint8Array(n0);   // 1 = coupé pour raison NATURELLE (≠ port) → bout carré
  if (quayWallTune.full) {
    drawPlus.fill(1); drawMinus.fill(1);
    for (const t of (L.tiles || [])) {
      if (t.buildingId !== "river_ports") continue;
      const x0 = t.gx - 0.5, x1 = t.gx + (t.spanX || t.size || 1) + 0.5;
      for (let i = 0; i < n0; i += 1) if (sm[i].x >= x0 && sm[i].x <= x1) { drawPlus[i] = 0; drawMinus[i] = 0; }
    }
  } else { drawPlus.set(plus); drawMinus.set(minus); }
  for (let i = 0; i < n0; i += 1) {
    if (sm[i].hw < QUAY_MIN_HW || i < QUAY_END || i >= n0 - QUAY_END) {
      drawPlus[i] = 0; drawMinus[i] = 0; naturalOff[i] = 1;
    }
  }
  // Un run d'UN seul sample ne produit aucun trait (`if (i > a) drawRun(...)`) :
  // on le retire du masque, sinon le ruban croirait que le quai s'en occupe et on
  // garderait un trou d'un sample sans bas-fond ni maçonnerie.
  for (const m of [drawPlus, drawMinus]) {
    let i = 0;
    while (i < n0) {
      if (!m[i]) { i += 1; continue; }
      const a = i; while (i + 1 < n0 && m[i + 1]) i += 1;
      if (i === a) m[a] = 0;
      i += 1;
    }
  }
  // ── CELLULES DU TROU, PAS DU QUAI ───────────────────────────────────────────
  // C'est là que va la plage de galets (bake du sol). ⚠ Le premier jet prenait le
  // COMPLÉMENT des cellules couvertes par le quai : inutilisable, parce qu'en mode
  // `full` le quai longe tout le fleuve, donc « pas de quai » ne désignait qu'une
  // poussière de cellules éparses que l'échantillonnage du quai avait manquées —
  // des taches grises au hasard, pas un rivage. On sample donc directement les
  // samples où le masque est à 0 : l'emprise du port, les passages trop étroits
  // pour un mur, les extrémités. Un patch CONTIGU, exactement là où la coupe nette
  // se voit. Élargi à 2 tuiles côté terre : une plage d'une cellule de large se
  // retrouve presque entièrement sous le ruban du fleuve.
  //
  // ⚠⚠ ON PUBLIE DES POINTS, PAS DES CELLULES, ET C'EST LE FRUIT DE DEUX ÉCHECS.
  //  1. Le complément des cellules couvertes par le quai : en mode `full` le quai
  //     longe tout le fleuve, donc « pas de quai » ne désignait qu'une poussière de
  //     cellules éparses manquées par l'échantillonnage — des taches au hasard.
  //  2. L'échantillonnage des normales sur le trou ÉLARGI : là où le fleuve est
  //     étroit ou coudé, `s.hw + 2` le long de la normale tombe à l'intérieur des
  //     terres — on obtenait des plaques de galets loin de l'eau, au milieu de la
  //     ville. Une normale n'est pas une garantie de proximité de l'eau.
  // La forme juste est donc : le consommateur part de `river.banks` (par
  // construction la couronne de cellules qui TOUCHE l'eau — impossible de dériver
  // vers l'intérieur) et ne garde que celles proches d'un de ces points. Un point
  // par sample sans quai : le port, les passages trop étroits, les extrémités.
  const gapPts = [];
  for (let i = 0; i < n0; i += 1) {
    if (drawPlus[i] && drawMinus[i]) continue;
    gapPts.push({ x: sm[i].x, y: sm[i].y });
  }
  CM.quayGate = { key: gateKey(), plus, minus, drawPlus, drawMinus, naturalOff, gapPts };
  CM.quayBankCells = bankCells;
}

// Tronçons où le quai ne trace RIEN : les runs de 0 du masque effectif. C'est là
// que le bas-fond clair du ruban doit reprendre la main (drawIsoRiver).
//
// `pad` étend chaque run de N samples DANS le territoire du quai. Sans ce
// recouvrement, les deux traits s'arrêtent au même sample et laissent une couture
// visible ; le quai fait déjà exactement ça pour ses segments de mur.
//
// Pure et exportée : c'est de la découpe d'intervalles, ça se teste sans canvas.
export function quayGapRuns(mask, n, pad = 1) {
  const out = [];
  if (!mask) return [[0, Math.max(0, n - 1)]];       // pas de masque → tout le ruban
  let i = 0;
  while (i < n) {
    if (mask[i]) { i += 1; continue; }
    const a = i; while (i + 1 < n && !mask[i + 1]) i += 1;
    out.push([Math.max(0, a - pad), Math.min(n - 1, i + pad)]);
    i += 1;
  }
  return out;
}

// Réglage molette du BORD de quai (berge maçonnée, cf. drawRun dans cityMapDrawQuays) :
// window.__quayWall({ on, full, heightK, joints, light }). Quai LIVE → pas de rebake.
//   full: true  → berge maçonnée TOUT LE LONG de l'eau (2 rives, sauf port)
//   full: false → seulement le long des berges URBAINES (proches d'une route)
//   light: 0..1 → éclaircit la pierre (fondu vers le blanc) — dessus + parement + margelle
export const quayWallTune = { on: true, full: true, heightK: 1, joints: true, light: 0.16 };

// Éclaircit une couleur "#rrggbb" en la fondant vers le blanc de `t` (0..1) → "rgb(...)".
// Sert à rendre la berge maçonnée « un peu plus claire » sans retoucher chaque teinte d'ère.
function lightenHex(hex, t) {
  if (!t || typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const L = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${L((n >> 16) & 255)},${L((n >> 8) & 255)},${L(n & 255)})`;
}

// Quais : berge construite (promenade + lèvre humide) là où la ville borde l'eau.
// Tracé en SUIVANT le ruban lisse (samples + normale), exactement comme le fleuve —
// JAMAIS par cellule (le bankSet diverge du bleu peint dans les courbes => escalier).
// Dessiné live, juste après le fleuve et avant les bateaux/le blit statique
// (ponts/routes/bâtiments le recouvrent donc gratuitement aux croisements).
// `mode` (2026-07-24, chantier perf) : le quai est de la géométrie STATIQUE
// redessinée en direct à chaque frame — recensé à ~10 000 lineTo, 1 000 traits et
// 390 arcs par image, soit 90 % de tout le travail de chemins de la carte, pour
// une promenade qui ne bouge jamais. Il est donc baké comme le sol l'est déjà.
//   'base' → tout SAUF les passes ADDITIVES  (bakable)
//   'glow' → UNIQUEMENT les passes additives (doit rester en direct)
//   absent → tout, comportement d'origine (pipeline legacy, inchangé)
// ⚠ Pourquoi ce découpage plutôt qu'un bake intégral : les lueurs (liseré néon,
// halo des lampadaires) sont dessinées en `globalCompositeOperation = "lighter"`.
// Bakées sur un offscreen TRANSPARENT puis blittées en source-over, elles ne
// s'ajoutent plus à l'eau en dessous : le halo devient un aplat coloré. Le bake
// serait « presque » identique, et c'est exactement le genre d'écart qu'on ne
// remarque qu'une fois en jeu, de nuit.
function cityMapDrawQuays(now, mode) {
  const baseOn = mode !== 'glow';
  const glowOn = mode !== 'base';
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1) return;                                   // campement primitif : pas de quai
  // ⚠ L'USURE NE RETIRE PLUS LE QUAI (demande de Raph, 2026-07-27) : au-delà de
  // 70 % la berge maçonnée disparaissait d'un coup et le fleuve se retrouvait
  // bordé de terre nue, ce qui se lit comme un bug plutôt que comme un déclin.
  // Seul l'effondrement en cours efface encore le quai.
  if (CM.collapseAt) return;
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, sm = L.river.samples, n0 = sm.length;
  const night = CM.nightF || 0;
  const lod = CM.lodActive;          // zoom lointain : strates seules, pas de mobilier/joints

  // Style de quai par ère : promenade qui évolue pierre -> marbre -> béton/fonte ->
  // néon -> énergie cosmique. (Palette cosmique inlinée pour éviter un import croisé.)
  const COSMIC = {
    7: { mid: "#1d5640", core: "#0c241a", glow: "90,240,180" },
    8: { mid: "#4a3a1c", core: "#221808", glow: "255,205,120" },
    9: { mid: "#322a52", core: "#161226", glow: "170,140,255" }
  };
  // Style par ère. `coping`/`wallTop`/`wallBot`/`wallJoint`/`wallTiles` = la BERGE
  // MAÇONNÉE (mur du bord d'eau, cf. drawRun) : margelle claire + parement
  // haut→bas + joints d'assise + hauteur (en tuiles).
  let st;
  if (band <= 4) {                   // pierre (2-3) / marbre (4)
    const marble = band >= 4;
    st = {
      W: 0.7, walk: marble ? "#cdc6b2" : "#a89a78", face: marble ? "#8f8770" : "#6e6044",
      lip: "rgba(0,0,0,0.40)", edge: marble ? "rgba(255,250,235,0.30)" : "rgba(255,240,205,0.20)",
      rail: null, joints: "rgba(0,0,0,0.16)", lamp: "255,214,150", glow: null,
      coping: marble ? "#ece6d6" : "#d8cfb4", wallTop: marble ? "#b3ab92" : "#8a7f60",
      wallBot: marble ? "#6f684f" : "#4e4230", wallJoint: "rgba(0,0,0,0.30)", wallTiles: marble ? 0.70 : 0.66
    };
  } else if (band <= 6) {            // fonte (5) / néon (6)
    const neon = band >= 6;
    st = {
      W: 0.85, walk: neon ? "#6f7480" : "#827a6e", face: neon ? "#3e424c" : "#4f4940",
      lip: "rgba(0,0,0,0.44)", edge: "rgba(222,230,240,0.16)",
      rail: "rgba(16,20,26,0.85)", joints: null, lamp: neon ? "150,225,255" : "255,208,150",
      glow: neon ? "120,220,255" : null,
      coping: neon ? "#8f99a8" : "#9c968c", wallTop: neon ? "#40444e" : "#5f5a52",
      wallBot: neon ? "#202329" : "#302c26", wallJoint: "rgba(0,0,0,0.34)", wallTiles: 0.75
    };
  } else {                           // cosmique 7-9 : quai d'énergie
    const cp = COSMIC[band] || COSMIC[9];
    st = { W: 0.9, walk: cp.mid, face: cp.core, lip: "rgba(0,0,0,0.45)", edge: null, rail: null, joints: null, lamp: cp.glow, glow: cp.glow,
      coping: cp.mid, wallTop: cp.core, wallBot: "#0a0a12", wallJoint: "rgba(0,0,0,0.30)", wallTiles: 0.75 };
  }
  const W = st.W, faceW = W * 0.30;  // bande côté eau (ombre) vs promenade (côté terre)

  // Effilement smoothstep aux deux bouts d'un run (hauteur/largeur -> 0) : fondu DOUX
  // aux interruptions EN VILLE (port) — retour Raph « c'était plus fluide quand
  // c'était affiné ». Le SPIKE de la source est évité autrement (skip QUAY_END/QUAY_MIN_HW
  // dans le gate + bas-fond à offset CONSTANT), PAS en retirant l'effilement.
  const TAPER = 2;
  // Effilement ASYMÉTRIQUE : on n'effile un bout QUE s'il borde une INTERRUPTION EN
  // VILLE (port) → fondu DOUX voulu par Raph. Aux bouts bordant une berge
  // NATURELLE (source/embouchure/fleuve étroit), PAS d'effilement → fin carrée nette,
  // pas de POINTE fuyante. `ctaperA/ctaperB` sont posés par drawRun d'après `naturalOff`.
  let ctaperA = true, ctaperB = true, naturalOff = null;
  const tt = (i, a, b) => {
    const dA = ctaperA ? (i - a) : 1e9, dB = ctaperB ? (b - i) : 1e9;
    const t = Math.max(0, Math.min(1, Math.min(dA, dB) / TAPER));
    return t * t * (3 - 2 * t);
  };
  // Point écran à l'offset additif `base` (tapered) du sample i, sur la rive `side`.
  // Projection via le module iso → les quais suivent le ruban ; appelé par drawIsoWorld.
  const pt = (i, side, base, tap) => {
    const s = sm[i], n = cmRiverNormalAt(sm, i), off = s.hw + base * tap;
    const q = isoWorldToScreen((s.x + side * n.nx * off) * T, (s.y + side * n.ny * off) * T);
    return [q.x, q.y];
  };
  const fillStrip = (a, b, side, baseIn, baseOut, col) => {
    ctx.beginPath();
    for (let i = a; i <= b; i += 1) { const p = pt(i, side, baseIn, tt(i, a, b)); if (i === a) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    for (let i = b; i >= a; i -= 1) { const p = pt(i, side, baseOut, tt(i, a, b)); ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  const strokeAt = (a, b, side, base, col, lw, additive) => {
    if (!col) return;
    if (additive) { ctx.save(); ctx.globalCompositeOperation = "lighter"; }
    ctx.beginPath();
    for (let i = a; i <= b; i += 1) { const p = pt(i, side, base, tt(i, a, b)); if (i === a) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
    if (additive) ctx.restore();
  };

  const wallOn = quayWallTune.on;
  const drawRun = (a, b, side) => {
    // Effiler un bout SEULEMENT s'il borde une interruption VILLE (port), pas
    // une berge naturelle (source/étroit) : `naturalOff[a-1|b+1]` distingue les deux.
    ctaperA = a > 0 && naturalOff ? !naturalOff[a - 1] : (a > 0);
    ctaperB = b < n0 - 1 && naturalOff ? !naturalOff[b + 1] : (b < n0 - 1);
    // Pierre éventuellement ÉCLAIRCIE (quayWallTune.light) : dessus + parement + margelle.
    const LT = quayWallTune.light;
    const cWalk = lightenHex(st.walk, LT), cCop = lightenHex(st.coping, LT);
    const cWallTop = lightenHex(st.wallTop, LT), cWallBot = lightenHex(st.wallBot, LT);
    // 1) DESSUS PLAT de la berge (uniforme jusqu'au bord d'eau, offset 0..W).
    if (baseOn) fillStrip(a, b, side, 0, W, cWalk);

    // 2) MUR DU BORD (berge maçonnée façon TheoTown). L'axe VERTICAL du monde se
    // projette en Z-écran pur (screen-Y vers le bas) → un parement vertical est un
    // ruban qui "pend" sous la margelle, quelle que soit la rive. Il n'est visible
    // que sur la rive dont l'EAU est DEVANT (plus bas à l'écran) ; l'autre rive
    // n'en montre que la margelle (son parement est occulté par sa promenade).
    // waterBelow(i) : au sample i, l'eau est-elle "devant" (plus bas à l'écran) ?
    // Évalué PAR SAMPLE (robuste aux courbes ET aux longues berges "full") → on ne
    // dessine le parement que sur les sous-tronçons où c'est vrai ; l'autre rive
    // n'a que la margelle (parement occulté par sa propre promenade).
    if (baseOn && wallOn && !lod) {
      const wh = st.wallTiles * quayWallTune.heightK * T * z;   // hauteur écran du parement
      const N = b - a + 1;
      // wbelow par sample (l'eau est "devant" = plus bas à l'écran) → robuste courbes/full.
      const wbel = new Uint8Array(N);
      for (let i = a; i <= b; i += 1) wbel[i - a] = pt(i, side, -0.3, 1)[1] > pt(i, side, 0.3, 1)[1] ? 1 : 0;
      // Hauteur ÉCRAN du mur par sample (0 hors sous-tronçon waterBelow ; taperée aux bouts).
      const wallH = new Float32Array(N);
      { let i = 0; while (i < N) { if (!wbel[i]) { i += 1; continue; } let j = i; while (j + 1 < N && wbel[j + 1]) j += 1; for (let k = i; k <= j; k += 1) wallH[k] = wh * tt(a + k, a + i, a + j); i = j + 1; } }
      const drawWallSeg = (sa, sb) => {
        // Haut du mur (bord d'eau) + hauteur locale : LIT wallH[] (source de vérité
        // UNIQUE, partagée avec le liseré) — ne PAS recalculer un taper local, sinon
        // mur dessiné et liseré divergent (liseré « fantôme » sous l'eau, vu par Raph).
        const wp = [];
        for (let i = sa; i <= sb; i += 1) { const tp = pt(i, side, 0, 1); wp.push([tp[0], tp[1], wallH[i - a]]); }
        // Parement en 2 assises : haut clair -> bas sombre (lecture de profondeur).
        for (const seg of [[0, 0.5, cWallTop], [0.5, 1, cWallBot]]) {
          ctx.beginPath();
          for (let k = 0; k < wp.length; k += 1) { const p = wp[k], y = p[1] + p[2] * seg[0]; if (k === 0) ctx.moveTo(p[0], y); else ctx.lineTo(p[0], y); }
          for (let k = wp.length - 1; k >= 0; k -= 1) { const p = wp[k]; ctx.lineTo(p[0], p[1] + p[2] * seg[1]); }
          ctx.closePath(); ctx.fillStyle = seg[2]; ctx.fill();
        }
        // Joints d'assise verticaux (tous les ~2 samples, hors bouts effilés).
        if (quayWallTune.joints) {
          ctx.strokeStyle = st.wallJoint; ctx.lineWidth = Math.max(1, z * 0.5);
          for (let k = 0; k < wp.length; k += 2) { const p = wp[k]; if (p[2] < wh * 0.5) continue; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] + p[2]); ctx.stroke(); }
        }
        // Ombre de contact à la BASE du mur (le pied dans l'eau).
        ctx.strokeStyle = "rgba(0,0,0,0.30)"; ctx.lineWidth = Math.max(1, z * 0.8);
        ctx.beginPath();
        for (let k = 0; k < wp.length; k += 1) { const p = wp[k]; if (k === 0) ctx.moveTo(p[0], p[1] + p[2]); else ctx.lineTo(p[0], p[1] + p[2]); }
        ctx.stroke();
      };
      // Murs sur les sous-tronçons waterBelow (au moins 2 samples). Chaque segment
      // est ÉTENDU d'un sample aux bouts (hauteur 0, si dispo) : le polygone se FERME
      // à la pointe au lieu de s'arrêter net un sample avant (le taper met wallH=0
      // pile au bout → sans extension, mur coupé + liseré qui continue seul).
      { let i = 0; while (i < N) { if (!wallH[i]) { i += 1; continue; } let j = i; while (j + 1 < N && wallH[j + 1] > 0) j += 1; if (j > i) drawWallSeg(a + Math.max(0, i - 1), a + Math.min(N - 1, j + 1)); i = j + 1; } }
      // BAS-FOND CLAIR collé au BORD DE L'EAU VISIBLE (retour Raph « il faut qu'il
      // suive le bord de l'eau », pas le quai englouti) : la ligne = le contour BAS
      // du parement DESSINÉ là où il y a un mur (pied = screen-Y + wallH[i], qui
      // remonte au bord du ruban à la pointe), et le bord PEINT du ruban là où il
      // n'y en a pas (wallH=0). AUCUN décalage latéral : l'ancien -inset laissait
      // la ligne flotter DANS l'eau au-delà de la pointe et hors des tronçons à mur.
      // (Le bas-fond de drawIsoRiver reste OFF — waterShoreTune.on=false.)
      const shoreLine = (col, lw) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = a; i <= b; i += 1) {
          const p = pt(i, side, 0, 1);
          const y = p[1] + wallH[i - a];      // pied du mur ; bord du ruban si wallH=0
          if (i === a) ctx.moveTo(p[0], y); else ctx.lineTo(p[0], y);
        }
        ctx.stroke();
      };
      // TEINTES DU CORPS D'EAU COURANT (Raph, 2026-07-30). Depuis les coloris
      // pilotés par l'état, ce bas-fond restait bleu-gris ardoise au pied du mur
      // alors que le fleuve passait à l'azur ou au turquoise. Il est publié par
      // le renderer iso sur CM.waterShore (isoRenderer, waterBandNow) plutôt
      // qu'importé : ce fichier est le tronc commun des deux pipelines, et un
      // import croisé vers isoRenderer ferait un cycle. Repli = les valeurs
      // d'origine, donc le pipeline legacy et le fleuve ruiné ne changent pas.
      const wq = (CM.waterShore && CM.waterShore.quay) || ["rgba(150,184,180,0.50)", "rgba(202,224,214,0.62)"];
      shoreLine(wq[0], Math.max(3, z * 5));    // bas-fond doux (halo)
      shoreLine(wq[1], Math.max(1, z * 2.2));  // liseré clair AU bord
    }

    // 3) Joints de dalles du DESSUS : ticks perpendiculaires (pierre/marbre).
    if (baseOn && st.joints && !lod) {
      ctx.strokeStyle = st.joints; ctx.lineWidth = Math.max(1, z * 0.5);
      for (let i = a; i <= b; i += 1) {
        const ta = tt(i, a, b); if (ta < 0.4) continue;
        const p1 = pt(i, side, faceW, ta), p2 = pt(i, side, W, ta);
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
    }
    // 4) Côté terre : garde-corps (fonte/néon) sinon liseré clair.
    if (baseOn) {
      if (st.rail) strokeAt(a, b, side, W, st.rail, Math.max(1, z * 0.7));
      else strokeAt(a, b, side, W, st.edge, Math.max(1, z * 0.5));
      // 5) MARGELLE : cap clair au bord d'eau = le haut du mur (les deux rives).
      strokeAt(a, b, side, 0, cCop, Math.max(1, z * 1.0));
    }
    // 6) Bord lumineux (néon / énergie cosmique), avivé la nuit. ADDITIF → live.
    if (glowOn && st.glow) strokeAt(a, b, side, 0, `rgba(${st.glow},${(0.30 + 0.45 * night).toFixed(2)})`, Math.max(1, z * 0.7), true);
    // 7) Lampadaires le long de la promenade ; lueur chaude la nuit.
    // Le HALO est additif (live) ; le point de la lampe ne l'est pas (bakable).
    if (!lod && st.lamp) {
      for (let i = a; i <= b; i += 1) {
        if (i % 2 !== 0) continue;
        const ta = tt(i, a, b); if (ta < 0.6) continue;
        const p = pt(i, side, W * 0.8, ta), lx = p[0], ly = p[1];
        if (glowOn && night > 0.25) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const r = Math.max(4, z * 1.7), g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
          g2.addColorStop(0, `rgba(${st.lamp},${(0.5 * night).toFixed(2)})`); g2.addColorStop(1, `rgba(${st.lamp},0)`);
          ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        if (baseOn) {
          ctx.fillStyle = night > 0.25 ? `rgba(${st.lamp},0.95)` : "rgba(28,24,18,0.8)";
          ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, z * 0.35), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  };

  // Gate des runs : le masque EFFECTIF, calculé par ensureQuayGate (mode `full`
  // + coupe du port + fleuve trop étroit + extrémités, cf. son commentaire).
  // Il vit là-bas et plus ici parce que le bas-fond du ruban, dessiné AVANT les
  // quais dans la frame, a besoin du même masque pour prendre le relais là où la
  // maçonnerie s'arrête — sinon plus personne ne dessine le bord de l'eau.
  const plusG = g.drawPlus, minusG = g.drawMinus;
  naturalOff = g.naturalOff;
  for (let si = 0; si < 2; si += 1) {
    const side = si ? -1 : 1, gate = si ? minusG : plusG;
    let i = 0;
    while (i < n0) {
      if (!gate[i]) { i += 1; continue; }
      const a = i; while (i + 1 < n0 && gate[i + 1]) i += 1;
      if (i > a) drawRun(a, i, side);   // run d'au moins 2 samples
      i += 1;
    }
  }
}

/* ---- legacy citymap rendering\agents.js ---- */
/* Moved to agents.js. */

/* ---- legacy citymap rendering\crisis.js ---- */


/* ============================================================================
 * citymap-render-crisis.js - Evenements visuels lies a l'instabilite.
 * ============================================================================ */

const RIOT_WONDER_CLEAR_R = WONDER_CLEAR_R + 2;

function cityMapRiotBlocked(gx, gy) {
  if (!CM.layout || !Array.isArray(state.wonders) || !state.wonders.length) return false;
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!cmWonderActive(w, state)) continue;
    const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
    if (Math.hypot(gx - slot.gx, gy - slot.gy) <= RIOT_WONDER_CLEAR_R) return true;
  }
  return false;
}

function cityMapPickRiotRoadNear(origin, radius) {
  if (!CM.walkRoadList.length) return null;
  const safeRoads = CM.walkRoadList.filter((r) => !cityMapRiotBlocked(r.gx, r.gy));
  if (!safeRoads.length) return null;
  if (!origin) return safeRoads[Math.floor(Math.random() * safeRoads.length)];

  const near = [];
  for (const r of safeRoads) {
    const dist = Math.abs(r.gx - origin.gx) + Math.abs(r.gy - origin.gy);
    if (dist <= radius) near.push(r);
  }
  const pool = near.length ? near : safeRoads;
  return pool[Math.floor(Math.random() * pool.length)];
}

function cityMapRiotGroupCenter(rioters) {
  if (!rioters || !rioters.length) return null;
  let gx = 0, gy = 0;
  for (const p of rioters) {
    gx += p.x / CM.TILE - 0.5;
    gy += p.y / CM.TILE - 0.5;
  }
  return { gx: gx / rioters.length, gy: gy / rioters.length };
}

// Arme brandie d'un émeutier (torche ou fourche), bras levé qui s'agite. Ancrée à
// une main (hx,hy) avec une unité d'échelle u — partagée par le rendu PIXEL (ancré
// au sprite d'habitant) et le repli vectoriel (ancré à la silhouette).
function drawRiotWeapon(ctx, hx, hy, u, weapon, now, phase, pulse) {
  const wave = Math.sin(now / 200 + (phase || 0) * 2) * u * 0.18;
  ctx.strokeStyle = "#6b4a26";
  ctx.lineWidth = Math.max(1, u * 0.18);
  if (weapon === "fork") {
    // Manche de fourche + trois dents métalliques
    const tipX = hx + u * 0.25 + wave, tipY = hy - u * 1.7;
    ctx.beginPath(); ctx.moveTo(hx - u * 0.15, hy + u * 0.5); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = "#aab2bc";
    ctx.lineWidth = Math.max(0.8, u * 0.12);
    for (let d = -1; d <= 1; d += 1) {
      ctx.beginPath();
      ctx.moveTo(tipX + d * u * 0.22, tipY);
      ctx.lineTo(tipX + d * u * 0.22, tipY - u * 0.45);
      ctx.stroke();
    }
  } else {
    // Manche de torche + flamme vacillante et halo chaud
    const tipX = hx + u * 0.2 + wave, tipY = hy - u * 1.2;
    ctx.beginPath(); ctx.moveTo(hx - u * 0.1, hy + u * 0.3); ctx.lineTo(tipX, tipY); ctx.stroke();
    const flick = 0.75 + 0.25 * Math.sin(now / 90 + (phase || 0) * 5);
    ctx.fillStyle = `rgba(255,138,44,${(0.18 * flick).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(tipX, tipY - u * 0.2, u * 0.9 * flick, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(239,42,11,${(0.65 + 0.3 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(tipX, tipY - u * 0.15, u * 0.32 * flick, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,188,78,0.9)";
    ctx.beginPath(); ctx.arc(tipX, tipY - u * 0.12, u * 0.16 * flick, 0, Math.PI * 2); ctx.fill();
  }
}

// Apaisement au clic : retire l'émeutier visé, fait retomber un peu la rupture
// et empêche le groupe de se re-remplir aussitôt (compteur à décroissance).
function cityMapCalmRioterAt(sx, sy) {
  if (!Array.isArray(CM.rioters) || !CM.rioters.length) return false;
  const z = CM.cam.zoom;
  const radius = Math.max(14, 10 * z);
  let bi = -1, bd = Infinity;
  for (let i = 0; i < CM.rioters.length; i += 1) {
    const p = CM.rioters[i];
    // Projection UNIQUE (identité en legacy) : en iso le clic doit viser la
    // position DESSINÉE de l'émeutier, pas son ancien mapping planaire.
    const sp = isoWorldToScreen(p.x, p.y);
    const d = Math.hypot(sp.x - sx, sp.y - sy);
    if (d < radius && d < bd) { bd = d; bi = i; }
  }
  if (bi < 0) return false;
  const p = CM.rioters.splice(bi, 1)[0];
  CM.riotCalmed = (CM.riotCalmed || 0) + 1;
  if (!CM.calmPoofs) CM.calmPoofs = [];
  CM.calmPoofs.push({ x: p.x, y: p.y, t: performance.now() });
  // Geste réel mais modeste : −0.2 pt de Rupture par émeutier apaisé.
  state.instability = Math.max(0, (state.instability || 0) - 0.002);
  return true;
}

// ── SIM d'émeute (partagée legacy + iso) — extraite de drawCrisis ────────────
// Le pipeline ISO l'appelle depuis drawIsoWorld puis dessine les émeutiers comme
// items du TRI PEINTRE (drawIsoLive) ; le legacy garde son rendu planaire dans
// drawCrisis ci-dessous, inchangé. Pose CM.riotDraw = { pts, cx, cy } (émeutiers
// actifs remappés sur route + centre de foule) ou null, consommé par les DEUX.
function updateCrisis(dt, now) {
  if (!CM.layout) return;
  const inst = state.instability || 0;

  if (!CM.rioters) CM.rioters = [];
  // Les émeutes n'éclatent que l'après-midi. La fenêtre est publiée par le
  // point de bascule du cycle (CM.riotWindow, cityMapRuntime) : elle suit
  // l'horloge SIMULÉE — l'option d'affichage Jour/Nuit ne la touche pas — et
  // vaut 23 % du temps réel, la dose de l'ancienne courbe sinus. Ne PAS la
  // re-dériver de CM.dayRising/nightF : ceux-là portent le VISUEL (forçables).
  // En capture (CM.capture), la fenêtre est coupée à la source : les clichés
  // __cityShot sont déterministes, jamais de foule dessus.
  const afternoon = CM.riotWindow === true;
  const baseWant = afternoon && inst > 0.55 && CM.walkRoadList.length ? Math.floor((inst - 0.55) / 0.45 * 36) + 8 : 0;
  // Les apaisements au clic réduisent la foule ; l'effet s'estompe avec le temps
  // (1 émeutier "revient" toutes les ~8 s tant que la tension persiste).
  if ((CM.riotCalmed || 0) > 0) {
    CM.riotCalmDecayT = (CM.riotCalmDecayT || 0) + dt;
    if (CM.riotCalmDecayT >= 8) { CM.riotCalmDecayT = 0; CM.riotCalmed -= 1; }
  }
  const want = baseWant > 0 ? Math.max(0, baseWant - (CM.riotCalmed || 0)) : 0;
  if (want === 0) {
    CM.rioters.length = 0;
    CM.riotGoal = null;
    if (baseWant === 0) { CM.riotCalmed = 0; CM.riotCalmDecayT = 0; }
    CM.riotDraw = null;
  } else {
    const isRoad = (x, y) => CM.walkRoadSet.has(cityMapWalkRoadKey(x, y)) && !cityMapRiotBlocked(x, y);
    const groupCenter = cityMapRiotGroupCenter(CM.rioters);
    if (!CM.riotGoal || !isRoad(CM.riotGoal.gx, CM.riotGoal.gy) || (now - (CM.riotGoalAt || 0)) > 5000) {
      CM.riotGoal = cityMapPickRiotRoadNear(groupCenter || CM.rioters[0], 6 + Math.round(inst * 8));
      CM.riotGoalAt = now;
    }
    const spawnAnchor = groupCenter || CM.riotGoal;
    // Même garde-robe que les habitants : tuniques teintes + teints de peau.
    const RIOT_OUTFITS = ["#9a4d38", "#3f6a8a", "#7a8a3c", "#8a5d9a", "#b08a3a", "#5d7a6a"];
    const RIOT_SKINS = ["#e8c8a0", "#d4a878", "#b88a58", "#8a5c38"];
    while (CM.rioters.length < want) {
      const r = cityMapPickRiotRoadNear(spawnAnchor, 2 + Math.round(inst));
      if (!r) break;
      const n = CM.rioters.length;
      CM.rioters.push({
        gx: r.gx,
        gy: r.gy,
        x: (r.gx + 0.5) * CM.TILE,
        y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE,
        ty: (r.gy + 0.5) * CM.TILE,
        dir: -1,
        pauseT: 0,
        speed: 24 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        lane: (Math.random() - 0.5) * CM.TILE * 0.38,
        col: RIOT_OUTFITS[n % RIOT_OUTFITS.length],
        skin: RIOT_SKINS[(n * 7 + 3) % RIOT_SKINS.length],
        weapon: n % 2 === 0 ? "torch" : "fork",
        charType: n % 3 === 0 ? 1 : 0 // émeutiers adultes : ~1/3 de femmes, pas d'enfants
      });
    }
    if (CM.rioters.length > want) CM.rioters.length = want;
    const goal = CM.riotGoal;
    const cohesion = cityMapRiotGroupCenter(CM.rioters) || goal;
    let mx = 0, my = 0;
    const pts = [];
    for (const p of CM.rioters) {
      if (!isRoad(p.gx, p.gy)) {
        const r = cityMapPickRiotRoadNear(cohesion, 6 + Math.round(inst * 4));
        if (!r) continue;
        p.gx = r.gx;
        p.gy = r.gy;
        p.x = (r.gx + 0.5) * CM.TILE;
        p.y = (r.gy + 0.5) * CM.TILE;
        p.tx = p.x;
        p.ty = p.y;
        p.dir = -1;
      }
      if (p.pauseT > 0) {
        p.pauseT -= dt;
      } else {
        const ddx = p.tx - p.x, ddy = p.ty - p.y, dd = Math.hypot(ddx, ddy);
        if (dd < 2.4) {
          if (Math.random() < 0.035) {
            p.pauseT = 0.12 + Math.random() * 0.35;
          } else {
            const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
            const opts = [];
            for (let i = 0; i < 4; i += 1) {
              const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
              if (isRoad(nx, ny) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
            }
            const pool = opts.filter((o) => o.i !== rev);
            const use = pool.length ? pool : opts;
            let best = use[0], bs = -Infinity;
            const groupDistNow = Math.abs(cohesion.gx - p.gx) + Math.abs(cohesion.gy - p.gy);
            const personalGoal = groupDistNow > 4.5 ? cohesion : goal;
            for (const o of use) {
              const groupDistNext = Math.abs(cohesion.gx - o.nx) + Math.abs(cohesion.gy - o.ny);
              let sc = -(Math.abs(personalGoal.gx - o.nx) + Math.abs(personalGoal.gy - o.ny));
              sc -= groupDistNext * (personalGoal === cohesion ? 0.25 : 0.85);
              if (o.i === p.dir) sc += 1.25;
              sc += Math.random() * 0.9;
              if (sc > bs) {
                bs = sc;
                best = o;
              }
            }
            if (best) {
              p.gx = best.nx;
              p.gy = best.ny;
              p.dir = best.i;
              p.tx = (p.gx + 0.5) * CM.TILE;
              p.ty = (p.gy + 0.5) * CM.TILE;
            }
          }
        } else {
          const sp = p.speed * dt;
          p.x += ddx / dd * sp;
          p.y += ddy / dd * sp;
          // Odomètre de marche (px monde) : anime les bandes diagonales PAR
          // DISTANCE (drawNamedAgentIso) — les pieds accrochent le sol.
          p.walkDist = (p.walkDist || 0) + sp;
        }
      }
      mx += p.x;
      my += p.y;
      pts.push(p);
    }
    // Liste de rendu PARTAGÉE : le legacy la peint ci-dessous (drawCrisis),
    // l'iso la pousse dans le tri peintre (drawIsoLive, items 'riot').
    CM.riotDraw = pts.length ? { pts, cx: mx / pts.length, cy: my / pts.length } : null;
  }
}

export {
  cityMapDrawQuays,
  ensureQuayGate,
  updateCrisis,
  drawRiotWeapon,
  cityMapCalmRioterAt
};
