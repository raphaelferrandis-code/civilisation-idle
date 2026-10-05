 
import { state } from '../core/state.js';
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W, roadWidthFor, medianHalfFor } from './layout.js';
import { worldToScreen as projWorldToScreen, panDeltaToScreen } from './iso/projection.js';
import { bridgeWalkBand, bridgeTune } from './iso/isoBridge.js';
import { VEH_SKINS } from './vehicleSkins.js';
import { pxProbe, recPx } from './pixelGrid.js';
import { snapDev } from './blitSnap.js';
import { drawSunShadow } from './iso/isoSunShadow.js';
import { walkPath, walkNearest, walkComponent } from './citizenRoute.js';
import { dayPhase, citizenTraits, homeTime, dawnFor, pickAgenda, dwellFor, paceFor } from './citizenDay.js';
import { figAhead } from './figures.js';

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
// ⚠ LISTE EXPLICITE des noms qui ONT leurs 4 bandes cardinales (east/west/south/north) :
// les VIEILLES bandes de face d'avant la mise à plat d'août, figées depuis — seuls ces
// replis en ont. Les dessins à métiers et les ères redessinées (romains, modernes,
// cosmiques, manifestants modernes) n'en ont pas : demandées quand même, c'était 4
// requêtes en échec par nom, 196 à chaque lancement (audit du 05/10, ASSET-2) — le .exe
// compte chaque fichier absent (même leçon qu'IDLE_ONE et POSE_NONE plus bas). Un nom
// hors liste n'est jamais prêt : drawNamedAgent rend false, l'appelant passe à son repli
// (drawEraAgent → le villageois), exactement ce que faisait le 404.
const CARDINAL_NAMES = new Set([
  'villager', 'villager2', 'villagerwoman', 'villagerwoman2', 'villagerchild',
  'caveman', 'caveman2', 'cavewoman', 'cavewoman2', 'cavechild',
  'industrialman', 'industrialman2', 'industrialwoman', 'industrialwoman2', 'industrialchild',
  'basket-man', 'basket-woman', 'ox', 'horse',
  // Émeutiers : toutes les ères sauf 'mod-' (manifestants modernes, diagonales seules).
  ...['', 'stone-', 'anti-', 'ind-', 'fut-'].flatMap((era) =>
    ['man-fork', 'man-torch', 'woman-fork', 'woman-torch'].map((g) => 'rioter-' + era + g)),
]);
function ensureAgentChar(name) {
  let c = agentChars[name];
  if (c) return c;
  c = { img: {}, ready: 0 };
  agentChars[name] = c;
  if (typeof Image !== 'undefined' && CARDINAL_NAMES.has(name)) for (const d of VILLAGER_DIRS) {
    const im = new Image();
    im.onload = () => { c.ready += 1; };
    im.src = '/pixelart/agents/' + agentDir(name) + '/' + name + '-' + d + '.png';
    c.img[d] = im;
  }
  return c;
}
const agentReady = (c) => !!c && c.ready >= VILLAGER_DIRS.length;
// Famille de la SONDE G0 (pixelGrid.js) : un nom d'agent ne dit pas à quel monde
// il appartient, son rangement si — même critère qu'agentDir juste au-dessus.
// Les bêtes de trait gardent leur espèce (le bœuf et le cheval ne sont pas
// dessinés à la même taille, cf. VEH_PULL).
function pxAgentFam(name) {
  if (name === 'ox' || name === 'horse') return 'bete · ' + name;
  if (name.startsWith('rioter-')) return 'emeutier';
  if (name.startsWith('basket-')) return 'porteur';
  return 'habitant';
}

