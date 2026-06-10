import { useGameState } from '../../hooks/useGameState.js';
import {
  legitimacyGain,
  institutionMultiplier,
  isUnlocked,
  canBuyUpgrade,
  upgradeCostText,
  has
} from '../../game/core/mechanics.js';
import { foundDynasty, buyUpgrade, performGrandReset } from '../../game/core/actions.js';
import { upgrades } from '../../game/data/upgrades.js';
import { DOCTRINES } from '../../game/data/world.js';
import { fmt } from '../../game/core/utils.js';
import ViewHeader from '../ui/ViewHeader.jsx';

export default function HeritageView() {
  const ruins = useGameState(s => s.ruins);
  const legitimacy = useGameState(s => s.legitimacy);
  const dynastyCount = useGameState(s => s.dynastyCount);
  const dynastyDoctrine = useGameState(s => s.dynastyDoctrine);
  const grandResetCount = useGameState(s => s.grandResetCount) || 0;
  const ragnarokHeritage = useGameState(s => Boolean(s.ragnarokHeritage));

  const legitGain = legitimacyGain();
  const dynCount = dynastyCount || 0;
  const dynPalier = Math.floor(dynCount / 5);
  const dynastiesToNextPalier = 5 - (dynCount % 5);

  const nextPalierText = dynastiesToNextPalier === 5
    ? `palier atteint (+${dynPalier})`
    : `dans ${dynastiesToNextPalier} dynasties (+${dynPalier + 1})`;

  const activeDoctrine = DOCTRINES.find(d => d.id === dynastyDoctrine);

  const visibleHeritageUpgrades = upgrades.filter(
    upgrade => (upgrade.group || "heritage") === "heritage" && isUnlocked(upgrade)
  );

  const isGrandResetUnlocked = has("grand_reset");
  const maxGrandResets = ragnarokHeritage ? 11 : 10;
  const nextGrandReset = Math.min(maxGrandResets, grandResetCount + 1);
  const grandResetCapped = grandResetCount >= maxGrandResets;
  const nextResetIsRagnarok = ragnarokHeritage && grandResetCount === 10;

  return (
    <section className="view active" id="tech">
      <ViewHeader
        icon="👑"
        title="Héritage"
        subtitle="Dynasties, améliorations persistantes et Grand Reset : ce qui survit aux cycles."
      />
      {/* Dynastie Panel */}
      <div className="panel prestige-panel">
        <div className="panel-heading">
          <div>
            <span className="label">Transmission longue</span>
            <h2>Dynastie</h2>
          </div>
          <button
            id="dynastyBtn"
            onClick={foundDynasty}
            disabled={legitGain <= 0}
          >
            Fonder
          </button>
        </div>
        <p className="body-copy">
          Plusieurs effondrements racontent une légende.
          Une dynastie se fonde quand les chroniques ont assez de matière pour fabriquer une légitimité durable.
        </p>
        <div className="prestige-stats">
          <div>
            <span>Prochaine fondation</span>
            <strong>300 ruines</strong>
          </div>
          <div>
            <span>Progression</span>
            <strong>
              {legitGain > 0
                ? `+${fmt(legitGain)} légitimité possible`
                : `Manque ${fmt(Math.max(0, 300 - ruins))} ruines`}
            </strong>
          </div>
          <div>
            <span>Légitimité gagnée</span>
            <strong>{fmt(legitGain)}</strong>
          </div>
          <div>
            <span>Légitimité</span>
            <strong>{fmt(legitimacy)}</strong>
          </div>
          <div>
            <span>Palier dynastique</span>
            <strong>{dynPalier > 0 ? `+${dynPalier} / fondation` : "+0 / fondation"}</strong>
          </div>
          <div>
            <span>Prochain palier</span>
            <strong>{nextPalierText}</strong>
          </div>
          <div>
            <span>Institutions</span>
            <strong>x{fmt(institutionMultiplier())}</strong>
          </div>
        </div>
        <div className="doctrine-display">
          <span>{activeDoctrine ? activeDoctrine.name : "Aucune doctrine"}</span>
          <small>
            {activeDoctrine
              ? `${activeDoctrine.bonus} | ${activeDoctrine.penalty}`
              : "À choisir lors de la prochaine fondation"}
          </small>
        </div>
      </div>

      {/* Heritage Panel */}
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="label">Upgrades persistants</span>
            <h2>Héritage</h2>
          </div>
        </div>
        <p className="body-copy">
          Ces améliorations survivent aux cycles et s'appliquent immédiatement.
          Achetées avec la légitimité gagnée lors des fondations de dynasties.
        </p>
        <div className="upgrade-grid">
          {visibleHeritageUpgrades.map(upgrade => {
            const isOwned = has(upgrade.id);
            const canBuy = canBuyUpgrade(upgrade);

            return (
              <article key={upgrade.id} className={`upgrade ${isOwned ? "bought" : ""}`}>
                <div>
                  <h3>{upgrade.name}</h3>
                  <p>{upgrade.desc}</p>
                  <p className="effect-line">{upgrade.effect}</p>
                  <div className="shop-meta">
                    <span className="chip">
                      {isOwned ? "Acquis" : upgradeCostText(upgrade)}
                    </span>
                  </div>
                </div>
                <button
                  disabled={isOwned || !canBuy}
                  onClick={() => buyUpgrade(upgrade.id)}
                >
                  {isOwned ? "Actif" : "Acheter"}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {/* Grand Reset Panel */}
      <div className="panel grand-reset-panel" id="grandResetPanel">
        <div className="panel-heading">
          <div>
            <span className="label">Prestige ultime</span>
            <h2>Grand Reset</h2>
          </div>
          <button
            id="grandResetBtn"
            className="grand-reset-btn"
            disabled={!isGrandResetUnlocked || grandResetCapped}
            onClick={performGrandReset}
          >
            {grandResetCapped ? "Complet" : "Reinitialiser"}
          </button>
        </div>
        <p className="body-copy">
          Efface toute progression : bâtiments, ruines, cycles, upgrades de ruines.
          En échange, chaque Grand Reset normal ajoute un bonus permanent x2 sur toute la production et les Ruines gagnées.
          Après Ragnarok, un 11e Grand Reset unique ajoute x4 supplémentaire aux Ruines gagnées.
        </p>
        <div className="prestige-stats">
          <div>
            <span>Grand Resets</span>
            <strong>{grandResetCount} / {maxGrandResets}</strong>
          </div>
          <div>
            <span>Bonus actuel</span>
            <strong>x{Math.pow(2, grandResetCount).toFixed(0)} prod & ruines{ragnarokHeritage && grandResetCount >= 11 ? " | x4 Ruines extra" : ""}</strong>
          </div>
          <div>
            <span>Bonus après</span>
            <strong>{grandResetCapped ? "Maximum" : nextResetIsRagnarok ? `x${Math.pow(2, nextGrandReset).toFixed(0)} prod & ruines | x4 Ruines extra` : `x${Math.pow(2, nextGrandReset).toFixed(0)} prod & ruines`}</strong>
          </div>
          <div>
            <span>Requis</span>
            <strong>{nextResetIsRagnarok ? "La Fin des Dieux" : "Upgrade Grand Reset (50 légitimité)"}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
