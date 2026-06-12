import { useState, useEffect } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  ruinGain,
  ruinMultiplier,
  heritageQuality,
  crisisOpen,
  pressureBreakdown,
  timeWearRate,
  crisisCosts,
  terminalCrisisCost,
  terminalCrisisReady,
  TERMINAL_PREP_TIERS,
  has,
  autoCollapseDelay
} from '../../game/core/mechanics.js';
import {
  runCrisisAction,
  collapse,
  runTerminalCrisisAction,
  activateSurchauffe
} from '../../game/core/actions.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { fmt, pct, costLabel, canPayCost, clamp01 } from '../../game/core/utils.js';

function tensionAdvice(mainCause) {
  if (crisisOpen()) return "La crise est ouverte : choisissez une issue pour clore ce cycle.";
  if (mainCause === "Subsistance") return "Augmentez les réserves de nourriture ou rationnez pour calmer la faim.";
  if (mainCause === "Inegalites") return "Le commerce enrichit la cité : les jeux civiques peuvent absorber le mécontentement.";
  if (mainCause === "Complexite") return "Ajoutez des infrastructures ou lancez des réformes pour encadrer la croissance.";
  if (mainCause === "Dissidence") return "La mémoire des ancêtres ou des archives de catastrophes aideront à calmer la fronde.";
  return "La cité est stable et prospère : vous pouvez pousser le développement.";
}

