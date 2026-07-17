 
import { state } from '../core/state.js';
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W, roadWidthFor, medianHalfFor } from './layout.js';
import { pixelSidewalkFlag, sidewalkTune } from './pixelTerrain.js';
import { worldToScreen as projWorldToScreen, panDeltaToScreen } from './iso/projection.js';

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
          // car/tram réservés aux grands axes (sinon retombe sur un wagon).
          if ((v.type === "car" || v.type === "tram") && rank !== "main" && rank !== "avenue") return "wagon";
          return v.type;
        }
      }
    }
  }
  // Fallback historique (layout pas encore généré).
  if (eraIndex < 3) return "basket";
  if (eraIndex < 6) return seed % 3 === 0 ? "barrow" : "cart";
  if (eraIndex < 9) return seed % 3 === 0 ? "chariot" : seed % 3 === 1 ? "wagon" : "cart";
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
const AGENT_NF = 6, AGENT_FW = 68, AGENT_FH = 68;
const AGENT_FEET = 0.88; // pieds à ~88% du cadre → ancrage au sol
let AGENT_SCALE = 0.8;   // multiplicateur global de taille des habitants (défaut réduit ; live __villagerScale)

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
  men: [{ name: 'caveman', scale: 0.9 }, { name: 'caveman2', scale: 0.9 }],       // + variante peau noire + tenue
  women: [{ name: 'cavewoman', scale: 0.86 }, { name: 'cavewoman2', scale: 0.86 }],
  child: { name: 'cavechild', scale: 0.62 },
};
const AGENT_MEDIEVAL = { // ère 2 (band 2-3) : paysans médiévaux
  men: [{ name: 'villager', scale: 0.85 }, { name: 'villager2', scale: 0.85 }],             // + variante métisse
  women: [{ name: 'villagerwoman', scale: 0.85 }, { name: 'villagerwoman2', scale: 0.85 }], // + variante métisse
  child: { name: 'villagerchild', scale: 0.6 },
};
const AGENT_ANTIQUITY = { // ère 3 (band 4) : gréco-romain (tunique, drapé)
  men: [{ name: 'greekman', scale: 0.85 }, { name: 'greekman2', scale: 0.85 }],       // + variante peau noire + tenue
  women: [{ name: 'greekwoman', scale: 0.85 }, { name: 'greekwoman2', scale: 0.85 }],
  child: { name: 'greekchild', scale: 0.6 },
};
const AGENT_INDUSTRIAL = { // ère 4 (band 5-6) : XIXe industriel (redingote, ouvriers)
  men: [{ name: 'industrialman', scale: 0.85 }, { name: 'industrialman2', scale: 0.85 }],       // + variante peau noire + tenue
  women: [{ name: 'industrialwoman', scale: 0.85 }, { name: 'industrialwoman2', scale: 0.85 }],
  child: { name: 'industrialchild', scale: 0.6 },
};
const AGENT_MODERN = { // band 6 (époque Néon, ères 30-34) : citoyen near-future de mégalopole (techwear à accents néon cyan/teal, visière holo) — DISTINCT du cyberpunk cosmique b7+
  men: [{ name: 'modernman', scale: 0.85 }, { name: 'modernman2', scale: 0.85 }],
  women: [{ name: 'modernwoman', scale: 0.85 }, { name: 'modernwoman2', scale: 0.85 }],
  child: { name: 'modernchild', scale: 0.6 },
};
const AGENT_FUTURE = { // ère 5 (band ≥ 7) : cyberpunk néon sci-fi
  men: [{ name: 'futureman', scale: 0.85 }, { name: 'futureman2', scale: 0.85 }],       // + variante peau noire + tenue
  women: [{ name: 'futurewoman', scale: 0.85 }, { name: 'futurewoman2', scale: 0.85 }],
  child: { name: 'futurechild', scale: 0.6 },
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

ensureAgentChar('villager');
for (const set of [AGENT_PREHISTORIC, AGENT_MEDIEVAL, AGENT_ANTIQUITY, AGENT_INDUSTRIAL, AGENT_MODERN, AGENT_FUTURE])
  for (const s of [...set.men, ...set.women, set.child]) ensureAgentChar(s.name);
if (typeof window !== 'undefined') window.__villagerScale = (h) => { AGENT_SCALE = +h || 1; };

// ── Helper PARTAGÉ : dessine un personnage PIXEL NOMMÉ (bande de marche 4 dirs,
// AGENT_NF frames) à une position écran (sx = centre horizontal, groundY = ligne de
// pieds). Charge paresseusement /pixelart/agents/{name}-{dir}.png. Réutilisé par les
// porteurs de panier (ci-dessous), les émeutiers (renderWorld.js) et les habitants
// d'ère — fini le vieux blob vectoriel. Renvoie { drawW, drawH, top } si un sprite a
// été posé, ou false si le sprite n'est pas prêt (l'appelant garde son repli vectoriel).
function drawNamedAgent(ctx, sx, groundY, z, name, scale, dir, walking, now, phase, scaleMul = 1) {
  const chr = ensureAgentChar(name);
  if (!agentReady(chr)) return false;
  const d = (dir >= 0 && dir < 4) ? dir : 2;
  const drawH = CM.TILE * z * scale * AGENT_SCALE * scaleMul, drawW = drawH;
  const img = chr.img[VILLAGER_DIRS[d]] || chr.img.south;
  const frame = walking ? (Math.floor((now || 0) / 160 + (phase || 0) * 6) % AGENT_NF) : 0;
  const left = sx - drawW / 2, top = groundY - AGENT_FEET * drawH;
  const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, frame * AGENT_FW, 0, AGENT_FW, AGENT_FH, left, top, drawW, drawH);
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
  c = { img: {}, ready: 0, failed: 0 };
  agentDiagChars[name] = c;
  if (typeof Image !== 'undefined') for (const d of ISO_DIAG) {
    c.img[d] = loadWithRetry(
      '/pixelart/agents/' + agentDir(name) + '/' + name + '-' + d + '.png',
      () => { c.ready += 1; },
      () => { c.failed += 1; },
    );
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
  const img = c.img[ISO_DIAG[d]];
  const fh = img.naturalHeight || AGENT_FH;
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const drawH = CM.TILE * z * scale * AGENT_SCALE * scaleMul, drawW = drawH;
  let frame = 0;
  if (walking) {
    if (distPx != null) {
      const stride = (typeof window !== 'undefined' && window.__strideLen != null) ? window.__strideLen : 2.2;
      frame = Math.floor(distPx / Math.max(0.5, stride) + (phase || 0) * nf) % nf;
    } else {
      frame = Math.floor((now || 0) / 160 + (phase || 0) * 6) % nf;
    }
  }
  const feetF = groundFeet ? agentFootF(c, img) : AGENT_FEET;
  const left = sx - drawW / 2, top = groundY - feetF * drawH;
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
function ensureVehDiag(type) {
  let c = vehDiagImg[type];
  if (c) return c;
  c = { img: {}, ready: 0, failed: 0 };
  vehDiagImg[type] = c;
  if (typeof Image !== 'undefined') for (const d of ISO_DIAG) {
    c.img[d] = loadWithRetry(
      '/pixelart/agents/vehicles/veh-' + type + '-' + d + '.png',
      () => { c.ready += 1; },
      () => { c.failed += 1; },
    );
  }
  return c;
}
const vehDiagReady = (c) => !!c && c.ready >= ISO_DIAG.length;

// ── Véhicules pixel-art (objets directionnels PixelLab) ──────────────────────
// Bandes : agents/veh-{type}-{dir}.png (1 frame, 64px). dir = v.dir (0=E,1=W,2=S,3=N).
// Valeur = hauteur de rendu en tuiles (par type). Repli sur le rendu procédural si absent.
// Tailles réduites (Raphaël) pour cart / barrow / car ; global via __vehScale.
const VEH_SIZES = { cart: 0.5, barrow: 0.42, wagon: 0.85, chariot: 0.8, caravan: 1.0, car: 0.72, tram: 1.4 };
const VEH_PUSH = { cart: 1, barrow: 1 }; // poussés par un humain (de l'ère) placé derrière
// Véhicules TRACTÉS : un (ou deux) animaux de trait dessinés DEVANT, dans le sens de
// la marche, reliés par un timon procédural. animal = bande agent (horse/ox), n = nombre
// de bêtes, scale = hauteur en tuiles, dist = distance véhicule→attelage (en tuiles).
const VEH_PULL = {
  // Le char N'est PAS ici : son cheval est DÉJÀ dans le sprite veh-chariot → on
  // anime le sprite (bande multi-frames) au lieu d'ajouter un animal séparé.
  wagon:   { animal: 'ox',    n: 1, scale: 0.74, dist: 0.44 }, // wagon lourd : un bœuf
  caravan: { animal: 'horse', n: 1, scale: 0.72, dist: 0.46 }, // caravane : un cheval
};
let VEH_SCALE = 1; // multiplicateur global (réglage live)
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
let BOAT_SCALE = 1;     // multiplicateur global (réglage live __boatScale)
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
if (typeof window !== 'undefined') window.__boatScale = (m) => { BOAT_SCALE = +m || 1; };

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
  if (!p.goal || Math.random() < 0.05) {
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
  const isoPed = CM.iso && CM.isoPedEdge != null
    ? (bandPed >= (CM.isoSidewalkMinBand != null ? CM.isoSidewalkMinBand : 2) ? CM.isoPedEdge : CM.isoPedEdgeLow)
    : null;
  let pedEdge = CM.TILE * ((typeof window !== 'undefined' && window.__pedEdge != null) ? window.__pedEdge
    : (isoPed != null ? isoPed : 0.42));
  // Étalement PERSONNEL dans la bande (iso) : chaque habitant tient SA ligne de
  // trottoir (tirée de sa phase, stable pas après pas) — une file au cordeau
  // exact faisait un rail robotique. Appliqué AVANT le resserrement de pont.
  if (CM.iso && CM.isoPedSpread) {
    if (p.pedJ === undefined) p.pedJ = ((((p.phase || 0) * 389.71) % 1) - 0.5) * 2;
    pedEdge += p.pedJ * CM.TILE * CM.isoPedSpread;
  }
  // PONT : pas de trottoir hors du tablier — à 0.42 tuile le piéton marche dans l'eau.
  // Sur une cellule-pont ET ses cellules d'atterrissage (le lissage lox/loy converge
  // ainsi AVANT d'engager la travée), l'offset est resserré vers l'axe du tablier.
  // Réglable live : window.__bridgePedEdge (fraction de tuile, défaut 0.16).
  const rmB = CM.layout && CM.layout.roadMap;
  const isBridgeCell = (x, y) => { const c = rmB && rmB.get(x + "," + y); return !!(c && c.roadSurface === "bridge"); };
  if (isBridgeCell(p.gx, p.gy)
    || isBridgeCell(p.gx + 1, p.gy) || isBridgeCell(p.gx - 1, p.gy)
    || isBridgeCell(p.gx, p.gy + 1) || isBridgeCell(p.gx, p.gy - 1)) {
    const bridgeEdge = CM.TILE * ((typeof window !== 'undefined' && window.__bridgePedEdge != null) ? window.__bridgePedEdge : 0.16);
    pedEdge = Math.min(pedEdge, bridgeEdge);
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

// Y-SORT : un habitant est « DEVANT » un bâtiment quand une cellule-bâtiment occupe le
// voisin NORD (gy-1) de sa cellule : le sprite du bâtiment (base au sud, monte au nord)
// rognerait sa tête s'il était dessiné derrière. Ces habitants sont dessinés dans une
// 2e passe APRÈS le blit des bâtiments (front=true). CM.buildingCells est bâti au recompute.
const ysortFlag = { on: true };
if (typeof window !== 'undefined') window.__ysort = (on) => { ysortFlag.on = on !== false; return ysortFlag.on; };
// Tri de profondeur FIN entre piétons et véhicules d'une même passe (drawGroundAgents).
// __groundSort(false) = ancien comportement (piétons PUIS véhicules = 2 couches, la voiture
// recouvrait tout piéton devant elle) → sert d'A/B pour valider le tri.
const groundSortFlag = { on: true };
if (typeof window !== 'undefined') window.__groundSort = (on) => { groundSortFlag.on = on !== false; return groundSortFlag.on; };
// Drones (véhicules « air ») : triés en profondeur AVEC le sol (occlus par bâtiments/merveilles)
// au lieu d'être toujours dessinés par-dessus tout. __droneSort(false) = ancien (toujours dessus).
const droneSortFlag = { on: true };
if (typeof window !== 'undefined') window.__droneSort = (on) => { droneSortFlag.on = on !== false; return droneSortFlag.on; };
// Sprite pixel du drone (défaut) vs ancien rendu procédural (quadricoptère). __droneSprite(false) = procédural.
if (typeof window !== 'undefined') window.__droneSprite = (on) => { CM.droneSprite = on !== false; return CM.droneSprite; };
// Phares des voitures : dessinés À LA PROFONDEUR de la voiture (occlus comme la carrosserie)
// plutôt qu'en tapis lumineux tardif (par-dessus bâtiments + nuit). Drapeau porté par CM car
// lu aussi dans renderWorld (cityMapDrawCityLights). __headlightDepth(false) = ancien tapis.
if (typeof window !== 'undefined') window.__headlightDepth = (on) => { CM.headlightDepth = on !== false; return CM.headlightDepth; };
// Un bâtiment occupe-t-il le rang NORD (gy-1) autour de la colonne gx ? On teste la case
// PILE au nord (face droite d'un pâté) PLUS la diagonale du côté où le sprite déborde
// (`lean` = décalage-trottoir latéral : <0 vers l'ouest → teste NO, >0 vers l'est → teste NE,
// =0 « centré » → teste les DEUX). Motif : en COIN DE RUE, la case pile au nord est souvent
// l'autre rue (route) et c'est un bâtiment EN DIAGONALE, dont le sprite (plus large que sa
// case) rogne la tête. Élargir est SÛR : un bâtiment du rang nord est toujours au nord de
// l'agent → l'agent est au sud (devant) → il doit passer par-dessus (2e passe).
function buildingNorthOf(gx, gy, lean = 0) {
  const B = CM.buildingCells;
  if (!B) return false;
  const gy1 = gy - 1;
  if (B.has(gx + ',' + gy1)) return true;
  if (lean <= 0 && B.has((gx - 1) + ',' + gy1)) return true;   // décalé ouest (ou centré) → NO
  if (lean >= 0 && B.has((gx + 1) + ',' + gy1)) return true;   // décalé est (ou centré) → NE
  return false;
}
// Y-SORT « PEINTRE » (2026-07-10) : décision passe 1/2 par comparaison des PIEDS de
// l'agent avec la LIGNE DE BASE des sprites bâtis alentour (CM.buildingInfo, fiches
// posées au recompute). Remplace le test cellulaire « bâtiment au nord ? » qui créait
// deux artefacts signalés par Raph :
//   1. rue entre deux rangs de tours → l'agent, flaggé « devant » pour sa tour NORD,
//      était dessiné PAR-DESSUS la tour SUD → piétons debout sur les toits ;
//   2. piéton longeant le flanc d'une tour (même rangée) → jamais flaggé « devant »
//      → mangé par le débord latéral du sprite (« il passe derrière l'immeuble »).
// Règle du peintre : un bâtiment dont la base est PLUS SUD que les pieds passe devant
// l'agent ; plus nord, l'agent passe devant. Concrètement :
//   - occulteur : base à ≥ ~1 tuile au sud des pieds ET sprite assez haut pour
//     remonter au-dessus d'eux (topY) ET recouvrement de colonne → passe 1 (l'agent
//     glisse DERRIÈRE la tour sud — fini les toits piétonniers) ;
//   - rogneur de tête : base juste au nord des pieds (≤ ~1,15 tuile) → passe 2 ;
//   - même rangée (base à < ~1 tuile au sud, cas du longeur de flanc) : PAS un
//     occulteur → l'agent reste éligible passe 2 → il marche PAR-DESSUS le débord.
// Le seuil (eps, défaut 1.0 tuile) sépare nettement « même rangée » (Δ ≈ 0,1–0,9)
// de « rangée suivante au sud » (Δ ≈ 1,1–1,9), décalages-trottoir compris. Molettes :
// window.__ysortEps (seuil), window.__ysortPainter(false) = revenir au test cellulaire.
// Renvoie null si CM.buildingInfo absent (tests/replis) → l'appelant garde l'ancien test.
const ysortPainterFlag = { on: true };
if (typeof window !== 'undefined') window.__ysortPainter = (on) => { ysortPainterFlag.on = on !== false; return ysortPainterFlag.on; };
function frontByPainter(wx, wy) {
  const BI = CM.buildingInfo;
  if (!BI || !ysortPainterFlag.on) return null;
  const T = CM.TILE;
  const eps = T * ((typeof window !== 'undefined' && window.__ysortEps != null) ? window.__ysortEps : 1.0);
  const margin = T * 0.45;                    // demi-agent + débord latéral toléré des sprites
  const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
  let northClip = false;
  for (let cy = gy - 1; cy <= gy + 2; cy += 1) {
    for (let cx = gx - 1; cx <= gx + 1; cx += 1) {
      const b = BI.get(cx * 10000 + cy);
      if (!b) continue;
      if (wx < b.x0 - margin || wx > b.x1 + margin) continue;   // pas de recouvrement colonne
      if (b.baseY > wy + eps) {
        // Base franchement au SUD des pieds : s'il monte au-dessus d'eux, il occulte.
        if (!b.clipOnly && b.topY < wy) return false;
      } else if (b.baseY > wy - T * 1.15) {
        // Base au nord (ou même rangée) toute proche : rognerait la tête → « devant ».
        northClip = true;
      }
    }
  }
  return northClip;
}
function isCitizenInFront(p) {
  if (!ysortFlag.on) return false;
  const gy1 = p.gy - 1;
  // Props tall de place — fontaine / drapeau / lampadaire (clés numériques gx*10000+gy) :
  // toujours « devant » (les esplanades n'ont pas de bâtiment qui pourrait occulter).
  if ((!!CM.fountainCells && CM.fountainCells.has(p.gx * 10000 + gy1))
   || (!!CM.plazaPropCells && CM.plazaPropCells.has(p.gx * 10000 + gy1))) return true;
  const byPainter = frontByPainter(p.x + (p.lox || 0), p.y + (p.loy || 0));
  if (byPainter !== null) return byPainter;
  // Repli historique (pas de buildingInfo — tests / vieux layouts) : test cellulaire.
  return buildingNorthOf(p.gx, p.gy, p.lox || 0);
}

// front (optionnel) : 2e passe Y-SORT. Appelée avec dt=0 après les bâtiments → toutes les
// mises à jour (∝ dt) deviennent no-op (pas de double-déplacement) ; seuls sont dessinés
// les habitants « devant ». La 1re passe (front absent) met à jour TOUS les habitants mais
// ne dessine que les « derrière ».
// Le rendu SOL est scindé en MAJ (une fois/frame, updateCitizens) + dessin par agent
// (drawOneCitizen / drawOneVehicle), pour que piétons et véhicules soient triés ENSEMBLE
// par profondeur dans drawGroundAgents. Avant, tous les piétons PUIS tous les véhicules =
// une voiture recouvrait toujours un piéton de la même passe, même au SUD (devant) d'elle.
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
    let moved = 0;   // distance parcourue CE tick (pilote le lissage du trottoir)
    if (p.pauseT > 0) {
      p.pauseT -= dt;
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < 2.4) {
        citizenChooseNext(p);
      } else {
        // Iso : la projection étale l'écran (losange 2:1) → la même vitesse MONDE
        // paraît plus rapide. Facteur de calme dédié (retour Raph « ils glissent »),
        // molette window.__isoWalkSpeed (défaut 0.72). Sans effet en legacy.
        const isoK = CM.iso ? ((typeof window !== 'undefined' && window.__isoWalkSpeed != null) ? window.__isoWalkSpeed : 0.72) : 1;
        const sp = p.speed * dt * isoK;
        p.x += dx / dist * sp;
        p.y += dy / dist * sp;
        // Odomètre de marche : pilote l'animation PAR DISTANCE (les pieds suivent
        // le sol, fini le patinage) — consommé par drawEraAgentIso.
        p.walkDist = (p.walkDist || 0) + sp;
        moved = sp;
      }
    }
    // La nuit, une partie de la population rentre dormir : plutôt que de disparaître
    // net au passage du seuil, le tiers « dormeur » s'estompe progressivement quand
    // la nuit s'installe (nightF 0.55 → 0.75), puis cesse d'être dessiné.
    const nightF = CM.nightF || 0;
    let sleepFade = 1;
    if (nightF > 0.55 && (((p.phase * 100) | 0) % 3) === 0) {
      sleepFade = Math.max(0, 1 - (nightF - 0.55) / 0.2);
      if (sleepFade <= 0) { p._nightHidden = true; continue; }
    }
    p._sleepFade = sleepFade;   // lu par drawOneCitizen (indépendant de l'ordre de dessin)

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
}

// Dessine UN habitant à sa position écran courante. La MAJ (position, fondu, nuit) a déjà
// été faite par updateCitizens ; sleepFade est lu depuis p._sleepFade pour ne pas dépendre
// de l'ordre de dessin (Y-SORT).
function drawOneCitizen(p, now) {
    const ctx = CM.ctx, z = CM.cam.zoom;
    const sx = (p.x + (p.lox || 0) - CM.cam.x) * z + CM.cw / 2;
    const sy = (p.y + (p.loy || 0) - CM.cam.y) * z + CM.ch / 2;
    if (sx < 0 || sy < 0 || sx > CM.cw || sy > CM.ch) return;
    const sleepFade = p._sleepFade === undefined ? 1 : p._sleepFade;

    // ── Habitant : sprite pixel-art animé par ère + type (repli villageois/vectoriel) ──
    const ph = Math.max(1.5, 2.1 * z);            // demi-hauteur (repli vectoriel)
    const walking = p.pauseT <= 0;
    const groundY = sy + ph * 1.35;               // ligne de sol (sous les pieds)
    // Type de citoyen (0=homme, 1=femme, 2=enfant) — fixé au spawn (spawnOneCitizen).
    if (p.charType === undefined) p.charType = 0; // filet défensif : ne devrait plus arriver
    const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
    const eraSet = agentSetForBand(band);
    let spec = agentSpecFor(eraSet, p.charType, p.skinVariant || 0) || AGENT_FALLBACK;
    let chr = ensureAgentChar(spec.name);
    // Variante (métisse) pas encore générée → repli sur la variante 0 de la MÊME ère
    // (pas le villager générique), pour garder le costume d'époque.
    if (!agentReady(chr) && (p.skinVariant || 0) > 0 && p.charType !== 2) {
      spec = agentSpecFor(eraSet, p.charType, 0) || AGENT_FALLBACK;
      chr = ensureAgentChar(spec.name);
    }
    if (!agentReady(chr)) { spec = AGENT_FALLBACK; chr = ensureAgentChar(AGENT_FALLBACK.name); }
    const useSprite = agentReady(chr);
    const drawH = CM.TILE * z * spec.scale * AGENT_SCALE, drawW = drawH; // taille du sprite
    // Alpha effectif : min du fondu d'apparition (0→1) et du fondu de coucher (1→0).
    const alpha = p.fade < sleepFade ? p.fade : sleepFade;
    if (alpha < 1) ctx.globalAlpha = alpha;
    // Ombre au sol — dimensionnée au personnage (ancre)
    const shR = useSprite ? drawW * 0.2 : ph * 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(sx, groundY, shR, shR * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    if (useSprite) {
      // Sprite animé : direction selon p.dir, frame selon la phase de marche.
      const img = chr.img[VILLAGER_DIRS[p.dir]] || chr.img.south;
      // Cadence de pas un peu plus lente (160 vs 130) : accord avec l'allure de
      // marche réduite des habitants — évite l'effet « jambes qui patinent ».
      const frame = walking ? (Math.floor((now || 0) / 160 + (p.phase || 0) * 6) % AGENT_NF) : 0;
      const left = sx - drawW / 2, top = groundY - AGENT_FEET * drawH;
      const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, frame * AGENT_FW, 0, AGENT_FW, AGENT_FH, left, top, drawW, drawH);
      ctx.imageSmoothingEnabled = prevS;
    } else {
      // Repli vectoriel : jambes alternées quand il marche
      if (ph > 2 && walking) {
        const step = Math.sin((now || 0) / 110 + (p.phase || 0) * 3) * ph * 0.45;
        ctx.strokeStyle = "#241a10";
        ctx.lineWidth = Math.max(1, ph * 0.28);
        ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, sy + ph * 1.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, sy + ph * 1.3); ctx.stroke();
      }
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.moveTo(sx - ph * 0.62, sy - ph * 0.45);
      ctx.quadraticCurveTo(sx - ph * 0.5, sy + ph * 0.65, sx - ph * 0.3, sy + ph * 0.62);
      ctx.lineTo(sx + ph * 0.3, sy + ph * 0.62);
      ctx.quadraticCurveTo(sx + ph * 0.5, sy + ph * 0.65, sx + ph * 0.62, sy - ph * 0.45);
      ctx.closePath(); ctx.fill();
      if (ph >= 3) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(sx - ph * 0.5, sy - ph * 0.45, ph, Math.max(0.5, ph * 0.2));
      }
      ctx.fillStyle = p.skin || "#e0b890";
      ctx.beginPath(); ctx.arc(sx, sy - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();
      if (p.hat && ph > 1.8) {
        ctx.fillStyle = p.hat;
        ctx.beginPath(); ctx.arc(sx, sy - ph * 0.95, ph * 0.48, Math.PI, 0); ctx.fill();
      }
    }
    if (alpha < 1) ctx.globalAlpha = 1;
}

// Compat : rendu des habitants SEULS (piétons), sans les véhicules. Le moteur passe
// désormais par drawGroundAgents (Y-SORT fusionné) ; conservé pour l'API/export.
function drawCitizens(dt, now, front) {
  if (!front) updateCitizens(dt);
  if (!CM.walkRoadList.length) return;
  for (const p of CM.citizens) {
    if (p._nightHidden) continue;
    if (isCitizenInFront(p) !== !!front) continue;
    drawOneCitizen(p, now);
  }
}

// Y-SORT FUSIONNÉ piétons + véhicules au sol. Appelée 2× par frame : passe 1 (front absent,
// AVANT le blit des bâtiments) met à jour les citoyens puis dessine les agents « derrière » ;
// passe 2 (front, APRÈS le blit) dessine les agents « devant ». Dans CHAQUE passe, citoyens
// ET véhicules sont triés ENSEMBLE par Y monde (pieds) : le plus au sud est peint en dernier
// → devant. Corrige le recouvrement systématique piéton↔voiture (avant = deux couches empilées).
const _gEntries = [];
function _byY(a, b) { return a.y - b.y; }
function drawGroundAgents(dt, now, front) {
  if (!front) updateCitizens(dt);      // MAJ une seule fois (passe 1)
  const z = CM.cam.zoom, s = CM.TILE * z, pool = _gEntries;
  // A/B : ancien comportement (piétons PUIS véhicules, 2 couches empilées) — la MAJ
  // ci-dessus reste faite, seul l'ordre de dessin change. Molette __groundSort(false).
  if (!groundSortFlag.on) {
    if (CM.walkRoadList.length) {
      for (const p of CM.citizens) {
        if (p._nightHidden) continue;
        if (isCitizenInFront(p) !== !!front) continue;
        drawOneCitizen(p, now);
      }
    }
    for (const v of CM.vehicles) {
      if (v.type === "drone") continue;
      if (isVehicleInFront(v) !== !!front) continue;
      drawOneVehicle(v, now);
    }
    return;
  }
  let n = 0;
  if (CM.walkRoadList.length) {
    for (const p of CM.citizens) {
      if (p._nightHidden) continue;
      if (isCitizenInFront(p) !== !!front) continue;
      const wy = p.y + (p.loy || 0);
      const sx = (p.x + (p.lox || 0) - CM.cam.x) * z + CM.cw / 2;
      const sy = (wy - CM.cam.y) * z + CM.ch / 2;
      if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
      let e = pool[n]; if (!e) e = pool[n] = { y: 0, p: null, v: null };
      e.y = wy; e.p = p; e.v = null; n++;
    }
  }
  for (const v of CM.vehicles) {
    if (v.type === "drone" && !droneSortFlag.on) continue;   // drones = passe « air » séparée si molette off
    if (isVehicleInFront(v) !== !!front) continue;
    const sx = (v.x - CM.cam.x) * z + CM.cw / 2;
    const sy = (v.y - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
    let e = pool[n]; if (!e) e = pool[n] = { y: 0, p: null, v: null };
    e.y = v.y; e.p = null; e.v = v; n++;
  }
  if (n === 0) return;
  // Tri par Y monde (pieds) : nord = petit y dessiné d'abord (derrière), sud par-dessus (devant).
  const view = pool.slice(0, n);
  view.sort(_byY);
  for (let i = 0; i < n; i++) {
    const e = view[i];
    if (e.p) drawOneCitizen(e.p, now);
    else drawOneVehicle(e.v, now);
  }
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
    // ISO : centre de voie = demi-chaussée dessinée / 2 (CM.isoVehLane) — la file
    // colle au ruban réel ; legacy : heuristique sur les largeurs procédurales.
    const lane = (CM.iso && CM.isoVehLane != null) ? CM.isoVehLane
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
  // ISO : chaque cellule du boulevard EST une voie complète, sa chaussée dessinée
  // est CENTRÉE sur la cellule → rouler au centre = tenir sa file (le sens est déjà
  // séparé par le terre-plein). Le push extérieur legacy visait l'ancienne géométrie.
  if (CM.iso) return { x: 0, y: 0 };
  // On pousse le véhicule vers le BORD EXTÉRIEUR de sa cellule (loin de la couture =
  // de l'autre voie) → il roule dans sa file et dégage le refuge. L'autre voie est le
  // voisin "main" perpendiculaire au sens de marche.
  //
  // ⚠ Le TROTTOIR mange le bord extérieur : à 0.26 (bord de cellule) le véhicule roulait
  // dessus. On le CENTRE dans la voie roulable = milieu entre le refuge (intérieur) et le
  // trottoir (extérieur) : offset vers l'extérieur = (demi-refuge − trottoir)/2, ~0 quand
  // ils s'équilibrent (peut être légèrement négatif = vers le refuge). Auto-ajusté à l'ère
  // (largeur refuge) et au trottoir. Nudge : window.__vehLaneBias (fraction de tuile).
  const rm = CM.layout && CM.layout.roadMap;
  const isMain = (x, y) => { const c = rm && rm.get(x + "," + y); return !!(c && c.rank === "main"); };
  const ei = CM.layout?.counts?.eraIndex ?? 13;
  const medHalf = roadWidthFor("main", ei) * 0.24;                                         // demi-largeur du refuge (fraction tuile)
  const swW = pixelSidewalkFlag.on ? (sidewalkTune.widthK + sidewalkTune.curbK) / 32 : 0;  // trottoir + curb
  const bias = (typeof window !== "undefined" && window.__vehLaneBias != null) ? window.__vehLaneBias : 0;
  const mag = s * ((medHalf - swW) / 2 + bias);
  if (v.dir === 0 || v.dir === 1) {                    // roule en X → voies empilées en Y
    if (isMain(v.gx, v.gy + 1)) return { x: 0, y: -mag };  // couture en bas → file en haut
    if (isMain(v.gx, v.gy - 1)) return { x: 0, y: mag };   // couture en haut → file en bas
  } else {                                             // roule en Y → voies côte à côte en X
    if (isMain(v.gx + 1, v.gy)) return { x: -mag, y: 0 };  // couture à droite → file à gauche
    if (isMain(v.gx - 1, v.gy)) return { x: mag, y: 0 };   // couture à gauche → file à droite
  }
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
      const sp = v.speed * dt;
      v.x += dx / d * sp;
      v.y += dy / d * sp;
      // Odomètre (px monde) : les bandes diagonales iso animent les ROUES par
      // DISTANCE parcourue (anti-patinage, même recette que p.walkDist).
      v.rollDist = (v.rollDist || 0) + sp;
    }
  }
}

