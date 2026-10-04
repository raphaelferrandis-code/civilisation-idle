import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  castAugury,
  doubleAugury,
  auguryPaytable,
  AUGURY_RITES,
  AUGURY_TIER_LABELS
} from '../../game/core/actions.js';
import { AUGURY_DOUBLE_P, AUGURY_DOUBLE_MAX_CRANS } from '../../game/core/balance.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import { state, save } from '../../game/core/state.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { REGULATION_ACTIONS_BY_ID } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';
import { celebrerGain } from '../../game/core/grandsGains.js';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import PlaisirsTable, { TableStake } from '../views/plaisirs/PlaisirsTable.jsx';
import TableMise from '../views/plaisirs/TableMise.jsx';
import { initialStake, rememberStake, fmtMise } from '../views/plaisirs/miseMemory.js';
import { usePlaisirsBand, diceSheetFor } from './plaisirsMaterial.js';
import { wonderKitForBand } from '../../game/map/iso/wonderKits.js';

/**
 * La Table des augures — SCÈNE INTÉGRÉE. La mise est en FAVEUR, LIBRE (des jetons
 * sur le tapis, lot 1 des gains « vrai casino ») ; chaque RITE est un pari à cotes
 * fixes (cf. actions/augures.js, AUGURY_RITE_BETS) : on choisit son risque, pas son
 * prix. Le moteur tire l'issue et les os AVANT l'animation, mais l'EFFET est différé
 * jusqu'à la chute des dés (anti-spoiler). Phases : mise (rite + jetons) → jet →
 * résultat (quitte ou double, laisser courir, même mise).
 */

// L'EMBLÈME DE CHAQUE RITE, en tête de sa colonne. Les quatre rites sont quatre
// paris, du plus sûr au plus risqué : les emblèmes montent en gravité rituelle — la coupe d'argile,
// puis le bucrane de l'hécatombe, puis la lame du rite que les prêtres taisent.
//
// ⛔ LE RITE ANCESTRAL NE MONTRE PAS DES DÉS, il montre le CORNET qui les verse.
// Un dé en 3/4 étale trois faces à la fois, donc des valeurs arbitraires :
// « les dés n'ont aucun sens » (Raph, deux fois — le 2026-07-23 sur les faces
// gravées, le 2026-08-07 sur cet emblème). Le cornet renversé garde l'identité
// du jeu sans qu'aucune face ne prétende dire un chiffre.
//
// ⚠ Table explicite plutôt qu'un chemin déduit de `rite.id` : un rite ajouté
// demain sortirait un 404 muet. Cf. la même table dans IcarusStage.
const STAKE_ART = {
  prudent: '/pixelart/ui/plaisirs/mises/osselets-prudent.png',
  classique: '/pixelart/ui/plaisirs/mises/osselets-classique.png',
  grand: '/pixelart/ui/plaisirs/mises/osselets-grand.png',
  interdit: '/pixelart/ui/plaisirs/mises/osselets-interdit.png'
};

const LAND_FIRST_MS = 450;
const LAND_STEP_MS = 340;
const REVEAL_EXTRA_MS = 320;

