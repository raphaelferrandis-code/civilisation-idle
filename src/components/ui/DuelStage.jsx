import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { jouerDuel, duelOuvert, duelMiseMin } from '../../game/core/actions/duel.js';
import { FLAMBEURS, flambeurDeLaNuit, nuitResteMin } from '../../game/core/actions/nuitGrandJeu.js';
import { DUEL_RTP, DUEL_MANCHES } from '../../game/core/balance.js';
import { state, save, saveSoon } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';
import { fmtCote } from '../../game/core/utils.js';
import { celebrerGain } from '../../game/core/grandsGains.js';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import PlaisirsTable from '../views/plaisirs/PlaisirsTable.jsx';
import TableMise from '../views/plaisirs/TableMise.jsx';
import { rememberStake, lastStakeOf, fmtMise } from '../views/plaisirs/miseMemory.js';
import Monte from './Monte.jsx';
import { usePlaisirsBand, diceSheetFor } from './plaisirsMaterial.js';
import { wonderKitForBand } from '../../game/map/iso/wonderKits.js';
import { preparerTable, sonDuel } from '../../game/audio/tables/tables.js';
import '../../styles/plaisirs-nuit.css';

/**
 * LE DUEL DES GRANDS FLAMBEURS (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md). Le grand
 * flambeur de la Nuit se tient derrière la table, à la place de la croupière : un
 * homme de l'âge, ou une courtisane de la Maison. Quatre dés chacun (les os gravés aux
 * premiers âges), la plus haute somme prend la manche, au meilleur des trois. La mise
 * est libre, sans plafond, au-dessus d'une heure de recettes (actions/duel.js) : le
 * moteur tire tout le duel d'un coup, l'écran le DÉROULE manche par manche, et le gain
 * n'est versé qu'au dernier dé (anti-spoiler, comme aux osselets).
 */

// Le déroulé d'une manche (ms) : les dés du flambeur tombent un à un, puis les tiens,
// puis le verdict ; la manche suivante part après MANCHE_MS.
const FL_START = 260;
const JO_START = 1000;
const STEP = 150;
const VERDICT = 1650;
const MANCHE_MS = 2500;
const FIN_EXTRA = 650;

// Le flambeur à la table : une courtisane (une fille de la Maison, pas la croupière)
// ou un homme de l'âge — chacun garde son visage d'une nuit à l'autre.
function dealerOf(fl) {
  const i = Math.max(0, FLAMBEURS.indexOf(fl));
  return fl && fl.femme ? { dealer: 'g', variant: 1 + (i % 2) } : { dealer: 0, variant: i };
}

function Pastilles({ n }) {
  const gagner = Math.floor(DUEL_MANCHES / 2) + 1;
  return (
    <span className="duel-pips" aria-hidden="true">
      {Array.from({ length: gagner }, (_, i) => <i key={i} className={i < n ? 'is-won' : ''} />)}
    </span>
  );
}

const somme = (des) => des.reduce((a, b) => a + b, 0);

