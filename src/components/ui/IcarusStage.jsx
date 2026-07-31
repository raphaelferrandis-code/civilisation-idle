import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state } from '../../game/core/state.js';
import {
  launchIcarus,
  cashOutIcarus,
  icarusStakes,
  icarusFlying,
  icarusFlightInfo,
  icarusMultiplier,
  icarusLastOutcome,
  icarusPotFaveur,
  icarusAlmostPayout,
  icarusEffectiveCap
} from '../../game/core/actions.js';
import { ICARUS_JACKPOT_MULT } from '../../game/core/balance.js';
import { potRakeShare, clampStakeMult } from '../../game/core/actions/templePot.js';
import { hasFreeFlight, freeFlightCount } from '../../game/core/actions/templeFlights.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon, PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import CoffreSelect from './CoffreSelect.jsx';
import StageHelp from './StageHelp.jsx';

/**
 * Le Vol d'Icare — SCÈNE INTÉGRÉE (ex-IcarusDialog, dé-modalisée 2026-07-14 :
 * le jeu se joue dans la scène en bas de la page Régulation). Le moteur
 * (actions/icarus.js) reste autoritaire : rouvrir la scène PENDANT un vol le
 * REPREND en cours (le timer de chute n'a jamais cessé de courir).
 */

const TICK_MS = 80;

function PixelFeather() {
  return (
    <svg viewBox="0 0 8 14" width="16" height="28" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="0" width="2" height="2" fill="#fdf3d0" />
      <rect x="2" y="2" width="4" height="2" fill="#f4d88a" />
      <rect x="2" y="4" width="4" height="3" fill="#e8b54f" />
      <rect x="3" y="7" width="2" height="3" fill="#c98d33" />
      <rect x="3" y="10" width="1" height="4" fill="#8a5f28" />
    </svg>
  );
}

function crashChipTone(c) {
  // La BRAISE (phase 7) : la cire n'a pas pris, Icare n'a jamais décollé —
  // P(C = 1) = edge EXACTEMENT, donc l'historique devient une lecture directe
  // des ailes cirées : ~2 braises sur 12 aux ailes 0, ~0,5 aux ailes 6. C'est
  // le seul endroit du jeu où l'achat des ailes se VOIT (il faudrait ~8 000
  // jets pour le sentir aux osselets).
  if (c <= 1.01) return 'is-scorched';
  if (c >= ICARUS_JACKPOT_MULT) return 'is-hot';
  if (c >= 2) return 'is-warm';
  return 'is-cold';
}

function multiplierTone(m) {
  if (m >= 10) return '#ff5b4d';
  if (m >= 5) return '#ff9a3d';
  if (m >= 2) return '#ffd23d';
  return '#ffe9a8';
}

