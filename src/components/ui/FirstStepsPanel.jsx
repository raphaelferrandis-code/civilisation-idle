import { useGameState } from '../../hooks/useGameState.js';
import { useCollapsiblePanel } from '../../hooks/useCollapsiblePanel.js';
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
  // REPLIABLE (demande Raph 2026-07-28, sur capture téléphone). Le fil occupait
  // un quart de l'écran au moment précis où l'on veut voir sa ville — et il ne
  // part qu'au bout de trois étapes. On peut désormais le réduire à sa seule
  // ligne de titre, sans le perdre : le compteur « 1/3 » reste visible, donc on
  // sait qu'il est là et où l'on en est.
  // ⚠ L'état est mémorisé (localStorage, comme les autres encarts) : un joueur
  // qui l'a replié ne doit pas le retrouver ouvert au rechargement suivant.
  // ⚠ Les crochets AVANT le premier `return null` : appelés inconditionnellement,
  // sinon leur ordre change d'un rendu à l'autre.
  const [open, toggle] = useCollapsiblePanel('firstSteps', true);
  if (!signature) return null;

  // L'index suffit : la table des étapes est une constante de module.
  const index = Number(signature);
  const step = ONBOARDING_STEPS[index];
  if (!step) return null;

  return (
    <section
      className={`first-steps ${open ? 'is-open' : 'is-collapsed'}`}
      aria-label={tr({ fr: "Premiers pas", en: "First steps" })}
    >
      <button
        type="button"
        className="first-steps-head"
        aria-expanded={open}
        onClick={toggle}
        title={open
          ? tr({ fr: "Réduire les premiers pas", en: "Collapse first steps" })
          : tr({ fr: "Déplier les premiers pas", en: "Expand first steps" })}
      >
        <span className="first-steps-kicker">{tr({ fr: "Premiers pas", en: "First steps" })}</span>
        <span className="first-steps-count">{index + 1}/{ONBOARDING_STEPS.length}</span>
        <span className="hud-panel-chevron" aria-hidden="true"></span>
      </button>
      {open && (
        <>
          <p className="first-steps-label">{tr(step.label)}</p>
          <p className="first-steps-hint">{tr(step.hint)}</p>
          {/* Les étapes déjà franchies restent visibles en creux : le fil montre
              d'où l'on vient, sinon il donne l'impression de ne jamais avancer. */}
          <ol className="first-steps-dots" aria-hidden="true">
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s.id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
