// LA FLOTTE FLUVIALE, CÔTÉ RENDU — extrait d'isoRenderer.js le 2026-08-23 (Q10).
//
// `riverFleet.js` décide QUI navigue et où ; ce module dit à quoi ça ressemble :
// la pose du sprite de coque, le stade de commerce par ère, les FEUX DE NAVIGATION
// (bâbord rouge / tribord vert, ancrés par face et par stade), la passe de nuit, et
// l'évitement des obstacles plantés dans l'eau.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Le bloc est déplacé tel quel : même
// code, même ordre, mêmes constantes. La couture a été MESURÉE avant la coupe :
// zéro dépendance vers le reste d'isoRenderer (c'est ce qui rend ce module
// extractible sans import circulaire), huit symboles rendus, deux imports externes.
// Vérifié par empreinte de canvas au pixel près, avant/après, sur 8 frames
// déterministes (3 ères × jour/nuit/crépuscule/ruine).
import { CM } from '../layout.js';
import { configureNavCalib } from './navCalib.js';

// Cap écran (rad, 0 = est, +π/2 = sud/bas) → nom de rotation d'objet PixelLab.
const BOAT_SECTORS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
export function boatSector(angle) {
  const k = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return BOAT_SECTORS[k];
}
// Stades couverts par l'art iso (cosmique : repli legacy/procédural conservé).
export const BOAT_ISO = { raft: 1, sail: 1, steam: 1, container: 1 };

// ── Pose du sprite de coque, SOURCE UNIQUE ──────────────────────────────────
// Le sprite est dessiné 1,15× plus large que l'unité qui sert aux feux de
// position, et son bord haut est à 0,58 de largeur au-dessus du centre de coque.
// Ces deux nombres sont exportés parce que le calibrage (navCalib.js) doit
// convertir un clic SUR LE SPRITE en (mast, beam) : s'ils divergeaient, l'outil
// mesurerait une chose et le rendu en dessinerait une autre.
export const BOAT_IMG_K = 1.15;
export const BOAT_IMG_TOP = 0.58;

// ── Les trois MÉTIERS du fleuve (cf. riverFleet.js) ─────────────────────────
// Le marchand traverse l'Histoire avec le port (radeau → voilier → vapeur →
// porte-conteneurs → vaisseau) ; le plaisancier a ses trois âges à lui ; le
// pêcheur garde sa barque en bois du début à la fin (arbitrage Raph : c'est
// justement ce qui le rend intemporel au milieu d'une ville qui mute).
//
// ⚠ Le seuil du VAPEUR est ei >= 25, pas 20. L'iso avait gardé l'ancienne
// valeur alors que le legacy l'avait corrigée en documentant pourquoi : à 20, un
// vapeur croisait dès la bande Marbre devant des habitants en toge.
export function tradeStage(band, ei) {
  return band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 25 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
}
// ÉCRÊTAGE DE LA FLOTTE (chantier ÉCHELLE, Lot A — docs/PLAN-ECHELLE.md §A1).
// Historique : container 3.2, cosmique 4.0/4.8/5.6 — le vaisseau bande 9 faisait
// 4,5 tuiles, ~70 % de la masse du plus haut bâtiment : c'est lui qui « rapetissait »
// la ville. Et à 0.7×5.6 = 3,9 tuiles de coque, il ne TENAIT plus dans la passe
// navigable du pont (3,4 tuiles, cf. bridgeTune.passHalf). Table ÉCRÊTÉE mais
// MONOTONE : un cargo ne doit jamais rétrécir en montant d'ère (steam 2.4 →
// container 2.6 → cosmique 2.8/3.0/3.2). Le plus gros fait 0.7×3.2 = 2,24 tuiles
// de coque — pile le gabarit pour lequel la passe a été cotée.
// Le pêcheur ne passe pas par cette table : sa gonflette (sizeMul 1.3, cf.
// shipVisual) est le cas « petite silhouette illisible », pas celui qui écrase
// la ville — et le plaisancier a quitté le fleuve (retrait 2026-07-30).
// Molette live : window.__fleetScale (objet muté, la flotte n'est pas bakée).
const FLEET_SCALE = { raft: 1.36, sail: 1.8, steam: 2.4, container: 2.6, cosmic7: 2.8, cosmic8: 3.0, cosmic9: 3.2 };
if (typeof window !== 'undefined') window.__fleetScale = FLEET_SCALE;
export function tradeSizeMul(stage, band) {
  return stage === 'cosmic' ? (band >= 9 ? FLEET_SCALE.cosmic9 : band >= 8 ? FLEET_SCALE.cosmic8 : FLEET_SCALE.cosmic7)
    : FLEET_SCALE[stage] || FLEET_SCALE.raft;
}
// 🚫 LE PLAISANCIER A ÉTÉ RETIRÉ (Raph, 2026-07-30) — ses trois âges (rames,
// voilier, vedette), sa dérive d'une berge à l'autre et son art calibré face par
// face. Le fleuve est plus lisible sans lui : il raconte le TRAVAIL, le port qui
// charge et l'homme qui pêche, et un promeneur y ajoutait du mouvement sans y
// ajouter de sens. Ne pas le reproposer.
// Les sprites (boat-rowboat / dinghy / motorboat) et leur relevé de feux restent
// sur le disque et dans le roster : la génération est payée, le retour arrière ne
// coûterait qu'un budget à rouvrir dans riverFleet.

