 
import { state } from '../core/state.js';
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W, roadWidthFor, medianHalfFor } from './layout.js';
import { worldToScreen as projWorldToScreen, panDeltaToScreen } from './iso/projection.js';
import { bridgeLiftScreen, bridgeWalkBand, bridgeTune } from './iso/isoBridge.js';
import { VEH_SKINS } from './vehicleSkins.js';

/* ---- legacy citymap rendering\agents.js ---- */


/* ============================================================================
 * citymap-render-agents.js - Pietons, vehicules et bateaux de la carte.
 * ============================================================================ */

function getVehicleDensity(eraIndex, rank) {
  // Pas de charrettes au milieu des places : elles sont piétonnes.
  if (rank === "plaza") return 0;
  const rankBase = rank === "main" ? 1.15 : rank === "avenue" ? 0.78 : rank === "secondary" ? 0.35 : 0.05;
  const ageBase = eraIndex < 3 ? 0.02 : eraIndex < 7 ? 0.22 : eraIndex < 11 ? 0.42 : eraIndex < 13 ? 0.72 : eraIndex < 18 ? 0.98 : 1.12;
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  return ruined ? rankBase * 0.08 : rankBase * ageBase;
}

// Tout ce qui roule au moteur : voiture, tram et la flotte moderne du pack.
const MOTOR_TYPES = new Set(["car", "tram", "bus", "van", "truck", "taxi", "police", "ambulance"]);

function chooseRoadVehicleType(eraIndex, rank, seed) {
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  if (ruined) return "broken_cart";
  // Sélection pondérée par la config d'âge × le profil de la ville : une cité
  // marchande déborde de caravanes, une cité militaire fait défiler ses chars.
  const ageCfg = CM.layout && CM.layout.ageCfg;
  const personality = CM.layout && CM.layout.personality;
  if (ageCfg && Array.isArray(ageCfg.vehicles) && ageCfg.vehicles.length) {
    const bias = (personality && personality.vehicleBias) || {};
    let total = 0;
    const weighted = ageCfg.vehicles.map((v) => {
      const w = Math.max(0, v.weight * (bias[v.type] || 1));
      total += w;
      return { type: v.type, w };
    });
    if (total > 0) {
      let roll = ((seed * 2654435761) >>> 0) % 1000 / 1000 * total;
      for (const v of weighted) {
        roll -= v.w;
        if (roll <= 0) {
          // Véhicules à MOTEUR réservés aux grands axes (sinon retombe sur un
          // wagon). La règle valait déjà pour la voiture et le tram ; le bus et
          // le camion, plus longs qu'une berline, n'ont rien à faire dans une
          // venelle — ils y déborderaient de la chaussée.
          if (MOTOR_TYPES.has(v.type) && rank !== "main" && rank !== "avenue") return "wagon";
          return v.type;
        }
      }
    }
  }
  // Fallback historique (layout pas encore généré).
  if (eraIndex < 3) return "basket";
  if (eraIndex < 6) return "wagon";                   // véhicules poussés à la main retirés (Raph 2026-07-29)
  if (eraIndex < 9) return seed % 2 === 0 ? "chariot" : "wagon";
  if (eraIndex < 11) return seed % 3 === 0 ? "caravan" : seed % 3 === 1 ? "wagon" : "chariot";
  if (eraIndex >= 13 && seed % 4 === 0) return "drone";
  if (eraIndex >= 11 && (rank === "main" || rank === "avenue")) return seed % 3 === 0 ? "tram" : "car";
  if (eraIndex >= 11) return seed % 2 === 0 ? "car" : "wagon";
  if (rank === "main" && seed % 4 === 0) return "chariot";
  if ((rank === "main" || rank === "avenue") && seed % 3 === 0) return "caravan";
  return "wagon";
}

const CM_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ── Habitants pixel-art animés (PixelLab) ────────────────────────────────────
// Bandes de marche (6 frames de 68px) : public/pixelart/agents/{name}-{dir}.png.
// dir = index p.dir (CM_DIRS) : 0=east, 1=west, 2=south, 3=north.
// Set de persos PAR ÈRE [homme, femme, enfant] ; type tiré par citoyen (p.charType).
// Repli sur le villageois si une ère n'a pas (encore) ses sprites ; sinon silhouette
// vectorielle tant que rien n'est chargé.
const VILLAGER_DIRS = ['east', 'west', 'south', 'north'];
// `AGENT_NF` (nombre de frames) et `AGENT_FW` (largeur de frame) ne servaient plus
// qu'au découpage top-down, parti à l'étape 6 le 2026-08-23. `AGENT_FH` reste.
const AGENT_FH = 68;
const AGENT_FEET = 0.88; // pieds à ~88% du cadre → ancrage au sol
// Multiplicateur global de taille des habitants (live __villagerScale). Réduit à
// 62,5 % de l'ancien 0.8 (demande Raph 2026-07-29 : moitié, puis remontée de 25 %) :
// la ville a grandi, les silhouettes étaient trop grosses pour l'échelle des
// bâtiments. Toute la vie humaine de la carte passe par ici (habitants, pousseurs,
// bêtes de trait, émeutiers, porteurs de panier) + les humains des scènes moteur
// (cityEngineSprites.js) et le pas des piétons (__strideLen ci-dessous).
let AGENT_SCALE = 0.5;

// Cache générique : name -> { img:{dir->Image}, ready:n }
const agentChars = {};
// Rangement par catégorie : nom d'agent → sous-dossier de /pixelart/agents/.
function agentDir(name) {
  if (name === 'ox' || name === 'horse') return 'animals';
  if (name.startsWith('rioter-')) return 'events';
  return 'inhabitants';   // gens par ère + porteurs (basket-*)
}
function ensureAgentChar(name) {
  let c = agentChars[name];
  if (c) return c;
  c = { img: {}, ready: 0 };
  agentChars[name] = c;
  if (typeof Image !== 'undefined') for (const d of VILLAGER_DIRS) {
    const im = new Image();
    im.onload = () => { c.ready += 1; };
    im.src = '/pixelart/agents/' + agentDir(name) + '/' + name + '-' + d + '.png';
    c.img[d] = im;
  }
  return c;
}
const agentReady = (c) => !!c && c.ready >= VILLAGER_DIRS.length;

// scale = hauteur de rendu en tuiles (enfants plus petits). Structure PAR GENRE : plusieurs
// variantes d'HOMME et de FEMME par ère (diversité). La variante est tirée par citoyen
// (p.skinVariant) et FIXÉE au spawn. La variante « 2 » (peau métisse) est ajoutée au fil des
// générations PixelLab ; tant que ses sprites manquent, le rendu retombe sur la variante 0.
const AGENT_PREHISTORIC = {
  // Scales ×~1.46 depuis la régé FLAT 2026-08-03 (ratio perso/canvas 0.50 vs 0.728
  // des anciennes bandes) : même hauteur de perso à l'écran qu'avant.
  men: [{ name: 'caveman', scale: 1.31 }, { name: 'caveman2', scale: 1.31 }],       // + variante peau noire + tenue
  women: [{ name: 'cavewoman', scale: 1.25 }, { name: 'cavewoman2', scale: 1.25 }],
  child: { name: 'cavechild', scale: 0.87 },
};
const AGENT_MEDIEVAL = { // ère 2 (band 2-3) : paysans médiévaux — scales ×1.46 (régé FLAT, ratio 0.50)
  men: [{ name: 'villager', scale: 1.24 }, { name: 'villager2', scale: 1.24 }],             // + variante métisse
  women: [{ name: 'villagerwoman', scale: 1.24 }, { name: 'villagerwoman2', scale: 1.24 }], // + variante métisse
  child: { name: 'villagerchild', scale: 0.87 },
};
const AGENT_ANTIQUITY = { // ère 3 (band 4) : gréco-romain (tunique, drapé)
  // ⚠ greekman = PILOTE de la DA flat 2026-08-03 (canvas 56, perso 28 px → ratio
  // perso/canvas 0,50 contre 0,73 pour les bandes v3 « figurine » 92 px) : son scale
  // compense pour garder la MÊME hauteur de perso à l'écran que ses voisins (0,85 ×
  // 0,73/0,50 ≈ 1,24). À généraliser (ou re-normaliser à 0,85) au batch des 25.
  men: [{ name: 'greekman', scale: 1.24 }, { name: 'greekman2', scale: 1.24 }],       // + variante peau noire + tenue
  women: [{ name: 'greekwoman', scale: 1.24 }, { name: 'greekwoman2', scale: 1.24 }],
  child: { name: 'greekchild', scale: 0.87 },
};
const AGENT_INDUSTRIAL = { // ère 4 (band 5-6) : XIXe industriel — scales ×1.46 (régé FLAT, ratio 0.50)
  men: [{ name: 'industrialman', scale: 1.24 }, { name: 'industrialman2', scale: 1.24 }],       // + variante peau noire + tenue
  women: [{ name: 'industrialwoman', scale: 1.24 }, { name: 'industrialwoman2', scale: 1.24 }],
  child: { name: 'industrialchild', scale: 0.87 },
};
const AGENT_MODERN = { // band 6 (époque Néon, ères 30-34) : citoyen near-future de mégalopole — scales ×1.46 (régé FLAT, ratio 0.50)
  men: [{ name: 'modernman', scale: 1.24 }, { name: 'modernman2', scale: 1.24 }],
  women: [{ name: 'modernwoman', scale: 1.24 }, { name: 'modernwoman2', scale: 1.24 }],
  child: { name: 'modernchild', scale: 0.87 },
};
const AGENT_FUTURE = { // ère 5 (band ≥ 7) : cyberpunk néon sci-fi — scales ×1.46 (régé FLAT, ratio 0.50)
  men: [{ name: 'futureman', scale: 1.24 }, { name: 'futureman2', scale: 1.24 }],       // + variante peau noire + tenue
  women: [{ name: 'futurewoman', scale: 1.24 }, { name: 'futurewoman2', scale: 1.24 }],
  child: { name: 'futurechild', scale: 0.87 },
};
function agentSetForBand(band) {
  return band <= 1 ? AGENT_PREHISTORIC
    : band <= 3 ? AGENT_MEDIEVAL
      : band <= 4 ? AGENT_ANTIQUITY
        : band <= 5 ? AGENT_INDUSTRIAL   // Fonte : XIXe industriel
          : band <= 6 ? AGENT_MODERN     // Néon : citoyen near-future de mégalopole
            : AGENT_FUTURE;              // cosmique : cyberpunk sci-fi
}
// Spec (nom+scale) d'un genre/variante. charType 0=homme 1=femme 2=enfant ; variant tiré au
// spawn (p.skinVariant). Modulo → repli sur la variante 0 si l'ère n'a qu'une variante.
function agentSpecFor(set, charType, variant = 0) {
  if (charType === 2) return set.child;
  const list = (charType === 1 ? set.women : set.men);
  return list[variant % list.length] || list[0];
}
// Émeutiers PIXEL par ère : MÊME découpage en bandes que les habitants ci-dessus,
// pour qu'une émeute porte le costume de son ère (cohérence carte). Renvoie le
// PRÉFIXE d'ère du nom de sprite « rioter-<préfixe><genre>-<arme> » ; '' = médiéval,
// le jeu de base non préfixé (fichiers rioter-<genre>-<arme> déjà présents). Les
// autres ères sont préfixées (stone-/anti-/ind-/fut-) et servent de repli au médiéval
// tant qu'elles n'ont pas encore leurs sprites.
function riotEraKey(band) {
  return band <= 1 ? 'stone-'
    : band <= 3 ? ''
      : band <= 4 ? 'anti-'
        : band <= 6 ? 'ind-'
          : 'fut-';
}
const AGENT_FALLBACK = { name: 'villager', scale: 0.82 }; // repli ultime si un sprite manque

