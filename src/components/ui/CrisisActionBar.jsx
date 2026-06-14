import { useEffect, useRef } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown, crisisCosts } from '../../game/core/mechanics.js';
import { runCrisisAction } from '../../game/core/actions.js';
import { pct, costLabel, canPayCost } from '../../game/core/utils.js';

/**
 * Actions de régulation des foyers de tension (Subsistance / Inégalités /
 * Complexité / Dissidence). Source unique partagée par :
 *  — l'en-tête de la Cité (variant="compact", toujours visible) ;
 *  — l'onglet Effondrement (variant="full", tableau tactique détaillé).
 *
 * L'abonnement à `instability` cale le recalcul des coûts et de l'état
 * "payable" sur le tick (1 Hz), comme dans la vue Effondrement d'origine.
 */
export default function CrisisActionBar({ variant = 'full' }) {
  useGameState(s => s.instability);
  const cycles = useGameState(s => s.cycles);

  // Variante compacte : un seul pointerdown gère la fermeture au clic extérieur
  // ET l'accordéon (ouvrir un foyer ferme les autres → un seul menu flottant).
  const regulRef = useRef(null);
  useEffect(() => {
    if (variant !== 'compact') return undefined;
    const onPointerDown = (e) => {
      const root = regulRef.current;
      if (!root) return;
      const clickedFoyer = e.target instanceof Element ? e.target.closest('.crisis-foyer') : null;
      root.querySelectorAll('.crisis-foyer[open]').forEach((d) => {
        if (d !== clickedFoyer) d.open = false;
      });
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [variant]);

  const pressure = pressureBreakdown();
  const costs = crisisCosts();
  const showArchiveBtn = cycles >= 2;
  const showAncestorBtn = cycles >= 3;

  if (variant === 'compact') {
    const foyers = [
      {
        key: 'scarcity', icon: '🌾', label: 'Subsistance', tone: 'food',
        value: pressure.scarcity, denom: 0.7,
        actions: [{ id: 'rationing', label: 'Rationner', cost: costs.rationing }]
      },
      {
        key: 'inequality', icon: '⚖️', label: 'Inégalités', tone: 'gold',
        value: pressure.inequality, denom: 0.55,
        actions: [{ id: 'festivals', label: 'Jeux civiques', cost: costs.festivals }]
      },
      {
        key: 'complexity', icon: '🏛️', label: 'Complexité', tone: 'know',
        value: pressure.complexity, denom: 0.75,
        actions: [
          { id: 'census', label: 'Recenser', cost: costs.census },
          { id: 'reforms', label: 'Réformes', cost: costs.reforms }
        ]
      },
      {
        key: 'dissent', icon: '📜', label: 'Dissidence', tone: 'infra',
        value: pressure.dissent, denom: 0.55,
        actions: [
          showAncestorBtn && { id: 'ancestorCrisis', label: 'Culte des ancêtres', cost: costs.ancestorCrisis },
          showArchiveBtn && { id: 'archiveCrisis', label: 'Catastrophes', cost: costs.archiveCrisis }
        ].filter(Boolean)
      }
    ];

    return (
      <div className="crisis-regul" aria-label="Régulation des tensions" ref={regulRef}>
        <div className="crisis-regul-head">
          <span className="crisis-regul-title">Régulation des tensions</span>
          <span className="crisis-regul-hint">Ouvrez un foyer pour dépenser des ressources et l'apaiser</span>
        </div>
        <div className="crisis-regul-grid">
          {foyers.map((f) => (
            <details key={f.key} className={`crisis-foyer crisis-foyer--${f.tone}`}>
              <summary className="crisis-foyer-head">
                <span className="crisis-foyer-icon" aria-hidden="true">{f.icon}</span>
                <span className="crisis-foyer-name">{f.label}</span>
                <strong className="crisis-foyer-pct">{pct(f.value)}</strong>
                <span className="crisis-foyer-chevron" aria-hidden="true"></span>
                <span className="crisis-foyer-track" aria-hidden="true">
                  <span
                    className="crisis-foyer-fill"
                    style={{ width: `${Math.min(1, f.value / f.denom) * 100}%` }}
                  ></span>
                </span>
              </summary>
              <div className="crisis-foyer-actions">
                {f.actions.length === 0 ? (
                  <span className="crisis-foyer-locked">Disponible au cycle 2</span>
                ) : (
                  f.actions.map((a) => (
                    <button
                      key={a.id}
                      className="crisis-regul-btn"
                      disabled={!canPayCost(a.cost)}
                      onClick={() => runCrisisAction(a.id)}
                    >
                      <strong>{a.label}</strong>
                      <span className="crisis-regul-cost">{costLabel(a.cost)}</span>
                    </button>
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel tactical-panel">
      <div className="panel-heading">
        <div>
          <h2>Foyers de tension &amp; Actions de régulation</h2>
        </div>
      </div>
      <p className="body-copy">Dépenser vos ressources pour atténuer les facteurs de rupture ralentit le déclin, mais une chute tardive et complexe rapporte davantage de ruines.</p>

      <div className="tactical-board">
        <div className="tactical-grid">
          {/* Subsistance */}
          <article className="tactical-card">
            <div className="tactical-info">
              <header>
                <h4>🌾 Subsistance</h4>
                <strong className="tactical-value">{pct(pressure.scarcity)}</strong>
              </header>
              <p>La population croissante pèse sur les réserves de blé.</p>
              <div className="tactical-track">
                <span className="tactical-fill" style={{ width: `${Math.min(1, pressure.scarcity / 0.7) * 100}%` }}></span>
              </div>
            </div>
            <div className="tactical-actions">
              <button
                disabled={!canPayCost(costs.rationing)}
                onClick={() => runCrisisAction("rationing")}
              >
                <strong>Rationner</strong>
                <span className="action-cost">{costLabel(costs.rationing)}</span>
              </button>
            </div>
          </article>

          {/* Inégalités */}
          <article className="tactical-card">
            <div className="tactical-info">
              <header>
                <h4>⚖️ Inégalités</h4>
                <strong className="tactical-value">{pct(pressure.inequality)}</strong>
              </header>
              <p>L'accumulation de trésor crée des barrières entre classes.</p>
              <div className="tactical-track">
                <span className="tactical-fill" style={{ width: `${Math.min(1, pressure.inequality / 0.55) * 100}%` }}></span>
              </div>
            </div>
            <div className="tactical-actions">
              <button
                disabled={!canPayCost(costs.festivals)}
                onClick={() => runCrisisAction("festivals")}
              >
                <strong>Jeux civiques</strong>
                <span className="action-cost">{costLabel(costs.festivals)}</span>
              </button>
            </div>
          </article>

          {/* Complexité */}
          <article className="tactical-card">
            <div className="tactical-info">
              <header>
                <h4>🏛️ Complexité</h4>
                <strong className="tactical-value">{pct(pressure.complexity)}</strong>
              </header>
              <p>Le nombre de structures demande une administration lourde.</p>
              <div className="tactical-track">
                <span className="tactical-fill" style={{ width: `${Math.min(1, pressure.complexity / 0.75) * 100}%` }}></span>
              </div>
            </div>
            <div className="tactical-actions">
              <button
                disabled={!canPayCost(costs.census)}
                onClick={() => runCrisisAction("census")}
                style={{ marginBottom: '0.4rem' }}
              >
                <strong>Recenser</strong>
                <span className="action-cost">{costLabel(costs.census)}</span>
              </button>
              <button
                disabled={!canPayCost(costs.reforms)}
                onClick={() => runCrisisAction("reforms")}
              >
                <strong>Réformes</strong>
                <span className="action-cost">{costLabel(costs.reforms)}</span>
              </button>
            </div>
          </article>

          {/* Dissidence */}
          <article className="tactical-card">
            <div className="tactical-info">
              <header>
                <h4>📜 Dissidence</h4>
                <strong className="tactical-value">{pct(pressure.dissent)}</strong>
              </header>
              <p>Les récits et la mémoire des cycles divisent l'opinion.</p>
              <div className="tactical-track">
                <span className="tactical-fill" style={{ width: `${Math.min(1, pressure.dissent / 0.55) * 100}%` }}></span>
              </div>
            </div>
            <div className="tactical-actions">
              {showAncestorBtn && (
                <button
                  disabled={!canPayCost(costs.ancestorCrisis)}
                  onClick={() => runCrisisAction("ancestorCrisis")}
                  style={{ marginBottom: '0.4rem' }}
                >
                  <strong>Culte des Ancêtres</strong>
                  <span className="action-cost">{costLabel(costs.ancestorCrisis)}</span>
                </button>
              )}
              {showArchiveBtn && (
                <button
                  disabled={!canPayCost(costs.archiveCrisis)}
                  onClick={() => runCrisisAction("archiveCrisis")}
                >
                  <strong>Catastrophes</strong>
                  <span className="action-cost">{costLabel(costs.archiveCrisis)}</span>
                </button>
              )}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
