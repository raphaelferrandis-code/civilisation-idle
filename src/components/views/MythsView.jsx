import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  MYTHS,
  RAGNAROK_ID,
  getMythById,
  isMythCompleted,
  isMythActive,
  isMythUnlocked
} from '../../game/data/myths.js';
import { activateMyth } from '../../game/core/actions.js';
import { tr } from '../../game/core/i18n.js';
import { state } from '../../game/core/state.js';
import {
  OLYMPUS_COMPLETION_SCORE,
  OLYMPUS_MIN_DOMINANT_SCORE,
  OLYMPUS_PROFILES,
  defaultOlympusState,
  dominantOlympusProfile,
  olympusMetrics,
  unlockedOlympusProfile
} from '../../game/data/olympus.js';

// Les indices de déblocage sont calculés dynamiquement (mythCountInAct) pour ne
// jamais désynchroniser avec data/myths.js si un Mythe change d'acte.
const ACT_META = {
  1: { num: { fr: "Acte I", en: "Act I" }, name: { fr: "Fondation", en: "Foundation" }, unlockFrom: null },
  2: { num: { fr: "Acte II", en: "Act II" }, name: { fr: "Domination", en: "Domination" }, unlockFrom: 1 },
  3: { num: { fr: "Acte III", en: "Act III" }, name: { fr: "Apocalypse", en: "Apocalypse" }, unlockFrom: 2 },
  ragnarok: { num: { fr: "Ragnarok", en: "Ragnarok" }, name: { fr: "La Fin", en: "The End" }, unlockFrom: "all" }
};

const mythCountInAct = (act) => MYTHS.filter(m => m.act === act).length;
function actUnlockHint(act) {
  const from = ACT_META[act]?.unlockFrom;
  if (from == null) return null;
  if (from === "all") return tr({ fr: "Completez les Mythes des Actes I, II et III", en: "Complete the Myths of Acts I, II and III" });
  return tr({
    fr: `Completez les ${mythCountInAct(from)} Mythes de l'Acte ${from === 1 ? "I" : "II"}`,
    en: `Complete the ${mythCountInAct(from)} Myths of Act ${from === 1 ? "I" : "II"}`
  });
}

const FALLBACK_OLYMPUS = defaultOlympusState(0);