// Roster des personnages que le rendu ISO peut réclamer en vue DIAGONALE :
// habitants d'ère + porteurs de panier (le porteur est un « véhicule » côté
// moteur mais se dessine comme un piéton). Un nom SANS ses 4 bandes diagonales
// retombe silencieusement sur la bande cardinale et marche donc de face sur une
// route en biais — invisible au lint comme au rendu automatisé, d'où la garde
// d'existence de __tests__/isoAgentDiagonals.test.js.
const BASKET_CARRIERS = ['basket-man', 'basket-woman'];
const ISO_AGENT_NAMES = [...new Set([
  ...[AGENT_PREHISTORIC, AGENT_MEDIEVAL, AGENT_ANTIQUITY, AGENT_INDUSTRIAL, AGENT_MODERN, AGENT_FUTURE]
    .flatMap((set) => [...set.men, ...set.women, set.child].map((s) => s.name)),
  ...BASKET_CARRIERS,
])];

ensureAgentChar('villager');
for (const set of [AGENT_PREHISTORIC, AGENT_MEDIEVAL, AGENT_ANTIQUITY, AGENT_INDUSTRIAL, AGENT_MODERN, AGENT_FUTURE])
  for (const s of [...set.men, ...set.women, set.child]) ensureAgentChar(s.name);
if (typeof window !== 'undefined') window.__villagerScale = (h) => { AGENT_SCALE = +h || 1; };

// ── Helper PARTAGÉ : dessine un personnage PIXEL NOMMÉ (bande de marche 4 dirs,
// AGENT_NF frames) à une position écran (sx = centre horizontal, groundY = ligne de
// pieds). Charge paresseusement /pixelart/agents/{name}-{dir}.png. Réutilisé par les
// porteurs de panier (ci-dessous), les émeutiers (quaysAndRiot.js, ex-renderWorld) et les habitants
// d'ère — fini le vieux blob vectoriel. Renvoie { drawW, drawH, top } si un sprite a
// été posé, ou false si le sprite n'est pas prêt (l'appelant garde son repli vectoriel).
function drawNamedAgent(ctx, sx, groundY, z, name, scale, dir, walking, now, phase, scaleMul = 1) {
  const chr = ensureAgentChar(name);
  if (!agentReady(chr)) return false;
  const d = (dir >= 0 && dir < 4) ? dir : 2;
  const drawH = Math.max(1, Math.round(CM.TILE * z * scale * AGENT_SCALE * scaleMul)), drawW = drawH;
  const img = chr.img[VILLAGER_DIRS[d]] || chr.img.south;
  // Frame DÉDUITE de l'image (frames carrées) : les bandes flat 2026-08 sortent en
  // 56-60 px, plus au 68 historique. Coordonnées entières contre le fourmillement.
  const fh = img.naturalHeight || AGENT_FH;
  // Nombre d'images DÉDUIT de la bande, comme le fait déjà le jumeau iso : la hauteur
  // de frame l'était déjà, le COMPTE restait sur AGENT_NF en dur. Toutes les bandes
  // actuelles en ont bien 6, mais une bande plus courte y tirait des frames hors cadre
  // — panne muette, le sprite disparaît une image sur deux au lieu de crier.
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const frame = walking ? (Math.floor((now || 0) / 160 + (phase || 0) * 6) % nf) : 0;
  const left = Math.round(sx - drawW / 2), top = Math.round(groundY - AGENT_FEET * drawH);
  const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, frame * fh, 0, fh, fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prevS;
  return { drawW, drawH, top };
}

// Habitant PIXEL de l'ère courante (set par eraBand, repli villager). Même contrat
// que drawNamedAgent. charType: 0=homme 1=femme 2=enfant. À réutiliser pour migrer
// les ouvriers de scènes de bâtiments encore vectoriels.
function drawEraAgent(ctx, sx, groundY, z, dir, walking, now, phase, charType, scaleMul = 1) {
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const spec = agentSpecFor(agentSetForBand(band), charType) || AGENT_FALLBACK;
  return drawNamedAgent(ctx, sx, groundY, z, spec.name, spec.scale, dir, walking, now, phase, scaleMul)
      || drawNamedAgent(ctx, sx, groundY, z, AGENT_FALLBACK.name, AGENT_FALLBACK.scale, dir, walking, now, phase, scaleMul);
}

// ── Bandes de marche DIAGONALES (chantier iso, Phase 4) ──────────────────────
// Mêmes conventions que les bandes cardinales (AGENT_NF frames de 68 px) mais en
// vues diagonales : /pixelart/agents/…/{name}-southeast.png etc. En mode iso, la
// direction MONDE (E/O/S/N) se projette sur UNE diagonale ÉCRAN : E→SE, O→NO,
// S→SO, N→NE — donc seules les 4 diagonales servent en iso. Générées par vagues
// PixelLab (pilote : greekman, cf. scripts/fetchAgentsIso.mjs) ; tant qu'une
// bande manque (onerror), l'appelant retombe sur la bande cardinale.
const ISO_DIAG = ['southeast', 'northwest', 'southwest', 'northeast']; // index = dir monde 0..3
// Chargeur d'image avec RE-ESSAI : un asset généré PENDANT que le jeu tourne
// (batch PixelLab) répondait 404 une fois et restait mémorisé absent → repli
// cardinal permanent jusqu'au F5 (vu par Raph sur les voitures). 3 re-essais
// espacés (8/16/24 s) avec cache-buster ; au-delà, l'asset est réputé absent.
function loadWithRetry(src, onOk, onFail) {
  const im = new Image();
  let tries = 0;
  im.onload = () => onOk(im);
  im.onerror = () => {
    tries += 1;
    if (tries <= 3) setTimeout(() => { im.src = src + '?r=' + tries; }, tries * 8000);
    else if (onFail) onFail();
  };
  im.src = src;
  return im;
}

const agentDiagChars = {};
function ensureAgentDiag(name) {
  let c = agentDiagChars[name];
  if (c) return c;
  c = { img: {}, imgHalf: {}, ready: 0, failed: 0 };
  agentDiagChars[name] = c;
  if (typeof Image !== 'undefined') for (const d of ISO_DIAG) {
    c.img[d] = loadWithRetry(
      '/pixelart/agents/' + agentDir(name) + '/' + name + '-' + d + '.png',
      () => { c.ready += 1; },
      () => { c.failed += 1; },
    );
    // Bande DEMI-TAILLE pré-cuite optionnelle ({name}-{d}-half.png, réduction ÷2
    // box+palette faite hors ligne) : au petit zoom le canvas la dessine à ~1:1 au
    // lieu d'écraser la bande pleine à ×0,4-0,5 (bruit + fourmillement de marche).
    // Asset optionnel : un seul essai sans retry ; absent → bande pleine comme avant.
    const im = new Image();
    c.imgHalf[d] = im;
    im.src = '/pixelart/agents/' + agentDir(name) + '/' + name + '-' + d + '-half.png';
  }
  return c;
}
// ── Personnage NOMMÉ en VUE DIAGONALE (jumeau iso de drawNamedAgent) ─────────
// Bandes /pixelart/agents/…/{name}-{southeast|…}.png via ensureAgentDiag.
// ⚠ Taille de frame DÉDUITE de l'image (frames carrées : fw = hauteur de bande) —
// les personnages v3 sortent en 92×92, pas au 68 des bandes standard.
// `distPx` (odomètre p.walkDist, px monde) : l'animation avance PAR DISTANCE parcourue
// (un pas ≈ __strideLen px monde par frame, défaut 2.2) → les pieds accrochent le sol,
// fini le patinage (retour Raph). Repli cadence temporelle si absent.
// Renvoie { drawW, drawH, top } comme le cardinal (l'émeutier y ancre son halo
// de torche), ou false si une des 4 bandes manque (l'appelant garde son repli).
// Ligne de PIEDS mesurée d'une bande (dernière rangée opaque / hauteur du cadre) :
// les rosters PixelLab gardent ~12 % de marge transparente SOUS les pieds (mesuré :
// footF ≈ 0.75 sur quasi toutes les bandes) — ancrer avec AGENT_FEET (0.88) y
// suspend le sprite au-dessus du point de sol. Invisible sans repère… mais criant
// dès qu'une OMBRE est posée au sol (« les émeutiers volent », Raph 2026-07-16).
// Mesurée UNE fois par bande, à la demande ; repli AGENT_FEET si lecture impossible.
function agentFootF(c, img) {
  if (c.footF != null) return c.footF;
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    let cv;
    if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(w, h);
    else { cv = document.createElement('canvas'); }
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    let bottom = -1;
    for (let y = h - 1; y >= 0 && bottom < 0; y -= 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 16) { bottom = y; break; }
      }
    }
    c.footF = bottom >= 0 ? (bottom + 1) / h : AGENT_FEET;
  } catch { c.footF = AGENT_FEET; }
  return c.footF;
}
// groundFeet=true : ancre les PIEDS MESURÉS sur groundY (émeutiers : leur ombre
// est posée là). Opt-in — le défaut AGENT_FEET reste pour habitants/attelages
// (leurs calages relatifs, timons compris, ont été réglés avec cette constante).
function drawNamedAgentIso(ctx, sx, groundY, z, name, scale, dir, walking, now, phase, scaleMul = 1, distPx = null, groundFeet = false) {
  const c = ensureAgentDiag(name);
  if (c.ready < ISO_DIAG.length) return false;
  const d = (dir >= 0 && dir < 4) ? dir : 2;
  let img = c.img[ISO_DIAG[d]];
  let fh = img.naturalHeight || AGENT_FH;
  // Taille ENTIÈRE : en sous-pixel, le nearest ré-échantillonne différemment à
  // chaque position → le sprite fourmille en marchant. Et sous 70 % de la bande
  // pleine, bascule sur la bande -half pré-cuite (ratio rendu ~1:1, fini le bruit).
  const drawH = Math.max(1, Math.round(CM.TILE * z * scale * AGENT_SCALE * scaleMul)), drawW = drawH;
  const half = c.imgHalf[ISO_DIAG[d]];
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) {
    img = half;
    fh = half.naturalHeight;
  }
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  let frame = 0;
  if (walking) {
    if (distPx != null) {
      // Pas exprimé AVANT AGENT_SCALE (2.75 · 0.8 = 2.2, le réglage d'origine) : la
      // longueur d'un pas suit la taille du sprite, sinon un habitant rétréci couvre
      // toujours 2.2 px monde par frame et ses petites jambes patinent.
      const stride = (typeof window !== 'undefined' && window.__strideLen != null) ? window.__strideLen : 2.75 * AGENT_SCALE;
      frame = Math.floor(distPx / Math.max(0.5, stride) + (phase || 0) * nf) % nf;
    } else {
      frame = Math.floor((now || 0) / 160 + (phase || 0) * 6) % nf;
    }
  }
  const feetF = groundFeet ? agentFootF(c, img) : AGENT_FEET;
  const left = Math.round(sx - drawW / 2), top = Math.round(groundY - feetF * drawH);
  const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, frame * fh, 0, fh, fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prevS;
  return { drawW, drawH, top };
}
// Habitant d'ère en VUE DIAGONALE si sa bande existe ; false sinon (repli cardinal).
function drawEraAgentIso(ctx, sx, groundY, z, dir, walking, now, phase, charType, scaleMul = 1, distPx = null) {
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const spec = agentSpecFor(agentSetForBand(band), charType) || AGENT_FALLBACK;
  return !!drawNamedAgentIso(ctx, sx, groundY, z, spec.name, spec.scale, dir, walking, now, phase, scaleMul, distPx);
}

