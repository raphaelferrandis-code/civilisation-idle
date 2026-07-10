import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { setCrisisPosture, setAutoCollapseConfig } from '../../game/core/actions.js';
import { tr } from '../../game/core/i18n.js';

/**
 * Doctrine de crise — panneau de l'onglet Effondrement (déplacé depuis les
 * Options). Le Conseil de crise applique la posture choisie à chaque palier de
 * Rupture (25 / 50 / 75 %) sans dialogue bloquant ; l'Édit d'effondrement y
 * ajoute l'effondrement automatique configurable.
 */
export default function CrisisDoctrinePanel() {
  const conseilDeCrise = useGameState(s => Boolean(s.upgrades.conseil_de_crise));
  const editEffondrement = useGameState(s => Boolean(s.upgrades.edit_effondrement));
  const crisisDoctrine = useGameState(s => s.crisisDoctrine) || {};
  const autoCollapse = crisisDoctrine.autoCollapse || {};
  // Les setters mutent crisisDoctrine EN PLACE (même référence) : le sélecteur
  // ci-dessus ne re-rend pas seul. On force le re-render localement, comme le
  // faisait OptionsDialog avec optionRevision.
  const [, setRevision] = useState(0);

  const handleSetPosture = (palier, stance) => {
    setCrisisPosture(palier, stance);
    setRevision(r => r + 1);
  };

  const handleAutoCollapse = (patch) => {
    setAutoCollapseConfig(patch);
    setRevision(r => r + 1);
  };

  return (
    <div className="panel doctrine-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Doctrine de crise", en: "Crisis Doctrine" })}</h2>
        </div>
      </div>

      {!conseilDeCrise ? (
        <div className="options-rows doctrine-rows">
          <div className="options-row">
            <div>
              <span>🔒 {tr({ fr: "Conseil de crise", en: "Crisis council" })}</span>
              <small>{tr({
                fr: "Se débloque dans l'Arbre des Ruines (dès le cycle 2) : réponse automatique aux paliers de Rupture 25 / 50 / 75 %, sans interruption.",
                en: "Unlocks in the Ruins Tree (from cycle 2): automatic response at the 25 / 50 / 75% Rupture thresholds, without interruption."
              })}</small>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="doctrine-intro">{tr({
            fr: "Le Conseil applique ta ligne à chaque palier de Rupture, sans interrompre le jeu.",
            en: "The Council enforces your line at each Rupture threshold, without interrupting the game."
          })}</p>

          <div className="options-rows doctrine-rows">
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
          </div>
        </>
      )}
    </div>
  );
}
