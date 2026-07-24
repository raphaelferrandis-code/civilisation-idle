import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCityViewState } from '../../hooks/useCityViewState.js';
import { globalMultiplier, currentEraIndex, nextEraProgress } from '../../game/core/mechanics.js';
import { eras } from '../../game/data/world.js';
import { getEraTheme } from '../../game/data/eraThemes.js';
import { pct, clamp01, fmtSecs } from '../../game/core/utils.js';
import { state, getLastSaveAt, getLastSaveError } from '../../game/core/state.js';
import { idleCapSeconds, nextIdleCapPalier, clepsydreCapSeconds, clepsydreRefusal, spendStoredTime, chooseCycleVow } from '../../game/core/main.js';
import { cycleVowStatus, vowById } from '../../game/data/vows.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { tr } from '../../game/core/i18n.js';
import RollingNumber from './RollingNumber.jsx';
import PixelIcon from './PixelIcon.jsx';
import { tipProps } from './HelpBubble.jsx';

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

// Contenu VIVANT de la bulle « Usure » : le compte à rebours du prochain palier
// descend seconde par seconde, une chaîne se figerait à l'ouverture et mentirait
// dès la seconde suivante. Hors du composant parce que la bulle la rappelle
// toutes les 250 ms, jamais pendant un rendu : `tickNow` serait celui du rendu
// qui a ouvert la bulle, donc gelé.
function sedimentTipText(nextPalier, cycleStartedAt) {
  if (!nextPalier) return tr({ fr: 'Bonus sédiment maximum atteint', en: 'Maximum sediment bonus reached' });
  const restant = Math.max(0, Math.ceil(nextPalier.secs - (Date.now() - cycleStartedAt) / 1000));
  return tr({
    fr: `Prochain palier sédiment : +${nextPalier.bonus}% dans ${fmtSecs(restant)}`,
    en: `Next sediment tier: +${nextPalier.bonus}% in ${fmtSecs(restant)}`
  });
}