// ── Vues DIAGONALES des véhicules (chantier iso) ─────────────────────────────
// veh-{type}-{southeast|northwest|southwest|northeast}.png (1 frame, rotations
// d'objets 8-directions PixelLab). Même contrat que les habitants : en iso la
// dir monde se projette sur une diagonale écran ; repli cardinal tant que la
// vue manque (onerror toléré).
const vehDiagImg = {};
// `skin` = teinte/modèle d'INSTANCE de la flotte moderne (cf. vehicleSkins.js) :
// veh-car-sedan-red-southeast.png. Chargement PARESSEUX, une entrée de cache par
// skin — la flotte compte 20 teintes de voiture, les charger toutes au démarrage
// ferait 80 requêtes pour les 6 skins qu'une ville affiche réellement.
function ensureVehDiag(type, skin) {
  const key = skin ? type + '/' + skin : type;
  let c = vehDiagImg[key];
  if (c) return c;
  c = { img: {}, ready: 0, failed: 0 };
  vehDiagImg[key] = c;
  const stem = '/pixelart/agents/vehicles/veh-' + type + (skin ? '-' + skin : '');
  if (typeof Image !== 'undefined') for (const d of ISO_DIAG) {
    c.img[d] = loadWithRetry(
      stem + '-' + d + '.png',
      () => { c.ready += 1; },
      () => { c.failed += 1; },
    );
  }
  return c;
}
const vehDiagReady = (c) => !!c && c.ready >= ISO_DIAG.length;

// Rebrassage avant tirage : l'appelant fournit un compteur de spawn, dont les bits
// de poids faible suivent l'ordre d'apparition. Sans fmix32 les cinq premières
// voitures d'une rue sortent dans l'ordre du catalogue (cf. la démonstration du
// damier dans housePalette.js).
function fmix32(x) {
  let h = x >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}
// ⛔ LA FLOTTE DU PACK NE ROULE QU'À PARTIR DE LA BANDE 6. Refus de Raph le
// 2026-08-05 devant sa capitale monumentale (bande 5, pierre et colonnades) : des
// berlines des années 2000 dessus, « ça ne va pas ». Le gel se joue ICI et pas
// seulement dans les poids d'ère : le type `car` existe des deux côtés de la
// frontière, et sans cette garde une voiture de bande 5 garderait son nom tout en
// se repeignant en SUV blanc. Sous la frontière, skin vide = la vieille automobile.
const MODERN_FLEET_BAND = 6;
// Teinte/modèle d'une instance. Chaîne vide = bande nue (types sans skin, ère trop
// ancienne, et repli si le manifeste ne connaît pas le type).
function vehSkinFor(type, seed, band) {
  if ((band | 0) < MODERN_FLEET_BAND) return '';
  const list = VEH_SKINS[type] && VEH_SKINS[type].skins;
  if (!list || !list.length) return '';
  return list[fmix32(seed) % list.length];
}

// ── Véhicules pixel-art (objets directionnels PixelLab) ──────────────────────
// Bandes : agents/veh-{type}-{dir}.png (1 frame, 64px). dir = v.dir (0=E,1=W,2=S,3=N).
// Valeur = hauteur de rendu en tuiles (par type). Repli sur le rendu procédural si absent.
// Taille réduite (Raphaël) pour car ; global via __vehScale.
// Les véhicules POUSSÉS À LA MAIN sont retirés du jeu (Raph 2026-07-29, « ça ne rend pas
// bien ») : d'abord la brouette, puis la charrette à bras qui a la même silhouette — plus
// aucun tirage ne les produit (chooseRoadVehicleType, ageVisualConfig, cityPersonality) et
// leur absence d'ici suffit à ne plus charger leurs sprites. L'art reste sur le disque.
const VEH_SIZES = { wagon: 0.85, chariot: 0.8, caravan: 1.0, car: 0.72, tram: 1.4 };
// Flotte moderne (pack MinZinn) : les tailles viennent du MANIFESTE, écrit par le
// même script que les sprites. Un bus dessiné dans la boîte d'une berline serait
// simplement une image écrasée — la taille de boîte et la taille de cuisson sont
// deux faces d'un seul réglage, elles ne doivent pas pouvoir diverger.
// `car` garde la sienne : sa valeur est un réglage de Raph, pas une donnée du pack.
for (const [type, spec] of Object.entries(VEH_SKINS)) {
  if (VEH_SIZES[type] == null) VEH_SIZES[type] = spec.size;
}
// Poussés par un humain (de l'ère) placé derrière. Table VIDE depuis le retrait de la
// brouette et de la charrette : la mécanique du pousseur reste en place (ici et dans
// drawIsoVehicle) pour un futur véhicule à bras, elle ne s'arme simplement plus.
const VEH_PUSH = {};
// Véhicules TRACTÉS : un (ou deux) animaux de trait dessinés DEVANT, dans le sens de
// la marche, reliés par un timon procédural. animal = bande agent (horse/ox), n = nombre
// de bêtes, scale = hauteur en tuiles, dist = distance véhicule→attelage (en tuiles).
const VEH_PULL = {
  // Le char N'est PAS ici : son cheval est DÉJÀ dans le sprite veh-chariot → on
  // anime le sprite (bande multi-frames) au lieu d'ajouter un animal séparé.
  wagon:   { animal: 'ox',    n: 1, scale: 0.74, dist: 0.44 }, // wagon lourd : un bœuf
  caravan: { animal: 'horse', n: 1, scale: 0.72, dist: 0.46 }, // caravane : un cheval
};
// Multiplicateur global des véhicules (réglage live __vehScale). Réduit à 62,5 %
// (demande Raph 2026-07-29 : moitié, puis remontée de 25 %) en même temps que
// AGENT_SCALE : véhicules et piétons doivent rester à la MÊME échelle relative. Il
// porte aussi les DISTANCES d'attelage (pousseur, bêtes de trait) — sans ça
// l'équipage décrocherait de la carrosserie rétrécie — et le pas de roue des bandes
// diagonales. Lu aussi par le rendu ISO (liaison vive à l'import).
let VEH_SCALE = 0.625;
const vehImg = {};
function ensureVeh(type) {
  let c = vehImg[type];
  if (c) return c;
  c = { img: {}, ready: 0 };
  vehImg[type] = c;
  if (typeof Image !== 'undefined') for (const d of VILLAGER_DIRS) {
    const im = new Image();
    im.onload = () => { c.ready += 1; };
    im.src = '/pixelart/agents/vehicles/veh-' + type + '-' + d + '.png';
    c.img[d] = im;
  }
  return c;
}
const vehReady = (c) => !!c && c.ready >= VILLAGER_DIRS.length;
for (const t of Object.keys(VEH_SIZES)) ensureVeh(t);
// Animaux de trait (attelage) — chargés comme des bandes de marche d'agents.
for (const a of ['horse', 'ox']) ensureAgentChar(a);
// Drone MÉCANIQUE (quadricoptère, réf. l'ancien rendu SVG) : sprite pixel top-down UNIQUE,
// pivoté au rendu selon le cap. Repli procédural si pas chargé.
// On charge le CHÂSSIS SANS PALES (drone-mech-body.png, généré par
// scripts/splitDroneRotors.cjs) : les hélices étaient gravées/figées sur les
// bras. Elles sont redessinées et TOURNÉES au rendu (drawDroneRotors).
let droneChar = null;
function ensureDrone() {
  if (droneChar) return droneChar;
  droneChar = { img: null, ready: false };
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => { droneChar.ready = true; };
    im.src = '/pixelart/agents/vehicles/drone-mech-body.png';
    droneChar.img = im;
  }
  return droneChar;
}
// Moyeux des 4 rotors en FRACTION du sprite 64px (x,y depuis le centre) + sens de
// rotation (paires diagonales CW/CCW, comme un vrai quad). Généré par
// scripts/splitDroneRotors.cjs. Dessinés dans le repère local du sprite (déjà
// translaté au centre + pivoté au cap) → les hélices suivent le drone.
const DRONE_HUBS = [
  [-0.2578, -0.2422, 1],
  [0.2891, -0.2578, -1],
  [-0.2891, 0.2578, -1],
  [0.3047, 0.2891, 1],
];
const DRONE_ROTOR_R = 0.205;   // rayon du disque de souffle (fraction du sprite)
let droneRotorsOn = true;       // molette de debug __droneRotors(false)
if (typeof window !== 'undefined') {
  window.__droneRotors = (on) => { droneRotorsOn = on !== false; return droneRotorsOn; };
  // Taille globale du drone en live (défaut 0.58) : window.__droneSize(0.5) etc.
  window.__droneSize = (v) => { CM.droneSize = (+v > 0) ? +v : 0.58; return CM.droneSize; };
}
// Dessine les 4 hélices tournantes du drone. À appeler DANS le repère du sprite
// (origine = centre du drone, +y = arrière après le pivot au cap), avant restore.
// dsz = taille de rendu du sprite ; t = horloge (ms) ; phase = déphasage par drone.
function drawDroneRotors(ctx, dsz, t, phase) {
  // ⚠ CETTE GARDE MANQUAIT, et la molette mentait depuis toujours. `droneRotorsOn`
  // était ÉCRIT par `__droneRotors(false)` et relu par personne : appeler la molette
  // ne coupait rien, les rotors continuaient de tourner. Trouvé au balayage des 163
  // molettes du 2026-08-23 — quatrième drapeau du même motif (une molette est un
  // consommateur qui trompe le lint : le nom est « utilisé », mais jamais LU).
  // Réparée plutôt que retirée : le débranchement des rotors sert au réglage d'art,
  // et une ligne suffit à rendre vrai ce que le commentaire promettait.
  if (!droneRotorsOn) return;
  const r = dsz * DRONE_ROTOR_R;
  if (r < 1) return;                        // trop petit à l'écran : on saute
  const spin = t * 0.045;                   // vitesse de rotation (rapide)
  const prevA = ctx.globalAlpha;
  for (let i = 0; i < DRONE_HUBS.length; i += 1) {
    const h = DRONE_HUBS[i];
    ctx.save();
    ctx.translate(h[0] * dsz, h[1] * dsz);
    // Souffle : disque sombre translucide (aire balayée = flou de rotation).
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#0b0e14';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // Trace fugace des bouts de pale (anneau clair très léger).
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#cfd9e6';
    ctx.lineWidth = Math.max(0.5, r * 0.13);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    // 3 pales en éventail, tournantes (semi-transparentes → effet flou).
    ctx.rotate(spin * h[2] + i * 0.8 + phase);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#aeb9c8';
    for (let b = 0; b < 3; b += 1) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.07);
      ctx.lineTo(r * 0.9, -r * 0.025);
      ctx.lineTo(r * 0.9, r * 0.025);
      ctx.lineTo(0, r * 0.07);
      ctx.closePath();
      ctx.fill();
    }
    // Moyeu : petit disque sombre + éclat discret (l'axe qui tourne).
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#23272f';
    ctx.beginPath(); ctx.arc(0, 0, Math.max(0.5, r * 0.15), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(214,228,247,0.6)';
    ctx.beginPath(); ctx.arc(-r * 0.04, -r * 0.04, Math.max(0.3, r * 0.04), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = prevA;
}
if (typeof window !== 'undefined') window.__vehScale = (h) => { VEH_SCALE = +h || 1; };

// ── Bateaux pixel-art (objets top-down PixelLab, vue est unique) ─────────────
// Fichier : agents/boat-{stage}.png (1 frame, 64px). Le fleuve étant ~horizontal,
// drawShips applique déjà miroir est↔ouest + inclinaison au repère → une seule vue
// (proue à droite, superstructure vers le haut) suffit. Valeur = FRACTION de remplissage
// du sprite dans son cadre 64px (≈0.7) ; la TAILLE par stade (croissante, gigantisme
// final) est portée par sizeMul de drawShips, PAS ici — à ajuster au cas par cas selon
// le cadrage de chaque PNG. Repli procédural si le sprite du stade n'est pas (encore)
// chargé. Le cosmic partage une clé de remplissage mais 3 teintes par band
// (boat-cosmic-{7,8,9}). Chargement PARESSEUX : seul le bateau de l'ère courante est
// demandé (pas de préchargement en masse → pas de 404 inutiles).
const BOAT_SIZES = { raft: 0.7, sail: 0.7, steam: 0.7, container: 0.7, cosmic: 0.7 };
const BOAT_LIFT = 0.06; // remonte un peu le sprite pour poser la coque sur l'eau
// `BOAT_SCALE` et sa molette `__boatScale` ne servaient qu'au `drawShips` top-down,
// parti à l'étape 6. La flotte iso a sa propre échelle (isoRenderer, BOAT_IMG_K).
const boatImg = {};
function ensureBoat(name) {
  let c = boatImg[name];
  if (c) return c;
  c = { img: null, ready: false };
  boatImg[name] = c;
  if (typeof Image !== 'undefined') {
    const im = new Image();
    im.onload = () => { c.ready = true; };
    im.src = '/pixelart/agents/boats/boat-' + name + '.png';
    c.img = im;
  }
  return c;
}
const boatReady = (c) => !!c && c.ready && c.img && c.img.naturalWidth > 0;

function cityMapWalkRoadKey(gx, gy) {
  return gx * 10000 + gy;
}

function cityMapDirBit(dirIndex) {
  return dirIndex === 0 ? ROAD_E : dirIndex === 1 ? ROAD_W : dirIndex === 2 ? ROAD_S : ROAD_N;
}

function roadStepAllowed(gx, gy, dirIndex) {
  const road = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
  const nx = gx + CM_DIRS[dirIndex][0], ny = gy + CM_DIRS[dirIndex][1];
  if (road) {
    if (road.mask & cityMapDirBit(dirIndex)) return true;
    // Quitter la chaussée vers une cellule piétonne HORS réseau (parvis de
    // merveille) : le mask ne connaît que les routes — autorisé si la cellule
    // visée est marchable-parvis. Piétons seulement (les véhicules suivent les masks).
    return !!(CM.wonderWalkSet && CM.wonderWalkSet.has(cityMapWalkRoadKey(nx, ny)));
  }
  return CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny));
}

