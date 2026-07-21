import { useState } from 'react';
import { useDialogModal } from '../../hooks/useDialogModal.js';
import { useGameState } from '../../hooks/useGameState.js';
import {
  getNotifEnabled,
  setNotifEnabled,
  getMusicEnabled,
  setMusicEnabled,
  getMusicVolume,
  setMusicVolume,
  getMusicActiveTabOnly,
  setMusicActiveTabOnly
} from '../../game/core/main.js';
import { numberFormatMode, setNumberFormatMode } from '../../game/core/utils.js';
import { dayNightMode, setDayNightMode } from '../../game/map/dayNightMode.js';
import { getLang, setLang, t, tr } from '../../game/core/i18n.js';
import {
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold
} from '../../game/core/actions.js';
import { SAVE_KEY, defaultState, setState, invalidateRenderCache, render, save } from '../../game/core/state.js';
import { cloudWipe, cloudSaveDir, cloudSaveStatus } from '../../game/core/cloudSave.js';

export default function OptionsDialog({ isOpen, onClose }) {
  const dialogRef = useDialogModal(isOpen);
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


  const handleWipe = () => {
    if (!confirm(tr({ fr: "Recommencer depuis le tout premier feu ?", en: "Start over from the very first fire?" }))) return;
    localStorage.removeItem(SAVE_KEY);
    // Efface aussi le fichier nuage (Google Drive, .exe) : sinon l'ancienne
    // partie — forcément « plus avancée » — ressusciterait au prochain lancement.
    cloudWipe();
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

  const handleDayNightChange = (mode) => {
    setDayNightMode(mode);
    setOptionRevision((revision) => revision + 1);
  };

  const handleLangChange = (next) => {
    if (next === getLang()) return;
    setLang(next);
    // On sauvegarde avant de recharger : le rechargement garantit que TOUT le
    // texte (y compris les composants mémoïsés qui ne réagissent pas à un simple
    // render()) reprend la nouvelle langue, sans risque d'affichage mixte.
    save();
    window.location.reload();
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
        <h2>{tr({ fr: "Options", en: "Options" })}</h2>

        <div className="options-tabs" aria-label={tr({ fr: "Categories d'options", en: "Option categories" })}>
          <button
            className={`options-tab ${activeGroup === 'display' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('display')}
          >
            {tr({ fr: "Affichage", en: "Display" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'sound' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('sound')}
          >
            {tr({ fr: "Son", en: "Sound" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'shortcuts' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('shortcuts')}
          >
            {tr({ fr: "Raccourcis", en: "Shortcuts" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'other' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('other')}
          >
            {tr({ fr: "Autre", en: "Other" })}
          </button>

          {phoenixHeritage && (
            <button
              className={`options-tab ${activeGroup === 'script' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveGroup('script')}
            >
              {tr({ fr: "Automatisation", en: "Automation" })}
            </button>
          )}

          {hephHeritage && (
            <button
              className={`options-tab ${activeGroup === 'automates' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveGroup('automates')}
            >
              {tr({ fr: "Automates", en: "Automatons" })}
            </button>
          )}

        </div>

        <div className="options-rows" style={{ marginTop: '1rem', minHeight: '220px' }}>
          {/* DISPLAY PANEL */}
          {activeGroup === 'display' && (
            <>
              <div className="options-row">
                <div>
                  <span>{t('language')}</span>
                  <small>{t('languageHint')}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${getLang() === 'fr' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleLangChange('fr')}
                  >
                    Français
                  </button>
                  <button
                    className={`format-option ${getLang() === 'en' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleLangChange('en')}
                  >
                    English
                  </button>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Notifications du fil", en: "Feed notifications" })}</span>
                  <small>{tr({ fr: "Messages des habitants en haut de l'ecran", en: "Citizen messages at the top of the screen" })}</small>
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${notifEnabled ? 'on' : 'off'}`}
                  onClick={handleNotifToggle}
                >
                  {notifEnabled ? tr({ fr: "Active", en: "On" }) : tr({ fr: "Desactive", en: "Off" })}
                </button>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Format des nombres", en: "Number format" })}</span>
                  <small>{tr({ fr: "Affichage compact, complet ou scientifique des ressources", en: "Compact, full or scientific display of resources" })}</small>
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

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Cycle jour/nuit", en: "Day/night cycle" })}</span>
                  <small>{tr({ fr: "Ambiance de la carte : cycle automatique, ou figée en plein jour / de nuit", en: "Map ambience: automatic cycle, or locked to daytime / nighttime" })}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${dayNightMode === 'auto' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleDayNightChange('auto')}
                  >
                    {tr({ fr: "Auto", en: "Auto" })}
                  </button>
                  <button
                    className={`format-option ${dayNightMode === 'day' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleDayNightChange('day')}
                  >
                    {tr({ fr: "Jour", en: "Day" })}
                  </button>
                  <button
                    className={`format-option ${dayNightMode === 'night' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleDayNightChange('night')}
                  >
                    {tr({ fr: "Nuit", en: "Night" })}
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
                  <span>{tr({ fr: "Musique", en: "Music" })}</span>
                  <small>{tr({ fr: "Ambiance sonore de fond", en: "Background ambient sound" })}</small>
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${musicEnabled ? 'on' : 'off'}`}
                  onClick={handleMusicToggle}
                >
                  {musicEnabled ? tr({ fr: "Active", en: "On" }) : tr({ fr: "Desactive", en: "Off" })}
                </button>
              </div>

              <div className="options-row options-row-volume">
                <div>
                  <span>{tr({ fr: "Volume", en: "Volume" })}</span>
                  <small>{tr({ fr: "Niveau de la musique de fond", en: "Background music level" })}</small>
                </div>
                <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(musicVolume * 100)}
                    onChange={handleVolumeChange}
                    aria-label={tr({ fr: "Volume de la musique", en: "Music volume" })}
                  />
                  <strong style={{ minWidth: '40px', textAlign: 'right' }}>
                    {Math.round(musicVolume * 100)}%
                  </strong>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Musique seulement en onglet actif", en: "Music only in active tab" })}</span>
                  <small>{tr({ fr: "Met la musique en pause quand le jeu est en arriere-plan", en: "Pauses the music when the game is in the background" })}</small>
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${musicActiveTabOnly ? 'on' : 'off'}`}
                  onClick={handleActiveTabToggle}
                >
                  {musicActiveTabOnly ? tr({ fr: "Actif", en: "On" }) : tr({ fr: "Inactif", en: "Off" })}
                </button>
              </div>
            </>
          )}

          {/* SHORTCUTS PANEL */}
          {activeGroup === 'shortcuts' && (
            <>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Tout acheter", en: "Buy all" })}</span>
                  <small>{tr({ fr: "Achète Moteurs + Savoir + Infrastructure, du plus cher au moins cher, en cascade", en: "Buys Engines + Knowledge + Infrastructure, most expensive first, cascading" })}</small>
                </div>
                <kbd className="shortcut-kbd">E</kbd>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Tout acheter : Moteurs", en: "Buy all: Engines" })}</span>
                  <small>{tr({ fr: "Achète tous les Moteurs abordables, du plus cher au moins cher", en: "Buys all affordable Engines, most expensive first" })}</small>
                </div>
                <kbd className="shortcut-kbd">M</kbd>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Tout acheter : Savoir", en: "Buy all: Knowledge" })}</span>
                  <small>{tr({ fr: "Achète tout le Savoir abordable, du plus cher au moins cher", en: "Buys all affordable Knowledge, most expensive first" })}</small>
                </div>
                <kbd className="shortcut-kbd">S</kbd>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Tout acheter : Infrastructure", en: "Buy all: Infrastructure" })}</span>
                  <small>{tr({ fr: "Achète toute l'Infrastructure abordable, du plus cher au moins cher", en: "Buys all affordable Infrastructure, most expensive first" })}</small>
                </div>
                <kbd className="shortcut-kbd">I</kbd>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Ouvrir les options", en: "Open options" })}</span>
                  <small>{tr({ fr: "Ouvre ce menu à tout moment", en: "Opens this menu at any time" })}</small>
                </div>
                <kbd className="shortcut-kbd">{tr({ fr: "Échap", en: "Esc" })}</kbd>
              </div>
            </>
          )}

          {/* OTHER PANEL */}
          {activeGroup === 'other' && (
            <div className="options-row">
              <div>
                <span>{tr({ fr: "Sauvegarde nuage", en: "Cloud save" })}</span>
                <small>
                  {!cloudSaveDir()
                    ? tr({
                        fr: "Inactive : « Google Drive pour ordinateur » n'est pas détecté sur ce poste (fonction réservée à la version installée du jeu).",
                        en: "Inactive: “Google Drive for desktop” was not detected on this device (feature only available in the installed build)."
                      })
                    : cloudSaveStatus() === 'unreadable'
                    ? tr({
                        fr: `En pause : la partie déjà dans ${cloudSaveDir()} n'a pas pu être lue (Drive hors ligne ou fichier pas encore téléchargé). Rien n'est envoyé tant qu'elle reste illisible — ta partie du nuage est intacte. Vérifie que Google Drive est connecté, puis relance le jeu.`,
                        en: `Paused: the save already in ${cloudSaveDir()} could not be read (Drive offline, or the file is not downloaded yet). Nothing is uploaded while it stays unreadable — your cloud save is untouched. Check that Google Drive is connected, then restart the game.`
                      })
                    : tr({
                        fr: `Active : la partie suit ton Google Drive (${cloudSaveDir()}) — lance le jeu sur un autre poste équipé, elle t'y attend.`,
                        en: `Active: the save follows your Google Drive (${cloudSaveDir()}) — launch the game on another equipped device and it will be there.`
                      })}
                </small>
              </div>
            </div>
          )}
          {activeGroup === 'other' && (
            <div className="options-row options-row-danger">
              <div>
                <span>{tr({ fr: "Reinitialiser la partie", en: "Reset the game" })}</span>
                <small>{tr({ fr: "Efface toute la progression - irreversible", en: "Erases all progress - irreversible" })}</small>
              </div>
              <button
                type="button"
                className="danger"
                onClick={handleWipe}
              >
                {tr({ fr: "Reset", en: "Reset" })}
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
                    {r.enabled ? tr({ fr: "Actif", en: "On" }) : tr({ fr: "Inactif", en: "Off" })}
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
                      {r.enabled ? tr({ fr: "Actif", en: "On" }) : tr({ fr: "Inactif", en: "Off" })}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* La Doctrine de crise vit désormais dans l'onglet Effondrement
              (CrisisDoctrinePanel), sous les Foyers de tension. */}
        </div>

        <menu style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onClose}>{tr({ fr: "Fermer", en: "Close" })}</button>
        </menu>
      </form>
    </dialog>
  );
}
