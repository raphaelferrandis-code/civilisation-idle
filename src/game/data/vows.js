// LE VŒU DU CYCLE (D2). À chaque nouveau cycle, la cité prête un vœu choisi parmi
// trois : un objectif court terme VOLONTAIRE, le seul du jeu. Tenu, il majore la
// moisson de Ruines de la chute ; raté, il ne coûte rien. Modèle déclaratif calqué
// sur GRAND_RESET_MILESTONES : chaque vœu porte ses propres fonctions de mesure,
// et rien n'est câblé en dur ailleurs.
//
// Les objectifs sont ancrés sur des signaux PROPRES au cycle et qui passent
// l'échelle à tout moment de la partie : l'âge en années-cycle (cycleYear, = les
// minutes tenues), les crises stabilisées (cycleCrisesResolved), et l'ère
// atteinte RELATIVE à l'ère de départ du cycle. Aucun seuil absolu de population
// ou de ruines (ils exploseraient d'ordre de grandeur en fin de partie).
import { cycleYear } from '../core/actions/utils.js';
import { currentEraIndex } from '../core/mechanics/shared.js';
import { eras } from './world.js';

// kind : sert au tirage (filtrage anti-doublon de famille) et à rien d'autre — la
// mécanique vit dans les closures cur()/roll()/available() de chaque entrée.
//   roll(state)      -> { target, base } figés au TIRAGE (l'ère de départ, p.ex.)
//   available(state) -> le vœu peut-il encore être proposé (une ère hors d'atteinte
//                       ne l'est pas) ?
//   cur(state)       -> valeur d'avancement courante, comparée à target
//   describe(target) -> texte de l'objectif, avec le nombre
const timeVow = (id, years, ruinMult) => ({
  id, kind: 'time', ruinMult,
  name: { fr: id === 'veille' ? 'La veille' : id === 'patience' ? 'La patience' : 'Le grand âge',
          en: id === 'veille' ? 'The watch' : id === 'patience' ? 'Patience' : 'The great age' },
  roll: () => ({ target: years, base: 0 }),
  available: () => true,
  cur: () => cycleYear(),
  describe: (t) => ({ fr: `Mener la cité jusqu'à l'an ${t}`, en: `Lead the city to year ${t}` }),
  short: (t) => ({ fr: `An ${t}`, en: `Yr ${t}` }),
});

const crisisVow = (id, count, ruinMult) => ({
  id, kind: 'crisis', ruinMult,
  name: { fr: id === 'vigilance' ? 'La vigilance' : 'La fermeté',
          en: id === 'vigilance' ? 'Vigilance' : 'Resolve' },
  roll: () => ({ target: count, base: 0 }),
  available: () => true,
  cur: (state) => state.cycleCrisesResolved || 0,
  describe: (t) => ({ fr: `Stabiliser ${t} crises`, en: `Stabilize ${t} crises` }),
  short: (t) => ({ fr: `${t} crises`, en: `${t} crises` }),
});

const eraVow = (id, climb, ruinMult) => ({
  id, kind: 'era', ruinMult,
  name: { fr: id === 'elan' ? "L'élan" : id === 'ascension' ? "L'ascension" : "L'essor",
          en: id === 'elan' ? 'Momentum' : id === 'ascension' ? 'Ascension' : 'Rise' },
  roll: () => { const base = currentEraIndex(); return { base, target: base + climb }; },
  // Inutile de proposer « gravir 6 ères » à qui n'en a plus 6 devant lui.
  available: () => currentEraIndex() + climb <= eras.length - 1,
  cur: () => currentEraIndex(),
  describe: () => ({ fr: `Gravir ${climb} ères`, en: `Climb ${climb} eras` }),
  short: () => ({ fr: `+${climb} ères`, en: `+${climb} eras` }),
});

export const CYCLE_VOWS = [
  timeVow('veille', 8, 1.14),
  timeVow('patience', 16, 1.26),
  timeVow('grand_age', 28, 1.42),
  crisisVow('vigilance', 2, 1.16),
  crisisVow('fermete', 4, 1.34),
  eraVow('elan', 2, 1.2),
  eraVow('ascension', 4, 1.36),
  eraVow('essor', 6, 1.52),
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
  // 1re passe : UNE par famille (variété), familles dans un ordre aléatoire.
  for (const kind of shuffle([...new Set(pool.map((v) => v.kind))])) {
    if (offered.length >= 3) break;
    const bag = shuffle(pool.filter((v) => v.kind === kind && !has(v)));
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
    return { offered: [{ id: def.id, target, base }], chosen: { id: def.id, target, base }, done: false };
  }
  const offered = pickOffered(state);
  return { offered, chosen: null, done: false };
}

// Le multiplicateur de moisson du vœu TENU (1 sinon). Lu au site d'effondrement,
// AVANT que completeCollapse ne remette le vœu à zéro. Facteur multiplicatif
// distinct de l'épitaphe : une future fiche D11 (seuil ratio) doit référencer la
// moisson HORS ce facteur.
export function cycleVowRuinMult(state) {
  const cv = state.cycleVow;
  if (!cv || !cv.chosen || !cv.done) return 1;
  const def = vowById(cv.chosen.id);
  return def ? def.ruinMult : 1;
}

// État d'avancement lisible du vœu choisi, pour l'affichage et le latch au tick.
// null si aucun vœu n'est encore choisi.
export function cycleVowStatus(state) {
  const cv = state.cycleVow;
  if (!cv || !cv.chosen) return null;
  const def = vowById(cv.chosen.id);
  if (!def) return null;
  const { target, base } = cv.chosen;
  const cur = def.cur(state);
  const span = target - base;
  const progress = span > 0 ? Math.max(0, Math.min(1, (cur - base) / span)) : (cur >= target ? 1 : 0);
  return { def, target, base, cur, progress, done: cur >= target, ruinMult: def.ruinMult };
}

// Latch : marque le vœu comme TENU dès que l'objectif est atteint. Posé
// INCONDITIONNELLEMENT (fonctionne aussi pendant la simulation hors ligne, pour
// que le joueur qui revient trouve le vœu tenu) ; la garde d'affichage reste chez
// l'appelant (patron refreshGrandResetReveal). Renvoie true au passage à « tenu ».
export function refreshCycleVowDone(state) {
  const cv = state.cycleVow;
  if (!cv || !cv.chosen || cv.done) return false;
  const st = cycleVowStatus(state);
  // Nouvelle RÉFÉRENCE (pas cv.done = true en place) : le sélecteur plat de
  // useCityViewState compare en surface, une mutation interne passerait inaperçue.
  if (st && st.done) { state.cycleVow = { ...cv, done: true }; return true; }
  return false;
}
