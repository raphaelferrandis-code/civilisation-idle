import { useRef, useEffect, useCallback } from 'react';

/**
 * Canvas à gratter (drag-to-reveal) — le geste physique de grattage, pas un clic.
 * La FEUILLE opaque est le SEUL contenu du canvas ; les symboles vivent DESSOUS
 * (rendus par le parent, derrière le canvas). On ne « peint » pas en grattant :
 * on PERCE la feuille en globalCompositeOperation='destination-out', et le
 * dessous transparaît par le trou. À `threshold` % gratté, `onReveal()` est
 * appelé UNE fois (garde `done`) — le parent découvre alors tout.
 *
 * Souris + tactile unifiés (Pointer Events + setPointerCapture) ; segments
 * interpolés à bouts ronds (anti-trous sur gestes rapides) ; % mesuré sur un
 * canvas d'échantillon 80×80 throttlé au rAF (jamais getImageData plein cadre).
 * DPR clampé à 2 ; un vrai resize repeint la feuille, un re-render qui ne change
 * pas la taille NE l'efface PAS (garde de dimensions). Feuille procédurale →
 * same-origin, getImageData jamais « tainted ».
 */
export default function ScratchCanvas({ nonce, radius = 22, threshold = 60, onReveal, drawFoil, disabled = false }) {
  const ref = useRef(null);
  const last = useRef(null);      // dernière position grattée (pour l'interpolation)
  const drawing = useRef(false);  // bouton/doigt enfoncé
  const done = useRef(false);     // seuil franchi → onReveal déjà tiré
  const sample = useRef(null);    // petit canvas offscreen pour le %
  const rafPending = useRef(false);

  // (Re)peindre la feuille. Clé sur [nonce, drawFoil] → un NOUVEAU ticket (nonce
  // incrémenté) régénère une feuille intacte ; un simple re-render ne le fait pas.
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    let lastW = 0;
    let lastH = 0;
    const paint = (force) => {
      const rect = cv.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 2 || h < 2) return;
      // Ne pas effacer un grattage en cours si la taille n'a pas VRAIMENT changé
      // (ResizeObserver se déclenche aussi au montage / sur des re-renders).
      if (!force && w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);   // ⚠ change canvas.width → RESET du contexte
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      drawFoil(ctx, w, h);
      done.current = false;
      last.current = null;
    };
    paint(true);
    if (!sample.current) {
      sample.current = document.createElement('canvas');
      sample.current.width = sample.current.height = 80;
    }
    const ro = new ResizeObserver(() => paint(false));
    ro.observe(cv);
    return () => ro.disconnect();
  }, [nonce, drawFoil]);

  // Mesure du % gratté sur le canvas d'échantillon (cheap), throttlée au rAF.
  const measure = useCallback(() => {
    rafPending.current = false;
    const cv = ref.current;
    const s = sample.current;
    if (!cv || !s || done.current) return;
    const sx = s.getContext('2d');
    sx.clearRect(0, 0, 80, 80);
    sx.drawImage(cv, 0, 0, 80, 80);
    const d = sx.getImageData(0, 0, 80, 80).data;
    let clear = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 40) clear++;
    const pct = (clear / (d.length / 4)) * 100;
    if (pct >= threshold) {
      done.current = true;
      onReveal?.();
    }
  }, [threshold, onReveal]);

  const scheduleMeasure = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(measure);
  }, [measure]);

  // Efface un trait : segment épais à bouts ronds entre la dernière position et
  // la courante (un seul stroke plutôt que N arcs), + un dab au point.
  const erase = useCallback((x, y) => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    const p = last.current;
    if (p) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    last.current = { x, y };
    scheduleMeasure();
  }, [radius, scheduleMeasure]);

  const posOf = (e) => {
    const rect = ref.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    if (disabled || done.current) return;
    drawing.current = true;
    last.current = null; // pas de « pont » depuis un ancien point
    try { ref.current.setPointerCapture(e.pointerId); } catch { /* capture indisponible : sans gravité */ }
    const { x, y } = posOf(e);
    erase(x, y);
  };
  const onPointerMove = (e) => {
    if (disabled || done.current || !drawing.current) return;
    const { x, y } = posOf(e);
    erase(x, y);
  };
  const stop = () => { drawing.current = false; last.current = null; };

  return (
    <canvas
      ref={ref}
      className="scratch-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    />
  );
}