// But sur la RIVE OPPOSÉE (force une traversée de pont, l'unique passage). null
// si pas de fleuve ou rive opposée vide. Listes précalculées dans CM.bankRoads.
function crossBankGoal(gx, gy) {
  const banks = CM.bankRoads;
  const ry = CM.layout && CM.layout.river && CM.layout.river.riverYAt;
  if (!banks || !ry) return null;
  const list = gy < ry(gx) ? banks.s : banks.n;
  if (!list || !list.length) return null;
  const r = list[(Math.random() * list.length) | 0];
  return { gx: r.gx, gy: r.gy };
}

// ── Naître devant chez soi, s'effacer devant une porte ───────────────────────
// « Les habitants popent au hasard et disparaissent au milieu de la rue » (Raph
// 2026-07-29). Les deux bouts de vie d'un piéton se raccrochent donc aux SEUILS,
// les cellules-route qui bordent un bâtiment (CM.buildingEdgeSet / homeRoadCells,
// publiés par cityMapEnsureLayout) : il sort d'un logement, il rentre par la
// première porte venue.

// Cellule d'APPARITION : un seuil de LOGEMENT (les doublons de homeRoadCells font
// sortir plus de monde des quartiers denses). Repli sur la voirie tant qu'aucun
// logement n'est bordé de route — un hameau de départ n'a encore que des chemins.
function citizenSpawnCell(seed) {
  const homes = CM.homeRoadCells;
  if (homes && homes.length) return homes[seed % homes.length];
  const list = CM.walkRoadList;
  return (list && list.length) ? list[seed % list.length] : null;
}

// Est-il DEVANT UNE PORTE ? Tant que la ville ne publie pas ses seuils (partie
// neuve, harnais de test), on répond oui : mieux vaut l'ancien comportement qu'un
// habitant increvable qui garderait la foule au-dessus de sa cible pour toujours.
function citizenAtDoorstep(p) {
  const set = CM.buildingEdgeSet;
  if (!set || !set.size) return true;
  return set.has(cityMapWalkRoadKey(p.gx, p.gy));
}

