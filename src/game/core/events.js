"use strict";

import {
  state,
  setGamePaused,
  setCollapseInProgress,
  setMourning,
  openView,
  render,
  save
} from './state.js';

import {
  cityVitals,
  pressureBreakdown,
  currentEraIndex,
  epitaphLegacyDurationMs,
  has
} from './mechanics.js';

import { completeCollapse, promptActiveRuinsForNewCycle, chronicle, cycleYear } from './actions.js';
import { requestChoiceDialog } from './choiceDialog.js';

import { eras } from '../data/world.js';
import { dynastyNames } from '../data/buildings.js';
import {
  EPITAPH_LEGACIES,
  FAVORED_CAUSE_LABELS,
  epitaphLegacyById,
  epitaphLegacyChips,
  epitaphRuinMultiplier
} from '../data/epitaphs.js';
import { fmt } from './utils.js';
import { D } from './num.js';
import { tr } from './i18n.js';

export function openChoiceDialog({ title, body, options, mourning = false, variant = "", preventClose = false, footnote = "", inscription = "" }) {
  return requestChoiceDialog({ title, body, options, mourning, variant, preventClose, footnote, inscription });
}

export function collapseCause() {
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const inequalityWithoutInfra = D(state.gold).gt(D(state.infrastructure).mul(400).add(D(state.population).mul(0.7)).max(500));
  if ((state.timeWear || 0) >= 1) return "time";
  if (vitals.foodScore < 0.16 || (pressure.scarcity >= pressure.inequality && pressure.scarcity >= pressure.complexity)) return "famine";
  if (inequalityWithoutInfra || pressure.inequality > Math.max(pressure.scarcity, pressure.complexity, pressure.structural)) return "avarice";
  return "rupture";
}

export function generateEpitaph() {
  const era = eras[currentEraIndex()].name;
  const cause = collapseCause();
  if (cause === "time") {
    return tr({
      fr: "Le temps a effacé ses fondations. Elle s'éteignit doucement, oubliée par l'histoire.",
      en: "Time erased its foundations. It faded quietly, forgotten by history."
    });
  }
  if (cause === "famine") {
    return tr({
      fr: `Ici s'arrête l'Âge ${era}. Détruite par ses propres famines, elle ne laissa que des poteries brisées.`,
      en: `Here ends the Age of ${era}. Destroyed by its own famines, it left only broken pottery.`
    });
  }
  if (cause === "avarice") {
    return tr({
      fr: `Ici s'arrête l'Âge ${era}. Détruite par l'avarice de ses élites, son opulence fut ensevelie sous les sables.`,
      en: `Here ends the Age of ${era}. Destroyed by the avarice of its elites, its opulence was buried beneath the sands.`
    });
  }
  return tr({
    fr: `Ici s'arrête l'Âge ${era}. Trop vaste pour se gouverner, elle confondit sa grandeur avec une promesse d'éternité.`,
    en: `Here ends the Age of ${era}. Too vast to govern itself, it mistook its greatness for a promise of eternity.`
  });
}

