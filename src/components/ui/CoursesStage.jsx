import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { lancerCourse, coursePartants, coursesUnlocked, coteAffichee, parisPropres, parisTotal, nomCheval } from '../../game/core/actions/courses.js';
import { nuitResteMin } from '../../game/core/actions/nuitGrandJeu.js';
import { tableLimits, chipRack, chipIndexOf } from '../../game/core/actions/maisonTable.js';
import { COURSES_RTP } from '../../game/core/balance.js';
import { state, save } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';
import { fmtCote } from '../../game/core/utils.js';
import { celebrerGain } from '../../game/core/grandsGains.js';
import { tipProps } from './HelpBubble.jsx';
import StageHelp from './StageHelp.jsx';
import Monte from './Monte.jsx';
import { FaveurIcon } from './FaveurIcon.jsx';
import { usePlaisirsBand } from './plaisirsMaterial.js';
import { PancarteFermee } from '../views/plaisirs/PlaisirsTable.jsx';
import { tablesFermees } from '../views/plaisirs/fermeture.js';
import { chipUrl, CHIP_ART } from '../views/plaisirs/chipsArt.js';
import { rememberBets, lastBetsOf, fmtMise } from '../views/plaisirs/miseMemory.js';
import {
  paintRacer, racerPalette, paintTrack, trackHeight, laneFoot, planCourse, avance, imageAt,
  TRACK, RACER_W, RACER_H, RACER_NOSE, RACER_FRAMES, CASAQUES
} from '../views/plaisirs/coursesArt.js';
import '../../styles/plaisirs-nuit.css';

/**
 * LES COURSES (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md). Six partants à cotes fixes
 * (actions/courses.js) : on choisit un jeton au râtelier, on le pose sur une ou
 * plusieurs plaques (clic droit : la plaque se vide), puis le départ. Le moteur tire
 * l'arrivée AVANT la course ; la piste la DÉROULE (coursesArt.planCourse : des écarts,
 * des changements de tête, une photo à l'arrivée quand c'est serré), et le gain n'est
 * versé qu'au passage du dernier coureur.
 */

const FIN_EXTRA_MS = 700;

// Une robe par nom : un cheval garde sa robe d'une course à l'autre.
const robeOf = (nom) => [...String(nom)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6;

const caches = { piste: new Map(), coureurs: new Map() };
function toile(w, h, paint) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  paint((x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); });
  return cv;
}
function pisteToile(band, W) {
  const key = band + ':' + W;
  let cv = caches.piste.get(key);
  if (!cv) {
    cv = toile(W, trackHeight(6), (put) => paintTrack(put, W, band, 6));
    if (caches.piste.size > 6) caches.piste.delete(caches.piste.keys().next().value);
    caches.piste.set(key, cv);
  }
  return cv;
}
function coureurToile(band, couloir, robe, frame) {
  const key = [band, couloir, robe, frame].join(':');
  let cv = caches.coureurs.get(key);
  if (!cv) {
    cv = toile(RACER_W, RACER_H, (put) => paintRacer(put, 0, 0, frame, racerPalette(band, couloir, robe)));
    caches.coureurs.set(key, cv);
  }
  return cv;
}

// La piste et ses coureurs à `ms` de course (plan null : tous dans les stalles).
function dessiner(g, W, band, partants, plan, ms, gagnant) {
  const H = trackHeight(6);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  g.drawImage(pisteToile(band, W), 0, 0);
  const run = W - TRACK.arrivee - TRACK.depart;
  // Le couloir du gagnant s'allume, une fois la course finie.
  if (gagnant != null) {
    const y0 = laneFoot(gagnant) - TRACK.couloir + 1;
    g.globalAlpha = 0.85;
    g.fillStyle = '#ffd76a';
    g.fillRect(0, y0, W, 1);
    g.fillRect(0, y0 + TRACK.couloir - 1, W, 1);
    g.globalAlpha = 1;
  }
  for (const x of partants.slice().sort((a, b) => a.couloir - b.couloir)) {
    const p = plan ? plan[x.couloir] : null;
    const a = p ? avance(p, ms) : 0;
    const nez = Math.round(TRACK.depart + a * run);
    const ox = nez - RACER_NOSE, pied = laneFoot(x.couloir), oy = pied - (RACER_H - 1);
    const frame = p ? imageAt(p, ms) : 2;
    const pal = racerPalette(band, x.couloir, robeOf(x.nom));
    // L'ombre au sol, puis (chevaux de lumière) la traînée.
    g.globalAlpha = 0.35;
    g.fillStyle = '#000000';
    g.fillRect(ox + 4, pied, 16, 1);
    if (pal.trainee && p && ms > 0 && ms < p.fin + 900) {
      g.fillStyle = pal.trainee;
      for (let i = 1; i <= 14; i += 1) {
        g.globalAlpha = 0.55 * (1 - i / 15);
        g.fillRect(ox + 3 - i, oy + 9 + ((i + (ms >> 6)) % 2), 1, 2);
      }
    }
    g.globalAlpha = 1;
    g.drawImage(coureurToile(band, x.couloir, robeOf(x.nom), frame % RACER_FRAMES), ox, oy);
  }
}

