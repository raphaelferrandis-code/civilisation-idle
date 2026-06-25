 
import { state } from '../core/state.js';
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W, roadWidthFor } from './layout.js';

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
let AGENT_SCALE = 1;     // multiplicateur global de taille (réglage live __villagerScale)

// Cache générique : name -> { img:{dir->Image}, ready:n }
const agentChars = {};
function ensureAgentChar(name) {
  let c = agentChars[name];
  if (c) return c;
  c = { img: {}, ready: 0 };
  agentChars[name] = c;
  if (typeof Image !== 'undefined') for (const d of VILLAGER_DIRS) {
    const im = new Image();
    im.onload = () => { c.ready += 1; };
    im.src = '/pixelart/agents/' + name + '-' + d + '.png';
    c.img[d] = im;
  }
  return c;
}
const agentReady = (c) => !!c && c.ready >= VILLAGER_DIRS.length;

// scale = hauteur de rendu en tuiles (enfants plus petits).
const AGENT_PREHISTORIC = [
  { name: 'caveman', scale: 0.9 },
  { name: 'cavewoman', scale: 0.86 },
  { name: 'cavechild', scale: 0.62 },
];
const AGENT_MEDIEVAL = [ // ère 2 (band 2-3) : paysans médiévaux
  { name: 'villager', scale: 0.85 },
  { name: 'villagerwoman', scale: 0.85 },
  { name: 'villagerchild', scale: 0.6 },
];
const AGENT_ANTIQUITY = [ // ère 3 (band 4) : gréco-romain (tunique, drapé)
  { name: 'greekman', scale: 0.85 },
  { name: 'greekwoman', scale: 0.85 },
  { name: 'greekchild', scale: 0.6 },
];
const AGENT_INDUSTRIAL = [ // ère 4 (band 5-6) : XIXe industriel (redingote, ouvriers)
  { name: 'industrialman', scale: 0.85 },
  { name: 'industrialwoman', scale: 0.85 },
  { name: 'industrialchild', scale: 0.6 },
];
const AGENT_FUTURE = [ // ère 5 (band ≥ 7) : cyberpunk néon sci-fi
  { name: 'futureman', scale: 0.85 },
  { name: 'futurewoman', scale: 0.85 },
  { name: 'futurechild', scale: 0.6 },
];
function agentSetForBand(band) {
  return band <= 1 ? AGENT_PREHISTORIC
    : band <= 3 ? AGENT_MEDIEVAL
      : band <= 4 ? AGENT_ANTIQUITY
        : band <= 6 ? AGENT_INDUSTRIAL
          : AGENT_FUTURE;
}
const AGENT_FALLBACK = { name: 'villager', scale: 0.82 }; // repli ultime si un sprite manque

ensureAgentChar('villager');
for (const s of [...AGENT_PREHISTORIC, ...AGENT_MEDIEVAL, ...AGENT_ANTIQUITY, ...AGENT_INDUSTRIAL, ...AGENT_FUTURE]) ensureAgentChar(s.name);
if (typeof window !== 'undefined') window.__villagerScale = (h) => { AGENT_SCALE = +h || 1; };

