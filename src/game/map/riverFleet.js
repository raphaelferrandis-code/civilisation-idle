/* ---- La flotte du fleuve : qui naît, qui navigue, qui s'en va ---- */
//
// Avant ce module, `CM.ships` était un ANNEAU : N bateaux identiques dont la
// position `t` bouclait de 1 à 0, donc personne n'arrivait ni ne repartait
// jamais — ce que l'œil lisait comme un tapis roulant. Pire, la flotte était
// reconstruite EN BLOC dès que son effectif changeait (`ships.length !== want`),
// et tout le monde se téléportait : un bateau qui doit tenir une pose 90 s n'y
// survivait pas.
//
// Ici chaque bateau a une VIE : il entre par un bord de carte, fait ce qu'il a
// à faire, ressort par l'autre bord et MEURT. L'effectif est un plafond de
// présence simultanée, pas un décompte figé : on comble à la marge, avec un
// délai entre deux arrivées. Ce délai est ce qui donne au fleuve ses creux, et
// c'est lui (plus que le plafond) qui fait qu'on ne se sent plus sur une
// autoroute fluviale.
//
// DEUX métiers, deux cycles :
//   • trade  — le marchand. Entre, accoste au port, ressort. C'est LUI qui
//              porte le signal de prospérité (son effectif suit river_ports).
//   • fisher — le pêcheur. Entre, jette l'ancre à l'écart des quais, ne bouge
//              plus pendant 90 s, puis repart. Sa barque en bois ne change
//              JAMAIS, de la première ère à la dernière (arbitrage Raph).
//
// 🚫 LE PLAISANCIER A ÉTÉ RETIRÉ (Raph, 2026-07-30). Il avait ses trois âges
// (rames, voilier, vedette), sa dérive lente d'une berge à l'autre et son art
// calibré — et le fleuve était plus lisible sans lui. Ne pas le reproposer : le
// fleuve raconte le TRAVAIL (le port qui charge, l'homme qui pêche), et un
// promeneur y ajoutait du mouvement sans y ajouter de sens.
// Les sprites (boat-rowboat / dinghy / motorboat) restent sur le disque et dans
// le roster : leur génération est payée, le retour arrière ne coûterait qu'un
// budget à rouvrir.
//
// Module PUR : aucune dépendance au canvas ni à CM, uniquement `cmHash`. Toute
// la logique est donc testable en vitest sans monter un rendu — c'est la raison
// d'être du fichier séparé, la sim vivait jusqu'ici DANS les fonctions de
// dessin (et en double, une fois par rendu).
import { cmHash } from './layout.js';

// ⚠ cmHash renvoie du SIGNÉ (piège maison, déjà payé sur les poissons) : on
// force en unsigned avant tout modulo, sinon on récolte des fractions négatives.
// Et jamais de `& 1` pour un tirage à deux états : le bit faible de cmHash suit
// la parité de l'entrée et donne un damier, pas du hasard.
const rnd01 = (key) => ((cmHash(key) >>> 0) % 100000) / 100000;

