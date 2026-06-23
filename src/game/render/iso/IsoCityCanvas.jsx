import { useEffect, useRef, useState } from 'react';
import { createIsoScene } from './isoScene.js';
import { getCityRenderModel } from '../cityRenderModel.js';
import { visualTierOfEra, VISUAL_TIERS } from '../eraTiers.js';
import { useGameState } from '../../../hooks/useGameState.js';
import { state, renderCache } from '../../core/state.js';
import { currentEraIndex } from '../../core/mechanics.js';

/* ============================================================================
 * IsoCityCanvas.jsx — Hôte React du moteur isométrique (Phase 4).
 *
 *   Héberge la scène Pixi, lui POUSSE le modèle de rendu, et pilote le palier
 *   visuel (vieillissement) :
 *     • modèle repoussé quand un ACHAT (_buildingsVersion) ou le PALIER RÉEL change ;
 *     • barre de debug (dev) « avancer d'un palier » → force un palier pour voir la
 *       ville vieillir sans jouer des heures.
 *
 *   ⚠ StrictMode (dev) monte/démonte deux fois : drapeau `cancelled` → une scène
 *   annulée se détruit dès son arrivée et ne touche pas `window.__iso`.
 * ========================================================================== */

const barStyle = {
  // Bas-gauche : la topbar masque le haut, la boutique le côté droit, la
  // régulation le tout-bas. Ce coin est libre et sans bâtiments (ville centrée).
  position: 'absolute', bottom: '72px', left: '12px', zIndex: 5,
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '6px 10px', borderRadius: '8px',
  background: 'rgba(13,16,24,0.78)', backdropFilter: 'blur(4px)',
  border: '1px solid rgba(214,168,75,0.35)',
  font: '12px system-ui, sans-serif', color: '#f5e7c0', pointerEvents: 'auto'
};
const btnStyle = {
  padding: '4px 8px', borderRadius: '6px', cursor: 'pointer',
  background: 'rgba(214,168,75,0.18)', border: '1px solid rgba(214,168,75,0.5)',
  color: '#f5e7c0', font: 'inherit'
};

export default function IsoCityCanvas() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [tierOverride, setTierOverride] = useState(null);

  // Signaux : achat de bâtiment, et palier d'ère RÉEL (objet stable → ne
  // re-render que quand le palier change vraiment).
  const buildingsSig = useGameState(() => renderCache._buildingsVersion);
  const realTier = useGameState(() => visualTierOfEra(currentEraIndex()));

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

  // Achat ou changement de palier réel → on repousse le modèle.
  useEffect(() => {
    sceneRef.current?.setModel(getCityRenderModel(state));
  }, [buildingsSig, realTier]);

  // Override de palier (debug) → on force l'apparence.
  useEffect(() => {
    sceneRef.current?.setTierOverride(tierOverride);
  }, [tierOverride]);

  const shownTier = tierOverride ?? realTier.index;
  const tierLabel = VISUAL_TIERS.find((t) => t.index === shownTier)?.label ?? '';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} className="iso-city-host" style={{ width: '100%', height: '100%' }} />
      {import.meta.env.DEV && (
        <div className="iso-debug-bar" style={barStyle}>
          <span>
            Palier <strong>{shownTier}/5</strong> · {tierLabel}
            {tierOverride != null && <em> (forcé)</em>}
          </span>
          <button
            style={btnStyle}
            onClick={() => setTierOverride((prev) => ((prev ?? realTier.index) % 5) + 1)}
          >
            Avancer d'un palier ▶
          </button>
          <button
            style={{ ...btnStyle, opacity: tierOverride == null ? 0.5 : 1 }}
            onClick={() => setTierOverride(null)}
            disabled={tierOverride == null}
          >
            Réel
          </button>
        </div>
      )}
    </div>
  );
}