// Seuil le plus proche, pour l'habitant EN PARTANCE (la ville dépasse sa cible de
// foule). Sans ce cap il flânerait au hasard en attendant de croiser une porte, et
// la foule mettrait très longtemps à redescendre. Scan linéaire assumé : une seule
// fois par départ, sur une liste dédupliquée.
function nearestDoorstep(p) {
  const list = CM.buildingEdgeList;
  if (!list || !list.length) return null;
  let best = null, bestD = Infinity;
  for (const c of list) {
    const d = (c.gx - p.gx) * (c.gx - p.gx) + (c.gy - p.gy) * (c.gy - p.gy);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// ── S'ABRITER SOUS L'AVERSE ─────────────────────────────────────────────────
// Il ne manquait presque rien (Raph 2026-07-29, « les faire courir jusqu'à chez eux
// quand il pleut ») : le palier météo de cityMapRuntime baisse déjà la cible de foule
// dès rainF > 0.15 (70 %, puis 35 % au-delà de 0.6) et les habitants en trop sont
// marqués EN PARTANCE — depuis les seuils, ils rentrent au lieu de s'évaporer. On
// ajoute le GESTE : on rentre CHEZ SOI quand c'est à portée, on court, et on ne
// s'attarde plus sur une place.
const RAIN_SHELTER = 0.15;   // même seuil que le 1er palier de foule (une seule vérité)
const RUN_K = 1.9;           // allure de course tant qu'on cherche l'abri
const SHELTER_HOME_MAX = 14; // au-delà (en tuiles), on se met à couvert sous le 1er toit
const citizenSheltering = (p) => !!p.leaving && (CM.rainF || 0) > RAIN_SHELTER;

// Où s'efface-t-on ? Le DORMEUR entre par la porte la plus proche : il ne va nulle
// part, il rentre. Celui qui s'ABRITE, lui, ne s'efface qu'à SA porte (p.leaveCell) —
// sinon, dans une ville dense où trois cellules sur quatre bordent un bâtiment, il se
// volatiliserait au deuxième pas et la course vers l'abri ne se verrait jamais. Tant
// que son cap n'est pas choisi (il l'est au pas suivant, citizenChooseNext), il ne
// s'efface pas — sauf si la ville ne publie aucun seuil : l'ancien comportement reprend
// alors la main plutôt que de laisser un habitant increvable.
function citizenAtShelter(p) {
  if (!p.leaving) return citizenAtDoorstep(p);
  if (p.leaveCell) return p.gx === p.leaveCell.gx && p.gy === p.leaveCell.gy;
  return !CM.buildingEdgeList || !CM.buildingEdgeList.length;
}

function citizenChooseNext(p) {
  if (!CM.walkRoadList.length) return;
  const reachable = (c) => !!c && CM.walkRoadSet.has(cityMapWalkRoadKey(c.gx, c.gy));
  // But devenu inatteignable (cellule rasée par un recalcul : domicile/atelier supprimé,
  // route émondée) : on le lâche et on en reprend un autre juste après → mouvement continu.
  if (p.goal && !reachable(p.goal)) p.goal = null;
  const arrived = p.goal && p.goal.gx === p.gx && p.goal.gy === p.gy;
  if (arrived && p.social) {
    // SEULE halte : la flânerie sur une PLACE ou un PARVIS de merveille (badauds,
    // marché, contemplation). Partout ailleurs les habitants ne s'arrêtent JAMAIS.
    p.social = false;
    p.pauseT = 2.5 + Math.random() * 5;
    if (p.gatherDir != null) {
      // Attroupement : on se TOURNE vers le monument et on contemple plus longtemps.
      p.dir = p.gatherDir;
      p.gatherDir = null;
      p.pauseT = 6 + Math.random() * 9;
    }
    p.goal = null;
    return;
  }
  if (arrived) p.goal = null; // hors place : on repart immédiatement, sans halte ni pas parasite
  // EN PARTANCE (la ville dépasse sa cible de foule) : cap immédiat sur le seuil le
  // plus proche, choisi UNE fois (repris s'il a été rasé par un recalcul). Traité
  // AVANT le tirage des envies du jour, et sans son re-tirage aléatoire : un partant
  // ne doit pas repartir en flânerie, sinon la foule ne redescend jamais.
  if (p.leaving) {
    if (!reachable(p.leaveCell)) {
      // Cap sur SON logement s'il est à portée — c'est chez soi qu'on rentre, sous
      // l'averse comme au départ. Trop loin (ou rasé) : le seuil le plus proche, on
      // ne traverse pas la ville entière sous la pluie pour son propre toit.
      const home = reachable(p.home) ? p.home : null;
      const dHome = home ? Math.abs(home.gx - p.gx) + Math.abs(home.gy - p.gy) : Infinity;
      p.leaveCell = dHome <= SHELTER_HOME_MAX ? home : nearestDoorstep(p);
    }
    if (reachable(p.leaveCell)) { p.goal = p.leaveCell; p.social = false; }
  }
  if (!p.goal || (!p.leaving && Math.random() < 0.05)) {
    const nf = CM.nightF || 0;
    const day = nf < 0.45;
    // Envie de rentrer : nulle en plein jour, croissante à la tombée du soir (0 quand
    // nightF ≤ 0.40, 1 dès nightF ≥ 0.70) → le soir, la foule reflue vers les quartiers
    // résidentiels ; le jour, elle gagne ateliers et places.
    const homeBias = Math.max(0, Math.min(1, (nf - 0.4) / 0.3));
    const plazaCells = CM.plazaRoadCells;
    const wonderCells = CM.wonderGatherCells;
    p.gatherDir = null; // ne survit qu'au but « merveille » repiqué ci-dessous
    const cross = Math.random() < 0.18 ? crossBankGoal(p.gx, p.gy) : null;
    if (cross) {
      p.goal = cross;
      p.social = false;
    } else if (reachable(p.home) && Math.random() < homeBias) {
      // Rentrer au domicile (cellule-route bordant un logement, encore présente).
      p.goal = p.home;
      p.social = false;
    } else if (day && wonderCells && wonderCells.length
      && Math.random() < 0.04 + 0.55 * (CM.wonderPull || 0)) {
      // Pèlerinage vers une MERVEILLE : filet continu de curieux (0.04) qui devient
      // une VAGUE pendant les fenêtres d'attroupement (wonderPull, cf. updateCitizens) —
      // la foule se forme en anneau autour du monument puis se disperse.
      const r = wonderCells[Math.floor(Math.random() * wonderCells.length)];
      p.goal = { gx: r.gx, gy: r.gy };
      p.social = true;
      p.gatherDir = r.face;
    } else if (reachable(p.work) && day && Math.random() < 0.5) {
      // Gagner son lieu de travail (bordure d'un bâtiment-moteur).
      p.goal = p.work;
      p.social = false;
    } else if (day && plazaCells && plazaCells.length && Math.random() < 0.35) {
      // Flânerie diurne vers une place publique (marché, parvis, jardin).
      const r = plazaCells[Math.floor(Math.random() * plazaCells.length)];
      p.goal = { gx: r.gx, gy: r.gy };
      p.social = true;
    } else {
      const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
      p.goal = { gx: r.gx, gy: r.gy };
      p.social = false;
    }
  }
  // Sécurité anti-piétinement : ne JAMAIS viser sa propre cellule (ex. domicile atteint la
  // nuit avec homeBias=1) — sinon le pas suivant tournerait en rond sur place. On repique
  // alors une cellule lointaine au hasard pour garantir un déplacement net et continu.
  if (p.goal && p.goal.gx === p.gx && p.goal.gy === p.gy) {
    const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
    p.goal = { gx: r.gx, gy: r.gy };
    p.social = false;
  }
  const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
  // MODE ESPLANADE (parvis de merveille, et SEULEMENT là) : la marche se libère de
  // la logique de rue — pas DIAGONAUX possibles entre cellules de parvis (lignes
  // naturelles qui traversent la place, au lieu du créneau cardinal des rues).
  // Les diagonales restent parvis↔parvis : entrer/sortir du parvis garde le pas
  // cardinal (masks de chaussée), et on ne coupe jamais un coin du SOCLE (les
  // deux cellules orthogonales intermédiaires doivent être marchables aussi).
  const onEsplanade = !!(CM.wonderWalkSet && CM.wonderWalkSet.has(cityMapWalkRoadKey(p.gx, p.gy)));
  const opts = [];
  for (let i = 0; i < 4; i += 1) {
    const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
    if (CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny)) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
  }
  if (onEsplanade) {
    for (const [ddx, ddy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = p.gx + ddx, ny = p.gy + ddy;
      if (!CM.wonderWalkSet.has(cityMapWalkRoadKey(nx, ny))) continue;
      if (!CM.wonderWalkSet.has(cityMapWalkRoadKey(p.gx + ddx, p.gy))
        || !CM.wonderWalkSet.has(cityMapWalkRoadKey(p.gx, p.gy + ddy))) continue;
      opts.push({ i: -2, nx, ny, ddx, ddy });   // i:-2 = pas diagonal (esplanade)
    }
  }
  if (!opts.length) { p.pauseT = 0.5 + Math.random() * 1.5; p.goal = null; return; } // cellule isolée : halte (pas de marche sur place)
  const forward = opts.filter((o) => o.i !== rev);
  const pool = forward.length ? forward : opts;
  // Cap tenu (adapté aux sprites pixel à 4 directions) : on vise le but en distance de
  // Manhattan et on garde sa direction dans les couloirs. Fini le gros bruit aléatoire
  // qui faisait pivoter le sprite à chaque cellule (« zigzag »). Invariant : bonus de
  // cap (0.7) + départage (≤ 0.25) < 1 (le gain d'un pas vers le but) → jamais de
  // détour ; à distance égale on continue tout droit plutôt que de tourner. Le petit
  // aléa ne sert qu'à départager les virages forcés (désynchronise les foules).
  let best = pool[0], bestScore = -Infinity;
  for (const o of pool) {
    let score = -(Math.abs(p.goal.gx - o.nx) + Math.abs(p.goal.gy - o.ny));
    if (o.i === p.dir) score += 0.7;
    score += Math.random() * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  p.gx = best.nx;
  p.gy = best.ny;
  if (best.i >= 0) {
    p.dir = best.i;
  } else {
    // Pas diagonal : le sprite (4 directions) prend le cap de l'axe encore le plus
    // long vers le but — la trajectoire suit la diagonale, la façade reste stable.
    const rdx = p.goal.gx - best.nx, rdy = p.goal.gy - best.ny;
    p.dir = Math.abs(rdx) > Math.abs(rdy) ? (best.ddx > 0 ? 0 : 1)
      : Math.abs(rdy) > Math.abs(rdx) ? (best.ddy > 0 ? 2 : 3)
        : (p.dir <= 1 ? (best.ddx > 0 ? 0 : 1) : (best.ddy > 0 ? 2 : 3));
  }
  p.tx = (p.gx + 0.5) * CM.TILE;
  p.ty = (p.gy + 0.5) * CM.TILE;
  // Cible de décalage-trottoir : bord DROIT du sens de marche (E→S, W→N, S→W, N→E),
  // amplitude ∝ largeur de la route de la cellule → sentier ≈ centré, grand axe = vrai
  // bord. Calculé une fois par pas (pas par frame) ; le rendu lisse la transition.
  const rank = vehicleRoadRank(p.gx, p.gy);
  // Décalage-trottoir : le piéton marche SUR le trottoir (bord EXPOSÉ de la cellule), pas dans
  // la voie roulable. En ISO, la ligne suit la GÉOMÉTRIE DE RUE publiée par le renderer
  // (CM.isoPedEdge = milieu de la bande de trottoir dès l'ère à trottoirs,
  // CM.isoPedEdgeLow = accotement des ères de terre) → les habitants marchent VRAIMENT
  // sur le trottoir DESSINÉ, et suivent ses molettes (__sidewalkIso). Legacy : 0.42 fixe.
  // Réglable live : window.__pedEdge (fraction de tuile) force tout.
  const bandPed = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0;
  // Hiérarchie des largeurs : la ligne de marche suit la chaussée de LA cellule
  // (sentier étroit = accotement resserré, boulevard = trottoir au large) via les
  // tables par rang publiées par le renderer ; repli sur les scalaires (rang
  // inconnu / hors-route / molette d'avant la hiérarchie).
  const sidewalkEra = bandPed >= (CM.isoSidewalkMinBand != null ? CM.isoSidewalkMinBand : 2);
  const pedByRank = sidewalkEra ? CM.isoPedEdgeByRank : CM.isoPedEdgeLowByRank;
  // ⚠ LE GARDE `!= null` N'EST PAS UN RESTE DU DRAPEAU (P3). `agents.js` ne peut
  // pas importer `isoRenderer` (import inverse) : la géométrie du trottoir lui est
  // PUBLIÉE sur `CM` par `syncIsoStreetGeom`. En test unitaire, elle est absente —
  // le repli plus bas doit survivre. Ne pas « simplifier » cette condition.
  const isoPed = CM.isoPedEdge != null
    ? (pedByRank && pedByRank[rank] != null ? pedByRank[rank]
      : (sidewalkEra ? CM.isoPedEdge : CM.isoPedEdgeLow))
    : null;
  let pedEdge = CM.TILE * ((typeof window !== 'undefined' && window.__pedEdge != null) ? window.__pedEdge
    : (isoPed != null ? isoPed : 0.42));
  // Étalement PERSONNEL dans la bande (iso) : chaque habitant tient SA ligne de
  // trottoir (tirée de sa phase, stable pas après pas) — une file au cordeau
  // exact faisait un rail robotique. Appliqué AVANT le resserrement de pont.
  if (CM.isoPedSpread) {
    if (p.pedJ === undefined) p.pedJ = ((((p.phase || 0) * 389.71) % 1) - 0.5) * 2;
    pedEdge += p.pedJ * CM.TILE * CM.isoPedSpread;
  }
  // ── PONT : une ZONE DE PASSAGE, pas une ligne ──────────────────────────────
  // Hors tablier, le trottoir à 0.42 tuile ferait marcher le piéton DANS L'EAU.
  // La 1re parade resserrait tout le monde à ±0.09 tuile de l'axe de voie : une
  // file au cordeau, et — l'axe de voie n'étant PAS le milieu du tablier
  // DESSINÉ (cf. spanBand dans isoBridge) — une file plaquée contre le
  // garde-corps aval (« ils sont tous sur les barrières du bas », Raph
  // 2026-08-04, capture pont-files).
  // Désormais : bridgeWalkBand donne le milieu et la demi-largeur du platelage
  // dessiné, et chacun tient SA ligne dedans — biais à droite du sens de marche
  // (les deux sens se doublent sans se traverser) + décalage PERSONNEL stable
  // (dérivé de la phase, donc identique pas après pas : pas de zigzag). Les
  // deux plages se CHEVAUCHENT au milieu : le tablier se lit comme une foule
  // qui passe, pas comme deux rails.
  // Réglages live : __bridgeTune.pedMargin / pedSide / pedSpread ; repli
  // __bridgePedEdge (fraction de tuile) pour re-figer l'ancienne ligne.
  const rmB = CM.layout && CM.layout.roadMap;
  const isBridgeCell = (x, y) => { const c = rmB && rmB.get(x + "," + y); return !!(c && c.roadSurface === "bridge"); };
  const onBridge = isBridgeCell(p.gx, p.gy)
    || isBridgeCell(p.gx + 1, p.gy) || isBridgeCell(p.gx - 1, p.gy)
    || isBridgeCell(p.gx, p.gy + 1) || isBridgeCell(p.gx, p.gy - 1);
  if (onBridge) {
    const forced = (typeof window !== 'undefined' && window.__bridgePedEdge != null) ? window.__bridgePedEdge : null;
    const band = forced == null ? bridgeWalkBand((p.gx + 0.5) * CM.TILE, (p.gy + 0.5) * CM.TILE) : null;
    if (band) {
      // Côté DROIT du sens de marche, sur l'axe transverse du pont (span
      // vertical → x ; horizontal → y) : même convention que le trottoir.
      const side = band.vertical
        ? (p.dir === 3 ? 1 : p.dir === 2 ? -1 : 0)
        : (p.dir === 0 ? 1 : p.dir === 1 ? -1 : 0);
      if (p.pedJ === undefined) p.pedJ = ((((p.phase || 0) * 389.71) % 1) - 0.5) * 2;
      const u = Math.max(-1, Math.min(1, bridgeTune.pedSide * side + bridgeTune.pedSpread * p.pedJ));
      const t = band.axis + band.half * u;
      if (band.vertical) { p.tox = t - (p.gx + 0.5) * CM.TILE; p.toy = 0; }
      else { p.toy = t - (p.gy + 0.5) * CM.TILE; p.tox = 0; }
      return;
    }
    // Repli (legacy top-down, pont procédural sans géométrie, molette forcée) :
    // l'ancien resserrement sur l'axe.
    pedEdge = Math.min(pedEdge, CM.TILE * (forced != null ? forced : 0.09));
  }
  if (CM.wonderWalkSet && CM.wonderWalkSet.has(cityMapWalkRoadKey(p.gx, p.gy))) {
    // ESPLANADE : pas de trottoir — décalage PERSONNEL STABLE, tiré UNE fois par
    // habitant (dérivé de sa phase de spawn), identique à chaque pas → trajectoires
    // droites et foule naturellement étalée. L'ancien tirage PAR PAS « swippait »
    // les silhouettes d'un bord de tuile à l'autre à chaque cellule (retour Raph).
    if (p.esOx === undefined) {
      const ph = p.phase || 0;
      p.esOx = (((ph * 977.13) % 1) - 0.5) * CM.TILE * 0.55;
      p.esOy = (((ph * 613.37) % 1) - 0.5) * CM.TILE * 0.55;
    }
    p.tox = p.esOx;
    p.toy = p.esOy;
  } else if (rank === "main") {
    // Boulevard 2 cellules : trottoir sur le BORD EXTÉRIEUR de la cellule (loin de la
    // couture plantée = de l'autre voie), comme les véhicules.
    const rm = CM.layout && CM.layout.roadMap;
    const isMain = (x, y) => { const c = rm && rm.get(x + "," + y); return !!(c && c.rank === "main"); };
    const e = pedEdge;
    if (p.dir === 0 || p.dir === 1) { p.tox = 0; p.toy = isMain(p.gx, p.gy + 1) ? -e : isMain(p.gx, p.gy - 1) ? e : 0; }
    else { p.toy = 0; p.tox = isMain(p.gx + 1, p.gy) ? -e : isMain(p.gx - 1, p.gy) ? e : 0; }
  } else {
    // Rue simple : trottoir sur le bord DROIT du sens de marche ; esplanade (place) = centré.
    const edge = rank === "plaza" ? 0 : pedEdge;
    p.tox = p.dir === 2 ? -edge : p.dir === 3 ? edge : 0;
    p.toy = p.dir === 0 ? edge : p.dir === 1 ? -edge : 0;
  }
}

// front (optionnel) : 2e passe Y-SORT. Appelée avec dt=0 après les bâtiments → toutes les
// mises à jour (∝ dt) deviennent no-op (pas de double-déplacement) ; seuls sont dessinés
// les habitants « devant ». La 1re passe (front absent) met à jour TOUS les habitants mais
// ne dessine que les « derrière ».
// Le rendu SOL est scindé en MAJ (une fois/frame, updateCitizens) + dessin par agent
// (drawOneCitizen / drawOneVehicle), pour que piétons et véhicules soient triés ENSEMBLE
// par profondeur dans drawGroundAgents. Avant, tous les piétons PUIS tous les véhicules =
// une voiture recouvrait toujours un piéton de la même passe, même au SUD (devant) d'elle.
// Allure de marche RALENTIE (demande Raph 2026-07-29, dans la foulée de la réduction de
// taille) : à silhouette rétrécie, l'ancienne allure faisait traverser la rue en un clin
// d'œil. Facteur calé sur la réduction (0.625) → autant de « longueurs de corps » par
// seconde qu'avant. Appliqué au DÉPLACEMENT (pas au spawn) : la molette __pedSpeed agit
// donc tout de suite, sans attendre un recalcul du plan. Concerne les gens À PIED —
// habitants ici, porteurs de panier dans updateVehicles ; attelages et voitures gardent
// leur vitesse. Distinct de __isoWalkSpeed, qui compense la projection iso.
const PED_SPEED = { k: 0.625 };
if (typeof window !== 'undefined') window.__pedSpeed = (v) => { if (v > 0) PED_SPEED.k = +v; return PED_SPEED.k; };

function updateCitizens(dt) {
  if (!CM.walkRoadList.length) return;

  // Vagues d'attroupement aux merveilles : fenêtre de ~35 s toutes les ~2,5 min
  // pendant laquelle citizenChooseNext aspire les passants vers les parvis
  // (CM.wonderPull 0→1) ; hors fenêtre, simple filet de curieux. Horloge murale
  // (pas dt) : la phase survit aux recalculs et reste commune à tous les habitants.
  // Molette dev : __wonderCrowd = 1 force la vague, 0 la coupe, null → auto.
  const gatherT = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const crowdOverride = (typeof window !== 'undefined' && window.__wonderCrowd != null) ? +window.__wonderCrowd : null;
  CM.wonderPull = !(CM.wonderGatherCells && CM.wonderGatherCells.length) ? 0
    : crowdOverride != null ? crowdOverride
      : (gatherT % 150) < 35 ? 1 : 0;

  // Gestion globale de l'apparition des bulles de pensée pour éviter le spam dû au nombre de citoyens
  if (CM.globalBubbleCooldown === undefined) {
    CM.globalBubbleCooldown = Math.random() * 15 + 10; // Première bulle apparaît après 10 à 25s
  }

  // Scan avec sortie anticipée — évite de construire idleCitizens[] à chaque frame
  let hasActiveThought = false;
  for (const c of CM.citizens) {
    if (c.thoughtType && c.thoughtTimer > 0) { hasActiveThought = true; break; }
  }

  CM.globalBubbleCooldown -= dt;
  if (CM.globalBubbleCooldown <= 0) {
    if (!hasActiveThought && CM.citizens.length > 0) {
      // Construction tardive — seulement toutes les 90-180s
      const idleCitizens = CM.citizens.filter(c => !c.thoughtType || c.thoughtTimer <= 0);
      if (idleCitizens.length > 0) {
        const p = idleCitizens[Math.floor(Math.random() * idleCitizens.length)];
        const types = ["thought", "scroll", "lightning"];
        p.thoughtType = types[Math.floor(Math.random() * types.length)];
        p.thoughtTimer = 18;
        CM.globalBubbleCooldown = Math.random() * 90 + 90;
      } else {
        CM.globalBubbleCooldown = 5;
      }
    } else {
      CM.globalBubbleCooldown = 5;
    }
  }

  let anyDead = false;   // un partant a fini son fondu → compaction en fin de boucle
  for (const p of CM.citizens) {
    if (p.thoughtTimer === undefined) p.thoughtTimer = 0;
    if (p.thoughtType === undefined) p.thoughtType = null;
    // Minuteur de bulle décrémenté EN TÊTE de boucle (avant tout `continue`) : sinon un
    // porteur de bulle devenu dormeur nocturne gèle son minuteur → bulle figée suspendue.
    // p._nightHidden marque un dormeur estompé pour que sa bulle ne soit ni dessinée
    // (drawCitizenThoughts) ni cliquable (hit-test).
    p._nightHidden = false;
    if (p.thoughtType && p.thoughtTimer > 0) {
      p.thoughtTimer -= dt;
      if (p.thoughtTimer <= 0) p.thoughtType = null;
    }

    if (!CM.walkRoadSet.has(cityMapWalkRoadKey(p.gx, p.gy))) {
      // PR3 — remap vers la route SURVIVANTE la plus proche (pas un saut
      // aléatoire) : au recalcul du plan (achat, émondage), un habitant dont la
      // cellule a disparu glisse sur la route voisine au lieu de sauter à l'autre
      // bout de la ville → bien moins de clignotement.
      let r = CM.walkRoadList[0], bestD = Infinity;
      for (const c of CM.walkRoadList) {
        const d = (c.gx - p.gx) * (c.gx - p.gx) + (c.gy - p.gy) * (c.gy - p.gy);
        if (d < bestD) { bestD = d; r = c; }
      }
      p.gx = r.gx;
      p.gy = r.gy;
      p.x = (r.gx + 0.5) * CM.TILE;
      p.y = (r.gy + 0.5) * CM.TILE;
      p.tx = p.x;
      p.ty = p.y;
      p.dir = -1;
      p.tox = 0; p.toy = 0; // recentre la file après un remap (glisse en douceur)
      // Fondu d'apparition pour éviter les "points" qui surgissent sur la carte.
      p.fade = 0;
    }
    if (p.fade === undefined) p.fade = 1;
    else if (p.fade < 1) p.fade = Math.min(1, p.fade + dt * 4); // apparition rapide (~0,25 s) : plus d'effet « fantôme »

    // ── Fondu de DISPARITION : jamais au milieu de la rue ─────────────────────
    // Deux causes d'effacement — le tiers « dormeur » quand la nuit s'installe, et
    // le DÉPART (p.leaving) quand la ville dépasse sa cible de foule. Dans les deux
    // cas le fondu ne S'AMORCE que sur un SEUIL (cellule bordant un bâtiment) : on
    // rentre par une porte, on ne s'évapore pas sur la chaussée (Raph 2026-07-29).
    // Une fois amorcé il est piloté par dt et non par nightF : amorcé tard dans la
    // nuit, le vieux fondu en nightF durait zéro seconde et faisait POP l'habitant —
    // exactement ce qu'il était censé éviter.
    const nightF = CM.nightF || 0;
    const sleeper = nightF > 0.55 && (((p.phase * 100) | 0) % 3) === 0;
    if ((sleeper || p.leaving) && p._vanish === undefined && citizenAtShelter(p)) p._vanish = 1;
    if (p._vanish !== undefined) {
      const back = !sleeper && !p.leaving;   // le jour se lève : il ressort par sa porte
      p._vanish = back ? Math.min(1, p._vanish + dt * 2.2) : Math.max(0, p._vanish - dt * 2.2);
      if (back && p._vanish >= 1) p._vanish = undefined;
    }
    p._sleepFade = p._vanish === undefined ? 1 : p._vanish;
    if (p._sleepFade <= 0) {
      // Effacé : il est RENTRÉ. Il ne marche plus (sinon le dormeur ressortirait au
      // matin à l'autre bout de la ville) et, s'il partait pour de bon, il quitte la
      // liste — la compaction se fait après la boucle.
      p._nightHidden = true;
      if (p.leaving) { p._dead = true; anyDead = true; }
      continue;
    }

    let moved = 0;   // distance parcourue CE tick (pilote le lissage du trottoir)
    // Qui court s'abriter ne flâne plus : l'averse coupe court à la halte des badauds
    // (place, parvis de merveille) au lieu de les laisser contempler sous la pluie.
    const abri = citizenSheltering(p);
    if (p.pauseT > 0 && !abri) {
      p.pauseT -= dt;
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < 2.4) {
        citizenChooseNext(p);
      } else {
        // Iso : la projection étale l'écran (losange 2:1) → la même vitesse MONDE
        // paraît plus rapide. Facteur de calme dédié (retour Raph « ils glissent »),
        // molette window.__isoWalkSpeed (défaut 0.72). Sans effet en legacy.
        const isoK = (typeof window !== 'undefined' && window.__isoWalkSpeed != null) ? window.__isoWalkSpeed : 0.72;
        // Course sous l'averse : l'animation étant cadencée par la DISTANCE parcourue
        // (walkDist ci-dessous), les jambes accélèrent d'elles-mêmes, sans bande dédiée.
        const sp = p.speed * dt * isoK * PED_SPEED.k * (abri ? RUN_K : 1);
        p.x += dx / dist * sp;
        p.y += dy / dist * sp;
        // Odomètre de marche : pilote l'animation PAR DISTANCE (les pieds suivent
        // le sol, fini le patinage) — consommé par drawEraAgentIso.
        p.walkDist = (p.walkDist || 0) + sp;
        moved = sp;
      }
    }
    // Marche au BORD de la chaussée : décalage latéral (unités monde) lissé vers sa
    // cible « trottoir » (p.tox/p.toy, bord droit du sens), deux sens de marche =
    // deux files le long de chaque bord. Lissage PAR DISTANCE PARCOURUE
    // (convergence ~ __pedTurn tuiles de marche) : l'ancien lissage TEMPOREL (dt·6)
    // encaissait tout le déport latéral quasi sur place — au carrefour, le
    // changement d'axe du bord (±edge en X ↔ ±edge en Y) devenait un « dash » en
    // travers de la route (vu par Raph). Étalé sur l'avancée, le virage devient un
    // arc qui coupe le coin ; à l'arrêt (pause), l'offset ne glisse plus du tout.
    const tox = p.tox || 0, toy = p.toy || 0;
    if (p.lox === undefined) { p.lox = tox; p.loy = toy; }
    else if (moved > 0) {
      const Lt = CM.TILE * ((typeof window !== 'undefined' && window.__pedTurn != null) ? window.__pedTurn : 0.9);
      const k = moved < Lt ? moved / Lt : 1;
      p.lox += (tox - p.lox) * k;
      p.loy += (toy - p.loy) * k;
    }
  }
  // Compaction : les partants rentrés quittent la liste. Filtre alloué SEULEMENT
  // quand il y a eu un départ (une allocation par frame sur 450 habitants serait un
  // gaspillage pur), et jamais pendant l'itération ci-dessus.
  if (anyDead) CM.citizens = CM.citizens.filter((c) => !c._dead);
}



// ── Bulles de pensée : cartouche PIXEL + icône-ressource de la récompense ────
// Redesign (Raph 2026-07-13, « avec les icônes pixel qu'on a ») : la bulle
// affiche l'icône de ce que le clic RAPPORTE (rewardCitizenThought) — pensée →
// nourriture, parchemin → savoir, éclair → or. Cartouche à coins crantés,
// taille FIXE écran (lisible à tout zoom), léger flottement si `now` fourni.
// Projection PARTAGÉE (worldToScreen, identité en legacy) → même fonction pour
// les deux rendus ; l'iso l'appelle en fin de frame (au-dessus de la nuit).
// Repli emoji tant que l'icône n'est pas décodée.
const THOUGHT_ICONS = { thought: '/pixelart/ui/res/food.png', scroll: '/pixelart/ui/res/knowledge.png', lightning: '/pixelart/ui/res/gold.png' };
const thoughtIconCache = {};
function thoughtIcon(type) {
  let c = thoughtIconCache[type];
  if (c) return c;
  c = { img: null, ready: false };
  thoughtIconCache[type] = c;
  if (typeof Image !== 'undefined' && THOUGHT_ICONS[type]) {
    const im = new Image();
    im.onload = () => { c.img = im; c.ready = true; };
    im.src = THOUGHT_ICONS[type];
  }
  return c;
}
// Cartouche pixel à coins crantés : deux rects croisés (cran de 2 px).
function thoughtBubbleBox(ctx, bx, by, r, color) {
  ctx.fillStyle = color;
  ctx.fillRect(bx - r + 2, by - r, r * 2 - 4, r * 2);
  ctx.fillRect(bx - r, by - r + 2, r * 2, r * 2 - 4);
}
// Ancre ÉCRAN de la bulle d'un habitant : au-dessus de la TÊTE du sprite
// (hauteur d'ère × charType), pas posée sur le corps (retour Raph). PARTAGÉE
// entre le rendu (ci-dessous) et le hit-test du clic (cityMapRuntime).
function thoughtBubbleAnchor(p) {
  const sp = projWorldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  // Dos d'âne du pont sprite : la bulle suit la tête, qui suit le tablier —
  // rendu ET hit-test du clic lisent cette ancre (source unique).
  sp.y -= bridgeLiftScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const spec = agentSpecFor(agentSetForBand(band), p.charType || 0) || AGENT_FALLBACK;
  const drawH = CM.TILE * CM.cam.zoom * spec.scale * AGENT_SCALE;
  // Sommet du sprite ≈ pieds − AGENT_FEET·drawH ; la bulle flotte juste au-dessus.
  return { x: sp.x, y: sp.y - drawH * AGENT_FEET - 10 };
}
function drawCitizenThoughts(now = 0) {
  if (!CM.walkRoadList.length || !CM.citizens) return;
  const ctx = CM.ctx;
  for (const p of CM.citizens) {
    if (p.thoughtType && p.thoughtTimer > 0 && !p._nightHidden) {
      const a = thoughtBubbleAnchor(p);
      if (a.x < 0 || a.y < -30 || a.x > CM.cw || a.y > CM.ch) continue;
      const bob = now ? Math.sin(now / 420 + (p.phase || 0) * 4) * 1.5 : 0;
      const BR = 12;                              // demi-cartouche, fixe écran
      const bx = Math.round(a.x);
      const by = Math.round(a.y + bob);           // au-dessus de la tête (ancre partagée)
      // Queue crantée vers la tête (marches de pixels, teinte du liseré).
      ctx.fillStyle = 'rgba(122, 92, 40, 0.95)';
      ctx.fillRect(bx - 2, by + BR, 4, 2);
      ctx.fillRect(bx - 1, by + BR + 2, 2, 2);
      // Cartouche : liseré or sombre puis fond parchemin.
      thoughtBubbleBox(ctx, bx, by, BR, 'rgba(122, 92, 40, 0.95)');
      thoughtBubbleBox(ctx, bx, by, BR - 1, 'rgba(255, 248, 230, 0.96)');
      const ic = thoughtIcon(p.thoughtType);
      if (ic.ready) {
        const prevS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ic.img, bx - 8, by - 8, 16, 16);
        ctx.imageSmoothingEnabled = prevS;
      } else {
        // Icône pas encore décodée : emoji d'origine en attendant.
        ctx.save();
        const emoji = p.thoughtType === 'thought' ? '💭' : p.thoughtType === 'scroll' ? '📜' : '⚡';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#4a3a10';
        ctx.fillText(emoji, bx, by + 0.5);
        ctx.restore();
      }
    }
  }
}

// Rang de la cellule de route (les esplanades portent le rang "plaza").
function vehicleRoadRank(gx, gy) {
  const road = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
  return road ? (road.rank || "path") : "path";
}

// CIBLE de file (conduite à DROITE), en FRACTIONS DE TUILE : chaque véhicule tient
// sa moitié de chaussée → deux sens de circulation séparés, sans rouler sur l'axe
// central. Pur RENDU (le pathfinding reste centré sur la cellule). En ISO, la voie
// vient de la géométrie publiée par le renderer (CM.isoVehLane = demi-chaussée/2)
// → la carrosserie roule au centre de la voie DESSINÉE, pas d'une largeur legacy.
// La cible est LISSÉE par updateVehicles (v._lox/_loy) puis servie par
// vehicleLaneOffset — partagée carrosserie/phares pour qu'ils restent solidaires.
function vehicleLaneTarget(v) {
  const s = 1;   // fractions de tuile (les appelants scalent via vehicleLaneOffset)
  if ((v.parkT || 0) > 0) return { x: 0, y: 0 };       // garé : géré à part
  // PONT : même zone de passage que les piétons (bridgeWalkBand). L'attelage
  // roulait « centré sur sa cellule », c'est-à-dire sur l'AXE DE VOIE — donc,
  // le tablier dessiné étant décalé en amont, une roue sur le garde-corps aval.
  // Il tient maintenant sa file dans la bande réelle, côté droit du sens.
  {
    const bT = CM.TILE;
    const cell = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(v.gx + "," + v.gy);
    if (cell && cell.roadSurface === "bridge") {
      const band = bridgeWalkBand((v.gx + 0.5) * bT, (v.gy + 0.5) * bT);
      if (band) {
        const side = band.vertical
          ? (v.dir === 3 ? 1 : v.dir === 2 ? -1 : 0)
          : (v.dir === 0 ? 1 : v.dir === 1 ? -1 : 0);
        const t = band.axis + band.half * bridgeTune.pedSide * side;
        return band.vertical
          ? { x: (t - (v.gx + 0.5) * bT) / bT, y: 0 }
          : { x: 0, y: (t - (v.gy + 0.5) * bT) / bT };
      }
    }
  }
  const rank = vehicleRoadRank(v.gx, v.gy);
  if (rank === "plaza") return { x: 0, y: 0 };         // esplanades : jamais de véhicule (défensif)
  if (rank !== "main") {
    // Rue 1 CELLULE (avenue / rue / sentier) : conduite à DROITE généralisée — avant,
    // seul le boulevard décalait et les deux sens se croisaient PILE sur la ligne
    // centrale (têtes-à-têtes fantômes ; sur les avenues, pile sur le refuge planté).
    // Cible = milieu de la voie roulable : entre le refuge éventuel (medianHalfFor,
    // avenues plantées) et le bord de chaussée. Plancher de lisibilité (les sprites
    // sont plus larges que les petites rues → on accepte de mordre l'accotement) et
    // plafond sous la ligne des piétons (pedEdge 0.42). Même contrat que le boulevard :
    // pur RENDU (pathfinding centré), partagé phares/carrosserie, nudge __vehLaneBias.
    const eiR = CM.layout?.counts?.eraIndex ?? 13;
    const laneBias = (typeof window !== "undefined" && window.__vehLaneBias != null) ? window.__vehLaneBias : 0;
    // ISO : centre de voie = demi-chaussée dessinée / 2 — par RANG de la cellule
    // (hiérarchie des largeurs : la file colle au ruban réel, étroit ou large),
    // repli sur le scalaire CM.isoVehLane ; legacy : heuristique procédurale.
    const lane = (CM.isoVehLane != null)   // ⚠ garde de PUBLICATION, pas de drapeau (P3)
      ? ((CM.isoVehLaneByRank && CM.isoVehLaneByRank[rank] != null) ? CM.isoVehLaneByRank[rank] : CM.isoVehLane)
      : Math.min(0.24, Math.max(0.13, (medianHalfFor(rank, eiR) + roadWidthFor(rank, eiR) / 2) / 2));
    const m = s * (lane + laneBias);
    // Bord DROIT du sens de marche (même convention que le décalage-trottoir piéton) :
    // E→file sud, W→file nord, S→file ouest, N→file est.
    return v.dir === 0 ? { x: 0, y: m }
      : v.dir === 1 ? { x: 0, y: -m }
        : v.dir === 2 ? { x: -m, y: 0 }
          : v.dir === 3 ? { x: m, y: 0 }
            : { x: 0, y: 0 };
  }
  // Boulevard 2 cellules (axe main élargi) : refuge planté sur la COUTURE au centre.
  // Chaque cellule du boulevard EST une voie complète, sa chaussée dessinée étant
  // CENTRÉE sur la cellule → rouler au centre, c'est tenir sa file (le sens est déjà
  // séparé par le terre-plein).
  //
  // La poussée vers le BORD EXTÉRIEUR qui vivait ici visait l'ancienne géométrie
  // top-down, où les deux voies se partageaient une cellule. Elle est partie à
  // l'étape 6 (2026-08-23) avec son garde `if (CM.iso)`, devenu inconditionnel —
  // et avec elle la molette `__vehLaneBias` et le seul lecteur de
  // `pixelSidewalkFlag`/`sidewalkTune` dans ce fichier.
  //
  // ⚠ CETTE FONCTION NE DEVIENT PAS CONSTANTE : les branches plus haut — `rank`
  // autre que "main", esplanade, stationnement — restent bien vivantes.
  return { x: 0, y: 0 };
}

// Décalage de file EFFECTIF au rendu : la cible (vehicleLaneTarget) est lissée
// par updateVehicles (v._lox/_loy, en tuiles) — au changement de cap la
// carrosserie GLISSE d'une file à l'autre au lieu de téléporter (« bien tenir
// leur ligne », Raph 2026-07-16). `s` = échelle (CM.TILE → px monde, T*zoom → px écran).
function vehicleLaneOffset(v, s) {
  if (v._lox !== undefined) return { x: v._lox * s, y: v._loy * s };
  const t = vehicleLaneTarget(v);
  return { x: t.x * s, y: t.y * s };
}

// Conduite des véhicules — distincte de la flânerie des piétons :
//   - jamais sur une esplanade (rang "plaza", réservé aux piétons) ;
//   - tient fortement sa ligne (pas de zigzag à chaque carrefour) ;
//   - préfère rester sur les grands axes ;
//   - TOUJOURS en mouvement : ni pause courte ni stationnement (retirés — Raphaël veut
//     un flux continu). Les branches parkT/pauseT restantes (rendu) sont donc inertes.
function vehicleChooseNext(v) {
  if (!CM.walkRoadList.length) return;
  const arrived = v.goal && v.goal.gx === v.gx && v.goal.gy === v.gy;
  if (!v.goal || arrived || Math.random() < 0.03) {
    const cross = Math.random() < 0.22 ? crossBankGoal(v.gx, v.gy) : null;
    if (cross && vehicleRoadRank(cross.gx, cross.gy) !== "plaza") {
      v.goal = cross;
    } else {
      for (let tries = 0; tries < 8; tries += 1) {
        const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
        if (vehicleRoadRank(r.gx, r.gy) !== "plaza") { v.goal = { gx: r.gx, gy: r.gy }; break; }
      }
      if (!v.goal) return;
    }
  }
  const rev = v.dir >= 0 ? (v.dir ^ 1) : -1;
  // PARVIS de merveille = piéton : un véhicule n'y ENTRE jamais (walkRoadSet
  // contient ces cellules pour les habitants ; roadStepAllowed autorise la sortie
  // de chaussée — il faut donc filtrer ici). Échappatoire : un véhicule déjà
  // dessus (route carvée sous ses roues au recalcul) peut le traverser pour
  // rejoindre la chaussée (son but est toujours une route → il en sort vite).
  const vOnParvis = !!(CM.wonderWalkSet && CM.wonderWalkSet.has(cityMapWalkRoadKey(v.gx, v.gy)));
  const opts = [];
  for (let i = 0; i < 4; i += 1) {
    const nx = v.gx + CM_DIRS[i][0], ny = v.gy + CM_DIRS[i][1];
    if (!CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny))) continue;
    if (!roadStepAllowed(v.gx, v.gy, i)) continue;
    if (vehicleRoadRank(nx, ny) === "plaza") continue;
    if (!vOnParvis && CM.wonderWalkSet && CM.wonderWalkSet.has(cityMapWalkRoadKey(nx, ny))) continue;
    opts.push({ i, nx, ny });
  }
  if (!opts.length) return;
  const forward = opts.filter((o) => o.i !== rev);
  const pool = forward.length ? forward : opts;
  let best = pool[0], bestScore = -Infinity;
  for (const o of pool) {
    let score = -(Math.abs(v.goal.gx - o.nx) + Math.abs(v.goal.gy - o.ny));
    if (o.i === v.dir) score += 3.2;
    const rank = vehicleRoadRank(o.nx, o.ny);
    score += rank === "main" ? 1.2 : rank === "avenue" ? 0.8 : 0;
    score += Math.random() * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  v.gx = best.nx;
  v.gy = best.ny;
  v.dir = best.i;
  v.tx = (v.gx + 0.5) * CM.TILE;
  v.ty = (v.gy + 0.5) * CM.TILE;
}

