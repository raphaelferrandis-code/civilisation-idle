import { useCityViewState } from '../../hooks/useCityViewState.js';
import { globalMultiplier, currentEraIndex, nextEraProgress, claimableGrandResetCount } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { getEraTheme } from '../../game/data/eraThemes.js';
import { pct, clamp01, fmtSecs } from '../../game/core/utils.js';
import { getLastSaveAt, getLastSaveError } from '../../game/core/state.js';
import { idleCapSeconds, nextIdleCapPalier, clepsydreCapSeconds, clepsydreRefusal, spendStoredTime } from '../../game/core/main.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
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
    timeWear, tickNow, storedSeconds
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

  // LA CLEPSYDRE (C7). Elle, à l'inverse de la réserve, est une VRAIE jauge : ce
  // qu'elle contient ne bouge qu'au retour d'une absence et au versement, donc
  // le remplissage affiché veut dire quelque chose à tout instant.
  // Masquée tant qu'elle n'a jamais rien reçu : un bloc vide n'apprend rien, et
  // le rapport de reprise nomme la clepsydre le jour où elle se remplit.
  const stored = Math.floor(storedSeconds || 0);
  const clepsydreCap = clepsydreCapSeconds();
  const refusal = stored > 0 ? clepsydreRefusal() : "empty";
  const refusalText = {
    busy: tr({ fr: "Impossible pendant un effondrement ou une fenêtre ouverte.", en: "Not while a collapse or a window is in progress." }),
    crisis: tr({ fr: "Impossible pendant une crise : règle d'abord la cité.", en: "Not during a crisis: settle the city first." }),
    bonus: tr({ fr: "Impossible pendant un bonus de production : il s'étalerait sur tout le temps versé.", en: "Not during a production bonus: it would spread over all the poured time." }),
    empty: tr({ fr: "Il faut au moins une minute de réserve.", en: "At least one minute of reserve is needed." })
  }[refusal];

  // PASTILLE DE SAUVEGARDE : l'information n'existait nulle part sans cliquer.
  // On lit `tickNow` et non `Date.now()` — ce composant est déjà réabonné au
  // tick, s'appuyer sur l'horloge murale ferait diverger l'âge affiché du reste
  // de l'encart entre deux rendus.
  const sceauxPrets = claimableGrandResetCount();

  const saveError = getLastSaveError();
  const lastSaveAt = getLastSaveAt();
  const saveAgeSec = lastSaveAt ? Math.max(0, Math.round((tickNow - lastSaveAt) / 1000)) : null;

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

      {stored > 0 && (
        <div
          className="csp-clepsydre"
          title={tr({
            fr: `Le temps reçu au-dessus de la réserve n'est plus perdu : il attend ici, jusqu'à ${fmtSecs(clepsydreCap)}. Le verser rejoue ce temps comme une absence — la cité produit et vieillit, et si l'Édit d'effondrement est actif elle peut chuter et rebâtir.`,
            en: `Time received above the reserve is no longer lost: it waits here, up to ${fmtSecs(clepsydreCap)}. Pouring it replays that time as an absence — the city produces and ages, and if the Collapse Edict is active it may fall and rebuild.`
          })}
        >
          <div className="csp-clepsydre-head">
            <span className="csp-idle-label">{tr({ fr: 'Clepsydre', en: 'Clepsydra' })}</span>
            <strong className="csp-idle-value">{fmtSecs(stored)}</strong>
          </div>
          <span className="csp-bar">
            <span className="csp-bar-fill csp-bar-fill--clepsydre" style={{ width: `${clamp01(stored / clepsydreCap) * 100}%` }}></span>
          </span>
          {/* Le motif du refus est écrit SUR le bouton et pas seulement dans
              l'infobulle : un bouton grisé sans raison se lit comme un bug. */}
          <button
            type="button"
            className="csp-clepsydre-pour"
            disabled={!!refusal}
            onClick={() => {
              const res = spendStoredTime();
              if (!res.ok) pushOutcomeFloat({ label: refusalText, kind: 'info' });
            }}
          >
            {tr({ fr: `Verser ${fmtSecs(stored)}`, en: `Pour ${fmtSecs(stored)}` })}
          </button>
          {refusal && <span className="csp-clepsydre-why">{refusalText}</span>}
          {!refusal && (
            <span className="csp-clepsydre-why">
              {tr({ fr: "Ne tournent pas : les fêtes de jalon, les bulles d'habitants.", en: "Will not run: milestone celebrations, citizen bubbles." })}
            </span>
          )}
        </div>
      )}

      {/* SCEAUX PRÊTS (B9, point 5). Reporté ici parce que le plateau vit dans
          l'onglet Effondrement : sans ce rappel, le joueur peut laisser un sceau
          dormir des heures. AUCUN nouvel abonnement — le composant se re-rend
          déjà à 1 Hz via tickNow, et compter revient à filtrer onze entrées. */}
      {sceauxPrets > 0 && (
        <div
          className="csp-seals"
          title={tr({
            fr: "Des sceaux du Grand Reset sont prêts à être réclamés, dans l'onglet Effondrement.",
            en: "Grand Reset seals are ready to claim, in the Collapse tab."
          })}
        >
          {tr({
            fr: `${sceauxPrets} sceau${sceauxPrets > 1 ? 'x' : ''} à réclamer`,
            en: `${sceauxPrets} seal${sceauxPrets > 1 ? 's' : ''} to claim`
          })}
        </div>
      )}

      {/* Un ÉCHEC de sauvegarde reste affiché tant qu'il est vrai : il ne peut
          pas passer par les toasts, qui s'effacent au bout de 2,4 s. */}
      {saveError ? (
        <div className="csp-save is-error" title={tr({ fr: `Sauvegarde impossible : ${saveError}. La partie continue en mémoire, mais elle ne survivra pas à la fermeture.`, en: `Cannot save: ${saveError}. The game continues in memory, but it will not survive closing.` })}>
          {tr({ fr: "Sauvegarde impossible", en: "Cannot save" })}
        </div>
      ) : saveAgeSec !== null && (
        <div className="csp-save" title={tr({ fr: "Dernière sauvegarde réussie. Le jeu sauvegarde aussi tout seul.", en: "Last successful save. The game also saves on its own." })}>
          {saveAgeSec < 5
            ? tr({ fr: "sauvegardé à l'instant", en: "saved just now" })
            : tr({ fr: `sauvegardé il y a ${saveAgeSec} s`, en: `saved ${saveAgeSec}s ago` })}
        </div>
      )}
    </div>
  );
}
