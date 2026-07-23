"use strict";

/* ============================================================================
 * onboarding.js — « Premiers pas » (E1).
 *
 * Trois intentions courtes, cochées toutes seules, qui disparaissent
 * définitivement une fois franchies. Aucune modale, aucune flèche qui bloque le
 * clic : le fil se lit ou s'ignore.
 *
 * L'arc du jeu en trois gestes, arbitrage de Raphaël : produire, sentir la
 * pression monter, accepter la chute. Le troisième est le vrai saut mental d'un
 * idle à prestige — un joueur qui n'a jamais laissé tomber sa cité n'a pas
 * encore joué au jeu.
 *
 * ⚠ LES TROIS ÉTAPES SONT LATCHÉES À SENS UNIQUE, jamais relues sur l'état
 * courant, et c'est la seule vraie difficulté du sujet. Un effondrement vide
 * `state.buildings` ; un Grand Reset remet `cycles` à zéro. Une condition écrite
 * sur « possède au moins un bâtiment » ou sur « cycles > 0 » se DÉCOCHERAIT donc
 * à chaque chute ou à chaque Grand Reset, et le fil reviendrait hanter un joueur
 * qui l'a fini depuis des heures. C'est le risque nommé par la fiche.
 *
 * Aucun compteur à vie ne convenait : `chronicleStats` ne compte que les jeux du
 * temple, et rien ne totalise les achats de bâtiments. D'où trois drapeaux
 * propres, posés par le tick, inscrits dans GR_PERSISTENT_FIELDS.
 *
 * ⚠ CONDITIONS PURES : elles LISENT l'état, elles n'écrivent jamais. Elles sont
 * évaluées dans un sélecteur useGameState, donc à chaque tick ; la moindre
 * écriture y déclencherait une boucle de rendu. Le latch, lui, vit dans le tick.
 * ==========================================================================*/

// Le fil est cousu dans l'ordre : une étape ne s'affiche qu'une fois la
// précédente cochée. Montrer les trois d'un coup dirait au joueur qu'il doit
// provoquer un effondrement avant même d'avoir bâti quoi que ce soit.
export const ONBOARDING_STEPS = [
  {
    id: "build",
    label: { fr: "Bâtis tes premiers Cueilleurs", en: "Build your first Foragers" },
    hint: {
      fr: "La cité démarre avec de quoi en payer un. C'est lui qui produira la nourriture suivante.",
      en: "The city starts with enough to pay for one. It will produce the food that follows."
    },
    done: (s) => Boolean(s.onboarding?.built)
  },
  {
    id: "pressure",
    label: { fr: "Laisse la Rupture monter", en: "Let Rupture rise" },
    hint: {
      fr: "Elle grimpe toute seule à mesure que la cité grandit. La regarder monter fait partie du jeu : rien ne se casse avant 100 %.",
      en: "It climbs on its own as the city grows. Watching it rise is part of the game: nothing breaks before 100%."
    },
    // Latché à vie par tick.js dès le premier franchissement, sinon l'étape se
    // décocherait chaque fois que le joueur apaise la Rupture.
    done: (s) => Boolean(s.onboarding?.pressureSeen)
  },
  {
    id: "collapse",
    label: { fr: "Provoque ton premier effondrement", en: "Trigger your first collapse" },
    hint: {
      fr: "Tout s'efface, sauf les Ruines. Elles rendent la cité suivante plus forte : c'est ainsi qu'on avance.",
      en: "Everything is erased, except the Ruins. They make the next city stronger: that is how you move forward."
    },
    done: (s) => Boolean(s.onboarding?.collapsed)
  }
];

// Seuil de « la Rupture monte » : un quart de la jauge. Assez bas pour tomber
// dans les premières minutes sans rien demander de particulier, assez haut pour
// que le joueur l'ait vue bouger.
export const ONBOARDING_PRESSURE_THRESHOLD = 0.25;

/**
 * L'étape courante, ou null quand le fil est fini.
 *
 * Rend `{ index, total, step }`. Le fil se termine DÉFINITIVEMENT : une fois la
 * dernière étape franchie, cette fonction rend null pour toujours, puisque les
 * trois conditions portent sur des compteurs qui ne redescendent pas.
 */
export function currentOnboardingStep(s) {
  for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
    if (!ONBOARDING_STEPS[i].done(s)) {
      return { index: i, total: ONBOARDING_STEPS.length, step: ONBOARDING_STEPS[i] };
    }
  }
  return null;
}

/**
 * Signature d'abonnement : une chaîne qui ne change QUE lorsque l'avancement
 * change. Sans elle, un sélecteur rendant l'objet d'étape en fabriquerait un
 * neuf à chaque tick et re-rendrait la vue Cité une fois par seconde, pour
 * afficher exactement la même phrase.
 */
export function onboardingSignature(s) {
  const cur = currentOnboardingStep(s);
  return cur ? `${cur.index}` : "";
}

/**
 * Latch des trois étapes, appelé au tick. À SENS UNIQUE : un drapeau posé ne se
 * retire jamais, ce qui rend le fil immunisé à l'effondrement comme au Grand
 * Reset. Rend true si quelque chose vient d'être coché, pour que l'appelant
 * puisse le signaler.
 *
 * Court-circuit dès que les trois sont posés : passé les premières minutes de
 * la toute première partie, cette fonction ne fait plus qu'une lecture de
 * booléen par tick, pour toujours.
 */
export function refreshOnboarding(s, batimentsPossedes) {
  const o = s.onboarding;
  if (!o || (o.built && o.pressureSeen && o.collapsed)) return false;
  let neuf = false;
  if (!o.built && batimentsPossedes > 0) { o.built = true; neuf = true; }
  if (!o.pressureSeen && (s.instability || 0) >= ONBOARDING_PRESSURE_THRESHOLD) { o.pressureSeen = true; neuf = true; }
  if (!o.collapsed && (s.cycles || 0) > 0) { o.collapsed = true; neuf = true; }
  return neuf;
}
