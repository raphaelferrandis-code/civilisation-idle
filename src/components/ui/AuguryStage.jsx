import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  castAugury,
  doubleAugury,
  auguryStake,
  auguryPaytable,
  auguryRebate,
  auguryBaseOdds,
  AUGURY_RITES,
  AUGURY_TIER_LABELS
} from '../../game/core/actions.js';
import { AUGURY_DOUBLE_P, AUGURY_DOUBLE_MAX_CRANS } from '../../game/core/balance.js';
import { hasTempleArtifact } from '../../game/core/actions/templeArtifacts.js';
import { save } from '../../game/core/state.js';
import { clampStakeMult } from '../../game/core/actions/templePot.js';
import { REGULATION_ACTIONS_BY_ID } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import CoffreSelect from './CoffreSelect.jsx';
import StageHelp from './StageHelp.jsx';
import PlaisirsTable, { TableStake } from '../views/plaisirs/PlaisirsTable.jsx';
import { usePlaisirsBand, diceSheetFor } from './plaisirsMaterial.js';
import { wonderKitForBand } from '../../game/map/iso/wonderKits.js';

/**
 * La Table des augures — SCÈNE INTÉGRÉE. MONNAIE FERMÉE (2026-07-16) : la mise
 * est en FAVEUR (tronc des offrandes), le gain aussi — paytable normalisée sur
 * un RTP < 1 (cf. actions/augures.js). La Clémence ALLÈGE la mise après des
 * revers (gains au prorata), elle ne touche plus la chance. Le moteur tire
 * l'issue et les os AVANT l'animation, mais l'EFFET est différé jusqu'à la
 * chute des dés (anti-spoiler). Phases : mise (rites) → jet → résultat
 * (quitte ou double sur la Faveur gagnée).
 */