// Coque de REPLI pour un métier dont l'art n'est pas encore là : une barque en
// bois vue de trois quarts, plus l'attribut qui identifie le métier (canne
// pliée pour le pêcheur, voile pour le plaisancier). Volontairement grossier —
// c'est un échafaudage de réglage, pas une proposition graphique.
export function drawIsoBoatStub(ctx, p, s, sizeMul, heading, bob, sh) {
  const fisher = sh.kind === 'fisher';
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(heading);
  ctx.scale(sizeMul, sizeMul);
  ctx.fillStyle = '#6b4a2c';                       // coque
  ctx.beginPath();
  ctx.moveTo(s * 0.26, 0);
  ctx.lineTo(s * 0.02, -s * 0.09);
  ctx.lineTo(-s * 0.24, -s * 0.05);
  ctx.lineTo(-s * 0.24, s * 0.05);
  ctx.lineTo(s * 0.02, s * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8d6740';                       // plat-bord
  ctx.fillRect(-s * 0.2, -s * 0.02, s * 0.4, Math.max(1, s * 0.02));
  if (fisher) {
    ctx.strokeStyle = '#c8b48a';                   // canne tendue vers l'arrière
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, -s * 0.02);
    ctx.lineTo(-s * 0.3, -s * 0.16);
    ctx.stroke();
    ctx.fillStyle = '#9c8f7a';                     // le pêcheur, allongé
    ctx.fillRect(-s * 0.1, -s * 0.05, s * 0.2, Math.max(1, s * 0.05));
  } else {
    ctx.fillStyle = '#e6e2d6';                     // voile
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.06);
    ctx.lineTo(0, -s * 0.32);
    ctx.lineTo(s * 0.16, -s * 0.07);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── FEUX DE NAVIGATION ──────────────────────────────────────────────────────
// Aucun bateau ne lisait `nightF` : la nuit tombée, le fleuve devenait un ruban
// mort pendant que la ville s'allumait.
//
// La première version posait UN fanal ambre avec halo et reflet. Rejeté par
// Raph (2026-07-29) au profit du vrai : un bateau porte DEUX feux de position en
// haut du mât, ROUGE à bâbord et VERT à tribord. Deux points colorés discrets
// racontent mieux « bateau » qu'une belle lueur — et ils donnent gratuitement le
// SENS DE MARCHE, ce que le halo ne faisait pas.
//
// Trois conséquences tenues ici :
//   • plus aucun halo ni reflet — rien que deux pixels ;
//   • intensité franchement baissée (un feu de position balise, il n'éclaire pas) ;
//   • le PÊCHEUR n'en porte aucun : il est à l'ancre, hors des règles de route,
//     et sa scène est celle d'un type tranquille dans le noir.
//
// ⚠ ILS SONT PEINTS DANS UNE PASSE À PART, APRÈS LE VOILE DE NUIT. J'ai d'abord
// cru que supprimer le halo dispensait de la doctrine « jamais de lumière avant
// le voile » — qu'un simple pixel additif y survivrait. Faux, et vérifié à
// l'encre : zéro pixel rouge ou vert dans le PNG de nuit, le voile les avait
// tous mangés. Ce n'est pas le halo qui impose la doctrine, c'est le VOILE, et
// il tombe sur tout ce que la passe vivante a peint.
// La couche de lumière (lightCtx) ne servait pas non plus : elle n'est armée que
// pendant drawIsoLive, et les bateaux sont dessinés AVANT. D'où drawIsoShipNight,
// exactement sur le modèle des lanternes de pont (drawIsoBridgeNight).
// Molette : __navLights({ on, gain, size }).
const NAV_LIGHTS = { on: true, gain: 1, size: 1 };
if (typeof window !== 'undefined') {
  window.__navLights = (o) => { if (o) Object.assign(NAV_LIGHTS, o); return { ...NAV_LIGHTS }; };
}
export const NAV_PORT_COL = '255,60,52';    // bâbord — rouge
export const NAV_STBD_COL = '60,255,110';   // tribord — vert

// Ancrage des feux PAR STADE, en fraction de la largeur du sprite (donc
// indépendant du zoom). Une valeur unique pour toute la flotte ne peut pas être
// juste : le mât d'un voilier, la passerelle d'un vapeur et le roof-bar d'une
// vedette ne sont pas à la même hauteur, et les coques n'ont pas la même largeur
// utile dans leur cadre de 85 px.
// QUATRE valeurs, pas deux — chaque feu se pose LIBREMENT sur le sprite :
//   mast  = élévation commune au-dessus du centre de coque (verticale écran) ;
//   beam  = demi-écartement travers, signé (bâbord d'un bord, tribord de l'autre) ;
//   foreP = avance du feu BÂBORD le long de l'axe du bateau ;
//   foreS = avance du feu TRIBORD.
//
// ⚠ Les deux `fore` ont été ajoutés après coup : sans eux, les feux étaient
// cloués sur l'axe central du bateau et le clic de calibrage ne comptait que sa
// hauteur. « Ça ne marche que sur la même ligne du milieu ? » (Raph). Un feu de
// mât et un feu de poupe ne sont pas à la même avance, et sur une coque longue
// comme un porte-conteneurs la différence saute aux yeux.
//
// L'élévation reste VERTICALE à l'écran quand le bateau tourne, tandis que
// `fore` et `beam` suivent le cap : c'est ce qui garde le rouge à gauche du
// marin quelle que soit sa route.
// Se calibre AU CLIC : `__navCalib()`, un clic par feu, n'importe où sur le
// sprite. `__navAnchor(stage, {...})` règle à chaud.
const NAV_ANCHOR_DEFAULT = { mast: 0.30, beam: 0.16, foreP: 0, foreS: 0 };
// (Ni raft ni rowboat : ils ne s'allument pas, cf. NAV_DARK. Leur laisser un
// ancrage aurait entretenu l'idée qu'ils portent des feux.)
// Relevé de Raph au calibreur (2026-07-30), sur la vue de PROFIL. Sert de repli
// pour toute face que NAV_UV ne couvre pas encore.
const NAV_ANCHOR = {
  sail: { mast: 0.487, beam: 0.001, foreP: 0.009, foreS: 0.029 },
  steam: { mast: 0.054, beam: 0.051, foreP: -0.465, foreS: -0.467 },
  container: { mast: 0.136, beam: 0.011, foreP: -0.440, foreS: -0.462 },
  dinghy: { mast: 0.520, beam: 0.001, foreP: 0.014, foreS: 0.029 },
  motorboat: { mast: 0.144, beam: 0.015, foreP: 0.201, foreS: 0.203 },
};
export function navAnchorFor(stage) { return NAV_ANCHOR[stage] || NAV_ANCHOR_DEFAULT; }
if (typeof window !== 'undefined') {
  window.__navAnchor = (stage, o) => {
    if (stage && o) NAV_ANCHOR[stage] = { ...navAnchorFor(stage), ...o };
    return stage ? navAnchorFor(stage) : { ...NAV_ANCHOR };
  };
}

// Coques qui ne portent AUCUN feu. Ce n'est pas un détail de rendu mais une
// règle de monde, et elle a deux motifs distincts :
//   • le pêcheur est à l'ancre, hors des règles de route ;
//   • un radeau de rondins et une barque à rames n'ont rien pour en porter —
//     pas de mât, pas de bord franc, et surtout aucune ère où ça aurait un sens
//     (Raph, 2026-07-29). Un feu de position sur un rafiot primitif faisait
//     mentir toute la ligne du temps que la flotte raconte par ailleurs.
// Clé = le STADE de la coque (raft, sail, rowboat…), pas le métier : c'est la
// coque qui décide, et un même métier en traverse plusieurs.
const NAV_DARK = new Set(['fisher', 'raft', 'rowboat']);
export function boatHasNavLights(stage) { return !NAV_DARK.has(stage); }

// Les stades à CALIBRER, servis au calibreur. Une liste tenue de son côté aurait
// fini par diverger de NAV_DARK — le seuil du vapeur avait déjà pris cette
// pente, recopié à trois endroits. Un test vérifie que tout ce qui est ici
// s'allume vraiment.
// (Plus de dinghy ni de motorboat : le plaisancier est retiré. Les laisser ici
// ferait perdre du temps à calibrer les feux d'un bateau qui ne navigue plus.)
export const NAV_STAGES = ['sail', 'steam', 'container'];

// ── Position des feux PAR FACE ──────────────────────────────────────────────
// Le relevé de profil ci-dessus est projeté mathématiquement sur les 7 autres
// rotations (l'avance suit le cap, l'élévation reste verticale). Ça suppose que
// les 8 vues sont la rotation rigide d'un même objet — ce qu'elles NE SONT PAS :
// PixelLab les redessine une par une, la coque change de longueur apparente, le
// mât se déplace, la cheminée change de côté. « On devrait faire toutes les
// faces des sprites, tu ne crois pas ? » (Raph, 2026-07-30). Oui.
//
// Une face calibrée donne donc directement la position de chaque feu EN
// FRACTION DU SPRITE — plus de projection, plus de trigonométrie, le feu est au
// pixel qu'on a désigné. Les faces absentes retombent sur NAV_ANCHOR : la
// migration peut se faire face par face sans rien casser.
//   NAV_UV[stade][secteur] = { p: [u, v], s: [u, v] }   (p = bâbord, s = tribord)
// Relevé de Raph au calibreur (2026-07-30). Les faces absentes (sail-northeast,
// motorboat-east, et tout le dinghy) retombent sur le profil projeté de
// NAV_ANCHOR — c'est le but du repli, la table n'a pas à être complète.
const NAV_UV = {
  sail: {
    east: { p: [0.506, 0.156], s: [0.524, 0.160] },
    southeast: { p: [0.510, 0.158], s: [0.520, 0.158] },
    south: { p: [0.510, 0.158], s: [0.520, 0.162] },
    southwest: { p: [0.490, 0.164], s: [0.506, 0.162] },
    west: { p: [0.480, 0.240], s: [0.465, 0.217] },
    northwest: { p: [0.302, 0.319], s: [0.653, 0.160] },
    north: { p: [0.255, 0.217], s: [0.757, 0.219] },
  },
  steam: {
    east: { p: [0.096, 0.489], s: [0.094, 0.575] },
    southeast: { p: [0.273, 0.323], s: [0.137, 0.399] },
    south: { p: [0.610, 0.264], s: [0.396, 0.266] },
    southwest: { p: [0.875, 0.397], s: [0.739, 0.317] },
    west: { p: [0.916, 0.570], s: [0.910, 0.491] },
    northwest: { p: [0.688, 0.709], s: [0.863, 0.603] },
    north: { p: [0.380, 0.728], s: [0.641, 0.730] },
    northeast: { p: [0.151, 0.593], s: [0.353, 0.705] },
  },
  container: {
    east: { p: [0.178, 0.313], s: [0.192, 0.315] },
    southeast: { p: [0.822, 0.226], s: [0.645, 0.132] },
    south: { p: [0.369, 0.146], s: [0.643, 0.148] },
    southwest: { p: [0.371, 0.134], s: [0.194, 0.236] },
    west: { p: [0.820, 0.307], s: [0.824, 0.311] },
    northwest: { p: [0.625, 0.489], s: [0.833, 0.374] },
    north: { p: [0.365, 0.487], s: [0.641, 0.481] },
    northeast: { p: [0.196, 0.372], s: [0.388, 0.493] },
  },
  motorboat: {
    southeast: { p: [0.565, 0.570], s: [0.304, 0.438] },
    south: { p: [0.696, 0.515], s: [0.314, 0.507] },
    southwest: { p: [0.582, 0.583], s: [0.306, 0.448] },
    west: { p: [0.327, 0.477], s: [0.327, 0.450] },
    northwest: { p: [0.247, 0.438], s: [0.537, 0.325] },
    north: { p: [0.331, 0.395], s: [0.673, 0.395] },
    northeast: { p: [0.416, 0.360], s: [0.739, 0.460] },
  },
};
export function navUvFor(stage, sector) {
  const f = NAV_UV[stage];
  return (f && f[sector]) || null;
}
// Réglage à chaud, exporté plutôt que posé sur `window` : les tests tournent en
// Node sans DOM et doivent pouvoir régler la table sans passer par un global.
export function setNavUv(stage, sector, o) {
  if (!stage || !sector) return;
  if (o) (NAV_UV[stage] || (NAV_UV[stage] = {}))[sector] = o;
  else if (NAV_UV[stage]) delete NAV_UV[stage][sector];
}
if (typeof window !== 'undefined') {
  window.__navUv = (stage, sector, o) => {
    setNavUv(stage, sector, o);
    return stage ? (NAV_UV[stage] || null) : NAV_UV;
  };
}

// Le calibreur travaille sur le SPRITE : il lui faut la pose exacte de l'image,
// le réglage courant et la liste des stades — sans jamais nous importer en
// retour. ⚠ CET APPEL DOIT RESTER SOUS NAV_STAGES : placé plus haut dans le
// fichier, il lisait la constante avant son initialisation et jetait une TDZ au
// chargement du module (attrapé par les tests). Le même piège que celui qui
// interdit le cycle d'imports, à l'intérieur d'un seul fichier cette fois.
configureNavCalib({
  K: BOAT_IMG_K, TOP: BOAT_IMG_TOP, anchorFor: navAnchorFor,
  stages: NAV_STAGES, sectors: BOAT_SECTORS, uvFor: navUvFor,
});

// Intensité des feux. Le produit par nightF est la garde qui compte :
// `flameGlowAlpha` porte un plancher de JOUR délibéré pour qu'une forge brûle à
// midi, et la première version en héritait. Un feu de position n'a rien à
// signaler de jour. Le 0,62 remplace l'ancien 2,6 — Raph les trouvait trop forts.
export function boatLampMul(nightF, gain) {
  return Math.max(0, nightF || 0) * 0.62 * (gain == null ? 1 : gain);
}

// Battement d'un feu de position : LENT et LÉGER (Raph). Un feu de nav ne
// clignote pas comme un gyrophare — il respire, et c'est ce souffle qui le
// distingue d'un pixel mort collé sur la coque.
//   période ~7,3 s, amplitude ±18 % : sous 10 % l'œil ne voit rien, au-delà de
//   30 % ça se met à clignoter et le bateau ressemble à une balise.
// Deux sinus de périodes premières entre elles plutôt qu'un seul : un battement
// parfaitement régulier s'entend comme une horloge dès qu'on le regarde un peu.
// La phase vient du bateau, sinon toute la flotte respire à l'unisson.
export function boatLampFlicker(now, phase) {
  const t = now || 0, ph = phase || 0;
  const a = 0.62 * Math.sin(t / 1160 + ph) + 0.38 * Math.sin(t / 2870 + ph * 1.7);
  return 1 + 0.18 * a;
}

// Décalages écran des deux feux, en px, depuis le centre de coque.
//
// Repère du bateau projeté : l'axe d'AVANCE suit le cap écran, l'axe TRAVERS
// est sa perpendiculaire (tourner le cap de -90° en repère y-vers-le-bas donne
// la gauche du marin, donc bâbord), et l'ÉLÉVATION reste verticale à l'écran —
// c'est la convention iso : un mât ne se couche pas quand le bateau vire.
//
// `an` = { mast, beam, foreP, foreS } en fraction de dw ; chaque feu a sa propre
// avance, ce qui permet de les poser n'importe où sur la coque et pas seulement
// sur son axe.
export function navLightOffsets(heading, dw, an) {
  const a = an || NAV_ANCHOR_DEFAULT;
  const cx = Math.cos(heading), cy = Math.sin(heading);      // avance
  const tx = Math.sin(heading), ty = -Math.cos(heading);     // travers, vers bâbord
  const lift = -(a.mast || 0) * dw;                          // élévation (écran)
  const b = (a.beam || 0) * dw;
  const fp = (a.foreP || 0) * dw, fs = (a.foreS || 0) * dw;
  return {
    port: { x: fp * cx + b * tx, y: lift + fp * cy + b * ty },
    stbd: { x: fs * cx - b * tx, y: lift + fs * cy - b * ty },
  };
}

// Passe de nuit des bateaux : APRÈS drawIsoNight, comme les lanternes de pont.
// Elle consomme l'ancre écran que drawIsoShips a laissée sur chaque coque —
// `_navAt` la date, sinon une coque sortie du champ garderait sa position de la
// frame d'avant et sèmerait deux pixels au milieu de l'eau.
export function drawIsoShipNight(now) {
  const night = CM.nightF || 0;
  if (!NAV_LIGHTS.on || night <= 0.02 || !CM.ships || !CM.ships.length) return;
  const base = boatLampMul(night, NAV_LIGHTS.gain);
  if (base <= 0.01) return;
  const ctx = CM.ctx;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const sh of CM.ships) {
    if (!sh._nav || sh._navAt !== now || !boatHasNavLights(sh._nav.stage)) continue;
    // Battement propre à CE bateau : sans phase par coque, toute la flotte
    // respirerait au même rythme et l'œil y verrait un clignotant commun.
    const a = base * boatLampFlicker(now, sh.id * 0.7);
    const { x, y, dw, heading, stage, sector } = sh._nav;
    // FACE CALIBRÉE d'abord : la position est lue telle quelle sur le sprite de
    // cette rotation. Sinon, repli sur le relevé de profil projeté au cap.
    const uv = navUvFor(stage, sector);
    let off;
    if (uv) {
      const dwImg = dw * BOAT_IMG_K;
      const at = (c) => ({ x: (c[0] - 0.5) * dwImg, y: (c[1] - BOAT_IMG_TOP) * dwImg });
      off = { port: at(uv.p), stbd: at(uv.s) };
    } else {
      off = navLightOffsets(heading, dw, navAnchorFor(stage));
    }
    const px = Math.max(1, Math.round(dw * 0.045 * NAV_LIGHTS.size));
    for (const [o, col] of [[off.port, NAV_PORT_COL], [off.stbd, NAV_STBD_COL]]) {
      ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
      ctx.fillRect(Math.round(x + o.x - px / 2), Math.round(y + o.y - px / 2), px, px);
    }
  }
  ctx.globalCompositeOperation = prevOp;
}

