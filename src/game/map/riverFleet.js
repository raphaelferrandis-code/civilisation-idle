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
  // 6 depuis la refonte (Raph, 2026-10-01 : « davantage de bateaux ») — le fleuve a
  // désormais chaland, passeur et un second pêcheur en plus, et la règle de route
  // empêche que la densité tourne au mur de coques.
  tradeMax: 6,
  // Creux entre deux arrivées, en secondes. C'est le vrai levier de densité.
  tradeGap: [12, 32],
  fisherGap: [30, 70],
  dockDwell: 2.5,      // escale marchande au quai (s) — reprise du legacy
  // VRAI ACCOSTAGE (docs/PLAN-BATEAUX.md §5, lot 4) : bord à bord au ponton, le
  // temps de charger et décharger. Poste pris : on attend son tour, pas toujours.
  berthDwell: [16, 26],
  berthPatience: 45,
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
  // LE CHALAND : rare, lent, il longe la rive d'en face du port.
  bargeGap: [40, 95],
  // LE PASSEUR : il attend ses voyageurs, traverse quand le fleuve est libre.
  ferryGap: [2, 4],
  ferryBoard: [9, 15],       // escale à l'embarcadère (s)
  ferryCross: 0.42,          // vitesse de traversée (tuiles/s)
  ferryClear: 7,             // il ne part pas si un bateau est à moins de tant de tuiles
  // LES BATEAUX DE SERVICE (Fonte et après) : la patrouille fait la navette sur le
  // tronçon de la ville et fait demi-tour à ses bouts ; la drague travaille à poste
  // fixe ; les pompiers s'arrêtent de temps en temps pour arroser.
  serviceGap: [20, 45],
  patrolSpan: 0.3,           // la patrouille tient le milieu de la fenêtre (± 30 %)
  fireEvery: [40, 75],       // secondes de ronde entre deux arrosages
  fireDwell: 14,
  // LA NAVETTE DES PLAISIRS (Raph, 2026-10-03 : « une navette qui amène à la maison
  // des plaisirs ») : un bateau-lanterne fait l'aller-retour entre son ponton en
  // ville et l'embarcadère de la Maison. SURTOUT LA NUIT : le jour il attend
  // longtemps ses passagers, la nuit il repart presque aussitôt (l'attente au ponton
  // s'écoule plus vite à mesure que la nuit tombe, cf. shuttleStep).
  shuttleBoard: [55, 95],    // attente au ponton de la ville, en plein jour (s)
  shuttleNight: 7,           // … divisée par tant en pleine nuit
  shuttleMoor: [10, 16],     // escale à la Maison, le temps que les passagers montent
  shuttleGap: [2, 4],
};

// LES MÉTIERS (docs/PLAN-BATEAUX.md §1) : le marchand et le pêcheur d'origine,
// plus le CHALAND (péniche halée depuis la berge) et le PASSEUR (le bac d'une rive
// à l'autre). Les deux nouveaux n'existent que là où l'ère a leur art (cf. le
// paramètre `roles` de riverFleetBudget) : pas de repli procédural pour eux.
export const FLEET_KINDS = ['trade', 'fisher', 'barge', 'ferry', 'service', 'shuttle'];

// Un pas de sim plus long qu'un gros hoquet de frame ne veut rien dire : onglet
// caché, l'horloge revient avec plusieurs secondes d'un coup et toute la flotte
// sauterait d'un bord à l'autre. On ne rattrape pas le temps perdu du fleuve.
const DT_MAX = 0.2;

// Bornes de vie sur le ruban : naissance à un bord, mort passé l'autre.
const T_LO = -0.015, T_HI = 1.015;

// OPACITÉ D'UN BATEAU : le fondu d'entrée (sh.fade) ET un fondu de SORTIE, sur
// le même temps (FLEET_TUNE.fadeIn), à l'approche de la borne où il meurt.
// Depuis que le fleuve se prolonge à l'écran (isoRiver, riverDrawPts), le bout
// du ruban n'est plus au bout de l'eau : sans ce fondu, un bateau s'évaporait en
// pleine rivière. Le pêcheur à l'ancre ou en orbite ne bouge pas vers une borne :
// son `t` reste loin des bouts, le facteur vaut 1. Pure et exportée.
export function shipAlpha(sh) {
  const fadeIn = Math.max(0, Math.min(1, sh.fade == null ? 1 : sh.fade));
  const perSec = Math.abs(sh.speed || 0) * FLEET_TUNE.fadeIn;
  if (!(perSec > 0) || sh.orbit) return fadeIn;
  // Fenêtre de navigation (cf. NAVIGATION) : la vie se joue entre ses bornes.
  const lo = sh.win ? sh.win[0] : T_LO, hi = sh.win ? sh.win[1] : T_HI;
  const left = sh.dir < 0 ? sh.t - lo : hi - sh.t;
  return Math.min(fadeIn, Math.max(0, Math.min(1, left / perSec)));
}

const lerp = (a, b, f) => a + (b - a) * f;

export function makeFleetCtl() {
  return { nextId: 1, birth: { trade: 0, fisher: 0, barge: 0, ferry: 0, service: 0, shuttle: 0 }, berthOwner: {} };
}

// Effectif VOULU par métier. Les marchands gardent la formule historique (port
// + un peu de marchés et d'ère), seul le plafond descend ; sans port, le fleuve
// de village garde sa barque isolée à partir de l'âge de bronze.
export function riverFleetBudget(state, L, roles = null) {
  const empty = { trade: 0, fisher: 0, barge: 0, ferry: 0, service: 0, shuttle: 0 };
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
  // Un second pêcheur dès la Pierre : un sur l'eau près des quais, un plus loin.
  const fisher = band >= 2 ? 2 : 1;
  // Chaland et passeur : seulement si l'ère a leur dessin (`roles`, la liste des
  // métiers du kit de bateaux de la bande). Le chaland suit le commerce (dès la
  // Pierre), le passeur sert la ville dès qu'elle a deux rives habitées.
  const has = (r) => !!(roles && roles.includes(r));
  const barge = has('barge') && band >= 2 ? 1 : 0;
  const ferry = has('ferry') && band >= 1 ? 1 : 0;
  // Service : un bateau à la Fonte, deux au Néon (police et pompiers), un aux
  // époques cosmiques (la sentinelle).
  const service = has('service') ? (band === 6 ? 2 : 1) : 0;
  // La navette des Plaisirs : une, dès que la Maison est sur la carte (le layout ne
  // publie `river.plaisirs` qu'une fois le lieu ouvert).
  const shuttle = has('shuttle') && L.river.plaisirs ? 1 : 0;
  return { trade, fisher, barge, ferry, service, shuttle };
}