function drawVehicleWheel(ctx, x, y, rx, ry, fill, rim) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!rim) return;
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(0.5, ry * 0.8);
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawVehicleWheelSet(ctx, s, axles, sideY, rx, ry, fill = "#1a1a20", rim = null) {
  for (const axleX of axles) {
    drawVehicleWheel(ctx, s * axleX, -s * sideY, Math.max(1, s * rx), Math.max(0.8, s * ry), fill, rim);
    drawVehicleWheel(ctx, s * axleX, s * sideY, Math.max(1, s * rx), Math.max(0.8, s * ry), fill, rim);
  }
}

// Y-SORT (véhicule au sol) : même test « peintre » que les habitants (pieds = centre
// du véhicule + décalage de file, en px monde via s=CM.TILE). Repli cellulaire si pas
// de buildingInfo. Sert au split 2 passes.
function isVehicleInFront(v) {
  if (!ysortFlag.on) return false;
  const lo = vehicleLaneOffset(v, CM.TILE);   // s = TILE → offset en px MONDE (zoom-neutre)
  const byPainter = frontByPainter(v.x + lo.x, v.y + lo.y);
  if (byPainter !== null) return byPainter;
  return buildingNorthOf(v.gx, v.gy, 0);
}

// Boucle véhicules : filtre la passe (sol/air + Y-SORT) puis délègue à drawOneVehicle. Le
// sol passe désormais par drawGroundAgents (Y-SORT fusionné avec les piétons) ; cette
// fonction reste le point d'entrée de la passe « air » (drones) et le repli sol générique.
function drawVehicles(now, pass, front) {
  if (pass === "air" && droneSortFlag.on) return;   // drones triés dans drawGroundAgents → pas de passe air
  for (const v of CM.vehicles) {
    if (pass === "ground" && v.type === "drone") continue;
    if (pass === "air" && v.type !== "drone") continue;
    if (pass === "ground" && isVehicleInFront(v) !== !!front) continue;
    drawOneVehicle(v, now);
  }
}