// Aspect d'un bateau pour la frame : sprite, échelle, et force du sillage. Le
// pêcheur n'en laisse aucun (il est à l'ancre), le plaisancier à peine.
export function shipVisual(kind, band, ei, shipState) {
  // Le pêcheur est le seul bateau qu'on regarde DURER : il tient la même pose
  // 90 s. S'il n'est qu'une tache brune, sa scène ne se lit pas — d'où une
  // échelle plus généreuse que sa taille réelle ne le voudrait.
  //
  // DEUX POSES (Raph) : on ne pêche pas en naviguant. Canne tendue seulement à
  // l'ancre ; en route, la même barque et le même homme, canne rangée. C'est le
  // seul bateau du fleuve dont le sprite dépend de ce qu'il est en train de
  // FAIRE, et c'est ce qui donne à son arrivée et à son départ un sens lisible.
  if (kind === 'fisher') {
    const posed = shipState === 'anchor';
    // ⚠ LE `wake: 0` DATAIT DU TEMPS OÙ LE PÊCHEUR NE BOUGEAIT PAS. Il valait 0
    // dans les deux poses au motif qu'« il est à l'ancre » — vrai du pêcheur qui
    // traverse et se pose 90 s, faux depuis que celui de l'île TOURNE (Raph,
    // 2026-07-30 : « il faut qu'il ait des clapotis autour de lui et un sillage »).
    // À l'arrêt il n'en laisse toujours aucun, et c'est ce contraste qui fait lire
    // la pose : l'écume s'éteint quand il pose sa ligne.
    // Échelle RÉDUITE de 1,75 à 1,3 (Raph, 2026-07-30). La valeur généreuse
    // datait du jour où le pêcheur v1, sombre, se perdait sur l'eau ; la barque
    // claire actuelle se lit très bien plus petite, et une barque de pêche DOIT
    // rester la plus petite chose qui flotte — à 1,75 elle rivalisait avec un
    // vapeur.
    return { key: posed ? 'fisher' : 'fisher-row', sizeMul: 1.3, wake: posed ? 0 : 0.4, stage: 'fisher' };
  }
  const stage = tradeStage(band, ei);
  return { key: stage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : stage,
    sizeMul: tradeSizeMul(stage, band), wake: 1, stage };
}

