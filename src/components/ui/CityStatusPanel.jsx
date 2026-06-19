import { useCityViewState } from '../../hooks/useCityViewState.js';
import { globalMultiplier, currentEraIndex, nextEraProgress } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { getEraTheme } from '../../game/data/eraThemes.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { fmt, pct, roman, clamp01 } from '../../game/core/utils.js';
import RollingNumber from './RollingNumber.jsx';

/**
 * Encart d'état de la civilisation, logé dans la barre latérale au-dessus des
 * actions rapides. Regroupe ce qui était dispersé entre la topbar (Âge, Usure,
 * Légitimité, bonus sédiment) et l'en-tête de la Cité (stats dynastiques).
 * Toujours visible, quel que soit l'onglet actif.
 */

const SEDIMENT_PALIERS = [
  { secs: 3600,   bonus: 2   },
  { secs: 28800,  bonus: 15  },
  { secs: 86400,  bonus: 45  },
  { secs: 259200, bonus: 135 },
  { secs: 604800, bonus: 400 },
];

function fmtSecs(s) {
  if (s >= 86400) return `${Math.floor(s / 86400)}j ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600)  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;
  return `${Math.floor(s / 60)}min`;
}

// Durée du cycle en j/h/m/s : on n'affiche que les unités utiles, en zéro-paddant
// les unités inférieures dès qu'une unité supérieure est présente (style horloge).
function fmtCycleTime(totalSecs) {
  const s = totalSecs % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600) % 24;
  const j = Math.floor(totalSecs / 86400);
  const pad = (n) => String(n).padStart(2, '0');
  if (j > 0) return `${j}j ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

export default function CityStatusPanel() {
  const {
    cycles, dynastyCount, bestEraIndex, cycleStartedAt,
    timeWear, atlasLegitimite, atlasHeritage, tickNow
  } = useCityViewState();

  const eraIdx = currentEraIndex();
  const currentEra = eras[eraIdx];
  const eraProgress = nextEraProgress(eraIdx);
  const eraTheme = getEraTheme(eraIdx);
  const globalMult = globalMultiplier();

  const cycleSeconds = Math.floor((tickNow - (cycleStartedAt || tickNow)) / 1000);
  const cycleTimeLabel = fmtCycleTime(cycleSeconds);

  const cycleElapsed = (tickNow - cycleStartedAt) / 1000;
  let sedimentIdx = -1;
  for (let i = SEDIMENT_PALIERS.length - 1; i >= 0; i--) {
    if (cycleElapsed >= SEDIMENT_PALIERS[i].secs) { sedimentIdx = i; break; }
  }
  const nextPalier = sedimentIdx < SEDIMENT_PALIERS.length - 1 ? SEDIMENT_PALIERS[sedimentIdx + 1] : null;
  const nextPalierInSecs = nextPalier ? Math.ceil(nextPalier.secs - cycleElapsed) : 0;

  const showLegitimite = atlasHeritage || isMythEffectActive("mythe_d_atlas");

  return (
    <div className="city-status-panel" aria-label="État de la civilisation">
      <div
        className="csp-block"
        title={`Progression vers l'âge suivant — ${eraTheme.epochLabel}, ère ${eraTheme.epochNumeral}/V`}
      >
        <div className="csp-block-head">
          <span className="csp-label">Âge</span>
          <strong className="csp-value csp-value--era">{currentEra.name}</strong>
        </div>
        <span className="csp-bar">
          <span className="csp-bar-fill csp-bar-fill--era" style={{ width: `${eraProgress * 100}%` }}></span>
        </span>
      </div>

      <div
        className="csp-block"
        title={nextPalier
          ? `Prochain palier sédiment : +${nextPalier.bonus}% dans ${fmtSecs(nextPalierInSecs)}`
          : 'Bonus sédiment maximum atteint'}
      >
        <div className="csp-block-head">
          <span className="csp-label">Usure</span>
          <strong className={`csp-value ${timeWear >= 0.8 ? 'danger-pulse' : ''}`}>{pct(timeWear)}</strong>
          {sedimentIdx >= 0 && (
            <span className="csp-laps" aria-hidden="true">
              {SEDIMENT_PALIERS.map((_, i) => (
                <span key={i} className={i <= sedimentIdx ? 'csp-lap-done' : 'csp-lap-empty'}>■</span>
              ))}
            </span>
          )}
        </div>
        <span className="csp-bar">
          <span className="csp-bar-fill csp-bar-fill--wear" style={{ width: `${clamp01(timeWear) * 100}%` }}></span>
        </span>
      </div>

      {showLegitimite && (
        <div className="csp-block" title="Légitimité d'Atlas">
          <div className="csp-block-head">
            <span className="csp-label">Légitimité</span>
            <strong className="csp-value"><RollingNumber value={atlasLegitimite} /></strong>
          </div>
          <span className="csp-bar">
            <span className="csp-bar-fill csp-bar-fill--legit" style={{ width: `${clamp01((atlasLegitimite || 0) / 100) * 100}%` }}></span>
          </span>
        </div>
      )}

      <div className="csp-divider" aria-hidden="true"></div>

      <div className="csp-stats">
        <div className="csp-stat" title="Cycles accomplis">
          <span className="csp-stat-icon" aria-hidden="true">🔄</span>
          <span className="csp-stat-label">Cycles</span>
          <strong><RollingNumber value={cycles} /></strong>
        </div>
        <div className="csp-stat" title="Numéro de la dynastie actuelle">
          <span className="csp-stat-icon" aria-hidden="true">👑</span>
          <span className="csp-stat-label">Dynastie</span>
          <strong>{roman(dynastyCount + 1)}</strong>
        </div>
        <div className="csp-stat" title="Multiplicateur global de production">
          <span className="csp-stat-icon" aria-hidden="true">⚡</span>
          <span className="csp-stat-label">Multiplic.</span>
          <strong>x<RollingNumber value={globalMult} /></strong>
        </div>
        <div className="csp-stat" title="Meilleure ère atteinte à ce jour">
          <span className="csp-stat-icon" aria-hidden="true">🏆</span>
          <span className="csp-stat-label">Âge max</span>
          <strong className="csp-stat-era">{eras[bestEraIndex].name}</strong>
        </div>
        <div className="csp-stat" title="Durée du cycle actuel">
          <span className="csp-stat-icon" aria-hidden="true">⏳</span>
          <span className="csp-stat-label">Temps</span>
          <strong>{cycleTimeLabel}</strong>
        </div>
      </div>
    </div>
  );
}
