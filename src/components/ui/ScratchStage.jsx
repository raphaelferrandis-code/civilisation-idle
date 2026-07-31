import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state, save } from '../../game/core/state.js';
import {
  playScratch,
  scratchStakes,
  scratchPayout,
  icarusPotFaveur
} from '../../game/core/actions.js';
import { SCRATCH_PRIZES, SCRATCH_REVEAL_PCT, SCRATCH_SUN_FLIGHT, ICARUS_STAKES, STYLET_RADIUS_STEP } from '../../game/core/balance.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import { clampStakeMult } from '../../game/core/actions/templePot.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon, PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import CoffreSelect from './CoffreSelect.jsx';
import StageHelp from './StageHelp.jsx';

// Flamme votive du vernis (dessinée AU CANVAS — un <img> n'y entre pas).
// Préchargée au module, gardée nulle hors navigateur (tests node).
const FLAME_IMG = typeof Image !== 'undefined' ? new Image() : null;
if (FLAME_IMG) FLAME_IMG.src = '/pixelart/ui/faveur/flamme.png';
import ScratchCanvas from './ScratchCanvas.jsx';
import { scratchSymbolSrc } from './scratchSymbols.js';

// Symbole d'un ticket = icône pixel-art réutilisée du jeu (scratchSymbols.js),
// rendue nette (image-rendering: pixelated). Décoratif → aria-hidden.
function Sym({ name, cls }) {
  return (
    <img
      className={`scratch-sym${cls ? ' ' + cls : ''}`}
      src={scratchSymbolSrc(name)}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}

/**
 * Les tickets à gratter — SCÈNE INTÉGRÉE (bas de la page Régulation, comme
 * osselets/Icare). Le moteur (actions/scratch.js) tire l'issue et fige la grille
 * À L'ACHAT, mais l'EFFET est différé jusqu'à ce que le joueur ait vraiment
 * GRATTÉ le vernis (auto-révélation à SCRATCH_REVEAL_PCT %, ou bouton « Tout
 * révéler »). Phases : achat (choix de la mise) → grattage → résultat. Fermer
 * ou changer de cycle en plein grattage flush l'effet (la mise est déjà payée).
 */

// Symboles gagnants (hors « blank ») pour la légende des lots.
const WIN_PRIZES = SCRATCH_PRIZES.filter((p) => p.symbol !== 'blank');

/* Vernis PAR MISE — calqué sur les vraies gammes de tickets à gratter : le
   premier prix a un latex argenté nu, le milieu une cire dorée frappée de
   flammes votives, le haut de gamme un vernis pourpre pailleté d'or. Le rayon
   de grattage suit : large et facile sur l'Obole, fin et minutieux sur le
   Talent. Procédural (same-origin → getImageData jamais tainted), coords
   entières (DA pixel).

   ⚠ Rayons divisés par deux le 2026-07-17 (26/22/17 → 13/11/9). Le ticket fait
   320×320 (cf. .scratch-ticket) et la grille 3×3, donc ~107 px par case : un rayon
   de 26 balayait 52 px de large, soit ~23 % du vernis PAR PASSE en diagonale. Trois
   coups de souris et le ticket était révélé — on ne découvrait jamais case par case,
   le grattage était un interrupteur et pas un geste. À 13, une passe fait ~12 % : il
   faut viser les alvéoles, et les trois vernis procéduraux se voient enfin. Le
   dégressif obole → talent est CONSERVÉ (le haut de gamme reste le plus minutieux). */
const SCRATCH_RADIUS = { obole: 13, drachme: 11, talent: 9 };

// Grain pixel 3×3 déterministe partagé (mêmes seuils que l'ancienne cire).
function foilGrain(ctx, w, h, light, dark) {
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const n = (x * 7 + y * 13 + (x * y) % 5) % 19;
      if (n < 4) { ctx.fillStyle = light; ctx.fillRect(x, y, 3, 3); }
      else if (n > 15) { ctx.fillStyle = dark; ctx.fillRect(x, y, 3, 3); }
    }
  }
}

