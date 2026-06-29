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
import { tr } from '../../game/core/i18n.js';
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
    ? tr({ fr: `palier atteint (+${dynPalier})`, en: `tier reached (+${dynPalier})` })
    : tr({ fr: `dans ${dynastiesToNextPalier} dynasties (+${dynPalier + 1})`, en: `in ${dynastiesToNextPalier} dynasties (+${dynPalier + 1})` });

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
            <h2>{tr({ fr: "Dynastie", en: "Dynasty" })}</h2>
          </div>
          <button
            id="dynastyBtn"
            onClick={foundDynasty}
            disabled={legitGain <= 0}
          >
            {tr({ fr: "Fonder", en: "Found" })}
          </button>
        </div>
        <p className="body-copy">
          {tr({
            fr: "Plusieurs effondrements racontent une légende. Une dynastie se fonde quand les chroniques ont assez de matière pour fabriquer une légitimité durable.",
            en: "Several collapses tell a legend. A dynasty is founded when the chronicles hold enough material to forge lasting legitimacy."
          })}
        </p>
        <div className="prestige-stats">
          <div>
            <span>{tr({ fr: "Prochaine fondation", en: "Next founding" })}</span>
            <strong>{tr({ fr: `${fmt(dynastyThreshold)} ruines`, en: `${fmt(dynastyThreshold)} ruins` })}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Progression", en: "Progress" })}</span>
            <strong>
              {legitGain > 0
                ? tr({ fr: `+${fmt(legitGain)} légitimité possible`, en: `+${fmt(legitGain)} legitimacy possible` })
                : tr({ fr: `Manque ${fmt(D(dynastyThreshold).sub(ruins).max(0))} ruines`, en: `${fmt(D(dynastyThreshold).sub(ruins).max(0))} ruins short` })}
            </strong>
          </div>
          <div>
            <span>{tr({ fr: "Légitimité gagnée", en: "Legitimacy gained" })}</span>
            <strong>{fmt(legitGain)}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Légitimité", en: "Legitimacy" })}</span>
            <strong>{fmt(legitimacy)}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Palier dynastique", en: "Dynastic tier" })}</span>
            <strong>{dynPalier > 0 ? tr({ fr: `+${dynPalier} / fondation`, en: `+${dynPalier} / founding` }) : tr({ fr: "+0 / fondation", en: "+0 / founding" })}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Prochain palier", en: "Next tier" })}</span>
            <strong>{nextPalierText}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Institutions", en: "Institutions" })}</span>
            <strong>x{fmt(institutionMultiplier())}</strong>
          </div>
        </div>
        <div className="doctrine-display">
          <span>{activeDoctrine ? activeDoctrine.name : tr({ fr: "Aucune doctrine", en: "No doctrine" })}</span>
          <small>
            {activeDoctrine
              ? `${activeDoctrine.bonus} | ${activeDoctrine.penalty}`
              : tr({ fr: "À choisir lors de la prochaine fondation", en: "To be chosen at the next founding" })}
          </small>
        </div>
      </div>

      {/* Heritage Panel */}
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>{tr({ fr: "Héritage", en: "Heritage" })}</h2>
          </div>
        </div>
        <p className="body-copy">
          {tr({
            fr: "Ces améliorations survivent aux cycles et s'appliquent immédiatement. Achetées avec la légitimité gagnée lors des fondations de dynasties.",
            en: "These upgrades survive across cycles and apply immediately. Bought with the legitimacy gained when founding dynasties."
          })}
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
                      {isOwned ? tr({ fr: "Acquis", en: "Owned" }) : upgradeCostText(upgrade)}
                    </span>
                  </div>
                </div>
                <button
                  disabled={isOwned || !canBuy}
                  onClick={() => buyUpgrade(upgrade.id)}
                >
                  {isOwned ? tr({ fr: "Actif", en: "Active" }) : tr({ fr: "Acheter", en: "Buy" })}
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
              <h2>{tr({ fr: "Cadmos — Épitaphes permanentes", en: "Cadmus — Permanent Epitaphs" })}</h2>
            </div>
          </div>
          <p className="body-copy">
            {tr({
              fr: "Grave un Âge inscrit à la Chronique comme Nom de Pouvoir permanent : chaque épitaphe accorde ",
              en: "Engrave an Age recorded in the Chronicle as a permanent Name of Power: each epitaph grants "
            })}
            <strong>+{cadmosBonusPct}%</strong>
            {tr({
              fr: ` à son orientation (Nourriture, Trésor ou Stabilité), pour toujours. Maximum ${CADMOS_MAX_PERMANENT_EPITAPHS}.`,
              en: ` to its orientation (Food, Treasury or Stability), forever. Maximum ${CADMOS_MAX_PERMANENT_EPITAPHS}.`
            })}
          </p>
          <div className="prestige-stats">
            <div>
              <span>{tr({ fr: "Épitaphes gravées", en: "Epitaphs engraved" })}</span>
              <strong>{cadmosPermanentEpitaphs.length} / {CADMOS_MAX_PERMANENT_EPITAPHS}</strong>
            </div>
          </div>

          {cadmosPermanentEpitaphs.length > 0 && (
            <div className="upgrade-grid">
              {cadmosPermanentEpitaphs.map((entry) => (
                <article key={entry.id} className="upgrade bought">
                  <div>
                    <h3>{entry.name}</h3>
                    <p className="effect-line">{entry.orientationLabel} +{cadmosBonusPct}% {tr({ fr: "permanent", en: "permanent" })}</p>
                  </div>
                  <button disabled>{tr({ fr: "Gravé", en: "Engraved" })}</button>
                </article>
              ))}
            </div>
          )}

          <p className="body-copy" style={{ marginTop: '0.6rem' }}>{tr({ fr: "Âges disponibles à graver :", en: "Ages available to engrave:" })}</p>
          {cadmosCandidates.length === 0 ? (
            <p className="body-copy">
              <em>{tr({ fr: "Aucun Âge à graver — nomme des Âges pendant un cycle sous le Mythe de Cadmos, puis reviens ici après l'effondrement.", en: "No Age to engrave — name Ages during a cycle under the Myth of Cadmus, then come back here after the collapse." })}</em>
            </p>
          ) : (
            <div className="upgrade-grid">
              {cadmosCandidates.map((entry) => (
                <article key={entry.id} className="upgrade">
                  <div>
                    <h3>{entry.name}</h3>
                    <p className="effect-line">{entry.orientationLabel} +{cadmosBonusPct}% {tr({ fr: "permanent", en: "permanent" })}</p>
                  </div>
                  <button
                    disabled={cadmosFull}
                    onClick={() => engraveCadmosEpitaph(entry.id)}
                    title={cadmosFull ? tr({ fr: `Maximum de ${CADMOS_MAX_PERMANENT_EPITAPHS} épitaphes atteint`, en: `Maximum of ${CADMOS_MAX_PERMANENT_EPITAPHS} epitaphs reached` }) : tr({ fr: "Graver cette épitaphe de façon permanente", en: "Engrave this epitaph permanently" })}
                  >
                    {cadmosFull ? tr({ fr: "Complet", en: "Full" }) : tr({ fr: "Graver", en: "Engrave" })}
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
            {grandResetCapped ? tr({ fr: "Complet", en: "Full" }) : tr({ fr: "Reinitialiser", en: "Reset" })}
          </button>
        </div>
        <p className="body-copy">
          {tr({
            fr: "Efface toute progression : bâtiments, ruines, cycles, upgrades de ruines. En échange, chaque Grand Reset normal ajoute un bonus permanent x2 sur toute la production et les Ruines gagnées. Après Ragnarok, un 11e Grand Reset unique ajoute x4 supplémentaire aux Ruines gagnées.",
            en: "Wipes all progress: buildings, ruins, cycles, ruins upgrades. In exchange, each normal Grand Reset adds a permanent x2 bonus to all production and Ruins earned. After Ragnarok, a unique 11th Grand Reset adds an extra x4 to Ruins earned."
          })}
        </p>
        <div className="prestige-stats">
          <div>
            <span>Grand Resets</span>
            <strong>{grandResetCount} / {maxGrandResets}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Bonus actuel", en: "Current bonus" })}</span>
            <strong>x{Math.pow(2, grandResetCount).toFixed(0)} {tr({ fr: "prod & ruines", en: "prod & ruins" })}{ragnarokHeritage && grandResetCount >= 11 ? tr({ fr: " | x4 Ruines extra", en: " | x4 Ruins extra" }) : ""}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Bonus après", en: "Bonus after" })}</span>
            <strong>{grandResetCapped ? tr({ fr: "Maximum", en: "Maximum" }) : nextResetIsRagnarok ? tr({ fr: `x${Math.pow(2, nextGrandReset).toFixed(0)} prod & ruines | x4 Ruines extra`, en: `x${Math.pow(2, nextGrandReset).toFixed(0)} prod & ruins | x4 Ruins extra` }) : tr({ fr: `x${Math.pow(2, nextGrandReset).toFixed(0)} prod & ruines`, en: `x${Math.pow(2, nextGrandReset).toFixed(0)} prod & ruins` })}</strong>
          </div>
          <div>
            <span>{tr({ fr: "Requis", en: "Required" })}</span>
            <strong>
              {grandResetCapped ? tr({ fr: "Maximum atteint", en: "Maximum reached" })
                : nextResetIsRagnarok ? tr({ fr: "La Fin des Dieux", en: "The End of the Gods" })
                : !isGrandResetUnlocked ? tr({ fr: "Upgrade Grand Reset (300 légitimité)", en: "Grand Reset upgrade (300 legitimacy)" })
                : [
                    nextResetLegitCost > 0 ? tr({ fr: `${fmt(nextResetLegitCost)} légitimité`, en: `${fmt(nextResetLegitCost)} legitimacy` }) : null,
                    nextResetMythsRequired > 0 ? tr({ fr: `${mythsDone}/${nextResetMythsRequired} Mythes complétés`, en: `${mythsDone}/${nextResetMythsRequired} Myths completed` }) : null
                  ].filter(Boolean).join(" + ") || tr({ fr: "Prêt", en: "Ready" })}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