export const FLEET_TUNE = {
  // Plafond de PRÉSENCE simultanée des marchands (Raph, 2026-07-29) : l'ancien
  // calcul montait à 12 en anneau permanent. À 5 avec de vraies entrées/sorties,
  // le port raconte toujours sa richesse mais le fleuve respire.
  tradeMax: 5,
  // Creux entre deux arrivées, en secondes. C'est le vrai levier de densité.
  tradeGap: [12, 32],
  fisherGap: [30, 70],
  dockDwell: 2.5,      // escale marchande au quai (s) — reprise du legacy
  fisherDwell: 90,     // pose du pêcheur (s) — 90 s pour que le cycle se voie
  fadeIn: 1.2,         // apparition au bord de carte (s)
  // Vitesses en FRACTION DE RUBAN par seconde (mêmes unités qu'avant).
  // Marchands RALENTIS (Raph, 2026-07-29) : ils filaient trop vite pour des
  // bateaux de charge, ce qui contredisait le plafond et les creux — un fleuve
  // peu peuplé mais parcouru au pas de course reste agité. Une traversée entière
  // prend maintenant 2 à 3 minutes.
  speed: { trade: [0.005, 0.010], fisher: [0.006, 0.009] },
  // ── LE PÊCHEUR DE L'ÎLE ────────────────────────────────────────────────────
  // Demande de Raph (2026-07-30) : l'île doit rester INACCESSIBLE, « avec le
  // pêcheur qui tourne autour ». C'est le seul bateau du fleuve qui ne traverse
  // pas : il fait le tour de l'île, s'arrête pour pêcher, repart. Il ne meurt pas
  // au bord de la carte — c'est LE pêcheur de cette île, et sa permanence est
  // exactement ce qui donne à l'île un habitant sans qu'on y débarque jamais.
  orbitClear: 1.5,       // tuiles entre la berge de l'île et la coque
  orbitSpeed: 0.5,       // tuiles/s LE LONG du circuit (≈ 82 s le tour, mesuré)
  // ⚠ DEUX RÉGLAGES DE SUITE, ET LES DEUX PAR LA MESURE — le second corrige le
  // premier. (1) Réutiliser les 90 s de `fisherDwell` donnait, sur 300 s, 84 s de
  // navigation contre 216 à l'ancre : un bateau immobile 72 % du temps, alors que
  // la demande était « le pêcheur qui TOURNE autour ». (2) Corrigé à 55-110 s de
  // route pour 35 s de pose, Raph a répondu l'inverse : « je le vois tourner mais
  // pas s'arrêter » — une pose toutes les ~2 minutes, sur une barque de quelques
  // pixels, ne se rencontre tout simplement jamais. On resserre donc le cycle à
  // ~1 minute. Ce qui rend VRAIMENT la pose lisible n'est d'ailleurs pas sa durée
  // mais son banc de poissons (cf. FISHER_WATER) : la cadence n'est que ce qui
  // donne à la scène l'occasion d'arriver.
  orbitFish: [32, 58],   // secondes de NAVIGATION entre deux poses
  orbitDwell: 26,
};

export const FLEET_KINDS = ['trade', 'fisher'];

// Un pas de sim plus long qu'un gros hoquet de frame ne veut rien dire : onglet
// caché, l'horloge revient avec plusieurs secondes d'un coup et toute la flotte
// sauterait d'un bord à l'autre. On ne rattrape pas le temps perdu du fleuve.
const DT_MAX = 0.2;

// Bornes de vie sur le ruban : naissance à un bord, mort passé l'autre.
const T_LO = -0.015, T_HI = 1.015;

const lerp = (a, b, f) => a + (b - a) * f;

export function makeFleetCtl() {
  return { nextId: 1, birth: { trade: 0, fisher: 0 } };
}

// Effectif VOULU par métier. Les marchands gardent la formule historique (port
// + un peu de marchés et d'ère), seul le plafond descend ; sans port, le fleuve
// de village garde sa barque isolée à partir de l'âge de bronze.
export function riverFleetBudget(state, L) {
  const empty = { trade: 0, fisher: 0 };
  if (!L || !L.river || !L.river.present) return empty;
  const b = (state && state.buildings) || {};
  const portLvl = Math.floor(b.river_ports || 0);
  const mktLvl = Math.floor(b.markets || 0);
  const counts = L.counts || {};
  const eraIdx = counts.eraIndex || 0;
  const band = counts.eraBand || 0;
  let trade = 0;
  if (portLvl > 0) {
    // ⚠ La formule a dû être RÉÉCHELONNÉE en même temps que le plafond passait
    // de 12 à 5. L'ancienne (1 + port×0,7 + marchés×0,12 + ère×0,2) était
    // linéaire : sous un plafond de 5, son seul terme d'ère saturait déjà tout
    // à l'ère 20, et le port n'avait plus AUCUN effet visible sur le fleuve —
    // exactement le signal de prospérité qu'on voulait préserver en abaissant
    // le plafond. Le test « le port reste lisible en fin de partie » monte la
    // garde là-dessus.
    // Échelle LOG parce qu'on est dans un idle : les niveaux de port montent
    // sans fin, et 5 paliers doivent s'égrener sur toute cette course plutôt
    // que d'être brûlés dans les dix premiers achats.
    const lg = (v) => Math.log2(1 + Math.max(0, v));
    trade = Math.round(1 + lg(portLvl) * 0.8 + lg(mktLvl) * 0.2 + eraIdx * 0.03);
    trade = Math.max(1, Math.min(FLEET_TUNE.tradeMax, trade));
  } else if (band >= 2) {
    trade = 1;
  }
  // La pêche ne dépend PAS du port : on pêche sur le fleuve d'un village comme
  // sur celui d'une mégapole.
  const fisher = 1;
  return { trade, fisher };
}

