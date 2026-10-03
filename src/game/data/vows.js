// LE VŒU DU CYCLE (D2, refondu « pactes de cycle » 2026-10). À chaque nouveau
// cycle, la cité peut prêter UN vœu parmi trois tirés au hasard. Tenu, il majore
// la moisson de Ruines de la chute ; ROMPU ou MANQUÉ, il la réduit (VOW_FAIL_MULT)
// — sans ce coût, on prenait toujours le plus gros. Ne rien prêter ne coûte rien.
// Modèle déclaratif calqué sur GRAND_RESET_MILESTONES : chaque vœu porte ses
// propres fonctions de mesure, et rien n'est câblé en dur ailleurs.
//
// Trois sortes de vœux (kind) :
//   goal   : un objectif à atteindre (an, crises, ères, rite) — tenu dès qu'il
//            est atteint, manqué s'il ne l'est pas à la chute ;
//   never  : une contrainte « aucun X » — tenu tant qu'on ne fait pas X, ROMPU
//            au premier X (forbids ; cf. breakCycleVow, appelé par crisis.js) ;
//   before : « tomber avant l'an N » — rompu dès que l'an N est dépassé.
// family : sert au tirage (une famille par vœu proposé, pour la variété).
//
// Les objectifs sont ancrés sur des signaux PROPRES au cycle et qui passent
// l'échelle à tout moment de la partie : l'âge en années-cycle (cycleYear, = les
// minutes tenues), les crises traitées / dont on a profité, l'ère atteinte
// RELATIVE à l'ère de départ du cycle, le rite de la chute. Aucun seuil absolu de
// population ou de ruines (ils exploseraient d'ordre de grandeur en fin de partie).
import { cycleYear } from '../core/actions/utils.js';
import { currentEraIndex } from '../core/mechanics/shared.js';
import { VOW_FAIL_MULT } from '../core/balance.js';
import { eras } from './world.js';

//   roll(state)      -> { target, base } figés au TIRAGE (l'ère de départ, p.ex.)
//   available(state) -> le vœu peut-il encore être proposé (une ère hors d'atteinte
//                       ne l'est pas) ?
//   cur(state)       -> valeur d'avancement courante, comparée à target (goal)
//   describe(target) -> texte de l'objectif, avec le nombre
const timeVow = (id, years, ruinMult, name) => ({
  id, kind: 'goal', family: 'time', ruinMult, name,
  roll: () => ({ target: years, base: 0 }),
  available: () => true,
  cur: () => cycleYear(),
  describe: (t) => ({ fr: `Mener la cité jusqu'à l'an ${t}`, en: `Lead the city to year ${t}` }),
  short: (t) => ({ fr: `An ${t}`, en: `Yr ${t}` }),
});

const beforeVow = (id, years, ruinMult, name) => ({
  id, kind: 'before', family: 'time', ruinMult, name,
  roll: () => ({ target: years, base: 0 }),
  available: () => true,
  cur: () => cycleYear(),
  describe: (t) => ({ fr: `Tomber avant l'an ${t}`, en: `Fall before year ${t}` }),
  short: (t) => ({ fr: `< an ${t}`, en: `< yr ${t}` }),
});

// count ≤ 3 : il n'existe que 3 paliers (CRISIS_EVENTS, latchés une fois par
// cycle) — test-garde dans vows.test.js.
const crisisVow = (id, counter, count, ruinMult, name, verb) => ({
  id, kind: 'goal', family: 'crisis', ruinMult, name,
  roll: () => ({ target: count, base: 0 }),
  available: () => true,
  cur: (state) => state[counter] || 0,
  describe: (t) => verb.describe(t),
  short: (t) => verb.short(t),
});

const neverVow = (id, forbids, ruinMult, name, describe, short) => ({
  id, kind: 'never', family: 'gov', forbids, ruinMult, name,
  roll: () => ({ target: 0, base: 0 }),
  available: () => true,
  cur: () => 0,
  describe: () => describe,
  short: () => short,
});

// Ères : viser l'ère de la CITÉ PRÉCÉDENTE (prevCycle.peakEra ; record d'ère au
// tout premier cycle) — l'égaler (beyond = 0) ou la battre (beyond = 1). Avant :
// « gravir N ères » depuis l'ère de départ du cycle, tenu à 100 % puisque chaque
// cycle repart des premières ères (+36 % gratuits) ; le record absolu, lui, était
// fixé par les longs premiers cycles et presque jamais ré-atteint (~10 %, banc).
const eraName = (index) => eras[index]?.name || "";
const previousEra = (state) => (state.prevCycle ? state.prevCycle.peakEra || 0 : state.bestEraIndex || 0);
const recordTarget = (state, beyond) => Math.max(currentEraIndex() + 1, previousEra(state) + beyond);
const eraVow = (id, beyond, ruinMult, name, describe, short) => ({
  id, kind: 'goal', family: 'era', ruinMult, name,
  roll: (state) => ({ base: currentEraIndex(), target: recordTarget(state, beyond) }),
  available: (state) => recordTarget(state, beyond) <= eras.length - 1,
  cur: () => currentEraIndex(),
  describe: (t) => describe(eraName(t)),
  short: () => short,
});

