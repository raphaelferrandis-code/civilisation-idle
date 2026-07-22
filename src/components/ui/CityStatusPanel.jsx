import { useCityViewState } from '../../hooks/useCityViewState.js';
import { globalMultiplier, currentEraIndex, nextEraProgress } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { getEraTheme } from '../../game/data/eraThemes.js';
import { pct, clamp01, fmtSecs } from '../../game/core/utils.js';
import { idleCapSeconds, nextIdleCapPalier } from '../../game/core/main.js';
import { tr } from '../../game/core/i18n.js';
import RollingNumber from './RollingNumber.jsx';
import PixelIcon from './PixelIcon.jsx';

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
    cycles, bestEraIndex, cycleStartedAt,
    timeWear, tickNow
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

  // RÉSERVE D'ABSENCE : le plafond d'idle, en clair. Volontairement STATIQUE et
  // non une jauge de remplissage : `state.lastTick` est réécrit à chaque tick,
  // donc le ratio « temps accumulé / plafond » vaudrait ~1/28800 en permanence
  // tant que l'onglet est visible — c'est-à-dire une jauge vide 100 % du temps
  // où le joueur la regarde. Le remplissage a du sens au RETOUR, pas pendant.
  const idleCap = idleCapSeconds();
  const idleNext = nextIdleCapPalier();

  return (
    <div className="city-status-panel" aria-label={tr({ fr: "État de la civilisation", en: "Civilization status" })}>
      <div
        className="csp-block"
        title={tr({
          fr: `Progression vers l'âge suivant. ${eraTheme.epochLabel}, ère ${eraTheme.epochNumeral}/V.`,
          en: `Progress toward the next age. ${eraTheme.epochLabel}, era ${eraTheme.epochNumeral}/V.`
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

      <div className="csp-divider" aria-hidden="true"></div>

      <div className="csp-stats">
        <div className="csp-stat" title={tr({ fr: "Cycles accomplis", en: "Cycles completed" })}>
          <PixelIcon name="glyphs/cycles" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Cycles', en: 'Cycles' })}</span>
          <strong><RollingNumber value={cycles} /></strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Multiplicateur global de production", en: "Global production multiplier" })}>
          <PixelIcon name="glyphs/mult" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Multi.', en: 'Multi.' })}</span>
          <strong>x<RollingNumber value={globalMult} /></strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Meilleure ère atteinte à ce jour", en: "Best era reached so far" })}>
          <PixelIcon name="glyphs/trophee" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Âge max', en: 'Max age' })}</span>
          <strong className="csp-stat-era">{eras[bestEraIndex].name}</strong>
        </div>
        <div className="csp-stat" title={tr({ fr: "Durée du cycle actuel", en: "Duration of the current cycle" })}>
          <PixelIcon name="glyphs/temps" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Temps', en: 'Time' })}</span>
          <strong>{cycleTimeLabel}</strong>
        </div>
      </div>

      {/* Classes DÉDIÉES et non .csp-label/.csp-value : entre 981 et 1500px, ces
          deux-là sont masquées et l'encart deviendrait muet. Ici la valeur reste
          lisible à tous les paliers, seul le libellé se raccourcit. */}
      <div
        className="csp-idle"
        title={idleNext
          ? tr({
              fr: `La cité produit et vieillit en ton absence, jusqu'à ${fmtSecs(idleCap)}. Au-delà, le temps est perdu. « ${idleNext.name} » porte la réserve à ${fmtSecs(idleNext.cap)}.`,
              en: `The city produces and ages while you are away, up to ${fmtSecs(idleCap)}. Beyond that, time is lost. "${idleNext.name}" raises the reserve to ${fmtSecs(idleNext.cap)}.`
            })
          : tr({
              fr: `La cité produit et vieillit en ton absence, jusqu'à ${fmtSecs(idleCap)}. Réserve maximale atteinte.`,
              en: `The city produces and ages while you are away, up to ${fmtSecs(idleCap)}. Maximum reserve reached.`
            })}
      >
        <span className="csp-idle-label">{tr({ fr: "Réserve d'absence", en: 'Away reserve' })}</span>
        <strong className="csp-idle-value">{fmtSecs(idleCap)}</strong>
        {idleNext && (
          <span className="csp-idle-next">{tr({ fr: `puis ${fmtSecs(idleNext.cap)}`, en: `then ${fmtSecs(idleNext.cap)}` })}</span>
        )}
      </div>
    </div>
  );
}