export default function IcarusStage({ table, onClose }) {
  const tickerRef = useRef(null);
  const [phase, setPhase] = useState('ready');
  // Aucune mise choisie au départ (sketch Raph 2026-07-17 : « le bouton de jeu
  // n'apparaît que quand la mise est sélectionnée ») — le bouton S'envoler reste
  // masqué tant qu'on n'a pas cliqué un choix.
  const [stakeId, setStakeId] = useState(null);
  // La puissance de mise du coffre (×1, ×10…), re-clampée au rendu ET au moteur.
  const [coffreMult, setCoffreMult] = useState(1);
  const [stakeFaveur, setStakeFaveur] = useState(null); // pour l'aperçu vivant du gain de Faveur
  const [m, setM] = useState(1);
  const [outcome, setOutcome] = useState(null);
  useGameState((s) => s.instability); // cagnotte, vols offerts (1 Hz)
  const faveur = useGameState((s) => s.faveur || 0); // mises payables en direct
  const cycles = useGameState((s) => s.cycles);

  const stopTicker = () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
  };

  // Nouvelle ouverture : repartir au sol — SAUF si un vol est déjà en l'air
  // (scène fermée en plein vol puis rouverte) : on le reprend.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise la scène sur l'état EXTERNE du vol (icarusFlying) à la réouverture
    setOutcome(null);
    if (icarusFlying()) {
      // Vol repris (scène rouverte en plein vol) : on RESTAURE la mise réelle du
      // vol depuis le moteur — sinon « Revoler » rejouait dans le vide (stakeId
      // null → stakes.find échoue) et l'aperçu « +X faveur » du bouton SE POSER
      // restait muet (stakeFaveur null).
      const info = icarusFlightInfo();
      setStakeId(info?.stakeId ?? null);
      setStakeFaveur(info?.stakeFaveur ?? null);
      setM(icarusMultiplier());
      setPhase('flying');
    } else {
      setStakeId(null);
      setM(1);
      setPhase('ready');
    }
    return stopTicker;
  }, [table?.openedAt]);

  // Effondrement pendant le vol : la scène se referme (nouveau cycle).
  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  // Ticker de vol : anime le multiplicateur et détecte la chute (timer moteur).
  useEffect(() => {
    if (phase !== 'flying') return undefined;
    tickerRef.current = setInterval(() => {
      if (icarusFlying()) {
        setM(icarusMultiplier());
      } else {
        const out = icarusLastOutcome();
        stopTicker();
        setOutcome(out);
        if (out?.type === 'crash') { setM(out.crashPoint); setPhase('crashed'); }
        else if (out) { setM(out.m); setPhase('landed'); }
        else setPhase('ready');
      }
    }, TICK_MS);
    return stopTicker;
  }, [phase]);

  const stakes = icarusStakes();
  const potFaveur = icarusPotFaveur();
  const history = (state.icarusHistory || []).slice().reverse();
  const flying = phase === 'flying';
  const effMult = clampStakeMult(coffreMult); // parité stricte avec le moteur
  const chosenCost = (stakes.find((s) => s.id === stakeId) || stakes[0]).faveur * effMult;
  const freeChosen = effMult === 1 && hasFreeFlight(stakeId);
  // CIEL ANCRÉ SUR LE JACKPOT (phase 7). L'ancienne échelle log(m)/log(cap)
  // calibrait 114 px de course sur le ×100, un événement à 0,82 % : la MÉDIANE
  // des vols (×1,64) montait de 12 px, le sprite était immobile dans le cas
  // typique, et les Ailes solaires (cap ×200) COMPRIMAIENT tous les vols de
  // 13 %. Échelle par morceaux : le ×10 est aux trois quarts du ciel QUEL QUE
  // SOIT le cap (la médiane monte à ~32 %, le ×2 à ~39 %), et le segment
  // au-dessus du jackpot est le seul que les Ailes solaires étirent — il reste
  // du ciel au-dessus du soleil, comme leur récit le promet.
  const lj = Math.log(ICARUS_JACKPOT_MULT);
  const lcap = Math.log(icarusEffectiveCap());
  const skyClimb = (v) => {
    const l = Math.log(Math.max(1, v));
    return Math.max(0, Math.min(1, l <= lj
      ? 0.75 * Math.pow(l / lj, 0.55)
      : 0.75 + 0.25 * ((l - lj) / Math.max(1e-6, lcap - lj))));
  };
  const climb = skyClimb(m);
  // Gain de Faveur en direct : la mise × le multiplicateur courant (l'objet
  // stake retient stakeFaveur pour l'aperçu vivant du retrait).
  const liveGain = stakeFaveur ? Math.round(stakeFaveur * (Math.floor(m * 100) / 100)) : null;
  const almost = outcome?.type === 'crash' ? icarusAlmostPayout(outcome) : null;
  const nearMiss = outcome?.type === 'cashout' && (outcome.crashPoint - outcome.m) < 0.6;

  // Le décollage part sur la mise SÉLECTIONNÉE (stakeId) : le bouton S'envoler et
  // les « Revoler » de résultat appellent tous onLaunch() sans argument.
  const onLaunch = () => {
    const stake = stakes.find((s) => s.id === stakeId);
    if (!stake) return;
    // Un vol OFFERT ne vaut qu'à la mise de base (parité moteur : un billet est
    // un billet) ; au coffre supérieur, la Faveur est débitée à l'échelle.
    const freeHere = effMult === 1 && hasFreeFlight(stakeId);
    if (!freeHere && faveur < stake.faveur * effMult) return;
    const res = launchIcarus(stakeId, { stakeMult: effMult });
    if (!res) return;
    setStakeFaveur(stake.faveur * effMult);
    setOutcome(null);
    setM(1);
    setPhase('flying');
  };

  const onCashOut = () => {
    const out = cashOutIcarus();
    if (!out) return;
    stopTicker();
    setOutcome(out);
    if (out.type === 'crash') { setM(out.crashPoint); setPhase('crashed'); }
    else { setM(out.m); setPhase('landed'); }
  };

  return (
    <div className="icarus-stage">
      <div className="regul-block-title stage-title">
        {/* Nom du jeu retiré (retour Raphaël 2026-07-17 : « plus de nom en tête ») —
            la ligne ne garde que le pot, l'aide et la fermeture, alignés à droite. */}
        {/* La règle de rafle est passée en infobulle (le laïus mangeait le titre —
            passe densité 2026-07-17). */}
        <span
          className="icarus-stage-pot"
          {...tipProps(
            tr({ fr: 'La cagnotte du temple', en: 'The temple pot' }),
            tr({ fr: `Nourrie par les autres tables. Se poser à ×${ICARUS_JACKPOT_MULT} ou plus en emporte une part, au prorata de la mise : la Plume en prend peu, l’Hécatombe la rafle entière.`, en: `Fed by the other tables. Landing at ×${ICARUS_JACKPOT_MULT} or more takes a share, pro rata of the stake: the Feather takes little, the Hecatomb sweeps it all.` })
          )}
        >
          <PotIcon /> <strong>{fmt(potFaveur)}</strong> {tr({ fr: 'en cagnotte', en: 'in the pot' })}
        </span>
        <StageHelp>
          <p>
            {tr({
              fr: 'Le multiplicateur grimpe jusqu’au coup de soleil. Se poser avant encaisse la mise multipliée ; trop tard, tout brûle.',
              en: 'The multiplier climbs until the sun strikes. Landing before that cashes in the multiplied stake; too late, everything burns.'
            })}
          </p>
          <p>
            {tr({
              fr: `Se poser à ×${ICARUS_JACKPOT_MULT} ou plus emporte une part de la cagnotte, au prorata de la mise. Les vols offerts (Vénus, Soleils) valent à la mise de base.`,
              en: `Landing at ×${ICARUS_JACKPOT_MULT} or more takes a share of the pot, pro rata of the stake. Free flights (Venus, Suns) are worth the base stake.`
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}>✕</button>
      </div>

      {history.length > 0 && (
        <div className="icarus-history" aria-label={tr({ fr: 'Derniers vols', en: 'Last flights' })}>
          {history.map((c, i) => (
            <span key={`${c}-${i}`} className={`icarus-crash-chip ${crashChipTone(c)}`}>×{c < 10 ? c.toFixed(2) : Math.round(c)}</span>
          ))}
        </div>
      )}

      {/* Le ciel ne s'affiche PLUS pendant le choix de mise (retour Raphaël
          2026-07-17 : « supprimer la preview d'Icare ») — il n'apparaît qu'au
          décollage et rend toute sa hauteur aux bandeaux de mise. Au décollage,
          il REMPLIT le cadran (retour Raphaël 2026-07-18 : « le jeu qui prend
          tout le cadran ») et porte la commande SE POSER en surimpression. */}
      {phase !== 'ready' && (
      <div className={`icarus-sky${phase === 'crashed' ? ' is-crashed' : ''}${outcome?.jackpotFaveur ? ' is-jackpot' : ''}`}>
        <img
          className={`icarus-sun${phase === 'crashed' ? ' is-flare' : ''}`}
          src="/pixelart/ui/icarus/sun.png"
          alt=""
          aria-hidden="true"
        />
        {/* Le repère du jackpot : un filet d'or FIXE à 75 % de la course (l'ancrage
            de l'échelle) — l'objectif visuel constant du jeu, jamais déplacé par le
            cap. Filet 1 px, pas de halo (DA). */}
        <span className="icarus-jackpot-line" style={{ bottom: `${8 + 0.75 * 76}%` }} aria-hidden="true">
          <b>×{ICARUS_JACKPOT_MULT}</b>
        </span>
        {/* Le repère du guetteur : la cible de l'autopush, en pointillé, quand
            l'auto est débloquée — l'aide de visée promise avec le capstone. */}
        {state.templeAuto?.icarus?.unlocked && (
          <span
            className="icarus-target-line"
            style={{ bottom: `${8 + skyClimb(state.templeAuto.icarus.target || 2) * 76}%` }}
            aria-hidden="true"
          >
            <b>×{Number(state.templeAuto.icarus.target || 2).toFixed(1)}</b>
          </span>
        )}
        <span className="icarus-mult" style={{ color: multiplierTone(m) }}>×{m.toFixed(2)}</span>
        {(flying || phase === 'landed') && (
          <span className={`icarus-bird${phase === 'landed' ? ' is-safe' : ''}`} style={{ bottom: `${8 + climb * 76}%` }} aria-hidden="true">
            <img src="/pixelart/ui/icarus/icarus.png" alt="" />
          </span>
        )}
        {phase === 'crashed' && (
          <span className="icarus-feathers" style={{ bottom: `${8 + climb * 76}%` }} aria-hidden="true">
            <i><PixelFeather /></i><i><PixelFeather /></i><i><PixelFeather /></i><i><PixelFeather /></i>
          </span>
        )}
        {/* La commande SE POSER vit DANS le ciel (retour Raphaël 2026-07-18 : « on
            ne voit pas le bouton pour se poser quand ça commence ») : un bandeau
            en surimpression au pied du cadran, toujours visible dès le décollage —
            plus de menu séparé sous le ciel qui tombait sous la ligne de flottaison. */}
        {flying && (
          <div className="icarus-sky-hud">
            <button type="button" className="icarus-cashout" onClick={onCashOut}>
              {tr({ fr: 'SE POSER', en: 'LAND' })} ×{m.toFixed(2)}{liveGain ? ` · +${fmt(liveGain)} ${tr({ fr: 'faveur', en: 'favor' })}` : ''}
            </button>
          </div>
        )}
      </div>
      )}

      {phase === 'ready' && (
        <>
          <CoffreSelect value={effMult} onChange={setCoffreMult} />
          <div className="icarus-stakes">
            {stakes.map((s) => {
              const cost = s.faveur * effMult;
              const freeHere = effMult === 1 && hasFreeFlight(s.id);
              const broke = !freeHere && faveur < cost;
              const chosen = stakeId === s.id;
              return (
                // Le bouton de jeu n'apparaît QUE dans la mise choisie, cousu au pied
                // de SA colonne (retour Raph 2026-07-17 : « dans le cadre de la mise
                // choisie »).
                <div
                  key={s.id}
                  className={`icarus-stake${chosen ? ' is-chosen' : ''}${broke ? ' is-broke' : ''}`}
                >
                  <button
                    type="button"
                    className="stake-pick"
                    onClick={() => setStakeId(s.id)}
                    {...tipProps(tr(s.label), freeHere
                      ? tr({ fr: `Vol offert par un Coup de Vénus. Le temple paie la mise. Se poser à ×${ICARUS_JACKPOT_MULT}+ emporte ${Math.round(potRakeShare(s.faveur) * 100)} % de la cagnotte.`, en: `Flight offered by a Venus throw. The temple pays the stake. Landing at ×${ICARUS_JACKPOT_MULT}+ takes ${Math.round(potRakeShare(s.faveur) * 100)}% of the pot.` })
                      : tr({ fr: `Mise de ${cost} Faveur. Se poser à ×m rapporte ${cost} × m. Se poser à ×${ICARUS_JACKPOT_MULT}+ emporte ${Math.round(potRakeShare(cost) * 100)} % de la cagnotte : la part suit la mise.`, en: `${cost} Favor stake. Landing at ×m pays ${cost} × m. Landing at ×${ICARUS_JACKPOT_MULT}+ takes ${Math.round(potRakeShare(cost) * 100)}% of the pot: the share follows the stake.` }))}
                  >
                    <strong>{tr(s.label)}</strong>
                    <span><FaveurIcon /> {fmt(cost)}</span>
                    {/* La part de cagnotte suit la mise (potRakeShare) : c'est la seule
                        chose qui distingue les 3 mises autrement qu'à l'échelle, donc
                        elle doit être LISIBLE sur le bandeau, pas seulement au survol. */}
                    {potFaveur > 0 && (
                      <span className="icarus-stake-rake">{Math.round(potRakeShare(cost) * 100)} % {tr({ fr: 'de la cagnotte', en: 'of the pot' })}</span>
                    )}
                    {freeHere && <span className="icarus-stake-free">🪽 {tr({ fr: 'OFFERT', en: 'FREE' })} ×{freeFlightCount(s.id)}</span>}
                  </button>
                  {chosen && (
                    <button
                      type="button"
                      className="icarus-launch stake-play"
                      disabled={!freeChosen && faveur < chosenCost}
                      onClick={() => onLaunch()}
                    >
                      {tr({ fr: "S'envoler", en: 'Take flight' })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {phase === 'landed' && outcome && (
        <>
          {/* La rafle est au prorata de la mise : « CAGNOTTE RAFLÉE » ne se dit que si
              la mise emporte VRAIMENT tout, sinon la bannière ment (et c'est le seul
              endroit où le joueur voit ce que sa mise lui a acheté). */}
          {outcome.jackpotFaveur && (
            <p className="icarus-jackpot-banner"><PotIcon /> {potRakeShare(outcome.stakeFaveur) >= 1
              ? tr({ fr: 'CAGNOTTE RAFLÉE', en: 'POT SWEPT' })
              : tr({ fr: `PART DE CAGNOTTE (${Math.round(potRakeShare(outcome.stakeFaveur) * 100)} %)`, en: `POT SHARE (${Math.round(potRakeShare(outcome.stakeFaveur) * 100)}%)` })} : +{fmt(outcome.jackpotFaveur)} {tr({ fr: 'faveur', en: 'favor' })}</p>
          )}
          <p className="icarus-result icarus-result--win">
            +{fmt(outcome.faveur)} {tr({ fr: 'faveur', en: 'favor' })} <span className="icarus-result-sub">(×{outcome.m.toFixed(2)})</span>
          </p>
          <p className="icarus-reveal">
            {nearMiss ? '🔥 ' : ''}
            {tr({ fr: `Le soleil a frappé à ×${outcome.crashPoint.toFixed(2)}`, en: `The sun struck at ×${outcome.crashPoint.toFixed(2)}` })}
            {nearMiss ? `, ${tr({ fr: "un battement d'aile après toi !", en: 'a wingbeat after you!' })}` : `. ${tr({ fr: 'Tu volais encore.', en: 'You were still flying.' })}`}
          </p>
          {/* Rejeu DIRECT (phase 7) : « Revoler » relance à la mise mémorisée au lieu
              de renvoyer à l'écran de choix — le clic mort comptait le plus ici, le
              seul jeu du temple qui se rejoue en rafale sur un tronc plein. */}
          <menu className="choice-menu icarus-actions">
            <button
              type="button"
              className="icarus-launch"
              disabled={!freeChosen && faveur < chosenCost}
              onClick={() => onLaunch()}
            >
              {tr({ fr: `Revoler (${fmt(chosenCost)})`, en: `Fly again (${fmt(chosenCost)})` })}
            </button>
            <button type="button" onClick={() => { setPhase('ready'); setStakeId(null); setOutcome(null); setM(1); }}>
              {tr({ fr: 'Changer de mise', en: 'Change stake' })}
            </button>
            <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
          </menu>
        </>
      )}

      {phase === 'crashed' && outcome && (
        <>
          <p className="icarus-result icarus-result--burn">
            {outcome.crashPoint <= 1.01
              ? tr({ fr: 'Le soleil frappe au décollage : la cire fond d’un coup.', en: 'The sun strikes at takeoff: the wax melts at once.' })
              : tr({ fr: `La cire fond à ×${outcome.crashPoint.toFixed(2)}. Icare tombe.`, en: `The wax melts at ×${outcome.crashPoint.toFixed(2)}. Icarus falls.` })}
          </p>
          <p className="icarus-reveal">
            {tr({ fr: `La cagnotte du temple atteint ${fmt(potFaveur)} faveur`, en: `The temple pot reaches ${fmt(potFaveur)} favor` })}
            {almost && (
              <span className="icarus-knife"> · {tr({ fr: `une seconde plus tôt : +${fmt(almost.faveur)} faveur (×${almost.m.toFixed(2)})`, en: `one second sooner: +${fmt(almost.faveur)} favor (×${almost.m.toFixed(2)})` })}</span>
            )}
          </p>
          <menu className="choice-menu icarus-actions">
            <button
              type="button"
              className="icarus-launch"
              disabled={!freeChosen && faveur < chosenCost}
              onClick={() => onLaunch()}
            >
              {tr({ fr: `Revoler (${fmt(chosenCost)})`, en: `Fly again (${fmt(chosenCost)})` })}
            </button>
            <button type="button" onClick={() => { setPhase('ready'); setStakeId(null); setOutcome(null); setM(1); }}>
              {tr({ fr: 'Changer de mise', en: 'Change stake' })}
            </button>
            <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
          </menu>
        </>
      )}
    </div>
  );
}