function foilLabel(ctx, w, h, color) {
  ctx.fillStyle = color;
  ctx.font = '700 20px "Pixelify Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // tr() résolu à la peinture (un changement de langue recharge la page, cf. i18n.js).
  const label = tr({ fr: 'GRATTEZ', en: 'SCRATCH' });
  ctx.fillText(label, Math.round(w / 2), Math.round(h / 2));
  return label;
}

// Obole — latex argenté du ticket de kiosque : gris nu, pointillés « découpez
// ici », rien d'autre.
function paintFoilObole(ctx, w, h) {
  ctx.fillStyle = '#a8adb5';
  ctx.fillRect(0, 0, w, h);
  foilGrain(ctx, w, h, 'rgba(236,239,243,0.30)', 'rgba(70,76,86,0.26)');
  ctx.strokeStyle = 'rgba(52,58,66,0.38)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.setLineDash([]);
  foilLabel(ctx, w, h, 'rgba(52,58,66,0.62)');
}

// Drachme — la cire dorée du temple, flammes votives de part et d'autre.
function paintFoilDrachme(ctx, w, h) {
  ctx.fillStyle = '#b98a34';
  ctx.fillRect(0, 0, w, h);
  foilGrain(ctx, w, h, 'rgba(255,232,170,0.22)', 'rgba(70,45,15,0.24)');
  const label = foilLabel(ctx, w, h, 'rgba(58,38,10,0.55)');
  // L'image est déjà en cache (compteur de Faveur du panneau) ; si elle tarde,
  // le vernis reste texte nu.
  if (FLAME_IMG && FLAME_IMG.complete && FLAME_IMG.naturalWidth) {
    const half = Math.round(ctx.measureText(label).width / 2);
    const ih = 16, iw = Math.round(ih * (FLAME_IMG.naturalWidth / FLAME_IMG.naturalHeight));
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(FLAME_IMG, Math.round(w / 2) - half - iw - 9, Math.round(h / 2 - ih / 2), iw, ih);
    ctx.drawImage(FLAME_IMG, Math.round(w / 2) + half + 9, Math.round(h / 2 - ih / 2), iw, ih);
    ctx.globalAlpha = 1;
  }
}

// Talent — vernis pourpre impérial pailleté d'éclats d'or (le « holographique »
// des tickets chers), filets d'or en tête et pied.
function paintFoilTalent(ctx, w, h) {
  ctx.fillStyle = '#3d2752';
  ctx.fillRect(0, 0, w, h);
  foilGrain(ctx, w, h, 'rgba(126,84,168,0.26)', 'rgba(18,8,34,0.32)');
  // Éclats : petites étoiles 4 branches semées déterministiquement (hash de
  // Knuth — un pas linéaire s'alignait en écharpe diagonale).
  for (let i = 0; i < 46; i++) {
    const hsh = (i * 2654435761) >>> 0;
    const x = (hsh % (w - 12)) + 6;
    const y = ((hsh >>> 12) % (h - 12)) + 6;
    const s = 1 + (i % 3); // 1..3 px de branche
    const a = 0.35 + ((i * 41) % 50) / 100; // 0.35..0.84
    ctx.fillStyle = `rgba(240,205,110,${a.toFixed(2)})`;
    ctx.fillRect(x - s, y, s * 2 + 1, 1);
    ctx.fillRect(x, y - s, 1, s * 2 + 1);
    if (s > 2) { ctx.fillStyle = 'rgba(255,240,190,0.9)'; ctx.fillRect(x, y, 1, 1); }
  }
  ctx.fillStyle = 'rgba(232,193,90,0.75)';
  ctx.fillRect(10, 12, w - 20, 2);
  ctx.fillRect(10, h - 14, w - 20, 2);
  // Libellé or sur ombre pourpre (lisibilité sur le grain).
  ctx.font = '700 20px "Pixelify Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = tr({ fr: 'GRATTEZ', en: 'SCRATCH' });
  ctx.fillStyle = 'rgba(18,8,34,0.8)';
  ctx.fillText(label, Math.round(w / 2) + 1, Math.round(h / 2) + 1);
  ctx.fillStyle = 'rgba(240,205,110,0.92)';
  ctx.fillText(label, Math.round(w / 2), Math.round(h / 2));
}

