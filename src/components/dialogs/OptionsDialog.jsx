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
import { numberFormatMode, setNumberFormatMode, encodeSaveText } from '../../game/core/utils.js';
import { dayNightMode, setDayNightMode } from '../../game/map/dayNightMode.js';
import { qualityMode, setQualityMode } from '../../game/map/qualityMode.js';
import { ambianceMode, setAmbianceMode } from '../../game/map/ambianceMode.js';
import { weatherMode, setWeatherMode } from '../../game/map/weatherMode.js';
import { seasonMode, setSeasonMode } from '../../game/map/seasonMode.js';
import { densityMode as density, setDensityMode, contrastMode as contrast, setContrastMode } from '../../game/core/uiPrefs.js';
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
import { state, invalidateRenderCache, render, save, AUTOMATE_FIELD_BOUNDS } from '../../game/core/state.js';
import { markPendingWipe } from '../../game/core/saveKey.js';
import { SLOT_COUNT, readSlotMeta, slotIsEmpty, writeSlot, loadSlot, saveToFile } from '../../game/core/saveSlots.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { cloudWipe, cloudSaveDir, cloudSaveStatus, cloudSyncInfo } from '../../game/core/cloudSave.js';
import { requestChoiceDialog } from '../../game/core/choiceDialog.js';
import {
  SHORTCUT_DEFS, shortcutKey, shortcutOff, shortcutLabel,
  shortcutRejection, setShortcutKey, setShortcutOff
} from '../../game/core/shortcuts.js';
import { tipProps } from '../ui/HelpBubble.jsx';

