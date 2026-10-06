import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state, saveSoon, renderCache } from '../../game/core/state.js';
import {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackHand,
  blackjackActive,
  blackjackLastOutcome,
  handValue
} from '../../game/core/actions.js';
import { doubleBlackjack, splitBlackjack, basicAction, blackjackSabot } from '../../game/core/actions/blackjack.js';
import { videurBarre, videurBarreMin, videurOeil } from '../../game/core/actions/videur.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';
import { cardSrc, cardLabel, CARD_BACK_SRC, CARD_DECK_SRC } from './cardSprites.js';
import { usePlaisirsBand, cardFaceFor, cardBackFor } from './plaisirsMaterial.js';
import StageHelp from './StageHelp.jsx';
import PlaisirsTable, { PancarteFermee } from '../views/plaisirs/PlaisirsTable.jsx';
import TableMise from '../views/plaisirs/TableMise.jsx';
import { initialStake, rememberStake, fmtMise } from '../views/plaisirs/miseMemory.js';
import { createClickLock } from '../views/plaisirs/clickLock.js';
import Monte from './Monte.jsx';

/**
 * Le Vingt-et-un — SCÈNE INTÉGRÉE (RegulationStage, sur la salle de la Maison des
 * Plaisirs, comme osselets/Icare/scratch). Le moteur (actions/blackjack.js) est autoritaire : rouvrir la
 * scène pendant une main la REPREND en cours. Phases : pari (choix de la mise) →
 * jeu (tirer/rester) → résultat. Les cartes sont des sprites pixel du pack Bit
 * Digitalis (cardSprites.js) : couleurs internationales à l'écran, clés antiques
 * dans le moteur. La carte cachée du croupier reste face verso tant qu'on joue.
 * Fermer/changer de cycle
 * en pleine main abandonne la mise (déjà payée).
 */

// Libellés d'issue pour l'infobulle des pastilles d'historique (résolus par tr()).
const BJ_RESULT_LABEL = {
  blackjack: { fr: 'Vingt-et-un', en: 'Twenty-one' },
  win: { fr: 'Gagné', en: 'Win' },
  push: { fr: 'Égalité', en: 'Push' },
  lose: { fr: 'Perdu', en: 'Lose' }
};

// La Voix de l'oracle (artefact) : une réplique par issue, indexée sur la série.
// Sobre, antique, sans emphase. La série ne compte que les mains jouées à la main.
function oracleLine(result, streak) {
  if (result === 'blackjack') return { fr: 'Les dieux te devaient une carte.', en: 'The gods owed you a card.' };
  if (result === 'push') return { fr: "Rien n'a eu lieu.", en: 'Nothing has taken place.' };
  if (result === 'lose') return { fr: "L'oracle reprend son dû.", en: 'The oracle takes back its due.' };
  if (streak >= 5) return { fr: "L'oracle se souvient de ton nom.", en: 'The oracle remembers your name.' };
  if (streak >= 3) return { fr: "Trois mains. L'oracle te voit.", en: 'Three hands. The oracle sees you.' };
  if (streak >= 2) return { fr: "Encore. L'oracle te regarde.", en: 'Again. The oracle is watching you.' };
  return { fr: "L'oracle incline la tête.", en: 'The oracle bows its head.' };
}

// Le conseil de la Mesure gravée (artefact) : ce que la stratégie de base ferait.
const MEASURE_LABEL = {
  hit: { fr: 'la mesure tirerait', en: 'the measure would hit' },
  stand: { fr: 'la mesure resterait', en: 'the measure would stand' },
  double: { fr: 'la mesure doublerait', en: 'the measure would double' },
  split: { fr: 'la mesure refendrait', en: 'the measure would split' }
};

/* Carte à jouer : un seul sprite du pack Bit Digitalis (32×48 natif, rendu au
   double exact). Le rang et la couleur sont déjà peints dedans, il n'y a donc
   plus rien à composer — juste l'alternative textuelle pour la voix. La carte
   cachée du croupier montre le dos du même pack. */
