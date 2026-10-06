// LA FLOTTE FLUVIALE, CÔTÉ RENDU — extrait d'isoRenderer.js le 2026-08-23 (Q10).
//
// `riverFleet.js` décide QUI navigue et où ; ce module dit à quoi ça ressemble :
// le stade de commerce par ère, les FEUX DE NAVIGATION (bâbord rouge / tribord vert,
// ancres de la coque du kit), la passe de nuit, et l'évitement des obstacles plantés
// dans l'eau.
//
// (La chaîne des coques en SPRITES — pose du sprite, coque de repli, feux relevés
// face par face et leur calibreur navCalib.js — est partie le 2026-10-06 avec l'A/B
// `__boatKit({ on: false })` : le kit couvre les dix bandes, audit du 05/10, MORT-6.
// Les 72 sprites boat-<stade>-<secteur> sont gardés comme source dans
// art/references-ab/bateaux-sprites/.)
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Le bloc est déplacé tel quel : même
// code, même ordre, mêmes constantes. La couture a été MESURÉE avant la coupe :
// zéro dépendance vers le reste d'isoRenderer (c'est ce qui rend ce module
// extractible sans import circulaire), huit symboles rendus, deux imports externes.
// Vérifié par empreinte de canvas au pixel près, avant/après, sur 8 frames
// déterministes (3 ères × jour/nuit/crépuscule/ruine).
import { CM } from '../layout.js';
import { drawLamps } from './boatFx.js';

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
// Le pêcheur ne passe pas par cette table — et le plaisancier a quitté le fleuve
// (retrait 2026-07-30). Les coques du kit ont leur propre longueur (boatKits) : la
// table cote désormais la passe du pont (isoBridge), la maison du port
// (isoPort.drawIsoRiverside) et le gabarit de repli de la simulation
// (cityMapRuntime.fleetHullSize).
// Molette live : window.__fleetScale (objet muté).
const FLEET_SCALE = { raft: 1.36, sail: 1.8, steam: 2.4, container: 2.6, cosmic7: 2.8, cosmic8: 3.0, cosmic9: 3.2 };
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__fleetScale = FLEET_SCALE;
export function tradeSizeMul(stage, band) {
  return stage === 'cosmic' ? (band >= 9 ? FLEET_SCALE.cosmic9 : band >= 8 ? FLEET_SCALE.cosmic8 : FLEET_SCALE.cosmic7)
    : FLEET_SCALE[stage] || FLEET_SCALE.raft;
}
// 🚫 LE PLAISANCIER A ÉTÉ RETIRÉ (Raph, 2026-07-30) — ses trois âges (rames,
// voilier, vedette), sa dérive d'une berge à l'autre et son art calibré face par
// face. Le fleuve est plus lisible sans lui : il raconte le TRAVAIL, le port qui
// charge et l'homme qui pêche, et un promeneur y ajoutait du mouvement sans y
// ajouter de sens. Ne pas le reproposer.
// (La plaisance À QUAI, elle, reste : les bassins des ports amarrent les modèles
// `pleasure` du kit, boatKit.mooredSpec.)

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
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__navLights = (o) => { if (o) Object.assign(NAV_LIGHTS, o); return { ...NAV_LIGHTS }; };
}
export const NAV_PORT_COL = '255,60,52';    // bâbord — rouge
export const NAV_STBD_COL = '60,255,110';   // tribord — vert