// Point d'ancrage du pêcheur : à l'écart des quais (on ne jette pas l'ancre
// dans un chenal de port) et pas collé aux bords de carte. On tire quelques
// candidats et on garde celui qui respire le plus — moins cher et plus lisible
// qu'une recherche exacte, pour un fleuve qui n'a jamais dix ports.
function pickAnchorT(id, avoidT) {
  let best = 0.5, bestD = -1;
  for (let k = 0; k < 6; k += 1) {
    const cand = 0.12 + rnd01('fishAnchor:' + id + ':' + k) * 0.76;
    let d = Infinity;
    for (const a of avoidT) {
      const dd = Math.abs(cand - a);
      if (dd < d) d = dd;
    }
    if (d > bestD) { bestD = d; best = cand; }
  }
  return best;
}

function spawn(kind, ctl, env) {
  const id = ctl.nextId;
  ctl.nextId += 1;
  // Sens de descente tiré au hash (rebrassé, cf. note en tête) puis position de
  // naissance au bord CORRESPONDANT : un bateau qui descend naît en amont.
  const dir = rnd01('shipDir:' + id) < 0.5 ? 1 : -1;
  const [sLo, sHi] = FLEET_TUNE.speed[kind];
  const sh = {
    id,
    kind,
    dir,
    t: dir > 0 ? 0 : 1,
    speed: lerp(sLo, sHi, rnd01('shipSpeed:' + id)),
    lane: (rnd01('shipLane:' + id) * 2 - 1) * 0.8,
    phase: rnd01('shipPhase:' + id) * Math.PI * 2,
    fade: 0,
    state: 'cruise',
    stateT: 0,
    done: false,      // escale déjà faite : il file vers la sortie
    lastDock: -1,
  };
  if (kind === 'fisher') sh.anchorT = pickAnchorT(id, env.avoidT || []);
  return sh;
}

/* ── LE CIRCUIT DU PÊCHEUR AUTOUR DE L'ÎLE ────────────────────────────────────
 * Une ellipse HOMOTHÉTIQUE au fuseau, écartée de `clear` tuiles : le bateau garde
 * donc la même distance à la berge tout du long, ce qu'aucune orbite circulaire
 * ne ferait sur une île de 7,6 × 2,4 (elle passerait à trois tuiles au large des
 * flancs et raserait les pointes).
 *
 * Même repère que le contour d'île du renderer : `al` le long du courant, `cr` en
 * travers. Vit ICI et pas dans le rendu parce que la SIM en a besoin aussi (pour
 * convertir une vitesse en tuiles/s en vitesse angulaire) : deux copies de cette
 * courbe divergeraient au premier réglage, et le bateau naviguerait à côté de sa
 * propre trajectoire.
 * ------------------------------------------------------------------------- */
export function orbitPoint(il, ang, clear = FLEET_TUNE.orbitClear) {
  const rx = il.rx + clear, ry = il.ry + clear;
  const al = Math.cos(ang) * rx, cr = Math.sin(ang) * ry;
  return { x: il.x + al * il.tx - cr * il.ty, y: il.y + al * il.ty + cr * il.tx };
}

