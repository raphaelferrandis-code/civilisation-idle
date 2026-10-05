// LES QUAIS ET L'ÉMEUTE — les deux seules choses que ce fichier fait encore.
//
// ⚠ IL S'APPELAIT `renderWorld.js`, ET IL RENDAIT LE MONDE : c'était le peintre
// top-down de la carte, 2939 lignes. Ce pipeline a été retiré aux étapes 4 à 7 du
// plan de suppression du legacy (2026-08-23) ; il n'en restait que 735 lignes,
// dont le nom mentait. Renommé le même jour — question Q5 du plan. Si vous suivez
// un document qui parle encore de `renderWorld.js`, c'est ici que ça a atterri.
//
// Ce qui subsiste, et que le peintre iso consomme :
//   · LA BERGE MAÇONNÉE — `ensureQuayGate` (où le quai a le droit de courir,
//     calculé une fois par layout), `quayGapRuns`, `quayWallTune`, et le style par
//     ère (`quayStyleFor`, `quayWallColors`, `quayWallTiles`). Le DESSIN du quai est
//     passé à iso/isoQuay.js (tuiles au pixel, 2026-10-01) ;
//   · LA SIMULATION D'ÉMEUTE — `updateCrisis` et ses aides. Le DESSIN des
//     émeutiers, lui, est passé à l'iso ; seul `drawRiotWeapon` est resté ici.
//
// ⚠ Deux sujets sans rapport dans un même fichier : c'est l'héritage de la coupe,
// pas un choix. Les séparer serait un petit chantier à part.
//
// ✔ LE `/* eslint-disable */` DE TÊTE A ÉTÉ RETIRÉ le 2026-08-23. Il couvrait le
// peintre top-down ; une fois celui-ci parti, ESLint ne signalait plus rien sur
// ce fichier — il le disait lui-même (« unused eslint-disable directive »).
// Le lint MORD donc de nouveau ici : c'est la porte que P24 constatait absente,
// et elle est rendue. Ne pas remettre ce commentaire magique sans raison écrite.
import { state } from '../core/state.js';
import { CM, CM_WONDERS, cmWonderSlot, cmWonderActiveIds, WONDER_CLEAR_R } from './layout.js';
import { CM_DIRS, cityMapWalkRoadKey, roadStepAllowed } from './agents.js';
import { worldToScreen as isoWorldToScreen } from './iso/projection.js';

// Les trois hooks `setPlazaPropOnLoad` / `setMedianOnLoad` / `setRoadPavingOnLoad`
// vivaient ici : ils invalidaient les caches STATIQUE et SOL quand une tuile de
// place, de terre-plein ou de chaussée finissait de décoder. Ces trois caches
// appartenaient au pipeline top-down et n'existent plus. Leurs modules
// (`plazaProps.js`, `pixelMedian.js`, `roadPaving.js`) deviennent orphelins du
// même coup — c'est l'étape 6 qui les supprimera.

/* ============================================================================
 * PARTIE 1 — LA BERGE MAÇONNÉE
 *   Où le quai a le droit de courir (`ensureQuayGate`, calculé une fois par
 *   layout et lisible par tout le monde), et ses couleurs par ère. Le tracé est
 *   dans iso/isoQuay.js.
 * ============================================================================ */

// `baseColor` et `cmLitColor` vivaient ici. Leurs derniers lecteurs — le bloc LOD
// de `renderBuildings.js` pour l'un, `buildingShapes.js` pour l'autre — sont partis
// à l'étape 6, le 2026-08-23. (Ne pas confondre `cmLitColor` avec
// `CM.cmLitColorStr`, la chaîne que cityMapRuntime publie encore : autre
// identifiant, toujours vivant.)

// Normale unitaire au sample i du fleuve (perpendiculaire à la tangente locale).
// Helper du gating des quais (calculé une fois par layout).
function cmRiverNormalAt(sm, i) {
  const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
  return { nx: -ty / tl, ny: tx / tl };
}