function updateVehicles(dt) {
  for (const v of CM.vehicles) {
    // Tenue de ligne : l'offset de file est LISSÉ (unités tuile) vers sa cible —
    // sans lissage, un changement de cap téléportait la carrosserie d'une file à
    // l'autre. Même recette que le lox/loy des piétons, constante un peu plus douce.
    const lt = vehicleLaneTarget(v);
    if (v._lox === undefined) { v._lox = lt.x; v._loy = lt.y; }
    else { const kL = dt * 4 < 1 ? dt * 4 : 1; v._lox += (lt.x - v._lox) * kL; v._loy += (lt.y - v._loy) * kL; }
    // Plus de pause ni de stationnement : les véhicules avancent en continu.
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 2.4) {
      vehicleChooseNext(v);
    } else {
      // Le porteur de panier est un « véhicule » côté moteur mais un PIÉTON à l'écran :
      // il suit le ralentissement des habitants, pas l'allure des attelages.
      const sp = v.speed * dt * (v.type === 'basket' ? PED_SPEED.k : 1);
      v.x += dx / d * sp;
      v.y += dy / d * sp;
      // Odomètre (px monde) : les bandes diagonales iso animent les ROUES par
      // DISTANCE parcourue (anti-patinage, même recette que p.walkDist).
      v.rollDist = (v.rollDist || 0) + sp;
    }
  }
}

