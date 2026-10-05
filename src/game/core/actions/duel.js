"use strict";

// LE DUEL DES GRANDS FLAMBEURS (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md). Pendant la
// Nuit du Grand Jeu — et à toute heure pour un Prince de la Maison —, le grand flambeur
// de la nuit (nuitGrandJeu.flambeurDeLaNuit) défie le joueur aux dés : quatre dés
// chacun (des os gravés de 1 à 6 aux premiers âges), la plus haute somme prend la
// manche, une égalité se rejoue, au meilleur des DUEL_MANCHES manches. Les deux jettent
// les MÊMES dés : une chance sur deux, et le vainqueur emporte le pot (deux mises) moins la part
// de la Maison — chaque duel rend DUEL_RTP. Mise libre, sans plafond, au-dessus de
// DUEL_MISE_MIN_H heures de recettes : « un grand flambeur ne joue pas petit ».

import { state, render, gamePaused, collapseInProgress, isNotifyPaused } from '../state.js';
import { DUEL_RTP, DUEL_MISE_MIN_H, DUEL_MANCHES, DUEL_PRINCE_RANK } from '../balance.js';
import { recettesPerHour, maisonRank } from './maisonTable.js';
import { feedPot, payRound } from './templePot.js';
import { recordWager } from './maisonRang.js';
import { nuitActive, flambeurDeLaNuit } from './nuitGrandJeu.js';
import { recordDuel } from '../chronicleStats.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { chronicle } from './utils.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';

export const FACES = [1, 2, 3, 4, 5, 6];

export function duelOuvert() {
  return nuitActive() || maisonRank() >= DUEL_PRINCE_RANK;
}

export function duelMiseMin() {
  return Math.max(1, Math.round(DUEL_MISE_MIN_H * recettesPerHour()));
}

const jet = () => Array.from({ length: 4 }, () => FACES[Math.floor(Math.random() * FACES.length)]);
const somme = (os) => os.reduce((a, b) => a + b, 0);

// Un duel : la mise est débitée, les manches sont tirées ICI (l'écran les déroule),
// apply() verse le gain. Rend { manches, gagne, gain, mise, flambeur, apply } ou null.
export function jouerDuel(mise, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false } = opts;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!duelOuvert()) return null;
  const m = Math.floor(Number(mise));
  if (!Number.isFinite(m) || m < duelMiseMin()) return null;
  if ((state.faveur || 0) < m) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - m);

  const manches = [];
  const aGagner = Math.floor(DUEL_MANCHES / 2) + 1;
  let j = 0, f = 0;
  for (let guard = 0; j < aGagner && f < aGagner && guard < 200; guard += 1) {
    const joueur = jet(), flambeur = jet();
    const sj = somme(joueur), sf = somme(flambeur);
    const gagnant = sj > sf ? "joueur" : sf > sj ? "flambeur" : null; // égalité : rejouée
    manches.push({ joueur, flambeur, gagnant });
    if (gagnant === "joueur") j += 1;
    if (gagnant === "flambeur") f += 1;
  }
  const gagne = j > f;
  const gain = gagne ? payRound(2 * m * DUEL_RTP) : 0;
  const fl = flambeurDeLaNuit();
  // La cagnotte sur l'avantage, la réputation sur la mise : comme à toutes les tables.
  feedPot(m, DUEL_RTP);
  recordWager(m, DUEL_RTP);

  const result = { manches, gagne, gain, mise: m, flambeur: fl };
  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    if (gain > 0) state.faveur = Math.max(0, (state.faveur || 0) + gain);
    recordDuel({ wagered: m, won: gain, gagne });
    // Un gros duel s'écrit dans la Chronique (dix heures de recettes et plus).
    if (m >= 10 * recettesPerHour()) {
      // Le nom du flambeur dans chaque langue (I18N-9 : `.fr` était forcé).
      const nomFr = fl.nom.fr;
      const nomEn = fl.nom.en || fl.nom.fr;
      const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      chronicle(gagne
        ? (fl.femme
          ? tr({
              fr: `${majuscule(nomFr)} perd le duel des grands flambeurs, et te glisse en partant son mouchoir parfumé : +${fmt(gain)} faveur.`,
              en: `${majuscule(nomEn)} loses the high rollers' duel, and slips you her perfumed handkerchief on the way out: +${fmt(gain)} favor.`
            })
          : tr({
              fr: `Tu fais plier ${nomFr} au duel des grands flambeurs ; il quitte la Maison seul : +${fmt(gain)} faveur.`,
              en: `You break ${nomEn} in the high rollers' duel; he leaves the House alone: +${fmt(gain)} favor.`
            }))
        : (fl.femme
          ? tr({
              fr: `${majuscule(nomFr)} te plume au duel des grands flambeurs et monte au boudoir avec ta mise : ${fmt(m)} faveur envolés.`,
              en: `${majuscule(nomEn)} fleeces you in the high rollers' duel and goes up to the boudoir with your stake: ${fmt(m)} favor gone.`
            })
          : tr({
              fr: `${majuscule(nomFr)} te plume au duel des grands flambeurs et repart une fille à chaque bras : ${fmt(m)} faveur envolés.`,
              en: `${majuscule(nomEn)} fleeces you in the high rollers' duel and leaves with a girl on each arm: ${fmt(m)} favor gone.`
            })));
    }
    if (!silent && !isNotifyPaused()) {
      pushOutcomeFloat({
        label: gagne
          ? tr({ fr: `🎲 Duel gagné : +${fmt(gain)} faveur`, en: `🎲 Duel won: +${fmt(gain)} favor` })
          : tr({ fr: "🎲 Duel perdu", en: "🎲 Duel lost" }),
        kind: gagne ? "gain" : "cost"
      });
    }
    if (doRender) render();
    return result;
  };
  if (!defer) result.apply();
  return result;
}
