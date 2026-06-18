import { useEffect, useRef } from 'react';
import { createIsoScene } from './isoScene.js';

/* ============================================================================
 * IsoCityCanvas.jsx — Hôte React du moteur isométrique (Phase 1).
 *
 *   Composant volontairement MINCE : il ne fait qu'héberger la scène Pixi et la
 *   détruire au démontage. Tout le rendu vit dans isoScene.js (impératif).
 *
 *   ⚠ StrictMode (dev) monte/démonte l'effet deux fois. L'init Pixi étant async,
 *   on garde un drapeau `cancelled` : si l'effet est nettoyé avant la fin de
 *   l'init, on détruit la scène dès qu'elle arrive → aucun canvas orphelin.
 * ========================================================================== */

export default function IsoCityCanvas() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let scene = null;
    let cancelled = false;

    createIsoScene(host)
      .then((s) => {
        if (cancelled) { s.destroy(); return; }
        scene = s;
        // Poignée de debug posée UNIQUEMENT sur la scène conservée (dev).
        if (import.meta.env.DEV) window.__iso = s;
      })
      .catch((err) => {
        // On veut voir l'échec tout de suite (init Pixi, WebGL…).
        console.error("[iso] échec d'initialisation de la scène :", err);
      });

    return () => {
      cancelled = true;
      if (scene) {
        if (import.meta.env.DEV && window.__iso === scene) delete window.__iso;
        scene.destroy();
        scene = null;
      }
    };
  }, []);

  return <div ref={hostRef} className="iso-city-host" style={{ width: '100%', height: '100%' }} />;
}
