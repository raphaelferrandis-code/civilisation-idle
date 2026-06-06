import { useState, useEffect, useRef } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import {
  getNotifEnabled,
  setNotifEnabled,
  getMusicEnabled,
  setMusicEnabled,
  getMusicVolume,
  setMusicVolume,
  getMusicActiveTabOnly,
  setMusicActiveTabOnly
} from '../game/core/main.js';
import { numberFormatMode, setNumberFormatMode } from '../game/core/utils.js';
import {
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold
} from '../game/core/actions.js';
import { SAVE_KEY, defaultState, setState, invalidateRenderCache, render } from '../game/core/state.js';

export default function OptionsDialog({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [activeGroup, setActiveGroup] = useState("display"); // "display", "sound", "other", "script", "automates"
  const [optionRevision, setOptionRevision] = useState(0);

  const phoenixHeritage = useGameState(s => s.phoenixHeritage);
  const hephHeritage = useGameState(s => s.hephHeritage);
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
    setState(defaultState());
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
        </div>

        <menu style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onClose}>Fermer</button>
        </menu>
      </form>
    </dialog>
  );
}