// La cote d'un partant (« ×4.2 ») : décimale au point dans les deux langues (fmtCote).
const coteTxt = (p) => fmtCote(coteAffichee(p), 1);

export default function CoursesStage({ onClose }) {
  const band = usePlaisirsBand();
  const faveur = useGameState((s) => s.faveur || 0);
  const cycles = useGameState((s) => s.cycles);
  useGameState((s) => s.maisonRank || 0);
  const ouvert = useGameState(() => coursesUnlocked());
  const resteNuit = useGameState(() => nuitResteMin());
  const { min, max } = tableLimits();
  const cap = Math.max(0, Math.min(max, Math.floor(faveur)));
  const rack = useMemo(() => chipRack(max), [max]);
  const [chipPick, setChip] = useState(() => rack[Math.max(0, rack.length - 4)] || 1);
  const chip = rack.includes(chipPick) ? chipPick : rack[rack.length - 1] || 1;
  const [paris, setParis] = useState(() => {
    const last = parisPropres(lastBetsOf('courses') || {});
    return parisTotal(last) <= cap ? last : {};
  });
  const [phase, setPhase] = useState('bet'); // bet | race | result
  const [partants, setPartants] = useState(() => coursePartants());
  const [res, setRes] = useState(null);
  const [photo, setPhoto] = useState(false);
  const pendingRef = useRef(null);
  const rafRef = useRef(0);
  const planRef = useRef(null);
  const wrapRef = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const [box, setBox] = useState(0);
  const total = parisTotal(paris);

  // La largeur de la piste : un pixel d'art = k pixels d'écran (la grille des tables,
  // plafonnée à 4 : à 5, la piste prenait toute la hauteur de la salle).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const upd = () => setBox(Math.round(el.getBoundingClientRect().width));
    upd();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = box ? Math.max(3, Math.min(4, Math.round(box / 300))) : 4;
  const W = box ? Math.floor(box / k) : 0;

  const flushPending = () => {
    if (pendingRef.current) {
      pendingRef.current();
      pendingRef.current = null;
    }
  };
  // F5 en pleine course : la mise est payée, la course DOIT se résoudre.
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
  useEffect(() => () => { flushPending(); cancelAnimationFrame(rafRef.current); }, []);

  const prevCyclesRef = useRef(cycles);
  useEffect(() => {
    if (prevCyclesRef.current !== cycles) onClose();
    prevCyclesRef.current = cycles;
  }, [cycles, onClose]);

  // La piste au repos (mises, résultat) : un seul dessin quand quelque chose change.
  const affiches = res && phase !== 'bet' ? res.partants : partants;
  useEffect(() => {
    if (!canvas || !W || phase === 'race') return;
    const plan = phase === 'result' ? planRef.current : null;
    const fin = plan ? Math.max(...affiches.map((x) => plan[x.couloir].fin)) + FIN_EXTRA_MS + 2000 : 0;
    dessiner(canvas.getContext('2d'), W, band, affiches, plan, fin, phase === 'result' && res ? res.gagnant : null);
  }, [canvas, W, band, affiches, phase, res]);

  const poser = (couloir) => {
    if (phase !== 'bet') return;
    setParis((p) => {
      const t = parisTotal(p);
      if (t + chip > cap) return p;
      return { ...p, [couloir]: (p[couloir] || 0) + chip };
    });
  };
  const retirer = (couloir) => {
    if (phase !== 'bet') return;
    setParis((p) => {
      const n = { ...p };
      delete n[couloir];
      return n;
    });
  };

  const onCourse = () => {
    if (phase !== 'bet' || total < min || total > cap) return;
    const r = lancerCourse(paris, { defer: true });
    if (!r) return;
    rememberBets('courses', r.paris);
    pendingRef.current = r.apply;
    const plan = planCourse(r.ordre);
    planRef.current = plan;
    setRes(r);
    setPhase('race');
    setPhoto(false);
    const fin = Math.max(...r.partants.map((x) => plan[x.couloir].fin));
    const t0 = performance.now();
    let photoVue = false;
    const step = () => {
      const ms = performance.now() - t0;
      if (canvas && W) dessiner(canvas.getContext('2d'), W, band, r.partants, plan, ms, ms >= fin ? r.gagnant : null);
      if (plan.photo && !photoVue && ms >= plan[r.gagnant].fin) { photoVue = true; setPhoto(true); }
      if (ms < fin + FIN_EXTRA_MS) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      flushPending();
      setPhase('result');
      if (r.gain > 0) celebrerGain({ gain: r.gain, stake: r.total, game: 'courses' });
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  };

  // La course suivante : le nouveau champ, les mises gardées sur les mêmes couloirs.
  const suivante = () => {
    planRef.current = null;
    setRes(null);
    setPhoto(false);
    setPartants(coursePartants());
    setParis((p) => (parisTotal(p) <= Math.min(max, Math.floor(state.faveur || 0)) ? p : {}));
    setPhase('bet');
  };

  const dernier = lastBetsOf('courses');
  const fermee = tablesFermees();
  const H = trackHeight(6);
  const rangDe = (couloir) => (res && phase === 'result' ? res.ordre.indexOf(couloir) : -1);

  return (
    <div className="courses-stage">
      <div className="regul-block-title stage-title">
        <StageHelp>
          <p>
            {tr({
              fr: `Choisis un jeton au râtelier, pose-le sur un ou plusieurs chevaux (clic droit : la plaque se vide), puis donne le départ. Le cheval gagnant paie sa cote, mise comprise ; les autres paris sont perdus. Chaque cote rend ${Math.round(COURSES_RTP * 100)} % sur la durée : le favori paie peu, l'outsider beaucoup. De ${fmtMise(min)} à ${fmtMise(max)} Faveur par course, tous paris compris.`,
              en: `Pick a chip at the rack, place it on one or more horses (right-click: the plaque empties), then start the race. The winning horse pays its odds, stake included; the other bets are lost. Every price returns ${Math.round(COURSES_RTP * 100)}% over time: the favourite pays little, the outsider a lot. From ${fmtMise(min)} to ${fmtMise(max)} Favor per race, all bets included.`
            })}
          </p>
        </StageHelp>
        <button type="button" className="stage-close" onClick={onClose} aria-label={tr({ fr: 'Refermer les courses', en: 'Close the races' })}>✕</button>
      </div>

      <div ref={wrapRef} className="courses-piste" style={W ? { height: H * k } : undefined}>
        {W > 0 && (
          <canvas
            ref={setCanvas}
            className="courses-toile"
            width={W}
            height={H}
            style={{ width: W * k, height: H * k }}
            role="img"
            aria-label={tr({ fr: 'La piste des courses', en: 'The racetrack' })}
          />
        )}
        <div className="courses-hud">{/* en haut à GAUCHE : la croix et l'aide tiennent la droite */}
          {resteNuit > 0 && (
            <span className="augury-chip duel-nuit" {...tipProps(tr({ fr: 'La Nuit du Grand Jeu', en: 'The Night of High Play' }), tr({ fr: `Encore ${resteNuit} min.`, en: `${resteNuit} min left.` }))}>
              🌙 {resteNuit} min
            </span>
          )}
          {photo && <span className="augury-chip augury-chip--venus courses-photo">{tr({ fr: 'Photo !', en: 'Photo!' })}</span>}
        </div>
        {fermee && <PancarteFermee y={Math.round((H * k) / 2)} />}
      </div>

      {/* Sous la piste : les plaques et le râtelier, dans une « table » pour en prendre
          la peau (jetons et boutons de table). */}
      <div className="ptable courses-dessous">
      <div className="courses-paris" role="group" aria-label={tr({ fr: 'Les partants', en: 'The runners' })}>
        {affiches.map((x) => {
          const mise = (phase === 'bet' ? paris : res?.paris || {})[x.couloir] || 0;
          const rang = rangDe(x.couloir);
          const cas = CASAQUES[x.couloir];
          return (
            <button
              key={x.couloir}
              type="button"
              className={`courses-plaque${mise ? ' has-mise' : ''}${rang === 0 ? ' is-win' : ''}`}
              disabled={phase === 'race'}
              onClick={() => poser(x.couloir)}
              onContextMenu={(e) => { e.preventDefault(); retirer(x.couloir); }}
              {...tipProps(`${x.couloir + 1}. ${nomCheval(x.nom)}`, tr({ fr: `Cote ${coteTxt(x.p)}, mise comprise. Clic droit : reprend la mise.`, en: `Odds ${coteTxt(x.p)}, stake included. Right-click: take the bet back.` }))}
            >
              <span className="courses-num" style={{ background: cas.S, color: cas.H }}>{x.couloir + 1}</span>
              <span className="courses-nom">{nomCheval(x.nom)}</span>
              <span className="courses-cote">{coteTxt(x.p)}</span>
              {mise > 0 && (
                <span className="courses-mise">
                  <img src={chipUrl(band, chipIndexOf(chipRack(Math.max(1, mise), 1)[0]))} alt="" aria-hidden="true" draggable="false" style={{ width: CHIP_ART.w, height: CHIP_ART.h }} />
                  {fmtMise(mise)}
                </span>
              )}
              {rang >= 0 && <span className={`courses-rang is-${rang + 1}`}>{rang + 1}</span>}
            </button>
          );
        })}
      </div>

      <div className="ptable-rack courses-rack" role="group" aria-label={tr({ fr: 'Jetons', en: 'Chips' })}>
        {phase !== 'result' ? (
          <>
            {rack.map((v) => (
              <button
                key={v}
                type="button"
                className={`ptable-chip${chip === v ? ' is-chosen' : ''}`}
                disabled={phase === 'race'}
                aria-pressed={chip === v}
                onClick={() => setChip(v)}
                aria-label={tr({ fr: `Jeton de ${fmtMise(v)}`, en: `${fmtMise(v)} chip` })}
              >
                <img src={chipUrl(band, chipIndexOf(v))} alt="" aria-hidden="true" draggable="false" style={{ width: CHIP_ART.w * Math.min(k, 3), height: CHIP_ART.h * Math.min(k, 3) }} />
                <span>{fmtMise(v)}</span>
              </button>
            ))}
            <span className="ptable-rack-sep" aria-hidden="true" />
            <span className="rl-total" {...tipProps(tr({ fr: 'La mise', en: 'The stake' }), tr({ fr: `De ${fmtMise(min)} à ${fmtMise(max)} Faveur, tous paris compris.`, en: `From ${fmtMise(min)} to ${fmtMise(max)} Favor, all bets included.` }))}>
              <FaveurIcon /> {fmtMise(total)}
            </span>
            <button type="button" className="ptable-rack-btn" disabled={!total || phase === 'race'} onClick={() => setParis({})}>
              {tr({ fr: 'Effacer', en: 'Clear' })}
            </button>
            <button
              type="button"
              className="ptable-rack-btn"
              disabled={phase === 'race' || !dernier || parisTotal(dernier) > cap}
              onClick={() => setParis(parisPropres(dernier))}
            >
              {tr({ fr: 'Même mise', en: 'Same bet' })}
            </button>
            <button type="button" className="scratch-buy rl-lancer" disabled={phase === 'race' || !ouvert || fermee || total < min || total > cap} onClick={onCourse}>
              {tr({ fr: 'Départ', en: 'Start' })}
            </button>
          </>
        ) : (
          <>
            <span className={`rl-gain${res && res.gain > 0 ? ' is-win' : ''}`}>
              {res && res.gain > 0 ? <>+<Monte value={res.gain} format={fmtMise} /> <FaveurIcon /></> : <>−{fmtMise(res ? res.total : 0)} <FaveurIcon /></>}
            </span>
            <button type="button" className="ptable-rack-btn is-tapis" onClick={suivante}>
              {tr({ fr: 'Course suivante', en: 'Next race' })}
            </button>
            <button type="button" className="ptable-rack-btn" onClick={onClose}>
              {tr({ fr: 'Refermer', en: 'Close' })}
            </button>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
