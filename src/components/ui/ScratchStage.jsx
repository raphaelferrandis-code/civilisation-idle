import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state, save, saveSoon } from '../../game/core/state.js';
import {
  playScratch,
  scratchPayout,
  scratchOdds,
  icarusPotFaveur
} from '../../game/core/actions.js';
import { SCRATCH_PRIZES, SCRATCH_REVEAL_PCT, STYLET_RADIUS_STEP } from '../../game/core/balance.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { fmt } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { celebrerGain } from '../../game/core/grandsGains.js';
import { PotIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import { usePlaisirsBand, ticketFace, TICKET_GRID } from './plaisirsMaterial.js';
import PlaisirsTable from '../views/plaisirs/PlaisirsTable.jsx';
import TableMise from '../views/plaisirs/TableMise.jsx';
import { initialStake, rememberStake, fmtMise } from '../views/plaisirs/miseMemory.js';
import Monte from './Monte.jsx';

// Flamme votive du vernis (dessinée AU CANVAS — un <img> n'y entre pas).
// Préchargée au module, gardée nulle hors navigateur (tests node).
const FLAME_IMG = typeof Image !== 'undefined' ? new Image() : null;
if (FLAME_IMG) FLAME_IMG.src = '/pixelart/ui/faveur/flamme.png';
import ScratchCanvas from './ScratchCanvas.jsx';
import { scratchSymbolSrc } from './scratchSymbols.js';

// LE MÉTAL DU TICKET suit la mise (lot 1 des gains « vrai casino », mise libre) :
// bronze sous le dixième de la limite de la table, argent jusqu'à la moitié, or
// au-delà. Les trois habits du ticket (liseré, vernis, rayon du grattoir) restent
// ceux des anciennes mises fixes — obole, drachme, talent.
function ticketTier(stakeFaveur) {
  const { max } = tableLimits();
  const r = (stakeFaveur || 0) / Math.max(1, max);
  return r < 0.1 ? 'obole' : r < 0.5 ? 'drachme' : 'talent';
}

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
  // L'âge de la Maison : la face du ticket suit sa matière.
  const band = usePlaisirsBand();
  const [phase, setPhase] = useState('buy');
  // LA MISE LIBRE : le prix du ticket, en jetons. Une table rouverte repart de la
  // dernière mise jouée.
  const [stake, setStake] = useState(() => initialStake('tickets', state.faveur || 0));
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
    setStake(initialStake('tickets', state.faveur || 0));
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
    const fresh = Boolean(pendingRef.current);
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
    if (outcomeRef.current) setOutcome({ ...outcomeRef.current });
    // Le gros lot se fête à la révélation (une fois : le ticket déjà crédité ne rejoue rien).
    const o = outcomeRef.current;
    if (fresh && o && o.win) celebrerGain({ gain: o.faveurGain, stake: o.stakeFaveur, game: 'tickets' });
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
    const paint = FOILS[ticketTier(outcomeRef.current?.stakeFaveur)] || paintFoilDrachme;
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

  const pot = icarusPotFaveur();
  const history = (state.scratchHistory || []).slice().reverse();
  const { max: tableMax } = tableLimits();
  const faveur = state.faveur || 0;

  const startTicket = (res) => {
    // La mise vient d'être débitée (Faveur ou cella) : écrite sous 300 ms et non à
    // l'autosave des 10 s — tuer le processus après avoir gratté un perdant ne la
    // rembourse plus (audit 2026-10-05, SAV-15). Le délai fusionne les achats
    // rapprochés en une seule sérialisation.
    saveSoon(300);
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

  // L'achat, à la mise posée (`amount`, la pile par défaut) : le bouton Acheter,
  // « Même mise » et « Laisser courir » passent par ici.
  const onBuy = (amount = stake) => {
    if (amount <= 0 || (state.faveur || 0) < amount) return;
    const res = playScratch(amount, { defer: true });
    if (!res) return;
    rememberStake('tickets', res.stakeFaveur);
    setStake(res.stakeFaveur);
    startTicket(res);
  };

  // L'OFFRANDE RECOPIÉE (artefact) : rejouer un ticket perdant, la CELLA paie la
  // mise (transfert strict : couverture entière ou rien — cf. playScratch). Une
  // seule relance par ticket, et jamais d'une relance elle-même (outcome.potFunded).
  // La relance rejoue LE MÊME ticket, à la mise réellement payée.
  const onReplay = () => {
    if (!outcome || outcome.win || outcome.potFunded) return;
    const res = playScratch(outcome.stakeFaveur, { defer: true, potFunded: true });
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
    // la pile garde la dernière mise.
    outcomeRef.current = null;
    setOutcome(null);
    setRevealed(false);
    setPhase('buy');
  };

  // Le gain d'un ticket est le SEUL gain de cette table (elle ne rafle jamais).
  const totalFaveur = outcome ? outcome.faveurGain : 0;
  const tier = ticketTier(outcome?.stakeFaveur);
  // Laisser courir : tout le gain du ticket sur le suivant, plafonné à la limite.
  const rideAmount = outcome && outcome.win ? Math.min(tableMax, totalFaveur) : 0;

  const ticket = (phase === 'scratch' || phase === 'done') && outcome && (
    <div
      className={`scratch-ticket scratch-ticket--${tier}${revealed ? ' is-revealed' : ''}`}
      // La face du ticket, peinte à la matière de l'âge (plaisirsMaterial.js) : les
      // planches `ui/scratch/ticket-*.png` n'ont jamais existé. Plus de calque
      // sombre sous la face (l'ancien --ticket-dark, toujours posé à 0 %, a disparu).
      style={{ '--ticket-art': `url("${ticketFace(band, tier)}")`, '--tgrid-pad': TICKET_GRID.pad, '--tgrid-gap': TICKET_GRID.gap }}
    >
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
        radius={(SCRATCH_RADIUS[tier] || 11) + (state.styletLevel || 0) * STYLET_RADIUS_STEP}
        threshold={SCRATCH_REVEAL_PCT}
        onReveal={reveal}
        drawFoil={drawFoil}
        disabled={revealed}
      />
    </div>
  );

  // Les derniers tickets (sur le mur, en haut à gauche de la table).
  const historyChips = history.length > 0 && (
    <div className="scratch-history" aria-label={tr({ fr: 'Derniers tickets', en: 'Last tickets' })}>
      {history.map((sym, i) => (
        <span key={`${sym}-${i}`} className={`scratch-chip${sym === 'blank' ? ' is-blank' : ' is-win'}`}>
          {sym === 'blank' ? '·' : <Sym name={sym} cls="scratch-sym-sm" />}
        </span>
      ))}
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
            tr({ fr: 'La cagnotte de la Maison', en: 'The House pot' }),
            tr({ fr: 'Tes tickets la nourrissent ; cette table ne la reprend jamais. Elle se rafle au Vol d’Icare, à ×10 et plus.', en: 'Your tickets feed it; this table never takes it back. It is swept at the Flight of Icarus, at ×10 and above.' })
          )}
        >
          <PotIcon /> <strong>{fmt(pot)}</strong> {tr({ fr: 'en cagnotte', en: 'in the pot' })}
        </span>
        <StageHelp>
          <p>
            {tr({
              fr: `Le prix du ticket est ta mise, jusqu'à la limite de la table (${fmtMise(tableMax)}). Découvre 3 symboles identiques sous le vernis : les lots sont des multiples de la mise. Trois Vénus offrent aussi un vol d'Icare ; trois Soleils, le gros lot. C'est la loterie de la Maison : un ticket sur quatre gagne, et elle rend 75 % sur la durée.`,
              en: `The ticket price is your stake, up to the table limit (${fmtMise(tableMax)}). Reveal 3 matching symbols under the varnish: prizes are multiples of the stake. Three Venus also grant an Icarus flight; three Suns, the jackpot. It is the House lottery: one ticket in four wins, and it returns 75% over time.`
            })}
          </p>
          <div className="scratch-legend" aria-label={tr({ fr: 'Table des lots', en: 'Prize table' })}>
            {WIN_PRIZES.map((p) => (
              <span key={p.symbol} className="scratch-legend-item">
                <b><Sym name={p.symbol} cls="scratch-sym-sm" />×3</b>
                {`+${fmt(scratchPayout(p.symbol, stake))}`}
                {p.freeFlight ? ' 🪽' : ''}
                <small>{` 1/${fmt(Math.round(1 / Math.max(1e-9, scratchOdds(p.symbol))))}`}</small>
              </span>
            ))}
          </div>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la table', en: 'Leave the table' })}>✕</button>
      </div>

      {/* ⭐ LA TABLE DE L'ÂGE (2026-10-03, plaisirs/PlaisirsTable.jsx) : le guichetier
          derrière son comptoir ; les tickets posés SUR le comptoir, celui qu'on gratte
          devant soi. */}
      {phase === 'buy' && (
        <PlaisirsTable game="tickets" className="ptable--bet ptable--mise" tablePx={250} nSpots={1}>
          {(L) => (
            <>
              <div className="ptable-hud">
                {historyChips}
              </div>
              <TableMise
                game="tickets"
                x={L.spots[0]}
                y={L.spotY}
                k={L.k}
                rackY={L.floor + 6}
                stake={stake}
                onStake={setStake}
                faveur={faveur}
                playLabel={tr({ fr: 'Acheter le ticket', en: 'Buy the ticket' })}
                onPlay={() => onBuy()}
              />
            </>
          )}
        </PlaisirsTable>
      )}

      {(phase === 'scratch' || (phase === 'done' && outcome)) && (
        <PlaisirsTable game="tickets" className="ptable--ticket" tablePx={300} marks={false}>
          {(L) => (
            <>
              <div className="ptable-hud">{historyChips}</div>
              {/* Le ticket, posé sur le comptoir devant soi. */}
              <div className="ptable-ticket" style={{ top: Math.max(8, L.top - 70) }}>{ticket}</div>
              <div className="ptable-side" style={{ top: L.top + 4 }}>
                {phase === 'scratch' && (
                  <menu className="choice-menu scratch-actions">
                    <button type="button" className="scratch-reveal-all" onClick={reveal}>
                      {tr({ fr: 'Tout révéler', en: 'Reveal all' })}
                    </button>
                  </menu>
                )}
                {phase === 'done' && outcome && (
                  <>
                    {/* Le Soleil : le gros lot. */}
                    {outcome.symbol === 'soleil' ? (
                      <p className="scratch-jackpot-banner">☀ {tr({ fr: 'Le gros lot !', en: 'The jackpot!' })}</p>
                    ) : null}
                    {outcome.win ? (
                      <p className="scratch-result scratch-result--win">
                        +<Monte value={totalFaveur} /> {tr({ fr: 'faveur', en: 'favor' })}
                        {outcome.freeFlight && <span className="scratch-result-sub"> · 🪽 {tr({ fr: "vol d'Icare offert", en: 'free Icarus flight' })}</span>}
                      </p>
                    ) : (
                      <p className="scratch-result scratch-result--lose">
                        {tr({ fr: `Perdu : −${fmtMise(outcome.stakeFaveur)} faveur`, en: `Lost: −${fmtMise(outcome.stakeFaveur)} favor` })}
                      </p>
                    )}
                    <menu className="choice-menu scratch-actions">
                      {canReplay && (
                        <button
                          type="button"
                          className="scratch-replay"
                          {...tipProps(null, tr({ fr: 'L’offrande recopiée : le trésor de la Maison paie la mise du même ticket, une fois. Il doit la couvrir en entier.', en: 'The copied offering: the House hoard pays the same ticket’s stake, once. It must cover it in full.' }))}
                          onClick={onReplay}
                        >
                          {tr({ fr: `Rejeu offert (${fmtMise(outcome.stakeFaveur)})`, en: `Free replay (${fmtMise(outcome.stakeFaveur)})` })}
                        </button>
                      )}
                      {/* Laisser courir : le gain du ticket sur le suivant. */}
                      {rideAmount > 0 && (
                        <button
                          type="button"
                          className="scratch-buy ptable-ride"
                          disabled={(state.faveur || 0) < rideAmount}
                          onClick={() => { outcomeRef.current = null; onBuy(rideAmount); }}
                        >
                          {tr({ fr: `Laisser courir (${fmtMise(rideAmount)})`, en: `Let it ride (${fmtMise(rideAmount)})` })}
                        </button>
                      )}
                      {/* Rejeu DIRECT : même mise, on rachète sans détour. */}
                      <button
                        type="button"
                        className="scratch-buy"
                        disabled={(state.faveur || 0) < stake}
                        onClick={() => { outcomeRef.current = null; onBuy(); }}
                      >
                        {tr({ fr: `Même mise (${fmtMise(stake)})`, en: `Same bet (${fmtMise(stake)})` })}
                      </button>
                      <button type="button" onClick={onNewTicket}>
                        {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                      </button>
                      <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Quitter la table', en: 'Leave the table' })}</button>
                    </menu>
                  </>
                )}
              </div>
            </>
          )}
        </PlaisirsTable>
      )}
    </div>
  );
}