// ── ÉVITEMENT DES OBSTACLES PLANTÉS DANS L'EAU ──────────────────────────────
// L'Aiguille Céleste est posée EN PLEIN FLEUVE (c'est un phare, cf.
// cmWetWonderSlot) : les bateaux, qui suivent le ruban, lui rentraient dedans.
//
// La manœuvre se joue sur la seule VOIE TRANSVERSALE, jamais sur `t` : on ne
// dévie pas la route du fleuve, on se range d'un bord. Le bateau choisit le côté
// où il est DÉJÀ, ce qui évite qu'il traverse le monument pour l'éviter — et
// l'écart se creuse progressivement à l'approche plutôt que d'un coup de barre.
//
// `lat` de l'obstacle est signé dans le même repère que `lateral` (tuiles depuis
// l'axe du ruban), donc les deux se comparent directement.
// Molette : __riverDodge({ on, range, clear, gateRange }).
// `gateRange` est plus large que `range` : on se présente à une passe de loin,
// alors qu'on ne s'écarte d'un obstacle qu'en le serrant.
const DODGE = { on: true, range: 0.045, clear: 1.0, gateRange: 0.07 };
if (typeof window !== 'undefined') {
  window.__riverDodge = (o) => { if (o) Object.assign(DODGE, o); return { ...DODGE }; };
}
/* ── UNE ÎLE EST UN OBSTACLE LONG, PAS UN CAILLOU ──────────────────────────────
 * L'Aiguille publie sa position comme un disque de 1,6 (cf. riverObstacles dans
 * cityMapRuntime). Depuis qu'une ÎLE l'entoure — 7,6 × 2,4 tuiles de demi-axes,
 * soit 15 tuiles de long — ce disque ne couvre plus qu'un dixième de ce qu'il faut
 * contourner : les bateaux évitaient le monument et labouraient l'île (Raph,
 * 2026-07-30, « ils passent encore dessus »).
 *
 * On publie donc une CHAÎNE de points le long du grand axe, chacun portant la
 * demi-largeur LOCALE du fuseau : l'ellipse se contourne comme elle est faite et
 * non comme si c'était un rond, et les deux bras du fleuve redeviennent deux
 * vraies passes.
 *
 * ⚠ POURQUOI PAS UN SEUL POINT AU CENTRE, AVEC UN GROS RAYON. Parce que la portée
 * de l'évitement (DODGE.range) est une fraction du fleuve ENTIER : ~22 tuiles à
 * gridN 136, mais seulement 7,8 à gridN 46 — pour une île qui, elle, fait 15
 * tuiles quelle que soit la carte. Un point unique tiendrait sur une grande carte
 * et laisserait les bateaux couper les deux pointes sur une petite, c'est-à-dire
 * le bug d'origine mais seulement pour les joueurs en début de partie. La chaîne
 * ne dépend que de la taille de l'île, donc elle tient partout.
 *
 * Vit ICI et non côté runtime : publier et éviter sont les deux moitiés d'un même
 * contrat (le format {t, lat, r}), et le piège du rayon nul ci-dessous ne se lit
 * que si `riverDodge` est sous les yeux. Pure et exportée — c'est la GÉOMÉTRIE
 * qui se teste, pas le dessin.
 * ------------------------------------------------------------------------- */
