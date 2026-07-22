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
import { qualityMode, setQualityMode } from '../../game/map/qualityMode.js';
import { ambianceMode, setAmbianceMode } from '../../game/map/ambianceMode.js';
import { weatherMode, setWeatherMode } from '../../game/map/weatherMode.js';
import { seasonMode, setSeasonMode } from '../../game/map/seasonMode.js';
import { applyCityMapQuality } from '../../game/map/cityMapRuntime.js';
import { getLang, setLang, t, tr } from '../../game/core/i18n.js';
import {
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold,
  setAutomateField
} from '../../game/core/actions.js';
import { SAVE_KEY, defaultState, setState, invalidateRenderCache, render, save, AUTOMATE_FIELD_BOUNDS } from '../../game/core/state.js';
import { cloudWipe, cloudSaveDir, cloudSaveStatus, cloudSyncInfo } from '../../game/core/cloudSave.js';
import { requestChoiceDialog } from '../../game/core/choiceDialog.js';

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


  // SEUL geste qui garde une confirmation bloquante, et c'est voulu : il efface
  // la partie ET le fichier nuage. Mais elle passe par ChoiceDialog et non par le
  // confirm() natif, qui volait le focus, ignorait la langue du jeu et ne gérait
  // pas le double Échap de Chromium. Deux étapes, la seconde nommant ce qui part.
  const handleWipe = async () => {
    const first = await requestChoiceDialog({
      label: { fr: "Réinitialisation", en: "Reset" },
      title: tr({ fr: "Recommencer depuis le tout premier feu ?", en: "Start over from the very first fire?" }),
      body: tr({
        fr: "Toute la partie est effacée : cycles, Ruines, Mythes, Grands Resets. Rien n'est récupérable.",
        en: "The whole game is erased: cycles, Ruins, Myths, Great Resets. Nothing can be recovered."
      }),
      options: [
        { label: tr({ fr: "Annuler", en: "Cancel" }), value: "no" },
        { label: tr({ fr: "Continuer", en: "Continue" }), value: "yes" }
      ]
    });
    if (first?.value !== "yes") return;
    const second = await requestChoiceDialog({
      label: { fr: "Réinitialisation", en: "Reset" },
      title: tr({ fr: "Dernière confirmation", en: "Final confirmation" }),
      body: tr({
        fr: "La sauvegarde locale et le fichier nuage seront effacés tous les deux.",
        en: "Both the local save and the cloud file will be erased."
      }),
      options: [
        { label: tr({ fr: "Garder ma partie", en: "Keep my game" }), value: "no" },
        { label: tr({ fr: "Tout effacer", en: "Erase everything" }), value: "yes" }
      ]
    });
    if (second?.value !== "yes") return;
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

  const handleQualityChange = (mode) => {
    if (mode === qualityMode) return;
    setQualityMode(mode);
    // Rebranche les leviers (résolution / densité / fps) et invalide les bakes :
    // la carte reprendra avec les nouveaux réglages à la fermeture du dialogue.
    applyCityMapQuality();
    setOptionRevision((revision) => revision + 1);
  };

  // Vie de la carte : pas de bake à invalider ni de canvas à redimensionner, le
  // rendu relit CM.ambianceK à la frame suivante. D'où l'absence d'équivalent
  // applyCityMapQuality ici.
  const handleAmbianceChange = (mode) => {
    if (mode === ambianceMode) return;
    setAmbianceMode(mode);
    setOptionRevision((revision) => revision + 1);
  };

  const handleWeatherChange = (mode) => {
    if (mode === weatherMode) return;
    setWeatherMode(mode);
    setOptionRevision((revision) => revision + 1);
  };

  // Changer de saison invalide le bake du sol (l'herbe, les brins et les fleurs
  // en font partie) : la clé du bake porte la saison, la recuisson part donc
  // toute seule à la frame suivante, sans rien invalider à la main ici.
  const handleSeasonChange = (mode) => {
    if (mode === seasonMode) return;
    setSeasonMode(mode);
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

  const handleAutomateField = (id, field, value) => {
    setAutomateField(id, field, value);
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

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Qualité graphique", en: "Graphics quality" })}</span>
                  <small>{tr({ fr: "Préréglage de performance de la carte (résolution, densité d'habitants, fluidité). « Auto » s'adapte à votre appareil ; baissez d'un cran si la carte saccade au zoom ou au déplacement.", en: "Map performance preset (resolution, citizen density, smoothness). “Auto” adapts to your device; lower a notch if the map stutters when zooming or panning." })}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${qualityMode === 'auto' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleQualityChange('auto')}
                  >
                    {tr({ fr: "Auto", en: "Auto" })}
                  </button>
                  <button
                    className={`format-option ${qualityMode === 'high' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleQualityChange('high')}
                  >
                    {tr({ fr: "Élevée", en: "High" })}
                  </button>
                  <button
                    className={`format-option ${qualityMode === 'balanced' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleQualityChange('balanced')}
                  >
                    {tr({ fr: "Équilibrée", en: "Balanced" })}
                  </button>
                  <button
                    className={`format-option ${qualityMode === 'perf' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleQualityChange('perf')}
                  >
                    {tr({ fr: "Performance", en: "Performance" })}
                  </button>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Vie de la carte", en: "Map liveliness" })}</span>
                  <small>{tr({ fr: "Quantité de mouvement d'ambiance sur la carte (feuilles, lucioles, fontaines). Sans effet sur la netteté : la qualité sert la machine, ce réglage sert le confort. Baissez-le si le mouvement vous gêne ou si vous laissez le jeu tourner en fond.", en: "Amount of ambient motion on the map (leaves, fireflies, fountains). Does not affect sharpness: quality serves the machine, this setting serves comfort. Lower it if motion bothers you or you leave the game running in the background." })}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${ambianceMode === 'full' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleAmbianceChange('full')}
                  >
                    {tr({ fr: "Pleine", en: "Full" })}
                  </button>
                  <button
                    className={`format-option ${ambianceMode === 'sober' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleAmbianceChange('sober')}
                  >
                    {tr({ fr: "Sobre", en: "Sober" })}
                  </button>
                  <button
                    className={`format-option ${ambianceMode === 'none' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleAmbianceChange('none')}
                  >
                    {tr({ fr: "Aucune", en: "None" })}
                  </button>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Météo", en: "Weather" })}</span>
                  <small>{tr({ fr: "« Auto » fait passer une averse courte de temps en temps : la lumière baisse, il pleut, les rues se vident, puis le temps se dégage. Figez sur Dégagé si vous préférez une image stable.", en: "“Auto” brings a short shower now and then: the light dims, it rains, the streets empty, then it clears. Set to Clear if you prefer a stable image." })}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${weatherMode === 'auto' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleWeatherChange('auto')}
                  >
                    {tr({ fr: "Auto", en: "Auto" })}
                  </button>
                  <button
                    className={`format-option ${weatherMode === 'clear' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleWeatherChange('clear')}
                  >
                    {tr({ fr: "Dégagé", en: "Clear" })}
                  </button>
                  <button
                    className={`format-option ${weatherMode === 'rain' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleWeatherChange('rain')}
                  >
                    {tr({ fr: "Pluie", en: "Rain" })}
                  </button>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Saison", en: "Season" })}</span>
                  <small>{tr({ fr: "L'herbe, les fleurs et les feuillages changent de couleur au fil de quatre saisons très lentes. Seul repère de temps long de la carte : revenir après une longue absence montre une ville d'une autre couleur.", en: "Grass, flowers and foliage change color across four very slow seasons. The map's only marker of long time: coming back after a long absence shows a city of another color." })}</small>
                </div>
                <div className="number-format-control">
                  <button className={`format-option ${seasonMode === 'auto' ? 'active' : ''}`} type="button" onClick={() => handleSeasonChange('auto')}>
                    {tr({ fr: "Auto", en: "Auto" })}
                  </button>
                  <button className={`format-option ${seasonMode === 'spring' ? 'active' : ''}`} type="button" onClick={() => handleSeasonChange('spring')}>
                    {tr({ fr: "Printemps", en: "Spring" })}
                  </button>
                  <button className={`format-option ${seasonMode === 'summer' ? 'active' : ''}`} type="button" onClick={() => handleSeasonChange('summer')}>
                    {tr({ fr: "Été", en: "Summer" })}
                  </button>
                  <button className={`format-option ${seasonMode === 'autumn' ? 'active' : ''}`} type="button" onClick={() => handleSeasonChange('autumn')}>
                    {tr({ fr: "Automne", en: "Autumn" })}
                  </button>
                  <button className={`format-option ${seasonMode === 'winter' ? 'active' : ''}`} type="button" onClick={() => handleSeasonChange('winter')}>
                    {tr({ fr: "Hiver", en: "Winter" })}
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
                    : cloudSaveStatus() === 'newer'
                    ? tr({
                        fr: `En pause : la partie dans ${cloudSaveDir()} vient d'une version PLUS RÉCENTE du jeu. Pour ne pas la rétrograder, rien n'est envoyé depuis ce poste. Mets le jeu à jour ici, puis relance.`,
                        en: `Paused: the save in ${cloudSaveDir()} comes from a NEWER version of the game. To avoid downgrading it, nothing is uploaded from this device. Update the game here, then restart.`
                      })
                    : cloudSyncInfo().ok === false
                    ? tr({
                        fr: `Attention : la dernière écriture vers ${cloudSaveDir()} a échoué (dossier en lecture seule, quota Drive plein ou fichier verrouillé). Ta partie n'est peut-être plus répliquée — vérifie Google Drive.`,
                        en: `Warning: the last write to ${cloudSaveDir()} failed (read-only folder, full Drive quota, or a locked file). Your game may no longer be replicated — check Google Drive.`
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
                      {r.type === "buy_cheapest" && (
                        <div className="auto-script-threshold auto-script-fields">
                          <label title={tr({
                            fr: "Part de la ressource que l'automate ne touche pas. À 0 il vide la caisse, ce qui sabote les autres branches.",
                            en: "Share of the resource the automaton never touches. At 0 it empties the coffers, which starves the other branches."
                          })}>
                            <span className="auto-script-unit">{tr({ fr: "réserve", en: "reserve" })}</span>
                            <input
                              type="number"
                              className="auto-script-input"
                              value={r.reservePct}
                              min={AUTOMATE_FIELD_BOUNDS.reservePct[0]}
                              max={AUTOMATE_FIELD_BOUNDS.reservePct[1]}
                              onChange={(e) => handleAutomateField(r.id, 'reservePct', e.target.value)}
                            />
                            <span className="auto-script-unit">%</span>
                          </label>
                          <label title={tr({
                            fr: "Nombre d'achats par seconde. Volontairement bas : il pèse aussi sur le rattrapage hors ligne.",
                            en: "Purchases per second. Deliberately low: it also weighs on offline catch-up."
                          })}>
                            <span className="auto-script-unit">{tr({ fr: "débit", en: "rate" })}</span>
                            <input
                              type="number"
                              className="auto-script-input"
                              value={r.perTick}
                              min={AUTOMATE_FIELD_BOUNDS.perTick[0]}
                              max={AUTOMATE_FIELD_BOUNDS.perTick[1]}
                              onChange={(e) => handleAutomateField(r.id, 'perTick', e.target.value)}
                            />
                            <span className="auto-script-unit">{tr({ fr: "/s", en: "/s" })}</span>
                          </label>
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
