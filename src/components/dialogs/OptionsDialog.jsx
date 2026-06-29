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
import { getLang, setLang, t, tr } from '../../game/core/i18n.js';
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
import { SAVE_KEY, defaultState, setState, invalidateRenderCache, render, save } from '../../game/core/state.js';

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
    if (!confirm(tr({ fr: "Recommencer depuis le tout premier feu ?", en: "Start over from the very first fire?" }))) return;
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

          {conseilDeCrise && (
            <button
              className={`options-tab ${activeGroup === 'doctrine' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveGroup('doctrine')}
            >
              {tr({ fr: "Doctrine de crise", en: "Crisis Doctrine" })}
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

          {/* OTHER PANEL */}
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
                { key: 'p25', label: { fr: 'Crise à 25 % de Rupture', en: 'Crisis at 25% Rupture' } },
                { key: 'p50', label: { fr: 'Crise à 50 % de Rupture', en: 'Crisis at 50% Rupture' } },
                { key: 'p75', label: { fr: 'Crise à 75 % de Rupture', en: 'Crisis at 75% Rupture' } }
              ].map(({ key, label }) => (
                <div key={key} className="options-row">
                  <div>
                    <span>{tr(label)}</span>
                    <small>{tr({ fr: "Réponse automatique (sans interruption)", en: "Automatic response (no interruption)" })}</small>
                  </div>
                  <div className="number-format-control">
                    {[
                      { v: 'ask', t: { fr: 'Demander', en: 'Ask' } },
                      { v: 'stabiliser', t: { fr: 'Stabiliser', en: 'Stabilize' } },
                      { v: 'temporiser', t: { fr: 'Temporiser', en: 'Delay' } }
                    ].map(({ v, t }) => (
                      <button
                        key={v}
                        type="button"
                        className={`format-option ${(crisisDoctrine[key] || 'ask') === v ? 'active' : ''}`}
                        onClick={() => handleSetPosture(key, v)}
                      >
                        {tr(t)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {editEffondrement ? (
                <>
                  <div className="options-row">
                    <div>
                      <span>{tr({ fr: "Effondrement automatique", en: "Automatic collapse" })}</span>
                      <small>{tr({ fr: "La cité tombe seule au moment choisi (héritage préservé)", en: "The city collapses on its own at the chosen moment (heritage preserved)" })}</small>
                    </div>
                    <button
                      type="button"
                      className={`toggle-btn ${autoCollapse.enabled ? 'on' : 'off'}`}
                      onClick={() => handleAutoCollapse({ enabled: !autoCollapse.enabled })}
                    >
                      {autoCollapse.enabled ? tr({ fr: "Actif", en: "On" }) : tr({ fr: "Inactif", en: "Off" })}
                    </button>
                  </div>

                  {autoCollapse.enabled && (
                    <>
                      <div className="options-row">
                        <div>
                          <span>{tr({ fr: "Déclencheur", en: "Trigger" })}</span>
                          <small>{tr({ fr: "Quand effondrer automatiquement", en: "When to collapse automatically" })}</small>
                        </div>
                        <div className="number-format-control">
                          {[
                            { v: 'rupture100', t: { fr: 'Rupture 100 %', en: 'Rupture 100%' } },
                            { v: 'usure', t: { fr: 'Usure', en: 'Wear' } },
                            { v: 'temps', t: { fr: 'Durée', en: 'Duration' } }
                          ].map(({ v, t }) => (
                            <button
                              key={v}
                              type="button"
                              className={`format-option ${autoCollapse.trigger === v ? 'active' : ''}`}
                              onClick={() => handleAutoCollapse({ trigger: v })}
                            >
                              {tr(t)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {autoCollapse.trigger === 'usure' && (
                        <div className="options-row">
                          <div>
                            <span>{tr({ fr: "Seuil d'Usure", en: "Wear threshold" })}</span>
                            <small>{tr({ fr: "Effondre dès que l'Usure atteint ce pourcentage", en: "Collapses as soon as Wear reaches this percentage" })}</small>
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
                            <span>{tr({ fr: "Durée de cycle", en: "Cycle duration" })}</span>
                            <small>{tr({ fr: "Effondre après ce nombre de minutes", en: "Collapses after this number of minutes" })}</small>
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
                          <span>{tr({ fr: "Tenter de sauver avant", en: "Try to save first" })}</span>
                          <small>{tr({ fr: "Rationner / Réformes avant d'effondrer si la crise est résoluble", en: "Ration / Reforms before collapsing if the crisis is solvable" })}</small>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${autoCollapse.prepare ? 'on' : 'off'}`}
                          onClick={() => handleAutoCollapse({ prepare: !autoCollapse.prepare })}
                        >
                          {autoCollapse.prepare ? tr({ fr: "Oui", en: "Yes" }) : tr({ fr: "Non", en: "No" })}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="options-row">
                  <div>
                    <span>{tr({ fr: "Effondrement automatique", en: "Automatic collapse" })}</span>
                    <small>{tr({ fr: "Débloqué par l'upgrade de ruines « Édit d'effondrement ».", en: "Unlocked by the ruins upgrade « Collapse Edict »." })}</small>
                  </div>
                </div>
              )}

              <div className="options-row">
                <div>
                  <span>{tr({ fr: "Gain hors-ligne", en: "Offline gain" })}</span>
                  <small>{tr({ fr: "La cité produit et vieillit en ton absence, jusqu'à ce plafond. Étends-le avec « Veilleurs de nuit ».", en: "The city produces and ages while you're away, up to this cap. Extend it with « Night Watchers »." })}</small>
                </div>
                <strong>{Math.round(idleCapSeconds() / 3600)} h</strong>
              </div>
            </div>
          )}
        </div>

        <menu style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onClose}>{tr({ fr: "Fermer", en: "Close" })}</button>
        </menu>
      </form>
    </dialog>
  );
}