// Récompenses (bench-crises.js --vow, 24 h, 6 graines) fixées d'après DEUX
// mesures fiables : le taux de tenue (joueur lucide : an 60 31 %, an 180 10 %,
// égaler la cité précédente 77 %, la battre 27 %, rite Total 20 % sans épargne),
// et le coût de la contrainte quand on la
// respecte sans vœu (traiter toujours −5 %, sans réforme −11 %, profiter toujours
// −53 % vs jeu libre). Le total d'une carrière, lui, ne mesure pas finement un
// multiplicateur de Ruines : moins de Ruines ralentit la croissance, ce qui
// profite au joueur glouton du banc. Suivre un vœu doit valoir un peu plus que
// jouer librement, sans être gratuit.
export const CYCLE_VOWS = [
  // Durée — « an » = minute de cycle (+1).
  timeVow('veille', 60, 1.15, { fr: 'La veille', en: 'The watch' }),
  timeVow('grand_age', 180, 1.35, { fr: 'Le grand âge', en: 'The great age' }),
  beforeVow('feu_court', 15, 1.3, { fr: 'Le feu court', en: 'The short fire' }),
  // Crises — les 3 du cycle.
  crisisVow('fermete', 'cycleCrisesResolved', 3, 1.15, { fr: 'La fermeté', en: 'Resolve' }, {
    describe: (t) => ({ fr: `Traiter les ${t} crises du cycle`, en: `Treat the cycle's ${t} crises` }),
    short: (t) => ({ fr: `${t} traitées`, en: `${t} treated` }),
  }),
  // 2 sur 3 : profiter de TOUTES coûte −53 % (banc), aucun bonus ne compense.
  crisisVow('audace', 'cycleCrisesProfited', 2, 1.25, { fr: "L'audace", en: 'Daring' }, {
    describe: (t) => ({ fr: `Profiter de ${t} crises du cycle`, en: `Profit from ${t} of the cycle's crises` }),
    short: (t) => ({ fr: `${t} profits`, en: `${t} profits` }),
  }),
  // Gouvernance — contraintes « aucun X ».
  neverVow('sans_politique', ['policy'], 1.12, { fr: 'Le laisser-faire', en: 'Laissez-faire' },
    { fr: 'Aucune politique permanente', en: 'No permanent policy' },
    { fr: '0 politique', en: '0 policy' }),
  neverVow('sans_reforme', ['reform'], 1.2, { fr: 'La tradition', en: 'Tradition' },
    { fr: 'Aucune réforme de fond', en: 'No deep reform' },
    { fr: '0 réforme', en: '0 reform' }),
  // Ères — par rapport au record d'ère.
  eraVow('record', 0, 1.1, { fr: 'La mémoire des pères', en: "The fathers' memory" },
    (name) => ({ fr: `Égaler la cité précédente : l'ère « ${name} »`, en: `Match the previous city: the era "${name}"` }),
    { fr: 'Égaler', en: 'Match' }),
  eraVow('depassement', 1, 1.35, { fr: 'Le dépassement', en: 'Surpassing' },
    (name) => ({ fr: `Battre la cité précédente : atteindre l'ère « ${name} »`, en: `Beat the previous city: reach the era "${name}"` }),
    { fr: 'Dépasser', en: 'Surpass' }),
  // Rite de la chute — le Total demande d'avoir épargné.
  {
    id: 'grand_rite', kind: 'goal', family: 'rite', ruinMult: 1.25,
    name: { fr: 'Le grand rite', en: 'The great rite' },
    roll: () => ({ target: 3, base: 0 }),
    available: () => true,
    // Palier du rite accompli (0..2) + 1 ; -1 (aucun rite) → 0.
    cur: (state) => (state.terminalPreparations?.riteTier ?? -1) + 1,
    describe: () => ({ fr: 'Accomplir un rite Total avant de tomber', en: 'Perform a Total rite before falling' }),
    short: () => ({ fr: 'Rite Total', en: 'Total rite' }),
  },
];

const VOW_BY_ID = Object.fromEntries(CYCLE_VOWS.map((v) => [v.id, v]));
export const vowById = (id) => VOW_BY_ID[id] || null;

// Tire jusqu'à 3 vœux DISPONIBLES et de familles variées quand c'est possible.
// Chaque entrée fige son { target, base } au tirage (une ère de départ, p.ex.).
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