// L'EMBLÈME DE CHAQUE RITE, en tête de sa colonne. Les quatre rites ne diffèrent
// que par leur VARIANCE (spread 0,55 → 2,5) : un chiffre que rien ne rend
// sensible. Les emblèmes montent donc en gravité rituelle — la coupe d'argile,
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
  // Aucune mise choisie au départ (sketch Raph 2026-07-17 : « le bouton de jeu
  // n'apparaît que quand la mise est sélectionnée ») — null tant qu'on n'a pas
  // cliqué un choix, ce qui garde le bouton Jouer masqué.
  const [riteId, setRiteId] = useState(null);
  // La puissance de mise du coffre (×1, ×10…). Re-clampée au rendu ET au moteur :
  // un Grand Reset peut faire retomber le rang pendant que la scène est ouverte.
  const [coffreMult, setCoffreMult] = useState(1);
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
    setRiteId(null);
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

  const pBase = auguryBaseOdds(a);
  const rebate = auguryRebate(table.id);
  const isDouble = Boolean(doubleOutcome);
  const effMult = clampStakeMult(coffreMult); // parité stricte avec le moteur
  const castCost = riteId ? auguryStake(table.id, riteId).stake * effMult : 0;

  // Le jet part sur le rite SÉLECTIONNÉ (riteId) : le bouton de jeu, le rejeu
  // « Rejeter » et le quitte-ou-double appellent tous onCast() sans argument.
  const onCast = () => {
    const res = castAugury(table.id, riteId, { defer: true, stakeMult: effMult });
    if (!res) return;
    pendingRef.current = res.apply;
    setOutcome(res);
    setDoubleOutcome(null);
    setDoubleCran(0);
    startCast(res.bones, () => setOutcome({ ...res }));
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
    startCast(res.bones, () => setDoubleOutcome({ ...res }));
  };

  // Les rites offerts (le rite interdit attend son artefact).
  const rites = Object.values(AUGURY_RITES).filter((rite) => !rite.artifact || hasTempleArtifact(rite.artifact));

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
              fr: 'Paire haute : Faveur. Triple : grosse Faveur. Triple six : Coup de Vénus, un vol d’Icare offert. Carré de six : la cagnotte de la Maison. Quatre as : le Chien, la mise est perdue. Une mise plus grosse donne plus de Vénus et plus de Chiens.',
              en: 'High pair: Favor. Triple: big Favor. Triple six: Venus throw, a free Icarus flight. Four sixes: the House pot. Four aces: the Dog, the stake is lost. A bigger stake means more Venus and more Dogs.'
            })}
          </p>
          {/* Le détail des rites, qui ne s'écrit plus sur leurs plaques (retour Raph du
              2026-10-03 : « enlever toutes les explications, ce sera dans l'aide »). */}
          <ul className="stage-help-list">
            {rites.map((rite) => {
              const pay = auguryPaytable(table.id, rite.id);
              const st = auguryStake(table.id, rite.id);
              const ratio = (st.stake * effMult) / pay.stake;
              return (
                <li key={rite.id}>
                  <b>{tr(rite.label)}</b> : {tr({ fr: 'paire', en: 'pair' })} +{Math.round(pay.gains.pair * ratio)} · {tr({ fr: 'Vénus', en: 'Venus' })} +{Math.round(pay.gains.venus * ratio)}
                  {' · '}{rite.spread > 1.05 ? tr({ fr: 'plus de Vénus… et de Chiens', en: 'more Venus… and Dogs' })
                    : rite.spread < 0.95 ? tr({ fr: 'moins de Chiens', en: 'fewer Dogs' })
                      : tr({ fr: 'variance équilibrée', en: 'balanced variance' })}
                </li>
              );
            })}
          </ul>
          <p>
            {tr({
              fr: 'Pitié : chaque revers allège la prochaine offrande (le Chien compte double), les gains suivent la mise payée. Une mise perdue nourrit la cagnotte de la Maison. Après un gain, le quitte ou double rejoue la Faveur gagnée à une chance sur deux.',
              en: 'Mercy: each setback lightens the next offering (the Dog counts double), winnings follow the paid stake. A lost stake feeds the House pot. After a win, double or nothing replays the Favor won at even odds.'
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Refermer la table', en: 'Close the table' })}>✕</button>
      </div>

      {/* ⭐ LA TABLE DE L'ÂGE (2026-10-03, plaisirs/PlaisirsTable.jsx) : le croupier
          derrière la table des dés de la coupe ; les rites posés SUR le tapis, les
          osselets (ou les dés) jetés au milieu. */}
      {phase === 'stake' && (
        <PlaisirsTable game="des" className="ptable--bet ptable--rites" tablePx={270} nSpots={rites.length} dealer={0}>
          {(L) => (
            <>
              {/* Le solde de Faveur n'est plus répété ici : il s'affiche déjà en tête
                  de la Maison (passe densité 2026-07-17). */}
              <div className="ptable-hud">
                <div className="augury-odds">
                  <span className="augury-chip">{tr({ fr: 'chance', en: 'chance' })} {Math.round(pBase * 100)} %</span>
                  {rebate > 0.001 && (
                    <span
                      className="augury-chip augury-chip--favor"
                      {...tipProps(null, tr({ fr: 'Clémence : tes revers allègent l’offrande (les gains suivent la mise payée). Un gain remet le compteur à zéro.', en: 'Clemency: your setbacks lighten the offering (winnings follow the paid stake). A win resets the counter.' }))}
                    >
                      {tr({ fr: 'pitié', en: 'mercy' })} −{Math.round(rebate * 100)} %
                    </span>
                  )}
                </div>
                <CoffreSelect value={effMult} onChange={setCoffreMult} />
              </div>
              {rites.map((rite, i) => {
                const st = auguryStake(table.id, rite.id);
                const payable = faveur >= st.stake * effMult;
                return (
                  // Le bouton de jeu n'apparaît QUE sous la mise choisie (retour Raph
                  // 2026-07-17 : « dans le cadre de la mise choisie »).
                  <TableStake
                    key={rite.id}
                    x={L.spots[i % L.spots.length]}
                    y={L.spotY}
                    art={STAKE_ART[rite.id]}
                    label={tr(rite.label)}
                    cost={<><FaveurIcon /> {st.stake * effMult}{st.rebate > 0 ? ` (−${Math.round(st.rebate * 100)} %)` : ''}</>}
                    chosen={riteId === rite.id}
                    broke={!payable}
                    onPick={() => setRiteId(rite.id)}
                    tip={tipProps(tr(rite.label), tr(rite.desc))}
                    play
                    playLabel={diceSheet ? tr({ fr: 'Jeter les dés', en: 'Cast the dice' }) : tr({ fr: 'Jeter les osselets', en: 'Cast the knucklebones' })}
                    playDisabled={faveur < castCost}
                    onPlay={() => onCast()}
                  />
                );
              })}
            </>
          )}
        </PlaisirsTable>
      )}

      {phase !== 'stake' && (
        <PlaisirsTable game="des" className="ptable--play ptable--dice" tablePx={340} marks={false} dealer={0}>
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
                        ? <span className="augury-chip augury-chip--win">+{outcome.faveurGain} {tr({ fr: 'faveur', en: 'favor' })}</span>
                        : (
                          <>
                            <span className="augury-chip augury-chip--lose">−{outcome.stake} {tr({ fr: 'faveur', en: 'favor' })}</span>
                            <span className="augury-chip augury-chip--favor">
                              {tr({ fr: 'pitié', en: 'mercy' })} −{Math.round(auguryRebate(table.id) * 100)} %
                            </span>
                          </>
                        )}
                      {outcome.freeFlight && (
                        <span className="augury-chip augury-chip--venus">🪽 {tr({ fr: "vol d'Icare offert", en: 'free Icarus flight' })}</span>
                      )}
                      {/* Le carré de six : affiché SEULEMENT s'il a rapporté (un jackpot
                          sur cella vide donne 0 : annoncer « rafle » serait pris pour un bug). */}
                      {outcome.jackpot && outcome.jackpotGain > 0 && (
                        <span className="augury-chip augury-chip--venus">
                          🏺 +{outcome.jackpotGain} {tr({ fr: 'faveur', en: 'favor' })}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {phase === 'result' && isDouble && doubleOutcome && (
                  <>
                    <div className="augury-odds">
                      {doubleOutcome.win
                        ? <span className="augury-chip augury-chip--win">+{doubleOutcome.wager} {tr({ fr: 'faveur', en: 'favor' })}</span>
                        : <span className="augury-chip augury-chip--lose">−{doubleOutcome.wager} {tr({ fr: 'faveur', en: 'favor' })}</span>}
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
                        {...tipProps(null, tr({ fr: "Gagné : la Faveur redouble. Perdu : la Faveur gagnée est reprise. La Clémence ne s'applique pas.", en: 'Won: the Favor doubles. Lost: the Favor won is taken back. Clemency does not apply.' }))}
                        onClick={onDouble}
                      >
                        {tr({ fr: `Quitte ou double (${Math.round(AUGURY_DOUBLE_P * 100)} %)`, en: `Double or nothing (${Math.round(AUGURY_DOUBLE_P * 100)}%)` })}
                      </button>
                    )}
                    {/* Rejeu DIRECT (phase 7) : la mise est déjà mémorisée (riteId). Quand
                        le quitte ou double est offert, il reste le bouton VEDETTE. */}
                    <button type="button" disabled={faveur < castCost} onClick={() => { setDoubleOutcome(null); onCast(); }}>
                      {tr({ fr: `Rejeter (${castCost})`, en: `Cast again (${castCost})` })}
                    </button>
                    <button type="button" onClick={() => { setPhase('stake'); setRiteId(null); setOutcome(null); setDoubleOutcome(null); }}>
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
                    <button type="button" disabled={faveur < castCost} onClick={() => { setDoubleOutcome(null); setDoubleCran(0); onCast(); }}>
                      {tr({ fr: `Rejeter (${castCost})`, en: `Cast again (${castCost})` })}
                    </button>
                    <button type="button" onClick={() => { setPhase('stake'); setRiteId(null); setOutcome(null); setDoubleOutcome(null); setDoubleCran(0); }}>
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
