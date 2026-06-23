import { useGameState } from '../../hooks/useGameState.js';
import {
  legitimacyGain,
  institutionMultiplier,
  isUnlocked,
  canBuyUpgrade,
  upgradeCostText,
  has,
  dynastyRuinsThreshold,
  grandResetLegitimacyCost,
  grandResetMythsRequired,
  completedMythCount
} from '../../game/core/mechanics.js';
import { foundDynasty, buyUpgrade, performGrandReset, engraveCadmosEpitaph } from '../../game/core/actions.js';
import { upgrades } from '../../game/data/upgrades.js';
import { DOCTRINES } from '../../game/data/world.js';
import { CADMOS_MAX_PERMANENT_EPITAPHS, CADMOS_EPITAPH_BONUS_PCT } from '../../game/data/myths.js';
import { fmt } from '../../game/core/utils.js';
import { D } from '../../game/core/num.js';

export default function HeritageView() {
  const ruins = useGameState(s => s.ruins);
  const legitimacy = useGameState(s => s.legitimacy);
  const dynastyCount = useGameState(s => s.dynastyCount);
  const dynastyDoctrine = useGameState(s => s.dynastyDoctrine);
  const grandResetCount = useGameState(s => s.grandResetCount) || 0;
  const ragnarokHeritage = useGameState(s => Boolean(s.ragnarokHeritage));
  const cadmosHeritage = useGameState(s => Boolean(s.cadmosHeritage));
  const cadmosPermanentEpitaphs = useGameState(s => s.cadmosPermanentEpitaphs) || [];
  const cadmosLastRunChronicle = useGameState(s => s.cadmosLastRunChronicle) || [];
  const cadmosChronicle = useGameState(s => s.cadmosChronicle) || [];

  // Âges chroniqués (cycle courant + dernier run) encore gravables : dédupliqués
  // par id et privés de ceux déjà gravés.
  const cadmosEngravedIds = new Set(cadmosPermanentEpitaphs.map((e) => e.id));
  const cadmosCandidates = [...cadmosLastRunChronicle, ...cadmosChronicle]
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
    .filter((e) => !cadmosEngravedIds.has(e.id));
  const cadmosFull = cadmosPermanentEpitaphs.length >= CADMOS_MAX_PERMANENT_EPITAPHS;
  const cadmosBonusPct = Math.round(CADMOS_EPITAPH_BONUS_PCT * 100);

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

  const dynastyThreshold = dynastyRuinsThreshold();

  const isGrandResetUnlocked = has("grand_reset");
  const maxGrandResets = ragnarokHeritage ? 11 : 10;
  const nextGrandReset = Math.min(maxGrandResets, grandResetCount + 1);
  const grandResetCapped = grandResetCount >= maxGrandResets;
  const nextResetIsRagnarok = ragnarokHeritage && grandResetCount === 10;
  const nextResetLegitCost = grandResetLegitimacyCost(nextGrandReset);
  const nextResetMythsRequired = grandResetMythsRequired(nextGrandReset);
  const mythsDone = completedMythCount();
  const grandResetBlocked = legitimacy < nextResetLegitCost || mythsDone < nextResetMythsRequired;

  return (
    <section className="view active" id="tech">
      {/* Dynastie Panel */}
      <div className="panel prestige-panel">
        <div className="panel-heading">
          <div>
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
            <strong>{fmt(dynastyThreshold)} ruines</strong>
          </div>
          <div>
            <span>Progression</span>
            <strong>
              {legitGain > 0
                ? `+${fmt(legitGain)} légitimité possible`
                : `Manque ${fmt(D(dynastyThreshold).sub(ruins).max(0))} ruines`}
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

      {/* Cadmos — Épitaphes permanentes (visible une fois l'héritage Cadmos acquis) */}
      {cadmosHeritage && (
        <div className="panel cadmos-panel">
          <div className="panel-heading">
            <div>
              <h2>Cadmos — Épitaphes permanentes</h2>
            </div>
          </div>
          <p className="body-copy">
            Grave un Âge inscrit à la Chronique comme Nom de Pouvoir permanent : chaque
            épitaphe accorde <strong>+{cadmosBonusPct}%</strong> à son orientation (Nourriture,
            Trésor ou Stabilité), pour toujours. Maximum {CADMOS_MAX_PERMANENT_EPITAPHS}.
          </p>
          <div className="prestige-stats">
            <div>
              <span>Épitaphes gravées</span>
              <strong>{cadmosPermanentEpitaphs.length} / {CADMOS_MAX_PERMANENT_EPITAPHS}</strong>
            </div>
          </div>

          {cadmosPermanentEpitaphs.length > 0 && (
            <div className="upgrade-grid">
              {cadmosPermanentEpitaphs.map((entry) => (
                <article key={entry.id} className="upgrade bought">
                  <div>
                    <h3>{entry.name}</h3>
                    <p className="effect-line">{entry.orientationLabel} +{cadmosBonusPct}% permanent</p>
                  </div>
                  <button disabled>Gravé</button>
                </article>
              ))}
            </div>
          )}

          <p className="body-copy" style={{ marginTop: '0.6rem' }}>Âges disponibles à graver :</p>
          {cadmosCandidates.length === 0 ? (
            <p className="body-copy">
              <em>Aucun Âge à graver — nomme des Âges pendant un cycle sous le Mythe de Cadmos, puis reviens ici après l'effondrement.</em>
            </p>
          ) : (
            <div className="upgrade-grid">
              {cadmosCandidates.map((entry) => (
                <article key={entry.id} className="upgrade">
                  <div>
                    <h3>{entry.name}</h3>
                    <p className="effect-line">{entry.orientationLabel} +{cadmosBonusPct}% permanent</p>
                  </div>
                  <button
                    disabled={cadmosFull}
                    onClick={() => engraveCadmosEpitaph(entry.id)}
                    title={cadmosFull ? `Maximum de ${CADMOS_MAX_PERMANENT_EPITAPHS} épitaphes atteint` : "Graver cette épitaphe de façon permanente"}
                  >
                    {cadmosFull ? "Complet" : "Graver"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grand Reset Panel */}
      <div className="panel grand-reset-panel" id="grandResetPanel">
        <div className="panel-heading">
          <div>
            <h2>Grand Reset</h2>
          </div>
          <button
            id="grandResetBtn"
            className="grand-reset-btn"
            disabled={!isGrandResetUnlocked || grandResetCapped || grandResetBlocked}
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
            <strong>
              {grandResetCapped ? "Maximum atteint"
                : nextResetIsRagnarok ? "La Fin des Dieux"
                : !isGrandResetUnlocked ? "Upgrade Grand Reset (300 légitimité)"
                : [
                    nextResetLegitCost > 0 ? `${fmt(nextResetLegitCost)} légitimité` : null,
                    nextResetMythsRequired > 0 ? `${mythsDone}/${nextResetMythsRequired} Mythes complétés` : null
                  ].filter(Boolean).join(" + ") || "Prêt"}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
