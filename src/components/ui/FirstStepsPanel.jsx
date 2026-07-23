import { useGameState } from '../../hooks/useGameState.js';
import { onboardingSignature, ONBOARDING_STEPS } from '../../game/core/onboarding.js';
import { tr } from '../../game/core/i18n.js';

/**
 * PREMIERS PAS (E1) — trois intentions, cochées toutes seules.
 *
 * Aucune modale, aucune flèche qui bloque le clic : le fil se lit ou s'ignore.
 * Il disparaît DÉFINITIVEMENT une fois la dernière étape franchie, et ne peut
 * pas revenir — les trois drapeaux sont latchés à sens unique côté moteur et
 * traversent le Grand Reset.
 *
 * ⚠ L'ABONNEMENT PORTE SUR UNE SIGNATURE, pas sur l'objet d'étape. Un sélecteur
 * qui rendrait l'objet en fabriquerait un neuf à chaque tick, donc un rendu par
 * seconde de la vue Cité, pour réafficher exactement la même phrase.
 */
export default function FirstStepsPanel() {
  const signature = useGameState(onboardingSignature);
  if (!signature) return null;

  // L'index suffit : la table des étapes est une constante de module.
  const index = Number(signature);
  const step = ONBOARDING_STEPS[index];
  if (!step) return null;

  return (
    <section className="first-steps" aria-label={tr({ fr: "Premiers pas", en: "First steps" })}>
      <header className="first-steps-head">
        <span className="first-steps-kicker">{tr({ fr: "Premiers pas", en: "First steps" })}</span>
        <span className="first-steps-count">{index + 1}/{ONBOARDING_STEPS.length}</span>
      </header>
      <p className="first-steps-label">{tr(step.label)}</p>
      <p className="first-steps-hint">{tr(step.hint)}</p>
      {/* Les étapes déjà franchies restent visibles en creux : le fil montre
          d'où l'on vient, sinon il donne l'impression de ne jamais avancer. */}
      <ol className="first-steps-dots" aria-hidden="true">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s.id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />
        ))}
      </ol>
    </section>
  );
}
