import React, { useState } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import {
  MYTHS,
  getMythById,
  isMythCompleted,
  isMythActive,
  isMythUnlocked
} from '../game/data/myths.js';
import { activateMyth } from '../game/core/actions.js';
import { state } from '../game/core/state.js';
import { fmt } from '../game/core/utils.js';

const ACT_META = {
  1: { num: "Acte I", name: "Fondation", unlockHint: null },
  2: { num: "Acte II", name: "Domination", unlockHint: "Complétez les 2 Mythes de l'Acte I" },
  3: { num: "Acte III", name: "Apocalypse", unlockHint: "Complétez les 4 Mythes de l'Acte II" },
  ragnarok: { num: "Ragnarok", name: "La Fin", unlockHint: "Complétez les 9 Mythes des Actes I, II et III" }
};

export default function MythsView() {
  const activeMythId = useGameState(s => s.activeMythId);
  const mythsCompleted = useGameState(s => ({ ...s.mythsCompleted }));
  const gamePaused = useGameState(s => s.gamePaused);

  const [modalMyth, setModalMyth] = useState(null);
  const [selectedBabelCat, setSelectedBabelCat] = useState("city");

  const activeMyth = activeMythId ? getMythById(activeMythId) : null;

  const handleOpenModal = (myth) => {
    if (gamePaused) return;
    if (!isMythUnlocked(myth) || isMythCompleted(myth.id)) return;
    setModalMyth(myth);
    setSelectedBabelCat("city");
  };

  const handleConfirmPact = () => {
    if (!modalMyth) return;
    if (modalMyth.id === "mythe_de_babel") {
      state.babelCategory = selectedBabelCat;
    }
    activateMyth(modalMyth.id);
    setModalMyth(null);
  };

  return (
    <section className="view active" id="mythView">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="label">Défis permanents</span>
            <h2>Les Mythes</h2>
          </div>
        </div>

        <div className="myth-view-body">
          {/* Active Myth Banner */}
          {activeMyth && (
            <div id="activeMythBanner" className="active-myth-banner">
              <span className="label">Pacte actif ce cycle</span>
              <strong className="active-myth-name">{activeMyth.name}</strong>
              <p className="active-myth-rule">{activeMyth.description}</p>
            </div>
          )}

          {/* Myth Act List */}
          <div id="mythChallengeList">
            {[1, 2, 3, "ragnarok"].map(act => {
              const mythsInAct = MYTHS.filter(m => m.act === act);
              const meta = ACT_META[act] || { num: String(act), name: "", unlockHint: null };

              // Check if Act is unlocked
              let actUnlocked = false;
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
                    <span className="myth-act-num">{meta.num}</span>
                    <span className="myth-act-sep">·</span>
                    <span className="myth-act-name">{meta.name}</span>
                    {!actUnlocked && meta.unlockHint && (
                      <span className="myth-act-lock-hint">🔒 {meta.unlockHint}</span>
                    )}
                    {actCompleted && (
                      <span className="myth-act-lock-hint" style={{ color: 'var(--green)', opacity: 1 }}>
                        ✦ Acte accompli
                      </span>
                    )}
                  </div>

                  <div className="myth-cards-grid">
                    {mythsInAct.length === 0 && (
                      <p className="myth-locked-hint" style={{ gridColumn: '1 / -1', padding: '0.25rem 0', fontStyle: 'italic' }}>
                        Les pactes de cet acte n'ont pas encore été gravés dans la pierre.
                      </p>
                    )}

                    {mythsInAct.map(myth => {
                      const unlocked = isMythUnlocked(myth);
                      const completed = isMythCompleted(myth.id);
                      const active = isMythActive(myth.id);

                      let statusClass = "myth-locked";
                      let statusLabel = "Verrouillé";
                      if (unlocked && completed) {
                        statusClass = "myth-completed";
                        statusLabel = "Accompli ✦";
                      } else if (unlocked && active) {
                        statusClass = "myth-active";
                        statusLabel = "Actif";
                      } else if (unlocked) {
                        statusClass = "myth-available";
                        statusLabel = "Disponible";
                      }

                      return (
                        <div key={myth.id} className={`myth-card ${statusClass}`}>
                          <div className="myth-card-header">
                            <span className="myth-name">{myth.name}</span>
                            <span className="myth-status-badge">{statusLabel}</span>
                          </div>

                          {unlocked ? (
                            <>
                              <p className="myth-rule">
                                <strong>Règle</strong> {myth.description}
                              </p>
                              {completed ? (
                                <p className="myth-heritage-desc">
                                  <strong>Héritage</strong> {myth.heritageDescription}
                                </p>
                              ) : (
                                <>
                                  <p className="myth-objectif">
                                    <strong>Objectif</strong> {myth.objectif}
                                  </p>
                                  <button
                                    className="myth-activate-btn"
                                    onClick={() => handleOpenModal(myth)}
                                  >
                                    {active ? "Pacte actif ↺" : "Sceller ce pacte"}
                                  </button>
                                </>
                              )}
                            </>
                          ) : (
                            <p className="myth-locked-hint">
                              Complétez l'acte précédent pour déverrouiller ce pacte.
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
                {ACT_META[modalMyth.act]?.num || modalMyth.act} · {ACT_META[modalMyth.act]?.name || ""}
              </span>
              <h2>{modalMyth.name}</h2>
              
              <div className="myth-modal-body">
                <div className="myth-modal-row">
                  <span className="myth-modal-label">Règle imposée</span>
                  <span>{modalMyth.description}</span>
                </div>
                <div className="myth-modal-row">
                  <span className="myth-modal-label">Objectif</span>
                  <span>{modalMyth.objectif}</span>
                </div>
                <div className="myth-modal-row myth-modal-heritage">
                  <span className="myth-modal-label">Héritage promis</span>
                  <span>{modalMyth.heritageDescription}</span>
                </div>

                {/* Custom Options for Babel */}
                {modalMyth.id === "mythe_de_babel" && (
                  <div className="myth-modal-row">
                    <span className="myth-modal-label">Type de bâtiment</span>
                    <div className="babel-category-choice" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {[
                        { value: "city", label: "Cité", desc: "Nourriture, Commerce, Population" },
                        { value: "knowledge", label: "Savoir", desc: "Connaissance, Académies, Archives" },
                        { value: "infra", label: "Infrastructure", desc: "Aqueducs, Routes, Bâtisseurs" }
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
                            <span className="babel-cat-name" style={{ fontWeight: 'bold' }}>{c.label}</span>
                            <span className="babel-cat-desc" style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)' }}>{c.desc}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <p className="myth-modal-warning" style={{ color: 'var(--red)', marginTop: '1rem', fontSize: '0.9rem' }}>
                {activeMythId && activeMythId !== modalMyth.id
                  ? `Le pacte "${activeMyth.name}" est déjà actif ce cycle et sera abandonné. Le cycle sera réinitialisé.`
                  : activeMythId === modalMyth.id
                  ? `Ce pacte est déjà actif. Confirmer va réinitialiser entièrement le cycle en cours.`
                  : `Le cycle en cours sera entièrement réinitialisé (ressources, bâtiments, jauges).`}
              </p>

              <menu className="choice-menu" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button className="myth-confirm-btn" onClick={handleConfirmPact}>
                  Sceller ce pacte
                </button>
                <button type="button" onClick={() => setModalMyth(null)}>
                  Annuler
                </button>
              </menu>
            </dialog>
          </div>
        </div>
      )}
    </section>
  );
}