// scale = hauteur de rendu en tuiles (enfants plus petits). Structure PAR GENRE : plusieurs
// variantes d'HOMME et de FEMME par ère (diversité). La variante est tirée par citoyen
// (p.skinVariant) et FIXÉE au spawn. La variante « 2 » (peau métisse) est ajoutée au fil des
// générations PixelLab ; tant que ses sprites manquent, le rendu retombe sur la variante 0.
const AGENT_PREHISTORIC = {
  // Scales ×~1.46 depuis la régé FLAT 2026-08-03 (ratio perso/canvas 0.50 vs 0.728
  // des anciennes bandes) : même hauteur de perso à l'écran qu'avant.
  // + 3 MÉTIERS (PLAN-VIVANT, 2026-10-03), dessinés en v3 toile 32 : scale = 1,31 × 32/56
  // ≈ 0,75, MÊME taille de pixel que les dessins d'août de l'ère (charte « une main »).
  men: [
    { name: 'caveman', scale: 1.31 }, { name: 'caveman2', scale: 1.31 },        // + variante peau noire + tenue
    { name: 'caveman3', scale: 0.75 },   // pêcheur, poisson sur l'épaule
    { name: 'caveman4', scale: 0.75 },   // chaman, coiffe en bois de cerf
  ],
  women: [
    { name: 'cavewoman', scale: 1.25 }, { name: 'cavewoman2', scale: 1.25 },
    { name: 'cavewoman3', scale: 0.75 }, // cueilleuse, panier de baies
  ],
  child: { name: 'cavechild', scale: 0.87 },
};
const AGENT_MEDIEVAL = { // ère 2 (band 2-3) : paysans médiévaux — scales ×1.46 (régé FLAT, ratio 0.50)
  // + 3 MÉTIERS (2026-10-03), toile 32 : 1,24 × 32/56 ≈ 0,71, même taille de pixel.
  men: [
    { name: 'villager', scale: 1.24 }, { name: 'villager2', scale: 1.24 },      // + variante métisse
    { name: 'villager3', scale: 0.71 },  // moine, habit noir et blanc
    { name: 'villager4', scale: 0.71 },  // garde, tabard bleu à croix jaune
  ],
  women: [
    { name: 'villagerwoman', scale: 1.24 }, { name: 'villagerwoman2', scale: 1.24 }, // + variante métisse
    { name: 'villagerwoman3', scale: 0.71 }, // boulangère, panier de pains
  ],
  child: { name: 'villagerchild', scale: 0.87 },
};
const AGENT_ANTIQUITY = { // band 4 : la Rome des domus et des insulae
  // PILOTE du chantier « vivant » (docs/PLAN-VIVANT.md, 2026-10-01) : 8 dessins à
  // MÉTIERS, dans la main des habitants d'août (aplats, contour noir). Les anciens
  // « Grecs » (torse nu, pagne) se confondaient avec l'âge de pierre.
  // Toile 32 remplie à ~90 % (et non 56 remplie à 50 %) → scale 0,70 pour la même
  // hauteur de personnage à l'écran ; bandes -half de 16 px au petit zoom. Un scale
  // UNIQUE pour les adultes : même taille de pixel pour tous (charte, « une main »).
  men: [
    { name: 'romanman', scale: 0.70 },   // citoyen en toge à bande pourpre
    { name: 'romanman2', scale: 0.70 },  // marchand, tunique safran
    { name: 'romanman3', scale: 0.70 },  // légionnaire
    { name: 'romanman4', scale: 0.70 },  // porteur d'amphore
  ],
  women: [
    { name: 'romanwoman', scale: 0.70 },  // matrone, stola bleu roi
    { name: 'romanwoman2', scale: 0.70 }, // prêtresse en blanc
    { name: 'romanwoman3', scale: 0.70 }, // porteuse d'eau
  ],
  child: { name: 'romanchild', scale: 0.50 },
};
const AGENT_INDUSTRIAL = { // ère 4 (band 5-6) : XIXe industriel — scales ×1.46 (régé FLAT, ratio 0.50)
  // + 3 MÉTIERS (2026-10-03), toile 32 : 1,24 × 32/56 ≈ 0,71, même taille de pixel.
  men: [
    { name: 'industrialman', scale: 1.24 }, { name: 'industrialman2', scale: 1.24 }, // + variante peau noire + tenue
    { name: 'industrialman3', scale: 0.71 }, // sergent de ville, uniforme bleu
    { name: 'industrialman4', scale: 0.71 }, // ouvrier, salopette bleue et clé
  ],
  women: [
    { name: 'industrialwoman', scale: 1.24 }, { name: 'industrialwoman2', scale: 1.24 },
    { name: 'industrialwoman3', scale: 0.71 }, // marchande de fleurs, châle rouge
  ],
  child: { name: 'industrialchild', scale: 0.87 },
};
const AGENT_MODERN = { // band 6 : la ville de bureaux (PLAN-VIVANT, 2026-10-02)
  // Redessinés : les combinaisons turquoise d'août disaient « futur » dans une ville
  // moderne. Toile 32 + -half, scale 0,70 (cf. AGENT_ANTIQUITY).
  men: [
    { name: 'modernman', scale: 0.70 },   // costume marine, cravate rouge
    { name: 'modernman2', scale: 0.70 },  // sweat jaune, jean
    { name: 'modernman3', scale: 0.70 },  // coursier orange
    { name: 'modernman4', scale: 0.70 },  // joggeur vert
  ],
  women: [
    { name: 'modernwoman', scale: 0.70 },  // manteau rouge
    { name: 'modernwoman2', scale: 0.70 }, // infirmière
    { name: 'modernwoman3', scale: 0.70 }, // veste rose, sacs de courses
  ],
  child: { name: 'modernchild', scale: 0.50 },  // ciré jaune
};
// (AGENT_FUTURE, le jeu cyberpunk d'août des bandes 7-9 — futureman/futurewoman/
// futurechild —, a été remplacé le 2026-10-02 par un jeu par cité, ci-dessous. Les
// bandes restent sur le disque.)
// Ères cosmiques (PLAN-VIVANT, 2026-10-02) : UN jeu par bande, habillé comme sa
// cité — jade et ivoire (7), nacre et or (8), marbre et cristal violet (9). Les
// cyberpunks sombres d'août ne sont plus servis.
const AGENT_COSMIC7 = {
  men: [
    { name: 'jademan', scale: 0.70 },    // tunique de jade, cape ivoire
    { name: 'jademan2', scale: 0.70 },   // jardinier et son arbre en pot
    { name: 'jademan3', scale: 0.70 },   // ingénieur à visière orange
    { name: 'jademan4', scale: 0.70 },   // savant à tablette lumineuse
  ],
  women: [
    { name: 'jadewoman', scale: 0.70 },  // robe de jade, ceinture d'or
    { name: 'jadewoman2', scale: 0.70 }, // botaniste couronnée de fleurs
    { name: 'jadewoman3', scale: 0.70 }, // pilote, foulard corail
  ],
  child: { name: 'jadechild', scale: 0.50 },
};
const AGENT_COSMIC8 = {
  men: [
    { name: 'stellarman', scale: 0.70 },    // astronome, robe nuit étoilée d'or
    { name: 'stellarman2', scale: 0.70 },   // coursier au petit jetpack d'or
    { name: 'stellarman3', scale: 0.70 },   // noble en ivoire, col d'or
    { name: 'stellarman4', scale: 0.70 },   // marin des étoiles
  ],
  women: [
    { name: 'stellarwoman', scale: 0.70 },  // chanteuse en robe d'or
    { name: 'stellarwoman2', scale: 0.70 }, // navigatrice, visière d'or
    { name: 'stellarwoman3', scale: 0.70 }, // jardinière aux fleurs orange
  ],
  child: { name: 'stellarchild', scale: 0.50 },  // ballon étoile
};
const AGENT_COSMIC9 = {
  men: [
    { name: 'crystalman', scale: 0.70 },    // mage, bâton de cristal violet
    { name: 'crystalman2', scale: 0.70 },   // sculpteur et son bloc de marbre
    { name: 'crystalman3', scale: 0.70 },   // moine blanc, écharpe violette
    { name: 'crystalman4', scale: 0.70 },   // mineur de cristal
  ],
  women: [
    { name: 'crystalwoman', scale: 0.70 },  // prêtresse lilas, couronne de cristal
    { name: 'crystalwoman2', scale: 0.70 }, // tisserande aux rubans violets
    { name: 'crystalwoman3', scale: 0.70 }, // danseuse en magenta
  ],
  child: { name: 'crystalchild', scale: 0.50 },
};
function agentSetForBand(band) {
  return band <= 1 ? AGENT_PREHISTORIC
    : band <= 3 ? AGENT_MEDIEVAL
      : band <= 4 ? AGENT_ANTIQUITY
        : band <= 5 ? AGENT_INDUSTRIAL   // Fonte : XIXe industriel
          : band <= 6 ? AGENT_MODERN     // la ville de bureaux
            : band <= 7 ? AGENT_COSMIC7  // la cité de jade
              : band <= 8 ? AGENT_COSMIC8   // la cité stellaire, nacre et or
                : AGENT_COSMIC9;            // la cité du démiurge, marbre et cristal
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
// La bande 6 a ses propres manifestants depuis le 2026-10-02 (PLAN-VIVANT) : avant,
// elle prenait les ouvriers à casquette de l'industriel.
function riotEraKey(band) {
  return band <= 1 ? 'stone-'
    : band <= 3 ? ''
      : band <= 4 ? 'anti-'
        : band <= 5 ? 'ind-'
          : band <= 6 ? 'mod-'   // manifestants modernes (torche de route, pancarte)
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
const AGENT_SETS = [AGENT_PREHISTORIC, AGENT_MEDIEVAL, AGENT_ANTIQUITY, AGENT_INDUSTRIAL, AGENT_MODERN, AGENT_COSMIC7, AGENT_COSMIC8, AGENT_COSMIC9];
const ISO_AGENT_NAMES = [...new Set([
  ...AGENT_SETS
    .flatMap((set) => [...set.men, ...set.women, set.child].map((s) => s.name)),
  ...BASKET_CARRIERS,
])];

// Seul le repli ultime garde ses bandes de FACE préchargées. Les 64 dessins d'ère les
// préchargeaient toutes (196 fichiers absents, ~8,6 Mo décodés pour un repli que la
// diagonale remplace) : ce sont leurs DIAGONALES qui se préchargent maintenant, celles
// de la bande d'ère courante et de la suivante (preloadAgentDiags, plus bas).
ensureAgentChar('villager');
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
  const drawH = Math.max(1, snapDev(CM.TILE * z * scale * AGENT_SCALE * scaleMul)), drawW = drawH;
  const img = chr.img[VILLAGER_DIRS[d]] || chr.img.south;
  // Frame DÉDUITE de l'image (frames carrées) : les bandes flat 2026-08 sortent en
  // 56-60 px, plus au 68 historique. Position et taille sur la grille DEVICE
  // (blitSnap.js) contre le fourmillement — l'arrondi CSS d'avant le 2026-09-14
  // tombait entre deux pixels aux échelles Windows 125 et 150 %.
  const fh = img.naturalHeight || AGENT_FH;
  // Nombre d'images DÉDUIT de la bande, comme le fait déjà le jumeau iso : la hauteur
  // de frame l'était déjà, le COMPTE restait sur AGENT_NF en dur. Toutes les bandes
  // actuelles en ont bien 6, mais une bande plus courte y tirait des frames hors cadre
  // — panne muette, le sprite disparaît une image sur deux au lieu de crier.
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const frame = walking ? (Math.floor((now || 0) / 160 + (phase || 0) * 6) % nf) : 0;
  const left = snapDev(sx - drawW / 2), top = snapDev(groundY - AGENT_FEET * drawH);
  const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  if (pxProbe.on) recPx(pxAgentFam(name) + ' · cardinal', fh, drawH);
  drawSunShadow(ctx, img, left, top, drawW, drawH, frame * fh, 0, fh, fh, 'bottom');
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
// ⚠ Puis des essais LENTS (toutes les 30 s pendant 10 min) : le serveur de dev peut
// mourir et revenir pendant qu'une partie tourne (retour Raph, 2026-10-03 : ère 0
// entière retombée sur les vieilles bandes de face après un plantage du watcher).
// Sans eux, la partie ouverte gardait ses replis jusqu'au F5. onFail est appelé UNE
// fois, au passage aux essais lents.
function loadWithRetry(src, onOk, onFail) {
  const im = new Image();
  let tries = 0;
  im.onload = () => onOk(im);
  im.onerror = () => {
    tries += 1;
    if (tries === 4 && onFail) onFail();
    if (tries <= 3) setTimeout(() => { im.src = src + '?r=' + tries; }, tries * 8000);
    else if (tries <= 23) setTimeout(() => { im.src = src + '?r=' + tries; }, 30000);
  };
  im.src = src;
  return im;
}

// L'ATTENTE ANIMÉE (docs/PLAN-COMPORTEMENTS.md, lot 3 — « fini les statues ») : tout
// personnage ARRÊTÉ était figé sur l'image 0 de sa marche. Les habitants des ères et
// les porteurs de panier ont maintenant une courte bande d'attente (respiration, 4
// images, gabarit PixelLab breathing-idle, scripts/fetchAgentIdle.mjs) :
// {name}-idle-{dir}.png et sa demi-bande. ⚠ LISTE EXPLICITE des noms qui en ont une :
// en dev Vite répond 200 sur un fichier absent, mais le .exe compte chaque demande
// manquante en ERR_FILE_NOT_FOUND (leçon des bandes de place, isoPlaza.js).
// `__idleAnim(false)` coupe l'attente (retour à l'image 0, pour un A/B).
const IDLE_NAMES = new Set([...AGENT_SETS.flatMap((set) => [...set.men, ...set.women, set.child]).map((s) => s.name), ...BASKET_CARRIERS]);
const IDLE_ANIM = { on: true, ms: 280 };
if (typeof window !== 'undefined') window.__idleAnim = (on) => { if (on != null) IDLE_ANIM.on = !!on; return IDLE_ANIM.on; };
// L'attente sur UNE seule vue (sud-est) : les filles de la Maison des Plaisirs à la porte
// et au balcon (iso/isoPlaisirs.js, dir 0), animées à partir de leur propre image
// (PixelLab animate_image) — elles étaient les dernières figées de la ville.
const IDLE_ONE = new Set(["plaisirs-feu-flamme","plaisirs-feu-sauvage","plaisirs-moyen-gigue","plaisirs-moyen-dame","plaisirs-antique-bacchante","plaisirs-antique-danseuse","plaisirs-fonte-cancan","plaisirs-fonte-chanteuse","plaisirs-neon-revue","plaisirs-neon-or","plaisirs-jade-lumiere","plaisirs-jade-eclat","plaisirs-astral-lumiere","plaisirs-astral-eclat","plaisirs-cristal-lumiere","plaisirs-cristal-eclat"]);
const idleOk = (c, dd) => { const ii = c.idle[dd]; return !!(ii && ii.complete && ii.naturalWidth > 0); };
// LES POSES — S'ASSEOIR sur un banc, SALUER (docs/PLAN-COMPORTEMENTS.md §8) : bandes
// {name}-{sit|wave}-{dir}.png, tirées de l'image d'attente du personnage (PixelLab v3,
// scripts/fetchAgentIdle.mjs --as), sur les faces SUD seulement — de dos on ne voit ni
// l'un ni l'autre : une pose demandée de dos retombe sur l'attente. La bande d'assis
// finit ASSIS (u = 1 tient sa dernière image) ; le salut se joue une fois (u de 0 à 1).
// Chargées à la première demande.
const POSE_NAMES = new Set(AGENT_SETS.flatMap((set) => [...set.men, ...set.women, set.child]).map((s) => s.name));
const POSE_DIRS = new Set(['southeast', 'southwest']);
// Les poses qui n'existent pas (jamais demandées : le .exe compte chaque fichier absent) —
// la mage au bâton de l'âge de cristal et la paysanne au panier ne s'assoient pas (plusieurs
// essais ratés) : sur un banc, elles restent debout devant.
const POSE_NONE = new Set(['crystalman:sit', 'villagerwoman3:sit']);
function poseStrip(c, name, kind, dd) {
  if (!POSE_NAMES.has(name) || !POSE_DIRS.has(dd) || POSE_NONE.has(name + ':' + kind) || typeof Image === 'undefined') return null;
  const key = kind + ':' + dd;
  let s = c.pose[key];
  if (!s) {
    const base = '/pixelart/agents/' + agentDir(name) + '/' + name + '-' + kind + '-' + dd;
    s = c.pose[key] = { img: new Image(), half: new Image() };
    s.img.src = base + '.png';
    s.half.src = base + '-half.png';
  }
  return s.img.complete && s.img.naturalWidth > 0 ? s : null;
}

const agentDiagChars = {};
function ensureAgentDiag(name) {
  let c = agentDiagChars[name];
  if (c) return c;
  c = { img: {}, imgHalf: {}, ready: 0, failed: 0, idle: {}, idleHalf: {}, idleReady: 0, pose: {} };
  agentDiagChars[name] = c;
  const idleDirs = IDLE_NAMES.has(name) ? ISO_DIAG : IDLE_ONE.has(name) ? [ISO_DIAG[0]] : [];
  if (typeof Image !== 'undefined') for (const d of idleDirs) {
    // Bande d'ATTENTE : un seul essai, comme la demi-bande ; absente → image 0.
    const base = '/pixelart/agents/' + agentDir(name) + '/' + name + '-idle-' + d;
    const im = new Image();
    im.onload = () => { c.idleReady += 1; };
    im.src = base + '.png';
    c.idle[d] = im;
    const ih = new Image();
    ih.src = base + '-half.png';
    c.idleHalf[d] = ih;
  }
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
// A/B DES BANDES PRÉ-CUITES (lot G1, docs/PLAN-GRILLE-PIXELS.md). `__agentHalf(false)`
// ignore les bandes `-half` et redessine tout depuis la planche pleine : c'est le
// « avant » d'une cuisson, en une frame et sans toucher au disque. Même rôle que
// `groundTileTune.exact` pour le blit 1:1 du sol — une cuisson sans son
// interrupteur ne se juge pas, elle se croit.
const halfBands = { on: true };
if (typeof window !== 'undefined') window.__agentHalf = (on) => { halfBands.on = on !== false; return halfBands.on; };

// `pose` (§8) : { kind: 'sit' | 'wave', u: 0-1 } — l'avancement dans la bande de pose.
function drawNamedAgentIso(ctx, sx, groundY, z, name, scale, dir, walking, now, phase, scaleMul = 1, distPx = null, groundFeet = false, pose = null) {
  const c = ensureAgentDiag(name);
  if (c.ready < ISO_DIAG.length) return false;
  const d = (dir >= 0 && dir < 4) ? dir : 2;
  let img = c.img[ISO_DIAG[d]];
  let fh = img.naturalHeight || AGENT_FH;
  // Taille sur la grille DEVICE (blitSnap.js, plus l'entier CSS depuis le
  // 2026-09-14) : en sous-pixel, le nearest ré-échantillonne différemment à
  // chaque position → le sprite fourmille en marchant. Et sous 70 % de la bande
  // pleine, bascule sur la bande -half pré-cuite (ratio rendu ~1:1, fini le bruit).
  const drawH = Math.max(1, snapDev(CM.TILE * z * scale * AGENT_SCALE * scaleMul)), drawW = drawH;
  const half = halfBands.on ? c.imgHalf[ISO_DIAG[d]] : null;
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) {
    img = half;
    fh = half.naturalHeight;
  }
  // ARRÊTÉ : la bande d'attente si elle est là (lot 3), à la même bascule demi-taille.
  const idling = !walking && IDLE_ANIM.on && idleOk(c, ISO_DIAG[d]);
  if (idling) {
    const fhFull = c.idle[ISO_DIAG[d]].naturalHeight || fh;
    const ih = halfBands.on ? c.idleHalf[ISO_DIAG[d]] : null;
    if (ih && ih.complete && ih.naturalWidth > 0 && drawH <= fhFull * 0.7) { img = ih; fh = ih.naturalHeight; }
    else { img = c.idle[ISO_DIAG[d]]; fh = fhFull; }
  }
  // UNE POSE (s'asseoir, saluer) : sa bande si elle existe pour cette vue (même bascule).
  const ps = pose && !walking ? poseStrip(c, name, pose.kind, ISO_DIAG[d]) : null;
  if (ps) {
    const fhFull = ps.img.naturalHeight || fh;
    if (halfBands.on && ps.half.complete && ps.half.naturalWidth > 0 && drawH <= fhFull * 0.7) { img = ps.half; fh = ps.half.naturalHeight; }
    else { img = ps.img; fh = fhFull; }
  }
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  let frame = 0;
  if (ps) {
    frame = Math.min(nf - 1, Math.max(0, Math.floor((pose.u || 0) * nf)));
  } else if (idling) {
    // Respiration lente, désynchronisée par la phase du personnage.
    frame = Math.floor((now || 0) / IDLE_ANIM.ms + (phase || 0) * 7.3) % nf;
  } else if (walking) {
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
  const left = snapDev(sx - drawW / 2), top = snapDev(groundY - feetF * drawH);
  drawSunShadow(ctx, img, left, top, drawW, drawH, frame * fh, 0, fh, fh, 'bottom');   // ombre du soleil, pied de CETTE image
  const prevS = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  // Sonde G0 : `fh` porte DÉJÀ la bascule -half ci-dessus — c'est la planche
  // réellement échantillonnée qui est mesurée, pas celle qu'on croit servir.
  if (pxProbe.on) recPx(pxAgentFam(name), fh, drawH);
  ctx.drawImage(img, frame * fh, 0, fh, fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prevS;
  return { drawW, drawH, top };
}
// L'IMAGE d'un habitant nommé, pour qui le dessine lui-même (l'équipage des bateaux,
// boatKit.drawCrew, qui le découpe par le masque de sa coque) : même bande que
// drawNamedAgentIso (pleine ou -half, même bascule), frame 0, taille à l'écran et
// ligne de pieds MESURÉE. null tant que les quatre bandes ne sont pas décodées.
// `scale` : celle du dessin quand il n'est pas d'un jeu d'habitants (les filles de
// la Maison des Plaisirs, plaisirsCast).
const AGENT_SCALE_OF = new Map(AGENT_SETS.flatMap((set) => [...set.men, ...set.women, set.child]).map((s) => [s.name, s.scale]));
// La frame d'ATTENTE d'un habitant (bande -idle, lot 3 de PLAN-COMPORTEMENTS) pour qui
// le dessine à sa main — l'équipage des bateaux (boatKit.drawCrew), qui restait figé sur
// l'image 0 de sa marche. Même choix de bande pleine / demi que agentFrameIso.
// Rend { img, fh, sx } ou null (pas de bande d'attente, ou pas encore chargée).
function agentIdleFrameIso(name, dir, z, scale, now, phase) {
  if (!IDLE_ANIM.on || !IDLE_NAMES.has(name)) return null;
  const c = ensureAgentDiag(name);
  const dd = ISO_DIAG[(dir >= 0 && dir < 4) ? dir : 2];
  if (!idleOk(c, dd)) return null;
  let img = c.idle[dd], fh = img.naturalHeight || AGENT_FH;
  const drawH = Math.max(1, snapDev(CM.TILE * z * (scale || AGENT_SCALE_OF.get(name) || AGENT_FALLBACK.scale) * AGENT_SCALE));
  const half = halfBands.on ? c.idleHalf[dd] : null;
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) { img = half; fh = half.naturalHeight; }
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  return { img, fh, sx: (Math.floor((now || 0) / IDLE_ANIM.ms + (phase || 0) * 7.3) % nf) * fh };
}
// La frame d'une POSE (§8 : 'sit' | 'wave', u de 0 à 1) pour qui dessine à sa main —
// l'équipage qui salue d'un bateau à l'autre. Même choix de bande pleine / demi.
function agentPoseFrameIso(name, dir, z, scale, kind, u) {
  const c = ensureAgentDiag(name);
  const dd = ISO_DIAG[(dir >= 0 && dir < 4) ? dir : 2];
  const ps = poseStrip(c, name, kind, dd);
  if (!ps) return null;
  let img = ps.img, fh = img.naturalHeight || AGENT_FH;
  const drawH = Math.max(1, snapDev(CM.TILE * z * (scale || AGENT_SCALE_OF.get(name) || AGENT_FALLBACK.scale) * AGENT_SCALE));
  if (halfBands.on && ps.half.complete && ps.half.naturalWidth > 0 && drawH <= fh * 0.7) { img = ps.half; fh = ps.half.naturalHeight; }
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  return { img, fh, sx: Math.min(nf - 1, Math.max(0, Math.floor((u || 0) * nf))) * fh };
}
function agentFrameIso(name, dir, z, scale = null) {
  const c = ensureAgentDiag(name);
  if (c.ready < ISO_DIAG.length) return null;
  let img = c.img[ISO_DIAG[(dir >= 0 && dir < 4) ? dir : 2]];
  let fh = img.naturalHeight || AGENT_FH;
  const drawH = Math.max(1, snapDev(CM.TILE * z * (scale || AGENT_SCALE_OF.get(name) || AGENT_FALLBACK.scale) * AGENT_SCALE));
  const half = halfBands.on ? c.imgHalf[ISO_DIAG[(dir >= 0 && dir < 4) ? dir : 2]] : null;
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) {
    img = half;
    fh = half.naturalHeight;
  }
  return { img, fh, drawH, feetF: agentFootF(c, img) };
}
// Habitant d'ère en VUE DIAGONALE si sa bande existe ; false sinon (repli cardinal).
// `variant` = p.skinVariant (dessin/métier tiré au spawn). ⚠ Jusqu'au 2026-10-01 il
// n'était PAS transmis : tous les passants sortaient en variante 0, et les seconds
// dessins de chaque ère n'apparaissaient que sur les places et les ponts.
// REPLI DANS L'ÈRE (retour Raph, 2026-10-03 : « tu as remis les anciens habitants
// ère 0, en vue de face ») : si la bande diagonale du dessin tiré manque, on prend un
// AUTRE dessin diagonal de la même ère et du même genre avant d'avouer l'échec. Le repli
// cardinal de l'appelant (drawEraAgent) sert les VIEILLES bandes de face d'avant la mise
// à plat d'août : il ne doit plus jamais s'afficher tant que l'ère a une diagonale
// prête. Cas vécu : trois métiers ajoutés au code AVANT que leurs PNG existent — le jeu
// ouvert les a demandés, 404 × 4 (loadWithRetry), réputés absents jusqu'au F5, et un
// passant sur trois marchait de face.
// PRÉCHARGEMENT des diagonales (audit du 05/10, ASSET-2) : au premier dessin d'une bande
// d'ère, TOUS ses dessins et ceux de la bande suivante sont demandés d'un coup — le
// passage d'ère trouve ses passants prêts au lieu de les montrer une frame en repli.
// ensureAgentDiag est idempotent : un nom déjà demandé ne recharge rien.
let diagPreloadBand = -1;
function preloadAgentDiags(band) {
  diagPreloadBand = band;
  for (const set of new Set([agentSetForBand(band), agentSetForBand(band + 1)]))
    for (const s of [...set.men, ...set.women, set.child]) ensureAgentDiag(s.name);
}
function drawEraAgentIso(ctx, sx, groundY, z, dir, walking, now, phase, charType, scaleMul = 1, distPx = null, variant = 0, pose = null) {
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  if (band !== diagPreloadBand) preloadAgentDiags(band);
  const set = agentSetForBand(band);
  const spec = agentSpecFor(set, charType, variant) || AGENT_FALLBACK;
  if (drawNamedAgentIso(ctx, sx, groundY, z, spec.name, spec.scale, dir, walking, now, phase, scaleMul, distPx, false, pose)) return true;
  const list = charType === 2 ? [set.child] : (charType === 1 ? set.women : set.men);
  for (const s of list) {
    if (s !== spec && drawNamedAgentIso(ctx, sx, groundY, z, s.name, s.scale, dir, walking, now, phase, scaleMul, distPx)) return true;
  }
  return false;
}

// ── L'HABITANT DÉSIGNÉ (fiche d'habitant, citizenFocus.js) ───────────────────
// Le clic vise ce qu'on VOIT, pas un disque au sol : ces fonctions refont le
// calcul de drawIsoCitizenItem → drawEraAgentIso → drawNamedAgentIso (même
// dessin tiré, même repli dans l'ère, même taille, même ancrage des pieds).
function citizenSpec(p) {
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const set = agentSetForBand(band);
  const ct = p.charType || 0;
  const spec = agentSpecFor(set, ct, p.skinVariant || 0) || AGENT_FALLBACK;
  if (ensureAgentDiag(spec.name).ready >= ISO_DIAG.length) return spec;
  const list = ct === 2 ? [set.child] : (ct === 1 ? set.women : set.men);
  for (const s of list) if (s && ensureAgentDiag(s.name).ready >= ISO_DIAG.length) return s;
  return null;
}
// Boîte d'ENCRE d'une bande (union de ses frames, bras qui balancent compris), en
// fractions du cadre. Mesurée une fois par image, à la demande, comme agentFootF —
// habitants, porteurs et véhicules (citizenFocus.js vise aussi les véhicules).
// Repli = la médiane relevée sur les 432 bandes d'habitants (2026-10-03).
const INK_FALLBACK = { l: 0.22, r: 0.78, t: 0.03, b: 0.91 };
const inkCache = new WeakMap();
function imgInkBox(img) {
  // Image décodée ou canvas cuit (la coque d'un bateau du kit est un canvas).
  if (!img || !(img.naturalWidth || img.width)) return INK_FALLBACK;
  const hit = inkCache.get(img);
  if (hit) return hit;
  let box = INK_FALLBACK;
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    let cv;
    if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(w, h);
    else { cv = document.createElement('canvas'); }
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    const nf = Math.max(1, Math.round(w / h));
    let x0 = h, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] <= 16) continue;
        const fx = x - Math.min(nf - 1, Math.floor(x / h)) * h;   // colonne DANS sa frame
        if (fx < x0) x0 = fx;
        if (fx > x1) x1 = fx;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 >= 0) box = { l: x0 / h, r: (x1 + 1) / h, t: y0 / h, b: (y1 + 1) / h };
  } catch { /* lecture impossible (image non décodée) : la médiane */ }
  inkCache.set(img, box);
  return box;
}
// Où est dessiné CET habitant, en px écran : sa silhouette (x0..x1, y0..y1), ses
// pieds, et `px` = la taille à l'écran d'un pixel de la planche réellement servie
// (bascule -half comprise) — l'anneau de désignation se dessine à ce grain-là.
// null tant qu'aucune bande diagonale de son ère n'est prête.
function citizenScreenBox(p) {
  const spec = citizenSpec(p);
  if (!spec) return null;
  const c = ensureAgentDiag(spec.name);
  const d = (p.dir >= 0 && p.dir < 4) ? p.dir : 2;
  const img = c.img[ISO_DIAG[d]];
  const sp = projWorldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  const drawH = Math.max(1, snapDev(CM.TILE * CM.cam.zoom * spec.scale * AGENT_SCALE));
  let fh = img.naturalHeight || AGENT_FH;
  const half = halfBands.on ? c.imgHalf[ISO_DIAG[d]] : null;
  if (half && half.complete && half.naturalWidth > 0 && drawH <= fh * 0.7) fh = half.naturalHeight;
  const left = snapDev(sp.x - drawH / 2), top = snapDev(sp.y - AGENT_FEET * drawH);
  const ink = imgInkBox(img);
  return {
    x0: left + ink.l * drawH, x1: left + ink.r * drawH,
    y0: top + ink.t * drawH, y1: top + ink.b * drawH,
    footX: sp.x, footY: sp.y, drawH, px: drawH / fh,
  };
}
// Le PORTRAIT de la fiche : la planche PLEINE (jamais la -half), la frame qu'il
// joue en ce moment (même cadence par distance que sur la carte), et la boîte
// d'encre pour cadrer. Il fait toujours face : un passant qui monte vers le nord
// est montré de trois quarts face, du côté où il va.
const PORTRAIT_DIR = [0, 2, 2, 0];   // SE, NO→SO, SO, NE→SE
function citizenPortraitFrame(p, now) {
  const spec = citizenSpec(p);
  if (!spec) return null;
  return namedPortraitFrame(spec.name, p.dir, (p.pauseT || 0) <= 0 && !p._nightHidden, p.walkDist, p.phase, now);
}
// Même portrait pour n'importe quel personnage NOMMÉ (le porteur de panier est un
// « véhicule » côté moteur, mais il se dessine en piéton).
function namedPortraitFrame(name, dir, walking, walkDist, phase, now) {
  const c = ensureAgentDiag(name);
  if (c.ready < ISO_DIAG.length) return null;
  const d = PORTRAIT_DIR[(dir >= 0 && dir < 4) ? dir : 2];
  const img = c.img[ISO_DIAG[d]];
  const fh = img.naturalHeight || AGENT_FH;
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  let frame = 0;
  if (walking) {
    if (walkDist != null) {
      const stride = (typeof window !== 'undefined' && window.__strideLen != null) ? window.__strideLen : 2.75 * AGENT_SCALE;
      frame = Math.floor(walkDist / Math.max(0.5, stride) + (phase || 0) * nf) % nf;
    } else {
      frame = Math.floor((now || 0) / 160 + (phase || 0) * 6) % nf;
    }
  }
  return { img, sx: frame * fh, fh, ink: imgInkBox(img) };
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
  c = { img: {}, imgHalf: {}, ready: 0, failed: 0 };
  vehDiagImg[key] = c;
  const stem = '/pixelart/agents/vehicles/veh-' + type + (skin ? '-' + skin : '');
  const era = !!eraVehSpec(type, skin);
  if (typeof Image !== 'undefined') for (const d of ISO_DIAG) {
    c.img[d] = loadWithRetry(
      stem + '-' + d + '.png',
      () => { c.ready += 1; },
      () => { c.failed += 1; },
    );
    // Véhicule d'époque : bande DEMI-TAILLE pré-cuite (même contrat que les
    // habitants, cf. ensureAgentDiag) — servie tant que la boîte affichée tient
    // dans 70 % de la planche pleine. Un seul essai : absente → planche pleine.
    if (era) { const im = new Image(); c.imgHalf[d] = im; im.src = stem + '-' + d + '-half.png'; }
  }
  return c;
}
// ── Véhicules d'ÉPOQUE (docs/PLAN-VIVANT.md, 2026-10-01) ────────────────────
// Un attelage = UN dessin : bête(s), véhicule et conducteur ensemble, dans la main
// des habitants (aplats, contour noir), objets PixelLab en toile 68 + bande -half.
// Le skin d'ère remplace la bande nue du type aux bandes listées ; les fichiers sont
// nommés au VRAI sens écran à l'assemblage (scripts/fetchEraVehicle.mjs), donc sans
// correction d'étiquette. `size` = hauteur de boîte en tuiles AVANT VEH_SCALE (la
// toise : le conducteur assis un peu plus petit qu'un passant) ; `team` = la bête
// est dans le dessin → le code n'en ajoute pas (VEH_PULL ignoré). `skins` (au lieu de
// `skin`) = plusieurs modèles/teintes tirés par véhicule (flotte moderne).
const ERA_VEH = {
  // Tram : vues FIXES (véhicule symétrique, pas de bête), toile 96 → toise ≈ 5 passants.
  tram: {
    5: { skin: 'ind', size: 2.4 },   // tram 1900 vert et crème
    6: { skin: 'mod', size: 2.4 },   // tram moderne blanc et sarcelle
    7: { skin: 'cos7', size: 2.4 },  // tram magnétique ivoire et jade
    8: { skin: 'cos8', size: 2.4 },  // tram flottant nacre et or
  },
  wagon: {
    2: { skin: 'med', size: 1.35, team: true },   // chariot à foin, bœuf
    3: { skin: 'med', size: 1.35, team: true },
    4: { skin: 'anti', size: 1.35, team: true },  // chariot à amphores romain
    5: { skin: 'ind', size: 1.35, team: true },   // charrette de brasseur, tonneaux
  },
  chariot: {
    3: { skin: 'med', size: 1.35, team: true },   // chevalier à caparaçon bleu et or
    4: { skin: 'anti', size: 1.3, team: true },   // char romain
  },
  caravan: {
    3: { skin: 'med', size: 1.4, team: true },    // marchand, bâche verte et tonneaux
    4: { skin: 'anti', size: 1.4, team: true },   // caravane romaine rayée
    5: { skin: 'ind', size: 1.4, team: true },    // omnibus rouge à impériale, deux chevaux
  },
};
function eraVehSpec(type, skin) {
  if (!skin) return null;
  const byBand = ERA_VEH[type];
  if (!byBand) return null;
  for (const b in byBand) {
    const e = byBand[b];
    if (e.skin === skin || (e.skins && e.skins.includes(skin))) return e;
  }
  return null;
}
// Molette de toise : __eraVeh('wagon', 4, { size: 1.5 }).
if (typeof window !== 'undefined') window.__eraVeh = (type, band, o) => { const s = ERA_VEH[type] && ERA_VEH[type][band]; if (s && o) Object.assign(s, o); return s ? { ...s } : null; };
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
  // Véhicule d'époque redessiné (ERA_VEH) : prime sur tout le reste à sa bande.
  const era = ERA_VEH[type] && ERA_VEH[type][band | 0];
  if (era) return era.skins ? era.skins[fmix32(seed) % era.skins.length] : era.skin;
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
    // merveille, anneau du feu de camp) : le mask ne connaît que les routes —
    // autorisé si la cellule visée est marchable-parvis. Piétons seulement (les
    // véhicules suivent les masks).
    const k = cityMapWalkRoadKey(nx, ny);
    return !!((CM.wonderWalkSet && CM.wonderWalkSet.has(k)) || (CM.hearthWalkSet && CM.hearthWalkSet.has(k)));
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