export function riverIslandObstacles(islands, sm) {
  const out = [];
  if (!islands || !sm || sm.length < 2) return out;
  const len = sm.length;
  for (const il of islands) {
    // Un point tous les ~ry le long du fuseau : assez serré pour que les zones
    // d'influence se recouvrent franchement, même sur la plus petite carte.
    const n = Math.max(3, Math.ceil((2 * il.rx) / Math.max(0.6, il.ry)));
    for (let k = 0; k <= n; k += 1) {
      const al = -il.rx + 2 * il.rx * (k / n);          // abscisse le long du courant
      const px = il.x + al * il.tx, py = il.y + al * il.ty;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < len; i += 1) {
        const dd = (sm[i].x - px) ** 2 + (sm[i].y - py) ** 2;
        if (dd < bd) { bd = dd; bi = i; }
      }
      const s0 = sm[bi];
      const a = sm[Math.max(0, bi - 1)], b = sm[Math.min(len - 1, bi + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      // Le grand axe de l'île est DROIT alors que le fleuve tourne : `lat` s'écarte
      // de zéro vers les pointes, et c'est exactement ce qu'on veut publier — la
      // chaîne suit l'ÎLE, pas l'axe du courant.
      const lat = (px - s0.x) * nx + (py - s0.y) * ny;
      // Demi-largeur du fuseau EN TRAVERS du courant à cette abscisse.
      // ⚠ PLANCHER À 0,35 ET NON ZÉRO : `riverDodge` lit `o.r || 1.4`, donc un rayon
      // nul aux pointes retomberait EN SILENCE sur le défaut de 1,4 — plus large
      // que l'île n'y est. Un zéro qui se change en gros nombre est le genre de
      // bug qu'on ne voit jamais en relisant le code.
      const u = Math.max(0, 1 - (al / il.rx) ** 2);
      out.push({
        t: bi / Math.max(1, len - 1), lat,
        r: Math.max(0.35, il.ry * Math.sqrt(u)), id: 'island',
      });
    }
  }
  return out;
}

export function riverDodge(lateral, t, effSize, hw, obstacles, gates, memo) {
  const obs = obstacles || CM.riverObstacles;
  const gts = gates || CM.riverGates;
  if (!DODGE.on) return lateral;
  let out = lateral;
  // Groupes d'obstacles frôlés à CETTE frame : sert à oublier le bord choisi
  // une fois l'île doublée (cf. le bloc de mémoire plus bas).
  const vus = memo ? new Set() : null;
  // ── PASSES : le pont n'est franchissable QU'AU MILIEU ──────────────────────
  // La travée centrale est ouverte (isoBridge retire les palées du chenal), mais
  // un bateau qui arrive au ras d'une berge passerait quand même dans la pierre.
  // On le RECENTRE avant l'ouvrage. C'est l'inverse exact d'un obstacle : ici on
  // attire au lieu d'écarter.
  if (gts && gts.length) {
    for (const g of gts) {
      let dt = Math.abs(t - g.t);
      if (dt > 0.5) dt = 1 - dt;
      if (dt > DODGE.gateRange) continue;
      const p = 1 - dt / DODGE.gateRange;
      out += ((g.lat || 0) - out) * (p * p * (3 - 2 * p));
    }
  }
  if (!obs || !obs.length) return out;
  for (const o of obs) {
    let dt = Math.abs(t - o.t);
    if (dt > 0.5) dt = 1 - dt;
    if (dt > DODGE.range) continue;
    // Approche lissée : 0 au bord de la zone, 1 au droit de l'obstacle.
    const p = 1 - dt / DODGE.range;
    const force = p * p * (3 - 2 * p);
    // Dégagement voulu : le rayon de l'obstacle plus la demi-coque, plus une
    // marge. Un bateau large se range donc plus loin qu'une barque.
    const clear = (o.r || 1.4) + effSize * 0.5 + DODGE.clear * 0.5;
    // ⚠ LE BORD SE CHOISIT UNE FOIS, PUIS NE BOUGE PLUS. Recalculé à chaque
    // frame, `out >= o.lat` bascule dès que le LOUVOIEMENT fait passer la coque
    // d'un côté à l'autre de l'axe — et le bateau se téléporte d'un bras de
    // l'île à l'autre au lieu de la contourner (Raph). La bascule est invisible
    // sur un obstacle ponctuel au milieu du fleuve, elle saute aux yeux dès que
    // l'obstacle est une île qu'on longe pendant plusieurs secondes.
    //
    // La mémoire est prise par GROUPE (`o.id`) : l'île publie une chaîne de
    // points qui partagent le même id, donc toute la chaîne s'accorde sur un
    // seul bord — sinon les pointes et le milieu pourraient se contredire.
    const gid = o.id || 'x';
    let side;
    if (memo) {
      vus.add(gid);
      const mem = memo._dodgeSide || (memo._dodgeSide = {});
      if (mem[gid] === undefined) mem[gid] = out >= o.lat ? 1 : -1;
      side = mem[gid];
    } else {
      // Côté déjà pris — et non le plus dégagé : un bateau qui traverserait le
      // monument pour se ranger « du bon côté » serait pire que le défaut.
      side = out >= o.lat ? 1 : -1;
    }
    let cible = o.lat + side * clear;
    // Le contournement reste DANS l'eau : au besoin on passe de l'autre bord
    // plutôt que d'échouer le bateau sur la berge.
    const bord = hw * 0.86 - effSize * 0.3;
    if (Math.abs(cible) > bord) {
      const autre = o.lat - side * clear;
      cible = Math.abs(autre) <= bord ? autre : Math.max(-bord, Math.min(bord, cible));
    }
    // ⚠ UN OBSTACLE ÉCARTE, IL N'ATTIRE JAMAIS. Sans cette borne, `out += (cible -
    // out) · force` RAMÈNE le bateau vers l'obstacle quand il est déjà plus au
    // large que le dégagement demandé. Invisible tant qu'il n'y avait qu'un seul
    // obstacle ponctuel (l'Aiguille) ; fatal dès qu'une ÎLE en publie une chaîne,
    // parce que les points étroits des pointes viennent alors défaire l'écart que
    // le point large du milieu vient d'obtenir — et la coque repasse sur la terre,
    // exactement le défaut qu'on croyait corriger.
    const vise = out + (cible - out) * force;
    out = side > 0 ? Math.max(out, vise) : Math.min(out, vise);
  }
  // L'île doublée, on oublie le bord : au prochain passage le bateau choisira
  // de nouveau selon sa route. Sans cet oubli, un marchand qui a serré à gauche
  // une fois serrerait à gauche pour le restant de sa vie, même arrivé par
  // l'autre bout du fleuve.
  if (memo && memo._dodgeSide) {
    for (const k of Object.keys(memo._dodgeSide)) if (!vus.has(k)) delete memo._dodgeSide[k];
  }
  return out;
}
