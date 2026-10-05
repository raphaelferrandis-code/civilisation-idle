import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { state, save, saveSoon } from '../../game/core/state.js';
import { spinRoulette, couleurOf, betsTotal, cleanBets, rouletteLimits } from '../../game/core/actions/roulette.js';
import { chipRack, chipIndexOf } from '../../game/core/actions/maisonTable.js';
import { celebrerGain } from '../../game/core/grandsGains.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import Monte from './Monte.jsx';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import { usePlaisirsBand } from './plaisirsMaterial.js';
import PlaisirsTable from '../views/plaisirs/PlaisirsTable.jsx';
import { chipUrl, CHIP_ART } from '../views/plaisirs/chipsArt.js';
import { fmtMise, rememberBets, lastBetsOf } from '../views/plaisirs/miseMemory.js';
import { drawWheel, spinPose, pocketAngle, WHEEL_D, WHEEL_H } from '../views/plaisirs/rouletteArt.js';
import '../../styles/plaisirs-tables.css';
import '../../styles/plaisirs-roulette.css';

/**
 * LA ROULETTE DU SALON (lot 3 des gains « vrai casino », 2026-10-04,
 * docs/PLAN-GAINS-CASINO.md). La croupière derrière sa table, la roue peinte par le
 * code à gauche du tapis, le tapis des paris à droite : un jeton choisi au râtelier,
 * un clic sur une case l'y pose (clic droit : la case se vide). « Lancer la bille » :
 * la roue tourne, la bille court à rebours, tombe dans sa case ; les cases gagnantes
 * s'allument. Pas de phrase à l'écran : les règles sont dans l'aide « ? ».
 *
 * `vip` : LE SALON PRIVÉ du boudoir (Raph, 2026-10-04, au titre de Mécène) — la même
 * table, sans plafond : la mise va jusqu'à toute la bourse. Feutre de velours.
 */

const SPIN_MS = 3800;