export default function MythsView() {
  const activeMythId = useGameState(s => s.activeMythId);
  const gamePaused = useGameState(s => s.gamePaused);
  const ragnarokActiveConstraints = useGameState(s => s.ragnarokActiveConstraints || []);
  const olympusState = useGameState(s => s.olympus);

  const [modalMyth, setModalMyth] = useState(null);
  const [selectedBabelCat, setSelectedBabelCat] = useState("city");

  const activeMyth = activeMythId ? getMythById(activeMythId) : null;
  const ragnarokCompleted = isMythCompleted(RAGNAROK_ID);
  const olympus = olympusState || FALLBACK_OLYMPUS;
  const olympusDominant = dominantOlympusProfile(olympus);
  const olympusUnlocked = unlockedOlympusProfile(olympus);
  const olympusMetricValues = olympusMetrics(olympus);
  const olympusProgress = olympus.profileProgress || FALLBACK_OLYMPUS.profileProgress;

  const handleOpenModal = (myth) => {
    if (gamePaused) return;
    if (!isMythUnlocked(myth) || isMythCompleted(myth.id)) return;
    setModalMyth(myth);
    setSelectedBabelCat("city");
  };

  const handleConfirmPact = async () => {
    if (!modalMyth) return;
    const mythId = modalMyth.id;
    if (modalMyth.id === "mythe_de_babel") {
      state.babelCategory = selectedBabelCat;
    }
    setModalMyth(null);
    await activateMyth(mythId);
  };

  return (
    <section className="view active" id="mythView">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>{tr({ fr: 'Les Mythes', en: 'The Myths' })}</h2>
          </div>
        </div>

        <div className="myth-view-body">
          {/* Active Myth Banner */}
          {activeMyth && (
            <div id="activeMythBanner" className="active-myth-banner">
              <span className="label">{tr({ fr: 'Pacte actif ce cycle', en: 'Active Pact this cycle' })}</span>
              <strong className="active-myth-name">{tr(activeMyth.name)}</strong>
              <p className="active-myth-rule">{tr(activeMyth.description)}</p>
            </div>
          )}

          {activeMythId === RAGNAROK_ID && ragnarokActiveConstraints.length > 0 && (
            <div className="ragnarok-constraints-panel">
              <div className="ragnarok-constraints-heading">
                <span className="label">{tr({ fr: 'Contraintes simultanees', en: 'Simultaneous constraints' })}</span>
                <strong>{tr({ fr: 'La Fin rassemble tous les pactes', en: 'The End gathers all the pacts' })}</strong>
              </div>
              <ul>
                {ragnarokActiveConstraints.map((constraint, index) => (
                  <li key={`${constraint}-${index}`}>{constraint}</li>
                ))}
              </ul>
            </div>
          )}

          {ragnarokCompleted && (
            <div className="ragnarok-fresco-banner">
              <span className="label">{tr({ fr: 'Fresque complete', en: 'Fresco complete' })}</span>
              <strong>{tr({ fr: 'Tous les Mythes sont illumines.', en: 'All the Myths are illuminated.' })}</strong>
            </div>
          )}

          <div className="olympus-section">
            <div className="olympus-header">
              <div>
                <span className="label">{tr({ fr: 'Observation permanente', en: 'Permanent observation' })}</span>
                <h3>{tr({ fr: "L'Olympe", en: 'Olympus' })}</h3>
              </div>
              <span className={`olympus-state ${olympusUnlocked ? "unlocked" : ""}`}>
                {olympusUnlocked ? tr({ fr: 'Religion debloquee', en: 'Religion unlocked' }) : tr({ fr: 'Croyance emergente', en: 'Emerging belief' })}
              </span>
            </div>

            <div className="olympus-dominant">
              <span>{tr({ fr: 'Religion dominante', en: 'Dominant religion' })}</span>
              <strong>{(olympusUnlocked || olympusDominant.profile).name}</strong>
              <p>{(olympusUnlocked || olympusDominant.profile).description}</p>
              <small>
                {olympusUnlocked
                  ? tr({ fr: `Heritage actif: ${olympusUnlocked.heritageDescription}`, en: `Active heritage: ${olympusUnlocked.heritageDescription}` })
                  : tr({
                      fr: `Score actuel: ${olympusDominant.score}/100. Progression si score >= ${OLYMPUS_MIN_DOMINANT_SCORE}. Completion placeholder: ${Math.floor(olympusProgress[olympusDominant.profile.id] || 0)}/${OLYMPUS_COMPLETION_SCORE}.`,
                      en: `Current score: ${olympusDominant.score}/100. Progress if score >= ${OLYMPUS_MIN_DOMINANT_SCORE}. Completion placeholder: ${Math.floor(olympusProgress[olympusDominant.profile.id] || 0)}/${OLYMPUS_COMPLETION_SCORE}.`
                    })}
              </small>
            </div>

            <div className="olympus-profile-grid">
              {Object.values(OLYMPUS_PROFILES).map(profile => {
                const score = olympusDominant.scores[profile.id] || 0;
                const progress = olympusProgress[profile.id] || 0;
                return (
                  <div
                    key={profile.id}
                    className={`olympus-profile ${profile.id === olympusDominant.profile.id ? "dominant" : ""} ${olympusUnlocked?.id === profile.id ? "unlocked" : ""}`}
                  >
                    <span>{profile.short}</span>
                    <strong>{profile.name}</strong>
                    <div className="olympus-score-track">
                      <span style={{ width: `${Math.min(100, score)}%` }}></span>
                    </div>
                    <small>{score}/100 - {Math.floor(progress)}/{OLYMPUS_COMPLETION_SCORE}</small>
                  </div>
                );
              })}
            </div>

            <div className="olympus-metrics">
              <span>{tr({ fr: 'Effondrements volontaires:', en: 'Voluntary collapses:' })} {olympusMetricValues.collapseFrequency.toFixed(2)}/h</span>
              <span>{tr({ fr: 'Crises resolues:', en: 'Crises resolved:' })} {Math.round(olympusMetricValues.crisisResolutionRatio * 100)}%</span>
              <span>{tr({ fr: 'Idle:', en: 'Idle:' })} {Math.round(olympusMetricValues.idleRatio * 100)}%</span>
              <span>{tr({ fr: 'Rupture moyenne a la chute:', en: 'Average Rupture at collapse:' })} {Math.round(olympusMetricValues.averageCollapseRupture * 100)}%</span>
            </div>
          </div>

          {/* Myth Act List */}
          <div id="mythChallengeList" className={ragnarokCompleted ? "myth-fresco-complete" : ""}>
            {[1, 2, 3, "ragnarok"].map(act => {
              const mythsInAct = MYTHS.filter(m => m.act === act);
              const meta = ACT_META[act] || { num: { fr: String(act), en: String(act) }, name: { fr: "", en: "" } };
              const unlockHint = actUnlockHint(act);

              // Check if Act is unlocked
              let actUnlocked;
              if (act === 1) {
                actUnlocked = true;
              } else if (act === 2) {
                const a1 = MYTHS.filter(m => m.act === 1);
                actUnlocked = a1.length > 0 && a1.every(m => isMythCompleted(m.id));
              } else if (act === 3) {
                const a2 = MYTHS.filter(m => m.act === 2);
                actUnlocked = a2.length > 0 && a2.every(m => isMythCompleted(m.id));
              } else {
                const mains = MYTHS.filter(m => m.act === 1 || m.act === 2 || m.act === 3);
                actUnlocked = mains.length > 0 && mains.every(m => isMythCompleted(m.id));
              }

              const actCompleted = mythsInAct.length > 0 && mythsInAct.every(m => isMythCompleted(m.id));

              return (
                <div
                  key={act}
                  className={`myth-act ${!actUnlocked ? "myth-act-locked" : ""} ${actCompleted ? "myth-act-completed" : ""}`}
                >
                  <div className="myth-act-header">
                    <span className="myth-act-num">{tr(meta.num)}</span>
                    <span className="myth-act-sep">-</span>
                    <span className="myth-act-name">{tr(meta.name)}</span>
                    {!actUnlocked && unlockHint && (
                      <span className="myth-act-lock-hint">{tr({ fr: 'Verrouille', en: 'Locked' })} - {unlockHint}</span>
                    )}
                    {actCompleted && (
                      <span className="myth-act-lock-hint" style={{ color: 'var(--green)', opacity: 1 }}>
                        {tr({ fr: 'Acte accompli', en: 'Act completed' })}
                      </span>
                    )}
                  </div>

                  <div className="myth-cards-grid">
                    {mythsInAct.length === 0 && (
                      <p className="myth-locked-hint" style={{ gridColumn: '1 / -1', padding: '0.25rem 0', fontStyle: 'italic' }}>
                        {tr({ fr: "Les pactes de cet acte n'ont pas encore ete graves dans la pierre.", en: 'The pacts of this act have not yet been carved in stone.' })}
                      </p>
                    )}

                    {mythsInAct.map(myth => {
                      const unlocked = isMythUnlocked(myth);
                      const completed = isMythCompleted(myth.id);
                      const active = isMythActive(myth.id);

                      let statusClass = "myth-locked";
                      let statusLabel = tr({ fr: "Verrouille", en: "Locked" });
                      if (unlocked && completed) {
                        statusClass = "myth-completed";
                        statusLabel = tr({ fr: "Accompli", en: "Completed" });
                      } else if (unlocked && active) {
                        statusClass = "myth-active";
                        statusLabel = tr({ fr: "Actif", en: "Active" });
                      } else if (unlocked) {
                        statusClass = "myth-available";
                        statusLabel = tr({ fr: "Disponible", en: "Available" });
                      }

                      return (
                        <div key={myth.id} className={`myth-card ${statusClass}`}>
                          <div className="myth-card-header">
                            <span className="myth-name">{tr(myth.name)}</span>
                            <span className="myth-status-badge">{statusLabel}</span>
                          </div>

                          {unlocked ? (
                            <>
                              <p className="myth-rule">
                                <strong>{tr({ fr: 'Regle', en: 'Rule' })}</strong> {tr(myth.description)}
                              </p>
                              {completed ? (
                                <p className="myth-heritage-desc">
                                  <strong>{tr({ fr: 'Heritage', en: 'Heritage' })}</strong> {tr(myth.heritageDescription)}
                                </p>
                              ) : (
                                <>
                                  <p className="myth-objectif">
                                    <strong>{tr({ fr: 'Objectif', en: 'Objective' })}</strong> {tr(myth.objectif)}
                                  </p>
                                  <button
                                    className="myth-activate-btn"
                                    onClick={() => handleOpenModal(myth)}
                                  >
                                    {active ? tr({ fr: 'Pacte actif', en: 'Pact active' }) : tr({ fr: 'Sceller ce pacte', en: 'Seal this pact' })}
                                  </button>
                                </>
                              )}
                            </>
                          ) : (
                            <p className="myth-locked-hint">
                              {tr({ fr: "Completez l'acte precedent pour deverrouiller ce pacte.", en: 'Complete the previous act to unlock this pact.' })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {modalMyth && (
        <div className="modal-backdrop" onClick={() => setModalMyth(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <dialog open className="event-dialog myth-modal" style={{ display: 'block', position: 'static' }}>
              <span className="label">
                {ACT_META[modalMyth.act] ? tr(ACT_META[modalMyth.act].num) : modalMyth.act} - {ACT_META[modalMyth.act] ? tr(ACT_META[modalMyth.act].name) : ""}
              </span>
              <h2>{tr(modalMyth.name)}</h2>

              <div className="myth-modal-body">
                <div className="myth-modal-row">
                  <span className="myth-modal-label">{tr({ fr: 'Regle imposee', en: 'Imposed rule' })}</span>
                  <span>{tr(modalMyth.description)}</span>
                </div>
                <div className="myth-modal-row">
                  <span className="myth-modal-label">{tr({ fr: 'Objectif', en: 'Objective' })}</span>
                  <span>{tr(modalMyth.objectif)}</span>
                </div>
                <div className="myth-modal-row myth-modal-heritage">
                  <span className="myth-modal-label">{tr({ fr: 'Heritage promis', en: 'Promised heritage' })}</span>
                  <span>{tr(modalMyth.heritageDescription)}</span>
                </div>

                {/* Custom Options for Babel */}
                {modalMyth.id === "mythe_de_babel" && (
                  <div className="myth-modal-row">
                    <span className="myth-modal-label">{tr({ fr: 'Type de batiment', en: 'Building type' })}</span>
                    <div className="babel-category-choice" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {[
                        { value: "city", label: { fr: "Cite", en: "City" }, desc: { fr: "Nourriture, Commerce, Population", en: "Food, Trade, Population" } },
                        { value: "knowledge", label: { fr: "Savoir", en: "Knowledge" }, desc: { fr: "Connaissance, Academies, Archives", en: "Knowledge, Academies, Archives" } },
                        { value: "infra", label: { fr: "Infrastructure", en: "Infrastructure" }, desc: { fr: "Aqueducs, Routes, Batisseurs", en: "Aqueducts, Roads, Builders" } }
                      ].map(c => (
                        <label key={c.value} className="babel-cat-option" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="babelCategory"
                            value={c.value}
                            checked={selectedBabelCat === c.value}
                            onChange={() => setSelectedBabelCat(c.value)}
                          />
                          <div>
                            <span className="babel-cat-name" style={{ fontWeight: 'bold' }}>{tr(c.label)}</span>
                            <span className="babel-cat-desc" style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)' }}>{tr(c.desc)}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <p className="myth-modal-warning" style={{ color: 'var(--red)', marginTop: '1rem', fontSize: '0.9rem' }}>
                {activeMythId && activeMythId !== modalMyth.id
                  ? tr({
                      fr: `Le pacte "${activeMyth?.name ? tr(activeMyth.name) : 'en cours'}" est deja actif ce cycle et sera abandonne. Le cycle sera reinitialise.`,
                      en: `The pact "${activeMyth?.name ? tr(activeMyth.name) : 'in progress'}" is already active this cycle and will be abandoned. The cycle will be reset.`
                    })
                  : activeMythId === modalMyth.id
                  ? tr({ fr: `Ce pacte est deja actif. Confirmer va reinitialiser entierement le cycle en cours.`, en: `This pact is already active. Confirming will fully reset the current cycle.` })
                  : tr({ fr: `Le cycle en cours sera entierement reinitialise (ressources, batiments, jauges).`, en: `The current cycle will be fully reset (resources, buildings, gauges).` })}
              </p>

              <menu className="choice-menu" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button className="myth-confirm-btn" onClick={handleConfirmPact}>
                  {tr({ fr: 'Sceller ce pacte', en: 'Seal this pact' })}
                </button>
                <button type="button" onClick={() => setModalMyth(null)}>
                  {tr({ fr: 'Annuler', en: 'Cancel' })}
                </button>
              </menu>
            </dialog>
          </div>
        </div>
      )}
    </section>
  );
}
