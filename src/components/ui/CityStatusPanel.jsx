import { useCityViewState } from '../../hooks/useCityViewState.js';
import { globalMultiplier, currentEraIndex, nextEraProgress } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { getEraTheme } from '../../game/data/eraThemes.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { pct, roman, clamp01 } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
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
        title={tr({
          fr: `Progression vers l'âge suivant — ${eraTheme.epochLabel}, ère ${eraTheme.epochNumeral}/V`,
          en: `Progress toward the next age — ${eraTheme.epochLabel}, era ${eraTheme.epochNumeral}/V`
        })}
      >
        <div className="csp-block-head">
          <span className="csp-label">{tr({ fr: 'Âge', en: 'Age' })}</span>
          <strong className="csp-value csp-value--era">{currentEra.name}</strong>
        </div>
        <span className="csp-bar">
          <span className="csp-bar-fill csp-bar-fill--era" style={{ width: `${eraProgress * 100}%` }}></span>
        </span>
      </div>

      <div
        className="csp-block"
        title={nextPalier
          ? tr({
              fr: `Prochain palier sédiment : +${nextPalier.bonus}% dans ${fmtSecs(nextPalierInSecs)}`,
              en: `Next sediment tier: +${nextPalier.bonus}% in ${fmtSecs(nextPalierInSecs)}`
            })
          : tr({ fr: 'Bonus sédiment maximum atteint', en: 'Maximum sediment bonus reached' })}
      >
        <div className="csp-block-head">
          <span className="csp-label">{tr({ fr: 'Usure', en: 'Wear' })}</span>
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
        <div className="csp-block" title={tr({ fr: "Légitimité d'Atlas", en: "Atlas's Legitimacy" })}>
          <div className="csp-block-head">
            <span className="csp-label">{tr({ fr: 'Légitimité', en: 'Legitimacy' })}</span>
            <strong className="csp-value"><RollingNumber value={atlasLegitimite} /></strong>
          </div>
          <span className="csp-bar">
            <span className="csp-bar-fill csp-bar-fill--legit" style={{ width: `${clamp01((atlasLegitimite || 0) / 100) * 100}%` }}></span>
          </span>
        </div>
      )}

      <div className="csp-divider" aria-hidden="true"></div>

      <div className="csp-stats">
        <div className="csp-stat" title={tr({ fr: "Cycles accomplis", en: "Cycles completed" })}>
          <span className="csp-stat-icon" aria-hidden="true">🔄</span>
          <span className="csp-stat-label">{tr({ fr: 'Cycles', en: 'Cycles' })}</span>
          <strong><RollingNumber value={cycles} /></strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Numéro de la dynastie actuelle", en: "Number of the current dynasty" })}>
          <span className="csp-stat-icon" aria-hidden="true">👑</span>
          <span className="csp-stat-label">{tr({ fr: 'Dynastie', en: 'Dynasty' })}</span>
          <strong>{roman(dynastyCount + 1)}</strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Multiplicateur global de production", en: "Global production multiplier" })}>
          <span className="csp-stat-icon" aria-hidden="true">⚡</span>
          <span className="csp-stat-label">{tr({ fr: 'Multiplic.', en: 'Multiplier' })}</span>
          <strong>x<RollingNumber value={globalMult} /></strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Meilleure ère atteinte à ce jour", en: "Best era reached so far" })}>
          <span className="csp-stat-icon" aria-hidden="true">🏆</span>
          <span className="csp-stat-label">{tr({ fr: 'Âge max', en: 'Max age' })}</span>
          <strong className="csp-stat-era">{eras[bestEraIndex].name}</strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Durée du cycle actuel", en: "Duration of the current cycle" })}>
          <span className="csp-stat-icon" aria-hidden="true">⏳</span>
          <span className="csp-stat-label">{tr({ fr: 'Temps', en: 'Time' })}</span>
          <strong>{cycleTimeLabel}</strong>
        </div>
      </div>
    </div>
  );
}