// Point d'ancrage du pêcheur : à l'écart des quais (on ne jette pas l'ancre
// dans un chenal de port) et pas collé aux bords de carte. On tire quelques
// candidats et on garde celui qui respire le plus — moins cher et plus lisible
// qu'une recherche exacte, pour un fleuve qui n'a jamais dix ports.
function pickAnchorT(id, avoidT, win) {
  let best = 0.5, bestD = -1;
  const w0 = win ? win[0] : 0, w1 = win ? win[1] : 1;
  for (let k = 0; k < 6; k += 1) {
    const cand = w0 + (0.12 + rnd01('fishAnchor:' + id + ':' + k) * 0.76) * (w1 - w0);
    let d = Infinity;
    for (const a of avoidT) {
      const dd = Math.abs(cand - a);
      if (dd < d) d = dd;
    }
    if (d > bestD) { bestD = d; best = cand; }
  }
  return best;
}

function spawn(kind, ctl, env, ships = []) {
  const id = ctl.nextId;
  ctl.nextId += 1;
  // Sens de descente tiré au hash (rebrassé, cf. note en tête) puis position de
  // naissance au bord CORRESPONDANT : un bateau qui descend naît en amont.
  const dir = rnd01('shipDir:' + id) < 0.5 ? 1 : -1;
  const [sLo, sHi] = FLEET_TUNE.speed[kind] || FLEET_TUNE.speed.trade;
  const sh = {
    id,
    kind,
    dir,
    t: dir > 0 ? (env.win ? env.win[0] - WIN_PAD : 0) : (env.win ? env.win[1] + WIN_PAD : 1),
    win: env.win ? [env.win[0] - 2 * WIN_PAD, env.win[1] + 2 * WIN_PAD] : null,
    speed: lerp(sLo, sHi, rnd01('shipSpeed:' + id)),
    lane: (rnd01('shipLane:' + id) * 2 - 1) * 0.8,
    phase: rnd01('shipPhase:' + id) * Math.PI * 2,
    fade: 0,
    state: 'cruise',
    stateT: 0,
    done: false,      // escale déjà faite : il file vers la sortie
    lastDock: -1,
  };
  if (kind === 'fisher') sh.anchorT = pickAnchorT(id, env.avoidT || [], env.win);
  if (kind === 'barge') sh.done = true;                 // il ne fait pas escale au port
  if (kind === 'service') {
    // Rang parmi les bateaux de service présents : il choisit le MODÈLE (police,
    // pompiers…) et donc le métier (cf. env.serviceMode, lu sur le modèle).
    const taken = new Set(ships.filter((o) => o.kind === 'service').map((o) => o.svc));
    let k = 0; while (taken.has(k)) k += 1;
    sh.svc = k;
    sh.mode = env.serviceMode ? env.serviceMode(sh) || 'patrol' : 'patrol';
    sh.done = true;
    if (sh.mode === 'work') {
      // La drague : née À SON POSTE (fondu), à l'écart des quais et des ponts.
      sh.t = pickAnchorT(id + 977, env.avoidT || [], env.win);
      sh.win = null;
      sh.state = 'anchor';
      sh.stateT = Infinity;
      sh.workSide = rnd01('workSide:' + id) < 0.5 ? -1 : 1;
    } else if (env.win) {
      const w0 = env.win[0], w1 = env.win[1], mid = (w0 + w1) / 2, half = (w1 - w0) * FLEET_TUNE.patrolSpan;
      sh.patrol = [mid - half, mid + half];
      if (sh.mode === 'fire') sh.fireNext = lerp(FLEET_TUNE.fireEvery[0], FLEET_TUNE.fireEvery[1], rnd01('fire:' + id));
    }
  }
  if (kind === 'shuttle' && env.shuttle) {
    // Née À SON PONTON (fondu), à quai, ses premiers passagers à bord.
    const st = env.shuttle.city;
    sh.t = st.t; sh.win = null; sh.done = true;
    sh.lat = st.lat; sh.latV = 0; sh.th = st.th;
    sh.dir = env.shuttle.maison.t >= st.t ? 1 : -1;
    sh.state = 'dock'; sh.stateT = 4; sh.at = 'city'; sh.trip = 0;
    sh.berthLat = st.lat; sh.berthTh = st.th;
  }
  if (kind === 'ferry' && env.ferry) {
    sh.t = env.ferry.t;
    sh.win = null;
    sh.ferrySide = rnd01('ferrySide:' + id) < 0.5 ? -1 : 1;
    sh.state = 'board';
    sh.stateT = 4;
    sh.trip = 0;
  }
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
 * @param {Object} env    { docks: [{t, side}], avoidT: [t] } ; et pour la
 *                        NAVIGATION (docs/PLAN-BATEAUX.md §5, facultatif) :
 *                        { samples, gates, obstacles, dodge, sizeOf }
 */
export function updateRiverFleet(ships, ctl, budget, dt, env = {}) {
  const step = Math.max(0, Math.min(DT_MAX, dt || 0));
  const docks = env.docks || [];
  const berths = env.berths || [];
  const owners = ctl.berthOwner || (ctl.berthOwner = {});
  // Navigation : la règle de route (suivre, doubler, attendre à la passe du pont)
  // décide d'un facteur de vitesse AVANT que chacun avance. Sans géométrie du
  // ruban (les tests du cycle de vie), rien ne change.
  const nav = env.samples && env.samples.length > 1 ? navPrepare(ships, env) : null;
  if (nav && !env.win) env = { ...env, win: nav.win };
  // À QUI LE POSTE : à celui qui y est amarré, sinon au PLUS PROCHE de ceux qui
  // le visent. Décidé avant que chacun bouge — décidé dans la boucle, le premier
  // examiné le prenait, même arrivé second (au banc : le suiveur réservait le poste
  // et bloquait derrière lui celui qui devait y entrer).
  if (nav && berths.length) {
    for (const b of berths) {
      let who = null, wd = Infinity;
      for (const sh of ships) {
        if (sh.berthId !== b.id || sh.kind !== 'trade') continue;
        if (sh.state === 'dock') { who = sh.id; break; }
        if (sh.done) continue;
        const d = (b.t - sh.t) * sh.dir * nav.L;
        if (d > -0.5 && d < 14 && d < wd) { wd = d; who = sh.id; }
      }
      if (who == null) delete owners[b.id]; else owners[b.id] = who;
    }
  }

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

    if (sh.kind === 'ferry') {
      if (!env.ferry || !nav) { ships.splice(i, 1); continue; }
      ferryStep(sh, env.ferry, ships, step, nav);
      continue;
    }
    if (sh.kind === 'shuttle') {
      if (!env.shuttle || !nav) { ships.splice(i, 1); continue; }
      shuttleStep(sh, env.shuttle, step, nav, env.night || 0);
      continue;
    }
    if (sh.state === 'dock' || sh.state === 'anchor') {
      sh.stateT -= step;
      if (sh.stateT <= 0) {
        sh.state = 'cruise'; sh.done = true;
        // Il largue : le poste se libère, il reprend sa file.
        if (sh.berthId != null) { if (owners[sh.berthId] === sh.id) delete owners[sh.berthId]; sh.berthId = null; sh.berthTh = null; }
      }
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
    sh.waitBerth = false;
    sh._berthOwn = false;
    if (sh.kind === 'trade' && !sh.done && nav && berths.length) {
      // Le poste visé : le premier DEVANT, dans la fenêtre.
      if (sh.berthId == null) {
        let best = null, bd = Infinity;
        for (const b of berths) {
          const d = (b.t - sh.t) * sh.dir * nav.L;
          if (d > 1.5 && d < bd) { bd = d; best = b; }
        }
        if (best) { sh.berthId = best.id; sh.berthWait = 0; } else sh.done = true;
      }
      const b = berths.find((x) => x.id === sh.berthId);
      if (!b) { sh.berthId = null; sh.done = true; } else {
        const dist = (b.t - sh.t) * sh.dir * nav.L;     // reste à parcourir le long du fleuve
        const owner = owners[b.id];
        if (owner != null && owner !== sh.id && ships.some((o) => o.id === owner)) {
          // POSTE PRIS : on ralentit et on attend avant lui (il « jette l'ancre en
          // attendant sa place »), puis on renonce si ça dure.
          if (dist < 9) {
            moveF = Math.max(0, Math.min(1, (dist - 5) / 3));
            sh.waitBerth = moveF < 0.05;
            sh.berthWait = (sh.berthWait || 0) + step;
            if (sh.berthWait > FLEET_TUNE.berthPatience || dist < 0) { sh.done = true; sh.berthId = null; }
          }
        } else if (dist < 14) {
          sh._berthOwn = true;
          // Approche : on lève le pied, la voie glisse vers le poste (navSteer).
          // Plancher à 0,25 : à 0,12 les deux dernières tuiles prenaient 8 s.
          moveF = Math.max(0.25, Math.min(1, dist / 3));
          if (dist <= 0.12) {
            sh.t = b.t;
            sh.state = 'dock';
            sh.stateT = lerp(FLEET_TUNE.berthDwell[0], FLEET_TUNE.berthDwell[1], rnd01('berth:' + sh.id));
            sh.dockDwell = sh.stateT;            // pour les porteurs : temps passé à quai
            sh.berthTh = b.th;
            sh.berthLat = b.lat;
            sh._moveF = 0;
            continue;
          }
        }
      }
    } else if (sh.kind === 'trade' && !sh.done && docks.length && !(nav && berths.length)) {
      let bestD = Infinity, bestIdx = -1;
      for (let d = 0; d < docks.length; d += 1) {
        const dd = ringDist(sh.t, docks[d].t);
        if (dd < bestD) { bestD = dd; bestIdx = d; }
      }
      const p = Math.max(0, 1 - bestD / (nav ? 6 / nav.L : DOCK_RANGE));
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
      moveF = Math.max(0.12, Math.min(1, dd / (nav ? 4 / nav.L : 0.06)));
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

    // LA PATROUILLE fait demi-tour aux bouts de son tronçon (le cap et la file
    // suivent : un vrai virage, cf. navSteer) — sauf si elle a reçu congé.
    if (sh.patrol && !sh.leave) {
      if (sh.dir > 0 && sh.t > sh.patrol[1]) sh.dir = -1;
      else if (sh.dir < 0 && sh.t < sh.patrol[0]) sh.dir = 1;
    }
    // LES POMPIERS : de temps en temps, ils stoppent et arrosent (rendu : lances).
    if (sh.mode === 'fire' && !sh.leave && sh.patrol && sh.t > sh.patrol[0] && sh.t < sh.patrol[1]) {
      sh.fireNext -= step;
      if (sh.fireNext <= 0) {
        sh.fireNext = lerp(FLEET_TUNE.fireEvery[0], FLEET_TUNE.fireEvery[1], rnd01('fire:' + sh.id + ':' + Math.round(sh.t * 1e4)));
        sh.state = 'anchor';
        sh.stateT = FLEET_TUNE.fireDwell;
        continue;
      }
    }
    sh.t += sh.dir * sh.speed * moveF * (nav ? (sh._navF == null ? 1 : sh._navF) : 1) * step;
    sh._moveF = moveF;

    // Sortie de carte : il a fini son voyage. Plus de wrap — c'est tout le
    // point du module.
    if (sh.win ? (sh.t < sh.win[0] || sh.t > sh.win[1]) : (sh.t < T_LO || sh.t > T_HI)) {
      if (sh.berthId != null && owners[sh.berthId] === sh.id) delete owners[sh.berthId];
      ships.splice(i, 1);
    }
  }

  // --- 2) Naissances ----------------------------------------------------------
  // Un métier ne fait naître que s'il est sous son effectif ET si le délai
  // depuis la dernière arrivée est écoulé. Sans ce délai, un plafond de 5
  // redonnerait exactement l'ancien mur de bateaux dès la première frame.
  for (const kind of FLEET_KINDS) {
    const want = budget[kind] || 0;
    let have = 0;
    for (const sh of ships) if (sh.kind === kind) have += 1;
    if (kind === 'service' && have > want) {
      const extra = ships.filter((o) => o.kind === 'service' && !o.leave).sort((a, b) => b.svc - a.svc).slice(0, have - want);
      for (const o of extra) {
        o.leave = true;
        if (o.mode === 'work') { o.state = 'cruise'; o.stateT = 0; o.win = env.win ? [env.win[0] - 0.02, env.win[1] + 0.02] : null; }
      }
    }
    if (have >= want) {
      // Trop de monde (le port vient de perdre un niveau, ou le budget a
      // baissé) : on ne massacre personne, les surnuméraires sortiront d'eux
      // mêmes par un bord. Le pool converge sans téléportation.
      ctl.birth[kind] = Math.max(0, ctl.birth[kind] - step);
      continue;
    }
    ctl.birth[kind] -= step;
    if (ctl.birth[kind] > 0) continue;
    if (kind === 'ferry' && (!env.ferry || !nav)) continue;
    if (kind === 'shuttle' && (!env.shuttle || !nav)) continue;
    const ne = spawn(kind, ctl, env, ships);
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
    // Une naissance ne se pose pas sur un bateau déjà là (même bord, même sens) :
    // elle attend la prochaine occasion plutôt que d'apparaître DANS une coque.
    if (nav && kind !== 'ferry' && kind !== 'shuttle' && ships.some((o) => o.dir === ne.dir && !o.orbit && o.kind !== 'ferry' && Math.abs(o.t - ne.t) * nav.L < 3.5)) {
      ctl.birth[kind] = 2;
      ctl.nextId -= 1;
      continue;
    }
    ships.push(ne);
    const [gLo, gHi] = FLEET_TUNE[kind + 'Gap'];
    ctl.birth[kind] = lerp(gLo, gHi, rnd01('shipGap:' + kind + ':' + ctl.nextId));
  }

  if (nav) navSteer(ships, env, step, nav);
  return ships;
}

/* ── LA NAVIGATION (docs/PLAN-BATEAUX.md §5) ──────────────────────────────────
 * Jusqu'ici la voie transversale était calculée AU RENDU (voie tirée + louvoiement
 * + évitement), et rien ne liait deux bateaux entre eux : un marchand rapide
 * traversait un lent, deux coques se croisaient l'une dans l'autre sous le pont,
 * et le cap sautait de 45° d'un secteur de sprite à l'autre.
 *
 * Ici la voie vit dans la SIM, avec une vraie dynamique :
 *   • on tient sa DROITE (tribord) — deux sens de marche, deux files ;
 *   • on SUIT un plus lent (on ralentit à distance) et on le DOUBLE si la file
 *     d'en face est libre assez loin ;
 *   • on S'ÉCARTE vers sa droite quand un bateau vient en face sur sa file ;
 *   • la PASSE du pont est à sens unique à un instant donné : celui qui y est, ou
 *     qui en est le plus près, passe ; l'autre attend avant l'ouvrage ;
 *   • le CAP suit la vitesse réelle (le long du ruban + en travers) avec une
 *     vitesse de giration bornée : les virages deviennent progressifs.
 *
 * Unités : `t` (fraction du ruban), `lat` en tuiles (signe = normale du ruban
 * dans le sens des samples, convention du rendu), `th` = cap MONDE (rad).
 * ------------------------------------------------------------------------- */
// Marge (en t) autour de la fenêtre : on naît et on meurt un peu hors champ.
let WIN_PAD = 0;
export const NAV_TUNE = {
  // VITESSES EN TUILES PAR SECONDE (et non plus en fraction du ruban) : le ruban
  // fait aujourd'hui 590 tuiles, dont ~210 dans la carte — exprimée en t, la même
  // consigne faisait filer une corbita à 4,7 tuiles/s (120 km/h à la toise des
  // habitants). Le kit peut donner la sienne par modèle (sizeOf → speed).
  speed: { trade: [0.95, 1.45], fisher: [0.7, 1.0], shuttle: [0.85, 1.0] },
  winMargin: 18,            // tuiles de fleuve gardées de part et d'autre de la carte
  keepRight: [0.3, 0.72],   // place dans sa demi-largeur utile (tirage par bateau)
  latSpeed: 0.42,           // vitesse transversale max (tuiles/s)
  turnRate: 0.85,           // giration max (rad/s) — une barque vire deux fois plus vite
  followGap: 2.6,           // distance libre (tuiles) où l'on commence à régler sa vitesse
  minGap: 0.45,             // distance libre en dessous de laquelle on s'arrête
  overtakeLook: 7,          // la file d'en face doit être libre sur tant de tuiles
  gateZone: 1.1,            // demi-longueur de la passe du pont (tuiles), coque en sus
  gateLook: 6,              // on regarde la passe de si loin
};

// Point du ruban à la position t : même interpolation que le rendu (drawIsoShips).
export function ribbonAt(sm, t) {
  const n = sm.length;
  const fi = Math.max(0, Math.min(1, t)) * (n - 1);
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  const i1 = Math.min(n - 1, i0 + 1);
  const f = fi - i0;
  const a = sm[i0], b = sm[i1];
  let tx = b.x - a.x, ty = b.y - a.y;
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  return {
    x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
    tx, ty, nx: -ty, ny: tx,
    hw: (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * f,
  };
}
const _lenMemo = new WeakMap();
export function ribbonLength(sm) {
  let L = _lenMemo.get(sm);
  if (L == null) {
    L = 0;
    for (let i = 1; i < sm.length; i += 1) L += Math.hypot(sm[i].x - sm[i - 1].x, sm[i].y - sm[i - 1].y);
    _lenMemo.set(sm, L);
  }
  return Math.max(1, L);
}
// Un pont large publie une porte PAR cellule : on les fond en une passe.
export function mergeGates(gates, L) {
  const ts = (gates || []).map((g) => g.t).sort((a, b) => a - b);
  const out = [];
  for (const t of ts) {
    const last = out[out.length - 1];
    if (last && (t - last.t1) * L < 1.5) { last.t1 = t; last.t = (last.t0 + t) / 2; } else out.push({ t, t0: t, t1: t });
  }
  return out;
}

const DEFAULT_SIZE = { trade: { len: 1.3, beam: 0.4 }, fisher: { len: 0.8, beam: 0.3 } };
function sizeOf(env, sh) {
  const z = env.sizeOf ? env.sizeOf(sh) : null;
  return z || DEFAULT_SIZE[sh.kind] || DEFAULT_SIZE.trade;
}
const isStopped = (sh) => sh.state === 'dock' || sh.state === 'anchor' || sh.state === 'board';
// Demi-largeur UTILE du lit pour une coque : on reste à distance de la berge.
const laneRoom = (hw, beam) => Math.max(0.2, hw * 0.8 - beam * 0.5 - 0.2);
// Vitesse effective le long du ruban (tuiles/s), signée par le sens de marche.
const alongSpeed = (sh, L) => (isStopped(sh) ? 0
  : sh.speed * (sh._moveF == null ? 1 : sh._moveF) * (sh._navF == null ? 1 : sh._navF) * L);

function navPrepare(ships, env) {
  const sm = env.samples;
  const L = ribbonLength(sm);
  const gates = mergeGates(env.gates, L);
  // UN PONTON EST UNE PASSE : il avance d'une rive jusqu'à la moitié du lit, et le
  // marchand amarré à sa tête prend encore la place d'une coque. Les autres passent
  // par le chenal libre en face, un sens à la fois (même règle que sous le pont).
  // Celui qui vient s'y amarrer n'est pas concerné par la passe de SON poste.
  for (const b of env.berths || []) {
    const r = ribbonAt(sm, b.t);
    const far = -(b.side || 1) * laneRoom(r.hw, 0.5);
    const edge = b.lat - (b.side || 1) * ((b.beam || 0.5) / 2 + 0.75);
    const open = (b.side || 1) > 0 ? Math.min(edge, (edge + far) / 2) : Math.max(edge, (edge + far) / 2);
    gates.push({ t: b.t, t0: b.t, t1: b.t, lat: open, berth: b.id, zone: 1.7 });
  }
  const win = env.win || navWindow(sm, env.bounds);
  WIN_PAD = 2 / L;
  const live = ships.filter((sh) => !sh.orbit);
  // LE BAC EN TRAVERSÉE barre le fleuve : c'est une passe que personne d'autre ne
  // franchit tant qu'il y est (même règle d'attente que sous le pont).
  const ferryX = ships.find((sh) => sh.kind === 'ferry' && sh.state === 'cross');
  if (ferryX) gates.push({ t: ferryX.t, t0: ferryX.t, t1: ferryX.t, lat: 0, ferry: true, zone: 1.4 });
  // LA NAVETTE DES PLAISIRS. À son ponton de la ville (à quai, ou qui y vient), elle
  // tient le bord comme un marchand à son poste : une passe, le chenal libre en face.
  // À la Maison, amarrée au pied de l'escalier, elle prolonge l'obstacle du lieu :
  // les autres la contournent au large au lieu de faire la queue derrière elle.
  let obstacles = env.obstacles || [];
  const sx = env.shuttle ? ships.find((sh) => sh.kind === 'shuttle') : null;
  if (sx) {
    const C = env.shuttle.city, side = C.side || 1;
    const near = (to) => sx.state !== 'dock' && sx.dest === to && Math.abs(((to === 'city' ? C : env.shuttle.maison).t - sx.t) * L) < 12;
    if ((sx.state === 'dock' && sx.at === 'city') || near('city')) {
      const r = ribbonAt(sm, C.t);
      const far = -side * laneRoom(r.hw, 0.5);
      const edge = C.lat - side * ((sx._beam || 0.4) / 2 + 0.75);
      const open = side > 0 ? Math.min(edge, (edge + far) / 2) : Math.max(edge, (edge + far) / 2);
      gates.push({ t: C.t, t0: C.t, t1: C.t, lat: open, shuttle: true, zone: 1.7 });
    }
    if (sx.state === 'dock' && sx.at === 'maison') {
      obstacles = [...obstacles, { t: sx.t, lat: sx.lat, r: (sx._beam || 0.4) / 2 + 0.2, id: 'navette' }];
    }
  }
  for (const sh of live) {
    const z = sizeOf(env, sh);
    sh._len = z.len; sh._beam = z.beam;
    if (sh.kind === 'ferry') continue;
    if (sh._vTiles == null) {
      const [lo, hi] = z.speed || NAV_TUNE.speed[sh.kind] || NAV_TUNE.speed.trade;
      sh._vTiles = lo + (hi - lo) * rnd01('navSpeed:' + sh.id);
    }
    sh.speed = sh._vTiles / L;
    if (!sh.win && !sh.orbit) sh.win = [win[0] - 2 * WIN_PAD, win[1] + 2 * WIN_PAD];
    if (sh.lat == null) {
      // Premier pas : il naît DÉJÀ sur sa file (pas d'embardée à l'apparition).
      const r = ribbonAt(sm, sh.t);
      sh.lat = navLaneGoal(sh, laneRoom(r.hw, sh._beam));
      sh.latV = 0;
      sh.th = Math.atan2(sh.dir * r.ty, sh.dir * r.tx);
    }
  }
  for (const A of live) {
    A._navF = 1;
    if (isStopped(A) || A.kind === 'ferry') continue;
    const vA = A.speed * L;
    let f = 1;
    let leader = null, leaderGap = Infinity;
    for (const B of live) {
      if (B === A) continue;
      if (B.kind === 'ferry' && B.state === 'cross') continue;   // c'est une passe, pas une file
      const dAB = (B.t - A.t) * A.dir * L;            // > 0 : B est devant A
      if (dAB <= 0) continue;
      const gap = dAB - (A._len + B._len) / 2;
      if (gap > NAV_TUNE.overtakeLook + 4) continue;
      const overlap = Math.abs(A.lat - B.lat) < (A._beam + B._beam) / 2 + 0.3;
      if (!overlap) continue;
      if ((B.dir === A.dir && !isStopped(B)) || isStopped(B)) {
        if (gap < leaderGap) { leaderGap = gap; leader = B; }
      } else if (gap < 1.2) {
        // En face et sur la même file : on lève le pied le temps de s'écarter.
        f = Math.min(f, Math.max(0.25, gap / 1.2));
      }
    }
    // SUIVRE : on se cale sur la vitesse de celui qui est devant.
    if (leader && leaderGap < NAV_TUNE.followGap) {
      const cap = vA > 0 ? Math.min(1, alongSpeed(leader, L) / vA) : 1;
      const k = Math.max(0, Math.min(1, (leaderGap - NAV_TUNE.minGap) / (NAV_TUNE.followGap - NAV_TUNE.minGap)));
      f = Math.min(f, leaderGap <= NAV_TUNE.minGap ? 0 : cap + (1 - cap) * k);
    }
    // DOUBLER : plus lent devant (ou à l'arrêt), file d'en face libre loin devant,
    // et pas de passe de pont à franchir pendant la manœuvre.
    const slower = leader && (isStopped(leader) || leader.speed < A.speed * 0.88);
    if (A.overtake != null) {
      const B = live.find((o) => o.id === A.overtake);
      if (!B || (B.t - A.t) * A.dir * L < -(A._len + B._len) / 2 - 0.6) A.overtake = null;
    } else if (slower && leaderGap < NAV_TUNE.followGap + 1.5) {
      const room = NAV_TUNE.overtakeLook + leaderGap + leader._len;
      const blocked = live.some((O) => O !== A && O.dir !== A.dir && !isStopped(O)
        && (O.t - A.t) * A.dir * L > 0 && (O.t - A.t) * A.dir * L < room + 4);
      // Marge LARGE avant une passe : au banc, un dépassement décidé à 13 tuiles du
      // pont (pour une manœuvre de 12,9) finissait arrêté dans la file d'en face.
      const nearGate = gates.some((g) => { const d = (g.t - A.t) * A.dir * L; return d > -2 && d < room + 8; });
      // On ne double pas non plus quelqu'un qui fait la queue à la passe : on s'y range.
      if (!blocked && !nearGate && !leader._gateWait) A.overtake = leader.id;
    }
    // LA PASSE DU PONT : à sens unique. Prioritaire : celui qui y est, sinon le plus
    // près ; à égalité, le plus ancien. L'autre s'arrête avant l'ouvrage.
    A._gateWait = 0;
    for (const g of gates) {
      if (g.berth && A.berthId === g.berth) continue;
      if (g.shuttle && A.kind === 'shuttle') continue;   // son propre ponton
      const zone = g.zone || NAV_TUNE.gateZone + ((g.t1 - g.t0) * L) / 2;
      const dA = (g.t - A.t) * A.dir * L;              // distance du centre de la passe, devant
      const myEntry = dA - zone - A._len / 2;           // distance avant d'y entrer
      if (myEntry < -0.05 || myEntry > NAV_TUNE.gateLook) continue;
      let wait = !!g.ferry;                          // le bac traverse : on attend
      for (const O of wait ? [] : live) {
        if (O === A || O.dir === A.dir) continue;
        if (g.berth && O.berthId === g.berth) continue;   // il entre à quai, il ne traverse pas
        const dO = (g.t - O.t) * O.dir * L;
        const oEntry = dO - zone - O._len / 2;
        const inside = Math.abs(dO) < zone + O._len / 2;
        const first = oEntry < myEntry - 0.3 || (Math.abs(oEntry - myEntry) <= 0.3 && O.id < A.id);
        if (inside || (dO > 0 && oEntry < NAV_TUNE.gateLook && first)) { wait = true; break; }
      }
      if (wait) {
        A._gateWait = 1;
        A.overtake = null;                     // on attend à SA place, sur sa droite
        f = Math.min(f, Math.max(0, Math.min(1, (myEntry - 0.6) / 2.2)));
      }
    }
    A._navF = f;
  }
  return { L, gates, win, samples: sm, obstacles };
}

// FENÊTRE de navigation : la portion du ruban qui traverse la carte (bornes du
// layout, cf. env.bounds), plus une marge. Hors d'elle, un bateau n'est vu de
// personne : il y naissait 200 tuiles avant d'atteindre la ville, ce qui vidait
// le fleuve. Sans bornes connues : tout le ruban.
export function navWindow(sm, bounds) {
  if (!bounds) return [0, 1];
  const m = NAV_TUNE.winMargin;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < sm.length; i += 1) {
    const p = sm[i];
    if (p.x < bounds.x0 - m || p.x > bounds.x1 + m || p.y < bounds.y0 - m || p.y > bounds.y1 + m) continue;
    if (i0 < 0) i0 = i;
    i1 = i;
  }
  if (i0 < 0) return [0, 1];
  const n = Math.max(1, sm.length - 1);
  return [i0 / n, i1 / n];
}

// File visée par un bateau en route : sa droite, à sa place.
function navLaneGoal(sh, room) {
  const k = NAV_TUNE.keepRight[0] + (NAV_TUNE.keepRight[1] - NAV_TUNE.keepRight[0]) * Math.min(1, Math.abs(sh.lane || 0) / 0.8);
  // Le pêcheur ne suit pas la règle de route : il longe la berge de son choix.
  if (sh.kind === 'fisher') return (sh.lane >= 0 ? 1 : -1) * 0.82 * room;
  if (sh.kind === 'shuttle') return (sh.side || 1) * 0.8 * room;
  // Le chaland tient sa droite comme les autres : depuis la fin du halage (Raph,
  // 2026-10-03), il ne longe plus une rive — collé au quai, il traversait les escaliers.
  // La drague travaille près de sa rive.
  if (sh.mode === 'work') return (sh.workSide || 1) * 0.7 * room;
  return sh.dir * k * room;
}

function navSteer(ships, env, step, nav) {
  const sm = env.samples;
  const L = nav.L;
  const live = ships.filter((sh) => !sh.orbit);
  for (const A of live) {
    if (A.kind === 'ferry') continue;
    if (A._len == null) {
      // Né pendant ce pas : il n'a pas encore été préparé.
      const z = sizeOf(env, A);
      A._len = z.len; A._beam = z.beam;
    }
    const r = ribbonAt(sm, A.t);
    const room = laneRoom(r.hw, A._beam);
    if (A.lat == null) {
      A.lat = navLaneGoal(A, room); A.latV = 0;
      A.th = Math.atan2(A.dir * r.ty, A.dir * r.tx);
    }
    let goal;
    if (isStopped(A)) {
      goal = A.state === 'dock' && A.berthLat != null ? A.berthLat : A.lat;   // à quai : SA place
    } else {
      goal = navLaneGoal(A, room);
      if (A.overtake != null) goal = A.dir * -0.12 * room;
      // Approche d'un poste : la voie glisse vers lui sur les dix dernières tuiles
      // (hors de la demi-largeur « de route » : le poste est au bord).
      const B = A.berthId != null && env.berths ? env.berths.find((x) => x.id === A.berthId) : null;
      if (B && A._berthOwn) {
        const dist = (B.t - A.t) * A.dir * L;
        const p = Math.max(0, Math.min(1, 1 - (dist - 1) / 9));
        if (dist > -1 && p > 0) { A._berthApproach = p; }
        else A._berthApproach = 0;
      } else A._berthApproach = 0;
      // Escale : il serre la berge du port en approchant.
      if (A.kind === 'trade' && !A.done && env.docks && env.docks.length) {
        for (const d of env.docks) {
          let dd = Math.abs(A.t - d.t); if (dd > 0.5) dd = 1 - dd;
          const p = Math.max(0, 1 - (dd * L) / 6);
          if (p > 0) goal += ((d.side || 1) * room - goal) * p * p * (3 - 2 * p);
        }
      }
      // Quelqu'un en face sur ma file : je serre ma droite.
      for (const B of live) {
        if (B === A || B.dir === A.dir || isStopped(B)) continue;
        const dAB = (B.t - A.t) * A.dir * L;
        if (dAB <= 0 || dAB > 6) continue;
        const need = (A._beam + B._beam) / 2 + 0.45;
        if (Math.abs(goal - B.lat) < need) goal = B.lat + A.dir * need;
      }
      // LA PASSE : celui qui a la main se présente au milieu ; celui qui attend
      // serre sa droite, pour laisser sortir l'autre (sinon il l'attendait PILE
      // dans l'axe de sa sortie — vu au banc : les coques se traversaient).
      for (const g of nav.gates) {
        if (g.berth && A.berthId === g.berth) continue;
        const zone = g.zone || NAV_TUNE.gateZone + ((g.t1 - g.t0) * L) / 2;
        const dA = (g.t - A.t) * A.dir * L;
        const entry = dA - zone - A._len / 2;
        // On se présente au chenal de LOIN (8 tuiles) : à 5, une coque partie de
        // l'autre bord n'avait pas le temps de traverser le lit avant la passe.
        if (dA < -zone - A._len / 2 || entry > 8) continue;
        if (A._gateWait) { goal = A.dir * 0.75 * room; continue; }
        const p = Math.max(0, Math.min(1, 1 - entry / 8));
        goal += ((g.lat || 0) - goal) * p * p * (3 - 2 * p);
      }
      // Obstacles plantés dans l'eau (île, Aiguille) ; les passes sont traitées ci-dessus.
      // La navette qui accoste la Maison ne la contourne plus : elle y va.
      const toStop = A.kind === 'shuttle' && A._stop ? A._stopApproach || 0 : 0;
      if (env.dodge && !(toStop > 0 && A.dest === 'maison')) goal = env.dodge(goal, A.t, A._len, r.hw, nav.obstacles || env.obstacles || [], [], A);
      goal = Math.max(-room, Math.min(room, goal));
      if (A._berthApproach > 0 && A.kind !== 'shuttle') {
        const Bx = env.berths.find((x) => x.id === A.berthId);
        const p = A._berthApproach;
        goal += (Bx.lat - goal) * p * p * (3 - 2 * p);
      }
      if (toStop > 0) {
        goal += (A._stop.lat - goal) * toStop * toStop * (3 - 2 * toStop);
        A._berthApproach = toStop;                   // le rendu la trie avec son ponton
      }
    }
    // Dynamique transversale amortie : la coque glisse vers sa file, sans à-coup.
    const want = Math.max(-NAV_TUNE.latSpeed, Math.min(NAV_TUNE.latSpeed, (goal - A.lat) * 0.9));
    A.latV += (want - A.latV) * Math.min(1, step * 2.5);
    A.lat += A.latV * step;
    // Cap : la vitesse réelle (le long + en travers), giration bornée.
    const vAl = A.dir * alongSpeed(A, L);
    const vx = r.tx * vAl + r.nx * A.latV, vy = r.ty * vAl + r.ny * A.latV;
    // À quai : le cap s'aligne sur le poste (dans le sens le plus proche du sien).
    if (A.state === 'dock' && A.berthTh != null) {
      const a1 = A.berthTh, a2 = A.berthTh + Math.PI;
      const d1 = Math.abs(Math.atan2(Math.sin(a1 - A.th), Math.cos(a1 - A.th)));
      const d2 = Math.abs(Math.atan2(Math.sin(a2 - A.th), Math.cos(a2 - A.th)));
      const target = d1 <= d2 ? a1 : a2;
      const d = Math.atan2(Math.sin(target - A.th), Math.cos(target - A.th));
      A.th += Math.max(-0.5 * step, Math.min(0.5 * step, d));
    } else if (Math.hypot(vx, vy) > 0.015) {
      const target = Math.atan2(vy, vx);
      const d = Math.atan2(Math.sin(target - A.th), Math.cos(target - A.th));
      const rate = NAV_TUNE.turnRate * (A._len < 1 ? 2 : 1);
      A.th += Math.max(-rate * step, Math.min(rate * step, d));
    }
  }
  // Petite vie : deux bateaux qui se croisent de près se saluent (une fois).
  for (const A of live) {
    if (A.salute > 0) A.salute = Math.max(0, A.salute - step);
  }
  for (const A of live) {
    for (const B of live) {
      if (B.id <= A.id || B.dir === A.dir || isStopped(A) || isStopped(B)) continue;
      if (Math.abs(B.t - A.t) * L > 1.4 || Math.abs(A.lat - B.lat) > 2.6) continue;
      A._saluted = A._saluted || {};
      if (A._saluted[B.id]) continue;
      A._saluted[B.id] = 1;
      A.salute = 2.4; B.salute = 2.4;
    }
  }
}

/* ── LE PASSEUR (docs/PLAN-BATEAUX.md §5) ─────────────────────────────────────
 * Un bac fait la navette entre deux embarcadères, en un point du fleuve choisi
 * loin du pont et du port (env.ferry = { t, hw }). Il ATTEND ses voyageurs à quai,
 * ne part que si aucun bateau n'arrive à moins de ferryClear tuiles, traverse en
 * travers du courant, et pendant ce temps barre le fleuve (une passe, cf.
 * navPrepare). À chaque traversée, d'autres voyageurs (`trip` change la graine).
 *
 * OÙ IL S'ARRÊTE (retour Raph, 2026-10-03 : « qu'il ne rentre pas dans le quai, il
 * s'arrête avant »). Il aborde la rive DE FACE, cap perpendiculaire au courant :
 * c'est sa DEMI-LONGUEUR qui va vers la berge, pas sa demi-largeur (on comptait la
 * largeur — le bout du bac montait sur le tablier et sur le quai). Et il touche
 * l'eau qu'on VOIT : `site.reach[side]` = distance du bord du ruban au point où sa
 * coque s'arrête — le bout du tablier de l'embarcadère, ou plus loin le pied du mur
 * de quai quand on voit sa face (quayHiddenDepth).
 * ------------------------------------------------------------------------- */
// Le tablier de l'embarcadère s'avance de 10 px d'art dans l'eau (boatFamilies.makeLanding).
export const FERRY_TIP = 10 / 32;
const FERRY_GAP = 1 / 32;                      // un pixel d'eau entre la coque et le tablier
export function ferryReach(site, side) {
  const r = site.reach && site.reach[side > 0 ? 1 : 0];
  return r != null && r > FERRY_TIP ? r : FERRY_TIP;
}
export function ferryLat(site, side, len = 0.95) {
  return side * Math.max(0.3, (site.hw || 2) - ferryReach(site, side) - FERRY_GAP - len / 2);
}
// L'EAU CACHÉE PAR LE MUR DE QUAI, en tuiles depuis le bord du ruban. Le mur est
// une face verticale de `wallT` tuiles pendue SOUS le bord (isoQuay) : sur la rive
// dont on voit la face — l'eau est devant elle, plus bas à l'écran —, elle recouvre
// une bande d'eau, et ce qui s'y pose semble collé au mur. Projection du jeu
// (projection.js, ISO_X = 1, ISO_Y = 0,5) : un pas d'une tuile vers le large descend
// de 1 / |tx − ty| sous la ligne du bord, d'où cette profondeur. Pur.
export function quayHiddenDepth(sm, t, side, wallT) {
  if (!(wallT > 0) || !sm || sm.length < 2) return 0;
  const r = ribbonAt(sm, t);
  const k = -side * (r.tx - r.ty);             // > 0 : on voit la face du mur
  return k > 0 ? wallT * k : 0;
}
function ferryStep(sh, site, ships, step, nav) {
  sh.t = site.t;
  sh._len = sh._len || 0.95; sh._beam = sh._beam || 0.47;
  if (sh.lat == null) { sh.lat = ferryLat(site, sh.ferrySide, sh._len); sh.latV = 0; }
  const r = ribbonAt(nav.samples || [], site.t);
  if (sh.th == null) sh.th = Math.atan2(r.ny * -sh.ferrySide, r.nx * -sh.ferrySide);
  if (sh.state === 'board') {
    sh.stateT -= step;
    sh.lat = ferryLat(site, sh.ferrySide, sh._len);
    if (sh.stateT > 0) return;
    const busy = ships.some((o) => o !== sh && o.kind !== 'ferry' && !o.orbit
      && Math.abs((o.t - site.t) * nav.L) < FLEET_TUNE.ferryClear);
    if (busy) return;                          // un bateau arrive : il attend encore
    sh.state = 'cross';
    sh.ferrySide = -sh.ferrySide;              // vers l'autre rive
    return;
  }
  // Traversée : on accélère au départ, on ralentit à l'approche (pas d'à-coup).
  const target = ferryLat(site, sh.ferrySide, sh._len);
  const d = target - sh.lat;
  const v = Math.sign(d) * Math.min(FLEET_TUNE.ferryCross, Math.abs(d) * 0.9 + 0.04);
  sh.latV += (v - sh.latV) * Math.min(1, step * 2);
  sh.lat += sh.latV * step;
  // Le cap montre la rive visée (perpendiculaire au courant).
  const th = Math.atan2(r.ny * Math.sign(d || 1), r.nx * Math.sign(d || 1));
  const dth = Math.atan2(Math.sin(th - sh.th), Math.cos(th - sh.th));
  sh.th += Math.max(-1.2 * step, Math.min(1.2 * step, dth));
  if (Math.abs(d) < 0.03) {
    sh.lat = target; sh.latV = 0;
    sh.state = 'board';
    sh.stateT = lerp(FLEET_TUNE.ferryBoard[0], FLEET_TUNE.ferryBoard[1], rnd01('ferryBoard:' + sh.id + ':' + sh.trip));
    sh.trip = (sh.trip || 0) + 1;
  }
}

/* ── LA NAVETTE DES PLAISIRS ──────────────────────────────────────────────────
 * Un bateau-lanterne fait l'aller-retour entre son ponton en ville
 * (env.shuttle.city) et l'embarcadère de la Maison des Plaisirs (env.shuttle.maison,
 * au pied de son escalier, face au sud). Arrêts = { t, lat, th } ; elle y est « à
 * quai » (state 'dock', `at` = 'city' | 'maison'), sinon en route vers `dest`.
 * Elle navigue comme les autres (file, suivre, passes, cap : navPrepare/navSteer) ;
 * ce pas-ci ne fait qu'avancer le long du fleuve et décider des escales.
 * SURTOUT LA NUIT : l'attente au ponton de la ville s'écoule `shuttleNight` fois
 * plus vite en pleine nuit — une attente commencée en plein jour se raccourcit donc
 * d'elle-même quand le soir tombe.
 * ------------------------------------------------------------------------- */
function shuttleStep(sh, site, step, nav, night) {
  if (sh.state === 'dock') {
    sh.side = Math.sign(sh.berthLat) || 1;
    const n = Math.max(0, Math.min(1, night));
    sh.stateT -= step * (sh.at === 'city' ? 1 + (FLEET_TUNE.shuttleNight - 1) * n : 1);
    sh._moveF = 0;
    if (sh.stateT > 0) return;
    sh.dest = sh.at === 'city' ? 'maison' : 'city';
    sh.at = null;
    const to = sh.dest === 'city' ? site.city : site.maison;
    sh.dir = to.t >= sh.t ? 1 : -1;
    sh.state = 'cruise';
    // En quittant la Maison, elle la contourne par SON bord (celui de l'escalier) :
    // l'évitement choisirait sinon le bord de sa file — à travers le bâtiment.
    if (sh.dest === 'city') sh._dodgeSide = { plaisirs: Math.sign(site.maison.lat) || 1 };
    return;
  }
  const to = sh.dest === 'city' ? site.city : site.maison;
  sh._stop = to;
  // Elle serre la rive de l'arrêt qu'elle VISE : son ponton peut être sur l'autre rive
  // que l'escalier de la Maison (celle dont on voit le mur), elle traverse en route.
  sh.side = Math.sign(to.lat) || 1;
  const dist = (to.t - sh.t) * sh.dir * nav.L;     // reste à parcourir le long du fleuve
  sh._stopApproach = Math.max(0, Math.min(1, 1 - (dist - 1) / 9));
  const moveF = dist < 14 ? Math.max(0.25, Math.min(1, dist / 3)) : 1;
  if (dist <= 0.12) {
    sh.t = to.t;
    sh.state = 'dock';
    sh.at = sh.dest;
    sh._moveF = 0; sh._stopApproach = 0; sh._berthApproach = 0;
    sh.berthLat = to.lat; sh.berthTh = to.th;
    if (sh.at === 'city') sh.trip = (sh.trip || 0) + 1;      // d'autres passagers
    const span = sh.at === 'maison' ? FLEET_TUNE.shuttleMoor : FLEET_TUNE.shuttleBoard;
    sh.stateT = lerp(span[0], span[1], rnd01('shuttle:' + sh.id + ':' + sh.trip + ':' + sh.at));
    return;
  }
  sh.t += sh.dir * sh.speed * moveF * (sh._navF == null ? 1 : sh._navF) * step;
  sh._moveF = moveF;
}

// LE PONTON DE LA NAVETTE : en ville, entre le cœur et la Maison (elle ne passe donc
// jamais sous le pont), à l'écart des passes, des postes et des obstacles, à mi-
// chemin de préférence — assez loin du cœur pour laisser le quai aux marchands,
// assez près pour être EN ville. Pur ; `avoid` = positions t à fuir.
export function shuttleSite(sm, win, avoid, centerT, maisonT) {
  if (!sm || sm.length < 2 || !win || centerT == null || maisonT == null) return null;
  const L = ribbonLength(sm);
  let best = null, bs = Infinity;
  for (let k = 0; k <= 40; k += 1) {
    const f = 0.15 + 0.65 * (k / 40);
    const t = centerT + (maisonT - centerT) * f;
    if (t < win[0] || t > win[1]) continue;
    if (Math.abs(maisonT - t) * L < 18) continue;            // pas au pied de la Maison
    let dmin = Infinity;
    for (const a of avoid || []) dmin = Math.min(dmin, Math.abs(t - a) * L);
    if (dmin < 12) continue;                                 // ni pont, ni poste, ni bac
    const score = Math.abs(f - 0.45);
    if (score < bs) { bs = score; best = t; }
  }
  if (best == null) return null;
  return { t: best, hw: ribbonAt(sm, best).hw };
}

// LE SITE DU PASSEUR : dans la fenêtre, le plus loin possible des passes (pont,
// pontons) et des obstacles, sans trop s'éloigner du cœur de la ville (on le voit).
// Pur ; `avoid` = positions t à fuir, `center` = t le plus proche du centre-ville.
export function ferrySite(sm, win, avoid, center) {
  if (!sm || sm.length < 2 || !win) return null;
  const L = ribbonLength(sm);
  let best = null, bs = -Infinity;
  for (let k = 0; k <= 60; k += 1) {
    const t = win[0] + (win[1] - win[0]) * (0.12 + 0.76 * (k / 60));
    let dmin = Infinity;
    for (const a of avoid || []) dmin = Math.min(dmin, Math.abs(t - a) * L);
    if (dmin < 16) continue;                   // trop près d'un pont ou d'un port
    const dc = center == null ? 0 : Math.abs(t - center) * L;
    const score = Math.min(dmin, 40) - dc * 0.6;
    if (score > bs) { bs = score; best = t; }
  }
  if (best == null) return null;
  return { t: best, hw: ribbonAt(sm, best).hw };
}
