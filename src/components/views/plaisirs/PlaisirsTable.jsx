import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bakeTableScene } from '../../../game/map/iso/plaisirsTableBake.js';
import { plaisirsCast } from '../../../game/map/iso/plaisirsCast.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../../../game/map/agents.js';
import { CM } from '../../../game/map/layout.js';
import { usePlaisirsBand } from '../../ui/plaisirsMaterial.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import { tr } from '../../../game/core/i18n.js';
import { tablesFermees } from './fermeture.js';
import { onGainReaction } from '../../../game/core/grandsGains.js';
import '../../../styles/plaisirs-tables.css';

// La crise terminale FERME les tables de la Maison (les actions des jeux refusent toutes
// de jouer). Le dire : une pancarte « FERMÉ » pendue sur la table, plutôt que des boutons
// qui ne répondent pas (2026-10-04, Raph : « je clique il ne se passe rien »).
// `texte`, `titre`, `info` : une autre pancarte (le VIDEUR du vingt-et-un, lot 4 de
// docs/PLAN-NUIT-DES-PLAISIRS.md).
export function PancarteFermee({ x = '50%', y, texte, titre, info }) {
  return (
    <div
      className="ptable-closed"
      style={{ left: x, top: y }}
      {...tipProps(titre || tr({ fr: 'Table fermée', en: 'Table closed' }), info || tr({ fr: 'La crise terminale ferme les tables de la Maison.', en: 'The terminal crisis closes the House tables.' }))}
    >
      {texte || tr({ fr: 'FERMÉ', en: 'CLOSED' })}
    </div>
  );
}

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

// Une image de la bande de repos de la croupière (la cadence de la marche des filles).
const DEALER_FRAME_MS = 160;

// LA HAUTEUR D'UN HOMME DE L'ÂGE (pieds → haut de la tête) à l'échelle de la table,
// mesurée une fois sur son image : les planches n'ont pas toutes la même marge au-dessus
// de la tête. null tant que l'image charge (la table ré-essaie).
const hauteurs = new Map();
function hauteurDe(name, sc) {
  const key = name + ':' + sc.toFixed(4);
  if (hauteurs.has(key)) return hauteurs.get(key);
  if (typeof document === 'undefined') return null;
  const S = 192, pied = 184;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const r = drawNamedAgentIso(g, S / 2 + 0.5, pied + 0.5, 1, name, sc, 0, false, 0, 0);
  if (!r) return null;
  // Seules les colonnes de la silhouette (l'ombre portée déborde sur le côté).
  const x0 = Math.max(0, Math.floor(S / 2 - r.drawW / 2)), x1 = Math.min(S, Math.ceil(S / 2 + r.drawW / 2));
  const d = g.getImageData(0, 0, S, S).data;
  let haut = pied;
  for (let y = 0; y < pied && haut === pied; y += 1) {
    for (let x = x0; x < x1; x += 1) if (d[(y * S + x) * 4 + 3] > 0) { haut = y; break; }
  }
  const h = pied - haut;
  hauteurs.set(key, h);
  return h;
}