export default function PrestigeView() {
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const ruins = useGameState(s => s.ruins);
  const collapsePreparation = useGameState(s => s.collapsePreparation);
  const crisisLimitAnnounced = useGameState(s => s.crisisLimitAnnounced);
  const crisisOpenedAt = useGameState(s => s.crisisOpenedAt);
  useGameState(s => s.activeMythId);
  const icareHeritage = useGameState(s => s.icareHeritage);
  const cycles = useGameState(s => s.cycles);

  const [remainingTime, setRemainingTime] = useState("");

  const ruinGainVal = ruinGain();
  const ruinMult = ruinMultiplier();
  const isCrisisActive = crisisOpen();

  useEffect(() => {
    const checkCountdown = () => {
      const hasIntendant = has("intendant_de_crise");
      if (crisisLimitAnnounced && hasIntendant && crisisOpenedAt) {
        const delay = autoCollapseDelay();
        const remaining = Math.max(0, delay - (Date.now() - crisisOpenedAt));
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setRemainingTime(`Effondrement automatique dans ${mins}:${secs.toString().padStart(2, "0")}`);
      } else {
        setRemainingTime("");
      }
    };
    checkCountdown();
    const timer = setInterval(checkCountdown, 1000);
    return () => clearInterval(timer);
  }, [crisisLimitAnnounced, crisisOpenedAt]);

  const pressure = pressureBreakdown();
  const costs = crisisCosts();

  const causes = [
    ["Subsistance", pressure.scarcity],
    ["Inegalites", pressure.inequality],
    ["Complexite", pressure.complexity],
    ["Dissidence", pressure.dissent],
    ["Structures", pressure.structural]
  ];
  const [mainCause] = causes.reduce((best, current) => current[1] > best[1] ? current : best, ["Aucune", 0]);
  const drift = pressure.total - instability;

  const driftText = Math.abs(drift) < 0.02
    ? "Tendance stable"
    : drift > 0
      ? `Monte vers ${pct(pressure.total)}`
      : `Redescend vers ${pct(pressure.total)}`;

  const wearDriftText = timeWear >= 1
    ? "Crise ouverte"
    : `+${fmt(timeWearRate() * 100)} pts/s`;

  const mythBlocksCollapse = isMythEffectActive("mythe_d_icare") || isMythEffectActive("mythe_d_atlas");
  const canCollapse = ruinGainVal.gt(0) && !mythBlocksCollapse;

  const showSurchauffe = icareHeritage;

  const terminalPreparations = useGameState(s => s.terminalPreparations);
  const tp = terminalPreparations || {};

  // 3 actions × 3 paliers : coût flat + malus % jusqu'à l'effondrement.
  const tierNames = ["Mesuré", "Drastique", "Total"];
  const prepDefs = [
    {
      type: "exodus",
      icon: "🏳️",
      title: "Organiser l'exode",
      desc: "Des familles quittent la cité : moins de bras aux champs, mais la pression retombe.",
      tierChips: (t) => [
        { label: `Nourriture −${Math.round(t.malus * 100)}%`, kind: "cost" }
      ]
    },
    {
      type: "prepareArchives",
      icon: "📜",
      title: "Préparer les archives",
      desc: "Scribes et ateliers se consacrent à la mémoire : savoir et trésor ralentissent, l'infrastructure profite des plans consignés.",
      tierChips: (t) => [
        { label: `Savoir & Trésor −${Math.round(t.malus * 100)}%`, kind: "cost" },
        { label: `Infrastructure +${Math.round((t.infraBonus || 0) * 100)}%`, kind: "gain" }
      ]
    },
    {
      type: "holdOrder",
      icon: "🛡️",
      title: "Maintenir l'ordre",
      desc: "La garde verrouille la cité : toute l'économie ralentit, mais la rupture monte plus lentement.",
      tierChips: (t) => [
        { label: `Toute production −${Math.round(t.malus * 100)}%`, kind: "cost" },
        { label: `Montée de Rupture −${Math.round((t.ruptureSlow || 0) * 100)}%`, kind: "gain" }
      ]
    }
  ];

  const activeMaluses = [];
  if ((tp.foodMalus || 0) > 0) activeMaluses.push({ label: `Nourriture −${Math.round(tp.foodMalus * 100)}%`, kind: "cost" });
  if ((tp.goldMalus || 0) > 0) activeMaluses.push({ label: `Trésor −${Math.round(tp.goldMalus * 100)}%`, kind: "cost" });
  if ((tp.knowledgeMalus || 0) > 0) activeMaluses.push({ label: `Savoir −${Math.round(tp.knowledgeMalus * 100)}%`, kind: "cost" });
  if ((tp.infraBonus || 0) > 0) activeMaluses.push({ label: `Infrastructure +${Math.round(tp.infraBonus * 100)}%`, kind: "gain" });
  if ((tp.ruptureSlow || 0) > 0) activeMaluses.push({ label: `Montée de Rupture −${Math.round(tp.ruptureSlow * 100)}%`, kind: "gain" });

  const showArchiveBtn = cycles >= 2;
  const showAncestorBtn = cycles >= 3;

  return (
    <section className="view active" id="prestige">
      {/* 1. BAROMÈTRES GLOBAUX */}
      <div className="panel barometers-panel">
        <div className="panel-heading">
          <div>
            <span className="label">Mesures de stabilité</span>
            <h2>Baromètres de la Cité</h2>
          </div>
        </div>
        
        <div className="barometers-grid">
          <div className="barometer-card instability">
            <div className="barometer-header">
              <span>Rupture (Tension sociale)</span>
              <strong>{pct(instability)}</strong>
            </div>
            <div className="barometer-track">
              <span className="barometer-fill" style={{ width: `${clamp01(instability) * 100}%` }}></span>
            </div>
            <div className="barometer-footer">
              <small>{driftText}</small>
              <small className="target-pressure">Cible : {pct(pressure.total)}</small>
            </div>
          </div>

          <div className="barometer-card time-wear">
            <div className="barometer-header">
              <span>Usure du Temps</span>
              <strong>{pct(timeWear)}</strong>
            </div>
            <div className="barometer-track">
              <span className="barometer-fill" style={{ width: `${clamp01(timeWear) * 100}%` }}></span>
            </div>
            <div className="barometer-footer">
              <small>{wearDriftText}</small>
            </div>
          </div>
        </div>

        <div className="diagnostic-advice-bar">
          <span>💡 Diagnostic :</span>
          <p>{tensionAdvice(mainCause)}</p>
        </div>
      </div>

      {/* 2. TABLEAU TACTIQUE (FUSION TENSIONS & ACTIONS) */}
      {!isCrisisActive && (
      <div className="panel tactical-panel">
        <div className="panel-heading">
          <div>
            <span className="label">Gestion politique</span>
            <h2>Foyers de tension & Actions de régulation</h2>
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
      )}

      {/* 3. CYCLE & DÉCLIN (BILAN & PRESTIGE / MODE CRISE) */}
      <div className={`panel cycle-outcome-panel ${isCrisisActive ? 'crisis-focus-active' : ''}`} id="crisisOutcomePanel">
        <div className="panel-heading">
          <div>
            <span className="label">Clôture du cycle</span>
            <h2>{isCrisisActive ? "Chute & Transmission" : "Bilan de la Civilisation"}</h2>
          </div>
        </div>

        {isCrisisActive ? (
          <div className="crisis-focus-layout">
            {crisisLimitAnnounced && (
              <div className="crisis-alert" id="crisisAlert">
                <div className="crisis-alert-icon">⚠️</div>
                <div className="crisis-alert-body">
                  <strong>La cité s'est effondrée sous {timeWear >= 1 ? "l'usure" : "la rupture"}.</strong>
                  <p>Choisissez comment organiser sa chute pour maximiser l'héritage, ou terminez le cycle immédiatement.</p>
                </div>
              </div>
            )}

            <div className="crisis-choices-grid">
              <div className="crisis-preparation-actions">
                <h4>Préparations terminales (Tenir la crise)</h4>
                <p className="sub-text">
                  Chaque préparation ramène la rupture au palier choisi, contre un coût immédiat
                  et un malus de production qui durera jusqu'à l'effondrement.
                </p>

                {activeMaluses.length > 0 && (
                  <div className="prep-active-maluses">
                    <span>⚖️ En vigueur jusqu'à l'effondrement :</span>
                    <span className="effect-chips">
                      {activeMaluses.map((chip) => (
                        <span key={chip.label} className={`effect-chip is-${chip.kind}`}>{chip.label}</span>
                      ))}
                    </span>
                  </div>
                )}

                <div className="crisis-prep-buttons">
                  {prepDefs.map((def) => {
                    const used = Boolean(tp.used?.[def.type]);
                    return (
                      <article className={`prep-choice-card${used ? " prep-used" : ""}`} key={def.type}>
                        <h5>{def.icon} {def.title}</h5>
                        <p>{def.desc}</p>
                        {used ? (
                          <p className="prep-used-note">Déjà engagée pour cette crise.</p>
                        ) : (
                          <div className="prep-tier-buttons">
                            {TERMINAL_PREP_TIERS[def.type].map((t, i) => (
                              <button
                                key={i}
                                disabled={!terminalCrisisReady(def.type, i)}
                                onClick={() => runTerminalCrisisAction(def.type, i)}
                              >
                                <span className="prep-tier-head">
                                  <strong>{tierNames[i]}</strong>
                                  <span className="prep-tier-target">Rupture ramenée à {Math.round(t.target * 100)}%</span>
                                </span>
                                <span className="prep-target-track" aria-hidden="true">
                                  <span className="prep-target-fill" style={{ width: `${Math.round(t.target * 100)}%` }}></span>
                                </span>
                                <span className="effect-chips">
                                  {def.tierChips(t).map((chip) => (
                                    <span key={chip.label} className={`effect-chip is-${chip.kind}`}>{chip.label}</span>
                                  ))}
                                </span>
                                <span className="action-cost">{costLabel(terminalCrisisCost(def.type, i))}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="collapse-action-card">
                <h4>Bilan de la Chute</h4>
                <div className="collapse-preview-box">
                  <div className="preview-stat">
                    <span>Ruines récupérées</span>
                    <strong>+{fmt(ruinGainVal)} 🏛️</strong>
                  </div>
                  <div className="preview-stat">
                    <span>Qualité de transmission</span>
                    <strong>{heritageQuality()}</strong>
                  </div>
                </div>

                <div className="collapse-main-buttons">
                  <button
                    className="collapse-btn-primary"
                    id="collapseBtn"
                    disabled={!canCollapse}
                    onClick={() => collapse("manual")}
                  >
                    Effondrer la Cité
                  </button>

                  {showSurchauffe && (
                    <button
                      id="surchauffeBtn"
                      className="surchauffe-btn-action"
                      onClick={activateSurchauffe}
                    >
                      Surchauffe
                    </button>
                  )}
                </div>

                {remainingTime && (
                  <div className="auto-collapse-timer" id="autoCollapseCountdown">
                    ⏳ {remainingTime}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="standard-prestige-layout">
            <p className="body-copy">Vos choix préparent la transmission. Attendre que la rupture approche rend le déclin plus instructif.</p>

            <div className="prestige-stats-grid">
              <div className="prestige-stat-card">
                <span>Ruines à gagner</span>
                <strong>{fmt(ruinGainVal)} 🏛️</strong>
              </div>
              <div className="prestige-stat-card">
                <span>Héritage préparé</span>
                <strong>+{fmt(Math.min(2.4, collapsePreparation || 0) * 100)}%</strong>
              </div>
              <div className="prestige-stat-card">
                <span>Qualité d'héritage</span>
                <strong>{heritageQuality()}</strong>
              </div>
              <div className="prestige-stat-card">
                <span>Ruines en réserve</span>
                <strong>{fmt(ruins)}</strong>
              </div>
              <div className="prestige-stat-card">
                <span>Bonus de production</span>
                <strong>x{fmt(ruinMult)}</strong>
              </div>
            </div>

            <div className="standard-collapse-action">
              <button
                className="manual-collapse-btn"
                id="collapseBtn"
                disabled={!canCollapse}
                onClick={() => collapse("manual")}
              >
                Provoquer l'Effondrement Volontaire
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