// Vitesse ANGULAIRE qui donne `orbitSpeed` tuiles/s à l'endroit où l'on est.
// ⚠ Sans cette conversion, une vitesse angulaire constante ferait filer le bateau
// le long des flancs et ramper aux pointes — sur ce fuseau, un facteur 2,4 entre
// les deux, parfaitement visible. Le module de la tangente de l'ellipse EST le
// facteur à annuler.
function orbitAngStep(il, ang, clear = FLEET_TUNE.orbitClear) {
  const rx = il.rx + clear, ry = il.ry + clear;
  const sp = Math.hypot(rx * Math.sin(ang), ry * Math.cos(ang));
  return FLEET_TUNE.orbitSpeed / Math.max(0.25, sp);
}

// Distance CIRCULAIRE entre deux positions de ruban (le ruban est parcouru dans
// les deux sens, la proximité d'un quai ne dépend pas du sens de marche).
function ringDist(a, b) {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

const DOCK_RANGE = 0.05;   // demi-zone d'escale autour d'un port (unités de t)

/**
 * Avance la flotte d'un pas. Mute `ships` (naissances et morts comprises).
 *
 * @param {Array}  ships  le pool (CM.ships)
 * @param {Object} ctl    état de pilotage (makeFleetCtl)
 * @param {Object} budget effectif voulu par métier (riverFleetBudget)
 * @param {number} dt     secondes écoulées
 * @param {Object} env    { docks: [{t, side}], avoidT: [t] }
 */
export function updateRiverFleet(ships, ctl, budget, dt, env = {}) {
  const step = Math.max(0, Math.min(DT_MAX, dt || 0));
  const docks = env.docks || [];

  // --- 1) Vie de chaque bateau -----------------------------------------------
  for (let i = ships.length - 1; i >= 0; i -= 1) {
    const sh = ships[i];
    if (sh.fade < 1) sh.fade = Math.min(1, sh.fade + step / FLEET_TUNE.fadeIn);

    // L'ÎLE A DISPARU (merveille perdue, nouveau cycle) : le pêcheur redevient
    // ordinaire et s'en ira par un bord. Pas de suppression sèche — un bateau qui
    // s'évapore au milieu de l'eau se voit.
    // ⚠ AVANT le test d'arrêt, et c'est le fruit d'un test rouge : depuis la
    // branche `anchor` on sort par `continue`, donc un pêcheur qui pêchait au
    // moment où l'île s'efface serait resté accroché à son orbite le temps de sa
    // pose entière — à tourner autour de rien.
    if (sh.orbit && !env.island) delete sh.orbit;

    if (sh.state === 'dock' || sh.state === 'anchor') {
      sh.stateT -= step;
      if (sh.stateT <= 0) { sh.state = 'cruise'; sh.done = true; }
      continue;                        // à l'arrêt : ni avance, ni dérive
    }

    // ── LE PÊCHEUR DE L'ÎLE : il tourne, il ne traverse pas ──────────────────
    // Traité AVANT tout le reste et sorti par `continue` : il n'a ni escale, ni
    // point d'ancrage sur le ruban, ni bord de carte où mourir. Sa position ne
    // vit pas dans `t` mais dans son angle — c'est le seul bateau du fleuve dont
    // la trajectoire n'est pas le fleuve.
    if (sh.orbit) {
      const il = env.island;
      // Il garde un `t` PLAUSIBLE — celui de l'île — alors même qu'il n'y navigue
      // pas. Sans ça, le jour où il perd son orbite il repartirait de son `t` de
      // NAISSANCE, resté au bord de la carte : téléportation à travers la ville,
      // puis 90 s d'ancrage de pêcheur ordinaire. C'était le SEUL chemin par
      // lequel la pose des 90 s pouvait revenir le hanter.
      if (env.islandT != null) sh.t = env.islandT;
      sh.orbit.ang += sh.orbit.dir * orbitAngStep(il, sh.orbit.ang) * step;
      sh.orbit.since += step;
      if (sh.orbit.since >= sh.orbit.next) {
        sh.orbit.since = 0;
        sh.orbit.next = lerp(FLEET_TUNE.orbitFish[0], FLEET_TUNE.orbitFish[1],
          rnd01('orbitFish:' + sh.id + ':' + Math.round(sh.orbit.ang * 100)));
        sh.state = 'anchor';
        sh.stateT = FLEET_TUNE.orbitDwell;
      }
      continue;                        // ni `t`, ni dérive, ni sortie de carte
    }

    // Ralentissement à l'approche d'un quai : seuls les marchands qui n'ont pas
    // encore fait escale y prêtent attention. Le pêcheur et le plaisancier
    // passent devant un port sans lever le nez.
    let moveF = 1;
    if (sh.kind === 'trade' && !sh.done && docks.length) {
      let bestD = Infinity, bestIdx = -1;
      for (let d = 0; d < docks.length; d += 1) {
        const dd = ringDist(sh.t, docks[d].t);
        if (dd < bestD) { bestD = dd; bestIdx = d; }
      }
      const p = Math.max(0, 1 - bestD / DOCK_RANGE);
      const prox = p * p * (3 - 2 * p);
      moveF = 1 - 0.85 * prox;
      if (prox > 0.9 && bestIdx !== sh.lastDock) {
        sh.state = 'dock';
        sh.stateT = FLEET_TUNE.dockDwell;
        sh.lastDock = bestIdx;
        sh.dockSide = docks[bestIdx].side;
        continue;
      }
    }

    // Le pêcheur freine sur son point d'ancrage puis s'y pose.
    if (sh.kind === 'fisher' && !sh.done) {
      const dd = Math.abs(sh.t - sh.anchorT);
      moveF = Math.max(0.12, Math.min(1, dd / 0.06));
      // On teste le DÉPASSEMENT et non l'égalité : à dt variable, `t` ne tombe
      // jamais pile sur l'ancre — un test d'égalité laisserait le pêcheur filer
      // jusqu'au bord sans jamais s'arrêter.
      const passed = sh.dir > 0 ? sh.t >= sh.anchorT : sh.t <= sh.anchorT;
      if (passed) {
        sh.t = sh.anchorT;
        sh.state = 'anchor';
        sh.stateT = FLEET_TUNE.fisherDwell;
        continue;
      }
    }

    sh.t += sh.dir * sh.speed * moveF * step;

    // Sortie de carte : il a fini son voyage. Plus de wrap — c'est tout le
    // point du module.
    if (sh.t < T_LO || sh.t > T_HI) ships.splice(i, 1);
  }

  // --- 2) Naissances ----------------------------------------------------------
  // Un métier ne fait naître que s'il est sous son effectif ET si le délai
  // depuis la dernière arrivée est écoulé. Sans ce délai, un plafond de 5
  // redonnerait exactement l'ancien mur de bateaux dès la première frame.
  for (const kind of FLEET_KINDS) {
    const want = budget[kind] || 0;
    let have = 0;
    for (const sh of ships) if (sh.kind === kind) have += 1;
    if (have >= want) {
      // Trop de monde (le port vient de perdre un niveau, ou le budget a
      // baissé) : on ne massacre personne, les surnuméraires sortiront d'eux
      // mêmes par un bord. Le pool converge sans téléportation.
      ctl.birth[kind] = Math.max(0, ctl.birth[kind] - step);
      continue;
    }
    ctl.birth[kind] -= step;
    if (ctl.birth[kind] > 0) continue;
    const ne = spawn(kind, ctl, env);
    // UN SEUL pêcheur d'île à la fois, et c'est le premier qui naît quand l'île
    // existe. Les suivants font leur métier normal ailleurs sur le fleuve : deux
    // barques tournant en rond autour du même caillou se liraient comme un bug
    // d'animation, pas comme une habitude.
    if (kind === 'fisher' && env.island && !ships.some((s) => s.orbit)) {
      ne.orbit = {
        ang: rnd01('orbitAng:' + ne.id) * Math.PI * 2,
        dir: rnd01('orbitDir:' + ne.id) < 0.5 ? 1 : -1,
        since: 0,
        next: lerp(FLEET_TUNE.orbitFish[0], FLEET_TUNE.orbitFish[1], rnd01('orbitNext:' + ne.id)),
      };
    }
    ships.push(ne);
    const [gLo, gHi] = FLEET_TUNE[kind + 'Gap'];
    ctl.birth[kind] = lerp(gLo, gHi, rnd01('shipGap:' + kind + ':' + ctl.nextId));
  }

  return ships;
}
