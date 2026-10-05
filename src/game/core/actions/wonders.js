"use strict";

// Merveilles : gravure des rangs + chronique (BUG-12 de l'audit du 2026-10-05).
// Appelé par le tick (en ligne comme pendant le rattrapage hors ligne) et au
// seuil de completeCollapse, AVANT la remise à zéro des pics du cycle : un rang
// atteint se grave même quand la carte ne tourne pas (onglet Effondrement,
// fenêtre réduite, dialogue de crise ouvert, absence). La carte, elle, ne fait
// plus que jouer l'érection (cmCheckWonders, layout.js).

import { state } from '../state.js';
import { tr } from '../i18n.js';
import { checkWonderTiers, WONDER_TIER_NAMES } from '../mechanics/wonders.js';
import { chronicle } from './utils.js';

export function checkWonders() {
  const rises = checkWonderTiers(state);
  for (const { wonder: w, tier, erected } of rises) {
    if (erected) {
      chronicle(tr({
        fr: `Merveille érigée : ${w.name.fr}. La cité grave son ascension dans la pierre.`,
        en: `Wonder erected: ${w.name.en}. The city carves its rise into stone.`
      }));
    } else {
      const jalon = w.tierLabel(w.tiers[tier - 1]);
      chronicle(tr({
        fr: `${w.name.fr} s'élève au rang ${WONDER_TIER_NAMES[tier]} : ${jalon.fr}. Les bâtisseurs surpassent leurs ancêtres.`,
        en: `${w.name.en} rises to rank ${WONDER_TIER_NAMES[tier]}: ${jalon.en}. The builders surpass their ancestors.`
      }));
    }
  }
  return rises.length;
}
