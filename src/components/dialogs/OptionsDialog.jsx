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
  setMusicActiveTabOnly,
  getMusicTracks,
  getMusicTrack,
  setMusicTrack,
  getSfxEnabled,
  setSfxEnabled,
  getSfxVolume,
  setSfxVolume,
  idleCapSeconds,
  nextIdleCapPalier
} from '../../game/core/main.js';
import { getPaysageActif, setPaysageActif, getPaysageVolume, setPaysageVolume } from '../../game/audio/paysage/reglages.js';
import { numberFormatMode, setNumberFormatMode, encodeSaveText, fmtSecs } from '../../game/core/utils.js';
import { uiRevealed } from '../../game/core/uiReveal.js';
import { idleReserveHint } from '../ui/idleReserve.js';
import { dayNightMode, setDayNightMode } from '../../game/map/dayNightMode.js';
import { qualityMode, setQualityMode, autoQualityTier } from '../../game/map/qualityMode.js';
import { energySaver, setEnergySaver } from '../../game/map/energySaver.js';
import { tenuesSages, setTenuesSages } from '../../game/map/iso/plaisirsCast.js';
import { probeRenderer } from '../../game/map/rendererProbe.js';
import { ambianceMode, setAmbianceMode } from '../../game/map/ambianceMode.js';
import { weatherMode, setWeatherMode } from '../../game/map/weatherMode.js';
import { seasonMode, setSeasonMode } from '../../game/map/seasonMode.js';
import { chuteMode, setChuteMode } from '../../game/map/chuteMode.js';
import { densityMode as density, setDensityMode, contrastMode as contrast, setContrastMode } from '../../game/core/uiPrefs.js';
import { applyCityMapQuality } from '../../game/map/cityMapRuntime.js';
import { getLang, setLang, tr } from '../../game/core/i18n.js';
import {
  getAutoScriptRules,
  toggleAutoScriptRule,
  setAutoScriptThreshold,
  getAutomateRules,
  toggleAutomate,
  setAutomateThreshold,
  setAutomateField
} from '../../game/core/actions.js';
import { state, invalidateRenderCache, render, save, AUTOMATE_FIELD_BOUNDS, RULE_LABELS, collapseUnderway } from '../../game/core/state.js';
import { AUTO_COLLAPSE_MIN_SECONDS } from '../../game/core/balance.js';
import { markPendingWipe, isLocalSaveUnreadable, localSaveSuspendReason, CURRENT_SAVE_VERSION } from '../../game/core/saveKey.js';
import { SLOT_COUNT, readSlotMeta, slotIsEmpty, writeSlot, loadSlot, loadBackup, keepFallbackGame, saveToFile, getLastSlotRefusal } from '../../game/core/saveSlots.js';
import { listSaveBackups, readSaveBackup } from '../../game/core/saveBackups.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { cloudWipe, cloudSaveDir, cloudSaveStatus, cloudSyncInfo, cloudSteamVersion } from '../../game/core/cloudSave.js';
import { requestChoiceDialog } from '../../game/core/choiceDialog.js';
import {
  SHORTCUT_DEFS, shortcutKey, shortcutLabel,
  shortcutRejection, setShortcutKey
} from '../../game/core/shortcuts.js';
import { tipProps } from '../ui/HelpBubble.jsx';
import HelpBook from './HelpBook.jsx';
import SoftwareLicenses from './SoftwareLicenses.jsx';
import FullscreenOption from './FullscreenOption.jsx';
import DraftNumberInput from '../ui/DraftNumberInput.jsx';

// Libellé d'un réglage. Son explication passe en INFOBULLE : règle de DA du
// 2026-10-03 (Raph) — aucune phrase d'explication à l'écran, les mécanismes du
// jeu vont dans l'Aide, et ce que fait un réglage se lit au survol.
function OptionLabel({ label, hint }) {
  return <span {...tipProps(label, hint)}>{label}</span>;
}

// Palier retenu par « Auto » et moteur de rendu détecté (audit du 2026-10-05,
// PERF-4) : rien ne disait au joueur qu'« Auto » tournait en Élevée sur un rendu
// logiciel. Le palier se lit sur le bouton (« Auto (Élevée) »), le moteur dans
// l'infobulle. La sonde WebGL est faite une fois par session (qualityMode s'en sert
// pour « Auto » : rendu logiciel → « Équilibrée sans effets », PERF-4 = b).
const QUALITY_TIER_LABEL = {
  high: { fr: "Élevée", en: "High" },
  balanced: { fr: "Équilibrée", en: "Balanced" },
  balancedNoFx: { fr: "Équilibrée sans effets", en: "Balanced, no effects" },
  perf: { fr: "Performance", en: "Performance" },
};

// ONGLETS AU CLAVIER (motif ARIA « tabs », BUG-118) : les flèches gauche et
// droite passent à l'onglet voisin et l'ouvrent, Début et Fin aux extrémités ;
// seul l'onglet ouvert est dans l'ordre de tabulation (tabIndex mobile, posé sur
// chaque onglet). Les onglets masqués par le CSS — Raccourcis au doigt — n'ont
// pas de boîte : on les saute.
const TAB_STEP = { ArrowRight: 1, ArrowLeft: -1 };
function onOptionTabsKeyDown(e) {
  if (!(e.key in TAB_STEP) && e.key !== 'Home' && e.key !== 'End') return;
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')].filter((t) => t.getClientRects().length > 0);
  const i = tabs.indexOf(e.target);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + TAB_STEP[e.key] + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
}

function qualityAutoLabel() {
  const t = QUALITY_TIER_LABEL[autoQualityTier()];
  return t ? tr({ fr: `Auto (${t.fr})`, en: `Auto (${t.en})` }) : tr({ fr: "Auto", en: "Auto" });
}

function qualityHint() {
  const base = tr({ fr: "Préréglage de performance de la carte (résolution, densité d'habitants, fluidité). « Auto » s'adapte à votre appareil ; baissez d'un cran si la carte saccade au zoom ou au déplacement.", en: "Map performance preset (resolution, citizen density, smoothness). “Auto” adapts to your device; lower a notch if the map stutters when zooming or panning." });
  const r = probeRenderer();
  if (!r.webgl) return base + tr({ fr: " Moteur de rendu : WebGL indisponible.", en: " Renderer: WebGL unavailable." });
  if (!r.name) return base;
  return base + (r.software
    ? tr({ fr: ` Moteur de rendu : ${r.name} — rendu logiciel, la carte est peinte par le processeur.`, en: ` Renderer: ${r.name} — software rendering, the map is drawn by the CPU.` })
    : tr({ fr: ` Moteur de rendu : ${r.name}.`, en: ` Renderer: ${r.name}.` }));
}