// ⭐ Refonte du 2026-10-02 : les cartes suivent l'ÂGE de la ville — bois, parchemin,
// cartes à jouer du pack, cristal (plaisirsMaterial.js). Même taille native 32×48.
function BjCard({ card, hidden }) {
  const band = usePlaisirsBand();
  if (hidden) {
    return <img className="bj-card is-hidden" src={cardBackFor(band) || CARD_BACK_SRC} alt={tr({ fr: 'carte cachée', en: 'face-down card' })} draggable="false" />;
  }
  return <img className="bj-card" src={cardFaceFor(band, card) || cardSrc(card)} alt={cardLabel(card)} draggable="false" />;
}

export default function BlackjackStage({ table, onClose }) {
  const [phase, setPhase] = useState('bet');
  // LA MISE LIBRE (lot 1 des gains « vrai casino ») : des jetons sur le tapis. Une
  // table rouverte repart de la dernière mise jouée.
  const [stake, setStake] = useState(() => initialStake('cartes', state.faveur || 0));
  const [hand, setHand] = useState(null);
  const [outcome, setOutcome] = useState(null);
  // Horloge 1 Hz : le tick, pas l'instabilité (figée en crise terminale ou une
  // fois convergée — BUG-114). Or, cagnotte, mises vivants.
  useGameState(() => renderCache.tickNow);
  const cycles = useGameState((s) => s.cycles);
  // LE SABOT ET LE VIDEUR (lot 4 de docs/PLAN-NUIT-DES-PLAISIRS.md).
  useGameState((s) => s.bjBarreJusqua || 0);
  useGameState((s) => (s.bjSoupcon || 0) + (s.bjAverti ? 100 : 0));

  // (Ré)ouverture : reprendre une main en cours (état module), sinon repartir au pari.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise la scène sur l'état module (blackjackActive) à la (ré)ouverture
    setOutcome(null);
    if (blackjackActive()) {
      const h = blackjackHand();
      setHand(h);
      // Main reprise : la mise de la main d'origine (une refente ou un double la
      // multiplient, la mise de base est celle de la première main).
      const first = h?.hands?.[0];
      if (first) setStake(first.doubled ? Math.round(first.stake / 2) : first.stake);
      setPhase('player');
    } else {
      setStake(initialStake('cartes', state.faveur || 0));
      setHand(null);
      setPhase('bet');
    }
  }, [table?.openedAt]);

  // Effondrement pendant une main : la scène se referme (nouveau cycle).
  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  const history = (state.blackjackHistory || []).slice().reverse();
  const { max: tableMax } = tableLimits();
  const faveur = state.faveur || 0;

  const finish = (h) => {
    setHand(h);
    if (h.resolved) { setOutcome(blackjackLastOutcome()); setPhase('done'); }
  };

  // Garde anti double-clic (BUG-46) : la main se résout DANS le clic, et le menu de
  // la phase suivante (même conteneur, même place) est déjà sous le curseur au 2e
  // clic — « Même mise » sous « Tirer », « Doubler » de la main refendue suivante.
  // Un seul verrou pour toutes les actions de la table, reposé à chaque menu neuf.
  const [lock] = useState(() => createClickLock());
  useEffect(() => { lock.arm(); }, [lock, phase, hand?.active]);

  // La donne, à la mise posée (`amount`, la pile par défaut) : Distribuer, « Même
  // mise » et « Laisser courir » passent par ici.
  const onDeal = (amount = stake) => lock.act(() => {
    if (amount <= 0 || (state.faveur || 0) < amount) return;
    const h = dealBlackjack(amount);
    // Donne refusée (BUG-47) : le verdict et le menu de la main restent (pause, crise…) ;
    // le videur, lui, renvoie au pari, où sa pancarte le dit et grise « Distribuer ».
    if (!h) { if (videurBarre()) { setHand(null); setOutcome(null); setPhase('bet'); } return; }
    // Mise débitée : écrite sous 300 ms, pas à l'autosave des 10 s — tuer le
    // processus sur une main crevée ne la rembourse plus (SAV-15).
    saveSoon(300);
    rememberStake('cartes', h.stakeFaveur);
    setStake(h.stakeFaveur);
    setOutcome(null);
    setPhase('player');
    finish(h); // un naturel se résout d'emblée → passe direct au résultat
  });
  const onHit = () => lock.act(() => { const h = hitBlackjack(); if (h) finish(h); });
  const onStand = () => lock.act(() => { const h = standBlackjack(); if (h) finish(h); });
  // Doubler et séparer débitent une seconde mise : même écriture rapide (SAV-15).
  const onDouble = () => lock.act(() => { const h = doubleBlackjack(); if (h) { saveSoon(300); finish(h); } });
  const onSplit = () => lock.act(() => { const h = splitBlackjack(); if (h) { saveSoon(300); finish(h); } });
  const onNewHand = () => lock.act(() => { setHand(null); setOutcome(null); setPhase('bet'); });

  // Le conseil de la Mesure gravée : ce que la stratégie de base ferait avec
  // cette main contre la carte visible de l'oracle. Pure information, calculée
  // sur les mêmes fonctions que l'auto et le bench.
  const hasMeasure = hasTempleArtifact('mesure');
  const advice = hasMeasure && phase === 'player' && hand
    // Refente conseillée seulement quand elle est offerte (BUG-83).
    ? basicAction(hand.player, hand.dealer[0], { allowDouble: hand.canDouble, allowSplit: hand.canSplit })
    : null;
  const hasVoice = hasTempleArtifact('voix');

  const dealerHideHole = phase === 'player';
  const dealerValue = hand ? (dealerHideHole ? handValue([hand.dealer[0]]) : hand.dealerValue) : 0;

  const resultText = () => {
    if (!outcome) return null;
    // Le gain d'une main gagnée MONTE (2026-10-04, « la sensation de gagner »).
    const gain = <>+<Monte value={outcome.faveurGain} format={fmtMise} /> {tr({ fr: 'faveur', en: 'favor' })}</>;
    if (outcome.result === 'blackjack') return <>{tr({ fr: 'Vingt-et-un ! ', en: 'Twenty-one! ' })}{gain}</>;
    if (outcome.result === 'win') return <>{tr({ fr: 'Gagné : ', en: 'Win: ' })}{gain}</>;
    if (outcome.result === 'push') return tr({ fr: `Égalité : +${fmtMise(outcome.faveurGain)} faveur`, en: `Push: +${fmtMise(outcome.faveurGain)} favor` });
    // fmtMise comme le gain et toutes les autres tables (fmt écrivait « 1.23K » à côté d'une mise « 1 230 »).
    return tr({ fr: `Perdu : −${fmtMise(outcome.stakeFaveur || stake)} faveur`, en: `Lost: −${fmtMise(outcome.stakeFaveur || stake)} favor` });
  };

  // Le sabot (ce qui reste avant la carte de coupe — pas le compte : c'est au joueur de
  // compter), l'œil du chef de salle, et la porte du videur.
  const sabot = blackjackSabot();
  const barre = videurBarre();
  const sabotHud = (
    <div className="bj-sabot-hud">
      <span
        className="bj-sabot"
        {...tipProps(tr({ fr: 'Le sabot', en: 'The shoe' }), tr({ fr: 'Six jeux battus ensemble : les cartes sorties ne reviennent qu’au prochain battage. La jauge : ce qui reste avant la carte de coupe.', en: 'Six decks shuffled together: cards dealt only come back at the next shuffle. The gauge: what is left before the cut card.' }))}
      >
        <i style={{ width: `${Math.round(sabot.reste * 100)}%` }} />
      </span>
      {sabot.neuf && <span className="bj-sabot-neuf" {...tipProps(null, tr({ fr: 'Sabot neuf', en: 'Fresh shoe' }))}>✦</span>}
      {videurOeil() && (
        <span className="bj-oeil" {...tipProps(tr({ fr: 'Le chef de salle', en: 'The pit boss' }), tr({ fr: 'Il a l’œil sur toi : tes mises suivent un peu trop bien le sabot.', en: 'He has his eye on you: your bets follow the shoe a little too well.' }))}>👁</span>
      )}
    </div>
  );
  const pancarteVideur = (L) => barre && (
    <PancarteFermee
      y={Math.round((L.top + L.bottom) / 2)}
      texte={tr({ fr: 'VIDEUR', en: 'BOUNCER' })}
      titre={tr({ fr: 'Le videur', en: 'The bouncer' })}
      info={tr({ fr: `Il t'a raccompagné : à la Maison, on n'aime pas les compteurs de cartes. La table te rouvre dans ${videurBarreMin()} min.`, en: `He showed you out: the House does not like card counters. The table reopens to you in ${videurBarreMin()} min.` })}
    />
  );

  // Les pastilles des dernières mains (posées sur le mur, en haut à gauche de la table).
  const historyChips = history.length > 0 && (
    <div className="bj-history" aria-label={tr({ fr: 'Dernières mains', en: 'Last hands' })}>
      {history.map((r, i) => (
        <span key={`${r}-${i}`} className={`bj-chip is-${r}`} {...tipProps(null, tr(BJ_RESULT_LABEL[r] || { fr: r, en: r }))}>
          {r === 'blackjack' ? '21' : r === 'win' ? '✓' : r === 'push' ? '=' : '✕'}
        </span>
      ))}
    </div>
  );

  return (
    <div className="blackjack-stage">
      {/* Pas de cagnotte dans ce titre : cette table ne la rafle jamais (elle la
          nourrit à peine, son avantage est le plus mince de la Maison). */}
      <div className="regul-block-title stage-title">
        {/* Nom du jeu retiré (retour Raphaël 2026-07-17 : « plus de nom en tête ») —
            la ligne se réduit à une barrette de contrôles (aide, fermeture) à droite. */}
        <StageHelp>
          <p>
            {tr({
              fr: `Approche 21 sans dépasser. Le croupier tire jusqu’à 17. Un « vingt-et-un » (21 en deux cartes) paie 6 contre 5 (×2.2), une victoire ×2, l’égalité rend la mise. As : 1 ou 11, figures : 10. Sur tes deux premières cartes, tu peux doubler la mise (une seule carte de plus) ou refendre une paire. La mise est libre, jusqu'à la limite de la table (${fmtMise(tableMax)}).`,
              en: `Get close to 21 without going over. The dealer draws to 17. A natural (21 on two cards) pays 6 to 5 (×2.2), a win ×2, a push returns the stake. Aces: 1 or 11, faces: 10. On your first two cards you can double the stake (one more card only) or split a pair. The stake is free, up to the table limit (${fmtMise(tableMax)}).`
            })}
          </p>
          <p>
            {tr({
              fr: 'C’est la table la plus clémente de la Maison : jouée parfaitement, elle rend près de 99 %.',
              en: 'This is the House’s most lenient table: played perfectly, it returns nearly 99%.'
            })}
          </p>
          <p>
            {tr({
              fr: 'Le sabot tient six jeux, battus quand sort la carte de coupe : les cartes jouées ne reviennent pas avant. Un sabot riche en 10 et en As sourit au joueur — les malins comptent. Le chef de salle aussi : qui mise bien plus gros quand le sabot est riche se fait raccompagner par le videur.',
              en: 'The shoe holds six decks, shuffled when the cut card comes out: cards played do not come back before. A shoe rich in 10s and Aces favours the player — clever ones count. So does the pit boss: whoever bets much bigger when the shoe is rich gets shown out by the bouncer.'
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la table', en: 'Leave the table' })}>✕</button>
      </div>

      {/* ⭐ LA TABLE DE L'ÂGE (2026-10-03, plaisirs/PlaisirsTable.jsx) : la croupière
          derrière sa table, peinte comme dans la coupe ; les mises se posent SUR le
          tapis, chacune sur son cercle, et la main se distribue sur le feutre. */}
      {phase === 'bet' && (
        <PlaisirsTable game="cartes" className="ptable--bet ptable--mise" tablePx={250} nSpots={1}>
          {(L) => (
            <>
              <div className="ptable-hud">
                {historyChips}
                {sabotHud}
              </div>
              {pancarteVideur(L)}
              <TableMise
                game="cartes"
                x={L.spots[0]}
                y={L.spotY}
                k={L.k}
                rackY={L.floor + 6}
                stake={stake}
                onStake={setStake}
                faveur={faveur}
                playLabel={tr({ fr: 'Distribuer', en: 'Deal' })}
                playDisabled={barre}
                onPlay={() => onDeal()}
              />
            </>
          )}
        </PlaisirsTable>
      )}

      {(phase === 'player' || phase === 'done') && hand && (
        <PlaisirsTable game="cartes" className="ptable--play" tablePx={400} marks={false}>
          {(L) => (
            <>
              <div className="ptable-hud">{historyChips}{sabotHud}</div>
              <div className="bj-table">
                {/* Le sabot, posé à droite sur le tapis (le vrai vit dans le moteur ; ce
                    qu'il en reste se lit sur la jauge, au mur). */}
                <img className="bj-deck" src={CARD_DECK_SRC} alt="" aria-hidden="true" draggable="false" style={{ top: L.top + 6, right: '8%' }} />
                {/* L'oracle (la croupière) : ses cartes devant elle, au fond du tapis. */}
                <div className="bj-side" style={{ top: L.top + 4 }}>
                  <div className="bj-side-head">
                    <span>{tr({ fr: 'Oracle', en: 'Dealer' })}</span>
                    <span className="bj-val">{dealerHideHole ? `${dealerValue}+` : dealerValue}</span>
                  </div>
                  <div className="bj-hand">
                    {hand.dealer.map((c, i) => <BjCard key={i} card={c} hidden={dealerHideHole && i > 0} />)}
                  </div>
                </div>
                {/* Le joueur : sa main près du bord, de son côté de la table. */}
                <div className="bj-side" style={{ top: Math.max(L.top + 104, L.bottom - 102) }}>
                  <div className="bj-side-head">
                    <span>{tr({ fr: 'Toi', en: 'You' })}</span>
                    <span className={`bj-val${hand.playerValue > 21 ? ' is-bust' : ''}`}>{hand.playerValue}</span>
                  </div>
                  {/* La refente : les deux mains côte à côte, la main EN JEU marquée.
                      Une main simple garde le rendu d'avant (hands = [la main]). */}
                  {hand.split ? (
                    hand.hands.map((h, hi) => (
                      <div
                        key={hi}
                        className={`bj-hand bj-hand--split${phase === 'player' && hand.active === hi ? ' is-active' : ''}`}
                      >
                        {h.cards.map((c, i) => <BjCard key={i} card={c} />)}
                        <span className={`bj-split-val${h.value > 21 ? ' is-bust' : ''}`}>
                          {h.value}{h.doubled ? ' ×2' : ''}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="bj-hand">
                      {hand.player.map((c, i) => <BjCard key={i} card={c} />)}
                    </div>
                  )}
                </div>
              </div>

              {/* Ce qu'on dit sur la table (conseil de la mesure, issue, voix de
                  l'oracle) : à droite du tapis, en plaques ; les boutons sur le sol. */}
              <div className="ptable-say" style={{ top: Math.max(L.top + 104, L.bottom - 102) + 8 }}>
                {phase === 'player' && advice && (
                  <p className="bj-measure" {...tipProps(null, tr({ fr: 'La mesure gravée : le conseil de la stratégie de base, contre la carte visible de l’oracle.', en: 'The graven measure: basic strategy advice, against the oracle’s visible card.' }))}>
                    {tr(MEASURE_LABEL[advice] || MEASURE_LABEL.stand)}
                  </p>
                )}
                {phase === 'done' && outcome && (
                  <>
                    <p className={`scratch-result scratch-result--${outcome.result === 'lose' ? 'lose' : 'win'}`}>{resultText()}</p>
                    {outcome.split && (
                      <p className="bj-split-summary">
                        {outcome.results.map((r, i) => (
                          `${tr({ fr: 'main', en: 'hand' })} ${i + 1} : ${tr(BJ_RESULT_LABEL[r.result] || { fr: r.result, en: r.result })}`
                        )).join(' · ')}
                      </p>
                    )}
                    {hasVoice && (
                      <p className="bj-oracle-line">
                        {tr(oracleLine(outcome.result, state.blackjackStreak || 0))}
                        {(state.blackjackStreak || 0) >= 2 && (
                          <span className="bj-streak"> · {tr({ fr: `série de ${state.blackjackStreak}`, en: `streak of ${state.blackjackStreak}` })}</span>
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="ptable-actions" style={{ top: L.floor + 8 }}>
                {phase === 'player' && (
                  <menu className="choice-menu scratch-actions">
                    <button type="button" className="scratch-buy" onClick={onHit}>{tr({ fr: 'Tirer', en: 'Hit' })}</button>
                    <button type="button" onClick={onStand}>{tr({ fr: 'Rester', en: 'Stand' })}</button>
                    {hand.canDouble && (
                      <button
                        type="button"
                        className="bj-double"
                        {...tipProps(tr({ fr: 'Doubler', en: 'Double' }), tr({ fr: `Double la mise (${fmtMise(hand.stakeFaveur)} de plus), une seule carte, et la main passe.`, en: `Double the stake (${fmtMise(hand.stakeFaveur)} more), one single card, and the hand passes.` }))}
                        onClick={onDouble}
                      >
                        {tr({ fr: 'Doubler', en: 'Double' })}
                      </button>
                    )}
                    {hand.canSplit && (
                      <button
                        type="button"
                        className="bj-double"
                        {...tipProps(tr({ fr: 'Refendre', en: 'Split' }), tr({ fr: `Sépare la paire en deux mains, chacune avec sa mise (${fmtMise(hand.stakeFaveur)} de plus). Un 21 refendu paie ×2.`, en: `Split the pair into two hands, each with its own stake (${fmtMise(hand.stakeFaveur)} more). A split 21 pays ×2.` }))}
                        onClick={onSplit}
                      >
                        {tr({ fr: 'Refendre', en: 'Split' })}
                      </button>
                    )}
                  </menu>
                )}
                {/* Rejeu DIRECT (phase 7) : redistribuer à la même mise sans repasser
                    par le pari — c'est le seul jeu du temple jouable en continu, le
                    clic administratif y coûtait le plus. */}
                {phase === 'done' && outcome && (
                  <menu className="choice-menu scratch-actions">
                    {/* Laisser courir : tout le gain de la main sur la suivante. */}
                    {outcome.faveurGain > 0 && outcome.result !== 'push' && (
                      <button
                        type="button"
                        className="scratch-buy ptable-ride"
                        disabled={(state.faveur || 0) < Math.min(tableMax, outcome.faveurGain)}
                        onClick={() => onDeal(Math.min(tableMax, outcome.faveurGain))}
                      >
                        {tr({ fr: `Laisser courir (${fmtMise(Math.min(tableMax, outcome.faveurGain))})`, en: `Let it ride (${fmtMise(Math.min(tableMax, outcome.faveurGain))})` })}
                      </button>
                    )}
                    <button
                      type="button"
                      className="scratch-buy"
                      disabled={(state.faveur || 0) < stake}
                      onClick={() => onDeal()}
                    >
                      {tr({ fr: `Même mise (${fmtMise(stake)})`, en: `Same bet (${fmtMise(stake)})` })}
                    </button>
                    <button type="button" onClick={onNewHand}>{tr({ fr: 'Changer de mise', en: 'Change stake' })}</button>
                    {/* Verrouillé aussi : un double-clic sur « Doubler » (main perdue) tombait
                        ici et refermait la table sur un verdict jamais lu. */}
                    <button type="button" className="btn-close" onClick={() => lock.act(onClose)}>{tr({ fr: 'Quitter la table', en: 'Leave the table' })}</button>
                  </menu>
                )}
              </div>
            </>
          )}
        </PlaisirsTable>
      )}
    </div>
  );
}
