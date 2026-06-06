import { useState, useEffect } from 'react';
import { useGameState } from '../hooks/useGameState.js';
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
  has,
  autoCollapseDelay
} from '../game/core/mechanics.js';
import {
  runCrisisAction,
  collapse,
  runTerminalCrisisAction,
  activateSurchauffe
} from '../game/core/actions.js';
import { fmt, pct, costLabel, canPayCost } from '../game/core/utils.js';

function tensionAdvice(mainCause) {
  if (crisisOpen()) return "La crise est ouverte: choisis une issue dans Crises.";
  if (mainCause === "Subsistance") return "Augmente les reserves ou rationne avant que la faim politise la cite.";
  if (mainCause === "Inegalites") return "Le commerce enrichit la cite: festivals ou institutions peuvent absorber le choc.";
  if (mainCause === "Complexite") return "Ajoute infrastructure, recensement ou reformes pour suivre la croissance.";
  if (mainCause === "Dissidence") return "Les cycles parlent encore: rites, archives et legitimite aident.";
  return "La cite est encore lisible: tu peux pousser la croissance.";
}

export default function PrestigeView() {
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const ruins = useGameState(s => s.ruins);
  const collapsePreparation = useGameState(s => s.collapsePreparation);
  const crisisLimitAnnounced = useGameState(s => s.crisisLimitAnnounced);
  const crisisOpenedAt = useGameState(s => s.crisisOpenedAt);
  const activeMythId = useGameState(s => s.activeMythId);
  const icareHeritage = useGameState(s => s.icareHeritage);
  const cycles = useGameState(s => s.cycles);

  const [remainingTime, setRemainingTime] = useState("");

  const ruinGainVal = ruinGain();
  const ruinMult = ruinMultiplier();
  const isCrisisActive = crisisOpen();

  // Tick countdown if crisis countdown is active
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
  const [mainCause, mainValue] = causes.reduce((best, current) => current[1] > best[1] ? current : best, ["Aucune", 0]);
  const drift = pressure.total - instability;

  const driftText = Math.abs(drift) < 0.02
    ? "Tendance stable"
    : drift > 0
      ? `Monte vers ${pct(pressure.total)}`
      : `Redescend vers ${pct(pressure.total)}`;

  const wearDriftText = timeWear >= 1
    ? "L'usure a ouvert une crise"
    : `+${fmt(timeWearRate() * 100)} pts/s, meme hors ligne`;

  const mythBlocksCollapse = activeMythId === "mythe_d_icare" || activeMythId === "mythe_d_atlas";
  const canCollapse = ruinGainVal > 0 && !mythBlocksCollapse;

  const showSurchauffe = icareHeritage;
  
  const prepCosts = terminalCrisisCost("prepareArchives");
  const exoCosts = terminalCrisisCost("exodus");
  const holdCosts = terminalCrisisCost("holdOrder");

  const showArchiveBtn = cycles >= 2;
  const showAncestorBtn = cycles >= 3;

  return (
    <section className="view active" id="prestige">
      <div className="panel prestige-panel" id="crisisOutcomePanel">
        {isCrisisActive && crisisLimitAnnounced && (
          <div className="crisis-alert" id="crisisAlert">
            <div className="crisis-alert-icon">!</div>
            <div className="crisis-alert-body">
              <strong id="crisisAlertTitle">
                La cite s'est brisee sous {timeWear >= 1 ? "l'usure du temps" : "la rupture"}.
              </strong>
              <p id="crisisAlertDesc">
                Lance l'effondrement pour recuperer {fmt(ruinGainVal)} ruines, ou prepare d'abord la chute pour en tirer davantage.
              </p>
            </div>
          </div>
        )}

        <div className="panel-heading">
          <div>
            <span className="label">A 100% d'une jauge</span>
            <h2>Issues de crise</h2>
          </div>
        </div>
        
        <p className="body-copy">Quand la rupture ou l'usure arrive a terme: encaisser les ruines maintenant, ou tenir encore pour preparer une chute plus utile.</p>
        
        {remainingTime && <small id="autoCollapseCountdown" className="auto-collapse-countdown">{remainingTime}</small>}
        
        <div className="terminal-crisis-panel" style={{ textAlign: 'left' }}>
          <div>
            <span className="label">Avant d'effondrer</span>
            <h3>Preparer la chute</h3>
            <p>Ces choix prolongent une civilisation fatiguee pour rendre ses ruines plus utiles.</p>
            <small id="terminalCrisisState">
              {isCrisisActive
                ? `Crise ouverte: ${fmt(ruinGainVal)} ruines maintenant, ${heritageQuality().toLowerCase()}, ${fmt((collapsePreparation || 0) * 100)}% d'heritage prepare.`
                : "Disponible quand Rupture ou Usure atteint 100%. Ces choix deviennent alors une alternative a l'effondrement immediat."}
            </small>
          </div>
          
          <div className="terminal-actions">
            <article className="outcome-card">
              <span>Tenir la crise</span>
              <h3>Preparer les archives</h3>
              <p>Repousse la rupture en ralentissant la production, mais augmente la valeur historique de la chute future.</p>
              <button
                id="prepareArchivesBtn"
                disabled={!terminalCrisisReady("prepareArchives")}
                onClick={() => runTerminalCrisisAction("prepareArchives")}
              >
                {`Preparer (${costLabel(prepCosts)})`}
              </button>
            </article>
            
            <article className="outcome-card">
              <span>Tenir la crise</span>
              <h3>Organiser l'exode</h3>
              <p>Sauve des familles et des recits avant la fin. La croissance souffre, l'heritage devient plus dense.</p>
              <button
                id="exodusBtn"
                disabled={!terminalCrisisReady("exodus")}
                onClick={() => runTerminalCrisisAction("exodus")}
              >
                {`Exode (${costLabel(exoCosts)})`}
              </button>
            </article>
            
            <article className="outcome-card">
              <span>Tenir la crise</span>
              <h3>Maintenir l'ordre</h3>
              <p>Depense tresor et savoir pour gagner du temps sans bonifier fortement les ruines.</p>
              <button
                id="holdOrderBtn"
                disabled={!terminalCrisisReady("holdOrder")}
                onClick={() => runTerminalCrisisAction("holdOrder")}
              >
                {`Tenir (${costLabel(holdCosts)})`}
              </button>
            </article>
          </div>
        </div>

        <div className="crisis-outcomes">
          <article className="outcome-card collapse-card">
            <span>Fin du cycle</span>
            <h3>Effondrement</h3>
            <p>Accepte la chute. La cite tombe, laisse ses ruines, et le prochain cycle repart sur ce qui a ete transmis.</p>
            
            {isCrisisActive && (
              <div className="collapse-preview" id="collapsePreview">
                <span><b>{fmt(ruinGainVal)}</b> ruines recuperees</span>
                <span>Qualite: {heritageQuality().toLowerCase()}</span>
              </div>
            )}
            
            <button
              id="collapseBtn"
              disabled={!canCollapse}
              onClick={() => collapse("manual")}
            >
              Effondrer
            </button>
            
            {showSurchauffe && (
              <button
                id="surchauffeBtn"
                className="surchauffe-btn"
                onClick={activateSurchauffe}
              >
                Surchauffe
              </button>
            )}
          </article>
        </div>

        <div className="prestige-stats">
          <div><span>Ruines gagnees</span><strong id="ruinGain">{fmt(ruinGainVal)}</strong></div>
          <div><span>Heritage prepare</span><strong id="collapsePreparation">+{fmt(Math.min(2.4, collapsePreparation || 0) * 100)}%</strong></div>
          <div><span>Qualite</span><strong id="heritageQuality">{heritageQuality()}</strong></div>
          <div><span>Ruines</span><strong id="ruins">{fmt(ruins)}</strong></div>
          <div><span>Bonus</span><strong id="ruinBonus">x{fmt(ruinMult)}</strong></div>
        </div>
      </div>

      <div className="panel crisis-status" style={{ textAlign: 'left' }}>
        <div className="panel-heading">
          <div>
            <span className="label">Progression inter-cycles</span>
            <h2>Transmissions</h2>
          </div>
        </div>
        <div className="crisis-summary">
          <div>
            <span>Rupture</span>
            <strong id="crisisRupture">{pct(instability)}</strong>
            <small id="crisisReadyText">
              {instability >= 1 ? "Rupture structurelle ouverte" : `Encore ${fmt(Math.max(0, (1 - instability) * 100))} pts avant la rupture`}
            </small>
          </div>
          <div>
            <span>Usure</span>
            <strong id="crisisWear">{pct(timeWear)}</strong>
            <small id="crisisWearText">
              {timeWear >= 1 ? "Usure historique ouverte" : `Encore ${fmt(Math.max(0, (1 - timeWear) * 100))} pts avant l'usure`}
            </small>
          </div>
        </div>
      </div>

      <div className="panel tension-status" style={{ textAlign: 'left' }}>
        <div className="panel-heading">
          <div>
            <span className="label">Diagnostic politique</span>
            <h2>Pression actuelle</h2>
          </div>
        </div>
        <div className="tension-summary">
          <div>
            <span>Rupture</span>
            <strong id="tensionCurrent">{pct(instability)}</strong>
            <small id="tensionDrift">{driftText}</small>
          </div>
          <div>
            <span>Usure du temps</span>
            <strong id="tensionWear">{pct(timeWear)}</strong>
            <small id="tensionWearDrift">{wearDriftText}</small>
          </div>
          <div>
            <span>Pression cible</span>
            <strong id="tensionTarget">{pct(pressure.total)}</strong>
            <small id="tensionMainCause">
              {mainValue > 0.01 ? `Cause principale: ${mainCause}` : "Cause principale: aucune"}
            </small>
          </div>
          <div>
            <span>Stabilisation</span>
            <strong id="tensionMitigation">{pct(pressure.mitigation)}</strong>
            <small id="tensionAdvice">{tensionAdvice(mainCause)}</small>
          </div>
        </div>
      </div>

      <div className="panel" style={{ textAlign: 'left' }}>
        <div className="panel-heading">
          <div>
            <span className="label">Causes de rupture</span>
            <h2>Ce qui pousse la cite</h2>
          </div>
        </div>
        <div className="tension-grid">
          <article className="tension-card">
            <span>Subsistance</span>
            <strong id="scarcityValue">{pct(pressure.scarcity)}</strong>
            <p>Quand la population depasse les reserves, la faim rend la chute pensable.</p>
            <div className="state-bar">
              <span id="scarcityBar" style={{ width: `${Math.min(1, pressure.scarcity / 0.7) * 100}%` }}></span>
            </div>
          </article>
          
          <article className="tension-card">
            <span>Inegalites</span>
            <strong id="inequalityValue">{pct(pressure.inequality)}</strong>
            <p>Le tresor accelere la cite, mais concentre aussi le pouvoir.</p>
            <div className="state-bar">
              <span id="inequalityBar" style={{ width: `${Math.min(1, pressure.inequality / 0.55) * 100}%` }}></span>
            </div>
          </article>
          
          <article className="tension-card">
            <span>Complexite</span>
            <strong id="complexityValue">{pct(pressure.complexity)}</strong>
            <p>Plus il y a de structures, plus la cite exige des institutions capables de suivre.</p>
            <div className="state-bar">
              <span id="complexityBar" style={{ width: `${Math.min(1, pressure.complexity / 0.75) * 100}%` }}></span>
            </div>
          </article>
          
          <article className="tension-card">
            <span>Dissidence</span>
            <strong id="dissentValue">{pct(pressure.dissent)}</strong>
            <p>Chaque cycle laisse des recits, des rancoeurs et des visions concurrentes.</p>
            <div className="state-bar">
              <span id="dissentBar" style={{ width: `${Math.min(1, pressure.dissent / 0.55) * 100}%` }}></span>
            </div>
          </article>
        </div>
      </div>

      <div className="panel" style={{ textAlign: 'left' }}>
        <div className="panel-heading">
          <div>
            <span className="label">Actions preventives</span>
            <h2>Gerer ou laisser murir</h2>
          </div>
        </div>
        <div className="crisis-list">
          <button
            id="rationBtn"
            disabled={!canPayCost(costs.rationing)}
            onClick={() => runCrisisAction("rationing")}
          >
            <strong>Rationner</strong>
            <small>Reduit la pression de subsistance</small>
            <span id="rationCost">{costLabel(costs.rationing)}</span>
          </button>
          
          <button
            id="festivalBtn"
            disabled={!canPayCost(costs.festivals)}
            onClick={() => runCrisisAction("festivals")}
          >
            <strong>Jeux civiques</strong>
            <small>Agit surtout sur dissidence</small>
            <span id="festivalCost">{costLabel(costs.festivals)}</span>
          </button>
          
          <button
            id="censusBtn"
            disabled={!canPayCost(costs.census)}
            onClick={() => runCrisisAction("census")}
          >
            <strong>Recensement</strong>
            <small>Agit surtout sur complexite</small>
            <span id="censusCost">{costLabel(costs.census)}</span>
          </button>
          
          <button
            id="reformBtn"
            disabled={!canPayCost(costs.reforms)}
            onClick={() => runCrisisAction("reforms")}
          >
            <strong>Reformes</strong>
            <small>Agit sur complexite et institutions</small>
            <span id="reformCost">{costLabel(costs.reforms)}</span>
          </button>
          
          {showArchiveBtn && (
            <button
              id="archiveCrisisBtn"
              disabled={!canPayCost(costs.archiveCrisis)}
              onClick={() => runCrisisAction("archiveCrisis")}
            >
              <strong>Archives des catastrophes</strong>
              <small>Agit sur memoire des chutes</small>
              <span id="archiveCrisisCost">{costLabel(costs.archiveCrisis)}</span>
            </button>
          )}
          
          {showAncestorBtn && (
            <button
              id="ancestorCrisisBtn"
              disabled={!canPayCost(costs.ancestorCrisis)}
              onClick={() => runCrisisAction("ancestorCrisis")}
            >
              <strong>Culte des ancetres</strong>
              <small>Agit sur dissidence et legitimite</small>
              <span id="ancestorCrisisCost">{costLabel(costs.ancestorCrisis)}</span>
            </button>
          )}
        </div>
        <p className="body-copy tension-note">Reduire l'instabilite prolonge la cite, mais attendre la rupture rend l'effondrement plus riche.</p>
      </div>
    </section>
  );
}
