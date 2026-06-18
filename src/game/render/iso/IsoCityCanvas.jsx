import { useEffect, useRef } from 'react';
import { createIsoScene } from './isoScene.js';
import { getCityRenderModel } from '../cityRenderModel.js';
import { useGameState } from '../../../hooks/useGameState.js';
import { state, renderCache } from '../../core/state.js';

/* ============================================================================
 * IsoCityCanvas.jsx — Hôte React du moteur isométrique (Phase 3).
 *
 *   Composant MINCE : héberge la scène Pixi, la détruit au démontage, et lui
 *   POUSSE le modèle de rendu (getCityRenderModel) à chaque changement d'achat.
 *
 *   • Le modèle n'est recalculé que quand `_buildingsVersion` change (un achat),
 *     pas à chaque tick → la scène ne se reconstruit pas pour rien (perf).
 *   • ⚠ StrictMode (dev) monte/démonte deux fois. L'init Pixi étant async, on
 *     garde un drapeau `cancelled` : une scène annulée se détruit dès son arrivée
 *     et ne touche jamais la poignée de debug → aucun canvas orphelin.
 * ========================================================================== */

export default function IsoCityCanvas() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);

  // Signal « les bâtiments ont changé » (incrémenté à chaque achat).
  const buildingsSig = useGameState(() => renderCache._buildingsVersion);

  // Montage / démontage de la scène (une seule fois).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    createIsoScene(host)
      .then((s) => {
        if (cancelled) { s.destroy(); return; }
        sceneRef.current = s;
        if (import.meta.env.DEV) window.__iso = s;
        s.setModel(getCityRenderModel(state)); // état initial
      })
      .catch((err) => {
        console.error("[iso] échec d'initialisation de la scène :", err);
      });

    return () => {
      cancelled = true;
      const s = sceneRef.current;
      if (s) {
        if (import.meta.env.DEV && window.__iso === s) delete window.__iso;
        s.destroy();
        sceneRef.current = null;
      }
    };
  }, []);

  // Achat → on repousse le modèle (no-op tant que la scène n'est pas prête).
  useEffect(() => {
    sceneRef.current?.setModel(getCityRenderModel(state));
  }, [buildingsSig]);

  return <div ref={hostRef} className="iso-city-host" style={{ width: '100%', height: '100%' }} />;
}