function pickOffered(state) {
  const pool = CYCLE_VOWS.filter((v) => v.available(state));
  const offered = [];
  const take = (v) => { const { target, base } = v.roll(state); offered.push({ id: v.id, target, base }); };
  const has = (v) => offered.some((o) => o.id === v.id);
  // 1re passe : UN par famille (variété), familles dans un ordre aléatoire.
  for (const family of shuffle([...new Set(pool.map((v) => v.family))])) {
    if (offered.length >= 3) break;
    const bag = shuffle(pool.filter((v) => v.family === family && !has(v)));
    if (bag.length) take(bag[0]);
  }
  // 2e passe : compléter à 3 avec n'importe quel vœu restant.
  for (const v of shuffle(pool.filter((v) => !has(v)))) {
    if (offered.length >= 3) break;
    take(v);
  }
  return offered;
}

// Pose (ou reconduit) le vœu du cycle. reconduct = chute automatique pendant une
// absence : on garde le vœu déjà choisi, comme la « dernière volonté » des
// épitaphes, plutôt que d'en proposer un que personne ne verra (main.js:257,
// aucun dialogue ne peut s'ouvrir hors ligne).
export function rollCycleVow(state, { reconduct = false } = {}) {
  const prev = state.cycleVow;
  if (reconduct && prev && prev.chosen && vowById(prev.chosen.id)) {
    const def = vowById(prev.chosen.id);
    const { target, base } = def.roll(state);
    return { offered: [{ id: def.id, target, base }], chosen: { id: def.id, target, base }, done: false, broken: false };
  }
  const offered = pickOffered(state);
  return { offered, chosen: null, done: false, broken: false };
}

// État lisible du vœu choisi (affichage, latch au tick, moisson). null si aucun
// vœu n'est prêté. `kept` = le vœu serait TENU si la cité tombait maintenant.
export function cycleVowStatus(state) {
  const cv = state.cycleVow;
  if (!cv || !cv.chosen) return null;
  const def = vowById(cv.chosen.id);
  if (!def) return null;
  const { target, base } = cv.chosen;
  const cur = def.cur(state);
  const broken = Boolean(cv.broken) || (def.kind === 'before' && cur > target);
  let kept, progress;
  if (def.kind === 'goal') {
    kept = Boolean(cv.done) || cur >= target;
    const span = target - base;
    progress = kept ? 1 : span > 0 ? Math.max(0, Math.min(1, (cur - base) / span)) : 0;
  } else {
    // never / before : tenu tant qu'il n'est pas rompu.
    kept = !broken;
    progress = kept ? 1 : 0;
  }
  return { def, target, base, cur, progress, kept, broken, done: def.kind === 'goal' && kept, ruinMult: def.ruinMult, failMult: VOW_FAIL_MULT };
}

// Le multiplicateur de moisson du vœu : ruinMult s'il est tenu, VOW_FAIL_MULT s'il
// est rompu ou manqué, 1 sans vœu prêté. Lu au site d'effondrement, AVANT que
// completeCollapse ne remette le vœu à zéro. Évalué EN DIRECT (la crise terminale
// gèle le tick : un rite Total accompli juste avant la chute doit compter).
export function cycleVowRuinMult(state) {
  const st = cycleVowStatus(state);
  if (!st) return 1;
  return st.kept ? st.ruinMult : st.failMult;
}

// Latch au tick : « kept » au passage d'un objectif à tenu, « broken » quand un
// vœu « avant l'an N » vient d'être dépassé ; null sinon. Posé
// INCONDITIONNELLEMENT (fonctionne aussi pendant la simulation hors ligne) ; la
// garde d'affichage reste chez l'appelant (patron refreshGrandResetReveal).
export function refreshCycleVow(state) {
  const cv = state.cycleVow;
  if (!cv || !cv.chosen || cv.done || cv.broken) return null;
  const st = cycleVowStatus(state);
  if (!st) return null;
  // Nouvelle RÉFÉRENCE (pas de mutation en place) : le sélecteur plat de
  // useCityViewState compare en surface, une mutation interne passerait inaperçue.
  if (st.def.kind === 'goal' && st.kept) { state.cycleVow = { ...cv, done: true }; return 'kept'; }
  if (st.def.kind === 'before' && st.broken) { state.cycleVow = { ...cv, broken: true }; return 'broken'; }
  return null;
}

// Un acte de la cité (« policy », « reform ») ROMPT le vœu « aucun X » qui
// l'interdit. Rend true si le vœu vient d'être rompu (l'appelant l'annonce).
export function breakCycleVow(state, act) {
  const cv = state.cycleVow;
  if (!cv || !cv.chosen || cv.broken) return false;
  const def = vowById(cv.chosen.id);
  if (!def || def.kind !== 'never' || !def.forbids.includes(act)) return false;
  state.cycleVow = { ...cv, broken: true };
  return true;
}
