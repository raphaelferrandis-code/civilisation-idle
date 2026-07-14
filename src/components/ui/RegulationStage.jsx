import { useEffect, useState } from 'react';
import { registerAuguryTable, closeAuguryTable } from '../../game/core/auguryTable.js';
import { registerIcarusFlight, closeIcarusFlight } from '../../game/core/icarusDialog.js';
import AuguryStage from './AuguryStage.jsx';
import IcarusStage from './IcarusStage.jsx';

/**
 * La scène des jeux du temple (retour Raph 2026-07-14 : « les jeux se lancent
 * dans le cadre vide en bas ») — colonne droite de l'étage bas de la page
 * Régulation. Vide : un simple rappel discret. Un jeu à la fois (ouvrir l'un
 * ferme l'autre) ; Échap referme ; les ponts (auguryTable/icarusDialog)
 * bufferisent les ouvertures venues d'une autre vue (boutons de pari de la
 * Cité → bascule d'onglet puis livraison au montage).
 */
export default function RegulationStage() {
  const [augury, setAugury] = useState(null);
  const [icarus, setIcarus] = useState(null);

  useEffect(() => registerAuguryTable((req) => {
    setAugury(req);
    if (req) setIcarus(null);
  }), []);

  useEffect(() => registerIcarusFlight((req) => {
    setIcarus(req);
    if (req) setAugury(null);
  }), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return; // les vrais dialogues d'abord
      closeAuguryTable();
      closeIcarusFlight();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const empty = !augury && !icarus;

  return (
    <section className={`regul-block regulation-stage${empty ? ' is-empty' : ''}`} aria-hidden={empty ? 'true' : undefined}>
      {empty ? (
        <span className="stage-watermark" aria-hidden="true">🎲</span>
      ) : augury ? (
        <AuguryStage table={augury} onClose={() => closeAuguryTable()} />
      ) : (
        <IcarusStage table={icarus} onClose={() => closeIcarusFlight()} />
      )}
    </section>
  );
}