// ── LE RÉSEAU PIÉTON VU PAR LE CALCUL DE CHEMIN (PLAN-COMPORTEMENTS, lot 2) ─────
// Voisins marchables d'une case, pour citizenRoute.js : les MÊMES règles que le pas
// (masques de chaussée, parvis, anneau du feu de camp), diagonales sur l'esplanade
// d'une merveille seulement — comme le pas glouton qu'elles remplacent.
const DIAG4 = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
function walkNeighbors(gx, gy, push) {
  for (let i = 0; i < 4; i += 1) {
    const nx = gx + CM_DIRS[i][0], ny = gy + CM_DIRS[i][1];
    if (CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny)) && roadStepAllowed(gx, gy, i)) push(nx, ny, 1);
  }
  const W = CM.wonderWalkSet;
  if (W && W.has(cityMapWalkRoadKey(gx, gy))) {
    for (const [dx, dy] of DIAG4) {
      if (W.has(cityMapWalkRoadKey(gx + dx, gy + dy)) && W.has(cityMapWalkRoadKey(gx + dx, gy))
        && W.has(cityMapWalkRoadKey(gx, gy + dy))) push(gx + dx, gy + dy, 1.414);
    }
  }
}
// Le but est-il sur le même ÎLOT du réseau que le passant ? (0 = inconnu : on tente.)
function sameIsland(p, c) {
  if (!c) return false;
  const cells = CM.walkRoadSet || CM.walkRoadList;
  const a = walkComponent(p.gx, p.gy, cells, walkNeighbors, CM.layoutRecomputeAt);
  const b = walkComponent(c.gx, c.gy, cells, walkNeighbors, CM.layoutRecomputeAt);
  return !a || !b || a === b;
}
// Direction (0-3) de la façade que borde une case de rue, -1 s'il n'y en a pas : le
// premier voisin qui n'est pas de la voirie. Sert à se tourner vers la porte, la vitrine.
function facingBuilding(gx, gy) {
  const rs = CM.roadSet;
  if (!rs) return -1;
  for (let i = 0; i < 4; i += 1) {
    if (!rs.has((gx + CM_DIRS[i][0]) + ',' + (gy + CM_DIRS[i][1]))) return i;
  }
  return -1;
}
// Les seuils d'ATELIERS et de commerces (bâtiments-moteur) : vitrines, courses.
function shopDoorSet() {
  if (!CM._shopDoorSet || CM._shopDoorFor !== CM.workRoadCells) {
    CM._shopDoorFor = CM.workRoadCells;
    CM._shopDoorSet = new Set((CM.workRoadCells || []).map((c) => cityMapWalkRoadKey(c.gx, c.gy)));
  }
  return CM._shopDoorSet;
}
// Un TRAVAIL PROCHE de la maison (lot 2) : le lieu de travail était tiré n'importe
// où dans la ville. Parmi les seuils d'atelier à moins de 18 cases (Manhattan), un
// tirage par la graine ; à défaut, le plus proche. Appelé au spawn (cityMapRuntime).
function citizenWorkNear(home, seed) {
  const list = CM.workRoadCells;
  if (!list || !list.length) return null;
  if (!home) return list[(seed >>> 8) % list.length];
  const near = [];
  let best = null, bd = Infinity;
  for (const c of list) {
    const d = Math.abs(c.gx - home.gx) + Math.abs(c.gy - home.gy);
    if (d <= 18) near.push(c);
    if (d < bd) { bd = d; best = c; }
  }
  return near.length ? near[(seed >>> 8) % near.length] : best;
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
  if (p.goal && !reachable(p.goal)) { p.goal = null; p._path = null; }
  const arrived = p.goal && p.goal.gx === p.gx && p.goal.gy === p.gy;
  const dp = dayPhase(CM.dayP, CM.nightF);
  const tr = p._tr || (p._tr = citizenTraits(p));
  // S'ABRITER (lot 4) : sous une averse franche, qui passe devant une porte s'y met
  // parfois à couvert, dos au mur, face à la rue, le temps d'une accalmie qui ne vient
  // pas (12-40 s), puis repart en pressant le pas — l'averse finie, la halte est
  // levée (updateCitizens). Jusqu'à la fin de la pluie, c'était la moitié de la foule
  // figée sous les auvents (mesuré en jeu). Ceux qui RENTRENT, eux, courent (RUN_K).
  const env = CM._citEnv || null;
  if (env && env.rain > 0.3 && !p.leaving && !p.social && !p.lead && !homeTime(dp) && p.goalKind !== "home" && (CM.citT || 0) >= (p._shelterAt || 0)
    && CM.buildingEdgeSet && CM.buildingEdgeSet.has(cityMapWalkRoadKey(p.gx, p.gy)) && Math.random() < 0.05) {
    const fd = facingBuilding(p.gx, p.gy);
    if (fd >= 0) {
      p._shelter = true;
      p.pauseT = 12 + Math.random() * 28;
      p.dir = fd ^ 1;
      p._shelterAt = (CM.citT || 0) + 150;   // ~15 % de la foule à l'abri à la fois (ville dense : chaque case est un seuil)
      return;
    }
  }
  // LÈCHE-VITRINE (lot 2) : en passant devant un atelier, on s'arrête parfois un
  // instant, tourné vers lui — de jour, sans but social, pas en partance, une fois par
  // demi-minute au plus. (Les seules haltes étaient la place et le parvis.)
  if (!arrived && p.goal && !p.leaving && !p.social && !homeTime(dp) && !(p._nf > 0)
    && (CM.citT || 0) >= (p._browseAt || 0) && shopDoorSet().has(cityMapWalkRoadKey(p.gx, p.gy))
    && Math.random() < 0.06) {
    const fd = facingBuilding(p.gx, p.gy);
    if (fd >= 0) {
      p.pauseT = 1.8 + Math.random() * 2.6;
      p._browse = true;
      p._browseAt = (CM.citT || 0) + 30;
      p.dir = fd;
      return;
    }
  }
  // ENTRER (lot 2) : au travail, chez soi, dans une boutique, on entre par la porte au
  // lieu de repartir aussitôt. Le fondu de porte et l'attente à l'intérieur sont dans
  // updateCitizens (`p._enter`) ; le soir, rentré chez soi, on y reste jusqu'à l'aube.
  if (arrived && !p.social && !p.leaving && !p.lead && citizenAtDoorstep(p)) {
    const dw = dwellFor(p.goalKind, dp, tr, Math.random());
    if (dw) {
      p.goal = null; p._path = null;
      p._enter = dw.dawn ? { dawn: true } : { until: (CM.citT || 0) + dw.t };
      const fd = facingBuilding(p.gx, p.gy);
      if (fd >= 0) p.dir = fd;
      return;
    }
  }
  if (arrived && p.social) {
    // SEULE halte : la flânerie sur une PLACE ou un PARVIS de merveille (badauds,
    // marché, contemplation). Partout ailleurs les habitants ne s'arrêtent JAMAIS.
    p.social = false;
    p.pauseT = 2.5 + Math.random() * 5;
    // Sur une PLACE, on se tourne vers son centre (sa fontaine, son marché) plutôt que
    // de garder le cap de la marche (lot 3, regards).
    const pls = p.goalKind === 'plaza' && CM.layout && CM.layout.plan && CM.layout.plan.plazas;
    if (pls) {
      let best = null, bd = Infinity;
      for (const pl of pls) {
        const d = Math.abs(pl.gx - p.gx) + Math.abs(pl.gy - p.gy);
        if (d < bd) { bd = d; best = pl; }
      }
      if (best && bd <= (best.size || 4) + 1 && bd > 0) p.dir = dirToward(best.gx - p.gx, best.gy - p.gy);
    }
    if (p.gatherDir != null) {
      // Attroupement : on se TOURNE vers le monument et on contemple plus longtemps.
      p.dir = p.gatherDir;
      p.gatherDir = null;
      p.pauseT = 6 + Math.random() * 9;
    }
    p.goal = null;
    return;
  }
  if (arrived) { p.goal = null; p._path = null; } // but de passage atteint : on enchaîne
  // EN PARTANCE (la ville dépasse sa cible de foule) : cap immédiat sur le seuil le
  // plus proche, choisi UNE fois (repris s'il a été rasé par un recalcul). Traité
  // AVANT le tirage des envies du jour, et sans son re-tirage aléatoire : un partant
  // ne doit pas repartir en flânerie, sinon la foule ne redescend jamais.
  if (p.leaving) {
    if (!reachable(p.leaveCell)) {
      // Cap sur SON logement s'il est à portée — c'est chez soi qu'on rentre, sous
      // l'averse comme au départ. Trop loin (ou rasé) : le seuil le plus proche, on
      // ne traverse pas la ville entière sous la pluie pour son propre toit.
      const home = reachable(p.home) && sameIsland(p, p.home) ? p.home : null;
      const dHome = home ? Math.abs(home.gx - p.gx) + Math.abs(home.gy - p.gy) : Infinity;
      if (dHome <= SHELTER_HOME_MAX) p.leaveCell = home;
      else {
        // Le seuil le plus proche EN MARCHANT (lot 2) — à vol d'oiseau, il pouvait être
        // de l'autre côté du fleuve ou au fond d'une impasse.
        const set = CM.buildingEdgeSet;
        const hit = set && set.size ? walkNearest(p.gx, p.gy, (k) => set.has(k), walkNeighbors, 80) : null;
        p.leaveCell = hit ? { gx: Math.floor(hit.key / 10000), gy: hit.key % 10000 } : nearestDoorstep(p);
      }
    }
    if (reachable(p.leaveCell)) { p.goal = p.leaveCell; p.social = false; p.goalKind = 'leave'; }
  }
  // LE BUT DU JOUR (lot 2, citizenDay.js) : ce qu'on a envie de faire À CETTE HEURE —
  // travailler, faire ses courses, la place, la merveille, l'autre rive, flâner ;
  // rentrer le soir. Tiré UNE fois, à l'arrivée du précédent : le re-tirage de 5 % par
  // case faisait de chaque trajet une marche au hasard. Jamais un but d'un autre îlot
  // du réseau (il n'y a pas de chemin pour y aller).
  // `goalKind` : la NATURE du but, lue par la fiche d'habitant (citizenFocus.js)
  // pour dire ce qu'il fait. Elle survit à l'arrivée : pendant la halte d'une
  // place ou d'un parvis, elle dit encore où il s'est arrêté.
  if (!p.goal) {
    const plazaCells = CM.plazaRoadCells;
    const wonderCells = CM.wonderGatherCells;
    p.gatherDir = null; // ne survit qu'au but « merveille » repiqué ci-dessous
    const set = (g, kind, social) => { p.goal = { gx: g.gx, gy: g.gy }; p.goalKind = kind; p.social = !!social; p._goalAt = CM.citT || 0; };
    // Pendant une émeute (lot 4), on ne se donne pas rendez-vous dans son quartier.
    const rc = CM._riotC;
    const calm = (c) => !rc || Math.abs(c.gx - rc.gx) + Math.abs(c.gy - rc.gy) >= 7;
    const pickIn = (list, ok) => {
      for (let i = 0; list && list.length && i < 12; i += 1) {
        const r = list[Math.floor(Math.random() * list.length)];
        if ((!ok || ok(r)) && calm(r) && sameIsland(p, r)) return r;
      }
      return null;
    };
    const kind = pickAgenda(dp, tr, Math.random(), CM.wonderPull || 0, CM._citEnv);
    if (kind === 'home' && reachable(p.home) && sameIsland(p, p.home)) set(p.home, 'home');
    else if (kind === 'home') {
      // Sans maison à portée (logis rasé, autre rive) : la porte la plus proche EN
      // MARCHANT, où il passera la nuit.
      const es = CM.buildingEdgeSet;
      const hit = es && es.size ? walkNearest(p.gx, p.gy, (k) => es.has(k), walkNeighbors, 60) : null;
      if (hit) set({ gx: Math.floor(hit.key / 10000), gy: hit.key % 10000 }, 'home');
    }
    else if (kind === 'work' && reachable(p.work) && sameIsland(p, p.work)) set(p.work, 'work');
    else if (kind === 'errand') {
      // Les courses : un AUTRE atelier, pas trop loin de là où l'on est.
      const near = (c) => Math.abs(c.gx - p.gx) + Math.abs(c.gy - p.gy) <= 16 && c !== p.work;
      const r = pickIn(CM.workRoadCells, near);
      if (r) set(r, 'errand');
    } else if (kind === 'plaza') {
      const r = pickIn(plazaCells);
      if (r) set(r, 'plaza', true);
    } else if (kind === 'wonder') {
      // Pèlerinage vers une MERVEILLE : filet continu de curieux qui devient une VAGUE
      // pendant les fenêtres d'attroupement (wonderPull, cf. updateCitizens).
      const r = pickIn(wonderCells);
      if (r) { set(r, 'wonder', true); p.gatherDir = r.face; }
    } else if (kind === 'cross') {
      const c = crossBankGoal(p.gx, p.gy);
      if (c && sameIsland(p, c)) set(c, 'cross');
    } else if (kind === 'night') {
      // Le couche-tard : une place, ou quelques rues plus loin.
      const r = Math.random() < 0.5 ? pickIn(plazaCells)
        : pickIn(CM.walkRoadList, (c) => Math.abs(c.gx - p.gx) + Math.abs(c.gy - p.gy) <= 14);
      if (r) set(r, 'night', false);
    }
    // Envie impossible (merveille posée sur un îlot, pas d'atelier près d'ici…) : la
    // place, puis le travail, avant la flânerie au hasard — sinon une vague
    // d'attroupement vers une merveille hors d'atteinte versait toute la ville en
    // errance.
    if (!p.goal && kind !== 'home') {
      const r = CM._rainOn ? null : pickIn(plazaCells);   // sous l'averse : au travail, pas sur la place
      if (r && !homeTime(dp)) set(r, 'plaza', true);
      else if (reachable(p.work) && sameIsland(p, p.work) && !homeTime(dp)) set(p.work, 'work');
    }
    if (!p.goal) {
      const r = pickIn(CM.walkRoadList) || CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
      set(r, 'wander');
    }
  }
  // Sécurité anti-piétinement : ne JAMAIS viser sa propre cellule (ex. domicile atteint la
  // nuit avec homeBias=1) — sinon le pas suivant tournerait en rond sur place. On repique
  // alors une cellule lointaine au hasard pour garantir un déplacement net et continu.
  if (p.goal && p.goal.gx === p.gx && p.goal.gy === p.gy) {
    const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
    p.goal = { gx: r.gx, gy: r.gy };
    p.social = false;
    p.goalKind = 'wander';
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
  // LE PAS (lot 2) : on suit SON CHEMIN (A*, citizenRoute.js), calculé une fois par
  // but et gardé tant que la ville ne change pas ; repli sur le pas glouton d'avant
  // s'il n'y a pas de chemin (ou plus : une case du chemin a disparu).
  const gk = cityMapWalkRoadKey(p.goal.gx, p.goal.gy);
  if (p._pathGoal !== gk || !p._path || p._pathI >= p._path.length) {
    p._path = walkPath(p.gx, p.gy, p.goal.gx, p.goal.gy, walkNeighbors, CM.layoutRecomputeAt);
    p._pathI = 0;
    p._pathGoal = gk;
  }
  let onPath = null;
  if (p._path && p._pathI < p._path.length) {
    const nk = p._path[p._pathI];
    onPath = opts.find((o) => cityMapWalkRoadKey(o.nx, o.ny) === nk) || null;
    if (onPath) p._pathI += 1;
    else p._path = null;
  }
  const forward = opts.filter((o) => o.i !== rev);
  const pool = onPath ? [onPath] : forward.length ? forward : opts;
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
  p._prevDir = p.dir;
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
  } else if (rank === "plaza") {
    // PLACE (docs/PLAN-COMPORTEMENTS.md, lot 1) : on passe par le POINT DE PASSAGE de la
    // case, hors du mobilier (CM.plazaWalkOffset, cf. plazaWalkAnchors) — au centre exact
    // de la case, on marchait dans les étals. Là où le centre est libre, chacun garde un
    // petit écart PERSONNEL : tous au même point, les badauds s'y superposaient.
    const off = CM.plazaWalkOffset && CM.plazaWalkOffset.get(cityMapWalkRoadKey(p.gx, p.gy));
    if (p.pedJ === undefined) p.pedJ = ((((p.phase || 0) * 389.71) % 1) - 0.5) * 2;
    const jy = (((((p.phase || 0) * 613.37) % 1) + 1) % 1 - 0.5) * 2;
    p.tox = (off ? off[0] : p.pedJ * 0.1) * CM.TILE;
    p.toy = (off ? off[1] : jy * 0.1) * CM.TILE;
  } else {
    // Rue simple : le TROTTOIR TENU (lot 2). Le côté dépendait du sens de marche — à
    // chaque virage le passant changeait de trottoir en travers de la chaussée. On garde
    // désormais son trottoir tout le long d'une rue ; au carrefour, on prend sur la rue
    // nouvelle le trottoir du côté d'où l'on vient (on traverse au passage, pas en biais
    // au milieu de la rue). `_side` : +1 = sud/est de l'axe, -1 = nord/ouest.
    const alongX = p.dir === 0 || p.dir === 1;
    const axis = alongX ? 1 : 2;
    if (p._sideAxis !== axis) {
      const pd = p._prevDir;
      if (p._side == null || pd == null || pd < 0) {
        p._side = ((((p.phase || 0) * 7.31) % 1) + 1) % 1 < 0.5 ? -1 : 1;
      } else if (alongX) p._side = pd === 2 ? -1 : pd === 3 ? 1 : p._side;
      else p._side = pd === 0 ? -1 : pd === 1 ? 1 : p._side;
      p._sideAxis = axis;
    }
    p.tox = alongX ? 0 : (p._side * pedEdge) || 0;   // || 0 : jamais -0 (trottoir nul)
    p.toy = alongX ? (p._side * pedEdge) || 0 : 0;
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

// ── LA VIE DANS LA RUE (docs/PLAN-VIVANT.md, lot D, 2026-10-02) ─────────────
// Fin des files indiennes : une partie des passants marche EN COMPAGNIE. Un
// compagnon ne cherche pas son chemin, il est ACCROCHÉ à son meneur : un pas de côté
// vers le milieu de la chaussée (le meneur tient le bord du trottoir) et un peu en
// retrait — à deux, à trois, un adulte et son enfant. Les groupes s'arrêtent parfois
// pour bavarder, face à face. Le compagnon suit en douceur (lissage), donc il
// décrit un arc aux carrefours au lieu de sauter d'un côté à l'autre.
// `p` = part des adultes qui s'accrochent, `pChild` = part des enfants ; `side` /
// `back` en tuiles ; `chatP` = chance de causette à chaque case atteinte.
// `catchK` = vitesse maximale du compagnon, en multiple de l'allure du meneur ;
// `radius` = distance maximale d'accrochage (1,5 case : il rejoint en marchant).
// Molette : __companions({ on, p, pChild, side, back, chatP, catchK, radius }).
const COMPANIONS = { on: true, p: 0.24, pChild: 0.6, radius: 1.5, side: 0.2, back: 0.12, chatP: 0.03, chatMin: 2.5, chatMax: 6, catchK: 1.6 };
if (typeof window !== 'undefined') window.__companions = (o) => { if (o) Object.assign(COMPANIONS, o); return { ...COMPANIONS }; };
let citTick = 0;   // compteur de passes : un meneur absent de la passe (liste refaite) est lâché
const dirToward = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3));
// Décision UNIQUE, au premier passage : s'accroche-t-il, et à qui ? Le meneur est le
// plus proche adulte libre (pas lui-même compagnon, moins de 2 compagnons) à moins de
// `radius` cases. Tirage déterministe sur la phase (stable d'une passe à l'autre).
function companionAssign(p) {
  p._grp = 0;
  if (!COMPANIONS.on || p.leaving) return;
  const r = ((((p.phase || 0) * 733.17) % 1) + 1) % 1;
  if (r >= (p.charType === 2 ? COMPANIONS.pChild : COMPANIONS.p)) return;
  let best = null, bd = COMPANIONS.radius * COMPANIONS.radius + 0.01;
  for (const q of CM.citizens) {
    if (q === p || q.lead || q._dead || q.leaving || q.charType === 2 || (q._nf || 0) >= 2 || q._grp > 0) continue;
    const dx = q.gx - p.gx, dy = q.gy - p.gy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = q; }
  }
  if (!best) return;
  best._grp = 0;                      // un meneur ne deviendra jamais compagnon (pas de chaîne)
  best._nf = (best._nf || 0) + 1;
  p.lead = best;
  p._grp = best._nf;                  // 1 = à côté, 2 = derrière, entre les deux
  if (p._grp === 1) best._f1 = p;
}
function companionDetach(p) {
  const L = p.lead;
  if (L) { L._nf = Math.max(0, (L._nf || 1) - 1); if (L._f1 === p) L._f1 = null; }
  p.lead = null;
  p.goal = null;
  p.tx = (p.gx + 0.5) * CM.TILE; p.ty = (p.gy + 0.5) * CM.TILE;
  p._grp = undefined;   // il pourra se raccrocher à un autre (companionAssign)
}
function companionFollow(p, L, dt) {
  p.gx = L.gx; p.gy = L.gy; p.tx = L.tx; p.ty = L.ty;
  p.social = false; p.goal = null;
  p.lox = L.lox; p.loy = L.loy; p.tox = L.tox; p.toy = L.toy;
  if (L.chatT > 0) {
    // Causette : on ne bouge plus, on se tourne vers son meneur.
    p.pauseT = L.pauseT;
    p.dir = dirToward(L.x - p.x, L.y - p.y);
    return;
  }
  p.pauseT = L.pauseT;
  const d = CM_DIRS[L.dir] || CM_DIRS[p.dir] || CM_DIRS[0];
  const T = CM.TILE;
  const side = p._grp === 1 ? COMPANIONS.side : COMPANIONS.side * 0.35;
  const back = p._grp === 1 ? COMPANIONS.back : COMPANIONS.back + 0.28;
  // Gauche du sens de marche (y vers le bas) = vers le milieu de la chaussée.
  const nx = L.x + (d[1] * side - d[0] * back) * T, ny = L.y + (-d[0] * side - d[1] * back) * T;
  const snap = !(L.fade >= 1) || p.x === undefined;   // meneur qui réapparaît : on le rejoint d'un coup
  const ox = p.x, oy = p.y;
  if (snap) {
    p.x = nx; p.y = ny;
    if (L.fade < 1) p.fade = Math.min(p.fade, L.fade);
    if (L.dir >= 0) p.dir = L.dir;
    return;
  }
  // ⚠ VITESSE BORNÉE (retour Raph, 2026-10-03 : « les habitants font des dashs ») :
  // le lissage seul (dt × 8) faisait couvrir en un tiers de seconde la place qui
  // change de côté quand le meneur tourne, ou les cases qui le séparaient de son
  // meneur à l'accrochage — mesuré jusqu'à 17 fois l'allure d'un passant, et 100 %
  // des « dashs » venaient de là. Le compagnon garde le lissage mais ne dépasse
  // jamais `catchK` fois l'allure du meneur ; quand il rattrape, il regarde où il va.
  const ex = nx - ox, ey = ny - oy, gap = Math.hypot(ex, ey);
  const runK = citizenSheltering(L) ? RUN_K : 1;   // le meneur court sous l'averse : on court avec lui
  const step = Math.min(gap * Math.min(1, dt * 8), pedWalkSpeed(L) * runK * COMPANIONS.catchK * dt);
  if (gap > 1e-6) { p.x = ox + ex / gap * step; p.y = oy + ey / gap * step; }
  p.walkDist = (p.walkDist || 0) + step;
  if (gap > T * 0.3) p.dir = dirToward(ex, ey);
  else if (L.dir >= 0) p.dir = L.dir;
}
// Allure de marche d'un passant à l'écran (px monde / s) : la même formule que le pas
// d'updateCitizens (vitesse propre × calme iso × allure piétonne).
function pedWalkSpeed(p) {
  const isoK = (typeof window !== 'undefined' && window.__isoWalkSpeed != null) ? window.__isoWalkSpeed : 0.72;
  return (p.speed || 24) * isoK * PED_SPEED.k;
}
function companionChat(p) {
  p.pauseT = COMPANIONS.chatMin + Math.random() * (COMPANIONS.chatMax - COMPANIONS.chatMin);
  p.chatT = p.pauseT;
  const f = p._f1;
  if (f && f.lead === p) p.dir = dirToward(f.x - p.x, f.y - p.y);
}

