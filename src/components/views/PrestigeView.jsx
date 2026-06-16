import { useState, useEffect } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  ruinGain,
  ruinMultiplier,
  heritageQuality,
  crisisOpen,
  pressureBreakdown,
  timeWearRate,
  terminalCrisisCost,
  terminalCrisisReady,
  TERMINAL_PREP_TIERS,
  has,
  autoCollapseDelay
} from '../../game/core/mechanics.js';
import {
  collapse,
  runTerminalCrisisAction,
  activateSurchauffe
} from '../../game/core/actions.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { fmt, pct, costLabel, clamp01 } from '../../game/core/utils.js';
import CrisisActionBar from '../ui/CrisisActionBar.jsx';

export default function PrestigeView() {
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const ruins = useGameState(s => s.ruins);
  const collapsePreparation = useGameState(s => s.collapsePreparation);
  const crisisLimitAnnounced = useGameState(s => s.crisisLimitAnnounced);
  const crisisOpenedAt = useGameState(s => s.crisisOpenedAt);
  useGameState(s => s.activeMythId);
  const icareHeritage = useGameState(s => s.icareHeritage);

  const [remainingTime, setRemainingTime] = useState("");

  const ruinGainVal = ruinGain();
  // Rework 1 — gain PROJETÉ « si effondrement maintenant » (calculé même hors
  // crise) : aide à la décision temporiser vs s'effondrer. Hors crise, ruinGainVal
  // vaut 0 ; ce projeté montre ce que la chute rapporterait à cet instant.
  const projectedRuin = ruinGain(true);
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

  return (
    <section className="view active" id="prestige">
      {/* 1. BAROMÈTRES GLOBAUX */}
      <div className="panel barometers-panel">
        <div className="panel-heading">
          <div>
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
              {/* Rework 2 — fantôme de la cible : où la jauge se dirige (pressure.total). */}
              <span
                className="barometer-target-ghost"
                style={{ left: `${clamp01(pressure.total) * 100}%` }}
                title={`Cible : ${pct(pressure.total)} — la jauge dérive vers ce niveau. Réguler la fait baisser ; au-dessus de 100 %, la crise s'ouvre.`}
              ></span>
            </div>
            <div className="barometer-footer">
              <small>{driftText}</small>
              <small className="target-pressure">Cible : {pct(pressure.total)}</small>
            </div>
            {/* Rework 1 — gain projeté si effondrement maintenant (aide à la décision). */}
            <div className="barometer-collapse-hint" title="Ruines obtenues si la cité s'effondrait à cet instant. Tenir plus longtemps et chuter plus profond rapporte davantage.">
              💀 Si effondrement maintenant : <strong>+{fmt(projectedRuin)} 🏛️</strong>
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
      </div>

      {/* 2. TABLEAU TACTIQUE (FUSION TENSIONS & ACTIONS) */}
      {!isCrisisActive && <CrisisActionBar variant="full" />}

      {/* 3. CYCLE & DÉCLIN (BILAN & PRESTIGE / MODE CRISE) */}
      <div className={`panel cycle-outcome-panel ${isCrisisActive ? 'crisis-focus-active' : ''}`} id="crisisOutcomePanel">
        <div className="panel-heading">
          <div>
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
                <span>Ruines si effondrement</span>
                <strong>{fmt(projectedRuin)} 🏛️</strong>
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
