import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  castAugury,
  doubleAugury,
  auguryCost,
  auguryBaseOdds,
  auguryTierBones,
  AUGURY_RITES,
  AUGURY_TIER_LABELS
} from '../../game/core/actions.js';
import { clemencyBonus } from '../../game/core/mechanics.js';
import { canPayCost, costLabel } from '../../game/core/utils.js';
import { AUGURY_DOUBLE_P, GAMBLE_P_MAX, AUGURY_FAVEUR } from '../../game/core/balance.js';
import { REGULATION_ACTIONS_BY_ID } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';

/**
 * La Table des augures — SCÈNE INTÉGRÉE. Jeux DÉCOUPLÉS (2026-07-14) : le gain
 * est de la FAVEUR (monnaie méta), plus de relief/Rupture — perdre ne coûte
 * que la mise. Le moteur (actions/augures.js) tire l'issue et les os AVANT
 * l'animation, mais l'EFFET est différé jusqu'à la chute des dés (anti-spoiler).
 * Phases : mise (rites) → jet → résultat (quitte ou double sur la Faveur gagnée).
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
  const [riteId, setRiteId] = useState('classique');
  const [outcome, setOutcome] = useState(null);
  const [doubleOutcome, setDoubleOutcome] = useState(null);
  const [bones, setBones] = useState(null);
  const [landed, setLanded] = useState(0);
  useGameState((s) => s.instability); // coûts/clémence/faveur vivants (1 Hz)
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
    setRiteId('classique');
    setOutcome(null);
    setDoubleOutcome(null);
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
  const clem = clemencyBonus(table.id, pBase);
  const pEff = Math.min(GAMBLE_P_MAX, pBase + clem);
  const isDouble = Boolean(doubleOutcome);

  const onCast = () => {
    const res = castAugury(table.id, riteId, { defer: true });
    if (!res) return;
    pendingRef.current = res.apply;
    setOutcome(res);
    setDoubleOutcome(null);
    startCast(res.bones, () => setOutcome({ ...res }));
  };

  const onDouble = () => {
    if (!outcome || outcome.faveurGain <= 0) return;
    const res = doubleAugury(table.id, outcome.faveurGain, { defer: true });
    if (!res) return;
    pendingRef.current = res.apply;
    setDoubleOutcome(res);
    startCast(auguryTierBones(res.win ? 'triple' : 'dog'), () => setDoubleOutcome({ ...res }));
  };

  const tierChipCls = (tier) => tier === 'venus' ? 'augury-chip--venus'
    : tier === 'triple' || tier === 'pair' ? 'augury-chip--win'
    : 'augury-chip--lose';

  return (
    <div className="augury-stage">
      <div className="regul-block-title stage-title">
        <span>🎲 {a.label}</span>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Refermer la table', en: 'Close the table' })}>✕</button>
      </div>

      {phase === 'stake' && (
        <>
          <div className="augury-odds">
            <span className="augury-chip">{tr({ fr: 'chance', en: 'chance' })} {Math.round(pBase * 100)} %</span>
            {clem > 0.001 && (
              <span className="augury-chip augury-chip--favor">
                + {Math.round(clem * 100)} % {tr({ fr: 'de clémence', en: 'clemency' })}
              </span>
            )}
            <span className="augury-chip augury-chip--total">= {Math.round(pEff * 100)} %</span>
          </div>
          <div className="augury-rites">
            {Object.values(AUGURY_RITES).map((rite) => {
              const cost = auguryCost(table.id, rite.id);
              const payable = cost && canPayCost(cost);
              const pairFav = Math.round(AUGURY_FAVEUR.pair * rite.costMult);
              const venusFav = Math.round(AUGURY_FAVEUR.venus * rite.costMult);
              return (
                <button
                  key={rite.id}
                  type="button"
                  className={`augury-rite${riteId === rite.id ? ' is-chosen' : ''}${payable ? '' : ' is-broke'}`}
                  title={tr(rite.desc)}
                  onClick={() => setRiteId(rite.id)}
                >
                  <strong>{tr(rite.label)}</strong>
                  <span className="augury-rite-cost">{cost ? costLabel(cost) : '—'}</span>
                  <span className="augury-rite-fx">
                    <span className="augury-fx-win">{tr({ fr: 'paire', en: 'pair' })} +{pairFav} · {tr({ fr: 'Vénus', en: 'Venus' })} +{venusFav} {tr({ fr: 'faveur', en: 'favor' })}</span>
                    <span className="augury-fx-risk">{
                      rite.spread > 1.05 ? tr({ fr: 'sort extrême : plus de Vénus… et de Chiens', en: 'extreme fate: more Venus… and Dogs' })
                        : rite.spread < 0.95 ? tr({ fr: 'sort plus sage : moins de Chiens', en: 'calmer fate: fewer Dogs' })
                          : tr({ fr: 'variance équilibrée', en: 'balanced variance' })
                    }</span>
                  </span>
                </button>
              );
            })}
          </div>
          <menu className="choice-menu augury-actions">
            <button
              type="button"
              className="augury-throw"
              disabled={!canPayCost(auguryCost(table.id, riteId) || {})}
              onClick={onCast}
            >
              {tr({ fr: 'Jeter les osselets', en: 'Cast the knucklebones' })}
            </button>
          </menu>
          <p className="stage-footnote">
            {tr({
              fr: 'Lecture des os — paire haute : Faveur · triple : grosse Faveur · 1·3·4·6 : Coup de Vénus (vol d’Icare offert) · les as sont funestes · quatre as : le Chien. La mise choisie déforme le sort : gros sacrifice = plus de Vénus, mais plus de Chiens.',
              en: 'Reading the bones — high pair: Favor · triple: big Favor · 1·3·4·6: Venus throw (free Icarus flight) · aces are dire · four aces: the Dog. Your stake shapes fate: a great sacrifice means more Venus, but more Dogs.'
            })}
          </p>
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
                          <span className="augury-chip augury-chip--mut">+{outcome.faveurGain} {tr({ fr: 'faveur (consolation)', en: 'favor (consolation)' })}</span>
                          <span className="augury-chip augury-chip--favor">
                            {tr({ fr: 'clémence', en: 'clemency' })} +{Math.round(clemencyBonus(table.id, pBase) * 100)} %
                            {outcome.tier === 'dog' ? ` (${tr({ fr: 'pitié ×2', en: 'mercy ×2' })})` : ''}
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
                        title={tr({ fr: 'Gagné : la Faveur redouble. Perdu : la Faveur gagnée est reprise. La Clémence ne joue pas — les dieux se lassent.', en: 'Won: the Favor doubles. Lost: the Favor won is taken back. Clemency does not apply — the gods grow weary.' })}
                        onClick={onDouble}
                      >
                        {tr({ fr: `Défier les dieux — quitte ou double (${Math.round(AUGURY_DOUBLE_P * 100)} %)`, en: `Defy the gods — double or nothing (${Math.round(AUGURY_DOUBLE_P * 100)}%)` })}
                      </button>
                    )}
                    <button type="button" onClick={() => { setPhase('stake'); setOutcome(null); setDoubleOutcome(null); }}>
                      {tr({ fr: 'Rejouer', en: 'Play again' })}
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
                  </div>
                  <menu className="choice-menu augury-actions">
                    <button type="button" onClick={() => { setPhase('stake'); setOutcome(null); setDoubleOutcome(null); }}>
                      {tr({ fr: 'Rejouer', en: 'Play again' })}
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