// SALUER UNE CONNAISSANCE (lot 2) : deux passants qui se CROISENT (pas qui se suivent)
// à portée de main s'arrêtent parfois pour causer, face à face, puis reprennent leur
// route. Un seul tirage par rencontre (30 %), et pas deux causettes à moins d'une
// minute d'intervalle. Rangés par case de leur position DESSINÉE (pas par la case
// qu'ils visent : deux passants qui se croisent échangent leurs cases visées pile au
// moment de se croiser), et comparés aux 8 cases voisines : coût linéaire.
function citizenGreetings() {
  const T = CM.TILE, t = CM.citT || 0;
  const cells = new Map(), who = [];
  for (const p of CM.citizens) {
    if (p._nightHidden || p.lead || p.leaving || p.social || p._enter || p._vanish !== undefined) continue;
    if ((p.pauseT || 0) > 0 || t < (p._greetAt || 0)) continue;
    const px = p.x + (p.lox || 0), py = p.y + (p.loy || 0);
    const k = Math.floor(px / T) * 10000 + Math.floor(py / T);
    p._gk = k; p._gx = px; p._gy = py;
    const l = cells.get(k);
    if (l) l.push(p); else cells.set(k, [p]);
    who.push(p);
  }
  for (const a of who) {
    if (t < (a._greetAt || 0)) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const l = cells.get(a._gk + dx * 10000 + dy);
        if (!l) continue;
        for (const b of l) {
          if (b === a || t < (b._greetAt || 0) || a.dir === b.dir) continue;
          if (Math.hypot(a._gx - b._gx, a._gy - b._gy) > T * 0.55) continue;
          a._greetAt = b._greetAt = t + 25;
          if (Math.random() >= 0.3) continue;
          const d = 3 + Math.random() * 3.5;
          a.pauseT = b.pauseT = d;
          a.chatT = b.chatT = d;
          a.dir = dirToward(b._gx - a._gx, b._gy - a._gy);
          b.dir = dirToward(a._gx - b._gx, a._gy - b._gy);
          a._chatWith = b; b._chatWith = a;
          a._chat0 = b._chat0 = d;                  // l'instant du salut (citizenPose)
          a._greetAt = b._greetAt = t + 60;
        }
      }
    }
  }
}

