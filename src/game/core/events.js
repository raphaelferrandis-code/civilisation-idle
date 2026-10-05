"use strict";

import {
  state,
  setGamePaused,
  setCollapseInProgress,
  setMourning,
  setChuteCinematic,
  openView,
  render,
  save,
  isNotifyPaused
} from './state.js';

import { crediblePopulation } from './demographics.js';

import {
  cityVitals,
  pressureBreakdown,
  currentEraIndex,
  epitaphLegacyAmp
} from './mechanics.js';
import { collapseHarvest } from './mechanics/collapseHarvest.js';

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
import { playCityFall, captureCityRelics, playCityRise, abortCityFall } from '../map/cityMapBridge.js';

// Transmet le dialogue ENTIER, défauts compris. L'ancienne version recopiait huit
// champs nommés et jetait les autres : `multiSelectOptions` et `defaultSelectedIds`
// (Ruines actives) ne sont jamais arrivés à ChoiceDialog — fenêtre d'Antée sans
// une case à cocher, « Valider » grisé à vie, fin du jeu verrouillée — et `label`
// non plus, d'où l'en-tête « Crise active » sur le Grand Reset ou la caravane
// (audit 2026-10-05, BUG-1).
export function openChoiceDialog(dialog) {
  return requestChoiceDialog({
    mourning: false, variant: "", preventClose: false, footnote: "", inscription: "",
    ...dialog
  });
}

