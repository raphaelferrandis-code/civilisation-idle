import { useEffect, useRef, useState } from 'react';
import Monte from './Monte.jsx';
import { onGrandGain } from '../../game/core/grandsGains.js';
import { sonSlots } from '../../game/audio/slotsSound.js';
import { tr } from '../../game/core/i18n.js';
import { numLocale } from '../../game/core/utils.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import '../../styles/grands-gains.css';

/**
 * LE BANDEAU DES GRANDS GAINS (lot 3 des gains « vrai casino ») : au-dessus de la table
 * qui vient de payer ×5 (2026-10-04), ×10, ×50 ou ×250 la mise, le palier et le gain qui
 * monte. Un son
 * de la machine à sous l'accompagne (réglage des bruitages respecté). Pas de phrase :
 * le palier, le chiffre.
 */
const DUREE = { beau: 1700, gros: 2600, enorme: 3200, legende: 4400 };
const SON = { beau: 'gain1', gros: 'gain2', enorme: 'gain3', legende: 'jackpot' };

export default function GrandGain() {
  const [fete, setFete] = useState(null);
  const n = useRef(0);
  useEffect(() => {
    let timer = 0;
    const off = onGrandGain(({ palier, gain, mult }) => {
      n.current += 1;
      setFete({ id: palier.id, label: palier.label, gain, mult, key: n.current });
      try { sonSlots(SON[palier.id], 'fonte'); } catch { /* le son est un plus */ }
      clearTimeout(timer);
      timer = setTimeout(() => setFete(null), DUREE[palier.id] || 2600);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  if (!fete) return null;
  return (
    <div className={`grand-gain is-${fete.id}`} key={fete.key} aria-live="polite" style={{ animationDuration: `${DUREE[fete.id]}ms` }}>
      <span className="grand-gain-label">{tr(fete.label)}</span>
      <span className="grand-gain-mult">×{Math.floor(fete.mult).toLocaleString(numLocale())}</span>
      <span className="grand-gain-value">+<Monte value={fete.gain} dur={Math.round((DUREE[fete.id] || 2600) * 0.6)} /> <FaveurIcon /></span>
    </div>
  );
}
