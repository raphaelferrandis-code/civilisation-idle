import { useGameState } from '../../hooks/useGameState.js';
import { setTestamentLegacy } from '../../game/core/actions.js';
import { collapseCause } from '../../game/core/events.js';
import {
  EPITAPH_LEGACIES,
  FAVORED_CAUSE_LABELS,
  epitaphLegacyChips,
  epitaphRuinMultiplier
} from '../../game/data/epitaphs.js';
import { tr } from '../../game/core/i18n.js';
import PixelIcon from './PixelIcon.jsx';

/**
 * Testament — pré-gravure du legs d'épitaphe (arbitrage 2026-07-13).
 * 4 sceaux cliquables ; re-cliquer le sceau gravé l'efface. La cause projetée
 * (collapseCause) éclaire l'affinité ⚡ et le delta de ruines de chaque sceau.
 * Tuile = icône pixel maison seule (retour Raph : pas d'emoji système), le
 * delta de ruines vit SOUS la tuile.
 */
export default function TestamentSeals() {
  const testamentLegacyId = useGameState(s => s.testamentLegacyId);
  // La cause projetée dérive avec l'économie, pas seulement avec les jauges :
  // se caler sur l'horloge du tick pour la réévaluer en continu.
  useGameState(s => s.lastTick);
  const cause = collapseCause();
  const engraved = EPITAPH_LEGACIES.find(l => l.id === testamentLegacyId) || null;

  return (
    <div className="testament-block">
      <div className="testament-head">
        <span className="testament-title">{tr({ fr: "Testament", en: "Testament" })}</span>
        <span className="testament-cause">
          {tr({ fr: "Chute annoncée :", en: "Foretold fall:" })}{" "}
          <strong>{FAVORED_CAUSE_LABELS[cause] || cause}</strong>
        </span>
      </div>
      <div className="testament-seals" role="group" aria-label={tr({ fr: "Testament", en: "Testament" })}>
        {EPITAPH_LEGACIES.map((legacy) => {
          const mult = epitaphRuinMultiplier(legacy, cause);
          const delta = Math.round((mult - 1) * 100);
          const favored = legacy.favoredCause === cause;
          const isEngraved = legacy.id === testamentLegacyId;
          const chips = epitaphLegacyChips(legacy, cause).map(c => c.label).join(" · ");
          return (
            <div key={legacy.id} className="testament-seal-wrap">
              <button
                type="button"
                className={`testament-seal${isEngraved ? " is-engraved" : ""}${favored ? " is-favored" : ""}`}
                title={`${legacy.label}${favored ? tr({ fr: " · ⚡ affinité avec la chute annoncée", en: " · ⚡ affinity with the foretold fall" }) : ""}\n${legacy.tagline}\n${chips}`}
                aria-pressed={isEngraved}
                onClick={() => setTestamentLegacy(isEngraved ? null : legacy.id)}
              >
                <PixelIcon name={legacy.pixIcon} />
                {favored && <span className="seal-affinity" aria-hidden="true">⚡</span>}
              </button>
              <span className="seal-delta">{delta ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)}%` : "·"}</span>
            </div>
          );
        })}
      </div>
      {/* Le sceau gravé déplie son détail (le contenu de l'infobulle) sous la
          rangée — rien n'est affiché tant que rien n'est gravé. */}
      {engraved && (
        <div className="testament-detail">
          <span className="testament-detail-name">
            {engraved.label}
            {engraved.favoredCause === cause && (
              <span className="testament-detail-affinity">⚡ {tr({ fr: "affinité", en: "affinity" })}</span>
            )}
          </span>
          <p className="testament-detail-tagline">{engraved.tagline}</p>
          <span className="effect-chips">
            {epitaphLegacyChips(engraved, cause).map((chip, i) => (
              <span key={`${chip.label}-${i}`} className={`effect-chip is-${chip.kind || "info"}${chip.boosted ? " is-boosted" : ""}`}>
                {chip.label}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