export default function DuelStage({ onClose }) {
  const timersRef = useRef([]);
  // Le duel tiré mais pas encore versé : flushé si la scène ferme en plein déroulé.
  const pendingRef = useRef(null);
  const faveur = useGameState((s) => s.faveur || 0);
  const cycles = useGameState((s) => s.cycles);
  useGameState((s) => s.nuitFlambeur);
  const ouvert = useGameState(() => duelOuvert());
  const resteNuit = useGameState(() => nuitResteMin());
  const band = usePlaisirsBand();
  const diceSheet = diceSheetFor(band, band >= 7 ? wonderKitForBand(band).pal.glow : null);
  const min = duelMiseMin();
  const limits = { min, max: Math.max(min, Math.floor(faveur)) };
  const [stake, setStake] = useState(() => {
    const last = lastStakeOf('duel');
    const f = Math.floor(state.faveur || 0);
    return Math.max(min, Math.min(f, last || 2 * min));
  });
  const [phase, setPhase] = useState('stake');
  const [res, setRes] = useState(null);
  const [vue, setVue] = useState({ mi: 0, fl: 0, jo: 0, verdict: false });

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const flushPending = () => {
    if (pendingRef.current) {
      pendingRef.current();
      pendingRef.current = null;
    }
  };

  // F5 en plein duel : la mise est payée, le duel DOIT se résoudre.
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
  useEffect(() => () => { flushPending(); clearTimers(); }, []);
  // Les sons de la table (audio/tables, lot 11) : les dés de l'âge, les manches.
  useEffect(() => { preparerTable('duel', band); }, [band]);

  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  const onDuel = (amount = stake) => {
    if (amount < min || faveur < amount) return;
    const r = jouerDuel(amount, { defer: true });
    if (!r) return;
    // Mise débitée : écrite sous 300 ms, pas à l'autosave des 10 s — tuer le
    // processus sur une manche perdue ne la rembourse plus (SAV-15).
    saveSoon(300);
    rememberStake('duel', r.mise);
    setStake(r.mise);
    pendingRef.current = r.apply;
    setRes(r);
    setVue({ mi: 0, fl: 0, jo: 0, verdict: false });
    setPhase('play');
    clearTimers();
    let t = 0;
    r.manches.forEach((m, i) => {
      const at = (ms, v) => timersRef.current.push(setTimeout(() => setVue(v), t + ms));
      // Les sons (audio/tables, lot 11) suivent les mêmes instants : les dés secoués
      // puis lancés, chacun qui retombe, le verdict de la manche.
      const son = (ms, quoi, o) => timersRef.current.push(setTimeout(() => sonDuel(band, quoi, o), t + Math.max(0, ms)));
      if (i > 0) at(0, { mi: i, fl: 0, jo: 0, verdict: false });
      son(FL_START - 260, 'lance', { camp: 'flambeur' });
      for (let d = 0; d < 4; d += 1) {
        at(FL_START + d * STEP, { mi: i, fl: d + 1, jo: 0, verdict: false });
        son(FL_START + d * STEP, 'tombe', { camp: 'flambeur', i: d });
      }
      son(JO_START - 300, 'lance', { camp: 'joueur' });
      for (let d = 0; d < 4; d += 1) {
        at(JO_START + d * STEP, { mi: i, fl: 4, jo: d + 1, verdict: false });
        son(JO_START + d * STEP, 'tombe', { camp: 'joueur', i: d });
      }
      at(VERDICT, { mi: i, fl: 4, jo: 4, verdict: true });
      son(VERDICT, 'manche', { gagnant: m.gagnant });
      if (i < r.manches.length - 1) t += MANCHE_MS;
    });
    timersRef.current.push(setTimeout(() => {
      flushPending();
      setPhase('result');
      const palier = r.gagne ? celebrerGain({ gain: r.gain, stake: r.mise, game: 'duel' }) : null;
      sonDuel(band, 'verdict', { gagne: Boolean(r.gagne), gros: Boolean(palier) });
    }, t + VERDICT + FIN_EXTRA));
  };

  const fl = res && phase !== 'stake' ? res.flambeur : flambeurDeLaNuit();
  const { dealer, variant } = dealerOf(fl);
  const sheetStyle = diceSheet ? { '--bones-sheet': `url("${diceSheet}")` } : undefined;
  const nuitChip = resteNuit > 0 && (
    <span
      className="augury-chip duel-nuit"
      {...tipProps(tr({ fr: 'La Nuit du Grand Jeu', en: 'The Night of High Play' }), tr({ fr: `Encore ${resteNuit} min.`, en: `${resteNuit} min left.` }))}
    >
      🌙 {resteNuit} min
    </span>
  );

  // Les dés d'un camp pour la manche affichée : `n` sont tombés.
  const rangee = (des, n, camp) => (
    <div className="augury-dice duel-dice" style={sheetStyle}>
      {des.map((v, i) => (
        <span
          key={i}
          className={`augury-die${i < n ? ' is-landed' : ''}`}
          data-face={i < n ? v : undefined}
          role="img"
          aria-label={i < n ? `${camp} ${v}` : tr({ fr: 'dé en l’air', en: 'die in the air' })}
        />
      ))}
    </div>
  );

  const manche = res ? res.manches[Math.min(vue.mi, res.manches.length - 1)] : null;
  const jouees = res ? res.manches.slice(0, vue.mi + (vue.verdict ? 1 : 0)) : [];
  const scoreJ = jouees.filter((m) => m.gagnant === 'joueur').length;
  const scoreF = jouees.filter((m) => m.gagnant === 'flambeur').length;
  const sommeCls = (qui) => (vue.verdict && manche ? (manche.gagnant === qui ? ' is-win' : manche.gagnant ? ' is-lose' : '') : '');
  const rejouable = ouvert && res && faveur >= res.mise && res.mise >= min;
  const courir = res && res.gagne ? res.gain : 0;

  return (
    <div className="duel-stage">
      <div className="regul-block-title stage-title">
        <StageHelp>
          <p>
            {tr({
              fr: `Le grand flambeur de la Nuit te défie aux dés : quatre dés chacun, la plus haute somme prend la manche, une égalité se rejoue. Le premier à deux manches emporte les deux mises, moins la part de la Maison (${fmtCote(2 * DUEL_RTP, 2)} ta mise). Une heure de recettes au moins (${fmtMise(min)}), et pas de plafond.`,
              en: `The Night's high roller challenges you at dice: four dice each, the higher total takes the round, a tie is replayed. First to two rounds takes both stakes, less the House's share (${fmtCote(2 * DUEL_RTP, 2)} your stake). At least one hour of takings (${fmtMise(min)}), and no ceiling.`
            })}
          </p>
          <p>
            {tr({
              fr: 'Le duel s’ouvre pendant la Nuit du Grand Jeu, et à toute heure pour un Prince de la Maison.',
              en: 'The duel opens during the Night of High Play, and at any hour for a Prince of the House.'
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Refermer la table', en: 'Close the table' })}>✕</button>
      </div>

      {phase === 'stake' && (
        <PlaisirsTable game="des" dealer={dealer} variant={variant} className="ptable--bet ptable--mise ptable--duel" tablePx={270} nSpots={1}>
          {(L) => (
            <>
              <div className="ptable-hud">
                <span className="augury-chip duel-nom">{tr(fl.nom)}</span>
                {nuitChip}
              </div>
              <TableMise
                game="duel"
                x={L.spots[0]}
                y={L.spotY}
                k={L.k}
                rackY={L.floor + 6}
                rackX={Math.round((L.W * L.k) / 2)}
                label={tr({ fr: 'Duel', en: 'Duel' })}
                sub={fmtCote(2 * DUEL_RTP, 2)}
                stake={stake}
                onStake={setStake}
                faveur={faveur}
                limits={limits}
                playLabel={tr({ fr: 'Défier', en: 'Challenge' })}
                playDisabled={!ouvert}
                onPlay={() => onDuel()}
              />
            </>
          )}
        </PlaisirsTable>
      )}

      {phase !== 'stake' && res && manche && (
        <PlaisirsTable game="des" dealer={dealer} variant={variant} className="ptable--play ptable--dice ptable--duel" tablePx={340} marks={false}>
          {(L) => {
            const mid = Math.round((L.top + L.bottom) / 2);
            return (
              <>
                <div className="ptable-hud">
                  <span className="augury-chip duel-nom">{tr(fl.nom)} <Pastilles n={scoreF} /></span>
                  <span className="augury-chip duel-nom is-toi">{tr({ fr: 'Toi', en: 'You' })} <Pastilles n={scoreJ} /></span>
                  {nuitChip}
                </div>
                <div className="ptable-throw duel-row is-flambeur" style={{ top: mid - 78 }}>
                  {rangee(manche.flambeur, vue.fl, tr(fl.nom))}
                  <span className={`duel-somme${sommeCls('flambeur')}`}>{vue.fl >= 4 ? somme(manche.flambeur) : ''}</span>
                </div>
                <div className="ptable-throw duel-row is-joueur" style={{ top: mid + 6 }}>
                  {rangee(manche.joueur, vue.jo, tr({ fr: 'Toi', en: 'You' }))}
                  <span className={`duel-somme${sommeCls('joueur')}`}>{vue.jo >= 4 ? somme(manche.joueur) : ''}</span>
                </div>

                <div className="ptable-say" style={{ top: L.top + 6 }} aria-live="polite">
                  {phase === 'play' && vue.verdict && manche.gagnant === null && (
                    <span className="augury-chip augury-chip--mut">{tr({ fr: 'Égalité', en: 'Tie' })}</span>
                  )}
                  {phase === 'result' && (
                    <div className="augury-odds">
                      {res.gagne
                        ? <span className="augury-chip augury-chip--win">+<Monte value={res.gain} format={fmtMise} /> {tr({ fr: 'faveur', en: 'favor' })}</span>
                        : <span className="augury-chip augury-chip--lose">−{fmtMise(res.mise)} {tr({ fr: 'faveur', en: 'favor' })}</span>}
                    </div>
                  )}
                </div>

                <div className="ptable-actions" style={{ top: L.floor + 8 }}>
                  {phase === 'result' && (
                    <menu className="choice-menu augury-actions">
                      {courir > 0 && (
                        <button
                          type="button"
                          className="augury-tempt"
                          disabled={!ouvert || faveur < courir}
                          onClick={() => onDuel(courir)}
                          {...tipProps(null, tr({ fr: 'Tout le gain sur un nouveau duel.', en: 'The whole win on a new duel.' }))}
                        >
                          {tr({ fr: `Laisser courir (${fmtMise(courir)})`, en: `Let it ride (${fmtMise(courir)})` })}
                        </button>
                      )}
                      <button type="button" disabled={!rejouable} onClick={() => onDuel(res.mise)}>
                        {tr({ fr: `Revanche (${fmtMise(res.mise)})`, en: `Rematch (${fmtMise(res.mise)})` })}
                      </button>
                      <button type="button" onClick={() => { setPhase('stake'); setRes(null); }}>
                        {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                      </button>
                      <button type="button" className="btn-close" onClick={onClose}>
                        {tr({ fr: 'Refermer la table', en: 'Close the table' })}
                      </button>
                    </menu>
                  )}
                </div>
              </>
            );
          }}
        </PlaisirsTable>
      )}
    </div>
  );
}
