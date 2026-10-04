import { useEffect, useState } from 'react';
import { tableLimits } from '../../../game/core/actions/maisonTable.js';
import { scratchUnlocked } from '../../../game/core/actions/scratch.js';
import { icarusUnlocked } from '../../../game/core/actions/icarus.js';
import { blackjackUnlocked } from '../../../game/core/actions/blackjack.js';
import { slotsUnlocked } from '../../../game/core/actions/slots.js';
import { rouletteUnlocked } from '../../../game/core/actions/roulette.js';
import { fmt } from '../../../game/core/utils.js';
import { tr } from '../../../game/core/i18n.js';
import '../../../styles/plaisirs-annonces.css';

/**
 * LA SALLE ANNONCE SES GROS GAINS (2026-10-04, « la sensation de gagner ») : de temps en
 * temps, en haut de la coupe, un habitant de la Maison vient de toucher gros à une
 * table — « 🎰 Un marin · +1,2 M ». Du décor sonore pour les yeux : aucune Faveur ne
 * bouge, le montant suit seulement les limites du moment pour rester vraisemblable.
 */

const QUI = [
  { fr: 'Un marin', en: 'A sailor' }, { fr: 'Une marchande', en: 'A merchant' },
  { fr: 'Un soldat', en: 'A soldier' }, { fr: 'Une danseuse', en: 'A dancer' },
  { fr: 'Un pêcheur', en: 'A fisherman' }, { fr: 'Une veuve', en: 'A widow' },
  { fr: 'Un scribe', en: 'A scribe' }, { fr: 'Un forgeron', en: 'A blacksmith' },
  { fr: 'Une prêtresse', en: 'A priestess' }, { fr: 'Un capitaine', en: 'A captain' },
  { fr: 'Une tisserande', en: 'A weaver' }, { fr: 'Un vieux joueur', en: 'An old gambler' }
];
const JEUX = [
  { icon: '🎲', open: () => true },
  { icon: '🎟️', open: scratchUnlocked },
  { icon: '🪽', open: icarusUnlocked },
  { icon: '🃏', open: blackjackUnlocked },
  { icon: '🎰', open: slotsUnlocked },
  { icon: '🎡', open: rouletteUnlocked }
];

// Un gros coup vraisemblable : ×10 le plus souvent, ×50 parfois, ×250 rarement.
function tirerAnnonce() {
  const jeux = JEUX.filter((j) => { try { return j.open(); } catch { return false; } });
  const jeu = jeux[Math.floor(Math.random() * jeux.length)] || JEUX[0];
  const qui = QUI[Math.floor(Math.random() * QUI.length)];
  const r = Math.random();
  const mult = r < 0.62 ? 10 + Math.random() * 15 : r < 0.92 ? 30 + Math.random() * 70 : 150 + Math.random() * 350;
  const mise = tableLimits().base * (0.15 + Math.random() * 0.85);
  return { icon: jeu.icon, qui, gain: Math.round(mise * mult), key: Math.random() };
}

export default function AnnoncesSalle() {
  const [annonce, setAnnonce] = useState(null);
  useEffect(() => {
    let alive = true, t1 = 0, t2 = 0;
    const suivante = () => {
      // Toutes les 50 à 110 s, et seulement quand la page se voit.
      t1 = setTimeout(() => {
        if (!alive) return;
        if (document.visibilityState === 'visible') {
          setAnnonce(tirerAnnonce());
          t2 = setTimeout(() => { if (alive) setAnnonce(null); }, 5200);
        }
        suivante();
      }, 50_000 + Math.random() * 60_000);
    };
    // La première arrive plus vite : on vient d'entrer, la salle vit déjà.
    t1 = setTimeout(() => {
      if (!alive) return;
      setAnnonce(tirerAnnonce());
      t2 = setTimeout(() => { if (alive) setAnnonce(null); }, 5200);
      suivante();
    }, 8_000 + Math.random() * 6_000);
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!annonce) return null;
  return (
    <div className="salle-annonce" key={annonce.key} aria-live="polite">
      <span className="salle-annonce-icon" aria-hidden="true">{annonce.icon}</span>
      <span className="salle-annonce-qui">{tr(annonce.qui)}</span>
      <span className="salle-annonce-gain">+{fmt(annonce.gain)}</span>
    </div>
  );
}