export default function OptionsDialog({ isOpen, onClose, onSave, onExport, onImport }) {
  const dialogRef = useDialogModal(isOpen, onClose);
  // L'Aide ouvre la fenêtre : c'est son SEUL accès (arbitrage Raph 2026-10-03).
  const [activeGroup, setActiveGroup] = useState("aide"); // "aide", "display", "sound", "shortcuts", "other", "credits", "script", "automates"
  const [optionRevision, setOptionRevision] = useState(0);
  // Raccourci en cours de réattribution (id), et refus à afficher.
  const [capturingId, setCapturingId] = useState(null);
  const [keyError, setKeyError] = useState(null);
  const SLOT_INDEXES = Array.from({ length: SLOT_COUNT }, (_, i) => i);

  const phoenixHeritage = useGameState(s => s.phoenixHeritage);
  const hephHeritage = useGameState(s => s.hephHeritage);
  // Pendant une chute, ni import ni chargement d'emplacement (collapseUnderway) :
  // la partie chargée tomberait à la fin de la séquence, avec le gain de l'ancienne.
  const chuteEnCours = useGameState(() => collapseUnderway());
  // Rules lists. optionRevision force les controles mutables a se recalculer.
  void optionRevision;
  const notifEnabled = getNotifEnabled();
  const musicEnabled = getMusicEnabled();
  const musicVolume = getMusicVolume();
  const musicActiveTabOnly = getMusicActiveTabOnly();
  const musicTracks = getMusicTracks();
  const musicTrack = getMusicTrack();
  const sfxEnabled = getSfxEnabled();
  const sfxVolume = getSfxVolume();
  const paysageActif = getPaysageActif();
  const paysageVolume = getPaysageVolume();
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
  // Ce qui RESTE est dit aussi (audit 2026-10-05, SAV-14) : les trois emplacements
  // et les copies de secours survivent au reset — « Rien n'est récupérable » était
  // faux.
  const handleWipe = async () => {
    const first = await askWipe({
      label: { fr: "Réinitialisation", en: "Reset" },
      title: tr({ fr: "Recommencer depuis le tout premier feu ?", en: "Start over from the very first fire?" }),
      body: tr({
        fr: "Toute la partie est effacée : cycles, Ruines, Mythes, Grands Resets. Seuls tes emplacements de sauvegarde et tes copies de secours sont gardés.",
        en: "The whole game is erased: cycles, Ruins, Myths, Great Resets. Only your save slots and backup copies are kept."
      }),
      options: [
        { label: tr({ fr: "Annuler", en: "Cancel" }), value: "no" },
        { label: tr({ fr: "Continuer", en: "Continue" }), value: "yes" }
      ]
    }, tr({
      fr: "Recommencer depuis le tout premier feu ? Toute la partie est effacée : cycles, Ruines, Mythes, Grands Resets. Seuls tes emplacements de sauvegarde et tes copies de secours sont gardés.",
      en: "Start over from the very first fire? The whole game is erased: cycles, Ruins, Myths, Great Resets. Only your save slots and backup copies are kept."
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

  // Économie d'énergie (energySaver.js, PERF-5) : la boucle relit l'interrupteur
  // à chaque frame, rien à rebrancher.
  const handleEnergySaverToggle = () => {
    setEnergySaver(!energySaver);
    setOptionRevision((revision) => revision + 1);
  };

  // Tenues sages (plaisirsCast.js, STEAM-6) : la carte et la coupe relisent la troupe
  // à chaque image, la table à son prochain rendu — rien à recuire.
  const handleTenuesSagesToggle = () => {
    setTenuesSages(!tenuesSages);
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

  // La chute sur la carte (chuteMode.js, CHUTE-9) : lue au début de chaque chute.
  const handleChuteChange = (mode) => {
    if (mode === chuteMode) return;
    setChuteMode(mode);
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

  const handleSfxToggle = () => {
    setSfxEnabled(!sfxEnabled);
    setOptionRevision((revision) => revision + 1);
  };

  const handleSfxVolume = (event) => {
    setSfxVolume(Number(event.target.value) / 100);
    setOptionRevision((revision) => revision + 1);
  };

  // Le paysage sonore de la carte (docs/PLAN-AMBIANCE-SONORE.md) : à part de la musique
  // et des bruitages. Le directeur (audio/paysage/paysage.js) suit ces réglages.
  const handlePaysageToggle = () => {
    setPaysageActif(!paysageActif);
    setOptionRevision((revision) => revision + 1);
  };

  const handlePaysageVolume = (event) => {
    setPaysageVolume(Number(event.target.value) / 100);
    setOptionRevision((revision) => revision + 1);
  };

  const handleTrackChange = (id) => {
    setMusicTrack(id);
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
    } else if (collapseUnderway()) {
      // La chute a pu partir pendant la confirmation : l'emplacement n'est pas en cause.
      pushOutcomeFloat({ label: tr({ fr: "La cité tombe : chargement impossible", en: "The city is falling: cannot load" }), kind: "cost" });
    } else if (getLastSlotRefusal() === "newer") {
      // Écrit par une version plus récente du jeu (SAV-6) : il se rechargera après la mise à jour.
      pushOutcomeFloat({ label: tr({ fr: "Emplacement d'une version plus récente du jeu", en: "Slot from a newer version of the game" }), kind: "cost" });
    } else if (getLastSlotRefusal() === "storage") {
      // Plus de place pour poser la partie avant le rechargement (SAV-8).
      pushOutcomeFloat({ label: tr({ fr: "Stockage plein : chargement impossible", en: "Storage full: cannot load" }), kind: "cost" });
    } else {
      pushOutcomeFloat({ label: tr({ fr: "Emplacement illisible", en: "Slot unreadable" }), kind: "cost" });
    }
  };

  const handleSaveToFile = async () => {
    // Horodatage À LA SECONDE (slice 19, pas 16) : deux exports dans la même
    // minute écrasaient le même fichier en silence.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const res = await saveToFile(encodeSaveText(JSON.stringify(state)), `civilisation-${stamp}.txt`);
    // Dialogue fermé (.exe) : rien à annoncer. Sinon le float rappelle OÙ le
    // fichier est parti (res.path, le chemin choisi dans le dialogue natif).
    if (res.canceled) return;
    pushOutcomeFloat(res.ok
      ? {
          label: res.path
            ? tr({ fr: `Sauvegarde écrite : ${res.path}`, en: `Save written: ${res.path}` })
            : tr({ fr: "Sauvegarde écrite", en: "Save written" }),
          kind: "gain"
        }
      : { label: tr({ fr: "Écriture du fichier impossible", en: "Could not write the file" }), kind: "cost" });
  };

  // COPIES DE SECOURS (audit 2026-10-05, SAV-3) : la save illisible archivée au
  // démarrage et la save locale évincée par le nuage existaient, mais rien ne
  // savait les relire. Charger passe par le chemin des emplacements (avec le
  // repli champ par champ) ; Exporter sort le JSON BRUT — une copie tronquée ne
  // survivrait pas à un ré-encodage, et l'import accepte désormais le JSON.
  const handleBackupLoad = async (backup) => {
    const choix = await requestChoiceDialog({
      label: { fr: "Copie de secours", en: "Backup copy" },
      title: tr({ fr: "Charger cette copie ?", en: "Load this copy?" }),
      body: tr({ fr: "La partie en cours sera remplacée. Enregistre-la d'abord dans un emplacement si tu veux la garder.", en: "The current game will be replaced. Save it to a slot first if you want to keep it." }),
      options: [
        { label: tr({ fr: "Annuler", en: "Cancel" }), value: "no" },
        { label: tr({ fr: "Charger", en: "Load" }), value: "yes" }
      ]
    });
    if (choix?.value !== "yes") return;
    const res = loadBackup(backup.key);
    if (res.ok) {
      pushOutcomeFloat({
        label: res.dropped.length
          ? tr({ fr: "Copie chargée, en partie", en: "Copy partly loaded" })
          : tr({ fr: "Partie chargée", en: "Game loaded" }),
        kind: "gain"
      });
      onClose();
    } else if (collapseUnderway()) {
      pushOutcomeFloat({ label: tr({ fr: "La cité tombe : chargement impossible", en: "The city is falling: cannot load" }), kind: "cost" });
    } else if (res.newer) {
      pushOutcomeFloat({ label: tr({ fr: "Copie d'une version plus récente du jeu", en: "Copy from a newer version of the game" }), kind: "cost" });
    } else if (res.storage) {
      pushOutcomeFloat({ label: tr({ fr: "Stockage plein : chargement impossible", en: "Storage full: cannot load" }), kind: "cost" });
    } else {
      pushOutcomeFloat({ label: tr({ fr: "Copie illisible", en: "Copy unreadable" }), kind: "cost" });
    }
  };

  const handleBackupExport = async (backup) => {
    const raw = readSaveBackup(backup.key);
    if (!raw) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const res = await saveToFile(raw, `civilisation-copie-${stamp}.json`);
    if (res.canceled) return; // dialogue fermé (.exe)
    pushOutcomeFloat(res.ok
      ? {
          label: res.path
            ? tr({ fr: `Copie écrite : ${res.path}`, en: `Copy written: ${res.path}` })
            : tr({ fr: "Copie écrite", en: "Copy written" }),
          kind: "gain"
        }
      : { label: tr({ fr: "Écriture du fichier impossible", en: "Could not write the file" }), kind: "cost" });
  };

  // Save du démarrage illisible : rien ne s'écrit tant que le joueur n'a pas
  // tranché (saveKey.js). Réessayer relance le jeu, qui relit la clé intacte ;
  // Garder cette partie enregistre la partie neuve de repli à sa place.
  const handleKeepFallback = async () => {
    const choix = await requestChoiceDialog({
      label: { fr: "Sauvegarde", en: "Save" },
      title: tr({ fr: "Garder cette partie ?", en: "Keep this game?" }),
      // Save d'une version plus récente (SAV-6) : c'est la MÊME partie, mais ce
      // que cette version ignore sera perdu — l'originale reste en copie.
      body: localSaveSuspendReason() === "newer"
        ? tr({ fr: "La partie sera enregistrée pour cette version du jeu : ce qui n'existe que dans la version plus récente sera perdu. L'originale reste dans les copies de secours.", en: "The game will be saved for this version: anything that only exists in the newer version will be lost. The original stays in the backup copies." })
        : tr({ fr: "La partie neuve sera enregistrée à la place de l'ancienne, qui reste dans les copies de secours.", en: "The new game will be saved in place of the old one, which stays in the backup copies." }),
      options: [
        { label: tr({ fr: "Annuler", en: "Cancel" }), value: "no" },
        { label: tr({ fr: "Garder", en: "Keep" }), value: "yes" }
      ]
    });
    if (choix?.value !== "yes") return;
    keepFallbackGame();
    setOptionRevision((revision) => revision + 1);
  };

  // Capture de touche. Le message de refus dit POURQUOI : « déjà prise par Tout
  // acheter » se corrige, « invalide » laisse deviner.
  const handleCaptureKey = (event, def) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setCapturingId(null); setKeyError(null); return; }
    // `code` : la touche physique (en AZERTY, « é » est la touche du 2, BUG-50).
    const refus = shortcutRejection(def, event.key, event.code);
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
    setShortcutKey(def.id, event.key, event.code);
    setCapturingId(null);
    setKeyError(null);
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

  // SAUVEGARDE NUAGE : un état court à l'écran, la phrase qui l'explique en
  // infobulle. L'ordre des tests est celui de la priorité (le pire d'abord).
  const cloudDir = cloudSaveDir();
  const cloudStatus = cloudDir ? cloudSaveStatus() : null;
  const saveSuspended = isLocalSaveUnreadable();
  // Suspendue parce que la save vient d'une version PLUS RÉCENTE du jeu (SAV-6),
  // et non parce qu'elle est illisible : la partie est là, il faut mettre à jour.
  const saveFromNewer = saveSuspended && localSaveSuspendReason() === "newer";
  // Version Steam (STEAM-4 / ELEC-3) : pas de Google Drive, Steam Cloud transporte
  // la partie — le dire, plutôt que « Drive non détecté ».
  const [cloudTone, cloudLabel, cloudText] = !cloudDir && cloudSteamVersion()
    ? ['on', tr({ fr: "Steam Cloud", en: "Steam Cloud" }), tr({
        fr: "Dans la version Steam, la partie voyage avec Steam Cloud, si tu l'as activé dans Steam. La copie dans Google Drive est réservée à la version hors Steam.",
        en: "In the Steam version, your game travels with Steam Cloud, if you enabled it in Steam. The Google Drive copy is only for the non-Steam version."
      })]
    : !cloudDir
    ? ['off', tr({ fr: "Inactive", en: "Inactive" }), tr({
        fr: "« Google Drive pour ordinateur » n'est pas détecté sur ce poste (fonction réservée à la version installée du jeu).",
        en: "“Google Drive for desktop” was not detected on this device (feature only available in the installed build)."
      })]
    : saveFromNewer
    ? ['warn', tr({ fr: "Protégée", en: "Protected" }), tr({
        fr: `La partie de ce poste vient d'une version plus récente du jeu : rien n'est envoyé vers ${cloudDir}, pour ne pas y mettre une copie rétrogradée. Mets le jeu à jour, puis relance.`,
        en: `This device's save comes from a newer version of the game: nothing is uploaded to ${cloudDir}, so no downgraded copy ends up there. Update the game, then restart.`
      })]
    : saveSuspended
    ? ['warn', tr({ fr: "Protégée", en: "Protected" }), tr({
        fr: `La partie locale n'a pas pu être relue au lancement : rien n'est envoyé vers ${cloudDir}, pour ne pas remplacer la copie du nuage par la partie neuve de repli.`,
        en: `The local save could not be read at launch: nothing is uploaded to ${cloudDir}, so the cloud copy is not replaced by the fallback new game.`
      })]
    : cloudStatus === 'conflict'
    ? ['warn', tr({ fr: "En pause", en: "Paused" }), tr({
        fr: `La partie dans ${cloudDir} a été modifiée par un autre poste pendant cette session. Pour ne pas écraser sa progression, plus rien n'est envoyé d'ici. Ferme le jeu sur l'un des deux postes, puis relance-le : la partie la plus avancée sera reprise.`,
        en: `The save in ${cloudDir} was changed by another device during this session. To avoid overwriting its progress, nothing more is uploaded from here. Close the game on one of the two devices, then restart it: the most advanced game will be picked up.`
      })]
    : cloudStatus === 'unreadable'
    ? ['warn', tr({ fr: "En pause", en: "Paused" }), tr({
        fr: `La partie déjà dans ${cloudDir} n'a pas pu être lue (Drive hors ligne ou fichier pas encore téléchargé). Rien n'est envoyé tant qu'elle reste illisible — ta partie du nuage est intacte. Vérifie que Google Drive est connecté, puis relance le jeu.`,
        en: `The save already in ${cloudDir} could not be read (Drive offline, or the file is not downloaded yet). Nothing is uploaded while it stays unreadable — your cloud save is untouched. Check that Google Drive is connected, then restart the game.`
      })]
    : cloudStatus === 'newer'
    ? ['warn', tr({ fr: "En pause", en: "Paused" }), tr({
        fr: `La partie dans ${cloudDir} vient d'une version PLUS RÉCENTE du jeu. Pour ne pas la rétrograder, rien n'est envoyé depuis ce poste. Mets le jeu à jour ici, puis relance.`,
        en: `The save in ${cloudDir} comes from a NEWER version of the game. To avoid downgrading it, nothing is uploaded from this device. Update the game here, then restart.`
      })]
    // Garde d'écriture : le nuage porte une partie plus avancée — « Active »
    // mentait, rien n'était plus répliqué (audit 2026-10-05, SAV-5).
    : cloudSyncInfo().behind
    ? ['warn', tr({ fr: "En pause", en: "Paused" }), tr({
        fr: `La partie dans ${cloudDir} est plus avancée que celle-ci : rien n'est envoyé d'ici, pour ne pas la remplacer. Relance le jeu pour la reprendre — celle-ci restera dans les copies de secours.`,
        en: `The save in ${cloudDir} is further along than this one: nothing is uploaded from here, so it is not replaced. Restart the game to pick it up — this one will stay in the backup copies.`
      })]
    : cloudSyncInfo().ok === false
    ? ['bad', tr({ fr: "Erreur", en: "Error" }), tr({
        fr: `La dernière écriture vers ${cloudDir} a échoué (dossier en lecture seule, quota Drive plein ou fichier verrouillé). Ta partie n'est peut-être plus répliquée — vérifie Google Drive.`,
        en: `The last write to ${cloudDir} failed (read-only folder, full Drive quota, or a locked file). Your game may no longer be replicated — check Google Drive.`
      })]
    : ['on', tr({ fr: "Active", en: "Active" }), tr({
        fr: `La partie suit ton Google Drive (${cloudDir}) — lance le jeu sur un autre poste équipé, elle t'y attend.`,
        en: `The save follows your Google Drive (${cloudDir}) — launch the game on another equipped device and it will be there.`
      })];

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

        {/* ARIA d'onglets : role="tablist"/"tab" + aria-selected — sans eux le
            lecteur d'écran annonce cinq boutons sans dire lequel est actif ni
            qu'ils forment un groupe d'onglets. */}
        <div className="options-tabs" role="tablist" aria-label={tr({ fr: "Categories d'options", en: "Option categories" })} onKeyDown={onOptionTabsKeyDown}>
          <button
            className={`options-tab ${activeGroup === 'aide' ? 'active' : ''}`}
            data-group="aide"
            type="button"
            role="tab"
            aria-selected={activeGroup === 'aide'}
            tabIndex={activeGroup === 'aide' ? 0 : -1}
            onClick={() => setActiveGroup('aide')}
          >
            {tr({ fr: "Aide", en: "Help" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'display' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeGroup === 'display'}
            tabIndex={activeGroup === 'display' ? 0 : -1}
            onClick={() => setActiveGroup('display')}
          >
            {tr({ fr: "Affichage", en: "Display" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'sound' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeGroup === 'sound'}
            tabIndex={activeGroup === 'sound' ? 0 : -1}
            onClick={() => setActiveGroup('sound')}
          >
            {tr({ fr: "Son", en: "Sound" })}
          </button>
          {/* `data-group` : la seule prise que le CSS ait sur ces onglets. Le
              régime tactile masque « Raccourcis » — un réglage de touches n'a
              aucun sens sur un appareil sans clavier, et c'est un onglet entier
              de choix rendus au joueur qui n'en a pas l'usage. */}
          <button
            className={`options-tab ${activeGroup === 'shortcuts' ? 'active' : ''}`}
            data-group="shortcuts"
            type="button"
            role="tab"
            aria-selected={activeGroup === 'shortcuts'}
            tabIndex={activeGroup === 'shortcuts' ? 0 : -1}
            onClick={() => setActiveGroup('shortcuts')}
          >
            {tr({ fr: "Raccourcis", en: "Shortcuts" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'other' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeGroup === 'other'}
            tabIndex={activeGroup === 'other' ? 0 : -1}
            onClick={() => setActiveGroup('other')}
          >
            {tr({ fr: "Sauvegarde", en: "Saves" })}
          </button>
          <button
            className={`options-tab ${activeGroup === 'credits' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeGroup === 'credits'}
            tabIndex={activeGroup === 'credits' ? 0 : -1}
            onClick={() => setActiveGroup('credits')}
          >
            {tr({ fr: "Crédits", en: "Credits" })}
          </button>

          {phoenixHeritage && (
            <button
              className={`options-tab ${activeGroup === 'script' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeGroup === 'script'}
              tabIndex={activeGroup === 'script' ? 0 : -1}
              onClick={() => setActiveGroup('script')}
            >
              {tr({ fr: "Automatisation", en: "Automation" })}
            </button>
          )}

          {hephHeritage && (
            <button
              className={`options-tab ${activeGroup === 'automates' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeGroup === 'automates'}
              tabIndex={activeGroup === 'automates' ? 0 : -1}
              onClick={() => setActiveGroup('automates')}
            >
              {tr({ fr: "Automates", en: "Automatons" })}
            </button>
          )}

        </div>

        {/* Hauteur fixée en CSS, pas ici : voir .options-rows. Un onglet court
            (Son) et un onglet long (Affichage) doivent rendre la MÊME fenêtre. */}
        {/* `is-help` : l'Aide défile en DEUX colonnes indépendantes (table des
            chapitres, page) ; l'encart ne défile donc plus lui-même. */}
        <div className={`options-rows${activeGroup === 'aide' ? ' is-help' : ''}`} role="tabpanel">
          {/* HELP PANEL */}
          {activeGroup === 'aide' && <HelpBook />}

          {/* DISPLAY PANEL */}
          {activeGroup === 'display' && (
            <>
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Langue", en: "Language" })} hint={tr({ fr: "Langue de l'interface et des textes", en: "Interface and text language" })} />
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

              {/* .exe seulement (ELEC-2) : rien ne s'affiche ailleurs. */}
              <FullscreenOption />

              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Notifications du fil", en: "Feed notifications" })} hint={tr({ fr: "Messages des habitants en haut de l'ecran", en: "Citizen messages at the top of the screen" })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${notifEnabled ? 'on' : 'off'}`}
                  aria-label={tr({ fr: notifEnabled ? 'Activé' : 'Désactivé', en: notifEnabled ? 'On' : 'Off' })}
                  aria-pressed={Boolean(notifEnabled)}
                  onClick={handleNotifToggle}
                >
                  
                </button>
              </div>

              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Format des nombres", en: "Number format" })} hint={tr({ fr: "Affichage compact, complet ou scientifique des ressources", en: "Compact, full or scientific display of resources" })} />
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
                    {/* L'aperçu groupe comme le format complet de la langue (I18N-10). */}
                    {tr({ fr: "1 200 000", en: "1,200,000" })}
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
                  <OptionLabel label={tr({ fr: "Cycle jour/nuit", en: "Day/night cycle" })} hint={tr({ fr: "Ambiance de la carte : cycle automatique, ou figée en plein jour / de nuit", en: "Map ambience: automatic cycle, or locked to daytime / nighttime" })} />
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
                  <OptionLabel label={tr({ fr: "Qualité graphique", en: "Graphics quality" })} hint={qualityHint()} />
                </div>
                <div className="number-format-control">
                  <button
                    className={`format-option ${qualityMode === 'auto' ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleQualityChange('auto')}
                  >
                    {qualityAutoLabel()}
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

              {/* ÉCONOMIE D'ÉNERGIE (PERF-5, energySaver.js) : activée par défaut. */}
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Économie d'énergie", en: "Energy saver" })} hint={tr({ fr: "La carte ralentit quand la fenêtre n'a pas le focus (12 images/s) ou après 3 minutes sans activité (20 images/s). Le moindre geste lui rend sa fluidité ; la partie, elle, avance toujours au même rythme.", en: "The map slows down when the window is not focused (12 frames/s) or after 3 minutes without activity (20 frames/s). Any input restores full smoothness; the game itself always runs at the same pace." })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${energySaver ? 'on' : 'off'}`}
                  aria-label={tr({ fr: energySaver ? 'Activé' : 'Désactivé', en: energySaver ? 'On' : 'Off' })}
                  aria-pressed={Boolean(energySaver)}
                  onClick={handleEnergySaverToggle}
                >

                </button>
              </div>

              <div className="options-row">
                <div>
                  {/* Renommé « Mouvement » (E4) : ce cran ne pilote plus la
                      seule carte, il coupe aussi les animations d'interface.
                      Garder l'ancien libellé aurait fait mentir le réglage.
                      L'asymétrie du cran intermédiaire est DITE, pas masquée :
                      une animation CSS se coupe ou ne se coupe pas, il n'y a
                      pas de demi-mesure côté interface. */}
                  <OptionLabel label={tr({ fr: "Mouvement", en: "Motion" })} hint={tr({ fr: "Mouvement d'ambiance sur la carte (feuilles, lucioles, fontaines) et animations de l'interface. Sans effet sur la netteté : la qualité sert la machine, ce réglage sert le confort. « Sobre » n'allège que la carte ; « Aucune » fige aussi l'interface.", en: "Ambient motion on the map (leaves, fireflies, fountains) and interface animations. Does not affect sharpness: quality serves the machine, this setting serves comfort. \"Sober\" only lightens the map; \"None\" also freezes the interface." })} />
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
              {/* `data-opt` : prise CSS pour le régime tactile, qui masque cette
                  rangée. La densité des panneaux est le réglage FIN du bureau ;
                  sur téléphone c'est la coquille tactile qui fixe les
                  espacements, et laisser le curseur ouvert reviendrait à offrir
                  un réglage qui se bat avec la mise en page. */}
              <div className="options-row" data-opt="density">
                <div>
                  <OptionLabel label={tr({ fr: "Densité des panneaux", en: "Panel density" })} hint={tr({ fr: "Espacement des panneaux et des rangées de la boutique. « Compacte » fait tenir plus de lignes à l'écran sans rien réduire du texte, utile sur un petit écran.", en: "Spacing of panels and shop rows. “Compact” fits more lines on screen without shrinking any text, useful on a small display." })} />
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
                  <OptionLabel label={tr({ fr: "Contraste renforcé", en: "High contrast" })} hint={tr({ fr: "Éclaircit les textes secondaires et marque les séparations entre panneaux. Utile sur un écran peu contrasté, en plein jour, ou si les petits textes gris vous demandent un effort.", en: "Brightens secondary text and strengthens the separations between panels. Useful on a low-contrast display, in daylight, or if small grey text takes you effort." })} />
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
                  <OptionLabel label={tr({ fr: "Météo", en: "Weather" })} hint={tr({ fr: "« Auto » fait passer une averse courte de temps en temps : la lumière baisse, il pleut, les rues se vident, puis le temps se dégage. En hiver la même averse tombe en neige. Figez sur Dégagé si vous préférez une image stable.", en: "“Auto” brings a short shower now and then: the light dims, it rains, the streets empty, then it clears. In winter the same shower falls as snow. Set to Clear if you prefer a stable image." })} />
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
                  <OptionLabel label={tr({ fr: "Saison", en: "Season" })} hint={tr({ fr: "L'herbe, les fleurs et les feuillages changent de couleur au fil de quatre saisons très lentes. Seul repère de temps long de la carte : revenir après une longue absence montre une ville d'une autre couleur.", en: "Grass, flowers and foliage change color across four very slow seasons. The map's only marker of long time: coming back after a long absence shows a city of another color." })} />
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

              {/* LA CHUTE SUR LA CARTE (CHUTE-9, choix de Raph) : complète une fois
                  par session par défaut, la partie est en pause pendant la chute. */}
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Chute de la cité", en: "Fall of the city" })} hint={tr({ fr: "Quand la cité tombe sous vos yeux : la vague de ruines, la nuit, puis le lever du campement dans les ruines. La partie attend la fin de la chute. « Complète une fois » la joue en entier à la première chute de la session, puis en version courte : plus rapide, sans la nuit.", en: "When the city falls before your eyes: the wave of ruins, the night, then the camp rising among the ruins. The game waits for the fall to end. “Full once” plays it in full at the first fall of the session, then in a short version: faster, without the night." })} />
                </div>
                <div className="number-format-control">
                  <button className={`format-option ${chuteMode === 'full' ? 'active' : ''}`} type="button" onClick={() => handleChuteChange('full')}>
                    {tr({ fr: "Toujours complète", en: "Always full" })}
                  </button>
                  <button className={`format-option ${chuteMode === 'session' ? 'active' : ''}`} type="button" onClick={() => handleChuteChange('session')}>
                    {tr({ fr: "Complète une fois", en: "Full once" })}
                  </button>
                  <button className={`format-option ${chuteMode === 'short' ? 'active' : ''}`} type="button" onClick={() => handleChuteChange('short')}>
                    {tr({ fr: "Toujours courte", en: "Always short" })}
                  </button>
                </div>
              </div>

              {/* TENUES SAGES (STEAM-6, plaisirsCast.js) : désactivée par défaut. */}
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Tenues sages", en: "Modest outfits" })} hint={tr({ fr: "Maison des Plaisirs : les danseuses, hôtesses, courtisanes et gigolos laissent la place aux habitants de l'âge, habillés comme la ville.", en: "House of Pleasures: the dancers, hostesses, courtesans and gigolos give way to the townsfolk of the age, dressed like the city." })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${tenuesSages ? 'on' : 'off'}`}
                  aria-label={tr({ fr: tenuesSages ? 'Activé' : 'Désactivé', en: tenuesSages ? 'On' : 'Off' })}
                  aria-pressed={Boolean(tenuesSages)}
                  onClick={handleTenuesSagesToggle}
                >

                </button>
              </div>
            </>
          )}

          {/* SOUND PANEL */}
          {activeGroup === 'sound' && (
            <>
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Musique", en: "Music" })} hint={tr({ fr: "La musique de fond", en: "The background music" })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${musicEnabled ? 'on' : 'off'}`}
                  aria-label={tr({ fr: musicEnabled ? 'Activé' : 'Désactivé', en: musicEnabled ? 'On' : 'Off' })}
                  aria-pressed={Boolean(musicEnabled)}
                  onClick={handleMusicToggle}
                >
                  
                </button>
              </div>

              {/* LE MORCEAU : un bouton par fichier du dossier src/assets/musiques/
                  (audio/musiques.js) — le même choix que sur la scène des Plaisirs. */}
              {musicTracks.length > 0 && (
                <div className="options-row">
                  <div>
                    <OptionLabel label={tr({ fr: "Morceau", en: "Track" })} hint={tr({ fr: "Se change aussi sur la scène de la Maison des Plaisirs", en: "Can also be changed on the stage of the House of Pleasures" })} />
                  </div>
                  <div className="number-format-control" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {musicTracks.map((t) => (
                      <button
                        key={t.id}
                        className={`format-option ${musicTrack === t.id ? 'active' : ''}`}
                        type="button"
                        aria-pressed={musicTrack === t.id}
                        onClick={() => handleTrackChange(t.id)}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="options-row options-row-volume">
                <div>
                  <OptionLabel label={tr({ fr: "Volume", en: "Volume" })} hint={tr({ fr: "Niveau de la musique de fond", en: "Background music level" })} />
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

              {/* L'AMBIANCE (2026-10-07) : les sons de la carte, à part de la musique. */}
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Ambiance", en: "Ambience" })} hint={tr({ fr: "Les sons de la carte, selon ce que montre l'écran", en: "The sounds of the map, following what the screen shows" })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${paysageActif ? 'on' : 'off'}`}
                  aria-label={tr({ fr: paysageActif ? 'Activé' : 'Désactivé', en: paysageActif ? 'On' : 'Off' })}
                  aria-pressed={Boolean(paysageActif)}
                  onClick={handlePaysageToggle}
                >

                </button>
              </div>

              <div className="options-row options-row-volume">
                <div>
                  <OptionLabel label={tr({ fr: "Volume de l'ambiance", en: "Ambience volume" })} hint={tr({ fr: "Niveau des sons de la carte", en: "Level of the map sounds" })} />
                </div>
                <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(paysageVolume * 100)}
                    onChange={handlePaysageVolume}
                    aria-label={tr({ fr: "Volume de l'ambiance", en: "Ambience volume" })}
                  />
                  <strong style={{ minWidth: '40px', textAlign: 'right' }}>
                    {Math.round(paysageVolume * 100)}%
                  </strong>
                </div>
              </div>

              {/* LES BRUITAGES (2026-10-03 : la machine à sous) — à part de la musique. */}
              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Bruitages", en: "Sound effects" })} hint={tr({ fr: "La chute de la cité, un nouvel âge, une maison qui sort de terre, le Grand Reset, et les jeux de la Maison des Plaisirs", en: "The fall of the city, a new age, a house rising from the ground, the Grand Reset, and the House of Pleasures games" })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${sfxEnabled ? 'on' : 'off'}`}
                  aria-label={tr({ fr: sfxEnabled ? 'Activé' : 'Désactivé', en: sfxEnabled ? 'On' : 'Off' })}
                  aria-pressed={Boolean(sfxEnabled)}
                  onClick={handleSfxToggle}
                >
                  
                </button>
              </div>

              <div className="options-row options-row-volume">
                <div>
                  <OptionLabel label={tr({ fr: "Volume des bruitages", en: "Effects volume" })} hint={tr({ fr: "Niveau des sons des jeux", en: "Level of the game sounds" })} />
                </div>
                <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(sfxVolume * 100)}
                    onChange={handleSfxVolume}
                    aria-label={tr({ fr: "Volume des bruitages", en: "Effects volume" })}
                  />
                  <strong style={{ minWidth: '40px', textAlign: 'right' }}>
                    {Math.round(sfxVolume * 100)}%
                  </strong>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Musique seulement en onglet actif", en: "Music only in active tab" })} hint={tr({ fr: "Met la musique en pause quand le jeu est en arrière-plan", en: "Pauses the music when the game is in the background" })} />
                </div>
                <button
                  type="button"
                  className={`toggle-btn ${musicActiveTabOnly ? 'on' : 'off'}`}
                  aria-label={tr({ fr: musicActiveTabOnly ? 'Activé' : 'Désactivé', en: musicActiveTabOnly ? 'On' : 'Off' })}
                  aria-pressed={Boolean(musicActiveTabOnly)}
                  onClick={handleActiveTabToggle}
                >
                  
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
                const capturing = capturingId === def.id;
                return (
                  /* plus de classe `is-off` : un raccourci ne s'éteint plus,
                     il se réattribue. */
                  <div key={def.id} className="options-row">
                    <div>
                      <OptionLabel label={tr(def.label)} hint={tr(def.hint)} />
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
                    </div>
                  </div>
                );
              })}

              {keyError && <div className="options-row shortcut-error"><small>{keyError}</small></div>}

              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Aller à une vue", en: "Go to a view" })} hint={tr({ fr: "Les vues débloquées, dans l'ordre de la barre latérale", en: "Unlocked views, in sidebar order" })} />
                </div>
                <kbd className="shortcut-kbd">1 – 8</kbd>
              </div>

              <div className="options-row">
                <div>
                  <OptionLabel label={tr({ fr: "Ouvrir les options", en: "Open options" })} hint={tr({ fr: "Ouvre ce menu à tout moment, et quitte la contemplation. Non réattribuable : c'est le chemin de secours.", en: "Opens this menu at any time, and leaves contemplation. Not remappable: it is the way back." })} />
                </div>
                <kbd className="shortcut-kbd">{tr({ fr: "Échap", en: "Esc" })}</kbd>
              </div>
            </>
          )}

          {/* OTHER PANEL */}
          {activeGroup === 'other' && (<>
            {/* SAUVEGARDER / EXPORTER / IMPORTER (demande Raph 2026-07-28).
                Sur téléphone la barre basse ne porte plus que l'icône Options :
                ces trois gestes doivent donc exister ICI, sans quoi ils
                deviendraient inatteignables. Rendus pour tout le monde — sur le
                bureau ils doublent la barre latérale, ce qui ne coûte rien et
                donne un endroit évident où les chercher. Les fonctions viennent
                d'App en props : aucune logique n'est réécrite ici. */}
            {(onSave || onExport || onImport) && (
              <div className="options-row" data-opt="save-actions">
                <div>
                  <OptionLabel
                    label={tr({ fr: "Sauvegarde", en: "Save" })}
                    hint={tr({
                      fr: "La partie s'enregistre toute seule ; ces boutons servent à forcer un enregistrement, à sortir une copie de secours ou à en recharger une.",
                      en: "The game saves itself; these buttons force a save, produce a backup copy, or load one back."
                    })}
                  />
                </div>
                <div className="options-save-actions">
                  {onSave && (
                    <button type="button" onClick={onSave}>{tr({ fr: "Sauvegarder", en: "Save" })}</button>
                  )}
                  {onExport && (
                    <button type="button" onClick={onExport}>{tr({ fr: "Exporter", en: "Export" })}</button>
                  )}
                  {onImport && (
                    <button type="button" disabled={chuteEnCours} onClick={onImport}>{tr({ fr: "Importer", en: "Import" })}</button>
                  )}
                </div>
              </div>
            )}
            {/* RÉSERVE D'ABSENCE : elle a quitté la carte d'identité de la Cité
                (relevé du 06/10, docs/PLAN-LISIBILITE.md), une valeur qui ne
                bouge qu'avec les Ruines n'avait pas à rester à l'écran. Même
                dévoilement que dans l'encart d'état (clé « meta »). */}
            {uiRevealed(state, 'meta') && (
              <div className="options-row" data-opt="idle-reserve">
                <div>
                  <OptionLabel
                    label={tr({ fr: "Réserve d'absence", en: "Away reserve" })}
                    hint={idleReserveHint(idleCapSeconds(), nextIdleCapPalier())}
                  />
                </div>
                <strong>{fmtSecs(idleCapSeconds())}</strong>
              </div>
            )}
            {/* Emplacements manuels : l'autosave écrase en continu, une partie
                qui dure des mois n'avait aucun filet avant un geste risqué. */}
            <div className="options-row">
              <div>
                <OptionLabel
                  label={tr({ fr: "Emplacements de sauvegarde", en: "Save slots" })}
                  hint={tr({
                    fr: "Trois instantanés manuels, indépendants de la sauvegarde automatique. Utile avant un Grand Reset ou un Mythe risqué.",
                    en: "Three manual snapshots, separate from the autosave. Useful before a Great Reset or a risky Myth."
                  })}
                />
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
                    <button type="button" disabled={!meta || chuteEnCours} onClick={() => handleSlotLoad(i)}>
                      {tr({ fr: "Charger", en: "Load" })}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Save du démarrage illisible (SAV-3) : rien ne s'écrit tant que le
                joueur n'a pas tranché. Le pourquoi passe en infobulle. */}
            {saveSuspended && (
              <div className="options-row save-slot">
                <div>
                  {saveFromNewer ? (
                    <OptionLabel
                      label={tr({ fr: "Sauvegarde d'une version plus récente", en: "Save from a newer version" })}
                      hint={tr({
                        fr: "Ta partie a été enregistrée par une version plus récente du jeu (branche bêta, mise à jour) : elle se joue ici sans ce que cette version ignore, et rien ne s'écrit pour ne pas l'abîmer — l'originale est gardée en copie de secours. Mets le jeu à jour puis Réessayer ; Garder l'enregistre pour cette version.",
                        en: "Your game was saved by a newer version of the game (beta branch, update): it plays here without what this version does not know, and nothing is written so it is not damaged — the original is kept as a backup copy. Update the game then Retry; Keep saves it for this version."
                      })}
                    />
                  ) : (
                    <OptionLabel
                      label={tr({ fr: "Sauvegarde illisible", en: "Unreadable save" })}
                      hint={tr({
                        fr: "La partie enregistrée n'a pas pu être relue : tu joues une partie neuve de repli, et rien ne s'écrit pour ne pas écraser l'ancienne, gardée en copie de secours. Réessayer relance le jeu et la relit ; Garder enregistre la partie neuve à sa place.",
                        en: "The saved game could not be read: you are playing a fallback new game, and nothing is written so the old one, kept as a backup copy, is not overwritten. Retry restarts the game and reads it again; Keep saves the new game in its place."
                      })}
                    />
                  )}
                </div>
                <div className="save-slot-actions">
                  <button type="button" onClick={() => window.location.reload()}>
                    {tr({ fr: "Réessayer", en: "Retry" })}
                  </button>
                  <button type="button" onClick={handleKeepFallback}>
                    {tr({ fr: "Garder", en: "Keep" })}
                  </button>
                </div>
              </div>
            )}

            {/* Copies de secours (SAV-3) : save illisible archivée, save locale
                évincée par le nuage. Absentes = aucune ligne. */}
            {listSaveBackups().map((backup) => {
              const when = backup.at
                ? new Date(backup.at).toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR')
                : tr({ fr: "date inconnue", en: "unknown date" });
              const sum = backup.summary;
              // Copie d'une version plus récente que ce build (SAV-6) : elle
              // s'exporte, mais ne se charge qu'après la mise à jour.
              const tooNew = backup.kind === 'version' && backup.version > CURRENT_SAVE_VERSION;
              return (
                <div key={backup.key} className="options-row save-slot">
                  <div>
                    <OptionLabel
                      label={backup.kind === 'pre-cloud'
                        ? tr({ fr: "Copie d'avant le nuage", en: "Pre-cloud copy" })
                        : backup.kind === 'before-import'
                        ? tr({ fr: "Copie d'avant l'import", en: "Pre-import copy" })
                        : backup.kind === 'version'
                        ? tr({ fr: `Copie de la version ${backup.version}`, en: `Version ${backup.version} copy` })
                        : tr({ fr: "Copie de secours", en: "Backup copy" })}
                      hint={backup.kind === 'pre-cloud'
                        ? tr({ fr: "La partie de ce poste, mise de côté au lancement parce que celle du nuage était plus avancée.", en: "This device's game, set aside at launch because the cloud one was more advanced." })
                        : backup.kind === 'before-import'
                        ? tr({ fr: "La partie remplacée par le dernier import, gardée telle quelle.", en: "The game replaced by the last import, kept as is." })
                        : backup.kind === 'version'
                        ? tr({ fr: "Ta partie telle que l'a enregistrée une version plus récente du jeu, avant d'être jouée ici. Elle se charge une fois le jeu à jour ; Exporter la sort en fichier.", en: "Your game as a newer version of the game saved it, before it was played here. It loads once the game is up to date; Export writes it to a file." })
                        : tr({ fr: "Une sauvegarde qui n'a pas pu être relue en entier, gardée telle quelle. Charger reprend tout ce qui se relit ; Exporter la sort en fichier.", en: "A save that could not be fully read, kept as is. Load restores everything readable; Export writes it to a file." })}
                    />
                    <small>
                      {sum
                        ? tr({
                            fr: `${sum.city || "Cité"} · ${sum.cycles} cycle${sum.cycles > 1 ? 's' : ''} · ${when}`,
                            en: `${sum.city || "City"} · ${sum.cycles} cycle${sum.cycles > 1 ? 's' : ''} · ${when}`
                          })
                        : when}
                    </small>
                  </div>
                  <div className="save-slot-actions">
                    <button type="button" onClick={() => handleBackupExport(backup)}>
                      {tr({ fr: "Exporter", en: "Export" })}
                    </button>
                    <button type="button" disabled={chuteEnCours || tooNew} onClick={() => handleBackupLoad(backup)}>
                      {tr({ fr: "Charger", en: "Load" })}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Un ÉTAT court à l'écran (Active / En pause / Erreur / Inactive) ;
                la phrase qui l'explique passe en infobulle — règle de DA du
                2026-10-03 : aucune phrase d'explication à l'écran. */}
            <div className="options-row">
              <div>
                <span>{tr({ fr: "Sauvegarde nuage", en: "Cloud save" })}</span>
              </div>
              <span
                className={`options-status is-${cloudTone}`}
                tabIndex={0}
                {...tipProps(tr({ fr: "Sauvegarde nuage", en: "Cloud save" }), cloudText)}
              >
                {cloudLabel}
              </span>
            </div>
          </>)}
          {activeGroup === 'other' && (
            <div className="options-row options-row-danger">
              <div>
                <OptionLabel label={tr({ fr: "Réinitialiser la partie", en: "Reset the game" })} hint={tr({ fr: "Efface toute la progression, sauf les emplacements de sauvegarde et les copies de secours", en: "Erases all progress, except save slots and backup copies" })} />
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

          {/* CREDITS PANEL — assets tiers embarqués dans le jeu, une ligne par pack
              livré (le tableau de CREDITS.md fait foi et dit lesquels EXIGENT ce
              crédit : MinZinn, Crusenho, Abstraction, Font Awesome, cartes) : cet
              onglet est ce qui rend le jeu conforme, ne pas retirer une ligne sans
              retirer l'asset. Toute ligne se tient en FR ET en EN. */}
          {activeGroup === 'credits' && (
            <>
              {/* ⚠ La musique et les icônes exigent ce crédit, ce n'est pas une
                  politesse. Abstraction demande le titre de la piste, son nom et
                  un lien ; Font Awesome Free : icônes CC BY 4.0, police SIL OFL
                  1.1, CSS MIT (LICENSE.txt du paquet). Ne pas retirer. */}
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
              {/* ⚠ La licence Crusenho impose le crédit ET un lien vers la page
                  produit, et impose d'indiquer que le matériel a été modifié
                  (les sprites sont recolorés en or de marque). Ne pas retirer
                  sans retirer le chrome de public/pixelart/ui/chrome/wizard/. */}
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Chrome de l'interface", en: "Interface chrome" })}</span>
                  <small>
                    {tr({
                      fr: "« Complete UI Book Styles Pack » par Crusenho Agus Hennihuno (crusenho.itch.io/complete-ui-book-styles-pack). Boutons, onglets, cartes et jauges viennent de ce pack, modifiés : recolorés aux couleurs du jeu.",
                      en: "“Complete UI Book Styles Pack” by Crusenho Agus Hennihuno (crusenho.itch.io/complete-ui-book-styles-pack). Buttons, tabs, cards and gauges come from this pack, modified: recoloured to the game's palette."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Icônes de l'interface", en: "Interface icons" })}</span>
                  <small>
                    {tr({
                      fr: "« Font Awesome Free » 6.7.2 par Fonticons, Inc. (fontawesome.com). Icônes sous licence Creative Commons Attribution 4.0, fichiers de police sous SIL Open Font License 1.1, code sous licence MIT.",
                      en: "“Font Awesome Free” 6.7.2 by Fonticons, Inc. (fontawesome.com). Icons under the Creative Commons Attribution 4.0 license, font files under the SIL Open Font License 1.1, code under the MIT license."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Polices", en: "Typefaces" })}</span>
                  <small>
                    {tr({
                      fr: "Jersey 15 (Sarah Cadigan-Fried), Pixelify Sans (Stefie Justprince), Silkscreen (Jason Kottke) et Inter (Rasmus Andersson), les quatre polices du jeu, sous licence SIL Open Font 1.1.",
                      en: "Jersey 15 (Sarah Cadigan-Fried), Pixelify Sans (Stefie Justprince), Silkscreen (Jason Kottke) and Inter (Rasmus Andersson), the game's four typefaces, under the SIL Open Font License 1.1."
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
              {/* ⚠ CC BY 4.0 : le crédit, le lien vers la licence ET la mention des
                  modifications sont OBLIGATOIRES partout où le jeu est diffusé
                  (audit STEAM-1). Ne pas retirer sans retirer les veh-* du pack
                  (vehicleSkins.js, scripts/importPackVehicles.mjs). */}
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Véhicules modernes", en: "Modern vehicles" })}</span>
                  <small>
                    {tr({
                      fr: "« Pixel Vehicles » par MinZinn (minzinn.itch.io/pixelvehicles), sous licence Creative Commons Attribution 4.0 (creativecommons.org/licenses/by/4.0). Voitures, bus, camions et véhicules de service des derniers âges, modifiés : recadrés, réduits, désaturés et ramenés à la palette du jeu.",
                      en: "“Pixel Vehicles” by MinZinn (minzinn.itch.io/pixelvehicles), under the Creative Commons Attribution 4.0 license (creativecommons.org/licenses/by/4.0). Cars, buses, trucks and service vehicles of the later ages, modified: cropped, scaled down, desaturated and reduced to the game palette."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Herbes et buissons", en: "Grass tufts and bushes" })}</span>
                  <small>
                    {tr({
                      fr: "« Pixel Art Top Down - Basic » par Cainos (cainos.itch.io). Les touffes d'herbe et les buissons de la carte viennent de ce pack, recolorés à la palette du jeu.",
                      en: "“Pixel Art Top Down - Basic” by Cainos (cainos.itch.io). The map's grass tufts and bushes come from this pack, recolored to the game palette."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Sons de la nature et de la ville", en: "Nature and city sounds" })}</span>
                  <small>
                    {tr({
                      fr: "Enregistrements de Joseph Sardin, du Tiroir du fond, de Pablo Bergel et d'Axeline T., sur BigSoundBank (bigsoundbank.com), domaine public (CC0). Les oiseaux, les grenouilles, les foules, les enfants, les chevaux, la circulation, le port, les feux, les métiers, les bêtes, la pluie et les émeutes de la carte en viennent, découpés et mis au même niveau.",
                      en: "Recordings by Joseph Sardin, Le tiroir du fond, Pablo Bergel and Axeline T., on BigSoundBank (bigsoundbank.com), public domain (CC0). The map's birds, frogs, crowds, children, horses, traffic, harbor, fires, trades, livestock, rain and riots come from them, trimmed and leveled."
                    })}
                  </small>
                </div>
              </div>
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Cadre doré", en: "Golden frame" })}</span>
                  <small>
                    {tr({
                      fr: "« Fantasy UI Borders » par Kenney (kenney.nl), domaine public (CC0), teinté or.",
                      en: "“Fantasy UI Borders” by Kenney (kenney.nl), public domain (CC0), tinted gold."
                    })}
                  </small>
                </div>
              </div>
              {/* L'outil, pas un pack : aucun crédit n'est exigé, Raph l'a voulu ici
                  (STEAM-7) ; la déclaration Steam vit dans docs/STEAM-PUBLICATION.md. */}
              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Génération d'images", en: "Image generation" })}</span>
                  <small>
                    {tr({
                      fr: "L'essentiel du pixel art (bâtiments, habitants, véhicules d'époque, bateaux, sols, arbres, animaux, icônes, scènes) a été généré avec PixelLab (pixellab.ai), un outil d'IA, puis choisi, ramené à la palette du jeu et retouché. Rien n'est généré pendant la partie.",
                      en: "Most of the pixel art (buildings, townsfolk, period vehicles, boats, ground, trees, animals, icons, scenes) was generated with PixelLab (pixellab.ai), an AI tool, then selected, reduced to the game palette and retouched. Nothing is generated while you play."
                    })}
                  </small>
                </div>
              </div>
              {/* Notices MIT / OFL des bibliothèques et polices (STEAM-5). */}
              <SoftwareLicenses />
            </>
          )}

          {/* SCRIPT PANEL (Unlocked by Phoenix Heritage) */}
          {activeGroup === 'script' && phoenixHeritage && (
            <div id="autoScriptPanel">
              {autoScriptRules.map(r => (
                <div key={r.id} className="options-row auto-script-rule">
                  <div>
                    {/* Libellé tiré de la table par id, dans la langue du moment (I18N-7). */}
                    <span className="auto-script-label">{tr(RULE_LABELS[r.id] || r.id)}</span>
                    <div className="auto-script-threshold">
                      <DraftNumberInput
                        className="auto-script-input"
                        value={r.threshold}
                        min={r.type === 'time' ? AUTO_COLLAPSE_MIN_SECONDS / 60 : 1}
                        max="9999"
                        onCommit={(raw) => handleAutoScriptThreshold(r.id, raw)}
                      />
                      <span className="auto-script-unit">{r.unit}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-btn ${r.enabled ? 'on' : 'off'}`}
                  aria-label={tr({ fr: r.enabled ? 'Activé' : 'Désactivé', en: r.enabled ? 'On' : 'Off' })}
                  aria-pressed={Boolean(r.enabled)}
                    onClick={() => handleAutoScriptToggle(r.id)}
                  >
                    
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
                      <span className="auto-script-label">{tr(RULE_LABELS[r.id] || r.id)}</span>
                      {hasThreshold && (
                        <div className="auto-script-threshold">
                          {/* Validés en sortant du champ, comme l'onglet
                              Automatisation : contrôlés à chaque frappe, ces
                              champs ne pouvaient pas être vidés (BUG-113). */}
                          <DraftNumberInput
                            className="auto-script-input"
                            value={r.threshold}
                            min="1"
                            max="99"
                            onCommit={(raw) => handleAutomateThreshold(r.id, raw)}
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
                            <DraftNumberInput
                              className="auto-script-input"
                              value={r.reservePct}
                              min={AUTOMATE_FIELD_BOUNDS.reservePct[0]}
                              max={AUTOMATE_FIELD_BOUNDS.reservePct[1]}
                              onCommit={(raw) => handleAutomateField(r.id, 'reservePct', raw)}
                            />
                            <span className="auto-script-unit">%</span>
                          </label>
                          <label {...tipProps(tr({ fr: "débit", en: "rate" }), tr({
                            fr: "Nombre d'achats par seconde. Volontairement bas : il pèse aussi sur le rattrapage hors ligne.",
                            en: "Purchases per second. Deliberately low: it also weighs on offline catch-up."
                          }))}>
                            <span className="auto-script-unit">{tr({ fr: "débit", en: "rate" })}</span>
                            <DraftNumberInput
                              className="auto-script-input"
                              value={r.perTick}
                              min={AUTOMATE_FIELD_BOUNDS.perTick[0]}
                              max={AUTOMATE_FIELD_BOUNDS.perTick[1]}
                              onCommit={(raw) => handleAutomateField(r.id, 'perTick', raw)}
                            />
                            <span className="auto-script-unit">{tr({ fr: "/s", en: "/s" })}</span>
                          </label>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`toggle-btn ${r.enabled ? 'on' : 'off'}`}
                  aria-label={tr({ fr: r.enabled ? 'Activé' : 'Désactivé', en: r.enabled ? 'On' : 'Off' })}
                  aria-pressed={Boolean(r.enabled)}
                      onClick={() => handleAutomateToggle(r.id)}
                    >
                      
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
          <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: "Fermer", en: "Close" })}</button>
        </menu>
      </form>
    </dialog>
  );
}
