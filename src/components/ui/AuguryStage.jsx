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
import { clampStakeMult } from '../../game/core/actions/templePot.js';
import { REGULATION_ACTIONS_BY_ID } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import CoffreSelect from './CoffreSelect.jsx';
import StageHelp from './StageHelp.jsx';

/**
 * La Table des augures — SCÈNE INTÉGRÉE. MONNAIE FERMÉE (2026-07-16) : la mise
 * est en FAVEUR (tronc des offrandes), le gain aussi — paytable normalisée sur
 * un RTP < 1 (cf. actions/augures.js). La Clémence ALLÈGE la mise après des
 * revers (gains au prorata), elle ne touche plus la chance. Le moteur tire
 * l'issue et les os AVANT l'animation, mais l'EFFET est différé jusqu'à la
 * chute des dés (anti-spoiler). Phases : mise (rites) → jet → résultat
 * (quitte ou double sur la Faveur gagnée).
 */

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
              fr: 'Paire haute : Faveur. Triple : grosse Faveur. 1·3·4·6 : Coup de Vénus, un vol d’Icare offert. Quatre as : le Chien, la mise est perdue. Une mise plus grosse donne plus de Vénus et plus de Chiens.',
              en: 'High pair: Favor. Triple: big Favor. 1·3·4·6: Venus throw, a free Icarus flight. Four aces: the Dog, the stake is lost. A bigger stake means more Venus and more Dogs.'
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Refermer la table', en: 'Close the table' })}>✕</button>
      </div>

      {phase === 'stake' && (
        <>
          {/* Le solde de Faveur n'est plus répété ici : il s'affiche déjà en tête
              de la Table des augures, à cent pixels (passe densité 2026-07-17). */}
          <div className="augury-odds">
            <span className="augury-chip">{tr({ fr: 'chance', en: 'chance' })} {Math.round(pBase * 100)} %</span>
            {rebate > 0.001 && (
              <span
                className="augury-chip augury-chip--favor"
                title={tr({ fr: 'Clémence : tes revers allègent l’offrande (les gains suivent la mise payée). Un gain remet le compteur à zéro.', en: 'Clemency: your setbacks lighten the offering (winnings follow the paid stake). A win resets the counter.' })}
              >
                {tr({ fr: 'pitié : offrande', en: 'mercy: offering' })} −{Math.round(rebate * 100)} %
              </span>
            )}
          </div>
          <CoffreSelect value={effMult} onChange={setCoffreMult} />
          <div className="augury-rites">
            {Object.values(AUGURY_RITES).filter((rite) => !rite.artifact || hasTempleArtifact(rite.artifact)).map((rite) => {
              const pay = auguryPaytable(table.id, rite.id);
              const st = auguryStake(table.id, rite.id);
              const ratio = (st.stake * effMult) / pay.stake; // le coffre scale mise ET gains
              const pairFav = Math.round(pay.gains.pair * ratio);
              const venusFav = Math.round(pay.gains.venus * ratio);
              const payable = faveur >= st.stake * effMult;
              const chosen = riteId === rite.id;
              return (
                // La plaque est un conteneur : le corps (`stake-pick`) sélectionne,
                // et le bouton de jeu n'apparaît QUE dans la mise choisie, cousu au
                // pied de SA colonne (retour Raph 2026-07-17 : « il faut que
                // visuellement il soit dans le cadre de la mise choisie »).
                <div
                  key={rite.id}
                  className={`augury-rite${chosen ? ' is-chosen' : ''}${payable ? '' : ' is-broke'}`}
                >
                  <button
                    type="button"
                    className="stake-pick"
                    title={tr(rite.desc)}
                    onClick={() => setRiteId(rite.id)}
                  >
                    <strong>{tr(rite.label)}</strong>
                    <span className="augury-rite-cost">
                      <FaveurIcon /> {st.stake * effMult}{st.rebate > 0 ? ` (−${Math.round(st.rebate * 100)} %)` : ''}
                    </span>
                    <span className="augury-rite-fx">
                      <span className="augury-fx-win">{tr({ fr: 'paire', en: 'pair' })} +{pairFav} · {tr({ fr: 'Vénus', en: 'Venus' })} +{venusFav} {tr({ fr: 'faveur', en: 'favor' })}</span>
                      <span className="augury-fx-risk">{
                        rite.spread > 1.05 ? tr({ fr: 'sort extrême : plus de Vénus… et de Chiens', en: 'extreme fate: more Venus… and Dogs' })
                          : rite.spread < 0.95 ? tr({ fr: 'sort plus sage : moins de Chiens', en: 'calmer fate: fewer Dogs' })
                            : tr({ fr: 'variance équilibrée', en: 'balanced variance' })
                      }</span>
                    </span>
                  </button>
                  {chosen && (
                    <button
                      type="button"
                      className="augury-throw stake-play"
                      disabled={faveur < castCost}
                      onClick={() => onCast()}
                    >
                      {tr({ fr: 'Jeter les osselets', en: 'Cast the knucklebones' })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {phase !== 'stake' && (
        <>
          <div className="augury-dice" aria-live="polite">
            {(bones || []).map((v, i) => (
              <span
                key={`${isDouble ? 'd' : 't'}-${i}`}
                className={`augury-die${i < landed ? ' is-landed' : ''}${i < landed ? (v === 1 ? ' is-ace' : ' is-high') : ''}`}
              >
                {i < landed ? v : ''}
              </span>
            ))}
          </div>

          {phase === 'cast' && (
            <p className="augury-suspense">{tr({ fr: 'Les osselets roulent sur la table…', en: 'The knucklebones tumble across the table…' })}</p>
          )}

          {phase === 'result' && (isDouble ? doubleOutcome : outcome) && (
            <>
              {!isDouble && outcome.tier === 'venus' && <p className="augury-callout augury-callout--venus">{tr({ fr: 'Coup de Vénus !', en: 'Venus throw!' })}</p>}
              {!isDouble && outcome.tier === 'dog' && <p className="augury-callout augury-callout--dog">{tr({ fr: 'Le jet du Chien !', en: 'The Dog throw!' })}</p>}

              {!isDouble && (
                <>
                  <p className="augury-note">{outcome.note}</p>
                  <div className="augury-odds">
                    <span className={`augury-chip ${tierChipCls(outcome.tier)}`}>{tr(AUGURY_TIER_LABELS[outcome.tier])}</span>
                    {outcome.win
                      ? <span className="augury-chip augury-chip--win">+{outcome.faveurGain} {tr({ fr: 'faveur', en: 'favor' })}</span>
                      : (
                        <>
                          <span className="augury-chip augury-chip--lose">−{outcome.stake} {tr({ fr: 'faveur sacrifiée', en: 'favor sacrificed' })}</span>
                          <span className="augury-chip augury-chip--favor">
                            {tr({ fr: 'pitié : prochaine offrande', en: 'mercy: next offering' })} −{Math.round(auguryRebate(table.id) * 100)} %
                            {outcome.tier === 'dog' ? ` (${tr({ fr: 'Chien ×2', en: 'Dog ×2' })})` : ''}
                          </span>
                          <span className="augury-chip augury-chip--mut">🏺 {tr({ fr: "la cagnotte d'Icare s'épaissit", en: 'the Icarus pot thickens' })}</span>
                        </>
                      )}
                    {outcome.freeFlight && (
                      <span className="augury-chip augury-chip--venus">🪽 {tr({ fr: "vol d'Icare offert", en: 'free Icarus flight' })}</span>
                    )}
                  </div>
                  <menu className="choice-menu augury-actions">
                    {outcome.win && outcome.faveurGain > 0 && (
                      <button
                        type="button"
                        className="augury-tempt"
                        title={tr({ fr: "Gagné : la Faveur redouble. Perdu : la Faveur gagnée est reprise. La Clémence ne s'applique pas.", en: 'Won: the Favor doubles. Lost: the Favor won is taken back. Clemency does not apply.' })}
                        onClick={onDouble}
                      >
                        {tr({ fr: `Défier les dieux : quitte ou double (${Math.round(AUGURY_DOUBLE_P * 100)} %)`, en: `Defy the gods: double or nothing (${Math.round(AUGURY_DOUBLE_P * 100)}%)` })}
                      </button>
                    )}
                    {/* Rejeu DIRECT (phase 7) : la mise est déjà mémorisée (riteId), le
                        détour par l'écran de choix était un clic mort. Quand le quitte
                        ou double est offert, il reste le bouton VEDETTE (le seul vrai
                        levier stratégique) : le rejeu passe alors en simple bouton. */}
                    <button
                      type="button"
                      disabled={faveur < castCost}
                      onClick={() => { setDoubleOutcome(null); onCast(); }}
                    >
                      {tr({ fr: `Rejeter (${castCost})`, en: `Cast again (${castCost})` })}
                    </button>
                    <button type="button" onClick={() => { setPhase('stake'); setRiteId(null); setOutcome(null); setDoubleOutcome(null); }}>
                      {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                    </button>
                    <button type="button" onClick={onClose}>
                      {tr({ fr: 'Refermer la table', en: 'Close the table' })}
                    </button>
                  </menu>
                </>
              )}

              {isDouble && (
                <>
                  <p className="augury-note">
                    {doubleOutcome.win
                      ? tr({ fr: 'Défiés une seconde fois, les dieux sourient encore : la Faveur redouble.', en: 'Defied a second time, the gods smile again: the Favor doubles.' })
                      : tr({ fr: 'Les dieux se lassent d’être éprouvés : la Faveur gagnée leur revient.', en: 'The gods grow weary of being tested: the Favor won returns to them.' })}
                  </p>
                  <div className="augury-odds">
                    {doubleOutcome.win
                      ? <span className="augury-chip augury-chip--win">+{doubleOutcome.wager} {tr({ fr: 'faveur de plus', en: 'more favor' })}</span>
                      : <span className="augury-chip augury-chip--lose">−{doubleOutcome.wager} {tr({ fr: 'faveur reprise', en: 'favor taken back' })}</span>}
                    {maxCrans > 1 && (
                      <span className="augury-chip augury-chip--mut">
                        {tr({ fr: `marche ${doubleCran} sur ${maxCrans}`, en: `step ${doubleCran} of ${maxCrans}` })}
                      </span>
                    )}
                  </div>
                  <menu className="choice-menu augury-actions">
                    {doubleOutcome.win && doubleCran < maxCrans && (
                      <button
                        type="button"
                        className="augury-tempt"
                        title={tr({ fr: "L'Échelle de Vénus : tout ce qui est sur la table se rejoue. Gagné : la Faveur redouble encore. Perdu : tout revient aux dieux.", en: "The Ladder of Venus: everything on the table is staked again. Won: the Favor doubles again. Lost: it all returns to the gods." })}
                        onClick={onDouble}
                      >
                        {tr({ fr: `Défier encore : quitte ou double (${Math.round(AUGURY_DOUBLE_P * 100)} %)`, en: `Defy again: double or nothing (${Math.round(AUGURY_DOUBLE_P * 100)}%)` })}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={faveur < castCost}
                      onClick={() => { setDoubleOutcome(null); setDoubleCran(0); onCast(); }}
                    >
                      {tr({ fr: `Rejeter (${castCost})`, en: `Cast again (${castCost})` })}
                    </button>
                    <button type="button" onClick={() => { setPhase('stake'); setRiteId(null); setOutcome(null); setDoubleOutcome(null); setDoubleCran(0); }}>
                      {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                    </button>
                    <button type="button" onClick={onClose}>{tr({ fr: 'Refermer la table', en: 'Close the table' })}</button>
                  </menu>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
