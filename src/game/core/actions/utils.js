"use strict";

import { state } from '../state.js';
import { currentEraIndex, milestoneStepSize } from '../mechanics.js';
import { eras } from '../../data/world.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import { REGUL_LEDGER_MAX, FATIGUE_PER_ACTION } from '../balance.js';
import { pushAnnalsMark } from '../annals.js';
import { log } from '../log.js';

// `log` vit dans la feuille core/log.js (hors du cycle des actions) ; réexporté ici
// pour le baril actions.js et les modules qui le prennent dans ./utils.js.
export { log };

// Registre des édits (onglet Régulation) : chaque acte de régulation y dépose
// une entrée FACTUELLE — id d'action, foyer, effet réellement appliqué — que
// l'UI résout en libellé (les données restent i18n-agnostiques). Persisté (cap
// REGUL_LEDGER_MAX), remis à zéro au cycle. Alimente aussi les marqueurs des
// annales (même geste, deux mémoires : courte = courbe, factuelle = registre).
// entry: { id, kind: soothe|reform|gambleWin|gambleLoss|policyOn|policyOff,
//          foyer?, delta? [0..1], by? (magistrat de l'Intendance) }
export function regulLedgerPush(entry) {
  const row = { t: Date.now(), ...entry };
  state.regulLedger = [...(state.regulLedger || []), row].slice(-REGUL_LEDGER_MAX);
  pushAnnalsMark(entry.kind, entry.id);
}

// Chaque acte de régulation fatigue l'administration (anti-spam) : la fatigue
// monte, redescend dans le tick, réduit l'efficacité et majore les coûts.
// Appelé par crisis.js (édits/réformes) UNIQUEMENT. NB : les PARIS (osselets /
// Icare / temple) NE fatiguent PLUS l'administration depuis le découplage — le
// temple est sa propre économie (d'où l'auto-jeu sans spirale de fatigue).
export function raiseRegulFatigue() {
  state.regulFatigue = Math.min(1, (state.regulFatigue || 0) + FATIGUE_PER_ACTION);
}

export function chronicle(message) {
  const year = cycleYear();
  const era = eras[currentEraIndex()].name;
  log(tr({ fr: `An ${fmt(year)}, ${era} : ${message}`, en: `Year ${fmt(year)}, ${era}: ${message}` }));
}

export function cycleYear() {
  const elapsed = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  return Math.floor(elapsed / 60) + 1;
}

// L'an du cycle sur l'horloge FIGÉE pendant la crise terminale — la même que
// cycleClockNow (mechanics/prestige.js), ne pas laisser diverger. Lu par les vœux
// de durée : la cité gelée ne vieillit pas, ni devant l'autel ni jeu fermé (sinon
// « Le grand âge » se tenait en attendant, « Le feu court » se rompait en délibérant).
export function cycleYearFrozen() {
  const now = (state.crisisLimitAnnounced && state.crisisOpenedAt) ? state.crisisOpenedAt : Date.now();
  const elapsed = Math.max(0, (now - (state.cycleStartedAt || now)) / 1000);
  return Math.floor(elapsed / 60) + 1;
}

export function chronicleBuilding(building, previousCount, newCount) {
  const amount = newCount - previousCount;
  if (amount <= 0) return;
  // Pas de jalon PARTAGÉ avec l'achat et la barre de la boutique : il tombe de 25
  // à 20 avec le capstone Ville-Monde. Codé en dur ici, la chronique sautait un
  // palier sur cinq une fois le capstone acquis.
  const step = milestoneStepSize();
  // Phrases entières par langue : le nom n'est mis en minuscules que dans la
  // phrase française (en anglais, le nom garde sa majuscule de nom de bâtiment).
  const name = tr(building.name);

  if (previousCount === 0) {
    if (building.id === "watch") {
      chronicle(tr({
        fr: `Une milice s'organise sous nos remparts pour assurer la sécurité commune (+${fmt(amount)}).`,
        en: `A militia forms beneath our ramparts to keep the common peace (+${fmt(amount)}).`
      }));
    } else if (building.id === "bureaucracy") {
      chronicle(tr({
        fr: `Une bureaucratie naissante commence à enregistrer nos lois et décrets (+${fmt(amount)}).`,
        en: `A fledgling bureaucracy begins to record our laws and decrees (+${fmt(amount)}).`
      }));
    } else if (["foragers", "storytellers", "scribes", "ruin_architects"].includes(building.id)) {
      chronicle(tr({
        fr: `Les premiers ${name.toLowerCase()} offrent leurs services et se joignent à notre destinée (+${fmt(amount)}).`,
        en: `The first ${name} offer their services and join our destiny (+${fmt(amount)}).`
      }));
    } else {
      chronicle(tr({
        fr: `Les premiers ${name.toLowerCase()} s'élèvent dans nos quartiers (+${fmt(amount)}).`,
        en: `The first ${name} rise in our districts (+${fmt(amount)}).`
      }));
    }
  } else if (amount >= step || newCount % step === 0) {
    if (building.id === "watch") {
      chronicle(tr({
        fr: `La milice s'étend et compte désormais de nombreuses garnisons (${fmt(newCount)} unités, +${fmt(amount)}).`,
        en: `The militia expands and now counts many garrisons (${fmt(newCount)} units, +${fmt(amount)}).`
      }));
    } else if (building.id === "bureaucracy") {
      chronicle(tr({
        fr: `L'administration de la cité s'alourdit, comptant plus de fonctionnaires (${fmt(newCount)} unités, +${fmt(amount)}).`,
        en: `The city's administration grows heavier, with ever more officials (${fmt(newCount)} units, +${fmt(amount)}).`
      }));
    } else if (["foragers", "storytellers", "scribes", "ruin_architects"].includes(building.id)) {
      chronicle(tr({
        fr: `Notre corporation de ${name.toLowerCase()} s'agrandit pour atteindre ${fmt(newCount)} membres (+${fmt(amount)}).`,
        en: `Our guild of ${name} grows to ${fmt(newCount)} members (+${fmt(amount)}).`
      }));
    } else {
      chronicle(tr({
        fr: `Le nombre de ${name.toLowerCase()} construits atteint désormais ${fmt(newCount)} édifices (+${fmt(amount)}).`,
        en: `The city's ${name} now number ${fmt(newCount)} (+${fmt(amount)}).`
      }));
    }
  }
}

export function resetCyclePeaks() {
  state.cyclePeaks = {
    population: state.population,
    food: state.food,
    gold: state.gold,
    knowledge: state.knowledge,
    infrastructure: state.infrastructure,
    eraIndex: currentEraIndex()
  };
}
