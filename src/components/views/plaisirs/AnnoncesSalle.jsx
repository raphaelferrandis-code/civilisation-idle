import { useEffect, useRef, useState } from 'react';
import { tableLimits } from '../../../game/core/actions/maisonTable.js';
import { scratchUnlocked } from '../../../game/core/actions/scratch.js';
import { icarusUnlocked } from '../../../game/core/actions/icarus.js';
import { blackjackUnlocked } from '../../../game/core/actions/blackjack.js';
import { slotsUnlocked } from '../../../game/core/actions/slots.js';
import { rouletteUnlocked } from '../../../game/core/actions/roulette.js';
import { coursesUnlocked } from '../../../game/core/actions/courses.js';
import { fmt } from '../../../game/core/utils.js';
import { tr } from '../../../game/core/i18n.js';
import '../../../styles/plaisirs-annonces.css';

/**
 * LA SALLE ANNONCE SES GROS GAINS (2026-10-04, « la sensation de gagner ») : de temps en
 * temps, en haut de la coupe, un habitant de la Maison vient de toucher gros à une
 * table — « 🎰 Un marin · +1,2 M ». Du décor sonore pour les yeux : aucune Faveur ne
 * bouge, le montant suit seulement les limites du moment pour rester vraisemblable.
 *
 * LES GAGNANTS QU'ON VOIT (lot 2 de docs/PLAN-NUIT-DES-PLAISIRS.md) : les pièces
 * jaillissent de la TABLE du jeu annoncé, dans la coupe (`posOf(id)` : son ancre en px
 * du cadre, ou null), et le gain monte au-dessus. `centre` : le milieu de la coupe
 * (le menu volant en masque la gauche).
 */

const QUI = [
  { fr: 'Un marin', en: 'A sailor' }, { fr: 'Une marchande', en: 'A merchant' },
  { fr: 'Un soldat', en: 'A soldier' }, { fr: 'Une danseuse', en: 'A dancer' },
  { fr: 'Un pêcheur', en: 'A fisherman' }, { fr: 'Une veuve', en: 'A widow' },
  { fr: 'Un scribe', en: 'A scribe' }, { fr: 'Un forgeron', en: 'A blacksmith' },
  { fr: 'Une prêtresse', en: 'A priestess' }, { fr: 'Un capitaine', en: 'A captain' },
  { fr: 'Une tisserande', en: 'A weaver' }, { fr: 'Un vieux joueur', en: 'An old gambler' },
  // Ceux qu'on ne s'attendait pas à croiser ici (la luxure, lot 3).
  { fr: 'Une veuve joyeuse', en: 'A merry widow' }, { fr: 'Un évêque en civil', en: 'A bishop in plain clothes' },
  { fr: 'Une comtesse sans son mari', en: 'A countess without her husband' }, { fr: 'Un notaire masqué', en: 'A masked notary' },
  { fr: 'Un prince incognito', en: 'A prince incognito' }, { fr: 'La maîtresse du gouverneur', en: "The governor's mistress" }
];
// `spot` : la salle du jeu dans la coupe (anchors.js) — les courses n'en ont pas.
const JEUX = [
  { icon: '🎲', spot: 'des', open: () => true },
  { icon: '🎟️', spot: 'tickets', open: scratchUnlocked },
  { icon: '🪽', spot: 'icare', open: icarusUnlocked },
  { icon: '🃏', spot: 'cartes', open: blackjackUnlocked },
  { icon: '🎰', spot: 'machines', open: slotsUnlocked },
  { icon: '🎡', spot: 'salon', open: rouletteUnlocked },
  { icon: '🏇', spot: null, open: coursesUnlocked }
];
// La gerbe de pièces : chacune part de la table, monte, retombe à côté.
const tirerPieces = () => Array.from({ length: 16 }, (_, i) => ({
  dx: Math.round((Math.random() - 0.5) * 140),
  up: -Math.round(40 + Math.random() * 60),
  down: Math.round(10 + Math.random() * 40),
  d: Math.round(i * 35 + Math.random() * 120)
}));

// Un gros coup vraisemblable : ×10 le plus souvent, ×50 parfois, ×250 rarement.
function tirerAnnonce() {
  const jeux = JEUX.filter((j) => { try { return j.open(); } catch { return false; } });
  const jeu = jeux[Math.floor(Math.random() * jeux.length)] || JEUX[0];
  const qui = QUI[Math.floor(Math.random() * QUI.length)];
  const r = Math.random();
  const mult = r < 0.62 ? 10 + Math.random() * 15 : r < 0.92 ? 30 + Math.random() * 70 : 150 + Math.random() * 350;
  const mise = tableLimits().base * (0.15 + Math.random() * 0.85);
  return { icon: jeu.icon, spot: jeu.spot, qui, gain: Math.round(mise * mult), key: Math.random(), pieces: tirerPieces() };
}

export default function AnnoncesSalle({ posOf = null, centre = '50%' }) {
  const [annonce, setAnnonce] = useState(null);
  // L'ancre de la table, lue au moment de l'annonce (la coupe défile entre-temps).
  const posRef = useRef(posOf);
  useEffect(() => { posRef.current = posOf; }, [posOf]);
  useEffect(() => {
    let alive = true, t1 = 0, t2 = 0;
    const annoncer = () => {
      const a = tirerAnnonce();
      const pos = a.spot && posRef.current ? posRef.current(a.spot) : null;
      setAnnonce({ ...a, pos });
      t2 = setTimeout(() => { if (alive) setAnnonce(null); }, 5200);
    };
    const suivante = () => {
      // Toutes les 50 à 110 s, et seulement quand la page se voit.
      t1 = setTimeout(() => {
        if (!alive) return;
        if (document.visibilityState === 'visible') annoncer();
        suivante();
      }, 50_000 + Math.random() * 60_000);
    };
    // La première arrive plus vite : on vient d'entrer, la salle vit déjà.
    t1 = setTimeout(() => {
      if (!alive) return;
      annoncer();
      suivante();
    }, 8_000 + Math.random() * 6_000);
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!annonce) return null;
  return (
    <>
      <div className="salle-annonce" key={annonce.key} aria-live="polite" style={{ left: centre }}>
        <span className="salle-annonce-icon" aria-hidden="true">{annonce.icon}</span>
        <span className="salle-annonce-qui">{tr(annonce.qui)}</span>
        <span className="salle-annonce-gain">+{fmt(annonce.gain)}</span>
      </div>
      {annonce.pos && (
        <div className="salle-pluie" key={'p' + annonce.key} style={{ left: annonce.pos.x, top: annonce.pos.y }} aria-hidden="true">
          {annonce.pieces.map((p, i) => (
            <i key={i} className="salle-piece" style={{ '--dx': p.dx + 'px', '--up': p.up + 'px', '--down': p.down + 'px', '--d': p.d + 'ms' }} />
          ))}
          <span className="salle-pluie-gain">+{fmt(annonce.gain)}</span>
        </div>
      )}
    </>
  );
}