// ── Véhicules pixel-art (objets directionnels PixelLab) ──────────────────────
// Bandes : agents/veh-{type}-{dir}.png (1 frame, 64px). dir = v.dir (0=E,1=W,2=S,3=N).
// Valeur = hauteur de rendu en tuiles (par type). Repli sur le rendu procédural si absent.
const VEH_SIZES = { cart: 0.6, barrow: 0.5, wagon: 0.85, chariot: 0.8, caravan: 1.0, car: 0.85, tram: 1.4 };
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
    im.src = '/pixelart/agents/veh-' + type + '-' + d + '.png';
    c.img[d] = im;
  }
  return c;
}
const vehReady = (c) => !!c && c.ready >= VILLAGER_DIRS.length;
for (const t of Object.keys(VEH_SIZES)) ensureVeh(t);
// Animaux de trait (attelage) — chargés comme des bandes de marche d'agents.
for (const a of ['horse', 'ox']) ensureAgentChar(a);
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
    im.src = '/pixelart/agents/boat-' + name + '.png';
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
  if (road) return !!(road.mask & cityMapDirBit(dirIndex));
  const nx = gx + CM_DIRS[dirIndex][0], ny = gy + CM_DIRS[dirIndex][1];
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
  if (Math.random() < 0.12) {
    p.pauseT = 0.3 + Math.random() * 1.5;
    return;
  }
  const arrived = p.goal && p.goal.gx === p.gx && p.goal.gy === p.gy;
  // Arrivé sur une place : on s'attarde (discussions, marché, badauds).
  if (arrived && p.social) {
    p.social = false;
    p.pauseT = 2.5 + Math.random() * 5;
  }
  if (!p.goal || Math.random() < 0.05 || arrived) {
    // Le jour, une partie des piétons converge vers les places publiques.
    const day = (CM.nightF || 0) < 0.45;
    const plazaCells = CM.plazaRoadCells;
    const cross = Math.random() < 0.22 ? crossBankGoal(p.gx, p.gy) : null;
    if (cross) {
      p.goal = cross;
      p.social = false;
    } else if (day && plazaCells && plazaCells.length && Math.random() < 0.3) {
      const r = plazaCells[Math.floor(Math.random() * plazaCells.length)];
      p.goal = { gx: r.gx, gy: r.gy };
      p.social = true;
    } else {
      const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
      p.goal = { gx: r.gx, gy: r.gy };
      p.social = false;
    }
  }
  const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
  const opts = [];
  for (let i = 0; i < 4; i += 1) {
    const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
    if (CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny)) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
  }
  if (!opts.length) return;
  const forward = opts.filter((o) => o.i !== rev);
  const pool = forward.length ? forward : opts;
  let best = pool[0], bestScore = -Infinity;
  for (const o of pool) {
    let score = -(Math.abs(p.goal.gx - o.nx) + Math.abs(p.goal.gy - o.ny));
    if (o.i === p.dir) score += 1.6;
    score += Math.random() * 2.4;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  p.gx = best.nx;
  p.gy = best.ny;
  p.dir = best.i;
  p.tx = (p.gx + 0.5) * CM.TILE;
  p.ty = (p.gy + 0.5) * CM.TILE;
}

function drawCitizens(dt, now) {
  if (!CM.walkRoadList.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const eraI = CM.layout?.counts?.eraIndex ?? 0;

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
      // Fondu d'apparition pour éviter les "points" qui surgissent sur la carte.
      p.fade = 0;
    }
    if (p.fade === undefined) p.fade = 1;
    else if (p.fade < 1) p.fade = Math.min(1, p.fade + dt * 0.7);
    if (p.pauseT > 0) {
      p.pauseT -= dt;
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < 2.4) {
        citizenChooseNext(p);
      } else {
        const sp = p.speed * dt;
        p.x += dx / dist * sp;
        p.y += dy / dist * sp;
      }
    }
    // La nuit, une partie de la population rentre dormir.
    const nightF = CM.nightF || 0;
    if (nightF > 0.55 && (((p.phase * 100) | 0) % 3) === 0) continue;

    const wob = p.pauseT > 0 ? 0 : Math.sin((now || 0) / 240 + (p.phase || 0)) * 1.1;
    const perpX = (p.dir === 2 || p.dir === 3) ? 1 : 0;
    const perpY = perpX ? 0 : 1;
    const swSign = (p.phase > Math.PI) ? 1 : -1;
    const swOff = eraI >= 5 ? swSign * 0.27 * CM.TILE * z : 0;
    const sx = (p.x - CM.cam.x) * z + CM.cw / 2 + wob * perpX * z + swOff * perpX;
    const sy = (p.y - CM.cam.y) * z + CM.ch / 2 + wob * perpY * z + swOff * perpY;
    if (sx < 0 || sy < 0 || sx > CM.cw || sy > CM.ch) continue;

    // Met à jour la bulle de pensée au-dessus du citoyen si active
    if (p.thoughtType && p.thoughtTimer > 0) {
      p.thoughtTimer -= dt;
      if (p.thoughtTimer <= 0) {
        p.thoughtType = null;
      }
    }

    // ── Habitant : sprite pixel-art animé par ère + type (repli villageois/vectoriel) ──
    const ph = Math.max(1.5, 2.1 * z);            // demi-hauteur (repli vectoriel)
    const walking = p.pauseT <= 0;
    const groundY = sy + ph * 1.35;               // ligne de sol (sous les pieds)
    // Type de citoyen (0=homme, 1=femme, 2=enfant), tiré une fois.
    if (p.charType === undefined) { const rr = Math.random(); p.charType = rr < 0.42 ? 0 : rr < 0.84 ? 1 : 2; }
    const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
    let spec = agentSetForBand(band)[p.charType] || AGENT_FALLBACK;
    let chr = ensureAgentChar(spec.name);
    if (!agentReady(chr)) { spec = AGENT_FALLBACK; chr = ensureAgentChar(AGENT_FALLBACK.name); }
    const useSprite = agentReady(chr);
    const drawH = CM.TILE * z * spec.scale * AGENT_SCALE, drawW = drawH; // taille du sprite
    if (p.fade < 1) ctx.globalAlpha = p.fade;
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
    if (p.fade < 1) ctx.globalAlpha = 1;
  }
}