export default function OptionsDialog({ isOpen, onClose }) {
  const dialogRef = useDialogModal(isOpen, onClose);
  const [activeGroup, setActiveGroup] = useState("display"); // "display", "sound", "other", "credits", "script", "automates"
  const [optionRevision, setOptionRevision] = useState(0);
  // Raccourci en cours de réattribution (id), et refus à afficher.
  const [capturingId, setCapturingId] = useState(null);
  const [keyError, setKeyError] = useState(null);
  const SLOT_INDEXES = Array.from({ length: SLOT_COUNT }, (_, i) => i);

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


  // Une confirmation qui ne s'affiche PAS ne vaut pas un refus. Sans ce filet,
  // requestChoiceDialog rend la 1re option quand aucune interface n'est branchée
  // (« Annuler », puis « Garder ma partie ») : le bouton ne faisait alors
  // strictement rien, sans fenêtre ni erreur — impossible à distinguer d'un vrai
  // clic sur Annuler, et c'est ce qui a coûté une session entière de diagnostic.
  // On retombe donc sur la confirmation native, laide mais toujours joignable.
  const askWipe = async (dialog, nativeText) => {
    const answer = await requestChoiceDialog(dialog);
    if (!answer?.uiUnavailable) return answer?.value;
    return window.confirm(nativeText) ? "yes" : "no";
  };

  // SEUL geste qui garde une confirmation bloquante, et c'est voulu : il efface
  // la partie ET le fichier nuage. Mais elle passe par ChoiceDialog et non par le
  // confirm() natif, qui volait le focus, ignorait la langue du jeu et ne gérait
  // pas le double Échap de Chromium. Deux étapes, la seconde nommant ce qui part.
  const handleWipe = async () => {
    const first = await askWipe({
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
    }, tr({
      fr: "Recommencer depuis le tout premier feu ? Toute la partie est effacée : cycles, Ruines, Mythes, Grands Resets. Rien n'est récupérable.",
      en: "Start over from the very first fire? The whole game is erased: cycles, Ruins, Myths, Great Resets. Nothing can be recovered."
    }));
    if (first !== "yes") return;
    const second = await askWipe({
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
    }, tr({
      fr: "Dernière confirmation : la sauvegarde locale et le fichier nuage seront effacés tous les deux.",
      en: "Final confirmation: both the local save and the cloud file will be erased."
    }));
    if (second !== "yes") return;
    // On ne remet PAS l'état à neuf ici : on pose le drapeau et on recharge, et
    // c'est le démarrage qui efface la save locale et le fichier nuage (le
    // pourquoi est documenté sur WIPE_KEY, saveKey.js). Effacer sur place
    // dépendait de qui détient l'objet `state` — en dev, un hot-update de
    // src/game/ en laisse deux vivants et le geste tombait dans la copie morte :
    // les deux confirmations défilaient et la partie revenait intacte.
    markPendingWipe();
    // Le fichier nuage part dès maintenant EN PLUS du démarrage : si le
    // rechargement échoue, l'ancienne partie ne doit pas rester à disposition.
    cloudWipe();
    window.location.reload();
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

  // Densité (E4) : setDensityMode pose lui-même l'attribut sur <html>, le CSS
  // fait le reste. Le bump de révision ne sert qu'à rafraîchir l'état actif des
  // trois boutons, comme pour l'ambiance juste au-dessus.
  const handleDensityChange = (mode) => {
    if (mode === density) return;
    setDensityMode(mode);
    setOptionRevision((revision) => revision + 1);
  };

  const handleContrastChange = (mode) => {
    if (mode === contrast) return;
    setContrastMode(mode);
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

  // Écraser un emplacement demande confirmation — mais par ChoiceDialog, comme la
  // réinitialisation. Un emplacement écrasé par mégarde, c'est précisément le
  // filet qu'on venait de tendre qui disparaît.
  const handleSlotWrite = async (i) => {
    if (!slotIsEmpty(i)) {
      const choix = await requestChoiceDialog({
        label: { fr: "Emplacement", en: "Slot" },
        title: tr({ fr: `Écraser l'emplacement ${i + 1} ?`, en: `Overwrite slot ${i + 1}?` }),
        body: tr({ fr: "L'instantané qui s'y trouve sera remplacé par la partie en cours.", en: "The snapshot stored there will be replaced by the current game." }),
        options: [
          { label: tr({ fr: "Annuler", en: "Cancel" }), value: "no" },
          { label: tr({ fr: "Écraser", en: "Overwrite" }), value: "yes" }
        ]
      });
      if (choix?.value !== "yes") return;
    }
    const res = writeSlot(i);
    pushOutcomeFloat(res.ok
      ? { label: tr({ fr: `Emplacement ${i + 1} enregistré`, en: `Slot ${i + 1} saved` }), kind: "gain" }
      // L'échec est DIT : trois copies d'un état de 270 ko ne tiennent pas partout.
      : { label: tr({ fr: "Stockage plein : emplacement non écrit", en: "Storage full: slot not written" }), kind: "cost" });
    setOptionRevision((revision) => revision + 1);
  };

  const handleSlotLoad = async (i) => {
    const choix = await requestChoiceDialog({
      label: { fr: "Emplacement", en: "Slot" },
      title: tr({ fr: `Charger l'emplacement ${i + 1} ?`, en: `Load slot ${i + 1}?` }),
      body: tr({ fr: "La partie en cours sera remplacée. Enregistre-la d'abord dans un autre emplacement si tu veux la garder.", en: "The current game will be replaced. Save it to another slot first if you want to keep it." }),
      options: [
        { label: tr({ fr: "Annuler", en: "Cancel" }), value: "no" },
        { label: tr({ fr: "Charger", en: "Load" }), value: "yes" }
      ]
    });
    if (choix?.value !== "yes") return;
    if (loadSlot(i)) {
      pushOutcomeFloat({ label: tr({ fr: "Partie chargée", en: "Game loaded" }), kind: "gain" });
      onClose();
    } else {
      pushOutcomeFloat({ label: tr({ fr: "Emplacement illisible", en: "Slot unreadable" }), kind: "cost" });
    }
  };

  const handleSaveToFile = async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const res = await saveToFile(encodeSaveText(JSON.stringify(state)), `civilisation-${stamp}.txt`);
    pushOutcomeFloat(res.ok
      ? { label: tr({ fr: "Sauvegarde écrite", en: "Save written" }), kind: "gain" }
      : { label: tr({ fr: "Écriture du fichier impossible", en: "Could not write the file" }), kind: "cost" });
  };

  // Capture de touche. Le message de refus dit POURQUOI : « déjà prise par Tout
  // acheter » se corrige, « invalide » laisse deviner.
  const handleCaptureKey = (event, def) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setCapturingId(null); setKeyError(null); return; }
    const refus = shortcutRejection(def, event.key);
    if (refus) {
      setKeyError(
        refus.reason === "taken"
          ? tr({ fr: `Touche déjà prise par « ${tr(refus.by.label)} ».`, en: `Key already used by "${tr(refus.by.label)}".` })
          : refus.reason === "digit"
            ? tr({ fr: "Les chiffres sont réservés aux vues 1 à 8.", en: "Digits are reserved for views 1 to 8." })
            : refus.reason === "forbidden"
              ? tr({ fr: "Cette touche est réservée par le jeu ou le navigateur.", en: "This key is reserved by the game or the browser." })
              : tr({ fr: "Une seule lettre ou un seul caractère.", en: "A single letter or character only." })
      );
      return;
    }
    setShortcutKey(def.id, event.key);
    setCapturingId(null);
    setKeyError(null);
    setOptionRevision((revision) => revision + 1);
  };

  const handleShortcutOff = (id, off) => {
    setShortcutOff(id, off);
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
    // Avec showModal(), un clic sur le fond (::backdrop) a pour cible la
    // <dialog> elle-même : seules les coordonnées disent s'il est tombé dedans
    // ou à côté. D'où la mesure du cadre plutôt qu'un test sur la cible.
    //
    // ⚠ NE PAS y remettre de délai de grâce après l'ouverture. Il en a existé
    // un (400 ms), contre un clic d'ouverture qui serait retombé sur le fond.
    // Ce clic N'EXISTE PAS : tracé en capture sur document, on ne voit qu'un
    // seul clic, sur le bouton. La vraie cause du « bouton Options mort » était
    // dans useDialogModal (fermeture provoquée par le nettoyage d'effet).
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
      // ⚠ PAS de `onClose` ici : useDialogModal écoute déjà `close` en natif, et
      // lui seul sait distinguer une fermeture du joueur d'une fermeture qu'il a
      // provoquée lui-même. Une prop React en doublon court-circuite ce tri et
      // referme la fenêtre à l'ouverture.
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
          <button
            className={`options-tab ${activeGroup === 'credits' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveGroup('credits')}
          >
            {tr({ fr: "Crédits", en: "Credits" })}
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

        {/* Hauteur fixée en CSS, pas ici : voir .options-rows. Un onglet court
            (Son) et un onglet long (Affichage) doivent rendre la MÊME fenêtre. */}
        <div className="options-rows">
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
                  {/* Renommé « Mouvement » (E4) : ce cran ne pilote plus la
                      seule carte, il coupe aussi les animations d'interface.
                      Garder l'ancien libellé aurait fait mentir le réglage.
                      L'asymétrie du cran intermédiaire est DITE, pas masquée :
                      une animation CSS se coupe ou ne se coupe pas, il n'y a
                      pas de demi-mesure côté interface. */}
                  <span>{tr({ fr: "Mouvement", en: "Motion" })}</span>
                  <small>{tr({ fr: "Mouvement d'ambiance sur la carte (feuilles, lucioles, fontaines) et animations de l'interface. Sans effet sur la netteté : la qualité sert la machine, ce réglage sert le confort. « Sobre » n'allège que la carte ; « Aucune » fige aussi l'interface.", en: "Ambient motion on the map (leaves, fireflies, fountains) and interface animations. Does not affect sharpness: quality serves the machine, this setting serves comfort. \"Sober\" only lightens the map; \"None\" also freezes the interface." })}</small>
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

              {/* DENSITÉ DES PANNEAUX (E4). Ne touche QUE l'espace, jamais la
                  taille du texte : compacter ne doit pas rendre illisible. Le
                  réglage cible les surfaces qui coûtent de la hauteur (la
                  boutique, les panneaux) parce que le design system n'a aucun
                  jeton d'espacement à multiplier globalement. */}
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Densité des panneaux", en: "Panel density" })}</span>
                  <small>{tr({ fr: "Espacement des panneaux et des rangées de la boutique. « Compacte » fait tenir plus de lignes à l'écran sans rien réduire du texte, utile sur un petit écran.", en: "Spacing of panels and shop rows. “Compact” fits more lines on screen without shrinking any text, useful on a small display." })}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${density === 'aere' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleDensityChange('aere')}
                  >
                    {tr({ fr: "Aérée", en: "Airy" })}
                  </button>
                  <button
                    className={`format-option ${density === 'normale' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleDensityChange('normale')}
                  >
                    {tr({ fr: "Normale", en: "Normal" })}
                  </button>
                  <button
                    className={`format-option ${density === 'compacte' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleDensityChange('compacte')}
                  >
                    {tr({ fr: "Compacte", en: "Compact" })}
                  </button>
                </div>
              </div>

              {/* CONTRASTE RENFORCÉ (E12). La passe de contraste, elle, est déjà
                  appliquée pour tout le monde dans variables.css : un ton mesuré
                  illisible se répare, il ne s'offre pas en option. Ce réglage
                  est le cran au-dessus. */}
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Contraste renforcé", en: "High contrast" })}</span>
                  <small>{tr({ fr: "Éclaircit les textes secondaires et marque les séparations entre panneaux. Utile sur un écran peu contrasté, en plein jour, ou si les petits textes gris vous demandent un effort.", en: "Brightens secondary text and strengthens the separations between panels. Useful on a low-contrast display, in daylight, or if small grey text takes you effort." })}</small>
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${contrast === 'normal' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleContrastChange('normal')}
                  >
                    {tr({ fr: "Normal", en: "Normal" })}
                  </button>
                  <button
                    className={`format-option ${contrast === 'high' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleContrastChange('high')}
                  >
                    {tr({ fr: "Renforcé", en: "High" })}
                  </button>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Météo", en: "Weather" })}</span>
                  <small>{tr({ fr: "« Auto » fait passer une averse courte de temps en temps : la lumière baisse, il pleut, les rues se vident, puis le temps se dégage. En hiver la même averse tombe en neige. Figez sur Dégagé si vous préférez une image stable.", en: "“Auto” brings a short shower now and then: the light dims, it rains, the streets empty, then it clears. In winter the same shower falls as snow. Set to Clear if you prefer a stable image." })}</small>
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
                    {tr({ fr: "Averse", en: "Shower" })}
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
          {/* Généré depuis SHORTCUT_DEFS : ajouter une touche à la table la fait
              apparaître ici toute seule, et cette liste ne peut plus mentir. */}
          {activeGroup === 'shortcuts' && (
            <>
              {SHORTCUT_DEFS.map((def) => {
                const off = shortcutOff(def);
                const capturing = capturingId === def.id;
                return (
                  <div key={def.id} className={`options-row ${off ? 'is-off' : ''}`}>
                    <div>
                      <span>{tr(def.label)}</span>
                      <small>{tr(def.hint)}</small>
                    </div>
                    <div className="shortcut-controls">
                      <button
                        type="button"
                        className={`shortcut-kbd shortcut-capture ${capturing ? 'is-capturing' : ''}`}
                        onClick={() => { setCapturingId(capturing ? null : def.id); setKeyError(null); }}
                        onKeyDown={capturing ? (e) => handleCaptureKey(e, def) : undefined}
                        {...tipProps(null, tr({ fr: "Cliquer puis appuyer sur la touche voulue", en: "Click then press the desired key" }))}
                      >
                        {capturing ? tr({ fr: "…", en: "…" }) : shortcutLabel(shortcutKey(def))}
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${off ? 'off' : 'on'}`}
                        onClick={() => handleShortcutOff(def.id, !off)}
                        {...tipProps(null, tr({
                          fr: "Une touche gênante peut être désactivée sans être remplacée.",
                          en: "A bothersome key can be disabled without being replaced."
                        }))}
                      >
                        {off ? tr({ fr: "Inactif", en: "Off" }) : tr({ fr: "Actif", en: "On" })}
                      </button>
                    </div>
                  </div>
                );
              })}

              {keyError && <div className="options-row shortcut-error"><small>{keyError}</small></div>}

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Aller à une vue", en: "Go to a view" })}</span>
                  <small>{tr({ fr: "Les vues débloquées, dans l'ordre de la barre latérale", en: "Unlocked views, in sidebar order" })}</small>
                </div>
                <kbd className="shortcut-kbd">1 – 8</kbd>
              </div>

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Ouvrir les options", en: "Open options" })}</span>
                  <small>{tr({ fr: "Ouvre ce menu à tout moment, et quitte la contemplation. Non réattribuable : c'est le chemin de secours.", en: "Opens this menu at any time, and leaves contemplation. Not remappable: it is the way back." })}</small>
                </div>
                <kbd className="shortcut-kbd">{tr({ fr: "Échap", en: "Esc" })}</kbd>
              </div>
            </>
          )}

          {/* OTHER PANEL */}
          {activeGroup === 'other' && (<>
            {/* Emplacements manuels : l'autosave écrase en continu, une partie
                qui dure des mois n'avait aucun filet avant un geste risqué. */}
            <div className="options-row">
              <div>
                <span>{tr({ fr: "Emplacements de sauvegarde", en: "Save slots" })}</span>
                <small>{tr({
                  fr: "Trois instantanés manuels, indépendants de la sauvegarde automatique. Utile avant un Grand Reset ou un Mythe risqué.",
                  en: "Three manual snapshots, separate from the autosave. Useful before a Great Reset or a risky Myth."
                })}</small>
              </div>
              <button type="button" onClick={handleSaveToFile}>
                {tr({ fr: "Exporter en fichier", en: "Export to file" })}
              </button>
            </div>

            {SLOT_INDEXES.map((i) => {
              const meta = readSlotMeta(i);
              return (
                <div key={i} className="options-row save-slot">
                  <div>
                    <span>{tr({ fr: `Emplacement ${i + 1}`, en: `Slot ${i + 1}` })}</span>
                    <small>
                      {meta
                        ? tr({
                            fr: `${meta.city || "Cité"} · ${meta.cycles} cycle${meta.cycles > 1 ? 's' : ''} · ${new Date(meta.at).toLocaleString('fr-FR')}`,
                            en: `${meta.city || "City"} · ${meta.cycles} cycle${meta.cycles > 1 ? 's' : ''} · ${new Date(meta.at).toLocaleString('en-GB')}`
                          })
                        : tr({ fr: "Vide", en: "Empty" })}
                    </small>
                  </div>
                  <div className="save-slot-actions">
                    <button type="button" onClick={() => handleSlotWrite(i)}>
                      {tr({ fr: "Enregistrer", en: "Save" })}
                    </button>
                    <button type="button" disabled={!meta} onClick={() => handleSlotLoad(i)}>
                      {tr({ fr: "Charger", en: "Load" })}
                    </button>
                  </div>
                </div>
              );
            })}

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
          </>)}
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

          {/* CREDITS PANEL — assets tiers embarqués dans le jeu. La licence du
              pack de cartes demande explicitement un crédit : cet onglet est ce
              qui rend le jeu conforme, ne pas le retirer sans retirer l'asset. */}
          {activeGroup === 'credits' && (
            <>
              {/* ⚠ La musique et les icônes exigent ce crédit, ce n'est pas une
                  politesse. Abstraction demande le titre de la piste, son nom et
                  un lien ; Font Awesome Free est en CC BY 4.0. Ne pas retirer. */}
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Musique", en: "Music" })}</span>
                  <small>
                    {tr({
                      fr: "« Track 5 », de l'album « Ludum Dare 30 », par Abstraction (Benjamin Burnes). Musique de fond du jeu, utilisée selon ses conditions. abstractionmusic.com",
                      en: "“Track 5”, from the album “Ludum Dare 30”, by Abstraction (Benjamin Burnes). The game's background music, used under his terms. abstractionmusic.com"
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Icônes de l'interface", en: "Interface icons" })}</span>
                  <small>
                    {tr({
                      fr: "« Font Awesome Free » par Fonticons. Icônes sous licence Creative Commons Attribution 4.0. fontawesome.com",
                      en: "“Font Awesome Free” by Fonticons. Icons under the Creative Commons Attribution 4.0 license. fontawesome.com"
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Polices", en: "Typefaces" })}</span>
                  <small>
                    {tr({
                      fr: "Pixelify Sans, Silkscreen et Inter, les trois polices du jeu, sous licence SIL Open Font 1.1.",
                      en: "Pixelify Sans, Silkscreen and Inter, the game's three typefaces, under the SIL Open Font License 1.1."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Cartes à jouer", en: "Playing cards" })}</span>
                  <small>
                    {tr({
                      fr: "« Pixel Playing Cards » par Bit Digitalis (bitdigitalis.itch.io). Les 52 cartes et le dos du Vingt-et-un viennent de ce pack, utilisé avec l'accord de sa licence.",
                      en: "“Pixel Playing Cards” by Bit Digitalis (bitdigitalis.itch.io). The 52 cards and the card back of Twenty-one come from this pack, used under its license."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Surface du fleuve", en: "River surface" })}</span>
                  <small>
                    {tr({
                      fr: "« 16x16 Water Tiles Animated » par Zro Dfects (zrodfects.itch.io). Les images de la surface animée de l'eau viennent de ce pack, recolorées à la palette du jeu.",
                      en: "“16x16 Water Tiles Animated” by Zro Dfects (zrodfects.itch.io). The animated water surface frames come from this pack, recolored to the game palette."
                    })}
                  </small>
                </div>
              </div>
            </>
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
                          <label {...tipProps(tr({ fr: "réserve", en: "reserve" }), tr({
                            fr: "Part de la ressource que l'automate ne touche pas. À 0 il vide la caisse, ce qui sabote les autres branches.",
                            en: "Share of the resource the automaton never touches. At 0 it empties the coffers, which starves the other branches."
                          }))}>
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
                          <label {...tipProps(tr({ fr: "débit", en: "rate" }), tr({
                            fr: "Nombre d'achats par seconde. Volontairement bas : il pèse aussi sur le rattrapage hors ligne.",
                            en: "Purchases per second. Deliberately low: it also weighs on offline catch-up."
                          }))}>
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
