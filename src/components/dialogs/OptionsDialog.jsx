import { useState, useEffect, useRef } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  getNotifEnabled,
  setNotifEnabled,
  getMusicEnabled,
  setMusicEnabled,
  getMusicVolume,
  setMusicVolume,
  getMusicActiveTabOnly,
  setMusicActiveTabOnly,
  idleCapSeconds
} from '../../game/core/main.js';
import { numberFormatMode, setNumberFormatMode } from '../../game/core/utils.js';
import {
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold,
  setCrisisPosture,
  setAutoCollapseConfig
} from '../../game/core/actions.js';
import { SAVE_KEY, defaultState, setState, invalidateRenderCache, render } from '../../game/core/state.js';

export default function OptionsDialog({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [activeGroup, setActiveGroup] = useState("display"); // "display", "sound", "other", "script", "automates"
  const [optionRevision, setOptionRevision] = useState(0);

  const phoenixHeritage = useGameState(s => s.phoenixHeritage);
  const hephHeritage = useGameState(s => s.hephHeritage);
  const conseilDeCrise = useGameState(s => Boolean(s.upgrades.conseil_de_crise));
  const editEffondrement = useGameState(s => Boolean(s.upgrades.edit_effondrement));
  const crisisDoctrine = useGameState(s => s.crisisDoctrine) || {};
  const autoCollapse = crisisDoctrine.autoCollapse || {};
  // Rules lists. optionRevision force les controles mutables a se recalculer.
  void optionRevision;
  const notifEnabled = getNotifEnabled();
  const musicEnabled = getMusicEnabled();
  const musicVolume = getMusicVolume();
  const musicActiveTabOnly = getMusicActiveTabOnly();
  const formatMode = numberFormatMode;
  const autoScriptRules = getAutoScriptRules();
  const automateRules = getAutomateRules();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleWipe = () => {
    if (!confirm("Recommencer depuis le tout premier feu ?")) return;
    localStorage.removeItem(SAVE_KEY);
    invalidateRenderCache("all");
    setState(defaultState());
    render();
    onClose();
  };

  const handleFormatChange = (format) => {
    setNumberFormatMode(format);
    setOptionRevision((revision) => revision + 1);
    invalidateRenderCache("all");
    render();
  };

  const handleNotifToggle = () => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    setOptionRevision((revision) => revision + 1);
  };

  const handleMusicToggle = () => {
    const next = !musicEnabled;
    setMusicEnabled(next);
    setOptionRevision((revision) => revision + 1);
  };

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value) / 100;
    setMusicVolume(next);
    setOptionRevision((revision) => revision + 1);
  };

  const handleActiveTabToggle = () => {
    const next = !musicActiveTabOnly;
    setMusicActiveTabOnly(next);
    setOptionRevision((revision) => revision + 1);
  };

  const handleAutoScriptThreshold = (id, value) => {
    setAutoScriptThreshold(id, value);
    setOptionRevision((revision) => revision + 1);
  };

  const handleAutoScriptToggle = (id) => {
    toggleAutoScriptRule(id);
    setOptionRevision((revision) => revision + 1);
  };

  const handleAutomateThreshold = (id, value) => {
    setAutomateThreshold(id, value);
    setOptionRevision((revision) => revision + 1);
  };

  const handleAutomateToggle = (id) => {
    toggleAutomate(id);
    setOptionRevision((revision) => revision + 1);
  };

  const handleSetPosture = (palier, stance) => {
    setCrisisPosture(palier, stance);
    setOptionRevision((revision) => revision + 1);
  };

  const handleAutoCollapse = (patch) => {
    setAutoCollapseConfig(patch);
    setOptionRevision((revision) => revision + 1);
  };

  const handleDialogClick = (event) => {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
    if (!isInDialog) onClose();
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog options-dialog"
      onClick={handleDialogClick}
      onClose={onClose}
    >
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); onClose(); }}>
        <h2>Options</h2>

        <div className="options-tabs" aria-label="Categories d'options">
          <button
            className={`options-tab ${activeGroup === 'display' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('display')}
          >
            Affichage
          </button>
          <button
            className={`options-tab ${activeGroup === 'sound' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('sound')}
          >
            Son
          </button>
          <button
            className={`options-tab ${activeGroup === 'other' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('other')}
          >
            Autre
          </button>
          
          {phoenixHeritage && (
            <button
              className={`options-tab ${activeGroup === 'script' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveGroup('script')}
            >
              Automatisation
            </button>
          )}

          {hephHeritage && (
            <button
              className={`options-tab ${activeGroup === 'automates' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveGroup('automates')}
            >
              Automates
            </button>
          )}

          {conseilDeCrise && (
            <button
              className={`options-tab ${activeGroup === 'doctrine' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveGroup('doctrine')}
            >
              Doctrine de crise
            </button>
          )}
        </div>

        <div className="options-rows" style={{ marginTop: '1rem', minHeight: '220px' }}>
          {/* DISPLAY PANEL */}
          {activeGroup === 'display' && (
            <>
              <div className="options-row">
                <div>
                  <span>Notifications du fil</span>
                  <small>Messages des habitants en haut de l'ecran</small>
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${notifEnabled ? 'on' : 'off'}`}
                  onClick={handleNotifToggle}
                >
                  {notifEnabled ? "Active" : "Desactive"}
                </button>
              </div>

              <div className="options-row">
                <div>
                  <span>Format des nombres</span>
                  <small>Affichage compact, complet ou scientifique des ressources</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${formatMode === 'compact' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleFormatChange('compact')}
                  >
                    1.2M
                  </button>
                  <button
                    className={`format-option ${formatMode === 'full' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleFormatChange('full')}
                  >
                    1 200 000
                  </button>
                  <button
                    className={`format-option ${formatMode === 'scientific' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleFormatChange('scientific')}
                  >
                    1.20e6
                  </button>
                </div>
              </div>
            </>
          )}

          {/* SOUND PANEL */}
          {activeGroup === 'sound' && (
            <>
              <div className="options-row">
                <div>
                  <span>Musique</span>
                  <small>Ambiance sonore de fond</small>
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${musicEnabled ? 'on' : 'off'}`}
                  onClick={handleMusicToggle}
                >
                  {musicEnabled ? "Active" : "Desactive"}
                </button>
              </div>

              <div className="options-row options-row-volume">
                <div>
                  <span>Volume</span>
                  <small>Niveau de la musique de fond</small>
                </div>
                <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(musicVolume * 100)}
                    onChange={handleVolumeChange}
                    aria-label="Volume de la musique"
                  />
                  <strong style={{ minWidth: '40px', textAlign: 'right' }}>
                    {Math.round(musicVolume * 100)}%
                  </strong>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>Musique seulement en onglet actif</span>
                  <small>Met la musique en pause quand le jeu est en arriere-plan</small>
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${musicActiveTabOnly ? 'on' : 'off'}`}
                  onClick={handleActiveTabToggle}
                >
                  {musicActiveTabOnly ? "Actif" : "Inactif"}
                </button>
              </div>
            </>
          )}

          {/* OTHER PANEL */}
          {activeGroup === 'other' && (
            <div className="options-row options-row-danger">
              <div>
                <span>Reinitialiser la partie</span>
                <small>Efface toute la progression - irreversible</small>
              </div>
              <button
                type="button"
                className="danger"
                onClick={handleWipe}
              >
                Reset
              </button>
            </div>
          )}

          {/* SCRIPT PANEL (Unlocked by Phoenix Heritage) */}
          {activeGroup === 'script' && phoenixHeritage && (
            <div id="autoScriptPanel">
              {autoScriptRules.map(r => (
                <div key={r.id} className="options-row auto-script-rule">
                  <div>
                    <span className="auto-script-label">{r.label}</span>
                    <div className="auto-script-threshold">
                      <input
                        type="number"
                        className="auto-script-input"
                        value={r.threshold}
                        min="1"
                        max="9999"
                        onChange={(e) => handleAutoScriptThreshold(r.id, e.target.value)}
                      />
                      <span className="auto-script-unit">{r.unit}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${r.enabled ? 'on' : 'off'}`}
                    onClick={() => handleAutoScriptToggle(r.id)}
                  >
                    {r.enabled ? "Actif" : "Inactif"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* AUTOMATES PANEL (Unlocked by Hephaistos Heritage) */}
          {activeGroup === 'automates' && hephHeritage && (
            <div id="automatesPanel">
              {automateRules.map(r => {
                const hasThreshold = r.type === "crisis_action";
                return (
                  <div key={r.id} className="options-row auto-script-rule">
                    <div>
                      <span className="auto-script-label">{r.label}</span>
                      {hasThreshold && (
                        <div className="auto-script-threshold">
                          <input
                            type="number"
                            className="auto-script-input"
                            value={r.threshold}
                            min="1"
                            max="99"
                            onChange={(e) => handleAutomateThreshold(r.id, e.target.value)}
                          />
                          <span className="auto-script-unit">{r.unit}</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`toggle-btn ${r.enabled ? 'on' : 'off'}`}
                      onClick={() => handleAutomateToggle(r.id)}
                    >
                      {r.enabled ? "Actif" : "Inactif"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* DOCTRINE DE CRISE PANEL (Unlocked by conseil_de_crise) */}
          {activeGroup === 'doctrine' && conseilDeCrise && (
            <div id="crisisDoctrinePanel">
              {[
                { key: 'p25', label: 'Crise à 25 % de Rupture' },
                { key: 'p50', label: 'Crise à 50 % de Rupture' },
                { key: 'p75', label: 'Crise à 75 % de Rupture' }
              ].map(({ key, label }) => (
                <div key={key} className="options-row">
                  <div>
                    <span>{label}</span>
                    <small>Réponse automatique (sans interruption)</small>
                  </div>
                  <div className="number-format-control">
                    {[
                      { v: 'ask', t: 'Demander' },
                      { v: 'stabiliser', t: 'Stabiliser' },
                      { v: 'temporiser', t: 'Temporiser' }
                    ].map(({ v, t }) => (
                      <button
                        key={v}
                        type="button"
                        className={`format-option ${(crisisDoctrine[key] || 'ask') === v ? 'active' : ''}`}
                        onClick={() => handleSetPosture(key, v)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {editEffondrement ? (
                <>
                  <div className="options-row">
                    <div>
                      <span>Effondrement automatique</span>
                      <small>La cité tombe seule au moment choisi (héritage préservé)</small>
                    </div>
                    <button
                      type="button"
                      className={`toggle-btn ${autoCollapse.enabled ? 'on' : 'off'}`}
                      onClick={() => handleAutoCollapse({ enabled: !autoCollapse.enabled })}
                    >
                      {autoCollapse.enabled ? 'Actif' : 'Inactif'}
                    </button>
                  </div>

                  {autoCollapse.enabled && (
                    <>
                      <div className="options-row">
                        <div>
                          <span>Déclencheur</span>
                          <small>Quand effondrer automatiquement</small>
                        </div>
                        <div className="number-format-control">
                          {[
                            { v: 'rupture100', t: 'Rupture 100 %' },
                            { v: 'usure', t: 'Usure' },
                            { v: 'temps', t: 'Durée' }
                          ].map(({ v, t }) => (
                            <button
                              key={v}
                              type="button"
                              className={`format-option ${autoCollapse.trigger === v ? 'active' : ''}`}
                              onClick={() => handleAutoCollapse({ trigger: v })}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {autoCollapse.trigger === 'usure' && (
                        <div className="options-row">
                          <div>
                            <span>Seuil d'Usure</span>
                            <small>Effondre dès que l'Usure atteint ce pourcentage</small>
                          </div>
                          <div className="auto-script-threshold">
                            <input
                              type="number"
                              className="auto-script-input"
                              min="10"
                              max="100"
                              value={Math.round((autoCollapse.usureThreshold ?? 0.9) * 100)}
                              onChange={(e) => handleAutoCollapse({ usureThreshold: (parseFloat(e.target.value) || 0) / 100 })}
                            />
                            <span className="auto-script-unit">%</span>
                          </div>
                        </div>
                      )}

                      {autoCollapse.trigger === 'temps' && (
                        <div className="options-row">
                          <div>
                            <span>Durée de cycle</span>
                            <small>Effondre après ce nombre de minutes</small>
                          </div>
                          <div className="auto-script-threshold">
                            <input
                              type="number"
                              className="auto-script-input"
                              min="1"
                              max="1440"
                              value={Math.round((autoCollapse.timeSeconds ?? 600) / 60)}
                              onChange={(e) => handleAutoCollapse({ timeSeconds: (parseFloat(e.target.value) || 0) * 60 })}
                            />
                            <span className="auto-script-unit">min</span>
                          </div>
                        </div>
                      )}

                      <div className="options-row">
                        <div>
                          <span>Tenter de sauver avant</span>
                          <small>Rationner / Réformes avant d'effondrer si la crise est résoluble</small>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${autoCollapse.prepare ? 'on' : 'off'}`}
                          onClick={() => handleAutoCollapse({ prepare: !autoCollapse.prepare })}
                        >
                          {autoCollapse.prepare ? 'Oui' : 'Non'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="options-row">
                  <div>
                    <span>Effondrement automatique</span>
                    <small>Débloqué par l'upgrade de ruines « Édit d'effondrement ».</small>
                  </div>
                </div>
              )}

              <div className="options-row">
                <div>
                  <span>Gain hors-ligne</span>
                  <small>La cité produit et vieillit en ton absence, jusqu'à ce plafond. Étends-le avec « Veilleurs de nuit ».</small>
                </div>
                <strong>{Math.round(idleCapSeconds() / 3600)} h</strong>
              </div>
            </div>
          )}
        </div>

        <menu style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onClose}>Fermer</button>
        </menu>
      </form>
    </dialog>
  );
}