function drawCitizenThoughts(now) {
  if (!CM.walkRoadList.length || !CM.citizens) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const eraI = CM.layout?.counts?.eraIndex ?? 0;
  for (const p of CM.citizens) {
    if (p.thoughtType && p.thoughtTimer > 0) {
      const wob = p.pauseT > 0 ? 0 : Math.sin((now || 0) / 240 + (p.phase || 0)) * 1.1;
      const perpX = (p.dir === 2 || p.dir === 3) ? 1 : 0;
      const perpY = perpX ? 0 : 1;
      const swSign = (p.phase > Math.PI) ? 1 : -1;
      const swOff = eraI >= 5 ? swSign * 0.27 * CM.TILE * z : 0;
      const sx = (p.x - CM.cam.x) * z + CM.cw / 2 + wob * perpX * z + swOff * perpX;
      const sy = (p.y - CM.cam.y) * z + CM.ch / 2 + wob * perpY * z + swOff * perpY;
      if (sx < 0 || sy < 0 || sx > CM.cw || sy > CM.ch) continue;

      const emoji = p.thoughtType === "thought" ? "💭" : p.thoughtType === "scroll" ? "📜" : "⚡";
      // Taille fixe en pixels écran : la bulle ne suit pas le zoom, reste toujours lisible.
      const BR = 11; // rayon fixe
      const bx = sx;
      const by = sy - 18;

      ctx.save();
      // Queue pointant vers le personnage (bas de la bulle)
      ctx.beginPath();
      ctx.moveTo(bx, by + BR - 1);
      ctx.lineTo(bx - 3, by + BR + 6);
      ctx.lineTo(bx + 3, by + BR + 6);
      ctx.fillStyle = "rgba(18, 10, 5, 0.85)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(bx, by, BR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 248, 230, 0.95)";
      ctx.strokeStyle = "rgba(201, 168, 76, 0.85)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, bx, by + 0.5);

      ctx.restore();
    }
  }
}

// Rang de la cellule de route (les esplanades portent le rang "plaza").
function vehicleRoadRank(gx, gy) {
  const road = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
  return road ? (road.rank || "path") : "path";
}

// Décalage de file (conduite à DROITE) appliqué AU RENDU sur les grands axes :
// chaque véhicule tient sa moitié de chaussée → deux sens de circulation séparés
// (un sens de chaque côté du terre-plein), sans rouler sur l'axe central. Pur, sans
// effet sur le trajet (le pathfinding reste centré sur la cellule). PARTAGÉ entre la
// carrosserie (drawVehicles) et les phares au sol (cityMapDrawCityLights) pour qu'ils
// restent solidaires. `s` = taille tuile écran (CM.TILE * zoom).
function vehicleLaneOffset(v, s) {
  if ((v.parkT || 0) > 0) return { x: 0, y: 0 };       // garé : géré à part
  const ei = CM.frameEraIndex || 0;
  if (ei < 7) return { x: 0, y: 0 };                   // routes non divisées : centré
  const rank = vehicleRoadRank(v.gx, v.gy);
  if (rank !== "main" && rank !== "avenue") return { x: 0, y: 0 };
  // Largeur de chaussée via la source unique roadWidthFor → décalage à mi-file.
  const w = roadWidthFor(rank, ei);
  const mag = s * w * 0.26;
  if (v.dir === 0) return { x: 0, y: mag };            // est  → file sud (à droite)
  if (v.dir === 1) return { x: 0, y: -mag };           // ouest → file nord
  if (v.dir === 2) return { x: -mag, y: 0 };           // sud  → file ouest
  if (v.dir === 3) return { x: mag, y: 0 };            // nord → file est
  return { x: 0, y: 0 };
}