// INVARIANT DE SAUVEGARDE (revue 0.4 §1.3) — NE PAS CASSER : aucune mutation d'état
// survivant à un rechargement ne doit avoir lieu AVANT la résolution du dialogue
// d'épitaphe (`await openChoiceDialog`). La seule mutation autorisée avant est
// `setMourning(true)`, neutralisée par hydrateState (qui force `mourning: false`).
// Conséquence : un F5 pendant le deuil OU le dialogue recharge l'état pré-effondrement
// — la crise est re-proposée et le gain recalculé, jamais une sauvegarde à moitié
// effondrée. Toutes les mutations persistées (`nextEpitaphLegacy`, `completeCollapse`)
// arrivent APRÈS l'await. Défendu par collapse.persistence.test.js : déplacer une
// écriture d'état avant le dialogue fera échouer ce test.
export async function runCollapseSequence(gain, reason) {
  setMourning(true);
  // Filet anti-gel (M14) : si QUOI QUE CE SOIT lève ci-dessous (completeCollapse,
  // promesse de dialogue orpheline après un remount du slot choiceResolver,
  // exception dans captureCurrentVestige…), le `finally` relâche toujours les
  // verrous — sinon tick()/checkAutoCollapse sortent en tête à jamais et le jeu
  // est mort jusqu'au rechargement. Corps NON ré-indenté sous le try (diff minimal).
  try {
  const dynastyIndex = state.cycles % dynastyNames.length;
  const fallenDynasty = dynastyNames[dynastyIndex];
  const epitaph = generateEpitaph();
  const cause = collapseCause();
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const riteBonus = has("rituel_effondrement") ? 1.25 : 1;
  const gainBase = D(gain).mul(riteBonus).round();

  // EFFONDREMENT SILENCIEUX (arbitrages 2026-07-13) : le choix du legs se fait
  // sur la page Effondrement (Testament) — la stèle ne s'ouvre QUE s'il n'y a
  // rien de gravé, seul cas où le choix reste à faire. L'Édit (auto) grave le
  // testament sinon répète la dernière volonté, sans AUCUN dialogue ni saut de
  // vue ; le HOLD (manuel) avec testament grave direct mais garde le choix des
  // Ruines actives (le joueur est présent) et le retour à la Cité. Même
  // invariant §1.3 : la première mutation persistée arrive ici, après le deuil.
  const testament = epitaphLegacyById(state.testamentLegacyId);
  if (reason === "auto_collapse" || testament) {
    const chosenLegacy = testament || epitaphLegacyById(state.nextEpitaphLegacy?.id);
    if (chosenLegacy) {
      state.nextEpitaphLegacy = {
        id: chosenLegacy.id,
        cause,
        chosenCycle: state.cycles || 0,
        startedAt: Date.now()
      };
      // Avant completeCollapse : le Journal (state.history) survit à
      // l'effondrement et la ligne porte ainsi l'an de la cité qui tombe,
      // comme la ligne « L'Édit s'applique » posée par checkAutoCollapse.
      chronicle(reason !== "auto_collapse"
        ? tr({ fr: `Les survivants honorent le testament : ${chosenLegacy.logLabel}.`, en: `The survivors honor the testament: ${chosenLegacy.logLabel}.` })
        : testament
          ? tr({ fr: `L'Édit d'effondrement grave le testament : ${chosenLegacy.logLabel}.`, en: `The Collapse Edict engraves the testament: ${chosenLegacy.logLabel}.` })
          : tr({ fr: `Sans testament, l'Édit répète la dernière volonté : ${chosenLegacy.logLabel}.`, en: `Without a testament, the Edict repeats the last will: ${chosenLegacy.logLabel}.` }));
    }
    completeCollapse(gainBase.mul(epitaphRuinMultiplier(chosenLegacy, cause)).round(), fallenDynasty, epitaph, reason);
    setCollapseInProgress(false);
    if (reason !== "auto_collapse") await promptActiveRuinsForNewCycle();
    setMourning(false);
    setGamePaused(false);
    save();
    if (reason !== "auto_collapse") openView("city");
    render();
    return;
  }

  const legacyMinutes = Math.round(epitaphLegacyDurationMs() / 60000);
  const signedPct = (d) => `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
  const lastWillId = state.nextEpitaphLegacy?.id || null;
  const options = EPITAPH_LEGACIES.map((legacy) => {
    const mult = epitaphRuinMultiplier(legacy, cause);
    const ruinGain = gainBase.mul(mult).round();
    const deltaPct = Math.round((mult - 1) * 100);
    const favored = legacy.favoredCause === cause;
    // Renfort d'affinité matérialisé aussi côté ruines (Pillage : +25% → +35%).
    const boostedRuin = favored && legacy.favoredRuinMult != null;
    const baseDeltaPct = Math.round(((legacy.ruinMult || 1) - 1) * 100);
    const chips = epitaphLegacyChips(legacy, cause);
    // Sablier uniquement si le legs a des effets FENÊTRÉS — la Rupture de
    // départ du Pillage est posée une fois au démarrage, pas minutée.
    const timed = Object.keys(legacy.effects || {}).some((key) => key !== "startingInstability");
    return {
      label: `${legacy.icon} ${legacy.label}`,
      rowLabelNow: tr({ fr: "Maintenant", en: "Now" }),
      headline: tr({ fr: `+${fmt(ruinGain)} ruines`, en: `+${fmt(ruinGain)} ruins` }),
      // Pur pourcentage : « de ruines » serait redondant à côté du montant, et
      // le chip court garde la rangée « Maintenant » sur une seule ligne.
      delta: deltaPct
        ? {
            label: boostedRuin ? `${signedPct(baseDeltaPct)} → ${signedPct(deltaPct)}` : signedPct(deltaPct),
            kind: deltaPct > 0 ? "gain" : "cost",
            boosted: boostedRuin
          }
        : null,
      rowLabelNext: tr({ fr: "Prochain cycle", en: "Next cycle" }),
      effects: timed
        ? [{ label: `⏳ ${legacyMinutes} min`, kind: "info" }, ...chips]
        : chips,
      badge: favored ? tr({ fr: "⚡ Affinité", en: "⚡ Affinity" }) : null,
      badgeTitle: favored
        ? tr({
            fr: `Affinité : ${FAVORED_CAUSE_LABELS[cause] || cause}. Les valeurs renforcées (→) s'appliquent.`,
            en: `Affinity: ${FAVORED_CAUSE_LABELS[cause] || cause}. The reinforced (→) values apply.`
          })
        : null,
      highlight: favored,
      lastWill: legacy.id === lastWillId,
      detail: legacy.tagline,
      ruinGain,
      epitaphLegacyId: legacy.id
    };
  });

  const choice = await openChoiceDialog({
    title: tr({ fr: `Chute de ${fallenDynasty}`, en: `Fall of ${fallenDynasty}` }),
    body: tr({
      fr: `${epitaph}\n\nLes survivants ne choisissent plus seulement combien sauver, mais ce que la prochaine civilisation devra retenir.`,
      en: `${epitaph}\n\nThe survivors no longer choose only how much to save, but what the next civilization must remember.`
    }),
    // Stèle-bilan : les faits du cycle qui s'achève, gravés sous l'épitaphe.
    inscription: tr({
      fr: `An ${fmt(cycleYear())} · Âge ${eras[currentEraIndex()].name} · pic ${fmt(D(state.cyclePeaks?.population || state.population))} habitants`,
      en: `Year ${fmt(cycleYear())} · Age of ${eras[currentEraIndex()].name} · peak ${fmt(D(state.cyclePeaks?.population || state.population))} inhabitants`
    }),
    footnote: tr({
      fr: `L'affinité ⚡ renforce le legs assorti à la cause de la chute : les valeurs « → » s'appliquent. Touches 1 à 4 pour graver directement.`,
      en: `The ⚡ affinity strengthens the legacy matching the cause of the fall: the "→" values apply. Keys 1 to 4 engrave directly.`
    }),
    mourning: true,
    preventClose: true,
    options
  });
  const chosenLegacy = EPITAPH_LEGACIES.find((legacy) => legacy.id === choice.epitaphLegacyId) || EPITAPH_LEGACIES[0];
  state.nextEpitaphLegacy = {
    id: chosenLegacy.id,
    cause,
    chosenCycle: state.cycles || 0,
    startedAt: Date.now()
  };
  const finalGain = choice.ruinGain ?? gainBase.mul(epitaphRuinMultiplier(chosenLegacy, cause)).round();

  completeCollapse(finalGain, fallenDynasty, epitaph, reason);
  setCollapseInProgress(false);
  await promptActiveRuinsForNewCycle();
  setMourning(false);
  setGamePaused(false);
  save();
  openView("city");
  render();
  } finally {
    setCollapseInProgress(false);
    setMourning(false);
    setGamePaused(false);
  }
}