// Phares d'une voiture/tram, dessinés À LA PROFONDEUR du véhicule (dans drawOneVehicle) pour
// être occultés comme la carrosserie — au lieu du tapis lumineux tardif qui brillait par-dessus
// bâtiments + nuit (même bug de z-order que carrosserie↔piéton). Nuit uniquement, ère motorisée,
// véhicule en mouvement. Additif ; alpha BOOSTÉ car dessiné AVANT le voile de nuit (~×0.5).
function drawVehicleHeadlights(ctx, v) {
  const n = CM.nightF || 0;
  if (n <= 0.3) return;                                   // phares de nuit seulement
  if ((CM.layout?.counts?.eraIndex || 0) < 14) return;   // ère motorisée
  if (v.type !== "car" && v.type !== "tram") return;
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

// Dessine UN véhicule (carrosserie pixel/procédurale + pousseur/attelage, ou drone, ou
// porteur de panier). Extrait de la boucle pour permettre le Y-SORT fin avec les piétons.
function drawOneVehicle(v, now) {
    const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
    const ei = CM.layout?.counts?.eraIndex ?? 13; // stade d'ère (repli 13)
    const sx = (v.x - CM.cam.x) * z + CM.cw / 2;
    let sy = (v.y - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) return;
    if (v.fade === undefined) v.fade = 1;
    else if (v.fade < 1) v.fade = Math.min(1, v.fade + 0.045); // ~0.7s à 30fps
    if (v.fade < 1) ctx.globalAlpha = v.fade;
    // Sprite pixel-art du véhicule (objet directionnel) ; repli procédural si absent.
    const vchr = VEH_SIZES[v.type] ? ensureVeh(v.type) : null;
    if (vchr && vehReady(vchr)) {
      const dh = CM.TILE * z * VEH_SIZES[v.type] * VEH_SCALE, dw = dh;
      // Véhicules POUSSÉS : on prend le sprite dont les BRANCARDS pointent vers
      // l'arrière (vers le pousseur). Sur ce tileset, en vertical le timon suit le
      // sens de la vue → on échange sud↔nord ; l'horizontal a déjà le timon à l'arrière.
      const sdir = VEH_PUSH[v.type] ? ['east', 'west', 'north', 'south'][v.dir] : VILLAGER_DIRS[v.dir];
      const vimg = vchr.img[sdir] || vchr.img.south;
      // Sprite éventuellement ANIMÉ : une bande plus large que haute = N frames
      // carrées (ex. le char dont le cheval intégré marche). Sinon 1 frame fixe.
      const vfh = vimg.naturalHeight || vimg.height || AGENT_FH;
      const vnf = Math.max(1, Math.round((vimg.naturalWidth || vimg.width || vfh) / vfh));
      const vf = vnf > 1 ? Math.floor((now || 0) / 130 + v.x * 0.1) % vnf : 0;
      const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      const drawV = () => {
        // Ombre au sol CENTRÉE sous la charrette (le chemin pixel-art n'en dessinait aucune → tout flottait).
        ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(sx, sy + dh * 0.30, dw * 0.30, dh * 0.085, 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(vimg, vf * vfh, 0, vfh, vfh, sx - dw / 2, sy - dh / 2, dw, dh);
      };
      // Pousseur : humain de l'ère (marche) DERRIÈRE le véhicule, orienté pareil.
      let drawP = null, pusherBelow = false;
      if (VEH_PUSH[v.type]) {
        const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
        const manSpec = agentSetForBand(band).men[0];
        const man = ensureAgentChar(manSpec.name);
        if (agentReady(man)) {
          const D = CM.TILE * z * 0.34;                  // distance véhicule↔pousseur
          // Pousseur TOUJOURS DERRIÈRE le véhicule (opposé au sens de marche) → la
          // charrette est toujours DEVANT lui, jamais dans son dos. Il regarde le sens.
          const off = [[-D, 0], [D, 0], [0, -D], [0, D]][v.dir] || [0, 0];
          pusherBelow = off[1] > 0;                       // pousseur plus bas → dessiné devant
          const ph = CM.TILE * z * (manSpec.scale || 0.85) * AGENT_SCALE; // taille d'un citoyen normal
          const fr = Math.floor((now || 0) / 130 + v.x * 0.1) % AGENT_NF;
          const mimg = man.img[VILLAGER_DIRS[v.dir]] || man.img.south;
          const pxp = sx + off[0], pyp = sy + off[1];
          drawP = () => {
            // Ombre CENTRÉE sous le pousseur (à sa vraie position pxp/pyp, pas sous la charrette).
            ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(pxp, pyp + ph * 0.20, ph * 0.38, ph * 0.14, 0, 0, Math.PI * 2); ctx.fill();
            ctx.drawImage(mimg, fr * AGENT_FW, 0, AGENT_FW, AGENT_FH, pxp - ph / 2, pyp - ph * 0.78, ph, ph);
          };
        }
      }
      // Attelage : un ou deux animaux de trait (marche) DEVANT le véhicule, reliés
      // par un timon procédural. Disjoint du pousseur (un véhicule est poussé OU tracté).
      let drawTeam = null, teamBelow = false, drawYoke = null;
      const pull = VEH_PULL[v.type];
      if (pull) {
        const beast = ensureAgentChar(pull.animal);
        if (agentReady(beast)) {
          const D = CM.TILE * z * (pull.dist || 0.44);   // distance véhicule↔attelage
          // DEVANT le véhicule (dans le sens de la marche) : +CM_DIRS[dir].
          const front = [[D, 0], [-D, 0], [0, D], [0, -D]][v.dir] || [0, 0];
          teamBelow = front[1] > 0;                       // attelage plus bas → dessiné devant
          const ah = CM.TILE * z * (pull.scale || 0.72) * AGENT_SCALE;
          const aimg = beast.img[VILLAGER_DIRS[v.dir]] || beast.img.south;
          // Nombre de frames déduit de la largeur de la bande (l'animation animale
          // n'a pas forcément 6 frames comme les habitants).
          const anf = Math.max(1, Math.round((aimg.naturalWidth || aimg.width || AGENT_FW) / AGENT_FW));
          const fr = Math.floor((now || 0) / 120 + v.x * 0.12) % anf;
          const horiz = v.dir === 0 || v.dir === 1;
          // Paire : séparation latérale (perpendiculaire au sens de marche).
          const sep = pull.n > 1 ? ah * 0.28 : 0;
          const slots = pull.n > 1
            ? [[front[0] - (horiz ? 0 : sep), front[1] - (horiz ? sep : 0)],
               [front[0] + (horiz ? 0 : sep), front[1] + (horiz ? sep : 0)]]
            : [front];
          drawTeam = () => {
            // Ombres CENTRÉES sous CHAQUE animal de trait (à sx+ax, décalé comme le sprite ;
            // dessinées d'abord, puis les sprites, pour ne pas passer par-dessus une bête voisine).
            for (const [ax, ay] of slots) {
              ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(sx + ax, sy + ay + ah * 0.30, ah * 0.42, ah * 0.15, 0, 0, Math.PI * 2); ctx.fill();
            }
            for (const [ax, ay] of slots) {
              ctx.drawImage(aimg, fr * AGENT_FW, 0, AGENT_FW, AGENT_FH,
                sx + ax - ah / 2, sy + ay - ah * 0.7, ah, ah);
            }
          };
          // Timon/joug : barre sombre du cœur du véhicule vers l'attelage.
          drawYoke = () => {
            ctx.strokeStyle = 'rgba(38,26,15,0.72)';
            ctx.lineWidth = Math.max(1, CM.TILE * z * 0.03);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + front[0] * 0.82, sy + front[1] * 0.82);
            ctx.stroke();
          };
        }
      }
      // Décalage de FILE (conduite hors refuge) appliqué à TOUTE la scène du véhicule
      // (carrosserie + pousseur + attelage + timon) via translate. BUG corrigé : l'offset
      // n'était appliqué qu'au repli procédural (mort en pratique), JAMAIS au sprite pixel
      // → les véhicules roulaient au centre exact = pile sur le terre-plein.
      let voffX = 0, voffY = 0;
      if ((v.parkT || 0) > 0) {
        const parkOff = s * 0.3 * (v.parkSide || 1);
        if (v.dir === 0 || v.dir === 1) voffY = parkOff; else voffX = parkOff;
      } else {
        const lo = vehicleLaneOffset(v, s);
        voffX = lo.x; voffY = lo.y;
      }
      ctx.save();
      ctx.translate(voffX, voffY);
      if (drawP && pusherBelow) { drawV(); drawP(); }      // véhicule s'éloigne → pousseur devant
      else if (drawP) { drawP(); drawV(); }                 // pousseur derrière
      else if (drawTeam) {                                   // tracté : timon, puis attelage devant/derrière
        if (drawYoke) drawYoke();
        if (teamBelow) { drawV(); drawTeam(); }
        else { drawTeam(); drawV(); }
      } else drawV();
      ctx.restore();
      ctx.imageSmoothingEnabled = prevS;
      if (v.fade < 1) ctx.globalAlpha = 1;
      if (CM.headlightDepth !== false) drawVehicleHeadlights(ctx, v);
      return;
    }
    if (v.type === "drone") {
      sy -= s * 0.5;
      const t2 = now || 0;
      const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
      const pulse = 0.5 + 0.5 * Math.sin(t2 / 180 + v.x * 0.05);
      // Taille globale du drone (sprite + ombre + LED + hélices, tout scale avec).
      // Réduit sous l'ancien 0.85 : un drone de livraison ne doit pas être aussi
      // gros qu'une voiture (retour Raph 2026-07-10). Réglable via window.__droneSize.
      const dScale = CM.droneSize || 0.58;
      ctx.fillStyle = `rgba(0,0,0,${(0.1 + 0.06 * Math.sin(t2 / 380)).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.55 + hover, s * dScale * 0.2, s * dScale * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      // Sprite pixel biomécanique (frelon/libellule vu de dessus) pivoté selon le cap : la tête
      // du sprite pointe vers le HAUT (nord), on l'aligne sur le vecteur de déplacement.
      const dchr = CM.droneSprite !== false ? ensureDrone() : null;
      if (dchr && dchr.ready && dchr.img) {
        let hx = v.tx - v.x, hy = v.ty - v.y;
        const hd = Math.hypot(hx, hy);
        if (hd > 0.5) { hx /= hd; hy /= hd; }
        else { hx = v.dir === 0 ? 1 : v.dir === 1 ? -1 : 0; hy = v.dir === 2 ? 1 : v.dir === 3 ? -1 : 0; }
        const dsz = s * dScale;   // taille de rendu (voir dScale ci-dessus / window.__droneSize)
        const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.translate(sx, sy + hover);
        ctx.rotate(Math.atan2(hy, hx) + Math.PI / 2);
        ctx.drawImage(dchr.img, -dsz / 2, -dsz / 2, dsz, dsz);
        // Hélices tournantes par-dessus les nacelles (dans le repère du sprite).
        if (droneRotorsOn) drawDroneRotors(ctx, dsz, t2, v.x * 0.02);
        ctx.restore();
        ctx.imageSmoothingEnabled = prevSm;
        // Cœur ambre pulsé (additif) — petit point chaud (« LED » du drone). Gardé
        // DISCRET : un gros glow lisait comme une grosse LED (retour Raph 2026-07-10).
        const prevC = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,178,82,${(0.12 + pulse * 0.16).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(sx, sy + hover, Math.max(0.5, s * dScale * 0.045), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = prevC;
        if (v.fade < 1) ctx.globalAlpha = 1;
        return;
      }
      // ── Repli procédural (quadricoptère) si le sprite n'est pas chargé ──
      ctx.fillStyle = "#3a4050";
      ctx.beginPath();
      ctx.arc(sx, sy + hover, Math.max(1.5, s * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(80,200,255,0.7)";
      ctx.beginPath();
      ctx.arc(sx, sy + hover, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#505868";
      ctx.lineWidth = Math.max(1, s * 0.022);
      for (let arm = 0; arm < 4; arm += 1) {
        const aa = arm * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy + hover);
        ctx.lineTo(sx + Math.cos(aa) * s * 0.14, sy + hover + Math.sin(aa) * s * 0.1);
        ctx.stroke();
      }
      const rotA = `rgba(200,220,255,${(0.25 + pulse * 0.2).toFixed(2)})`;
      ctx.strokeStyle = rotA;
      ctx.lineWidth = Math.max(0.5, s * 0.014);
      for (let arm = 0; arm < 4; arm += 1) {
        const aa = arm * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(aa) * s * 0.14, sy + hover + Math.sin(aa) * s * 0.1, Math.max(1, s * 0.06), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(80,255,100,${(0.7 + 0.3 * Math.sin(t2 / 200)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx + s * 0.1, sy + hover - s * 0.04, Math.max(1, s * 0.025), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,60,60,${(0.7 + 0.3 * Math.sin(t2 / 200 + Math.PI)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx - s * 0.1, sy + hover + s * 0.06, Math.max(1, s * 0.025), 0, Math.PI * 2);
      ctx.fill();
      if (v.fade < 1) ctx.globalAlpha = 1;
      return;
    }
    if (v.type === "basket") {
      // Porteur de panier : une vraie silhouette (comme les habitants), pas un
      // cercle beige flottant — l'ancien rendu faisait des "points" sur les routes.
      const ph = Math.max(1.5, 2.1 * z);
      const bob = Math.sin((now || 0) / 150 + v.x * 0.05) * ph * 0.08;
      // Ombre au sol
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(sx, sy + ph * 1.35, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      // Porteur de panier : sprite PIXEL dédié (panier baké dans le dos). Genre tiré
      // une fois et figé sur le véhicule. Repli vectoriel plus bas si pas chargé.
      const groundY = sy + ph * 1.35;
      if (v.woman === undefined) v.woman = Math.random() < 0.5;
      const dim = drawNamedAgent(ctx, sx, groundY, z, v.woman ? 'basket-woman' : 'basket-man', 0.85, v.dir, (v.pauseT || 0) <= 0, now, v.x * 0.02);
      if (dim) { if (v.fade < 1) ctx.globalAlpha = 1; return; }
      // ── Repli vectoriel : sprites pas encore chargés ──
      // Jambes alternées
      if (ph > 2) {
        const step = Math.sin((now || 0) / 120 + v.x * 0.08) * ph * 0.45;
        ctx.strokeStyle = "#241a10";
        ctx.lineWidth = Math.max(1, ph * 0.28);
        ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, sy + ph * 1.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, sy + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, sy + ph * 1.3); ctx.stroke();
      }
      // Tunique
      ctx.fillStyle = "#8f6e48";
      ctx.beginPath();
      ctx.moveTo(sx - ph * 0.62, sy - ph * 0.45);
      ctx.quadraticCurveTo(sx - ph * 0.5, sy + ph * 0.65, sx - ph * 0.3, sy + ph * 0.62);
      ctx.lineTo(sx + ph * 0.3, sy + ph * 0.62);
      ctx.quadraticCurveTo(sx + ph * 0.5, sy + ph * 0.65, sx + ph * 0.62, sy - ph * 0.45);
      ctx.closePath(); ctx.fill();
      // Tête
      ctx.fillStyle = "#d4a878";
      ctx.beginPath(); ctx.arc(sx, sy - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();
      // Panier porté sur la tête (ovale + rebord sombre)
      ctx.fillStyle = "#b08a4a";
      ctx.beginPath(); ctx.ellipse(sx, sy - ph * 1.45 + bob, ph * 0.75, ph * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a5a28";
      ctx.beginPath(); ctx.ellipse(sx, sy - ph * 1.58 + bob, ph * 0.6, ph * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      if (v.fade < 1) ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    // Stationnement : la voiture se range sur le côté de la chaussée.
    const parked = (v.parkT || 0) > 0;
    const horiz = v.dir === 0 || v.dir === 1;
    // Décalage de file (conduite à droite) — même calcul que les phares au sol
    // pour que faisceaux et carrosserie restent solidaires. Rendu seulement.
    let offX = 0, offY = 0;
    if (parked) {
      const parkOff = s * 0.3 * (v.parkSide || 1);
      if (horiz) offY = parkOff; else offX = parkOff;
    } else {
      const lo = vehicleLaneOffset(v, s);
      offX = lo.x; offY = lo.y;
    }
    ctx.translate(sx + offX, sy + offY);
    const vdx = v.tx - v.x, vdy = v.ty - v.y;
    const targetAngle = (!parked && (Math.abs(vdx) > 0.5 || Math.abs(vdy) > 0.5))
      ? Math.atan2(vdy, vdx)
      : v.dir === 0 ? 0 : v.dir === 1 ? Math.PI : v.dir === 2 ? Math.PI / 2 : -Math.PI / 2;
    // Lissage du cap : les véhicules tournent en arc court au lieu de pivoter
    // instantanément (conduite moins brutale).
    if (v.vAngle === undefined) v.vAngle = targetAngle;
    let aDiff = targetAngle - v.vAngle;
    while (aDiff > Math.PI) aDiff -= Math.PI * 2;
    while (aDiff < -Math.PI) aDiff += Math.PI * 2;
    v.vAngle += aDiff * 0.25;
    ctx.rotate(v.vAngle);
    ctx.fillStyle = "rgba(20,14,8,0.28)";
    ctx.fillRect(-s * 0.18, s * 0.08, s * 0.36, Math.max(1, s * 0.035));
    if (v.type === "car") {
      if (ei >= 14) {
        const t2 = now || 0;
        const gCol = v.col || "#4a6080";
        ctx.fillStyle = gCol;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.22, s * 0.078, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(140,210,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.02, -s * 0.02, s * 0.1, s * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        const glow = 0.5 + 0.3 * Math.sin(t2 / 300 + v.x * 0.02);
        ctx.strokeStyle = `rgba(60,200,255,${glow.toFixed(2)})`;
        ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath();
        ctx.ellipse(0, s * 0.055, s * 0.2, s * 0.025, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(80,230,255,${(0.8 + 0.2 * Math.sin(t2 / 200)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s * 0.18, -s * 0.02, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.18, s * 0.03, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
      } else if (ei >= 11) {
        ctx.fillStyle = v.col || "#5a6878";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-s * 0.2, -s * 0.07, s * 0.4, s * 0.13, s * 0.04) : ctx.fillRect(-s * 0.2, -s * 0.07, s * 0.4, s * 0.13);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(-s * 0.1, -s * 0.07, s * 0.22, s * 0.06);
        ctx.fillStyle = "rgba(160,220,240,0.55)";
        ctx.fillRect(-s * 0.08, -s * 0.065, s * 0.18, s * 0.05);
        ctx.fillStyle = "rgba(220,230,240,0.9)";
        ctx.fillRect(s * 0.15, -s * 0.05, s * 0.05, s * 0.02);
        ctx.fillRect(s * 0.15, s * 0.025, s * 0.05, s * 0.02);
        drawVehicleWheelSet(ctx, s, [-0.12, 0.12], 0.075, 0.026, 0.014, "#1a1a20", "rgba(100,120,160,0.6)");
      } else {
        ctx.fillStyle = v.col || "#9b4d38";
        ctx.fillRect(-s * 0.18, -s * 0.075, s * 0.36, s * 0.15);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(-s * 0.1, -s * 0.075, s * 0.2, s * 0.065);
        ctx.fillStyle = "rgba(185,220,225,0.62)";
        ctx.fillRect(-s * 0.07, -s * 0.065, s * 0.14, s * 0.055);
        ctx.fillStyle = "rgba(255,240,180,0.9)";
        ctx.beginPath();
        ctx.arc(s * 0.14, -s * 0.04, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.14, s * 0.02, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        drawVehicleWheelSet(ctx, s, [-0.11, 0.11], 0.075, 0.025, 0.014, "#21170f");
      }
    } else if (v.type === "tram") {
      if (ei >= 13) {
        const t2 = now || 0;
        ctx.fillStyle = "#e0e8f0";
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.01, s * 0.28, s * 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(100,180,255,0.5)";
        ctx.fillRect(-s * 0.2, -s * 0.06, s * 0.4, s * 0.055);
        ctx.strokeStyle = `rgba(40,200,255,${(0.5 + 0.3 * Math.sin(t2 / 250)).toFixed(2)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath();
        ctx.moveTo(-s * 0.26, s * 0.06);
        ctx.lineTo(s * 0.26, s * 0.06);
        ctx.stroke();
        ctx.fillStyle = "rgba(60,220,255,0.7)";
        ctx.fillRect(-s * 0.24, s * 0.04, s * 0.48, s * 0.025);
      } else {
        ctx.fillStyle = v.col || "#a8a092";
        ctx.fillRect(-s * 0.24, -s * 0.075, s * 0.48, s * 0.15);
        ctx.fillStyle = "rgba(210,225,210,0.5)";
        ctx.fillRect(-s * 0.14, -s * 0.045, s * 0.08, s * 0.08);
        ctx.fillRect(s * 0.04, -s * 0.045, s * 0.08, s * 0.08);
        ctx.strokeStyle = "rgba(40,32,24,0.45)";
        ctx.lineWidth = Math.max(1, s * 0.014);
        ctx.beginPath();
        ctx.moveTo(-s * 0.24, s * 0.09);
        ctx.lineTo(s * 0.24, s * 0.09);
        ctx.stroke();
      }
    } else if (v.type === "barrow") {
      ctx.fillStyle = "#8f6534";
      ctx.fillRect(-s * 0.11, -s * 0.07, s * 0.22, s * 0.12);
      drawVehicleWheelSet(ctx, s, [0.08], 0.065, 0.024, 0.013, "#2a1a0c");
    } else if (v.type === "chariot") {
      ctx.fillStyle = "#9a7440";
      ctx.fillRect(-s * 0.18, -s * 0.08, s * 0.3, s * 0.16);
      ctx.fillStyle = "#c0a46a";
      ctx.fillRect(s * 0.08, -s * 0.12, s * 0.1, s * 0.24);
      drawVehicleWheelSet(ctx, s, [-0.12, 0.1], 0.08, 0.03, 0.016, "#2a1a0c");
    } else if (v.type === "caravan") {
      ctx.fillStyle = "#7b5b35";
      ctx.fillRect(-s * 0.22, -s * 0.08, s * 0.18, s * 0.16);
      ctx.fillRect(s * 0.02, -s * 0.08, s * 0.18, s * 0.16);
      drawVehicleWheelSet(ctx, s, [-0.16, -0.02, 0.08, 0.22], 0.08, 0.024, 0.013, "#2a1a0c");
    } else if (v.type === "broken_cart" || v.type === "wheel") {
      ctx.strokeStyle = "rgba(52,35,20,0.65)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, -s * 0.055);
      ctx.lineTo(s * 0.12, s * 0.045);
      ctx.moveTo(-s * 0.06, s * 0.055);
      ctx.lineTo(s * 0.08, -s * 0.045);
      ctx.stroke();
      drawVehicleWheelSet(ctx, s, [-0.08, 0.08], 0.07, 0.024, 0.013, "rgba(42,26,12,0.85)");
    } else {
      ctx.fillStyle = v.col || "#8f6534";
      ctx.fillRect(-s * 0.17, -s * 0.08, s * 0.34, s * 0.16);
      drawVehicleWheelSet(ctx, s, [-0.1, 0.1], 0.08, 0.03, 0.016, "#2a1a0c");
    }
    ctx.restore();
    if (v.fade < 1) ctx.globalAlpha = 1;
    if (CM.headlightDepth !== false) drawVehicleHeadlights(ctx, v);
}

function drawShips(dt) {
  if (!CM.layout || !CM.layout.river || !CM.layout.river.present) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z, T = CM.TILE;
  const sm = CM.layout.river.samples;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const ei = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
  const now = performance.now();
  const docks = CM.shipDocks || [];
  const DOCK_RANGE = 0.05;   // demi-zone d'escale autour d'un port (unités de t)
  const DOCK_DWELL = 2.5;    // durée d'arrêt à quai (s)
  // ── Stade & échelle, CONSTANTS sur la frame (même ère pour tous les bateaux) ──
  // Stade ALIGNÉ sur le port (river_ports, cityEngineSprites) : radeau → voilier →
  // vapeur → porte-conteneurs par ère, vaisseau cosmique en band ≥ 7. Échelle de
  // coque STRICTEMENT CROISSANTE (gigantisme final, cosmic ≈ 4× le radeau) : sizeMul
  // pilote sprite + repli procédural + sillage. Réf. figée : sail = 1.8.
  // Vapeur repoussée à ei≥25 (b5 Fonte) : avant, un vapeur croisait dès l'ère 20 (b4
  // Marbre) devant des habitants en toge. La voile (galère antique) couvre b2–b4.
  const vstage = band >= 7 ? "cosmic" : ei >= 30 ? "container" : ei >= 25 ? "steam" : ei >= 10 ? "sail" : "raft";
  const sizeMul = vstage === "cosmic" ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
    : vstage === "container" ? 3.2 : vstage === "steam" ? 2.4 : vstage === "sail" ? 1.8 : 1.36;
  const effSize = (BOAT_SIZES[vstage] || 0.7) * sizeMul;   // taille de rendu effective (tuiles)
  const boatKey = vstage === "cosmic" ? "cosmic-" + Math.min(9, Math.max(7, band)) : vstage;
  for (const sh of CM.ships) {
    if (sh.dwellT === undefined) { sh.dwellT = 0; sh.lastDock = -1; }
    // ── Escale : proximité au quai le plus proche (distance circulaire en t) ──
    let prox = 0, dockSide = 0, bestIdx = -1, bestD = Infinity;
    for (let di = 0; di < docks.length; di += 1) {
      let dd = Math.abs(sh.t - docks[di].t); if (dd > 0.5) dd = 1 - dd;
      if (dd < bestD) { bestD = dd; bestIdx = di; dockSide = docks[di].side; }
    }
    if (bestIdx >= 0) { const p = Math.max(0, 1 - bestD / DOCK_RANGE); prox = p * p * (3 - 2 * p); }
    let moveF;
    if (sh.dwellT > 0) {
      sh.dwellT -= dt; moveF = 0;                            // arrêt à quai
    } else {
      moveF = 1 - 0.85 * prox;                               // ralentit en approchant
      sh.t += sh.dir * sh.speed * moveF * dt;
      if (sh.t > 1) sh.t -= 1; if (sh.t < 0) sh.t += 1;
      if (prox > 0.9 && bestIdx !== sh.lastDock) { sh.dwellT = DOCK_DWELL; sh.lastDock = bestIdx; }
      else if (bestD > DOCK_RANGE * 1.6) sh.lastDock = -1;   // assez loin : ré-escale possible
    }
    const fi = sh.t * (sm.length - 1);
    const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
    const i1 = Math.min(sm.length - 1, i0 + 1);
    const f = fi - i0;
    let cgx = sm[i0].x + (sm[i1].x - sm[i0].x) * f;
    let cgy = sm[i0].y + (sm[i1].y - sm[i0].y) * f;
    // ── Position TRANSVERSALE : chaque bateau tient sa propre VOIE (sh.lane ∈ [-1,1])
    // + un léger louvoiement, au lieu de tous suivre la ligne centrale. Bornée par la
    // demi-largeur d'eau MOINS la demi-coque → les gros vaisseaux restent vers le
    // centre (faute de place), les petits s'étalent jusqu'aux berges. Près d'un quai on
    // glisse vers la berge d'accostage. Normale = perpendiculaire au courant local.
    {
      const hw = sm[i0].hw || 2;
      let nx = -(sm[i1].y - sm[i0].y), ny = sm[i1].x - sm[i0].x;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const laneRoom = Math.max(0, hw - effSize * 0.25 - 0.25);          // jeu latéral dispo (tuiles)
      const wave = Math.sin((now || 0) / 2600 + (sh.phase || 0)) * 0.12; // louvoiement doux
      let lateral = ((sh.lane || 0) + wave) * laneRoom;
      if (prox > 0.001 && dockSide) lateral = lateral * (1 - prox) + prox * 0.9 * hw * dockSide; // accostage
      cgx += nx * lateral; cgy += ny * lateral;
    }
    const sx = (cgx * T - CM.cam.x) * z + CM.cw / 2;
    const sy = (cgy * T - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s * 2 || sx > CM.cw + s * 2 || sy < -s * 2 || sy > CM.ch + s * 2) continue;
    const night = CM.nightF || 0;
    // Cap = tangente locale du fleuve : la coque ET le sillage suivent le
    // courant. On garde « le haut en haut » (tilt seul + miroir selon le sens)
    // pour ne pas retourner mât/cheminée quand le bateau remonte le fleuve.
    const tilt = Math.atan2(sm[i1].y - sm[i0].y, Math.abs(sm[i1].x - sm[i0].x) || 1e-6);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(tilt);
    ctx.scale((sh.dir < 0 ? -1 : 1) * sizeMul, sizeMul);

    // ── Sillage : traînée de turbulence + V d'écume, DERRIÈRE la poupe (-x),
    // additif. Le bateau suit la ligne centrale (eau profonde) → le sillage
    // (court, ~1 tuile) reste dans l'eau sans qu'on ait à clipper au ruban.
    {
      const spd01 = Math.max(0, Math.min(1, (sh.speed - 0.008) / 0.012));
      const WL = s * (0.85 + spd01 * 0.8) * (0.35 + 0.65 * moveF); // longueur ∝ vitesse, raccourcit à l'arrêt
      const foam = vstage === "cosmic" ? "150,220,255" : "225,238,245"; // cyan pour le vaisseau cosmique
      const wa = (0.10 + spd01 * 0.10) * moveF;            // s'efface quand le bateau ralentit/accoste
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gt = ctx.createLinearGradient(-s * 0.18, 0, -WL, 0);
      gt.addColorStop(0, `rgba(${foam},${wa.toFixed(2)})`);
      gt.addColorStop(1, `rgba(${foam},0)`);
      ctx.fillStyle = gt;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -s * 0.045);
      ctx.lineTo(-WL, -s * 0.02);
      ctx.lineTo(-WL, s * 0.02);
      ctx.lineTo(-s * 0.18, s * 0.045);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, s * 0.03);
      for (let side = -1; side <= 1; side += 2) {
        const gv = ctx.createLinearGradient(-s * 0.1, 0, -WL, 0);
        gv.addColorStop(0, `rgba(${foam},${(wa * 1.7).toFixed(2)})`);
        gv.addColorStop(1, `rgba(${foam},0)`);
        ctx.strokeStyle = gv;
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, side * s * 0.04);
        ctx.quadraticCurveTo(-WL * 0.6, side * s * 0.1, -WL, side * s * 0.2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.fillStyle = "rgba(10,25,35,0.20)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Coque : sprite pixel-art du stade si chargé, sinon tracé procédural. ──
    // Le repère est déjà incliné (courant) + miroité (sens) → on dessine la vue est
    // centrée à l'origine, légèrement remontée pour poser la coque sur l'eau.
    const bchr = BOAT_SIZES[vstage] ? ensureBoat(boatKey) : null;
    if (bchr && boatReady(bchr)) {
      const bimg = bchr.img;
      // Bande éventuellement ANIMÉE : largeur > hauteur ⇒ N frames carrées (roue à
      // aubes qui tourne, voile qui claque, propulseur qui pulse…) ; sinon 1 frame
      // fixe. Phase décalée par sh.t → les bateaux ne battent pas tous à l'unisson.
      const bfh = bimg.naturalHeight || bimg.height || AGENT_FH;
      const bnf = Math.max(1, Math.round((bimg.naturalWidth || bimg.width || bfh) / bfh));
      const bf = bnf > 1 ? Math.floor((now || 0) / 140 + sh.t * 7) % bnf : 0;
      const dw = s * BOAT_SIZES[vstage] * BOAT_SCALE, dh = dw;
      const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bimg, bf * bfh, 0, bfh, bfh, -dw / 2, -dh / 2 - dh * BOAT_LIFT, dw, dh);
      ctx.imageSmoothingEnabled = prevSm;
    } else if (vstage === "cosmic") {
      // Vaisseau cosmique : coque profilée + canopée + propulseur d'ère pulsé
      // (écho du fboat du GRAND PORT). Palette d'ère inlinée (pas d'import croisé).
      const COS = {
        7: { mid: "#1d5640", lite: "#7fe9c0", glow: "90,240,180" },
        8: { mid: "#4a3a1c", lite: "#ffd78a", glow: "255,205,120" },
        9: { mid: "#322a52", lite: "#b9a3ff", glow: "170,140,255" }
      };
      const cp = COS[band] || COS[9];
      const pulse = 0.5 + 0.3 * Math.sin(now / 320 + sh.t * 8);
      ctx.fillStyle = cp.mid;                          // coque profilée, nez vers l'avant (+x)
      ctx.beginPath();
      ctx.moveTo(s * 0.34, 0);
      ctx.lineTo(s * 0.06, -s * 0.11);
      ctx.lineTo(-s * 0.30, -s * 0.08);
      ctx.lineTo(-s * 0.32, s * 0.05);
      ctx.lineTo(s * 0.06, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cp.mid;                          // aileron
      ctx.fillRect(-s * 0.22, -s * 0.18, s * 0.12, Math.max(1, s * 0.03));
      ctx.fillStyle = cp.lite;                         // canopée
      ctx.beginPath();
      ctx.ellipse(s * 0.02, -s * 0.01, s * 0.10, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();                                      // propulseur (poupe -x), additif
      ctx.globalCompositeOperation = "lighter";
      const gpr = ctx.createRadialGradient(-s * 0.34, 0, 0, -s * 0.34, 0, s * 0.18);
      gpr.addColorStop(0, `rgba(${cp.glow},${(0.55 + pulse * 0.3).toFixed(2)})`);
      gpr.addColorStop(1, `rgba(${cp.glow},0)`);
      ctx.fillStyle = gpr;
      ctx.beginPath(); ctx.arc(-s * 0.34, 0, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(${cp.glow},${(0.6 + pulse * 0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(-s * 0.30, 0, Math.max(1, s * 0.035), 0, Math.PI * 2); ctx.fill();
    } else if (vstage === "container") {
      // Porte-conteneurs : coque acier + conteneurs empilés colorés + château.
      ctx.fillStyle = "#39414b";
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, -s * 0.02);
      ctx.lineTo(s * 0.34, -s * 0.02);
      ctx.lineTo(s * 0.26, s * 0.12);
      ctx.lineTo(-s * 0.26, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,235,195,0.10)";
      ctx.fillRect(-s * 0.32, -s * 0.02, s * 0.66, Math.max(1, s * 0.012));
      const CC = ["#b5503a", "#3a78a8", "#c8a23a", "#4a9a5a", "#8a4a6a"];
      for (let c = 0; c < 5; c += 1) {
        const stacks = 1 + ((c * 7 + (sh.dir > 0 ? 1 : 2)) % 2);
        for (let lv = 0; lv < stacks; lv += 1) {
          ctx.fillStyle = CC[(c * 3 + lv) % CC.length];
          ctx.fillRect(-s * 0.235 + c * s * 0.092, -s * 0.05 - lv * s * 0.06, s * 0.078, s * 0.052);
        }
      }
      ctx.fillStyle = "#cfd6dc";                       // château / passerelle (arrière)
      ctx.fillRect(-s * 0.31, -s * 0.14, s * 0.08, s * 0.12);
      ctx.fillStyle = night > 0.2 ? `rgba(120,200,255,${(0.4 + night * 0.4).toFixed(2)})` : "rgba(40,48,56,0.8)";
      ctx.fillRect(-s * 0.30, -s * 0.115, s * 0.06, s * 0.03);
    } else if (vstage === "steam") {
      ctx.fillStyle = "#5a4838";
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, s * 0.02);
      ctx.quadraticCurveTo(0, s * 0.20, s * 0.26, s * 0.02);
      ctx.lineTo(s * 0.18, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.24, -s * 0.18, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7a6050";
      ctx.fillRect(-s * 0.10, -s * 0.06, s * 0.22, s * 0.10);
      ctx.strokeStyle = "#6a4a2a";
      ctx.lineWidth = Math.max(1, s * 0.022);
      const wRot = (now / 600) % (Math.PI * 2);
      for (let i = 0; i < 6; i += 1) {
        const wa = wRot + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(s * 0.22, s * 0.08);
        ctx.lineTo(s * (0.22 + Math.cos(wa) * 0.10), s * (0.08 + Math.sin(wa) * 0.07));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(s * 0.22, s * 0.08, s * 0.10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#3a2818";
      ctx.fillRect(s * 0.04, -s * 0.22, s * 0.06, s * 0.18);
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(100,90,80,${((1 - smk) * 0.30).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s * 0.07, -s * (0.22 + smk * 0.20), s * (0.04 + smk * 0.08), 0, Math.PI * 2);
      ctx.fill();
    } else if (vstage === "sail") {
      ctx.fillStyle = "#4a3320";
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, s * 0.02);
      ctx.quadraticCurveTo(0, s * 0.19, s * 0.24, s * 0.02);
      ctx.lineTo(s * 0.16, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.22, -s * 0.16, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(28,18,10,0.55)";
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, s * 0.08);
      ctx.lineTo(s * 0.13, s * 0.08);
      ctx.stroke();
      ctx.fillStyle = "#d8cdb0";
      ctx.fillRect(-s * 0.01, -s * 0.24, Math.max(1, s * 0.022), s * 0.28);
      ctx.fillStyle = `rgba(230,215,180,${(0.7 + 0.2 * Math.sin(now / 900 + sh.t * 5)).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(s * 0.015, -s * 0.22);
      ctx.lineTo(s * 0.15, -s * 0.08);
      ctx.lineTo(s * 0.015, -s * 0.02);
      ctx.closePath();
      ctx.fill();
      if (ei >= 14) {
        ctx.fillStyle = "rgba(210,195,158,0.65)";
        ctx.beginPath();
        ctx.moveTo(s * 0.015, -s * 0.22);
        ctx.lineTo(-s * 0.12, -s * 0.10);
        ctx.lineTo(s * 0.015, -s * 0.04);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#6a4a22";
      ctx.beginPath();
      ctx.moveTo(-s * 0.20, s * 0.04);
      ctx.quadraticCurveTo(0, s * 0.16, s * 0.20, s * 0.04);
      ctx.lineTo(s * 0.14, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.20, -s * 0.14, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a3818";
      ctx.lineWidth = Math.max(1, s * 0.022);
      ctx.lineCap = "round";
      const padA = Math.sin(now / 500 + sh.t * 6) * 0.4;
      ctx.beginPath();
      ctx.moveTo(s * 0.08, s * 0.06);
      ctx.lineTo(s * (0.20 + Math.cos(padA) * 0.12), s * (0.10 + Math.sin(padA) * 0.08));
      ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#7a5828";
      ctx.fillRect(-s * 0.01, -s * 0.16, Math.max(1, s * 0.018), s * 0.20);
      ctx.fillStyle = "rgba(200,170,110,0.6)";
      ctx.beginPath();
      ctx.moveTo(s * 0.010, -s * 0.14);
      ctx.lineTo(s * 0.10, -s * 0.06);
      ctx.lineTo(s * 0.010, -s * 0.01);
      ctx.closePath();
      ctx.fill();
    }

    // Escale : pendant l'arrêt à quai, petites lueurs de chargement sur le pont.
    if (sh.dwellT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 2; k += 1) {
        const a = 0.20 + 0.22 * Math.sin(now / 480 + k * 2.3 + sh.t * 6);
        if (a <= 0.02) continue;
        ctx.fillStyle = `rgba(255,212,150,${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s * (-0.07 + k * 0.15), -s * 0.07, Math.max(1, s * 0.045), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

export { chooseRoadVehicleType, drawCitizens, drawGroundAgents, drawShips, drawVehicles, getVehicleDensity, updateVehicles, updateCitizens, CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, drawCitizenThoughts, vehicleLaneOffset, drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso, drawVehicleHeadlights, thoughtBubbleAnchor, riotEraKey, frontByPainter, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH, ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors, ensureVehDiag, vehDiagReady, ISO_DIAG };