// De quoi la cité est morte. Les quatre valeurs rendues ici sont recensées dans
// COLLAPSE_CAUSES (data/epitaphs.js) : en ajouter une cinquième oblige à l'y
// inscrire, sans quoi les tables de libellés indexées par cause afficheront la
// clé brute. Ne pas confondre avec le `reason` de l'effondrement, qui dit par
// quel chemin la chute est arrivée.
export function collapseCause() {
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const inequalityWithoutInfra = D(state.gold).gt(D(state.infrastructure).mul(400).add(D(state.population).mul(0.7)).max(500));
  if ((state.timeWear || 0) >= 1) return "time";
  // Un édit terminal scellé DÉCLARE la cause (crisis-cost.TERMINAL_EDICT_CAUSE).
  if (state.declaredFallCause) return state.declaredFallCause;
  // Sinon, la cause suit le foyer qui pèse le PLUS (« Choisir sa chute ») : elle se
  // pilote par les crises (dette ou recul d'un foyer), les réformes et la
  // gestion des réserves. Avant, la Subsistance l'emportait dès qu'elle dépassait
  // Inégalités et Complexité — même écrasée par la charge structurelle ou la
  // Dissidence, et même quand tout valait 0.
  const others = (key) => Math.max(...["scarcity", "inequality", "complexity", "dissent", "structural"]
    .filter((k) => k !== key).map((k) => pressure[k] || 0));
  const dominates = (key) => (pressure[key] || 0) > 0 && pressure[key] > others(key);
  if (vitals.foodScore < 0.16 || dominates("scarcity")) return "famine";
  if (inequalityWithoutInfra || dominates("inequality")) return "avarice";
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

// Chronique de l'effondrement, gravée par runCollapseSequence APRÈS completeCollapse
// (donc après le point de non-retour) : si un reload la persiste, c'est que la chute
// a bien eu lieu. Avant, collapse()/checkAutoCollapse l'écrivaient AVANT le deuil →
// ligne trompeuse et dupliquée après un reload pendant le deuil (crisis.js:510).
// `gain` est la moisson CRÉDITÉE (creditedGain), plus le ruinGain brut : la
// ligne annonçait un chiffre différent de celui versé (audit du 05/10, BUG-33).
function logCollapseLine(reason, gain) {
  if (reason === "auto_collapse") {
    chronicle(tr({
      fr: "L'Édit d'effondrement s'applique : la cité tombe au moment choisi, son héritage préservé.",
      en: "The Collapse Edict takes effect: the city falls at the chosen moment, its heritage preserved."
    }));
    return;
  }
  const label = reason === "manual" ? { fr: "manuel", en: "manual" }
    : reason === "forced" ? { fr: "forcé (Phénix)", en: "forced (Phoenix)" }
    : reason === "auto_script" ? { fr: "automatique (Script)", en: "automatic (Script)" }
    : { fr: "automatique", en: "automatic" };
  chronicle(tr({
    fr: `Le crépuscule s'abat sur la cité (effondrement ${label.fr}). Nos palais s'écroulent, laissant derrière eux un linceul de ${fmt(gain)} ruines.`,
    en: `Twilight falls upon the city (${label.en} collapse). Our palaces crumble, leaving behind a shroud of ${fmt(gain)} ruins.`
  }));
}

// Moisson réellement créditée par le dernier completeCollapse (rite, legs, vœu
// ET bonus Apocalypse de l'Olympe), qu'il range dans state.prevCycle.
function creditedGain() {
  return D(state.prevCycle?.ruinGain ?? 0);
}

// Monte la Cité (state.chute, transitoire comme le deuil) et lui fait jouer la chute.
// Tenue quand la carte a atteint le noir ; false si aucune carte ne peut la jouer —
// hors navigateur, ou si la carte ne s'est pas construite à temps.
async function playFallOnMap() {
  if (typeof window === "undefined") return false;
  setChuteCinematic(true);
  // La Cité se monte (elle était peut-être démontée, onglet Chute) et construit sa
  // carte : une mégapole y met une à deux secondes sur un poste sans GPU.
  let fall = playCityFall();
  for (let i = 0; !fall && i < 50; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    fall = playCityFall();
  }
  if (!fall) { setChuteCinematic(false); return false; }
  await fall;
  return true;
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
  // LA CHUTE SUR LA CARTE (docs/PLAN-CHUTE.md, map/iso/isoChute.js) : la cité tombe
  // sous les yeux du joueur — la vague de ruines, la nuit, le noir — avant la stèle.
  // Sans carte pour la jouer (tests, onglet caché), le deuil de deux secondes d'avant.
  let played = false;
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
  // L'Édit (chute automatique) ne fait jamais sauter de vue : il ne joue la chute
  // que si le joueur regarde déjà la cité.
  if (reason !== "auto_collapse" || state.activeView === "city") played = await playFallOnMap();
  // Au noir : la carte relève les ruines de la cité qui tombe. Rien n'est écrit dans
  // l'état ici — completeCollapse les prendra, après la stèle (invariant §1.3).
  captureCityRelics();
  setMourning(true);
  if (!played) await new Promise((resolve) => setTimeout(resolve, 2000));

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
    // BILAN DE CYCLE : sur ce chemin la chute est autrement TOTALEMENT muette —
    // l'Édit, ou un testament déjà gravé, emportent la civilisation sans un mot,
    // alors que le chemin manuel ouvre une stèle chiffrée. On relève les faits
    // AVANT completeCollapse, qui remet à zéro les compteurs du cycle et écrase
    // state.prevCycle avec le cycle qui vient de tomber.
    const previousCycle = state.prevCycle;
    const fallYear = cycleYear();
    const fallPeak = crediblePopulation(state.cyclePeaks?.population || state.population);
    // Vœu du cycle (D2) : lu AVANT completeCollapse, qui remet le vœu à zéro.
    completeCollapse(collapseHarvest(gain, chosenLegacy, cause), fallenDynasty, epitaph, reason);
    // Ceinture de sécurité : AUJOURD'HUI cette garde est toujours vraie ici — le
    // rattrapage hors ligne (qui pause les notifications) appelle completeCollapse
    // directement, jamais runCollapseSequence. On la garde au cas où un futur
    // chemin pauserait les notifications : enchaîner les effondrements empilerait
    // autant de bilans, dont un seul serait encore d'actualité.
    if (!isNotifyPaused()) {
      state.lastCycleReport = {
        year: fallYear,
        dynasty: fallenDynasty,
        cause,
        peakPop: String(fallPeak),
        cycleSec: state.prevCycle ? state.prevCycle.cycleSec : 0,
        ruinGain: state.prevCycle ? state.prevCycle.ruinGain : "0",
        prevCycleSec: previousCycle ? previousCycle.cycleSec : null,
        prevRuinGain: previousCycle ? previousCycle.ruinGain : null,
        at: Date.now()
      };
    }
    logCollapseLine(reason, creditedGain());
    setCollapseInProgress(false);
    if (reason !== "auto_collapse") await promptActiveRuinsForNewCycle();
    setMourning(false);
    setGamePaused(false);
    save();
    if (reason !== "auto_collapse") openView("city");
    // Le cycle neuf est fondé : le lever sur la carte (noir → feu du campement → aube).
    if (played) playCityRise(() => setChuteCinematic(false));
    render();
    return;
  }

  const legacyAmp = epitaphLegacyAmp();
  const signedPct = (d) => `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
  const lastWillId = state.nextEpitaphLegacy?.id || null;
  const options = EPITAPH_LEGACIES.map((legacy) => {
    const mult = epitaphRuinMultiplier(legacy, cause);
    const ruinGain = collapseHarvest(gain, legacy, cause);
    const deltaPct = Math.round((mult - 1) * 100);
    const favored = legacy.favoredCause === cause;
    // Renfort d'affinité matérialisé aussi côté ruines (Pillage : +25% → +35%).
    const boostedRuin = favored && legacy.favoredRuinMult != null;
    const baseDeltaPct = Math.round(((legacy.ruinMult || 1) - 1) * 100);
    // Le legs vaut pour TOUT le cycle suivant (rangée « Prochain cycle ») :
    // plus de sablier de minutes.
    const chips = epitaphLegacyChips(legacy, cause, legacyAmp);
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
      effects: chips,
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
    // L'épitaphe seule : plus de phrase d'explication sous la stèle (règle de Raph :
    // aucune explication à l'écran). L'affinité s'explique dans l'infobulle de son
    // badge ⚡, et les touches 1 à 4 gravent toujours sans qu'on l'écrive.
    body: epitaph,
    // Stèle-bilan : les faits du cycle qui s'achève, gravés sous l'épitaphe.
    inscription: tr({
      fr: `An ${fmt(cycleYear())} · Âge ${eras[currentEraIndex()].name} · pic ${fmt(crediblePopulation(state.cyclePeaks?.population || state.population))} habitants`,
      en: `Year ${fmt(cycleYear())} · Age of ${eras[currentEraIndex()].name} · peak ${fmt(crediblePopulation(state.cyclePeaks?.population || state.population))} inhabitants`
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
  // choice.ruinGain (calculé plus haut, vœu compris) est toujours défini ; le
  // repli garde le facteur de vœu par cohérence si un jour il tombait.
  const finalGain = choice.ruinGain ?? collapseHarvest(gain, chosenLegacy, cause);

  completeCollapse(finalGain, fallenDynasty, epitaph, reason);
  logCollapseLine(reason, creditedGain());
  setCollapseInProgress(false);
  await promptActiveRuinsForNewCycle();
  setMourning(false);
  setGamePaused(false);
  save();
  openView("city");
  if (played) playCityRise(() => setChuteCinematic(false));
  render();
  } catch (err) {
    // La séquence a cassé : la carte rend la main (pas de noir laissé sur la cité).
    abortCityFall();
    if (state.chute) setChuteCinematic(false);
    throw err;
  } finally {
    if (state.chute && !played) setChuteCinematic(false);
    setCollapseInProgress(false);
    setMourning(false);
    setGamePaused(false);
  }
}