export default function AuguryStage({ table, onClose }) {
  const timersRef = useRef([]);
  // Issue tirée mais NON encore appliquée (effet différé jusqu'à la chute des
  // dés). Flushée si la scène ferme en plein jet : la mise est payée, l'issue
  // DOIT se résoudre.
  const pendingRef = useRef(null);
  const [phase, setPhase] = useState('stake');
  // Le rite (le pari) et la mise (les jetons). Le rite ancestral par défaut ; une
  // table rouverte repart de la dernière mise jouée.
  const [riteId, setRiteId] = useState('classique');
  const [stake, setStake] = useState(() => initialStake('osselets', state.faveur || 0));
  const [outcome, setOutcome] = useState(null);
  const [doubleOutcome, setDoubleOutcome] = useState(null);
  // Cran de l'Échelle de Vénus (quitte ou double chaîné). Sans l'artefact, un
  // seul cran ; avec, AUGURY_DOUBLE_MAX_CRANS. Chaque cran est à EV nulle.
  const [doubleCran, setDoubleCran] = useState(0);
  const [bones, setBones] = useState(null);
  const [landed, setLanded] = useState(0);
  useGameState((s) => s.instability); // odds/rabais vivants (1 Hz)
  // ⭐ Le matériel de l'ÂGE (plaisirsMaterial.js) : les os de Raph aux âges anciens,
  // puis des dés vus de dessus (ivoire, casino, lumière de l'ère).
  const band = usePlaisirsBand();
  const diceSheet = diceSheetFor(band, band >= 7 ? wonderKitForBand(band).pal.glow : null);
  const faveur = useGameState((s) => s.faveur || 0); // mises payables en direct
  const cycles = useGameState((s) => s.cycles);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const flushPending = () => {
    if (pendingRef.current) {
      pendingRef.current(); // apply() idempotent : révélation OU flush, jamais deux fois
      pendingRef.current = null;
    }
  };

  // F5 / fermeture d'onglet pendant un jet en l'air : aucun cleanup React ne
  // court au rechargement — la mise payée restait sans issue (M4, trou plus
  // étroit qu'aux grattables : ~1,8 s d'animation). save() explicite, car la
  // sauvegarde de sortie de main.js est déjà passée quand ce flush mute l'état.
  useEffect(() => {
    const flushOnExit = () => {
      if (!pendingRef.current) return;
      flushPending();
      save();
    };
    window.addEventListener('pagehide', flushOnExit);
    window.addEventListener('beforeunload', flushOnExit);
    return () => {
      window.removeEventListener('pagehide', flushOnExit);
      window.removeEventListener('beforeunload', flushOnExit);
    };
  }, []);

  useEffect(() => {
    flushPending();
    clearTimers();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remise à zéro VOULUE de la scène à chaque réouverture (openedAt)
    setPhase('stake');
    setRiteId((r) => r || 'classique');
    setStake(initialStake('osselets', state.faveur || 0));
    setOutcome(null);
    setDoubleOutcome(null);
    setDoubleCran(0);
    setBones(null);
    setLanded(0);
  }, [table?.openedAt]);

  useEffect(() => () => { flushPending(); clearTimers(); }, []);

  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  // Les dés se posent un à un, puis l'issue est RÉVÉLÉE — l'effet (gain de
  // Faveur + float) est appliqué PILE à cet instant.
  const startCast = (castBones, revealOutcome) => {
    setBones(castBones);
    setLanded(0);
    setPhase('cast');
    clearTimers();
    for (let i = 0; i < 4; i++) {
      timersRef.current.push(setTimeout(() => setLanded(i + 1), LAND_FIRST_MS + i * LAND_STEP_MS));
    }
    timersRef.current.push(setTimeout(() => {
      flushPending();
      setPhase('result');
      revealOutcome(); // re-fixe l'objet (faveurGain désormais peuplé)
    }, LAND_FIRST_MS + 3 * LAND_STEP_MS + REVEAL_EXTRA_MS));
  };

  if (!table) return null;
  const a = REGULATION_ACTIONS_BY_ID[table.id];
  if (!a) return null;

  const isDouble = Boolean(doubleOutcome);
  const { max: tableMax } = tableLimits();

  // Le jet part sur le rite SÉLECTIONNÉ, à la mise posée (`amount`, la pile par
  // défaut). « Même mise » et « Laisser courir » passent par ici.
  const onCast = (amount = stake) => {
    if (!riteId || amount <= 0 || faveur < amount) return;
    const res = castAugury(table.id, riteId, { defer: true, stake: amount });
    if (!res) return;
    rememberStake('osselets', res.stake);
    setStake(res.stake);
    pendingRef.current = res.apply;
    setOutcome(res);
    setDoubleOutcome(null);
    setDoubleCran(0);
    startCast(res.bones, () => {
      setOutcome({ ...res });
      celebrerGain({ gain: res.faveurGain, stake: res.stake, game: 'osselets' });
    });
  };

  const maxCrans = hasTempleArtifact('echelle') ? AUGURY_DOUBLE_MAX_CRANS : 1;

  const onDouble = () => {
    if (!outcome || outcome.faveurGain <= 0) return;
    if (doubleCran >= maxCrans) return;
    // La mise du cran N est TOUT ce qui est sur la table : le gain initial au
    // premier cran, puis le double du wager précédent (gagné) aux suivants.
    const wager = doubleCran === 0 ? outcome.faveurGain : (doubleOutcome?.wager || outcome.faveurGain) * 2;
    const res = doubleAugury(table.id, wager, { defer: true });
    if (!res) return;
    pendingRef.current = res.apply;
    setDoubleCran(doubleCran + 1);
    setDoubleOutcome(res);
    // Un quitte ou double gagné se fête au multiple de la mise du jet d'origine.
    const origine = outcome.stake;
    startCast(res.bones, () => {
      setDoubleOutcome({ ...res });
      if (res.win) celebrerGain({ gain: res.wager * 2, stake: origine, game: 'osselets' });
    });
  };

  // Les rites offerts (le rite interdit attend son artefact).
  const rites = Object.values(AUGURY_RITES).filter((rite) => !rite.artifact || hasTempleArtifact(rite.artifact));
  const chosenRite = rites.find((r) => r.id === riteId) || rites[0];
  const chosenIndex = Math.max(0, rites.indexOf(chosenRite));
  const multTxt = (m) => `×${m.toFixed(m < 10 ? 2 : 1).replace('.', ',')}`;
  // Laisser courir : tout le gain du jet (mise rendue comprise) sur le suivant,
  // plafonné à la limite de la table.
  const rideAmount = outcome && outcome.win ? Math.min(tableMax, outcome.faveurGain) : 0;

  const tierChipCls = (tier) => tier === 'venus' ? 'augury-chip--venus'
    : tier === 'triple' || tier === 'pair' ? 'augury-chip--win'
    : 'augury-chip--lose';

  return (
    <div className="augury-stage">
      <div className="regul-block-title stage-title">
        {/* Nom du jeu retiré (retour Raphaël 2026-07-17 : « plus de nom en tête ») —
            la ligne se réduit à une barrette de contrôles alignée à droite (aide, pot,
            fermeture). Les bandeaux racontent déjà quel jeu on regarde. */}
        <StageHelp>
          <p>
            {tr({
              fr: `Pose tes jetons sur le rite de ton choix, jusqu'à la limite de la table (${fmtMise(tableMax)}). Paire haute, triple et triple six (Coup de Vénus, un vol d'Icare offert à ta mise) gagnent ; paire d'as et quatre as (le Chien) perdent. Carré de six : la cagnotte de la Maison. Chaque rite rend 97 % sur la durée : le rite choisit le risque, pas la chance.`,
              en: `Place your chips on the rite of your choice, up to the table limit (${fmtMise(tableMax)}). High pair, triple and triple six (Venus throw, a free Icarus flight at your stake) win; a pair of aces and four aces (the Dog) lose. Four sixes: the House pot. Every rite returns 97% over time: the rite picks the risk, not the luck.`
            })}
          </p>
          {/* Le détail des rites, qui ne s'écrit pas sur leurs plaques. */}
          <ul className="stage-help-list">
            {rites.map((rite) => {
              const pay = auguryPaytable(table.id, rite.id);
              return (
                <li key={rite.id}>
                  <b>{tr(rite.label)}</b> : {tr({ fr: 'gagne', en: 'wins' })} {Math.round(rite.p * 100)} % · {tr({ fr: 'paire', en: 'pair' })} {multTxt(pay.mult.pair)} · {tr({ fr: 'triple', en: 'triple' })} {multTxt(pay.mult.triple)} · {tr({ fr: 'Vénus', en: 'Venus' })} {multTxt(pay.mult.venus)}
                </li>
              );
            })}
          </ul>
          <p>
            {tr({
              fr: 'Après un gain : le quitte ou double rejoue la Faveur gagnée à une chance sur deux, sans que la Maison prélève rien ; « Laisser courir » la remise sur un nouveau jet.',
              en: 'After a win: double or nothing replays the Favor won at even odds, with nothing taken by the House; “Let it ride” stakes it on a new throw.'
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Refermer la table', en: 'Close the table' })}>✕</button>
      </div>

      {/* ⭐ LA TABLE DE L'ÂGE (2026-10-03, plaisirs/PlaisirsTable.jsx) : le croupier
          derrière la table des dés de la coupe ; les rites posés SUR le tapis, les
          osselets (ou les dés) jetés au milieu. */}
      {phase === 'stake' && (
        <PlaisirsTable game="des" className="ptable--bet ptable--mise ptable--rites" tablePx={270} nSpots={rites.length}>
          {(L) => (
            <>
              {/* Le solde de Faveur n'est plus répété ici : il s'affiche déjà en tête
                  de la Maison (passe densité 2026-07-17). */}
              <div className="ptable-hud">
                <div className="augury-odds">
                  <span className="augury-chip">{tr({ fr: 'chance', en: 'chance' })} {Math.round(chosenRite.p * 100)} %</span>
                </div>
              </div>
              {/* Les rites : des paris posés sur le tapis. Celui qu'on joue porte la
                  pile de jetons ; un clic sur un autre y déplace la mise. */}
              {rites.map((rite, i) => {
                if (rite.id === chosenRite.id) return null;
                const pay = auguryPaytable(table.id, rite.id);
                return (
                  <TableStake
                    key={rite.id}
                    x={L.spots[i % L.spots.length]}
                    y={L.spotY}
                    art={STAKE_ART[rite.id]}
                    label={tr(rite.label)}
                    cost={`${multTxt(pay.mult.pair)} – ${multTxt(pay.mult.venus)}`}
                    chosen={false}
                    onPick={() => setRiteId(rite.id)}
                    tip={tipProps(tr(rite.label), `${tr(rite.desc)} ${tr({ fr: 'Gagne', en: 'Wins' })} ${Math.round(rite.p * 100)} %.`)}
                  />
                );
              })}
              <TableMise
                game="osselets"
                x={L.spots[chosenIndex % L.spots.length]}
                y={L.spotY}
                k={L.k}
                rackY={L.floor + 6}
                rackX={Math.round((L.W * L.k) / 2)}
                label={tr(chosenRite.label)}
                sub={`${multTxt(auguryPaytable(table.id, chosenRite.id).mult.pair)} – ${multTxt(auguryPaytable(table.id, chosenRite.id).mult.venus)}`}
                stake={stake}
                onStake={setStake}
                faveur={faveur}
                playLabel={diceSheet ? tr({ fr: 'Jeter les dés', en: 'Cast the dice' }) : tr({ fr: 'Jeter les osselets', en: 'Cast the knucklebones' })}
                onPlay={() => onCast()}
              />
            </>
          )}
        </PlaisirsTable>
      )}

      {phase !== 'stake' && (
        <PlaisirsTable game="des" className="ptable--play ptable--dice" tablePx={340} marks={false}>
          {(L) => (
            <>
              {/* Le jet, au milieu du tapis. */}
              <div className="ptable-throw" style={{ top: Math.round((L.top + L.bottom) / 2) - 34 }}>
                <div className="augury-dice" aria-live="polite" style={diceSheet ? { '--bones-sheet': `url("${diceSheet}")` } : undefined}>
                  {/* L'osselet est un SPRITE (planche 1·3·4·6) : tant qu'il roule il n'a
                      pas de face fixée — l'animation fait défiler la planche. Key STABLE :
                      remonter les spans dans la zone aria-live ferait annoncer 4× « osselet
                      en l'air » à chaque quitte-ou-double. */}
                  {(bones || []).map((v, i) => (
                    <span
                      key={i}
                      className={`augury-die${i < landed ? ' is-landed' : ''}${i < landed && v === 1 ? ' is-ace' : ''}`}
                      data-face={i < landed ? v : undefined}
                      role="img"
                      aria-label={i < landed ? String(v) : (diceSheet ? tr({ fr: 'dé en l’air', en: 'die in the air' }) : tr({ fr: 'osselet en l’air', en: 'knucklebone in the air' }))}
                    />
                  ))}
                  {/* Annonce vocale : un span PAR valeur tombée (la zone n'annonce que
                      les ajouts de nœuds). */}
                  <span className="sr-only">
                    {(bones || []).slice(0, landed).map((v, i) => <span key={i}>{`${v} `}</span>)}
                  </span>
                </div>
              </div>

              {/* Ce qu'on dit sur la table : à droite, en plaques. */}
              <div className="ptable-say" style={{ top: L.top + 6 }}>
                {phase === 'result' && !isDouble && outcome && (
                  <>
                    {outcome.tier === 'venus' && <p className="augury-callout augury-callout--venus">{tr({ fr: 'Coup de Vénus !', en: 'Venus throw!' })}</p>}
                    {outcome.tier === 'dog' && <p className="augury-callout augury-callout--dog">{tr({ fr: 'Le jet du Chien !', en: 'The Dog throw!' })}</p>}
                    <div className="augury-odds">
                      <span className={`augury-chip ${tierChipCls(outcome.tier)}`}>{tr(AUGURY_TIER_LABELS[outcome.tier])}</span>
                      {outcome.win
                        ? <span className="augury-chip augury-chip--win">+{fmtMise(outcome.faveurGain)} {tr({ fr: 'faveur', en: 'favor' })}</span>
                        : (
                          <span className="augury-chip augury-chip--lose">−{fmtMise(outcome.stake)} {tr({ fr: 'faveur', en: 'favor' })}</span>
                        )}
                      {outcome.freeFlight && (
                        <span className="augury-chip augury-chip--venus">🪽 {tr({ fr: "vol d'Icare offert", en: 'free Icarus flight' })}</span>
                      )}
                      {/* Le carré de six : affiché SEULEMENT s'il a rapporté (un jackpot
                          sur cella vide donne 0 : annoncer « rafle » serait pris pour un bug). */}
                      {outcome.jackpot && outcome.jackpotGain > 0 && (
                        <span className="augury-chip augury-chip--venus">
                          🏺 +{fmtMise(outcome.jackpotGain)} {tr({ fr: 'faveur', en: 'favor' })}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {phase === 'result' && isDouble && doubleOutcome && (
                  <>
                    <div className="augury-odds">
                      {doubleOutcome.win
                        ? <span className="augury-chip augury-chip--win">+{fmtMise(doubleOutcome.wager)} {tr({ fr: 'faveur', en: 'favor' })}</span>
                        : <span className="augury-chip augury-chip--lose">−{fmtMise(doubleOutcome.wager)} {tr({ fr: 'faveur', en: 'favor' })}</span>}
                      {maxCrans > 1 && (
                        <span className="augury-chip augury-chip--mut">
                          {tr({ fr: `marche ${doubleCran} sur ${maxCrans}`, en: `step ${doubleCran} of ${maxCrans}` })}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Les boutons, sur le sol de la salle. */}
              <div className="ptable-actions" style={{ top: L.floor + 8 }}>
                {phase === 'result' && !isDouble && outcome && (
                  <menu className="choice-menu augury-actions">
                    {outcome.win && outcome.faveurGain > 0 && (
                      <button
                        type="button"
                        className="augury-tempt"
                        {...tipProps(null, tr({ fr: 'Gagné : la Faveur redouble. Perdu : la Faveur gagnée est reprise. La Maison ne prélève rien.', en: 'Won: the Favor doubles. Lost: the Favor won is taken back. The House takes nothing.' }))}
                        onClick={onDouble}
                      >
                        {tr({ fr: `Quitte ou double (${Math.round(AUGURY_DOUBLE_P * 100)} %)`, en: `Double or nothing (${Math.round(AUGURY_DOUBLE_P * 100)}%)` })}
                      </button>
                    )}
                    {/* Laisser courir : le gain du jet sur un nouveau jet. */}
                    {rideAmount > 0 && (
                      <button type="button" className="ptable-ride" disabled={faveur < rideAmount} onClick={() => { setDoubleOutcome(null); onCast(rideAmount); }}>
                        {tr({ fr: `Laisser courir (${fmtMise(rideAmount)})`, en: `Let it ride (${fmtMise(rideAmount)})` })}
                      </button>
                    )}
                    {/* Rejeu DIRECT : même rite, même mise. Quand le quitte ou double est
                        offert, il reste le bouton VEDETTE. */}
                    <button type="button" disabled={faveur < stake} onClick={() => { setDoubleOutcome(null); onCast(); }}>
                      {tr({ fr: `Même mise (${fmtMise(stake)})`, en: `Same bet (${fmtMise(stake)})` })}
                    </button>
                    <button type="button" onClick={() => { setPhase('stake'); setOutcome(null); setDoubleOutcome(null); }}>
                      {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                    </button>
                    <button type="button" className="btn-close" onClick={onClose}>
                      {tr({ fr: 'Refermer la table', en: 'Close the table' })}
                    </button>
                  </menu>
                )}
                {phase === 'result' && isDouble && doubleOutcome && (
                  <menu className="choice-menu augury-actions">
                    {doubleOutcome.win && doubleCran < maxCrans && (
                      <button
                        type="button"
                        className="augury-tempt"
                        {...tipProps(null, tr({ fr: "L'Échelle de Vénus : tout ce qui est sur la table se rejoue. Gagné : la Faveur redouble encore. Perdu : tout revient aux dieux.", en: "The Ladder of Venus: everything on the table is staked again. Won: the Favor doubles again. Lost: it all returns to the gods." }))}
                        onClick={onDouble}
                      >
                        {tr({ fr: `Quitte ou double (${Math.round(AUGURY_DOUBLE_P * 100)} %)`, en: `Double or nothing (${Math.round(AUGURY_DOUBLE_P * 100)}%)` })}
                      </button>
                    )}
                    <button type="button" disabled={faveur < stake} onClick={() => { setDoubleOutcome(null); setDoubleCran(0); onCast(); }}>
                      {tr({ fr: `Même mise (${fmtMise(stake)})`, en: `Same bet (${fmtMise(stake)})` })}
                    </button>
                    <button type="button" onClick={() => { setPhase('stake'); setOutcome(null); setDoubleOutcome(null); setDoubleCran(0); }}>
                      {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                    </button>
                    <button type="button" className="btn-close" onClick={onClose}>{tr({ fr: 'Refermer la table', en: 'Close the table' })}</button>
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
