import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { setCrisisPosture, setAutoCollapseConfig } from '../../game/core/actions.js';
import { tr } from '../../game/core/i18n.js';
import TestamentSeals from './TestamentSeals.jsx';
import { tipProps } from './HelpBubble.jsx';

/**
 * Doctrine de crise — refonte dé-boxée (retour Raph 2026-07-13) : trois
 * colonnes (Conseil / Édit / Testament), libellés courts, les explications
 * vivent en tooltip. Le Testament est TOUJOURS visible : il gouverne tout
 * effondrement, manuel comme automatique, même sans Conseil ni Édit.
 */
export default function CrisisDoctrinePanel() {
  const conseilDeCrise = useGameState(s => Boolean(s.upgrades.conseil_de_crise));
  const editEffondrement = useGameState(s => Boolean(s.upgrades.edit_effondrement));
  const crisisDoctrine = useGameState(s => s.crisisDoctrine) || {};
  const autoCollapse = crisisDoctrine.autoCollapse || {};
  // Les setters mutent crisisDoctrine EN PLACE (même référence) : le sélecteur
  // ci-dessus ne re-rend pas seul. On force le re-render localement.
  const [, setRevision] = useState(0);

  const handleSetPosture = (palier, stance) => {
    setCrisisPosture(palier, stance);
    setRevision(r => r + 1);
  };

  const handleAutoCollapse = (patch) => {
    setAutoCollapseConfig(patch);
    setRevision(r => r + 1);
  };

  const stances = [
    { v: 'ask', t: { fr: 'Demander', en: 'Ask' }, tip: { fr: "La crise s'ouvre en dialogue et met le jeu en pause.", en: "The crisis opens as a dialog and pauses the game." } },
    { v: 'stabiliser', t: { fr: 'Stabiliser', en: 'Stabilize' }, tip: { fr: "Le Conseil calme la Rupture, sans interruption.", en: "The Council calms the Rupture, without interruption." } },
    { v: 'temporiser', t: { fr: 'Temporiser', en: 'Delay' }, tip: { fr: "Le Conseil laisse monter la Rupture, sans interruption.", en: "The Council lets the Rupture rise, without interruption." } }
  ];

  const triggers = [
    { v: 'rupture100', t: { fr: '100 %', en: '100%' }, tip: { fr: "À la crise terminale, après un délai de grâce.", en: "At the terminal crisis, after a grace delay." } },
    { v: 'usure', t: { fr: 'Usure', en: 'Wear' }, tip: { fr: "Dès que l'Usure atteint le seuil choisi.", en: "As soon as Wear reaches the chosen threshold." } },
    { v: 'temps', t: { fr: 'Durée', en: 'Time' }, tip: { fr: "Après une durée de cycle fixe.", en: "After a fixed cycle duration." } }
  ];

  return (
    <div className="panel doctrine-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Doctrine de crise", en: "Crisis Doctrine" })}</h2>
        </div>
      </div>

      <div className="doctrine-grid">
        {/* ── Le Conseil : posture appliquée aux paliers de Rupture ── */}
        <section className="doctrine-group">
          <h3
            className="doctrine-group-title"
            {...tipProps(tr({ fr: "Conseil de crise", en: "Crisis council" }), tr({
              fr: "Le Conseil applique ta posture à chaque palier de Rupture, sans interrompre le jeu. Se débloque dans l'Arbre des Ruines (dès le cycle 2).",
              en: "The Council enforces your stance at each Rupture threshold, without interrupting the game. Unlocks in the Ruins Tree (from cycle 2)."
            }))}
          >
            {tr({ fr: "Conseil de crise", en: "Crisis council" })}
          </h3>
          {!conseilDeCrise ? (
            <p className="doctrine-locked">🔒 {tr({ fr: "Arbre des Ruines · cycle 2", en: "Ruins Tree · cycle 2" })}</p>
          ) : (
            ['p25', 'p50', 'p75'].map((key, i) => (
              <div key={key} className="doctrine-line">
                <span className="doctrine-line-label">{tr({ fr: `Rupture ${(i + 1) * 25} %`, en: `Rupture ${(i + 1) * 25}%` })}</span>
                <div className="doctrine-seg">
                  {stances.map(({ v, t, tip }) => (
                    <button
                      key={v}
                      type="button"
                      {...tipProps(tr(t), tr(tip))}
                      className={`doctrine-seg-btn${(crisisDoctrine[key] || 'ask') === v ? ' is-active' : ''}`}
                      onClick={() => handleSetPosture(key, v)}
                    >
                      {tr(t)}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* ── L'Édit : effondrement automatique ── */}
        <section className="doctrine-group">
          <h3
            className="doctrine-group-title"
            {...tipProps(tr({ fr: "Édit d'effondrement", en: "Collapse Edict" }), tr({
              fr: "La cité tombe seule au déclencheur choisi, héritage préservé, sans dialogue. Se débloque dans l'Arbre des Ruines.",
              en: "The city falls on its own at the chosen trigger, heritage preserved, without any dialog. Unlocks in the Ruins Tree."
            }))}
          >
            {tr({ fr: "Édit d'effondrement", en: "Collapse Edict" })}
          </h3>
          {!editEffondrement ? (
            <p className="doctrine-locked">🔒 {tr({ fr: "Arbre des Ruines", en: "Ruins Tree" })}</p>
          ) : (
            <>
              <div className="doctrine-line">
                <span className="doctrine-line-label">{tr({ fr: "Automatique", en: "Automatic" })}</span>
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
                  <div className="doctrine-line">
                    <span className="doctrine-line-label">{tr({ fr: "Déclencheur", en: "Trigger" })}</span>
                    <div className="doctrine-seg">
                      {triggers.map(({ v, t, tip }) => (
                        <button
                          key={v}
                          type="button"
                          {...tipProps(tr(t), tr(tip))}
                          className={`doctrine-seg-btn${autoCollapse.trigger === v ? ' is-active' : ''}`}
                          onClick={() => handleAutoCollapse({ trigger: v })}
                        >
                          {tr(t)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {autoCollapse.trigger === 'usure' && (
                    <div className="doctrine-line">
                      <span className="doctrine-line-label">{tr({ fr: "Seuil d'Usure", en: "Wear threshold" })}</span>
                      <span className="doctrine-input-wrap">
                        <input
                          type="number"
                          className="auto-script-input"
                          min="10"
                          max="100"
                          value={Math.round((autoCollapse.usureThreshold ?? 0.9) * 100)}
                          onChange={(e) => handleAutoCollapse({ usureThreshold: (parseFloat(e.target.value) || 0) / 100 })}
                        />
                        <span className="auto-script-unit">%</span>
                      </span>
                    </div>
                  )}

                  {autoCollapse.trigger === 'temps' && (
                    <div className="doctrine-line">
                      <span className="doctrine-line-label">{tr({ fr: "Durée de cycle", en: "Cycle duration" })}</span>
                      <span className="doctrine-input-wrap">
                        <input
                          type="number"
                          className="auto-script-input"
                          min="1"
                          max="1440"
                          value={Math.round((autoCollapse.timeSeconds ?? 600) / 60)}
                          onChange={(e) => handleAutoCollapse({ timeSeconds: (parseFloat(e.target.value) || 0) * 60 })}
                        />
                        <span className="auto-script-unit">min</span>
                      </span>
                    </div>
                  )}

                  <div className="doctrine-line">
                    <span
                      className="doctrine-line-label"
                      {...tipProps(tr({ fr: "Sauver avant", en: "Save first" }), tr({ fr: "Rationner puis Réformes avant d'effondrer, si la crise est résoluble.", en: "Ration then Reforms before collapsing, if the crisis is solvable." }))}
                    >
                      {tr({ fr: "Sauver avant", en: "Save first" })}
                    </span>
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
          )}
        </section>

        {/* ── Testament : gouverne TOUT effondrement (manuel comme auto) —
            toujours visible, même sans Conseil ni Édit. ── */}
        <section className="doctrine-group doctrine-group--testament">
          <TestamentSeals />
        </section>
      </div>
    </div>
  );
}