// AU TÉLÉPHONE (2026-10-04) : sous 720 px, le tapis de 14 colonnes posé sur la table
// donnait des cases de 10 px. Il quitte la table et se déplie EN DESSOUS, debout, comme
// sur une vraie table vue du joueur : le zéro en haut, douze rangées de trois numéros,
// les « 2:1 » en bas, douzaines et chances simples sur le côté. La roue se centre.
const ETROIT = '(max-width: 720px)';
function abonnerEtroit(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(ETROIT);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const lireEtroit = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(ETROIT).matches;
// La place d'une case dans le tapis DEBOUT (grille 5 colonnes × 14 rangées).
function placeDebout(key) {
  if (key === 'n0') return { gridColumn: '3 / span 3', gridRow: 1 };
  const n = /^n(\d+)$/.exec(key);
  if (n) { const v = Number(n[1]); return { gridColumn: 3 + ((v - 1) % 3), gridRow: 2 + Math.floor((v - 1) / 3) }; }
  const col = { c1: 3, c2: 4, c3: 5 }[key];
  if (col) return { gridColumn: col, gridRow: 14 };
  const d = { d1: 0, d2: 1, d3: 2 }[key];
  if (d != null) return { gridColumn: 2, gridRow: `${2 + 4 * d} / span 4` };
  const i = DEHORS.findIndex((x) => x.key === key);
  if (i >= 0) return { gridColumn: 1, gridRow: `${2 + 2 * i} / span 2` };
  return undefined;
}

const NOMBRES = Array.from({ length: 12 }, (_, col) => [3 * col + 3, 3 * col + 2, 3 * col + 1]); // [haut, milieu, bas] par colonne
const DEHORS = [
  { key: 'manque', fr: '1-18', en: '1-18' },
  { key: 'pair', fr: 'PAIR', en: 'EVEN' },
  { key: 'rouge', fr: '◆', en: '◆', cls: 'is-rouge' },
  { key: 'noir', fr: '◆', en: '◆', cls: 'is-noir' },
  { key: 'impair', fr: 'IMPAIR', en: 'ODD' },
  { key: 'passe', fr: '19-36', en: '19-36' }
];
const DOUZAINES = [
  { key: 'd1', fr: '1re 12', en: '1st 12' },
  { key: 'd2', fr: '2e 12', en: '2nd 12' },
  { key: 'd3', fr: '3e 12', en: '3rd 12' }
];

function Jeton({ band, amount }) {
  if (!(amount > 0)) return null;
  const rack = chipRack(Math.max(1, amount), 1);
  const idx = chipIndexOf(rack[0]);
  const s = 1; // à l'échelle 1 : le jeton et son montant tiennent dans la case
  return (
    <span className="rl-jeton" aria-hidden="true">
      <img src={chipUrl(band, idx)} alt="" draggable="false" style={{ width: CHIP_ART.w * s, height: CHIP_ART.h * s }} />
      <small>{fmtMise(amount)}</small>
    </span>
  );
}

export default function RouletteStage({ onClose, table, vip: vipProp = false }) {
  const vip = Boolean(vipProp || (table && table.vip));
  const memo = vip ? 'rouletteVip' : 'roulette';
  const faveur = useGameState((s) => s.faveur || 0);
  useGameState((s) => s.maisonRank || 0);
  const history = useGameState((s) => (Array.isArray(s.rouletteHistory) ? s.rouletteHistory.join(',') : ''));
  const band = usePlaisirsBand();
  const etroit = useSyncExternalStore(abonnerEtroit, lireEtroit, () => false);
  const { min, max } = rouletteLimits(vip);
  const rack = useMemo(() => chipRack(max), [max]);
  const [chipPick, setChip] = useState(() => rack[Math.max(0, rack.length - 4)] || 1);
  // Un jeton qui ne tient plus sous la limite : le plus gros du râtelier le remplace.
  const chip = rack.includes(chipPick) ? chipPick : rack[rack.length - 1] || 1;
  const dernierJeu = lastBetsOf(memo);
  const [bets, setBets] = useState(() => {
    const last = cleanBets(lastBetsOf(memo) || {});
    return betsTotal(last) <= Math.min(max, state.faveur || 0) ? last : {};
  });
  const [phase, setPhase] = useState('bet');
  const [result, setResult] = useState(null);
  const pendingRef = useRef(null);
  const timerRef = useRef(0);
  // La toile de la roue, en ÉTAT : la table la monte après avoir mesuré sa place, et
  // la roue au repos doit se peindre à ce moment-là.
  const [canvas, setCanvas] = useState(null);
  const poseRef = useRef({ wheel: 0, ball: null, ballR: 0.66 });

  const total = betsTotal(bets);
  const cap = Math.max(0, Math.min(max, Math.floor(faveur)));

  // Fermer la table pendant que la bille roule : le tour est encaissé quand même.
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
  }, []);

  // F5 / fermeture d'onglet pendant que la bille roule : aucun cleanup React ne court au
  // rechargement — le gain tiré serait perdu (revue du 2026-10-04 ; même garde que les
  // osselets et les tickets). save() explicite : la sauvegarde de sortie est passée.
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

  // La roue au repos (ou arrêtée) : la bille dans la dernière case tombée.
  const lastN = history ? Number(history.split(',').pop()) : null;
  useEffect(() => {
    if (phase === 'spin' || !canvas) return;
    const p = poseRef.current;
    const ballN = phase === 'result' && result ? result.n : lastN;
    drawWheel(canvas.getContext('2d'), p.wheel, ballN == null ? null : p.wheel + pocketAngle(ballN), 0.66);
  }, [phase, result, lastN, canvas]);

  const addBet = (key) => {
    if (phase !== 'bet') return;
    const room = cap - total;
    const add = Math.min(chip, room);
    if (add <= 0) return;
    setBets((b) => ({ ...b, [key]: (b[key] || 0) + add }));
  };
  const clearBet = (key) => {
    if (phase !== 'bet') return;
    setBets((b) => { const o = { ...b }; delete o[key]; return o; });
  };

  const onSpin = (paris = bets) => {
    const t = betsTotal(paris);
    if (t < min || t > Math.min(max, state.faveur || 0)) return;
    const res = spinRoulette(paris, { defer: true, vip });
    if (!res) return;
    // Mises débitées : écrites sous 300 ms, pas à l'autosave des 10 s — tuer le
    // processus après avoir vu la case ne les rembourse plus (SAV-15).
    saveSoon(300);
    rememberBets(memo, res.bets);
    pendingRef.current = res.apply;
    setBets(res.bets);
    setResult(res);
    setPhase('spin');
    const cv = canvas;
    if (etroit && cv && cv.scrollIntoView) cv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const wheel0 = poseRef.current.wheel % (Math.PI * 2);
    let raf = 0, t0 = null;
    const frame = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / SPIN_MS);
      const pose = spinPose(u, res.n, wheel0);
      poseRef.current = pose;
      if (cv) drawWheel(cv.getContext('2d'), pose.wheel, pose.ball, pose.ballR);
      if (u < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // La révélation tient à l'horloge, pas à l'animation (une fenêtre masquée gèle le rAF).
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      cancelAnimationFrame(raf);
      poseRef.current = spinPose(1, res.n, wheel0);
      if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
      setResult({ ...res });
      setPhase('result');
      celebrerGain({ gain: res.faveurGain, stake: res.stakeFaveur, game: 'roulette' });
    }, SPIN_MS);
  };

  const gagnant = (key) => phase === 'result' && result && result.wins.includes(key);
  // La case où la bille est tombée, gagnée ou non (le « dolly » des vraies tables).
  const tombe = (key) => phase === 'result' && result && key === `n${result.n}`;
  const cell = (key, label, cls = '', style = undefined) => (
    <button
      key={key}
      type="button"
      style={style}
      className={`rl-case ${cls}${bets[key] ? ' has-bet' : ''}${tombe(key) ? ' is-tombe' : ''}${gagnant(key) ? ' is-win' : ''}`}
      onClick={() => addBet(key)}
      onContextMenu={(e) => { e.preventDefault(); clearBet(key); }}
      disabled={phase === 'spin'}
    >
      <span className="rl-label">{label}</span>
      <Jeton band={band} amount={bets[key]} />
    </button>
  );

  const histChips = history ? history.split(',').map(Number) : [];

  // Les cases du tapis. Couché (sur la table) : les numéros portent leur place, les
  // autres cases la tiennent de leur classe (plaisirs-roulette.css). Debout : tout est
  // placé ici (placeDebout).
  const cases = (debout) => {
    const p = (key, style) => (debout ? placeDebout(key) : style);
    return (
      <>
        {cell('n0', '0', 'is-vert rl-zero', p('n0'))}
        {NOMBRES.map((col, ci) => col.map((n, ri) => cell(`n${n}`, String(n), `is-${couleurOf(n)}`, p(`n${n}`, { gridColumn: ci + 2, gridRow: ri + 1 }))))}
        {cell('c3', '2:1', 'rl-col rl-col-3', p('c3'))}
        {cell('c2', '2:1', 'rl-col rl-col-2', p('c2'))}
        {cell('c1', '2:1', 'rl-col rl-col-1', p('c1'))}
        {DOUZAINES.map((d, i) => cell(d.key, tr({ fr: d.fr, en: d.en }), `rl-douz rl-douz-${i + 1}`, p(d.key)))}
        {DEHORS.map((d, i) => cell(d.key, tr({ fr: d.fr, en: d.en }), `rl-dehors rl-dehors-${i + 1} ${d.cls || ''}`, p(d.key)))}
      </>
    );
  };

  // Le râtelier (jetons, mise, boutons) : sur la table, ou au pied de l'écran au
  // téléphone. `k` : l'échelle des jetons (celle de la table).
  const ratelier = (k) => (phase !== 'result' ? (
              <>
                {rack.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`ptable-chip${chip === v ? ' is-chosen' : ''}`}
                    disabled={phase === 'spin'}
                    aria-pressed={chip === v}
                    onClick={() => setChip(v)}
                    aria-label={tr({ fr: `Jeton de ${fmtMise(v)}`, en: `${fmtMise(v)} chip` })}
                  >
                    <img src={chipUrl(band, chipIndexOf(v))} alt="" aria-hidden="true" draggable="false" style={{ width: CHIP_ART.w * k, height: CHIP_ART.h * k }} />
                    <span>{fmtMise(v)}</span>
                  </button>
                ))}
                <span className="ptable-rack-sep" aria-hidden="true" />
                <span className="rl-total" {...tipProps(tr({ fr: 'La mise', en: 'The stake' }), tr({ fr: `De ${fmtMise(min)} à ${fmtMise(max)} Faveur, tous paris compris.`, en: `From ${fmtMise(min)} to ${fmtMise(max)} Favor, all bets included.` }))}>
                  <FaveurIcon /> {fmtMise(total)}
                </span>
                <button type="button" className="ptable-rack-btn" disabled={!total || phase === 'spin'} onClick={() => setBets({})}>
                  {tr({ fr: 'Effacer', en: 'Clear' })}
                </button>
                <button
                  type="button"
                  className="ptable-rack-btn"
                  disabled={phase === 'spin' || !dernierJeu || betsTotal(dernierJeu) > cap}
                  onClick={() => setBets(cleanBets(dernierJeu))}
                >
                  {tr({ fr: 'Même mise', en: 'Same bet' })}
                </button>
                <button type="button" className="scratch-buy rl-lancer" disabled={phase === 'spin' || total < min || total > cap} onClick={() => onSpin()}>
                  {tr({ fr: 'Lancer la bille', en: 'Roll the ball' })}
                </button>
              </>
            ) : (
              <>
                <span className={`rl-gain${result && result.faveurGain > 0 ? ' is-win' : ''}`}>
                  {result && result.faveurGain > 0 ? <>+<Monte value={result.faveurGain} /> <FaveurIcon /></> : '—'}
                </span>
                <button type="button" className="ptable-rack-btn is-tapis" disabled={total > cap || total < min} onClick={() => onSpin(bets)}>
                  {tr({ fr: 'Relancer', en: 'Roll again' })} ({fmtMise(total)})
                </button>
                <button type="button" className="ptable-rack-btn" onClick={() => { setPhase('bet'); setResult(null); }}>
                  {tr({ fr: 'Changer de mise', en: 'Change stake' })}
                </button>
              </>
            ));

  return (
    <div className="roulette-stage">
      <div className="regul-block-title stage-title">
        <StageHelp>
          <p>
            {tr({
              fr: `Choisis un jeton au râtelier, pose-le sur une ou plusieurs cases du tapis (clic droit : la case se vide), puis lance la bille. Un numéro plein paie 35 contre 1, une douzaine ou une colonne 2 contre 1, une chance simple (rouge, noir, pair, impair, 1-18, 19-36) 1 contre 1. Le zéro ne fait gagner que son plein.`,
              en: `Pick a chip at the rack, place it on one or more squares of the layout (right-click: the square empties), then roll the ball. A straight number pays 35 to 1, a dozen or a column 2 to 1, an even chance (red, black, even, odd, 1-18, 19-36) 1 to 1. Zero only pays its straight bet.`
            })}
          </p>
          <p>
            {vip
              ? tr({
                fr: `Le salon privé n'a pas de plafond : la mise totale va de ${fmtMise(min)} à toute ta bourse. Une roue à un seul zéro : chaque pari rend 97,3 % sur la durée.`,
                en: `The private salon has no ceiling: the total stake goes from ${fmtMise(min)} to your whole purse. A single-zero wheel: every bet returns 97.3% over time.`
              })
              : tr({
                fr: `La mise totale va de ${fmtMise(min)} à ${fmtMise(max)} Faveur. Une roue à un seul zéro : chaque pari rend 97,3 % sur la durée.`,
                en: `The total stake goes from ${fmtMise(min)} to ${fmtMise(max)} Favor. A single-zero wheel: every bet returns 97.3% over time.`
              })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la table', en: 'Leave the table' })}>✕</button>
      </div>

      <PlaisirsTable game="roulette" className={`ptable--roulette${vip ? ' ptable--vip' : ''}${etroit ? ' is-etroit' : ''}`} tablePx={etroit ? 280 : 310} marks={false}>
        {(L) => {
          const surfH = Math.max(40, L.bottom - L.top);
          const s = Math.max(1, Math.floor((surfH * 0.92) / WHEEL_H));
          const wheelW = WHEEL_D * s, wheelH = WHEEL_H * s;
          // Debout, le tapis n'est plus sur la table : la roue s'y centre.
          const left = etroit ? Math.round((L.W * L.k - wheelW) / 2) : Math.round(L.W * L.k * 0.03);
          const tapisLeft = left + wheelW + Math.round(L.k * 4);
          return (
            <>
              <div className="ptable-hud">
                {vip && <span className="rl-vip-plaque">{tr({ fr: 'Salon privé', en: 'Private salon' })}</span>}
                {histChips.length > 0 && (
                  <div className="rl-history" aria-label={tr({ fr: 'Dernières cases', en: 'Last numbers' })}>
                    {histChips.map((n, i) => <span key={`${n}-${i}`} className={`rl-hist is-${couleurOf(n)}`}>{n}</span>)}
                  </div>
                )}
              </div>
              <div className="rl-roue" style={{ left, top: L.top + Math.round((surfH - wheelH) / 2), width: wheelW, height: wheelH }}>
                <canvas ref={setCanvas} width={WHEEL_D} height={WHEEL_H} style={{ width: wheelW, height: wheelH }} aria-hidden="true" />
                {phase === 'result' && result && (
                  <span className={`rl-numero is-${result.couleur}`}>{result.n}</span>
                )}
              </div>
              {!etroit && (
                <div
                  className="rl-tapis"
                  style={{ left: tapisLeft, top: L.top + 2, width: `calc(100% - ${tapisLeft + Math.round(L.W * L.k * 0.03)}px)`, height: surfH - 4 }}
                >
                  {cases(false)}
                </div>
              )}

              {!etroit && (
                <div className="ptable-rack rl-rack" style={{ left: '50%', top: L.floor + 6 }} role="group" aria-label={tr({ fr: 'Jetons', en: 'Chips' })}>
                  {ratelier(L.k)}
                </div>
              )}
            </>
          );
        }}
      </PlaisirsTable>
      {etroit && (
        // La classe `ptable` : les cases et les jetons y gardent leur habit de table.
        <div className="ptable rl-dessous">
          <div className={`rl-tapis is-debout${vip ? ' is-vip' : ''}`}>
            {cases(true)}
          </div>
          <div className="ptable-rack rl-rack is-pied" role="group" aria-label={tr({ fr: 'Jetons', en: 'Chips' })}>
            {ratelier(3)}
          </div>
        </div>
      )}
    </div>
  );
}
