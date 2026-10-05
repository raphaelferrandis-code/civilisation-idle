"use strict";

// LES COURSES (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md). Six partants à cotes FIXES :
// la course tire un profil de chances (COURSES_PROFILS) et le répartit au hasard entre
// les couloirs ; la cote d'un partant vaut COURSES_RTP / sa chance, si bien que chaque
// pari rend 95 %. Le gagnant est tiré à la chance ; les autres arrivent dans un ordre
// tiré lui aussi à la chance (le favori finit souvent près de la tête). Au titre de
// Notable, et pour tous pendant la Nuit du Grand Jeu.

import { state, render, gamePaused, collapseInProgress, isNotifyPaused } from '../state.js';
import { COURSES_RTP, COURSES_UNLOCK_RANK, COURSES_PARTANTS, COURSES_PROFILS } from '../balance.js';
import { tableLimits, maisonRank } from './maisonTable.js';
import { feedPot, payRound } from './templePot.js';
import { recordWager } from './maisonRang.js';
import { nuitActive } from './nuitGrandJeu.js';
import { recordCourse } from '../chronicleStats.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { chronicle } from './utils.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';

export const NOMS = [
  "Pégase", "Borée", "Zéphyr", "Bucéphale", "Arion", "Xanthos", "Éole", "Hermès",
  "Nyx", "Aurore", "Phébus", "Sirius", "Céleste", "Tonnerre", "Rubis", "Sultane"
];

// Le nom AFFICHÉ d'un partant (audit du 05/10, I18N-11) : les figures de la mythologie
// prennent leur graphie anglaise (comme Icarus ou Sisyphus) ; les autres sont des noms
// propres, gardés tels quels. Le nom français reste la CLÉ : il est sauvegardé dans
// state.courseField, et la robe du cheval en dérive (coursesArt, robeOf).
const NOMS_EN = {
  "Pégase": "Pegasus", "Borée": "Boreas", "Zéphyr": "Zephyrus", "Bucéphale": "Bucephalus",
  "Éole": "Aeolus", "Hermès": "Hermes", "Aurore": "Aurora", "Phébus": "Phoebus"
};
export const nomCheval = (nom) => tr({ fr: nom, en: NOMS_EN[nom] || nom });

export function coursesUnlocked() {
  return maisonRank() >= COURSES_UNLOCK_RANK || nuitActive();
}

// Une nouvelle course : six partants { couloir, nom, p } (la chance de gagner).
function tirerCourse() {
  const profil = COURSES_PROFILS[Math.floor(Math.random() * COURSES_PROFILS.length)].slice(0, COURSES_PARTANTS);
  const melange = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; }
    return a;
  };
  const chances = melange(profil);
  const noms = melange(NOMS).slice(0, COURSES_PARTANTS);
  return chances.map((p, couloir) => ({ couloir, nom: noms[couloir], p }));
}

// La course qui attend ses paris (gardée dans la sauvegarde : on la retrouve en revenant).
export function coursePartants() {
  const c = state.courseField;
  if (Array.isArray(c) && c.length === COURSES_PARTANTS && c.every((x) => x && x.p > 0)) return c;
  state.courseField = tirerCourse();
  return state.courseField;
}

// La cote (ce que paie un pari gagnant, mise comprise) : exacte, et lisible à l'écran.
export const coteExacte = (p) => COURSES_RTP / p;
export const coteAffichee = (p) => Math.floor(coteExacte(p) * 10) / 10;

// Les paris assainis : { couloir: mise } entiers positifs sur des couloirs existants.
export function parisPropres(paris) {
  const out = {};
  if (!paris || typeof paris !== "object") return out;
  for (const [k, v] of Object.entries(paris)) {
    const c = Number(k), m = Math.floor(Number(v));
    if (Number.isInteger(c) && c >= 0 && c < COURSES_PARTANTS && m > 0) out[c] = m;
  }
  return out;
}
export const parisTotal = (paris) => Object.values(parisPropres(paris)).reduce((a, b) => a + b, 0);

// L'ordre d'arrivée : le gagnant d'abord, puis les autres tirés à la chance (Plackett-Luce).
function ordreArrivee(partants, gagnant) {
  const reste = partants.filter((x) => x.couloir !== gagnant).map((x) => ({ ...x }));
  const ordre = [gagnant];
  while (reste.length) {
    const tot = reste.reduce((a, x) => a + x.p, 0);
    let r = Math.random() * tot, i = 0;
    for (; i < reste.length - 1; i += 1) { r -= reste[i].p; if (r <= 0) break; }
    ordre.push(reste[i].couloir);
    reste.splice(i, 1);
  }
  return ordre;
}

// Une course : rend { partants, gagnant, ordre, paris, total, gain, apply } ou null.
export function lancerCourse(paris, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false } = opts;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!coursesUnlocked()) return null;
  const propres = parisPropres(paris);
  const total = Object.values(propres).reduce((a, b) => a + b, 0);
  const { min, max } = tableLimits();
  if (total < min || total > max) return null;
  if ((state.faveur || 0) < total) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - total);

  const partants = coursePartants();
  let r = Math.random(), gagnant = partants[partants.length - 1].couloir;
  for (const x of partants) { r -= x.p; if (r < 0) { gagnant = x.couloir; break; } }
  const ordre = ordreArrivee(partants, gagnant);
  const pw = partants.find((x) => x.couloir === gagnant).p;
  const gain = propres[gagnant] ? payRound(propres[gagnant] * coteExacte(pw)) : 0;
  feedPot(total, COURSES_RTP);
  recordWager(total, COURSES_RTP);
  // La course suivante est tirée tout de suite (l'écran garde celle-ci pour l'arrivée).
  state.courseField = tirerCourse();

  const result = { partants, gagnant, ordre, paris: propres, total, gain };
  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    if (gain > 0) state.faveur = Math.max(0, (state.faveur || 0) + gain);
    recordCourse({ wagered: total, won: gain, cote: coteExacte(pw) });
    // Un outsider (cote ×10 et plus) qui gagne avec ta mise dessus : la Chronique s'en souvient.
    if (gain > 0 && coteExacte(pw) >= 10) {
      const cheval = nomCheval(partants.find((x) => x.couloir === gagnant).nom);
      chronicle(tr({
        fr: `${cheval}, l'outsider à ×${coteAffichee(pw)}, gagne la course sous ta mise : +${fmt(gain)} faveur.`,
        en: `${cheval}, the outsider at ×${coteAffichee(pw)}, wins the race with your stake on it: +${fmt(gain)} favor.`
      }));
    }
    if (!silent && !isNotifyPaused()) {
      pushOutcomeFloat({ label: gain > 0 ? tr({ fr: `🏇 +${fmt(gain)} faveur`, en: `🏇 +${fmt(gain)} favor` }) : `🏇 ${nomCheval(partants.find((x) => x.couloir === gagnant).nom)}`, kind: gain > 0 ? "gain" : "cost" });
    }
    if (doRender) render();
    return result;
  };
  if (!defer) result.apply();
  return result;
}