const FOILS = { obole: paintFoilObole, drachme: paintFoilDrachme, talent: paintFoilTalent };

export default function ScratchStage({ table, onClose }) {
  const [phase, setPhase] = useState('buy');
  // Aucun ticket choisi au départ (sketch Raph 2026-07-17 : « le bouton de jeu
  // n'apparaît que quand la mise est sélectionnée ») — le bouton Acheter reste
  // masqué tant qu'on n'a pas cliqué un choix.
  const [chosenStake, setChosenStake] = useState(null);
  // La puissance de mise du coffre (×1, ×10…), re-clampée au rendu ET au moteur.
  const [coffreMult, setCoffreMult] = useState(1);
  const [outcome, setOutcome] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [ticketNonce, setTicketNonce] = useState(0);
  const pendingRef = useRef(null); // apply() différé du ticket en cours
  const outcomeRef = useRef(null); // le résultat brut (apply le peuple sur place)
  useGameState((s) => s.instability); // or, cagnotte, mises vivants (1 Hz)
  const cycles = useGameState((s) => s.cycles);

  // Nouvelle ouverture de la scène : flush un éventuel ticket en suspens et
  // repartir à l'achat.
  useEffect(() => {
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
    outcomeRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remise à zéro VOULUE de la scène à chaque réouverture (openedAt)
    setPhase('buy');
    setChosenStake(null);
    setOutcome(null);
    setRevealed(false);
  }, [table?.openedAt]);

  // Démontage : un ticket acheté mais non gratté DOIT se résoudre (mise payée).
  useEffect(() => () => {
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
  }, []);

  // F5 / fermeture d'onglet pendant un ticket non gratté : un rechargement
  // n'exécute AUCUN cleanup React — la mise payée restait sans issue (M4).
  // save() explicite : la sauvegarde de sortie de main.js est enregistrée AVANT
  // ce handler, elle est donc déjà passée quand le flush mute l'état.
  useEffect(() => {
    const flushOnExit = () => {
      if (!pendingRef.current) return;
      pendingRef.current();
      pendingRef.current = null;
      save();
    };
    window.addEventListener('pagehide', flushOnExit);
    window.addEventListener('beforeunload', flushOnExit);
    return () => {
      window.removeEventListener('pagehide', flushOnExit);
      window.removeEventListener('beforeunload', flushOnExit);
    };
  }, []);

  // Effondrement pendant le grattage : la scène se referme (nouveau cycle).
  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  // Révélation : applique l'effet (crédite la Faveur / nourrit la cagnotte),
  // découvre la grille et passe au résultat. Stable (refs + setters).
  const reveal = useCallback(() => {
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
    if (outcomeRef.current) setOutcome({ ...outcomeRef.current });
    setRevealed(true);
    setPhase('done');
  }, []);

  // Feuille à gratter du ticket COURANT (une par mise, cf. FOILS). Stable :
  // lit outcomeRef (posé par onBuy AVANT l'incrément du nonce qui repeint).
  // LE COIN DÉCOLLÉ (artefact) : une case arrive déjà dégagée — un trou est poinçonné
  // dans le vernis à la peinture. Info PURE : la grille est peinte APRÈS le tirage
  // (scratchGrid est cosmétique), dévoiler une case ne change rien à l'issue. La
  // case est déterministe par ticket (le nonce), pas re-tirée à chaque repaint
  // (ResizeObserver repeint : un Math.random ici ferait sauter le trou).
  const ticketNonceRef = useRef(0);
  const drawFoil = useCallback((ctx, w, h) => {
    const paint = FOILS[outcomeRef.current?.stakeId] || paintFoilDrachme;
    paint(ctx, w, h);
    if (hasTempleArtifact('coin')) {
      const cell = (ticketNonceRef.current * 7 + 3) % 9;
      const col = cell % 3, row = Math.floor(cell / 3);
      const cw = w / 3, ch = h / 3;
      // destination-out efface au prorata de l'ALPHA de la source : si le peintre
      // de vernis a laissé un fillStyle ou un globalAlpha transparents, le poinçon
      // n'efface RIEN. On repart d'un état opaque, toujours.
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(col * cw + cw / 2, row * ch + ch / 2, cw * 0.38, ch * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, []);

  const stakes = scratchStakes();
  const pot = icarusPotFaveur();
  const history = (state.scratchHistory || []).slice().reverse();
  const chosen = stakes.find((s) => s.id === chosenStake) || stakes[0];
  const effMult = clampStakeMult(coffreMult); // parité stricte avec le moteur
  const chosenCost = chosen ? chosen.faveur * effMult : 0;

  const startTicket = (res) => {
    // Défense en profondeur : un ticket encore en attente d'application ne doit
    // pas être écrasé sans avoir crédité (apply est idempotent — cf. reveal).
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
    pendingRef.current = res.apply;
    outcomeRef.current = res;
    setOutcome(res);
    setRevealed(false);
    setTicketNonce((n) => { ticketNonceRef.current = n + 1; return n + 1; });
    setPhase('scratch');
  };

  // L'achat part sur le ticket SÉLECTIONNÉ (chosen) : le bouton Acheter et le
  // « Reprendre un ticket » de résultat appellent tous onBuy() sans argument.
  const onBuy = () => {
    if (!chosen || (state.faveur || 0) < chosenCost) return;
    const res = playScratch(chosen.id, { defer: true, stakeMult: effMult });
    if (!res) return;
    startTicket(res);
  };

  // L'OFFRANDE RECOPIÉE (artefact) : rejouer un ticket perdant, la CELLA paie la
  // mise (transfert strict : couverture entière ou rien — cf. playScratch). Une
  // seule relance par ticket, et jamais d'une relance elle-même (outcome.potFunded).
  // La relance rejoue LE MÊME ticket, coffre compris : le multiplicateur est
  // relu sur la mise réellement payée (pas sur le sélecteur, qui a pu changer).
  const onReplay = () => {
    if (!outcome || outcome.win || outcome.potFunded) return;
    const base = stakes.find((s) => s.id === outcome.stakeId);
    const multUsed = base ? Math.max(1, Math.round((outcome.stakeFaveur || base.faveur) / base.faveur)) : 1;
    const res = playScratch(outcome.stakeId, { defer: true, potFunded: true, stakeMult: multUsed });
    if (!res) return;
    startTicket(res);
  };
  const canReplay = Boolean(
    outcome && !outcome.win && !outcome.potFunded
    && hasTempleArtifact('relance')
    && Math.floor(pot) >= (outcome.stakeFaveur || 0)
  );

  const onNewTicket = () => {
    // Le ticket courant est déjà appliqué (reveal a flush) : on repart à l'achat,
    // sans mise pré-choisie (le bouton Acheter réapparaîtra au clic d'un choix).
    outcomeRef.current = null;
    setChosenStake(null);
    setOutcome(null);
    setRevealed(false);
    setPhase('buy');
  };

  // Le gain d'un ticket est le SEUL gain de cette table depuis que le Soleil ne
  // rafle plus (2026-07-17) : plus de jackpotFaveur à additionner.
  const totalFaveur = outcome ? outcome.faveurGain : 0;
  // Libellé de la mise du vol qu'offre le Soleil (elle suit celle du ticket).
  const sunStakeLabel = (ICARUS_STAKES.find((s) => s.id === SCRATCH_SUN_FLIGHT[outcome?.stakeId]) || ICARUS_STAKES[0]).label;

  const ticket = (phase === 'scratch' || phase === 'done') && outcome && (
    <div className={`scratch-ticket scratch-ticket--${outcome.stakeId}${revealed ? ' is-revealed' : ''}`}>
      <div className="scratch-grid" aria-hidden={phase === 'scratch' && !revealed ? 'true' : undefined}>
        {(outcome.grid || []).map((sym, i) => (
          <span
            key={i}
            className={`scratch-cell${revealed && outcome.win && sym === outcome.symbol ? ' is-win' : ''}`}
          >
            {sym ? <Sym name={sym} /> : null}
          </span>
        ))}
      </div>
      <ScratchCanvas
        nonce={ticketNonce}
        radius={(SCRATCH_RADIUS[outcome.stakeId] || 11) + (state.styletLevel || 0) * STYLET_RADIUS_STEP}
        threshold={SCRATCH_REVEAL_PCT}
        onReveal={reveal}
        drawFoil={drawFoil}
        disabled={revealed}
      />
    </div>
  );

  return (
    <div className="scratch-stage">
      <div className="regul-block-title stage-title">
        {/* Nom du jeu retiré (retour Raphaël 2026-07-17 : « plus de nom en tête ») —
            la ligne ne garde que le pot, l'aide et la fermeture, alignés à droite. */}
        {/* Cette table NOURRIT le pot et ne le reprend jamais : dit en infobulle
            (le laïus inline mangeait la ligne de titre — passe densité 2026-07-17). */}
        <span
          className="scratch-stage-pot"
          {...tipProps(
            tr({ fr: 'La cagnotte du temple', en: 'The temple pot' }),
            tr({ fr: 'Tes tickets perdants la nourrissent ; cette table ne la reprend jamais. Elle se rafle au Vol d’Icare, à ×10 et plus.', en: 'Your losing tickets feed it; this table never takes it back. It is swept at the Flight of Icarus, at ×10 and above.' })
          )}
        >
          <PotIcon /> <strong>{fmt(pot)}</strong> {tr({ fr: 'en cagnotte', en: 'in the pot' })}
        </span>
        <StageHelp>
          <p>
            {tr({
              fr: 'Découvre 3 symboles identiques sous le vernis pour gagner de la Faveur. Trois Vénus offrent une Plume, trois Soleils un vol à la mise de ton ticket.',
              en: 'Reveal 3 matching symbols under the varnish to win Favor. Three Venus grant a Feather, three Suns a flight at your ticket’s stake.'
            })}
          </p>
          <div className="scratch-legend" aria-label={tr({ fr: 'Table des lots', en: 'Prize table' })}>
            {WIN_PRIZES.map((p) => (
              <span key={p.symbol} className="scratch-legend-item">
                <b><Sym name={p.symbol} cls="scratch-sym-sm" />×3</b>
                {`+${fmt(scratchPayout(p.symbol, chosen ? chosen.faveur * effMult : 0))}`}
                {p.sunFlight || p.freeFlight ? ' 🪽' : ''}
              </span>
            ))}
          </div>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}>✕</button>
      </div>

      {history.length > 0 && (
        <div className="scratch-history" aria-label={tr({ fr: 'Derniers tickets', en: 'Last tickets' })}>
          {history.map((sym, i) => (
            <span key={`${sym}-${i}`} className={`scratch-chip${sym === 'blank' ? ' is-blank' : ' is-win'}`}>
              {sym === 'blank' ? '·' : <Sym name={sym} cls="scratch-sym-sm" />}
            </span>
          ))}
        </div>
      )}

      {phase === 'buy' && (
        <>
          <CoffreSelect value={effMult} onChange={setCoffreMult} />
          <div className="scratch-stakes">
            {stakes.map((s) => {
              const cost = s.faveur * effMult;
              const cantPay = (state.faveur || 0) < cost;
              const chosen = chosenStake === s.id;
              return (
                // Le bouton d'achat n'apparaît QUE dans le ticket choisi, cousu au pied
                // de SA colonne (retour Raph 2026-07-17 : « dans le cadre de la mise
                // choisie »).
                <div
                  key={s.id}
                  className={`scratch-stake${chosen ? ' is-chosen' : ''}${cantPay ? ' is-broke' : ''}`}
                >
                  <button
                    type="button"
                    className="stake-pick"
                    onClick={() => setChosenStake(s.id)}
                    {...tipProps(tr(s.label), tr({ fr: `Ticket à ${cost} Faveur. Les lots sont des multiples de la mise.`, en: `${cost} Favor ticket. Prizes are multiples of the stake.` }))}
                  >
                    <strong>{tr(s.label)}</strong>
                    <span><FaveurIcon /> {fmt(cost)}</span>
                  </button>
                  {chosen && (
                    <button type="button" className="scratch-buy stake-play" disabled={(state.faveur || 0) < chosenCost} onClick={() => onBuy()}>
                      {tr({ fr: 'Acheter le ticket', en: 'Buy the ticket' })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {phase === 'scratch' && (
        <>
          {ticket}
          <p className="scratch-hint">{tr({ fr: 'Gratte le vernis avec la souris ou le doigt…', en: 'Scratch the varnish with the mouse or finger…' })}</p>
          <menu className="choice-menu scratch-actions">
            <button type="button" className="scratch-reveal-all" onClick={reveal}>
              {tr({ fr: 'Tout révéler', en: 'Reveal all' })}
            </button>
          </menu>
        </>
      )}

      {phase === 'done' && outcome && (
        <>
          {ticket}
          {/* Le Soleil n'ouvre plus la cagnotte, il ouvre le CIEL : il renvoie à Icare
              avec un billet à la hauteur du ticket. La promesse doit être aussi forte
              que l'ancienne, et elle est plus juste : un magot tiré au sort devient
              17 secondes de nerf à tenir soi-même. */}
          {outcome.sunFlight ? (
            <p className="scratch-jackpot-banner">☀ {tr({ fr: 'LE SOLEIL T’OUVRE LE CIEL', en: 'THE SUN OPENS THE SKY' })} : {tr({ fr: `vol d’Icare offert, mise « ${tr(sunStakeLabel)} »`, en: `free Icarus flight, ${tr(sunStakeLabel)} stake` })}</p>
          ) : null}
          {outcome.win ? (
            <p className="scratch-result scratch-result--win">
              +{fmt(totalFaveur)} {tr({ fr: 'faveur', en: 'favor' })}
              {outcome.freeFlight && <span className="scratch-result-sub"> · 🪽 {tr({ fr: "vol d'Icare offert", en: 'free Icarus flight' })}</span>}
            </p>
          ) : (
            <p className="scratch-result scratch-result--lose">
              {tr({ fr: 'Vernis nu. La mise va à la cagnotte du temple.', en: 'Bare varnish. The stake goes to the temple pot.' })}
            </p>
          )}
          <menu className="choice-menu scratch-actions">
            {canReplay && (
              <button
                type="button"
                className="scratch-replay"
                {...tipProps(null, tr({ fr: 'L’offrande recopiée : le trésor du temple paie la mise du même ticket, une fois. Il doit la couvrir en entier.', en: 'The copied offering: the temple hoard pays the same ticket’s stake, once. It must cover it in full.' }))}
                onClick={onReplay}
              >
                {tr({ fr: `La cella rejoue le ticket (${fmt(outcome.stakeFaveur)})`, en: `The cella replays the ticket (${fmt(outcome.stakeFaveur)})` })}
              </button>
            )}
            {/* Rejeu DIRECT (phase 7) : la mise est mémorisée, on rachète sans détour. */}
            <button
              type="button"
              className="scratch-buy"
              disabled={!chosen || (state.faveur || 0) < chosenCost}
              onClick={() => { outcomeRef.current = null; onBuy(); }}
            >
              {tr({ fr: `Reprendre un ticket (${fmt(chosenCost)})`, en: `Take another ticket (${fmt(chosenCost)})` })}
            </button>
            <button type="button" onClick={onNewTicket}>
              {tr({ fr: 'Changer de mise', en: 'Change stake' })}
            </button>
            <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter le temple', en: 'Leave the temple' })}</button>
          </menu>
        </>
      )}
    </div>
  );
}
