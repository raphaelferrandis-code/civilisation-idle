import { useEffect, useRef } from 'react';
import {
  addDebugRuins,
  addDebugCycles,
  addDebugResources,
  debugBuyEarlyRuins
} from '../../game/core/main.js';
import { state, notify, openView } from '../../game/core/state.js';
import { log } from '../../game/core/actions.js';

export default function DebugDialog({ isOpen, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleOverlayClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const handleForceRupture = () => {
    state.instability = 1;
    log("Debug: rupture forcee a 100%.");
    openView("prestige");
    notify();
  };

  const handleUnlockRuinsView = () => {
    state.cycles = Math.max(state.cycles, 1);
    state.ruins = Math.max(state.ruins, 1);
    log("Debug: onglet ruines debloque.");
    notify();
  };

  return (
    <dialog
      ref={dialogRef}
      id="debugDialog"
      onClick={handleOverlayClick}
      onClose={onClose}
    >
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2>Mode debug</h2>
        <p className="body-copy">Outils de test local pour explorer le late game.</p>
        <div className="debug-grid">
          <button type="button" onClick={() => { addDebugRuins(1000); }}>+1K ruines</button>
          <button type="button" onClick={() => { addDebugRuins(1000000); }}>+1M ruines</button>
          <button type="button" onClick={() => { addDebugRuins(1000000000); }}>+1B ruines</button>
          <button type="button" onClick={handleForceRupture}>Rupture 100%</button>
          <button type="button" onClick={() => { addDebugCycles(10); }}>+10 cycles</button>
          <button type="button" onClick={addDebugResources}>Ressources late</button>
          <button type="button" onClick={handleUnlockRuinsView}>Voir ruines</button>
          <button type="button" onClick={debugBuyEarlyRuins}>Acheter ruines debut</button>
        </div>
        <menu>
          <button type="button" onClick={onClose} value="cancel">Fermer</button>
        </menu>
      </form>
    </dialog>
  );
}
