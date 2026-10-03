import { useLayoutEffect, useRef, useState } from 'react';

/**
 * DÉCOR D'UN LIEU (refonte « chaque onglet est un lieu », maquette V4).
 *
 * Une image pixel art agrandie d'un facteur ENTIER, compté en pixels de
 * l'ÉCRAN (devicePixelRatio) et non en pixels CSS : à 125 % d'affichage Windows,
 * un ×3 CSS donnerait des pixels de 3 et 4 points en alternance. Cadrée sur son
 * point d'intérêt `focus` ([x, y] en % de l'image) :
 *   - `cover`   remplit la bande, quitte à rogner (bandeau de lieu) ;
 *   - `contain` montre toute l'image, centrée.
 * `children` : calque accroché à l'IMAGE (mêmes bords qu'elle), pour poser des
 * zones cliquables ou des étiquettes qui suivent le dessin.
 */
export default function PlaceScene({ src, alt = '', focus = [50, 50], fit = 'cover', className = '', children }) {
  const boxRef = useRef(null);
  const imgRef = useRef(null);
  const [frame, setFrame] = useState(null);
  const [fx, fy] = focus;

  useLayoutEffect(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img) return undefined;
    const place = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const W = box.clientWidth;
      const H = box.clientHeight;
      if (!nw || !nh || !W || !H) return;
      const dpr = window.devicePixelRatio || 1;
      const s = fit === 'contain'
        ? Math.max(1, Math.floor(Math.min((W * dpr) / nw, (H * dpr) / nh)))
        : Math.max(1, Math.ceil(Math.max((W * dpr) / nw, (H * dpr) / nh)));
      const w = (nw * s) / dpr;
      const h = (nh * s) / dpr;
      const snap = (v) => Math.round(v * dpr) / dpr;
      const left = fit === 'contain'
        ? snap((W - w) / 2)
        : snap(Math.min(0, Math.max(W - w, W / 2 - (w * fx) / 100)));
      const top = fit === 'contain'
        ? snap((H - h) / 2)
        : snap(Math.min(0, Math.max(H - h, H / 2 - (h * fy) / 100)));
      setFrame((f) => (f && f.width === w && f.height === h && f.left === left && f.top === top
        ? f
        : { width: w, height: h, left, top }));
    };
    place();
    img.addEventListener('load', place);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(box);
    return () => {
      img.removeEventListener('load', place);
      ro?.disconnect();
    };
  }, [src, fit, fx, fy]);

  return (
    <div ref={boxRef} className={`place-scene${className ? ` ${className}` : ''}`}>
      <img
        ref={imgRef}
        className="place-scene-img"
        src={src}
        alt={alt}
        draggable="false"
        style={frame || { visibility: 'hidden' }}
      />
      {children && frame && <div className="place-scene-overlay" style={frame}>{children}</div>}
    </div>
  );
}