// OÙ SONT LES FEUX : des ANCRES de la coque du kit (boatBake, ancres `port` et
// `stbd`), projetées à l'écran par drawBoat — ni table de calibrage, ni projection.
// Qui en porte est une règle du MODÈLE (`lights` dans boatKits) : ni le pêcheur, à
// l'ancre et hors des règles de route, ni le radeau ou la barque, qui n'ont rien pour
// en porter (Raph, 2026-07-29).
// (Les relevés de feux PAR STADE et PAR FACE des sprites — NAV_ANCHOR, NAV_UV, leur
//  projection navLightOffsets et le calibreur au clic — sont partis avec les
//  sprites, audit du 05/10, MORT-6.)

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
  // La lanterne du ponton de la navette des Plaisirs (boatScenes la publie).
  if (CM._sceneLamps && CM._sceneLamps.at === now) drawLamps(ctx, CM._sceneLamps.pts, now, CM.cam.zoom || 1, 7, night);
  for (const sh of CM.ships) {
    if (!sh._nav || sh._navAt !== now) continue;
    // GYROPHARE (police, sentinelles) : il tourne la nuit, bleu, en deux temps.
    if (sh._nav.beacon) drawBeacon(ctx, sh._nav.beacon, now, sh.id | 0, sh._nav.glow, night);
    // LANTERNES (navette des Plaisirs) : les ancres `lamp*` du bateau-lanterne.
    if (sh._nav.lamps) drawLamps(ctx, sh._nav.lamps, now, CM.cam.zoom || 1, sh.id | 0, night);
    // Les feux sont des ANCRES de la coque du kit (boatKit.js), déjà projetées à
    // l'écran. Pas d'ancre = pas de feux (barque, bac, chaland : la règle est tenue
    // par le modèle).
    if (!sh._nav.pts) continue;
    // Battement propre à CE bateau : sans phase par coque, toute la flotte
    // respirerait au même rythme et l'œil y verrait un clignotant commun.
    const a = base * boatLampFlicker(now, sh.id * 0.7);
    const { x, y } = sh._nav;
    const P = sh._nav.pts;
    const off = { port: { x: P.port.x - x, y: P.port.y - y }, stbd: { x: P.stbd.x - x, y: P.stbd.y - y } };
    // Un feu fait UN pixel d'art (le grain du bateau), pas une fraction de coque.
    const px = Math.max(1, Math.round((CM.cam.zoom || 1) * NAV_LIGHTS.size));
    for (const [o, col] of [[off.port, NAV_PORT_COL], [off.stbd, NAV_STBD_COL]]) {
      ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
      ctx.fillRect(Math.round(x + o.x - px / 2), Math.round(y + o.y - px / 2), px, px);
    }
  }
  ctx.globalCompositeOperation = prevOp;
}

function drawBeacon(ctx, at, now, seed, color, night) {
  const ph = Math.floor((now || 0) / 260 + (seed % 5)) % 4;
  if (ph === 1 || ph === 3) return;                      // deux éclats, deux noirs
  const z = CM.cam.zoom || 1;
  const col = color ? color : '#5aa8ff';
  const c = parseInt(col.slice(1), 16);
  const rgbS = ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255);
  const a = Math.min(1, 0.35 + night);
  ctx.fillStyle = 'rgba(' + rgbS + ',' + (0.18 * a).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(at.x, at.y, 5 * z, 0, Math.PI * 2); ctx.fill();
  const px = Math.max(1, Math.round(z * 1.5));
  ctx.fillStyle = 'rgba(' + rgbS + ',' + a.toFixed(3) + ')';
  ctx.fillRect(Math.round(at.x - px / 2), Math.round(at.y - px / 2), px, px);
}

// Aspect d'un bateau pour la frame : force du sillage et stade (l'écume du stade
// cosmique est bleutée). Le pêcheur n'en laisse aucun à l'ancre.
// (La clé de sprite et l'échelle des sprites sont parties avec eux, audit du 05/10,
//  MORT-6 : la coque et sa longueur viennent du modèle du kit, et la pose du pêcheur
//  — canne tendue à l'ancre, rangée en route — de boatKit.kitState.)
export function shipVisual(kind, band, ei, shipState) {
  if (kind === 'fisher') {
    const posed = shipState === 'anchor';
    // ⚠ LE `wake: 0` DATAIT DU TEMPS OÙ LE PÊCHEUR NE BOUGEAIT PAS. Il valait 0
    // dans les deux poses au motif qu'« il est à l'ancre » — vrai du pêcheur qui
    // traverse et se pose 90 s, faux depuis que celui de l'île TOURNE (Raph,
    // 2026-07-30 : « il faut qu'il ait des clapotis autour de lui et un sillage »).
    // À l'arrêt il n'en laisse toujours aucun, et c'est ce contraste qui fait lire
    // la pose : l'écume s'éteint quand il pose sa ligne.
    return { wake: posed ? 0 : 0.4, stage: 'fisher' };
  }
  return { wake: 1, stage: tradeStage(band, ei) };
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
if (import.meta.env?.DEV && typeof window !== 'undefined') {
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