// Gating des quais : pour chaque sample du fleuve et chaque rive (+n / -n), la berge
// est-elle "urbaine" (proche d'une route) ? Calculé UNE fois par layout (clé =
// CM.layoutRecomputeAt), jamais par frame. Sert au tracé (iso/isoQuay.js).
// NB : gating PUR (urbain ou non) — la décision de dessiner dépend de l'ère/usure,
// évaluée par frame côté appelant (pas figée dans ce cache).
const QUAY_GATE_LAND = 1.0;   // échantillonnage : ~1 tuile au-delà du bord d'eau
// La clé porte le layout ET le mode `full` de la molette : depuis que le masque
// EFFECTIF du quai est calculé ici (cf. plus bas), il dépend de `full`, et un
// cache indexé sur le seul layout aurait servi l'ancien masque après bascule.
// `portGap` y est aussi, APRÈS le mode : solPyramideFrame retire l'horodatage par
// l'expression `:qg[^:]*:([fu])`, le reste de la clé doit suivre le mode.
const gateKey = () => CM.layoutRecomputeAt + (quayWallTune.full ? ':f' : ':u') + ':p' + (+quayWallTune.portGap || 0);
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
  // ET DE SON CÔTÉ SEULEMENT, `quayWallTune.portGap` tuiles de plus de part et
  // d'autre (2026-10-01) : c'est la PLAGE du port (iso/isoBeachCells.beachZone). Sur
  // la seule emprise, la coupure faisait 3 samples, et la grève un trou de 4 tuiles
  // dans la maçonnerie (retour Raph : « avoir une vraie plage »).
  // ⚠ LES DEUX PORTS DU XIXe (docs/PLAN-PORTS.md) : l'entrée du BASSIN du Vieux-Port
  // et le terre-plein du port de COMMERCE coupent aussi le quai, de leur côté, mais
  // ce ne sont PAS des grèves : une structure y tient le bord de l'eau (les murs du
  // bassin, le quai du terminal). Ces samples vont dans `dockPlus` / `dockMinus` —
  // ni plage (isoBeachCells), ni sable mouillé, ni écume — et coupent le quai à
  // bout CARRÉ (naturalOff) : la maçonnerie rejoint celle du port, sans effilement.
  const dockPlus = new Uint8Array(n0), dockMinus = new Uint8Array(n0);
  const portSide = (i, px, py) => {
    const n = cmRiverNormalAt(sm, i);
    return (px - sm[i].x) * n.nx + (py - sm[i].y) * n.ny >= 0 ? 0 : 1;   // 0 = plus, 1 = minus
  };
  const cutDock = (pa, ma, x0, x1, px, py) => {
    for (let i = 0; i < n0; i += 1) {
      if (sm[i].x < x0 || sm[i].x > x1) continue;
      if (portSide(i, px, py)) { ma[i] = 0; dockMinus[i] = 1; } else { pa[i] = 0; dockPlus[i] = 1; }
    }
  };
  const tradeP = L.ports && L.ports.trade;
  const cutPorts = (pa, ma) => {
    for (const t of (L.tiles || [])) {
      if (t.buildingId !== "river_ports" || t.tradePort || t.portOffice) continue;   // commerce : cf. tradeP ; capitainerie : sur le quai
      if (t.oldPort) {
        // Le bassin : son anneau de quai compris (une case de part et d'autre).
        const b = t.oldPort;
        cutDock(pa, ma, b.gx - 1, b.gx + b.w + 1, b.gx + b.w / 2, b.gy + b.h / 2);
        continue;
      }
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      const x0 = t.gx - 0.5, x1 = t.gx + sx + 0.5, m = Math.max(0, +quayWallTune.portGap || 0);
      const pcx = t.gx + sx / 2, pcy = t.gy + sy / 2;
      for (let i = 0; i < n0; i += 1) {
        const x = sm[i].x;
        if (x >= x0 && x <= x1) { pa[i] = 0; ma[i] = 0; continue; }
        if (x < x0 - m || x > x1 + m) continue;
        const n = cmRiverNormalAt(sm, i);
        if ((pcx - sm[i].x) * n.nx + (pcy - sm[i].y) * n.ny >= 0) pa[i] = 0; else ma[i] = 0;
      }
    }
    if (tradeP) {
      const mi = Math.floor(tradeP.len / 2), dir = tradeP.side === "N" ? 1 : -1;
      cutDock(pa, ma, tradeP.x0 - 0.5, tradeP.x0 + tradeP.len + 0.5, tradeP.x0 + mi + 0.5, tradeP.edge[mi] - dir * 2 + 0.5);
    }
  };
  cutPorts(plus, minus);
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
  // et aux deux extrémités. Ce calcul vivait dans l'ancien tracé du quai, donc APRÈS le
  // dessin du fleuve dans la frame — inutilisable par le bas-fond du ruban, qui a
  // besoin de savoir où le quai NE trace PAS pour prendre le relais (Raph,
  // 2026-07-30 : « il n'y a plus de quais ni de liseré, ça fait une coupe nette »).
  // Remonté ici, il est calculé une fois par layout et lisible par tout le monde.
  const QUAY_MIN_HW = 1.6, QUAY_END = 3;
  const drawPlus = new Uint8Array(n0), drawMinus = new Uint8Array(n0);
  const naturalOff = new Uint8Array(n0);   // 1 = coupé pour raison NATURELLE (≠ port) → bout carré
  if (quayWallTune.full) {
    drawPlus.fill(1); drawMinus.fill(1);
    cutPorts(drawPlus, drawMinus);
  } else { drawPlus.set(plus); drawMinus.set(minus); }
  for (let i = 0; i < n0; i += 1) {
    if (sm[i].hw < QUAY_MIN_HW || i < QUAY_END || i >= n0 - QUAY_END) {
      drawPlus[i] = 0; drawMinus[i] = 0; naturalOff[i] = 1;
    }
    if (dockPlus[i] || dockMinus[i]) naturalOff[i] = 1;   // bout carré contre le port
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
  // par sample sans quai : le port, les passages trop étroits (les extrémités
  // n'en sont plus, cf. juste en dessous).
  // ⚠ SAUF LES EXTRÉMITÉS (2026-09-29). Le fleuve ne finit plus à l'écran : son
  // ruban se prolonge tout droit au-delà de ses bouts (isoRiver, riverDrawPts).
  // La grève qui arrondissait le bout n'a donc plus de bout à arrondir — et elle
  // n'était jamais peinte qu'en PARTIE : les bouts tombent à 1,3 N hors du plan,
  // où seule une tuile de sol débordante la cuisait, coupée net à son bord. Le
  // quai, lui, garde son bout carré aux extrémités (naturalOff, inchangé) : la
  // berge naturelle du prolongement prend le relais.
  // ⚠ DEPUIS LA GRÈVE EN BANDE (2026-10-01), ces points ne décident plus rien : la
  // plage se calcule sur le masque lui-même (iso/isoBeachCells.beachZone). Ils restent
  // la SIGNATURE du masque pour le cache des tuiles de sol (solPyramideFrame.tileSig,
  // qui ne hache que les points tombés dans la tuile) — d'où des points partout où la
  // grève peut se poser : le milieu du fleuve et ses deux berges, sur la coupure et
  // sur les GAP_SIG samples de rampe autour (≥ BEACH.ramp).
  const GAP_SIG = 3;
  const gapPts = [];
  for (let i = 0; i < n0; i += 1) {
    let near = false;
    for (let d = -GAP_SIG; d <= GAP_SIG && !near; d += 1) {
      const j = i + d;
      if (j < QUAY_END || j >= n0 - QUAY_END) continue;
      if (!drawPlus[j] || !drawMinus[j]) near = true;
    }
    if (!near) continue;
    const n = cmRiverNormalAt(sm, i), s = sm[i], o = s.hw + 1;
    gapPts.push({ x: s.x, y: s.y }, { x: s.x + n.nx * o, y: s.y + n.ny * o }, { x: s.x - n.nx * o, y: s.y - n.ny * o });
  }
  CM.quayGate = { key: gateKey(), plus, minus, drawPlus, drawMinus, naturalOff, gapPts, dockPlus, dockMinus };
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

// Réglage molette du BORD de quai (berge maçonnée, iso/isoQuay.js) :
// window.__quayWall({ on, full, heightK, light }) — la clé des tuiles du quai les porte.
//   full: true  → berge maçonnée TOUT LE LONG de l'eau (2 rives, sauf port)
//   full: false → seulement le long des berges URBAINES (proches d'une route)
//   light: 0..1 → éclaircit la pierre (fondu vers le blanc) — dessus + parement + margelle
// `portGap` : tuiles de quai retirées de part et d'autre du port, de SON côté — la
// longueur de sa plage (cf. ensureQuayGate). 0 = la coupure d'avant, sur l'emprise.
export const quayWallTune = { on: true, full: true, heightK: 1, light: 0.16, portGap: 2.5 };
// Hauteur du parement (en tuiles) par ère : pierre (2-3), marbre (4), fonte et néon
// (5-6), énergie (7+). Lue aussi par les REFLETS (iso/isoReflect.js) : l'eau est
// tenue autant sous la promenade, le miroir passe à cette hauteur-là.
export function quayWallTiles(band) { return band <= 4 ? (band >= 4 ? 0.70 : 0.66) : 0.75; }

// Style de quai par ère : promenade qui évolue pierre -> marbre -> béton/fonte ->
// néon -> énergie cosmique. (Palette cosmique inlinée pour éviter un import croisé.)
// Exporté : le REFLET du mur dans l'eau (iso/isoReflect.js) lit les mêmes couleurs.
export function quayStyleFor(band) {
  const COSMIC = {
    7: { mid: "#1d5640", core: "#0c241a", glow: "90,240,180" },
    8: { mid: "#4a3a1c", core: "#221808", glow: "255,205,120" },
    9: { mid: "#322a52", core: "#161226", glow: "170,140,255" }
  };
  // Style par ère. `coping`/`wallTop`/`wallBot`/`wallJoint`/`wallTiles` = la BERGE
  // MAÇONNÉE (mur du bord d'eau, cf. iso/isoQuay.js) : margelle claire + parement
  // haut→bas + joints d'assise + hauteur (en tuiles).
  let st;
  if (band <= 4) {                   // pierre (2-3) / marbre (4)
    const marble = band >= 4;
    st = {
      W: 0.7, walk: marble ? "#cdc6b2" : "#a89a78", face: marble ? "#8f8770" : "#6e6044",
      lip: "rgba(0,0,0,0.40)", edge: marble ? "rgba(255,250,235,0.30)" : "rgba(255,240,205,0.20)",
      rail: null, joints: "rgba(0,0,0,0.16)", lamp: "255,214,150", glow: null,
      coping: marble ? "#ece6d6" : "#d8cfb4", wallTop: marble ? "#b3ab92" : "#8a7f60",
      wallBot: marble ? "#6f684f" : "#4e4230", wallJoint: "rgba(0,0,0,0.30)", wallTiles: quayWallTiles(band)
    };
  } else if (band <= 6) {            // fonte (5) / néon (6)
    const neon = band >= 6;
    st = {
      W: 0.85, walk: neon ? "#6f7480" : "#827a6e", face: neon ? "#3e424c" : "#4f4940",
      lip: "rgba(0,0,0,0.44)", edge: "rgba(222,230,240,0.16)",
      rail: "rgba(16,20,26,0.85)", joints: null, lamp: neon ? "150,225,255" : "255,208,150",
      glow: neon ? "120,220,255" : null,
      coping: neon ? "#8f99a8" : "#9c968c", wallTop: neon ? "#40444e" : "#5f5a52",
      wallBot: neon ? "#202329" : "#302c26", wallJoint: "rgba(0,0,0,0.34)", wallTiles: quayWallTiles(band)
    };
  } else {                           // cosmique 7-9 : quai d'énergie
    const cp = COSMIC[band] || COSMIC[9];
    st = { W: 0.9, walk: cp.mid, face: cp.core, lip: "rgba(0,0,0,0.45)", edge: null, rail: null, joints: null, lamp: cp.glow, glow: cp.glow,
      coping: cp.mid, wallTop: cp.core, wallBot: "#0a0a12", wallJoint: "rgba(0,0,0,0.30)", wallTiles: quayWallTiles(band) };
  }
  return st;
}

// Couleurs RÉELLEMENT peintes du mur (éclaircies par quayWallTune.light, cf. isoQuay) :
// le reflet du mur dans l'eau (iso/isoReflect.js) part de celles-là.
export function quayWallColors(band) {
  const st = quayStyleFor(band), LT = quayWallTune.light;
  return { top: lightenHex(st.wallTop, LT), bot: lightenHex(st.wallBot, LT), coping: lightenHex(st.coping, LT) };
}

// Éclaircit une couleur "#rrggbb" en la fondant vers le blanc de `t` (0..1) → "rgb(...)".
// Sert à rendre la berge maçonnée « un peu plus claire » sans retoucher chaque teinte d'ère.
function lightenHex(hex, t) {
  if (!t || typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const L = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${L((n >> 16) & 255)},${L((n >> 8) & 255)},${L(n & 255)})`;
}

/* ============================================================================
 * PARTIE 2 — L'ÉMEUTE
 *   La SIMULATION (`updateCrisis` et ses aides) vit ici ; le DESSIN des émeutiers
 *   est passé au peintre iso, seul `drawRiotWeapon` étant resté.
 *   Evenements visuels lies a l'instabilite.
 * ============================================================================ */

const RIOT_WONDER_CLEAR_R = WONDER_CLEAR_R + 2;

// ⚠ PERF (audit 2026-10-05, PERF-6) : le test de dégagement appelait, pour CHAQUE
// merveille, cmWonderActive → currentEraIndex (une boucle Decimal sur toutes les
// ères), et il était lui-même appelé pour chaque passant au recrutement et pour
// chaque case de route au choix du but — 1,2 à 1,5 s de gel au déclenchement d'une
// émeute en fin de partie, puis 30 à 50 ms toutes les 5 s. Les emplacements des
// merveilles actives sont désormais relevés UNE fois par frame d'émeute
// (riotZonesRefresh, en tête de la branche active d'updateCrisis), et la liste des
// routes sûres une fois par (liste de routes, emplacements). Même test, mêmes
// cases, même ordre : le tirage au sort ne change pas.
let _riotSlots = [];
let _riotSafe = { list: null, len: -1, layout: null, sig: null, roads: [] };
function riotZonesRefresh() {
  _riotSlots = [];
  if (!CM.layout || !Array.isArray(state.wonders) || !state.wonders.length) return;
  const act = cmWonderActiveIds(state);
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    if (act.has(CM_WONDERS[wi].id)) _riotSlots.push(cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy));
  }
}

function cityMapRiotBlocked(gx, gy) {
  for (let i = 0; i < _riotSlots.length; i += 1) {
    const slot = _riotSlots[i];
    if (Math.hypot(gx - slot.gx, gy - slot.gy) <= RIOT_WONDER_CLEAR_R) return true;
  }
  return false;
}

// Routes où l'émeute a le droit d'aller : refiltrées seulement quand la liste des
// routes (relayout) ou les emplacements des merveilles actives changent.
function riotSafeRoads() {
  const list = CM.walkRoadList;
  const sig = _riotSlots.map((s) => s.gx + ',' + s.gy).join(';');
  const c = _riotSafe;
  if (c.list !== list || c.len !== list.length || c.layout !== CM.layout || c.sig !== sig) {
    _riotSafe = { list, len: list.length, layout: CM.layout, sig, roads: list.filter((r) => !cityMapRiotBlocked(r.gx, r.gy)) };
  }
  return _riotSafe.roads;
}

function cityMapPickRiotRoadNear(origin, radius) {
  if (!CM.walkRoadList.length) return null;
  const safeRoads = riotSafeRoads();
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

// ── LES ÉMEUTIERS SORTENT DES PASSANTS (docs/PLAN-COMPORTEMENTS.md, lot 4) ──────
// Ils surgissaient de nulle part et disparaissaient d'un coup à la fin de la fenêtre.
// Désormais un émeutier PREND la place d'un passant proche (celui-ci est masqué le
// temps de l'émeute, cf. agents.js) et la lui REND quand il se calme — fin de
// l'émeute, foule qui décroît, clic d'apaisement : le passant reprend sa journée là
// où l'émeutier s'est arrêté. Sans passant à portée, l'émeutier d'appoint s'EFFACE en
// fondu au lieu de disparaître.
// Jamais le passant DÉSIGNÉ (fiche d'habitant, BUG-86, audit du 2026-10-05) : masqué
// le temps de l'émeute, il laissait la caméra sur un trottoir vide et la fiche disait
// qu'il dormait, quand il défilait une torche à la main quelques rues plus loin.
function riotRecruit(anchor) {
  if (!anchor || !Array.isArray(CM.citizens)) return null;
  const followed = CM.focus ? CM.focus.p : null;
  let best = null, bd = 11;
  for (const c of CM.citizens) {
    if (c._riot || c._nightHidden || c.leaving || c.lead || c._enter || c.charType === 2 || c._vanish !== undefined) continue;
    if (c === followed) continue;
    if (c.fade != null && c.fade < 1) continue;
    // La distance d'abord : elle écarte presque tout le monde pour une soustraction.
    const d = Math.abs(c.gx - anchor.gx) + Math.abs(c.gy - anchor.gy);
    if (d >= bd) continue;
    if (cityMapRiotBlocked(c.gx, c.gy) || !CM.walkRoadSet.has(cityMapWalkRoadKey(c.gx, c.gy))) continue;
    bd = d; best = c;
  }
  return best;
}
function riotRelease(p) {
  const c = p._cit;
  if (c && c._riot === p) {
    c._riot = null;
    c.gx = p.gx; c.gy = p.gy; c.x = p.x; c.y = p.y; c.tx = p.tx; c.ty = p.ty;
    c.dir = p.dir; c.lox = p.lx || 0; c.loy = p.ly || 0;
    c.goal = null; c._path = null; c.pauseT = 0.6 + Math.random(); c.fade = 0.35;
    return;
  }
  if (!CM.riotFading) CM.riotFading = [];
  p._alpha = 1;
  CM.riotFading.push(p);
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
  // Calmé, il redevient le passant qu'il était (lot 4) — le « poof » marque l'instant.
  if (p._cit) riotRelease(p);
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
const RIOT_MIN = 0.5;
function updateCrisis(dt, now) {
  if (!CM.layout) return;
  const inst = state.instability || 0;

  if (!CM.rioters) CM.rioters = [];
  // Les émeutes n'éclatent qu'en fin d'après-midi, jusque dans le soir. La
  // fenêtre est publiée par le point de bascule du cycle (CM.riotWindow,
  // cityMapRuntime) : elle suit l'horloge SIMULÉE — l'option d'affichage
  // Jour/Nuit ne la touche pas — et vaut 23 % du temps réel, la dose de
  // l'ancienne courbe sinus. Ne PAS la re-dériver de CM.dayRising/nightF :
  // ceux-là portent le VISUEL (forçables).
  // En capture (CM.capture), la fenêtre est coupée à la source : les clichés
  // __cityShot sont déterministes, jamais de foule dessus.
  // Seuil = palier 50 de la jauge (« Instabilité croissante », naissance de la
  // vignette) ; il était à 55, un palier qui n'existait nulle part ailleurs.
  // Même foule au sommet : 8 émeutiers au seuil, 44 à 100 %.
  const afternoon = CM.riotWindow === true;
  const baseWant = afternoon && inst > RIOT_MIN && CM.walkRoadList.length ? Math.floor((inst - RIOT_MIN) / (1 - RIOT_MIN) * 36) + 8 : 0;
  // Les apaisements au clic réduisent la foule ; l'effet s'estompe avec le temps
  // (1 émeutier "revient" toutes les ~8 s tant que la tension persiste).
  if ((CM.riotCalmed || 0) > 0) {
    CM.riotCalmDecayT = (CM.riotCalmDecayT || 0) + dt;
    if (CM.riotCalmDecayT >= 8) { CM.riotCalmDecayT = 0; CM.riotCalmed -= 1; }
  }
  const want = baseWant > 0 ? Math.max(0, baseWant - (CM.riotCalmed || 0)) : 0;
  // Les émeutiers d'appoint qui s'effacent (sans passant à rendre) : 0,8 s de fondu.
  if (CM.riotFading && CM.riotFading.length) {
    for (const f of CM.riotFading) f._alpha -= dt / 0.8;
    CM.riotFading = CM.riotFading.filter((f) => f._alpha > 0);
  }
  if (want === 0) {
    for (const r of CM.rioters) riotRelease(r);
    CM.rioters.length = 0;
    CM.riotGoal = null;
    if (baseWant === 0) { CM.riotCalmed = 0; CM.riotCalmDecayT = 0; }
    CM.riotDraw = null;
  } else {
    // Les merveilles actives de CETTE frame (une seule lecture de l'ère, cf. PERF-6).
    riotZonesRefresh();
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
      const n = CM.rioters.length;
      // Un passant de la foule qui se lève (lot 4), sinon l'émeutier d'appoint d'avant.
      const cit = riotRecruit(spawnAnchor);
      const r = cit ? null : cityMapPickRiotRoadNear(spawnAnchor, 2 + Math.round(inst));
      if (!cit && !r) break;
      CM.rioters.push({
        gx: cit ? cit.gx : r.gx,
        gy: cit ? cit.gy : r.gy,
        x: cit ? cit.x : (r.gx + 0.5) * CM.TILE,
        y: cit ? cit.y : (r.gy + 0.5) * CM.TILE,
        tx: cit ? cit.tx : (r.gx + 0.5) * CM.TILE,
        ty: cit ? cit.ty : (r.gy + 0.5) * CM.TILE,
        dir: cit ? cit.dir : -1,
        pauseT: 0,
        // Allure d'une foule échauffée : un pas pressé (≈ 1,8 × un passant). Elle était
        // de 24-34 px/s — trois à huit fois un passant, la foule « glissait ».
        speed: 13 + Math.random() * 4,
        // Décalage de file LISSÉ (lx/ly), parti de celui du passant.
        lx: cit ? cit.lox || 0 : 0,
        ly: cit ? cit.loy || 0 : 0,
        _cit: cit || null,
        phase: Math.random() * Math.PI * 2,
        lane: (Math.random() - 0.5) * CM.TILE * 0.38,
        col: RIOT_OUTFITS[n % RIOT_OUTFITS.length],
        skin: RIOT_SKINS[(n * 7 + 3) % RIOT_SKINS.length],
        weapon: n % 2 === 0 ? "torch" : "fork",
        charType: cit ? cit.charType : (n % 3 === 0 ? 1 : 0) // émeutiers adultes, pas d'enfants
      });
      if (cit) cit._riot = CM.rioters[CM.rioters.length - 1];
    }
    if (CM.rioters.length > want) {
      for (const r of CM.rioters.slice(want)) riotRelease(r);
      CM.rioters.length = want;
    }
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
          // File lissée par la distance marchée (comme les passants) : le décalage
          // sautait d'un côté à l'autre à chaque virage.
          const tlx = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
          const tly = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
          const lk = Math.min(1, sp / (CM.TILE * 0.9));
          p.lx = (p.lx || 0) + (tlx - (p.lx || 0)) * lk;
          p.ly = (p.ly || 0) + (tly - (p.ly || 0)) * lk;
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
  ensureQuayGate,
  updateCrisis,
  drawRiotWeapon,
  cityMapCalmRioterAt
};
