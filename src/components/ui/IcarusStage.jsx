import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state, saveSoon, renderCache } from '../../game/core/state.js';
import {
  launchIcarus,
  cashOutIcarus,
  icarusFlying,
  icarusFlightInfo,
  icarusMultiplier,
  icarusLastOutcome,
  icarusPotFaveur,
  icarusAlmostPayout,
  icarusEffectiveCap
} from '../../game/core/actions.js';
import { ICARUS_JACKPOT_MULT } from '../../game/core/balance.js';
import { potRakeShare } from '../../game/core/actions/templePot.js';
import { freeFlightCount, nextFreeFlight } from '../../game/core/actions/templeFlights.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { celebrerGain } from '../../game/core/grandsGains.js';
import { PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import PlaisirsTable from '../views/plaisirs/PlaisirsTable.jsx';
import TableMise from '../views/plaisirs/TableMise.jsx';
import { initialStake, rememberStake, fmtMise } from '../views/plaisirs/miseMemory.js';
import Monte from './Monte.jsx';
import { usePlaisirsBand, icarusSkyCss, icarusFlyer } from './plaisirsMaterial.js';
import { preparerTable, sonIcare, volIcare, finVol } from '../../game/audio/tables/tables.js';

// La hauteur du vol pour le son (audio/tables, lot 11) : 0 au sol, 1 au ×10 du jackpot.
const hauteurSon = (m) => Math.min(1, Math.log(Math.max(1, m)) / Math.log(ICARUS_JACKPOT_MULT));

/**
 * Le Vol d'Icare — SCÈNE INTÉGRÉE (dé-modalisée 2026-07-14 : le jeu se joue dans
 * la scène des jeux, RegulationStage, sur la salle de la Maison des Plaisirs). Le moteur
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
  // La BRAISE : la cire n'a pas pris, Icare n'a jamais décollé — P(C = 1) = edge
  // EXACTEMENT (3 % des vols depuis le lot 1).
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
  // ⭐ Le ciel et l'aviateur de l'ÂGE (plaisirsMaterial.js) : Icare jusqu'au marbre,
  // le ballon à la fonte, le deltaplane au néon, Icare de lumière ensuite.
  const band = usePlaisirsBand();
  const flyer = icarusFlyer(band);
  const [phase, setPhase] = useState('ready');
  // LA MISE LIBRE (lot 1) : des jetons posés sur le tapis, entre les limites de la
  // table. Une table rouverte repart de la dernière mise jouée.
  const [stake, setStake] = useState(() => initialStake('icare', state.faveur || 0));
  const [stakeFaveur, setStakeFaveur] = useState(null); // pour l'aperçu vivant du gain de Faveur
  const [m, setM] = useState(1);
  const [outcome, setOutcome] = useState(null);
  // Horloge 1 Hz : le tick, pas l'instabilité (figée en crise terminale ou une
  // fois convergée — BUG-114). Cagnotte, vols offerts.
  useGameState(() => renderCache.tickNow);
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
      setStakeFaveur(info?.stakeFaveur ?? null);
      setM(icarusMultiplier());
      setPhase('flying');
    } else {
      setStake(initialStake('icare', state.faveur || 0));
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

  // Les sons de la table (audio/tables, lot 11), dans l'aviateur de l'âge.
  useEffect(() => { preparerTable('icare', band); }, [band]);

  // Ticker de vol : anime le multiplicateur et détecte la chute (timer moteur). Le son
  // du vol le suit : une boucle qui monte avec la hauteur, coupée à la fin du vol.
  useEffect(() => {
    if (phase !== 'flying') return undefined;
    tickerRef.current = setInterval(() => {
      if (icarusFlying()) {
        const mm = icarusMultiplier();
        setM(mm);
        volIcare(band, hauteurSon(mm));
      } else {
        const out = icarusLastOutcome();
        stopTicker();
        setOutcome(out);
        if (out?.type === 'crash') { setM(out.crashPoint); setPhase('crashed'); sonIcare(band, 'brule'); }
        else if (out) { setM(out.m); setPhase('landed'); sonIcare(band, 'pose'); }
        else setPhase('ready');
      }
    }, TICK_MS);
    return () => { stopTicker(); finVol(); };
  }, [phase, band]);

  const potFaveur = icarusPotFaveur();
  const history = (state.icarusHistory || []).slice().reverse();
  const flying = phase === 'flying';
  const { max: tableMax } = tableLimits();
  const freeCount = freeFlightCount();
  const freeNext = nextFreeFlight();
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

  // Le décollage : à la mise posée (`amount`, la pile par défaut), ou un vol OFFERT
  // (`free` : la Maison paie la mise du billet). « Même mise » et « Laisser courir »
  // passent par ici.
  const onLaunch = (amount = stake, free = false) => {
    if (!free && (amount <= 0 || faveur < amount)) return;
    const res = free ? launchIcarus(null, { free: true }) : launchIcarus(amount);
    if (!res) return;
    // Mise (ou vol offert) débitée : écrite sous 300 ms, pas à l'autosave des 10 s
    // — tuer le processus sur un vol brûlé ne la rembourse plus (SAV-15).
    saveSoon(300);
    if (!free) { rememberStake('icare', amount); setStake(amount); }
    setStakeFaveur(icarusFlightInfo()?.stakeFaveur ?? amount);
    setOutcome(null);
    setM(1);
    setPhase('flying');
    sonIcare(band, 'envol');
  };
  // Laisser courir : tout le gain du vol (mise rendue comprise) sur le suivant,
  // plafonné à la limite de la table.
  const rideAmount = outcome?.type === 'cashout' ? Math.min(tableMax, outcome.faveur) : 0;

  const onCashOut = () => {
    const out = cashOutIcarus();
    if (!out) return;
    stopTicker();
    setOutcome(out);
    if (out.type === 'crash') { setM(out.crashPoint); setPhase('crashed'); sonIcare(band, 'brule'); }
    else {
      setM(out.m);
      setPhase('landed');
      const palier = celebrerGain({ gain: out.faveur + (out.jackpotFaveur || 0), stake: out.stakeFaveur, game: 'icare' });
      sonIcare(band, 'pose', { gros: Boolean(palier) });
    }
  };

  // Les derniers vols (sur le mur de la table à l'envol, au-dessus du ciel pendant le vol).
  const historyChips = history.length > 0 && (
    <div className="icarus-history" aria-label={tr({ fr: 'Derniers vols', en: 'Last flights' })}>
      {history.map((c, i) => (
        <span key={`${c}-${i}`} className={`icarus-crash-chip ${crashChipTone(c)}`}>×{c < 10 ? c.toFixed(2) : Math.round(c)}</span>
      ))}
    </div>
  );

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
            tr({ fr: 'La cagnotte de la Maison', en: 'The House pot' }),
            tr({ fr: `Nourrie par les autres tables. Se poser à ×${ICARUS_JACKPOT_MULT} ou plus en emporte une part, au prorata de la mise : la mise maximale la rafle entière.`, en: `Fed by the other tables. Landing at ×${ICARUS_JACKPOT_MULT} or more takes a share, pro rata of the stake: the maximum stake sweeps it all.` })
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
              fr: `La mise est libre, jusqu'à la limite de la table (${fmtMise(tableMax)}). La Maison garde 3 % : sur la durée, Icare rend 97 % de ce qu'on mise, quelle que soit la hauteur visée.`,
              en: `The stake is free, up to the table limit (${fmtMise(tableMax)}). The House keeps 3%: over time, Icarus returns 97% of what you stake, whatever height you aim for.`
            })}
          </p>
          <p>
            {tr({
              fr: `Se poser à ×${ICARUS_JACKPOT_MULT} ou plus emporte une part de la cagnotte, au prorata de la mise : ${Math.round(potRakeShare(stake) * 100)} % à ta mise actuelle, tout à la mise maximale. Les vols offerts (Vénus, roue, tickets) se jouent à la mise du coup qui les a gagnés. Après un gain, « Laisser courir » remet tout le gain en jeu.`,
              en: `Landing at ×${ICARUS_JACKPOT_MULT} or more takes a share of the pot, pro rata of the stake: ${Math.round(potRakeShare(stake) * 100)}% at your current stake, all of it at the maximum stake. Free flights (Venus, wheel, tickets) are played at the stake of the throw that won them. After a win, “Let it ride” puts the whole win back in play.`
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la table', en: 'Leave the table' })}>✕</button>
      </div>

      {phase !== 'ready' && historyChips}

      {/* Le ciel ne s'affiche PLUS pendant le choix de mise (retour Raphaël
          2026-07-17 : « supprimer la preview d'Icare ») — il n'apparaît qu'au
          décollage et rend toute sa hauteur aux bandeaux de mise. Au décollage,
          il REMPLIT le cadran (retour Raphaël 2026-07-18 : « le jeu qui prend
          tout le cadran ») et porte la commande SE POSER en surimpression. */}
      {phase !== 'ready' && (
      <div className={`icarus-sky${phase === 'crashed' ? ' is-crashed' : ''}${outcome?.jackpotFaveur ? ' is-jackpot' : ''}`} style={{ background: icarusSkyCss(band) }}>
        {/* Le halo qui respire, peint une fois sur deux calques dont seule
            l'opacité s'anime (audit 2026-10-05, PERF-65) ; l'embrasement de la
            chute garde son propre filtre, sur le soleil. */}
        {phase !== 'crashed' && (
          <>
            <i className="icarus-sun-halo is-repos" aria-hidden="true" />
            <i className="icarus-sun-halo is-eclat" aria-hidden="true" />
          </>
        )}
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
            <img src={flyer.src} alt="" className={flyer.glow ? 'is-light' : undefined} />
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

      {/* ⭐ L'ENVOL SUR LA TABLE DE L'ÂGE (2026-10-03, plaisirs/PlaisirsTable.jsx) :
          l'hôtesse derrière sa table, les trois mises posées sur le tapis. Le ciel
          reste la scène du vol. */}
      {phase === 'ready' && (
        <PlaisirsTable game="icare" className="ptable--bet ptable--mise ptable--icare" tablePx={260} nSpots={1}>
          {(L) => (
            <>
              <div className="ptable-hud">
                {historyChips}
              </div>
              <TableMise
                game="icare"
                x={L.spots[0]}
                y={L.spotY}
                k={L.k}
                rackY={L.floor + 6}
                stake={stake}
                onStake={setStake}
                faveur={faveur}
                playLabel={tr({ fr: "S'envoler", en: 'Take flight' })}
                onPlay={() => onLaunch()}
              >
                {/* Les vols OFFERTS : la Maison paie la mise du billet. */}
                {freeCount > 0 && (
                  <button
                    type="button"
                    className="icarus-free-launch"
                    onClick={() => onLaunch(0, true)}
                    {...tipProps(tr({ fr: 'Vol offert', en: 'Free flight' }), tr({ fr: `La Maison paie la mise : ${fmtMise(freeNext)} Faveur.`, en: `The House pays the stake: ${fmtMise(freeNext)} Favor.` }))}
                  >
                    🪽 {tr({ fr: 'Vol offert', en: 'Free flight' })} ({fmtMise(freeNext)}){freeCount > 1 ? ` ×${freeCount}` : ''}
                  </button>
                )}
              </TableMise>
            </>
          )}
        </PlaisirsTable>
      )}

      {phase === 'landed' && outcome && (
        <>
          {/* La rafle est au prorata de la mise : « CAGNOTTE RAFLÉE » ne se dit que si
              la mise emporte VRAIMENT tout, sinon la bannière ment (et c'est le seul
              endroit où le joueur voit ce que sa mise lui a acheté). */}
          {outcome.jackpotFaveur && (
            <p className="icarus-jackpot-banner"><PotIcon /> +{fmt(outcome.jackpotFaveur)} {tr({ fr: 'faveur', en: 'favor' })}</p>
          )}
          <p className="icarus-result icarus-result--win">
            +<Monte value={outcome.faveur} /> {tr({ fr: 'faveur', en: 'favor' })} <span className="icarus-result-sub">(×{outcome.m.toFixed(2)})</span>
          </p>
          <p className="icarus-reveal">{nearMiss ? '🔥' : '☀'} ×{outcome.crashPoint.toFixed(2)}</p>
          {/* Rejeu DIRECT (phase 7) : « Revoler » relance à la mise mémorisée au lieu
              de renvoyer à l'écran de choix — le clic mort comptait le plus ici, le
              seul jeu du temple qui se rejoue en rafale sur un tronc plein. */}
          <menu className="choice-menu icarus-actions">
            <button type="button" className="icarus-launch ptable-ride" disabled={rideAmount <= 0 || faveur < rideAmount} onClick={() => onLaunch(rideAmount)}>
              {tr({ fr: `Laisser courir (${fmtMise(rideAmount)})`, en: `Let it ride (${fmtMise(rideAmount)})` })}
            </button>
            <button type="button" className="icarus-launch" disabled={faveur < stake} onClick={() => onLaunch()}>
              {tr({ fr: `Même mise (${fmtMise(stake)})`, en: `Same bet (${fmtMise(stake)})` })}
            </button>
            <button type="button" onClick={() => { setPhase('ready'); setOutcome(null); setM(1); }}>
              {tr({ fr: 'Changer de mise', en: 'Change stake' })}
            </button>
            <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter la table', en: 'Leave the table' })}</button>
          </menu>
        </>
      )}

      {phase === 'crashed' && outcome && (
        <>
          <p className="icarus-result icarus-result--burn">
            {tr({ fr: `Brûlé à ×${outcome.crashPoint.toFixed(2)}`, en: `Burnt at ×${outcome.crashPoint.toFixed(2)}` })}
          </p>
          {almost && (
            <p className="icarus-reveal">
              <span className="icarus-knife">−1 s : +{fmt(almost.faveur)} {tr({ fr: 'faveur', en: 'favor' })} (×{almost.m.toFixed(2)})</span>
            </p>
          )}
          <menu className="choice-menu icarus-actions">
            <button type="button" className="icarus-launch" disabled={faveur < stake} onClick={() => onLaunch()}>
              {tr({ fr: `Même mise (${fmtMise(stake)})`, en: `Same bet (${fmtMise(stake)})` })}
            </button>
            <button type="button" onClick={() => { setPhase('ready'); setOutcome(null); setM(1); }}>
              {tr({ fr: 'Changer de mise', en: 'Change stake' })}
            </button>
            <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter la table', en: 'Leave the table' })}</button>
          </menu>
        </>
      )}
    </div>
  );
}
