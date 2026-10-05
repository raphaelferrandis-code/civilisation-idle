import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { save, renderCache } from '../../game/core/state.js';
import { spinRoue, roueReady, roueValues, roueWaitMinutes } from '../../game/core/actions/roueMaison.js';
import { ROUE_SEGMENTS_H } from '../../game/core/balance.js';
import { tr } from '../../game/core/i18n.js';
import { fmt } from '../../game/core/utils.js';
import { sonSlots } from '../../game/audio/slotsSound.js';
import { slotsLook } from '../../game/map/iso/plaisirsSlotsArt.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import Monte from './Monte.jsx';
import { usePlaisirsBand } from './plaisirsMaterial.js';
import { drawRoue, spinAngle, roueIndexAt, ROUE_W, ROUE_H } from '../views/plaisirs/roueArt.js';
import '../../styles/plaisirs-roue.css';

/**
 * LA ROUE DE LA MAISON (2026-10-04, « comme les applis de casino ») : un tour offert
 * par heure. La roue peinte au pixel, le doigt en haut ; « Tourner » : la roue court,
 * ses ampoules aussi, le cliquet claque à chaque case, elle freine et se pose ; le gain
 * monte. Pas de phrase : la valeur des cases est dans l'aide « ? ».
 */

const SPIN_MS = 4200;
const SCALE = 2;

export default function RoueStage({ onClose }) {
  useGameState((s) => s.roueAt || 0);
  useGameState((s) => s.bestEraIndex || 0);
  // Horloge 1 Hz : le tick, pas l'instabilité (figée en crise terminale ou une
  // fois convergée — BUG-114). L'attente du prochain tour.
  useGameState(() => renderCache.tickNow);
  const band = usePlaisirsBand();
  const look = slotsLook(band);
  const [canvas, setCanvas] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | spin | done
  const [result, setResult] = useState(null);
  const angleRef = useRef(0);
  const pendingRef = useRef(null);
  const timerRef = useRef(0);
  const rafRef = useRef(0);
  const ready = roueReady();
  const values = roueValues();

  // Fermer pendant le tour : le gain est versé quand même.
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
  }, []);

  // F5 / fermeture d'onglet pendant que la roue tourne : aucun cleanup React ne court au
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

  // La roue au repos (ou posée) : la case gagnante luit, toutes les ampoules brillent.
  useEffect(() => {
    if (!canvas || phase === 'spin') return;
    drawRoue(canvas.getContext('2d'), angleRef.current, {
      lit: 0, glow: phase === 'done' && result ? result.index : -1, allLit: phase === 'done'
    });
  }, [canvas, phase, result]);

  const son = (nom, fort) => { try { sonSlots(nom, look, fort); } catch { /* le son est un plus */ } };

  const onSpin = () => {
    if (phase === 'spin') return;
    const res = spinRoue({ defer: true });
    if (!res) return;
    pendingRef.current = res.apply;
    setResult(res);
    setPhase('spin');
    son('levier');
    const from = angleRef.current;
    let t0 = null, lastIdx = roueIndexAt(from), lastTick = 0;
    const frame = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / SPIN_MS);
      const a = spinAngle(u, from, res.index);
      angleRef.current = a;
      const idx = roueIndexAt(a);
      if (idx !== lastIdx && now - lastTick > 45) { lastIdx = idx; lastTick = now; son('cliquet', 0.5); }
      if (canvas) drawRoue(canvas.getContext('2d'), a, { lit: Math.floor(now / 110) });
      if (u < 1) rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    // La révélation tient à l'horloge, pas à l'animation (une fenêtre masquée gèle le rAF).
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      cancelAnimationFrame(rafRef.current);
      angleRef.current = spinAngle(1, from, res.index);
      if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
      setPhase('done');
      son(res.h >= Math.max(...ROUE_SEGMENTS_H) ? 'jackpot' : res.h >= 2 ? 'gain3' : 'gain2');
    }, SPIN_MS + 60);
  };

  const attente = roueWaitMinutes();
  const lo = Math.min(...values), hi = Math.max(...values);

  return (
    <div className="roue-stage">
      <div className="regul-block-title stage-title">
        <StageHelp>
          <p>
            {tr({
              fr: `Un tour offert par heure. Seize cases égales, de ${fmt(lo)} à ${fmt(hi)} Faveur : plus la case porte de pièces, plus elle paie ; la couronne paie le plus. Les valeurs suivent les recettes de la Maison.`,
              en: `One free spin per hour. Sixteen equal slices, from ${fmt(lo)} to ${fmt(hi)} Favor: the more coins a slice shows, the more it pays; the crown pays the most. The values follow the House takings.`
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Quitter la roue', en: 'Leave the wheel' })}>✕</button>
      </div>
      <div className="roue-body">
        <canvas ref={setCanvas} width={ROUE_W} height={ROUE_H} style={{ width: ROUE_W * SCALE, height: ROUE_H * SCALE }} aria-hidden="true" />
        <div className={`roue-gain${phase === 'done' ? ' is-shown' : ''}`} aria-live="polite">
          {phase === 'done' && result ? <>+<Monte value={result.gain} dur={1300} /> <FaveurIcon /></> : null}
        </div>
        {/* Le tour suivant se rejoue depuis la roue posée : la phase ne revient jamais
            à 'idle', et une roue laissée ouverte restait grisée l'heure passée. */}
        <button
          type="button"
          className="scratch-buy roue-go"
          disabled={phase === 'spin' || !ready}
          onClick={onSpin}
          {...(!ready && phase !== 'spin' && attente > 0 ? tipProps(tr({ fr: 'La roue', en: 'The wheel' }), tr({ fr: `Prochain tour dans ${attente} min.`, en: `Next spin in ${attente} min.` })) : {})}
        >
          {tr({ fr: 'Tourner', en: 'Spin' })}
        </button>
      </div>
    </div>
  );
}
