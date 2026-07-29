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
// Trois métiers, trois cycles :
//   • trade  — le marchand. Entre, accoste au port, ressort. C'est LUI qui
//              porte le signal de prospérité (son effectif suit river_ports).
//   • yacht  — le plaisancier. Aucune destination : il vogue, sa voie dérive
//              lentement d'une berge à l'autre. Trois stades d'ère (rames,
//              voilier, vedette), cf. le rendu.
//   • fisher — le pêcheur. Entre, jette l'ancre à l'écart des quais, ne bouge
//              plus pendant 90 s, puis repart. Sa barque en bois ne change
//              JAMAIS, de la première ère à la dernière (arbitrage Raph).
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
  yachtGap: [18, 40],
  fisherGap: [30, 70],
  dockDwell: 2.5,      // escale marchande au quai (s) — reprise du legacy
  fisherDwell: 90,     // pose du pêcheur (s) — 90 s pour que le cycle se voie
  fadeIn: 1.2,         // apparition au bord de carte (s)
  // Vitesses en FRACTION DE RUBAN par seconde (mêmes unités qu'avant).
  // Marchands RALENTIS (Raph, 2026-07-29) : ils filaient trop vite pour des
  // bateaux de charge, ce qui contredisait le plafond et les creux — un fleuve
  // peu peuplé mais parcouru au pas de course reste agité. Une traversée entière
  // prend maintenant 2 à 3 minutes.
  speed: { trade: [0.005, 0.010], yacht: [0.0035, 0.006], fisher: [0.006, 0.009] },
};

export const FLEET_KINDS = ['trade', 'yacht', 'fisher'];

// Un pas de sim plus long qu'un gros hoquet de frame ne veut rien dire : onglet
// caché, l'horloge revient avec plusieurs secondes d'un coup et toute la flotte
// sauterait d'un bord à l'autre. On ne rattrape pas le temps perdu du fleuve.
const DT_MAX = 0.2;

// Bornes de vie sur le ruban : naissance à un bord, mort passé l'autre.
const T_LO = -0.015, T_HI = 1.015;

const lerp = (a, b, f) => a + (b - a) * f;

export function makeFleetCtl() {
  return { nextId: 1, birth: { trade: 0, yacht: 0, fisher: 0 } };
}

// Effectif VOULU par métier. Les marchands gardent la formule historique (port
// + un peu de marchés et d'ère), seul le plafond descend ; sans port, le fleuve
// de village garde sa barque isolée à partir de l'âge de bronze.
export function riverFleetBudget(state, L) {
  const empty = { trade: 0, yacht: 0, fisher: 0 };
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
  // Plaisance et pêche ne dépendent PAS du port : on pêche et on canote sur le
  // fleuve d'un village comme sur celui d'une mégapole. Un second plaisancier
  // seulement quand la ville est assez grande pour qu'un seul se perde dedans.
  const yacht = band >= 1 ? (portLvl >= 4 || eraIdx >= 22 ? 2 : 1) : 0;
  const fisher = 1;
  return { trade, yacht, fisher };
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
  if (kind === 'yacht') {
    // Le plaisancier n'a pas de cap : sa voie DÉRIVE lentement d'une berge à
    // l'autre. C'est ce lent glissement latéral, plus que sa vitesse, qui le
    // fait lire comme quelqu'un qui n'a nulle part où aller.
    sh.laneV = (rnd01('shipLaneV:' + id) * 2 - 1) * 0.035;
  }
  if (kind === 'fisher') sh.anchorT = pickAnchorT(id, env.avoidT || []);
  return sh;
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

    if (sh.state === 'dock' || sh.state === 'anchor') {
      sh.stateT -= step;
      if (sh.stateT <= 0) { sh.state = 'cruise'; sh.done = true; }
      continue;                        // à l'arrêt : ni avance, ni dérive
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

    // Dérive latérale du plaisancier, avec rebond doux sur les berges.
    if (sh.kind === 'yacht') {
      sh.lane += sh.laneV * step;
      if (sh.lane > 0.85) { sh.lane = 0.85; sh.laneV = -sh.laneV; }
      if (sh.lane < -0.85) { sh.lane = -0.85; sh.laneV = -sh.laneV; }
    }

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
    ships.push(spawn(kind, ctl, env));
    const [gLo, gHi] = FLEET_TUNE[kind + 'Gap'];
    ctl.birth[kind] = lerp(gLo, gHi, rnd01('shipGap:' + kind + ':' + ctl.nextId));
  }

  return ships;
}
