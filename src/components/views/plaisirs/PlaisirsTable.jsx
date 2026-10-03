import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bakeTableScene } from '../../../game/map/iso/plaisirsTableBake.js';
import { plaisirsCast } from '../../../game/map/iso/plaisirsCast.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../../../game/map/agents.js';
import { CM } from '../../../game/map/layout.js';
import { usePlaisirsBand } from '../../ui/plaisirsMaterial.js';
import '../../../styles/plaisirs-tables.css';

/**
 * LA TABLE DE JEU, EN GROS PLAN (Raph, 2026-10-03 : « que leurs tables collent à ce
 * qu'on voit, et que le lancement soit plus joli »). Derrière le jeu, la table de
 * l'âge peinte comme dans la coupe (iso/plaisirsTableBake.js) : le mur de la salle
 * et ses lampes, la CROUPIÈRE (la fille de l'âge, un sprite à la grille des filles),
 * le plateau en perspective, son rebord, sa ceinture, le sol.
 *
 * Le pixel de la table est un multiple ENTIER du pixel d'écran (`k`, réglé sur la
 * largeur) : la croupière y tombe pixel pour pixel. Les enfants sont posés par-dessus
 * (cartes, dés, mises) ; un enfant-fonction reçoit la géométrie en px CSS (`L` : les
 * trois places de mise, la ligne des mises, le haut et le bas du plateau…).
 */
const cache = new Map();
function bakeFor(band, game, W, H, tableH, marks, nSpots) {
  const key = [band, game, W, H, tableH, marks, nSpots].join(':');
  let b = cache.get(key);
  if (!b) {
    b = bakeTableScene(band, game, W, H, tableH, marks, nSpots);
    const toCv = (R) => {
      const cv = document.createElement('canvas');
      cv.width = R.w; cv.height = R.h;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(R.data), R.w, R.h), 0, 0);
      return cv;
    };
    b.cvBack = toCv(b.back);
    b.cvFront = toCv(b.front);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    cache.set(key, b);
  }
  return b;
}

// `dealer` : qui se tient derrière la table — 'g' (une fille de la Maison), 0 (un
// homme de l'âge), null (personne). `tablePx` : la hauteur de la table depuis le haut
// (le reste du cadre est le sol de la salle : la place des boutons).
export default function PlaisirsTable({ game, dealer = 'g', variant = 0, tablePx = null, marks = true, nSpots = 3, className = '', children }) {
  const band = usePlaisirsBand();
  const ref = useRef(null), cvRef = useRef(null);
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const upd = () => { const r = el.getBoundingClientRect(); setBox((b) => (b && b.w === Math.round(r.width) && b.h === Math.round(r.height) ? b : { w: Math.round(r.width), h: Math.round(r.height) })); };
    upd();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = box ? Math.max(3, Math.min(5, Math.round(box.w / 260))) : 4;
  const W = box ? Math.ceil(box.w / k) : 0, H = box ? Math.ceil(box.h / k) : 0;
  const tableH = tablePx ? Math.ceil(tablePx / k) : H;
  const bake = useMemo(() => (W > 40 && H > 30 && typeof document !== 'undefined' ? bakeFor(band, game, W, H, tableH, marks, nSpots) : null), [band, game, W, H, tableH, marks, nSpots]);

  // Le dessin : le mur, la croupière (ré-essayée tant que son image charge), la table.
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !bake) return undefined;
    let alive = true, tries = 0;
    const spec = dealer == null ? null : dealer === 'g'
      ? (plaisirsCast(band) || { girls: [] }).girls[variant % 3] || null
      : agentSpecFor(agentSetForBand(band), dealer, variant);
    const HDK = 32 / (CM.TILE * 0.71 * AGENT_SCALE);
    const draw = () => {
      if (!alive) return;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(bake.cvBack, 0, 0);
      let ok = true;
      if (spec) ok = !!drawNamedAgentIso(g, bake.dealer.x + 0.5, bake.dealer.y + 0.5, 1, spec.name, spec.scale * HDK, 0, false, 0, 0);
      g.drawImage(bake.cvFront, 0, 0);
      if (!ok && tries < 40) { tries += 1; setTimeout(draw, 250); }
    };
    draw();
    return () => { alive = false; };
  }, [bake, band, dealer, variant]);

  const L = bake ? {
    k, W, H,
    wall: bake.wallH * k,
    spots: bake.spots.map((x) => x * k + k / 2),
    spotY: bake.spotY * k,
    top: bake.surf.y0 * k,
    bottom: (bake.surf.y1 + 1) * k,
    floor: bake.surf.bottom * k,
    dealerX: bake.dealer.x * k,
  } : null;
  return (
    <div ref={ref} className={`ptable ptable--${game}${className ? ' ' + className : ''}`} data-kit={bake ? bake.kit : undefined} style={{ '--pt-k': k }}>
      {bake && <canvas ref={cvRef} className="ptable-art" width={bake.W} height={bake.H} style={{ width: bake.W * k, height: bake.H * k }} aria-hidden="true" />}
      <div className="ptable-layer">{typeof children === 'function' ? (L ? children(L) : null) : children}</div>
    </div>
  );
}

// UNE MISE POSÉE SUR LE TAPIS : son emblème sur le cercle peint (x, y : le centre du
// cercle, px CSS), la plaque (nom, prix, effet) dessous, le bouton de jeu sous la mise
// choisie. Garde la classe `stake-pick` : la vue y lit la phase de mise.
export function TableStake({ x, y, art, label, cost, info, chosen, broke, onPick, tip, play, playLabel, playDisabled, onPlay }) {
  return (
    <div className={`ptable-stake${chosen ? ' is-chosen' : ''}${broke ? ' is-broke' : ''}`} style={{ left: x, top: y - 58 }}>
      <button type="button" className="ptable-pick stake-pick" onClick={onPick} {...(tip || {})}>
        {art && <img className="ptable-emblem" src={art} alt="" aria-hidden="true" width={64} height={64} draggable="false" />}
        <span className="ptable-plaque">
          <strong>{label}</strong>
          <span className="ptable-cost">{cost}</span>
          {info && <span className="ptable-info">{info}</span>}
        </span>
      </button>
      {chosen && play && (
        <button type="button" className="scratch-buy stake-play ptable-play" disabled={playDisabled} onClick={onPlay}>{playLabel}</button>
      )}
    </div>
  );
}