// Phares d'un véhicule à moteur, dessinés À LA PROFONDEUR du véhicule (dans drawOneVehicle) pour
// être occultés comme la carrosserie — au lieu du tapis lumineux tardif qui brillait par-dessus
// bâtiments + nuit (même bug de z-order que carrosserie↔piéton). Nuit uniquement, ère motorisée,
// véhicule en mouvement. Additif ; alpha BOOSTÉ car dessiné AVANT le voile de nuit (~×0.5).
function drawVehicleHeadlights(ctx, v) {
  const n = CM.nightF || 0;
  if (n <= 0.3) return;                                   // phares de nuit seulement
  if ((CM.layout?.counts?.eraIndex || 0) < 14) return;   // ère motorisée
  if (!MOTOR_TYPES.has(v.type)) return;                  // tout ce qui a un moteur s'allume
  if ((v.parkT || 0) > 0 || v.pauseT > 0) return;        // garé/arrêté : éteints
  const z = CM.cam.zoom, T = CM.TILE;
  const a = Math.min(1, (n - 0.1) / 0.7);
  const boost = 1.8;                                      // compense le voile de nuit (dessiné après)
  const hl = Math.max(1, T * z * 0.06);
  // Projection PARTAGÉE (identité en legacy) : position via worldToScreen
  // (offset de file en px MONDE) ; sert aussi au rendu ISO (drawIsoVehicle).
  const lo = vehicleLaneOffset(v, T);                     // px monde
  const sph = projWorldToScreen(v.x + lo.x, v.y + lo.y);
  const sx = sph.x, sy = sph.y;
  if (sx < -8 || sy < -8 || sx > CM.cw + 8 || sy > CM.ch + 8) return;
  // Cap réel (vitesse, sinon direction de grille : 0=E 1=W 2=S 3=N), PROJETÉ en
  // axe ÉCRAN : en iso, rouler vers l'est = faisceau vers la diagonale bas-droite.
  let hx = v.tx - v.x, hy = v.ty - v.y;
  const hd = Math.hypot(hx, hy);
  if (hd > 0.5) { hx /= hd; hy /= hd; }
  else { hx = v.dir === 0 ? 1 : v.dir === 1 ? -1 : 0; hy = v.dir === 2 ? 1 : v.dir === 3 ? -1 : 0; }
  const hs = panDeltaToScreen(hx, hy);
  const hn = Math.hypot(hs.x, hs.y) || 1;
  hx = hs.x / hn; hy = hs.y / hn;
  const px = -hy, py = hx;                                // perpendiculaire (écart des deux phares)
  const off = T * z * 0.2;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  // Deux phares ronds à l'AVANT.
  ctx.fillStyle = `rgba(255,244,210,${Math.min(1, a * 0.75 * boost).toFixed(2)})`;
  ctx.beginPath();
  ctx.arc(sx + hx * off + px * hl, sy + hy * off + py * hl, hl * 0.55, 0, Math.PI * 2);
  ctx.arc(sx + hx * off - px * hl, sy + hy * off - py * hl, hl * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // Faisceau : halo radial étiré dans l'axe du véhicule (dégradé inline, pas de sprite).
  ctx.save();
  ctx.translate(sx + hx * off * 2.6, sy + hy * off * 2.6);
  ctx.rotate(Math.atan2(hy, hx));
  const bw = hl * 3.4, bh = hl * 1.8;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, bw));
  g.addColorStop(0, `rgba(255,238,180,${Math.min(1, a * 0.4 * boost).toFixed(2)})`);
  g.addColorStop(1, "rgba(255,238,180,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = prev;
}



// ⚠ Retirés le 2026-08-23 (étape 6) avec le rendu top-down : `drawCitizens`,
// `drawGroundAgents`, `drawShips`, `drawVehicles`, `frontByPainter`.
export { chooseRoadVehicleType, getVehicleDensity, updateVehicles, updateCitizens, CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, drawCitizenThoughts, vehicleLaneOffset, drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso, drawVehicleHeadlights, thoughtBubbleAnchor, riotEraKey, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH, ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors, ensureVehDiag, vehDiagReady, vehSkinFor, ISO_DIAG, ISO_AGENT_NAMES, BASKET_CARRIERS, agentDir, AGENT_SCALE, VEH_SCALE,
  citizenSpawnCell, citizenAtDoorstep };
// AGENT_SCALE / VEH_SCALE sont exportés en LIAISON VIVE (ESM) : le rendu iso les relit
// à chaque frame, donc __villagerScale / __vehScale agissent aussi sur la vue iso.