export default function CityStatusPanel() {
  const {
    cycles, bestEraIndex, cycleStartedAt,
    timeWear, tickNow, storedSeconds, cycleVow
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

  // VŒU DU CYCLE (D2). Lu sur le state vivant (comme currentEraIndex ci-dessus) ;
  // le composant se re-rend déjà à 1 Hz via tickNow, donc l'avancement suit. Un
  // vœu PRÊTÉ (chosen) affiche sa jauge ; sinon on propose les trois candidats.
  const vowStatus = cycleVow && cycleVow.chosen ? cycleVowStatus(state) : null;
  const vowOffered = cycleVow && !cycleVow.chosen ? (cycleVow.offered || []) : [];

  // Les trois propositions s'ouvrent en SURCOUCHE et non dans la gouttière : à
  // trois pastilles côte à côte, il fallait descendre sous 8 px de texte pour
  // tenir — illisible. En surcouche, chaque option garde son libellé entier à une
  // taille lisible, et l'encart ne gagne pas un pixel de hauteur.
  // ON NE RETIENT PAS UN BOOLÉEN « ouverte » MAIS L'OFFRE POUR LAQUELLE elle
  // l'est. Un booléen devait être remis à false par un effet dès que l'offre
  // disparaissait (vœu prêté, nouveau cycle) : un rendu en cascade, refusé par
  // le lint, et la surcouche restait visible le temps d'une frame. Avec la clé
  // de l'offre, la visibilité se DÉDUIT — l'offre change, la surcouche se ferme
  // d'elle-même, et une offre neuve ne peut pas la rouvrir toute seule.
  const vowOfferKey = vowOffered.map((o) => o.id).join('|');
  const [vowPickerFor, setVowPickerFor] = useState(null);
  const vowPickerOpen = vowOffered.length > 0 && vowPickerFor === vowOfferKey;
  const [vowPickerPos, setVowPickerPos] = useState(null);
  const vowTriggerRef = useRef(null);
  // Coordonnées calculées À L'OUVERTURE depuis le bouton (surcouche en position
  // fixe). Repliée AU-DESSUS du bouton si elle sortirait par le bas de l'écran.
  //
  // ⚠ Les deux setState sont posés CÔTE À CÔTE, jamais l'un dans l'updater de
  // l'autre : React rejoue les updaters (deux fois en StrictMode), et une
  // fonction qui en profite pour écrire un AUTRE état n'est plus rejouable.
  const toggleVowPicker = () => {
    if (vowPickerOpen) { setVowPickerFor(null); return; }
    const r = vowTriggerRef.current?.getBoundingClientRect();
    if (r) {
      const guess = 34 * Math.max(1, vowOffered.length) + 12;   // hauteur estimée
      const below = r.bottom + 4;
      // On s'ouvre VERS LE HAUT dès que le bouton est dans le bas de l'écran :
      // vers le bas, la surcouche retomberait pile sur les actions rapides
      // (Sauver/Exporter/Importer/Options) et les masquerait le temps du choix.
      const openUp = r.top > window.innerHeight * 0.55 || below + guess > window.innerHeight;
      setVowPickerPos({
        left: Math.round(r.left),
        top: Math.round(openUp ? Math.max(4, r.top - guess - 4) : below),
      });
    }
    setVowPickerFor(vowOfferKey);
  };
  useEffect(() => {
    if (!vowPickerOpen) return undefined;
    // Fermeture au clic extérieur. PAS de garde Échap : cette touche ouvre déjà
    // les Options (App.jsx), et les deux écouteurs vivent sur document.
    // La surcouche est PORTÉE dans <body> : elle n'est plus un descendant de
    // .csp-vow, il faut donc l'exclure explicitement, sinon le mousedown la
    // fermerait avant que le clic n'atteigne l'option.
    // Sur `click` et NON `mousedown` : fermer au mousedown re-rend l'arbre entre
    // le mousedown et le mouseup, et le clic du bouton visé (Sauver, Options…)
    // était alors AVALÉ — il fallait cliquer deux fois. Au click, le bouton a
    // déjà reçu le sien.
    const onDocClick = (e) => {
      const inside = e.target.closest && (e.target.closest('.csp-vow') || e.target.closest('.csp-vow-picker'));
      if (!inside) setVowPickerFor(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [vowPickerOpen]);

  const saveError = getLastSaveError();
  const lastSaveAt = getLastSaveAt();
  const saveAgeSec = lastSaveAt ? Math.max(0, Math.round((tickNow - lastSaveAt) / 1000)) : null;

  return (
    <div className="city-status-panel" aria-label={tr({ fr: "État de la civilisation", en: "Civilization status" })}>
      <div
        className="csp-block"
        {...tipProps(tr({ fr: 'Âge', en: 'Age' }), tr({
          fr: `Progression vers l'âge suivant. ${eraTheme.epochLabel}, ère ${eraTheme.epochNumeral}/V.`,
          en: `Progress toward the next age. ${eraTheme.epochLabel}, era ${eraTheme.epochNumeral}/V.`
        }))}
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
        {...tipProps(tr({ fr: 'Usure', en: 'Wear' }), () => sedimentTipText(nextPalier, cycleStartedAt))}
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
        <div className="csp-stat" {...tipProps(tr({ fr: 'Cycles', en: 'Cycles' }), tr({ fr: "Cycles accomplis", en: "Cycles completed" }))}>
          <PixelIcon name="glyphs/cycles" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Cycles', en: 'Cycles' })}</span>
          <strong><RollingNumber value={cycles} /></strong>
        </div>
        <div className="csp-stat" {...tipProps(tr({ fr: 'Multi.', en: 'Multi.' }), tr({ fr: "Multiplicateur global de production", en: "Global production multiplier" }))}>
          <PixelIcon name="glyphs/mult" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Multi.', en: 'Multi.' })}</span>
          <strong>x<RollingNumber value={globalMult} /></strong>
        </div>
        <div className="csp-stat" {...tipProps(tr({ fr: 'Âge max', en: 'Max age' }), tr({ fr: "Meilleure ère atteinte à ce jour", en: "Best era reached so far" }))}>
          <PixelIcon name="glyphs/trophee" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Âge max', en: 'Max age' })}</span>
          <strong className="csp-stat-era">{eras[bestEraIndex].name}</strong>
        </div>
        <div className="csp-stat" {...tipProps(tr({ fr: 'Temps', en: 'Time' }), tr({ fr: "Durée du cycle actuel", en: "Duration of the current cycle" }))}>
          <PixelIcon name="glyphs/temps" className="csp-stat-icon" />
          <span className="csp-stat-label">{tr({ fr: 'Temps', en: 'Time' })}</span>
          <strong>{cycleTimeLabel}</strong>
        </div>
      </div>

      {/* VŒU DU CYCLE (D2). Le seul objectif court terme VOLONTAIRE du jeu :
          proposé au début du cycle, tenu il majore la moisson de la prochaine
          chute, manqué il ne coûte rien. Bloc conditionnel comme la clepsydre. */}
      {cycleVow && (vowStatus || vowOffered.length > 0) && (
        <div
          className="csp-vow"
          {...tipProps(tr({ fr: 'Vœu du cycle', en: 'Cycle vow' }), tr({
            fr: "Un objectif court terme, libre à toi de le tenir. Réussi, il majore la moisson de Ruines de la prochaine chute ; manqué, il ne coûte rien.",
            en: "A short-term goal, yours to keep or not. Fulfilled, it raises the next collapse's Ruin harvest; missed, it costs nothing."
          }))}
        >
          {vowStatus ? (
            <>
              <div className="csp-vow-line">
                <span className="csp-vow-tag">{tr({ fr: 'Vœu', en: 'Vow' })}</span>
                <span className={`csp-vow-goal ${vowStatus.done ? 'is-done' : ''}`}>
                  {vowStatus.done ? '✓ ' : ''}{tr(vowStatus.def.short(vowStatus.target))}
                </span>
                <strong className={`csp-vow-mult ${vowStatus.done ? 'is-done' : ''}`}>
                  +{Math.round((vowStatus.ruinMult - 1) * 100)}%
                </strong>
              </div>
              <span className="csp-vow-bar">
                <span
                  className={`csp-vow-bar-fill ${vowStatus.done ? 'is-done' : ''}`}
                  style={{ width: `${vowStatus.progress * 100}%` }}
                ></span>
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                className="csp-vow-trigger"
                ref={vowTriggerRef}
                aria-expanded={vowPickerOpen}
                onClick={toggleVowPicker}
              >
                <span className="csp-vow-tag">{tr({ fr: 'Vœu du cycle', en: 'Cycle vow' })}</span>
                <span className="csp-vow-cta">{tr({ fr: 'choisir', en: 'choose' })} ▸</span>
              </button>
              {/* PORTÉE dans <body> : la barre latérale forme son propre contexte
                  d'empilement et le contenu principal se peint AU-DESSUS — une
                  surcouche laissée dans l'encart n'était pas cliquable, quel que
                  soit son z-index. */}
              {vowPickerOpen && createPortal(
                <div
                  className="csp-vow-picker"
                  style={vowPickerPos ? { left: `${vowPickerPos.left}px`, top: `${vowPickerPos.top}px` } : undefined}
                >
                  {vowOffered.map((o) => {
                    const def = vowById(o.id);
                    if (!def) return null;
                    const pctBonus = Math.round((def.ruinMult - 1) * 100);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="csp-vow-option"
                        onClick={() => { chooseCycleVow(o.id); setVowPickerFor(null); }}
                      >
                        <span className="csp-vow-option-goal">{tr(def.describe(o.target))}</span>
                        <strong className="csp-vow-option-mult">+{pctBonus}%</strong>
                      </button>
                    );
                  })}
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      )}

      {/* Classes DÉDIÉES et non .csp-label/.csp-value : entre 981 et 1500px, ces
          deux-là sont masquées et l'encart deviendrait muet. Ici la valeur reste
          lisible à tous les paliers, seul le libellé se raccourcit. */}
      <div
        className="csp-idle"
        {...tipProps(tr({ fr: "Réserve d'absence", en: 'Away reserve' }), idleNext
          ? tr({
              fr: `La cité produit et vieillit en ton absence, jusqu'à ${fmtSecs(idleCap)}. Au-delà, le temps est perdu. « ${idleNext.name} » porte la réserve à ${fmtSecs(idleNext.cap)}.`,
              en: `The city produces and ages while you are away, up to ${fmtSecs(idleCap)}. Beyond that, time is lost. "${idleNext.name}" raises the reserve to ${fmtSecs(idleNext.cap)}.`
            })
          : tr({
              fr: `La cité produit et vieillit en ton absence, jusqu'à ${fmtSecs(idleCap)}. Réserve maximale atteinte.`,
              en: `The city produces and ages while you are away, up to ${fmtSecs(idleCap)}. Maximum reserve reached.`
            }))}
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
          {...tipProps(tr({ fr: 'Clepsydre', en: 'Clepsydra' }), tr({
            fr: `Le temps reçu au-dessus de la réserve n'est plus perdu : il attend ici, jusqu'à ${fmtSecs(clepsydreCap)}. Le verser rejoue ce temps comme une absence — la cité produit et vieillit, et si l'Édit d'effondrement est actif elle peut chuter et rebâtir.`,
            en: `Time received above the reserve is no longer lost: it waits here, up to ${fmtSecs(clepsydreCap)}. Pouring it replays that time as an absence — the city produces and ages, and if the Collapse Edict is active it may fall and rebuild.`
          }))}
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

      {/* Le rappel « N sceaux à réclamer » (B9, point 5) a été RETIRÉ de l'encart
          à la demande de Raph : la gouttière est pleine et le plateau des sceaux
          vit déjà dans l'onglet Effondrement, qui porte sa propre pastille. */}

      {/* Un ÉCHEC de sauvegarde reste affiché tant qu'il est vrai : il ne peut
          pas passer par les toasts, qui s'effacent au bout de 2,4 s. */}
      {saveError ? (
        <div className="csp-save is-error" {...tipProps(null, tr({ fr: `Sauvegarde impossible : ${saveError}. La partie continue en mémoire, mais elle ne survivra pas à la fermeture.`, en: `Cannot save: ${saveError}. The game continues in memory, but it will not survive closing.` }))}>
          {tr({ fr: "Sauvegarde impossible", en: "Cannot save" })}
        </div>
      ) : saveAgeSec !== null && (
        <div className="csp-save" {...tipProps(null, tr({ fr: "Dernière sauvegarde réussie. Le jeu sauvegarde aussi tout seul.", en: "Last successful save. The game also saves on its own." }))}>
          {saveAgeSec < 5
            ? tr({ fr: "sauvegardé à l'instant", en: "saved just now" })
            : tr({ fr: `sauvegardé il y a ${saveAgeSec} s`, en: `saved ${saveAgeSec}s ago` })}
        </div>
      )}
    </div>
  );
}