const RAIN_RETHINK = new Set(['plaza', 'wonder', 'wander', 'cross', 'night']);
const DUSK_RETHINK = new Set(['plaza', 'wonder', 'wander', 'cross', 'errand', 'work']);
// L'évitement (lot 6), en cases : on regarde `reach` devant soi (et `back` derrière,
// le temps de dépasser), dans un couloir de ± `half`, et l'on s'écarte de `step`.
// Molette : __avoid({ on, reach, half, step, back }).
export const AVOID = { on: true, reach: 0.6, half: 0.24, step: 0.22, back: 0.3 };
if (typeof window !== 'undefined') window.__avoid = (o) => { if (o) Object.assign(AVOID, o); return { ...AVOID }; };
// LA POSE d'un passant (§8 de PLAN-COMPORTEMENTS) : deux passants qui se croisent et
// s'arrêtent causer commencent par se SALUER (la première seconde de la causette).
function citizenPose(p) {
  if (!(p.chatT > 0) || !p._chat0 || !p._chatWith) return null;
  const t = p._chat0 - p.chatT;
  return t >= 0 && t < 1.3 ? { kind: 'wave', u: t / 1.3 } : null;
}
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
    // ⚠ TIRÉE PARMI CEUX QU'ON VOIT (docs/PLAN-COMPORTEMENTS.md, lot 1 ; diagnostic de
    // REPRISE-bulles-habitants.md, resté sans suite). Le porteur était tiré parmi TOUS
    // les habitants — jusqu'à ~900, la caméra en montre une fraction — donc presque
    // toujours hors champ, ou endormi derrière une porte : « il n'y a plus de bulles ».
    // Désormais : un passant à l'écran, éveillé, ni en partance ni en fondu, et pas au
    // dézoom (LOD : personne n'y est dessiné). Une bulle toutes les 30 à 70 s au lieu
    // de 90 à 180, puisqu'on la voit maintenant à chaque fois. Personne à l'écran :
    // on réessaie dans 5 s.
    CM.globalBubbleCooldown = 5;
    if (!hasActiveThought && CM.citizens.length > 0 && !CM.lodActive) {
      const seen = [];
      for (const c of CM.citizens) {
        if ((c.thoughtType && c.thoughtTimer > 0) || c.leaving || c._vanish !== undefined || c._nightHidden) continue;
        if (c.fade != null && c.fade < 1) continue;
        const sp = projWorldToScreen(c.x + (c.lox || 0), c.y + (c.loy || 0));
        if (sp.x < 40 || sp.y < 60 || sp.x > (CM.cw || 0) - 40 || sp.y > (CM.ch || 0) - 20) continue;
        seen.push(c);
      }
      if (seen.length > 0) {
        const p = seen[Math.floor(Math.random() * seen.length)];
        const types = ["thought", "scroll", "lightning"];
        p.thoughtType = types[Math.floor(Math.random() * types.length)];
        p.thoughtTimer = 18;
        CM.globalBubbleCooldown = 30 + Math.random() * 40;
      }
    }
  }

  let anyDead = false;   // un partant a fini son fondu → compaction en fin de boucle
  citTick += 1;
  // Horloge des passants (secondes de jeu, lot 2) : les attentes à l'intérieur et les
  // rencontres s'y mesurent ; et l'heure du jour, pour l'emploi du temps.
  CM.citT = (CM.citT || 0) + dt;
  const dpNow = dayPhase(CM.dayP, CM.nightF);
  // LA VILLE RÉAGIT (lot 4) : la pluie et la saison de la frame (agenda, allure, abri).
  const env = CM._citEnv || (CM._citEnv = { rain: 0, season: 0 });
  env.rain = CM.rainF || 0; env.season = CM.season | 0;
  // L'instant où l'averse devient franche : les buts de loisir choisis AVANT sont revus.
  if (env.rain > 0.3 && !CM._rainOn) { CM._rainOn = true; CM._rainAt = CM.citT; }
  else if (env.rain < 0.15) CM._rainOn = false;
  // Le soir qui tombe : l'instant où commence l'heure de rentrer (cf. DUSK_RETHINK).
  const dusk = homeTime(dpNow);
  if (dusk && !CM._duskOn) { CM._duskOn = true; CM._duskAt = CM.citT; }
  else if (!dusk) CM._duskOn = false;
  // L'ÉMEUTE en cours (CM.riotDraw, posé par updateCrisis) : son centre, et un numéro
  // par émeute — chacun ne décide qu'une fois par émeute s'il fuit ou s'il regarde.
  const rd = CM.riotDraw;
  if (rd && rd.pts && rd.pts.length) {
    if (!CM._riotC) CM.riotEpoch = (CM.riotEpoch || 0) + 1;
    CM._riotC = { gx: rd.cx / CM.TILE - 0.5, gy: rd.cy / CM.TILE - 0.5 };
  } else CM._riotC = null;
  for (const p of CM.citizens) {
    p._tick = citTick;
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
    // ÉMEUTIER (lot 4) : le temps de l'émeute, il EST l'émeutier qui marche à sa place
    // (quaysAndRiot.js) — ni dessiné ni simulé ici ; il reprend sa vie où l'émeutier
    // s'arrête.
    if (p._riot) { p._nightHidden = true; continue; }

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
    else if (p.fade < 1) p.fade = Math.min(1, p.fade + dt * 2); // apparition en ~0,5 s, devant sa porte (dessinée depuis le lot 1 de PLAN-COMPORTEMENTS)

    // ── Fondu de DISPARITION : jamais au milieu de la rue ─────────────────────
    // Deux causes d'effacement — le tiers « dormeur » quand la nuit s'installe, et
    // le DÉPART (p.leaving) quand la ville dépasse sa cible de foule. Dans les deux
    // cas le fondu ne S'AMORCE que sur un SEUIL (cellule bordant un bâtiment) : on
    // rentre par une porte, on ne s'évapore pas sur la chaussée (Raph 2026-07-29).
    // Une fois amorcé il est piloté par dt et non par nightF : amorcé tard dans la
    // nuit, le vieux fondu en nightF durait zéro seconde et faisait POP l'habitant —
    // exactement ce qu'il était censé éviter.
    // NAÎTRE LA NUIT (lot 2) : un passant qui apparaît à l'heure où l'on est rentré chez
    // soi y est DÉJÀ — il sortira à l'aube (les couche-tard, eux, sortent).
    if (p._born === undefined) {
      p._born = true;
      const tr0 = p._tr || (p._tr = citizenTraits(p));
      // Seulement un passant qui VIENT d'apparaître (fondu à 0) sur un seuil : celui qui
      // était déjà dans la rue (rechargement du module) ne disparaît pas sur place.
      if (homeTime(dpNow) && !tr0.owl && !p.lead && !p.leaving && p.fade === 0 && citizenAtDoorstep(p)) {
        p._enter = { dawn: true }; p._vanish = 0;
      }
    }
    // COMPAGNON : il vit au rythme de son meneur (docs/PLAN-COMPORTEMENTS.md, lot 1).
    // Il était LÂCHÉ dès que le meneur partait ou se couchait : il rentrait seul par
    // une autre porte, dormait seul, et à l'aube rattrapait son meneur EN LIGNE DROITE
    // à travers les maisons. Désormais il rentre AVEC lui (même porte, même fondu), il
    // s'endort et ressort avec lui ; le meneur rentré pour de bon, il est rentré aussi.
    const L0 = p.lead;
    const leadOk = !!L0 && !L0._dead && COMPANIONS.on && L0._tick >= citTick - 1;
    if (L0 && L0._dead && p.leaving) { p._nightHidden = true; p._dead = true; anyDead = true; continue; }
    if (leadOk && L0.leaving && !p.leaving) p.leaving = true;
    if (leadOk && !(p.leaving && !L0.leaving)) {
      p._vanish = L0._vanish;
    } else {
      // DÉLAI DE GRÂCE du partant : un seuil derrière le fleuve ou au fond d'une
      // impasse le gardait dehors pour toujours (aucun re-tirage pour qui part).
      // 40 s : on vise la porte la plus PROCHE ; 80 s : il entre où il est.
      if (p.leaving && p._vanish === undefined) {
        p.leaveT = (p.leaveT || 0) + dt;
        if (p.leaveT > 40 && !p._leaveRetry) { p._leaveRetry = true; p.leaveCell = nearestDoorstep(p); p.goal = null; }
        if (p.leaveT > 80) p._vanish = 1;
      }
      // On s'efface sur un seuil pour ENTRER (`_enter` : travail, courses, maison —
      // lot 2) ou pour PARTIR (la foule baisse). Le « tiers dormeur » qui s'effaçait
      // devant n'importe quelle porte à la nuit tombée n'existe plus : le soir, chacun
      // rentre CHEZ SOI (emploi du temps, citizenDay.js).
      if ((p._enter || p.leaving) && p._vanish === undefined && citizenAtShelter(p)) p._vanish = 1;
      if (p._vanish !== undefined) {
        // À l'intérieur : on ressort quand on a fini (travail, courses, passage chez
        // soi) ou, rentré pour la nuit, quand l'aube est venue POUR SOI (les sorties
        // s'étalent sur l'aube).
        if (p._enter && p._vanish <= 0) {
          const done = p._enter.dawn ? dawnFor(dpNow, (p._tr || (p._tr = citizenTraits(p))).stagger)
            : (CM.citT || 0) >= p._enter.until;
          if (done) p._enter = null;
        }
        const back = !p._enter && !p.leaving;   // il ressort par sa porte
        p._vanish = back ? Math.min(1, p._vanish + dt * 2.2) : Math.max(0, p._vanish - dt * 2.2);
        if (back && p._vanish >= 1) p._vanish = undefined;
      }
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
    // Il ENTRE (ou part) : immobile devant la porte le temps du fondu — sans quoi le
    // pas suivant le relançait dans la rue en train de s'effacer (lot 2).
    if (p._vanish !== undefined && (p._enter || p.leaving)) continue;

    // Compagnon (lot D) : accroché à son meneur, il ne cherche pas son chemin.
    if (p._grp === undefined) companionAssign(p);
    if (p.lead) {
      const L = p.lead;
      // Lâché seulement si le meneur n'est plus là, ou si LUI part sans son meneur
      // (la foule baisse et c'est lui qu'elle renvoie) ; un meneur qui rentre ou qui
      // s'endort, on le suit (cf. plus haut).
      if (L._dead || !COMPANIONS.on || !(L._tick >= citTick - 1) || (p.leaving && !L.leaving)) companionDetach(p);
      else { companionFollow(p, L, dt); continue; }
    }

    // L'AVERSE QUI COMMENCE (lot 4) : qui était parti flâner (place, merveille,
    // balade, autre rive) AVANT la pluie revoit son programme — trois sur quatre
    // rebroussent chemin vers un but de temps de pluie (citizenChooseNext tire avec la
    // météo). Sans cela la place restait pleine de ceux partis au sec, et les trajets
    // vers les places sont les plus longs de la ville.
    if (CM._rainOn && !p.lead && !p.leaving && !p._enter && !p._shelter && (p._goalAt || 0) < CM._rainAt
      && RAIN_RETHINK.has(p.goalKind)) {
      p._goalAt = CM.citT;
      if (Math.random() < 0.75) {
        p.goal = null; p._path = null;
        if (p.pauseT > 0 && !p.chatT) p.pauseT = 0;      // la halte de place s'écourte
      }
    }
    // LE SOIR TOMBE (passe d'analyse du 2026-10-04, PLAN-COMPORTEMENTS §7) : les buts
    // de la journée survivaient à la nuit jusqu'à l'arrivée — 36 s après la tombée de la
    // nuit, 372 passants sur 943 marchaient encore vers une place et 40 traversaient le
    // fleuve. Chacun revoit son programme à SON heure (les départs s'étalent sur ~45 s,
    // comme les sorties de l'aube) : le pickAgenda du soir le renvoie chez lui ; un
    // couche-tard sur deux garde sa sortie.
    if (CM._duskOn && !p.lead && !p.leaving && !p._enter && (p._goalAt || 0) < CM._duskAt && DUSK_RETHINK.has(p.goalKind)) {
      const trD = p._tr || (p._tr = citizenTraits(p));
      if ((CM.citT || 0) - CM._duskAt >= trD.stagger * 45) {
        p._goalAt = CM.citT;
        if (!trD.owl || Math.random() < 0.5) {
          p.goal = null; p._path = null;
          if (p.pauseT > 0 && !p.chatT) p.pauseT = 0;
        }
      }
    }
    // FACE À L'ÉMEUTE (lot 4) : à moins de 6 cases de la foule, on décide UNE fois —
    // un peu plus d'un sur deux s'éloigne d'un bon pas, un sur quatre s'arrête à
    // distance pour regarder, les autres passent leur chemin.
    const rc = CM._riotC;
    if (rc && p._riotSeen !== CM.riotEpoch && !p.leaving && !p._enter && !p._shelter) {
      const dR = Math.hypot(p.gx - rc.gx, p.gy - rc.gy);
      if (dR < 6) {
        p._riotSeen = CM.riotEpoch;
        const roll = Math.random();
        if (roll < 0.55) {
          let goal = null;
          if (p.home && Math.hypot(p.home.gx - rc.gx, p.home.gy - rc.gy) > dR + 2 && CM.walkRoadSet.has(cityMapWalkRoadKey(p.home.gx, p.home.gy))) goal = p.home;
          for (let i = 0; !goal && i < 16; i += 1) {
            const c = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
            if (Math.hypot(c.gx - rc.gx, c.gy - rc.gy) >= 9 && sameIsland(p, c)) goal = c;
          }
          if (goal) {
            p.goal = { gx: goal.gx, gy: goal.gy }; p.goalKind = 'flee'; p.social = false;
            p._path = null; p.pauseT = 0; p.chatT = 0; p._browse = false;
          }
        } else if (roll < 0.8 && dR >= 2.5) {
          p.pauseT = 4 + Math.random() * 5;
          p._watch = true;
          p.dir = dirToward(rc.gx - p.gx, rc.gy - p.gy);
        }
      }
    }

    let moved = 0;   // distance parcourue CE tick (pilote le lissage du trottoir)
    // Qui court s'abriter ne flâne plus : l'averse coupe court à la halte des badauds
    // (place, parvis de merveille) au lieu de les laisser contempler sous la pluie.
    const abri = citizenSheltering(p);
    // L'averse passée, on quitte l'abri (lot 4).
    if (p._shelter && (CM.rainF || 0) < 0.12) { p._shelter = false; p.pauseT = 0; }
    if (p.pauseT > 0 && !abri) {
      p.pauseT -= dt;
      if (p.chatT > 0) p.chatT = Math.max(0, p.chatT - dt);
      p._ramp = 0;
    } else {
      p.chatT = 0;
      p._browse = false;
      p._chatWith = null;
      p._watch = false;
      p._shelter = false;
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < 2.4) {
        // Un meneur accompagné s'arrête parfois pour bavarder (jamais en partance,
        // jamais en flânerie de place — elle a déjà sa halte).
        if ((p._nf || 0) > 0 && !p.social && !p.leaving && !abri && Math.random() < COMPANIONS.chatP) companionChat(p);
        else citizenChooseNext(p);
      } else {
        // Iso : la projection étale l'écran (losange 2:1) → la même vitesse MONDE
        // paraît plus rapide. Facteur de calme dédié (retour Raph « ils glissent »),
        // molette window.__isoWalkSpeed (défaut 0.72). Sans effet en legacy.
        const isoK = (typeof window !== 'undefined' && window.__isoWalkSpeed != null) ? window.__isoWalkSpeed : 0.72;
        // Course sous l'averse : l'animation étant cadencée par la DISTANCE parcourue
        // (walkDist ci-dessous), les jambes accélèrent d'elles-mêmes, sans bande dédiée.
        // ALLURE (lot 2) : un pas qui dépend du passant et du moment (citizenDay.js —
        // le pas lent, rentrer d'un bon pas le soir…), et un DÉMARRAGE progressif après
        // un arrêt (une demi-seconde) au lieu de repartir d'un bond à pleine vitesse.
        p._ramp = Math.min(1, (p._ramp == null ? 1 : p._ramp) + dt / 0.5);
        const pace = paceFor(p, p._tr || (p._tr = citizenTraits(p)), dpNow, p.goalKind, env) * (0.35 + 0.65 * p._ramp);
        const sp = p.speed * dt * isoK * PED_SPEED.k * (abri ? RUN_K : pace);
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
    // ON S'ÉVITE (docs/PLAN-COMPORTEMENTS.md, lot 6) : quelqu'un juste devant — passant,
    // flâneur de place, promeneur du quai, porteur, voyageur du bac… (le registre de la
    // frame d'avant, figures.js) — et l'on fait un pas de côté, du côté libre, le temps
    // de le croiser ; puis on reprend son bord. Ils se traversaient. Le compagnon suit
    // son meneur, il ne décide pas.
    if (moved > 0 && !p.lead && AVOID.on) {
      const hx = p.tx - p.x, hy = p.ty - p.y, hl = Math.hypot(hx, hy);
      if (hl > 0.01) {
        const side = figAhead(p.x + (p.lox || 0), p.y + (p.loy || 0), hx / hl, hy / hl, CM.TILE * AVOID.reach, CM.TILE * AVOID.half, CM.TILE * AVOID.back);
        const want = side ? -side * CM.TILE * AVOID.step : 0;
        p._dodge = (p._dodge || 0) + (want - (p._dodge || 0)) * Math.min(1, dt * 5);
        p._dhx = -hy / hl; p._dhy = hx / hl;          // la droite du cap
      }
    } else if (p._dodge) p._dodge *= Math.max(0, 1 - dt * 3);
    const dgx = (p._dodge || 0) * (p._dhx || 0), dgy = (p._dodge || 0) * (p._dhy || 0);
    const tox = (p.tox || 0) + dgx, toy = (p.toy || 0) + dgy;
    if (p.lox === undefined) { p.lox = tox; p.loy = toy; }
    else if (moved > 0) {
      const Lt = CM.TILE * ((typeof window !== 'undefined' && window.__pedTurn != null) ? window.__pedTurn : 0.9);
      const k = moved < Lt ? moved / Lt : 1;
      p.lox += (tox - p.lox) * k;
      p.loy += (toy - p.loy) * k;
    }
    // Le pas de côté est vif (le lissage du bord, lui, s'étale sur ~1 case de marche).
    p.lox += dgx - (p._dgx || 0); p.loy += dgy - (p._dgy || 0);
    p._dgx = dgx; p._dgy = dgy;
  }
  citizenGreetings();
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
  // Rendu ET hit-test du clic lisent cette ancre (source unique).
  const sp = projWorldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0));
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0;
  const spec = agentSpecFor(agentSetForBand(band), p.charType || 0, p.skinVariant || 0) || AGENT_FALLBACK;
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
  // PONT : rien de particulier depuis la refonte du 2026-10-01 — le tablier a la
  // largeur de la route, chaque véhicule y garde sa voie (plus de rangement sur
  // une bande étroite, donc plus de « glissé » à l'entrée).
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
    // `crossing` : la fiche du véhicule dit qu'il passe sur l'autre rive.
    v.crossing = !!(cross && vehicleRoadRank(cross.gx, cross.gy) !== "plaza");
    if (v.crossing) {
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

// ── DISTANCE ENTRE VÉHICULES (retour Raph, 2026-10-03 : un aurige dessiné par-dessus
// une charrette d'amphores) ─────────────────────────────────────────────────────────
// Avant, chaque véhicule roulait sans voir les autres : deux attelages d'une même file
// se chevauchaient (~2 paires à tout instant en ère 4). Règle de suivi : un véhicule
// RALENTIT quand l'écart net (entre carrosseries) avec celui qui le précède dans sa
// file passe sous `free`, et S'ARRÊTE sous `stop`. Au carrefour, il cède à celui qui
// est DÉJÀ dans son chemin (en travers). En face (autre file) : ignoré.
// Patience : bloqué plus de `patience` s, il passe quand même `push` s — pas de nœud
// à quatre au carrefour, pas de file figée derrière un véhicule sans issue.
// Tout est en TUILES ; molette __vehGap({ on, stop, free, patience, push }).
const VEH_GAP = { on: true, stop: 0.1, free: 0.5, patience: 3, push: 1.5, look: 2.5 };
if (typeof window !== 'undefined') window.__vehGap = (o) => Object.assign(VEH_GAP, o || {});
// Longueur au sol (tuiles) d'un véhicule : son encre couvre ~65 % de la boîte dessinée
// (T·size·VEH_SCALE), boîte où il est vu en biais (longueur + largeur).
function vehGroundLen(v) {
  const e = v.skin ? eraVehSpec(v.type, v.skin) : null;
  return 0.65 * (e ? e.size : (VEH_SIZES[v.type] || 0)) * VEH_SCALE;
}
// Ce qu'un véhicule offre au suivi : position RENDUE (file comprise), cap, longueur.
// Le porteur de panier (un piéton) et le drone (en l'air) n'en font pas partie.
function vehGapSnap(v, T) {
  if (v.type === 'basket' || v.type === 'drone' || (v.parkT || 0) > 0) return null;
  let hx = v.tx - v.x, hy = v.ty - v.y;
  const hd = Math.hypot(hx, hy);
  if (hd > 0.5) { hx /= hd; hy /= hd; } else { hx = CM_DIRS[v.dir]?.[0] ?? 1; hy = CM_DIRS[v.dir]?.[1] ?? 0; }
  return { x: v.x / T + (v._lox || 0), y: v.y / T + (v._loy || 0), hx, hy, L: vehGroundLen(v) };
}
// Écart net (tuiles) de `a` à l'obstacle `b` s'il est sur le chemin de `a`, sinon
// Infinity. `ib < ia` départage deux véhicules au même point (apparition groupée).
function vehObstacleGap(a, b, ia, ib) {
  const rx = b.x - a.x, ry = b.y - a.y;
  const along = rx * a.hx + ry * a.hy;
  if (along > VEH_GAP.look || along < -0.01 || (along <= 0.01 && ib > ia)) return Infinity;
  const lat = Math.abs(rx * a.hy - ry * a.hx);
  const c = a.hx * b.hx + a.hy * b.hy;
  if (c < -0.7) return Infinity;                          // en face : l'autre file
  if (c > 0.7) {                                          // même sens : même file ?
    if (lat > 0.12) return Infinity;
    return along - (a.L + b.L) / 2;
  }
  // En travers : son corps (sa longueur) barre-t-il ma voie (ma largeur ~0,4·L) ?
  if (lat > 0.2 * a.L + 0.5 * b.L + 0.05) return Infinity;
  return along - (a.L / 2 + 0.2 * b.L);
}
// Facteur d'allure (0 → arrêt, 1 → libre) de chaque véhicule, d'après les instantanés.
// Deux véhicules EN TRAVERS qui se barrent mutuellement : le premier de la liste passe.
function vehicleGapFactors(snaps) {
  const n = snaps.length, k = new Array(n).fill(1);
  if (!VEH_GAP.on) return k;
  const span = VEH_GAP.free - VEH_GAP.stop;
  for (let i = 0; i < n; i += 1) {
    const a = snaps[i];
    if (!a) continue;
    let gap = Infinity;
    for (let j = 0; j < n; j += 1) {
      const b = snaps[j];
      if (j === i || !b || Math.abs(b.x - a.x) > VEH_GAP.look || Math.abs(b.y - a.y) > VEH_GAP.look) continue;
      const g = vehObstacleGap(a, b, i, j);
      if (g >= gap) continue;
      const cross = Math.abs(a.hx * b.hx + a.hy * b.hy) <= 0.7;
      if (cross && j > i && vehObstacleGap(b, a, j, i) < VEH_GAP.free) continue;   // priorité au premier
      gap = g;
    }
    if (gap < VEH_GAP.free) k[i] = gap <= VEH_GAP.stop ? 0 : (gap - VEH_GAP.stop) / span;
  }
  return k;
}

function updateVehicles(dt) {
  for (const v of CM.vehicles) {
    // Tenue de ligne : l'offset de file est LISSÉ (unités tuile) vers sa cible —
    // sans lissage, un changement de cap téléportait la carrosserie d'une file à
    // l'autre. Même recette que le lox/loy des piétons, constante un peu plus douce.
    const lt = vehicleLaneTarget(v);
    if (v._lox === undefined) { v._lox = lt.x; v._loy = lt.y; }
    else { const kL = dt * 4 < 1 ? dt * 4 : 1; v._lox += (lt.x - v._lox) * kL; v._loy += (lt.y - v._loy) * kL; }
  }
  const T = CM.TILE;
  const gapK = vehicleGapFactors(CM.vehicles.map((v) => vehGapSnap(v, T)));
  for (let i = 0; i < CM.vehicles.length; i += 1) {
    const v = CM.vehicles[i];
    // Patience (cf. VEH_GAP) : un véhicule bloqué trop longtemps force le passage.
    let gk = gapK[i];
    if ((v._pushT || 0) > 0) { v._pushT -= dt; gk = 1; }
    else if (gk < 0.05) { v._waitT = (v._waitT || 0) + dt; if (v._waitT > VEH_GAP.patience) { v._pushT = VEH_GAP.push; v._waitT = 0; } }
    else v._waitT = 0;
    // Plus de pause ni de stationnement : les véhicules avancent en continu.
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 2.4) {
      vehicleChooseNext(v);
    } else if (gk > 0) {
      // Le porteur de panier est un « véhicule » côté moteur mais un PIÉTON à l'écran :
      // il suit le ralentissement des habitants, pas l'allure des attelages.
      const sp = v.speed * dt * gk * (v.type === 'basket' ? PED_SPEED.k : 1);
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
export { agentSetForBand, agentSpecFor, agentFrameIso, chooseRoadVehicleType, getVehicleDensity, updateVehicles, vehicleGapFactors, VEH_GAP, updateCitizens, CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, drawCitizenThoughts, vehicleLaneOffset, drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso, drawVehicleHeadlights, thoughtBubbleAnchor, riotEraKey, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH, ensureBoat, boatReady, BOAT_SIZES, BOAT_LIFT, ensureDrone, drawDroneRotors, ensureVehDiag, vehDiagReady, vehSkinFor, eraVehSpec, ISO_DIAG, ISO_AGENT_NAMES, BASKET_CARRIERS, agentDir, AGENT_SCALE, VEH_SCALE,
  citizenSpawnCell, citizenAtDoorstep, citizenWorkNear, IDLE_NAMES, IDLE_ONE, POSE_NAMES, POSE_NONE, CARDINAL_NAMES, agentIdleFrameIso, agentPoseFrameIso, citizenPose, citizenScreenBox, citizenPortraitFrame, namedPortraitFrame, imgInkBox, citizenSheltering };
// AGENT_SCALE / VEH_SCALE sont exportés en LIAISON VIVE (ESM) : le rendu iso les relit
// à chaque frame, donc __villagerScale / __vehScale agissent aussi sur la vue iso.