// Conduite des véhicules — distincte de la flânerie des piétons :
//   - jamais sur une esplanade (rang "plaza", réservé aux piétons) ;
//   - tient fortement sa ligne (pas de zigzag à chaque carrefour) ;
//   - préfère rester sur les grands axes ;
//   - les voitures se garent parfois en bord de chaussée.
function vehicleChooseNext(v) {
  if (!CM.walkRoadList.length) return;
  if (v.type === "car" && Math.random() < 0.05) {
    v.parkT = 5 + Math.random() * 16;
    return;
  }
  if (Math.random() < 0.05) {
    v.pauseT = 0.4 + Math.random() * 1.2;
    return;
  }
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
  const opts = [];
  for (let i = 0; i < 4; i += 1) {
    const nx = v.gx + CM_DIRS[i][0], ny = v.gy + CM_DIRS[i][1];
    if (!CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny))) continue;
    if (!roadStepAllowed(v.gx, v.gy, i)) continue;
    if (vehicleRoadRank(nx, ny) === "plaza") continue;
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
    if (v.parkT > 0) {
      // Garé en bord de chaussée : immobile, phares éteints.
      v.parkT -= dt;
      continue;
    }
    if (v.pauseT > 0) {
      v.pauseT -= dt;
      continue;
    }
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 2.4) {
      vehicleChooseNext(v);
    } else {
      const sp = v.speed * dt;
      v.x += dx / d * sp;
      v.y += dy / d * sp;
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

function drawVehicles(now, pass) {
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const ei = CM.layout?.counts?.eraIndex ?? 13; // extrait une fois hors boucle
  for (const v of CM.vehicles) {
    if (pass === "ground" && v.type === "drone") continue;
    if (pass === "air" && v.type !== "drone") continue;
    const sx = (v.x - CM.cam.x) * z + CM.cw / 2;
    let sy = (v.y - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
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
      const drawV = () => ctx.drawImage(vimg, vf * vfh, 0, vfh, vfh, sx - dw / 2, sy - dh / 2, dw, dh);
      // Pousseur : humain de l'ère (marche) DERRIÈRE le véhicule, orienté pareil.
      let drawP = null, pusherBelow = false;
      if (VEH_PUSH[v.type]) {
        const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
        const manSpec = agentSetForBand(band)[0];
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
          drawP = () => ctx.drawImage(mimg, fr * AGENT_FW, 0, AGENT_FW, AGENT_FH, pxp - ph / 2, pyp - ph * 0.78, ph, ph);
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
      if (drawP && pusherBelow) { drawV(); drawP(); }      // véhicule s'éloigne → pousseur devant
      else if (drawP) { drawP(); drawV(); }                 // pousseur derrière
      else if (drawTeam) {                                   // tracté : timon, puis attelage devant/derrière
        if (drawYoke) drawYoke();
        if (teamBelow) { drawV(); drawTeam(); }
        else { drawTeam(); drawV(); }
      } else drawV();
      ctx.imageSmoothingEnabled = prevS;
      if (v.fade < 1) ctx.globalAlpha = 1;
      continue;
    }
    if (v.type === "drone") {
      sy -= s * 0.5;
      const t2 = now || 0;
      const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
      const pulse = 0.5 + 0.5 * Math.sin(t2 / 180 + v.x * 0.05);
      ctx.fillStyle = `rgba(0,0,0,${(0.1 + 0.06 * Math.sin(t2 / 380)).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.55 + hover, s * 0.18, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
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
      continue;
    }
    if (v.type === "basket") {
      // Porteur de panier : une vraie silhouette (comme les habitants), pas un
      // cercle beige flottant — l'ancien rendu faisait des "points" sur les routes.
      const ph = Math.max(1.5, 2.1 * z);
      const bob = Math.sin((now || 0) / 150 + v.x * 0.05) * ph * 0.08;
      // Ombre au sol
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(sx, sy + ph * 1.35, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
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
      continue;
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
  }
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
  const vstage = band >= 7 ? "cosmic" : ei >= 30 ? "container" : ei >= 20 ? "steam" : ei >= 10 ? "sail" : "raft";
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

// ── Tram & rails : UN anneau le long de la muraille, parcouru par UN seul tram ──
// Le tracé suit le contour de l'enceinte (L.walls.outline) décalé vers l'intérieur,
// INDÉPENDANT du réseau de rues. Rails dessinés en polyligne (suit la courbe), le
// tram circule en paramétrique (comme un bateau sur le fleuve). Dès la band 5.
const TRAM_GAUGE = 0.17;    // demi-écartement des deux files (tuiles)
const TRAM_SPEED = 2.4;     // tuiles/seconde le long de l'anneau (allure tranquille)

// L'anneau (points + longueurs cumulées) est calculé dans le LAYOUT
// (layout.js → computeTramRing), qui réserve AUSSI son couloir contre les
// arbres/décor/bâtiments. Ici on ne fait que le lire.
function ensureTramLoop() {
  return (CM.layout && CM.layout.railLoop) || null;
}

// Acier (industriel/mégalopole) → rails d'énergie (cosmique, band 7+).
function tramRailStyle(band) {
  if (band >= 7) return { energy: true, steel: 'rgba(120,225,255,0.95)', glow: '90,210,255' };
  return { energy: false, steel: '#c8ced8', outline: 'rgba(18,14,10,0.85)', tie: 'rgba(40,32,24,0.7)' };
}

function cityMapDrawRails(now) {
  const loop = ensureTramLoop();
  if (!loop) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE, pts = loop.pts, n = pts.length;
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const st = tramRailStyle(band);
  const SC = (wx, wy) => [(wx * T - CM.cam.x) * z + CM.cw / 2, (wy * T - CM.cam.y) * z + CM.ch / 2];
  const g = TRAM_GAUGE;
  const left = new Array(n), right = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nx = -(b.y - a.y), ny = (b.x - a.x); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    left[i] = [p.x + nx * g, p.y + ny * g]; right[i] = [p.x - nx * g, p.y - ny * g];
  }
  ctx.save();
  ctx.lineJoin = 'round';
  // 0) PONT : tablier (+ ombre portée sur l'eau) SOUS les rails là où l'anneau
  //    franchit le fleuve (pts.water, marqué au layout). Avant traverses/rails.
  if (pts.some((p) => p.water)) {
    ctx.lineCap = 'round';
    const strokeWater = (color, lw, oy) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      for (let i = 0; i < n; i += 1) {
        const p = pts[i], q = pts[(i + 1) % n];
        if (!p.water && !q.water) continue;
        const s0 = SC(p.x, p.y), s1 = SC(q.x, q.y);
        ctx.beginPath(); ctx.moveTo(s0[0], s0[1] + (oy || 0)); ctx.lineTo(s1[0], s1[1] + (oy || 0)); ctx.stroke();
      }
    };
    const deckW = (g + 0.16) * 2 * T * z;
    strokeWater('rgba(6,14,20,0.40)', deckW + Math.max(2, T * z * 0.12), Math.max(1, T * z * 0.09)); // ombre sur l'eau
    strokeWater(st.energy ? 'rgba(45,75,105,0.95)' : 'rgba(38,26,15,0.95)', deckW + Math.max(1.5, T * z * 0.07)); // bordure
    strokeWater(st.energy ? 'rgba(120,165,205,0.96)' : '#7b5a32', deckW);                                          // tablier
  }
  // 1) Traverses (sleepers) régulières — espacement CONSTANT en longueur d'arc
  //    (indépendant de la densité d'échantillons) → vrai aspect « voie ferrée ».
  ctx.lineCap = 'butt';
  ctx.strokeStyle = st.energy ? `rgba(${st.glow},0.45)` : st.tie;
  ctx.lineWidth = Math.max(1.3, T * z * 0.1);
  const tieEvery = 1.0, ext = g + 0.05;
  let ti = 0;
  for (let d = 0; d < loop.total; d += tieEvery) {
    while (ti < loop.cum.length - 2 && loop.cum[ti + 1] < d) ti += 1;
    const seg = (loop.cum[ti + 1] - loop.cum[ti]) || 1, f = (d - loop.cum[ti]) / seg;
    const a = pts[ti], b = pts[(ti + 1) % n];
    const px = a.x + (b.x - a.x) * f, py = a.y + (b.y - a.y) * f;
    let nx = -(b.y - a.y), ny = (b.x - a.x); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const l = SC(px + nx * ext, py + ny * ext), r = SC(px - nx * ext, py - ny * ext);
    ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(r[0], r[1]); ctx.stroke();
  }
  // 2) Rails : deux files (contour sombre net + acier clair), ou glow d'énergie.
  ctx.lineCap = 'round';
  const stroke = (arr, color, lw) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    for (let i = 0; i <= n; i += 1) { const s = SC(arr[i % n][0], arr[i % n][1]); if (i === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]); }
    ctx.stroke();
  };
  const wOut = Math.max(2.4, T * z * 0.075), wIn = Math.max(1.3, T * z * 0.04);
  if (st.energy) {
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + 0.4 * Math.sin((now || 0) / 600);
    stroke(left, `rgba(${st.glow},${(0.3 * pulse).toFixed(2)})`, wOut * 2.6);
    stroke(right, `rgba(${st.glow},${(0.3 * pulse).toFixed(2)})`, wOut * 2.6);
    stroke(left, st.steel, wIn); stroke(right, st.steel, wIn);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    stroke(left, st.outline, wOut); stroke(right, st.outline, wOut);   // contour sombre net
    stroke(left, st.steel, wIn); stroke(right, st.steel, wIn);         // acier clair
  }
  ctx.restore();
}

function drawTram(dt) {
  const loop = ensureTramLoop();
  if (!loop) { CM.tram = null; return; }
  if (!CM.tram) CM.tram = { t: 0, dir: 1 };
  const tram = CM.tram;
  tram.t += (dt * TRAM_SPEED) / Math.max(1, loop.total);
  tram.t -= Math.floor(tram.t);
  const d = tram.t * loop.total;
  let i = 0; while (i < loop.cum.length - 2 && loop.cum[i + 1] < d) i += 1;
  const segLen = (loop.cum[i + 1] - loop.cum[i]) || 1, f = (d - loop.cum[i]) / segLen;
  const a = loop.pts[i], b = loop.pts[(i + 1) % loop.pts.length];
  const wx = a.x + (b.x - a.x) * f, wy = a.y + (b.y - a.y) * f;
  const z = CM.cam.zoom, T = CM.TILE, s = T * z;
  const sx = (wx * T - CM.cam.x) * z + CM.cw / 2, sy = (wy * T - CM.cam.y) * z + CM.ch / 2;
  if (sx < -s * 2 || sy < -s * 2 || sx > CM.cw + s * 2 || sy > CM.ch + s * 2) return;
  const dgx = (b.x - a.x) * tram.dir, dgy = (b.y - a.y) * tram.dir;  // sens de marche → sprite cardinal
  const dir = Math.abs(dgx) >= Math.abs(dgy) ? (dgx > 0 ? 0 : 1) : (dgy > 0 ? 2 : 3);
  const ctx = CM.ctx, veh = ensureVeh('tram');
  const dh = T * z * (VEH_SIZES.tram || 1.4) * VEH_SCALE, dw = dh;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sx, sy + dh * 0.18, dw * 0.3, dh * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  if (veh && vehReady(veh)) {
    const img = veh.img[VILLAGER_DIRS[dir]] || veh.img.south;
    const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx - dw / 2, sy - dh / 2, dw, dh);
    ctx.imageSmoothingEnabled = prevS;
  } else {
    ctx.fillStyle = '#a8a092'; ctx.fillRect(sx - dw * 0.28, sy - dh * 0.14, dw * 0.56, dh * 0.28);
  }
}

export { chooseRoadVehicleType, drawCitizens, drawShips, drawVehicles, getVehicleDensity, updateVehicles, CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, drawCitizenThoughts, vehicleLaneOffset, cityMapDrawRails, drawTram };