// `dealer` : qui se tient derrière la table — 'g' (une fille de la Maison), 0 (un
// homme de l'âge), null (personne). Toutes les tables gardent LA MÊME croupière, la
// première fille de la troupe de l'âge (Raph, 2026-10-04) : les tables n'ont plus à le
// préciser. `tablePx` : la hauteur de la table depuis le haut (le reste du cadre est le
// sol de la salle : la place des boutons).
export default function PlaisirsTable({ game, dealer = 'g', variant = 0, tablePx = null, marks = true, nSpots = 3, className = '', children }) {
  const band = usePlaisirsBand();
  const ref = useRef(null), cvRef = useRef(null);
  const [box, setBox] = useState(null);
  // LE BAISER DE LA CROUPIÈRE (lot 3, « la luxure ») : à chaque beau gain (×3 et plus),
  // elle t'envoie un baiser — une bouche rouge qui s'envole de ses lèvres.
  const [baiser, setBaiser] = useState(0);
  useEffect(() => (dealer === 'g' ? onGainReaction(() => setBaiser((n) => n + 1)) : undefined), [dealer]);
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

  // Le dessin : le mur, la croupière, la table. La croupière RESPIRE (Raph, 2026-10-04 :
  // « anime-la un peu ») : sa bande de repos ({nom}-repos, scripts/plaisirsGirls.mjs —
  // le souffle, un clignement, un regard) joue en boucle, et la toile ne se redessine
  // qu'au changement d'image (160 ms). Tant que la bande charge, si elle manque, ou si
  // le joueur demande moins d'animations : la pose fixe, ré-essayée tant qu'une image
  // charge. ⚠ Seule la première fille de chaque troupe a sa bande (`spec.repos`,
  // plaisirsCast.js) : la courtisane du duel (DuelStage, deuxième ou troisième fille)
  // garde sa pose fixe sans demander une bande absente.
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !bake) return undefined;
    let alive = true, tries = 0, timer = 0;
    const spec = dealer == null ? null : dealer === 'g'
      ? (plaisirsCast(band) || { girls: [] }).girls[variant % 3] || null
      : agentSpecFor(agentSetForBand(band), dealer, variant);
    const HDK = 32 / (CM.TILE * 0.71 * AGENT_SCALE);
    const repos = spec && dealer === 'g' ? spec.repos || null : null;
    const calme = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now) => {
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(bake.cvBack, 0, 0);
      let anime = false, ok = true;
      if (spec) {
        // Un homme de l'âge (le grand flambeur du duel) est plus grand qu'une fille de la
        // Maison : il S'ASSIED à la table — ses pieds descendent sous le plateau jusqu'à
        // ce que sa tête tienne dans le cadre, à la hauteur de celle de la croupière.
        const sc = spec.scale * HDK;
        const h = dealer !== 'g' ? hauteurDe(spec.name, sc) : null;
        const assis = h != null ? Math.max(0, h + 3 - bake.dealer.y) : 0;
        const x = bake.dealer.x + 0.5, y = bake.dealer.y + assis + 0.5;
        anime = !!(repos && !calme && drawNamedAgentIso(g, x, y, 1, repos, sc, 0, true, now, 0));
        if (!anime) ok = !!drawNamedAgentIso(g, x, y, 1, spec.name, sc, 0, false, 0, 0);
      }
      g.drawImage(bake.cvFront, 0, 0);
      return { anime, ok };
    };
    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      const { anime, ok } = draw(now);
      if (anime) timer = setTimeout(loop, DEALER_FRAME_MS - (now % DEALER_FRAME_MS) + 1);
      else if ((!ok || (repos && !calme)) && tries < 40) { tries += 1; timer = setTimeout(loop, 250); }
    };
    loop();
    return () => { alive = false; clearTimeout(timer); };
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
  const fermee = tablesFermees();
  return (
    <div ref={ref} className={`ptable ptable--${game}${className ? ' ' + className : ''}${fermee ? ' is-fermee' : ''}`} data-kit={bake ? bake.kit : undefined} style={{ '--pt-k': k }}>
      {bake && <canvas ref={cvRef} className="ptable-art" width={bake.W} height={bake.H} style={{ width: bake.W * k, height: bake.H * k }} aria-hidden="true" />}
      <div className="ptable-layer">{typeof children === 'function' ? (L ? children(L) : null) : children}</div>
      {fermee && L && <PancarteFermee y={Math.round((L.top + L.bottom) / 2)} />}
      {baiser > 0 && L && dealer === 'g' && (
        <span key={baiser} className="ptable-baiser" style={{ left: Math.round(L.dealerX + L.k * 8), top: Math.round(L.wall * 0.5) }} aria-hidden="true">💋</span>
      )}
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
