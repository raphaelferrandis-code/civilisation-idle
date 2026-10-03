import { useEffect, useRef } from 'react';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso } from '../../../game/map/agents.js';
import { salleNightF } from './salleBake.js';

/**
 * LA MAISON DES PLAISIRS EN COUPE (refonte du 2026-10-02, phase 2 reprise le
 * 2026-10-03 — docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐).
 *
 * Retour de Raph sur la première salle (une terrasse iso, tout au rez) : « quel
 * intérêt d'avoir un bâtiment de plus en plus grand si tout se passe au
 * rez-de-chaussée ? ». La salle est donc la COUPE du bâtiment, de face, cuite par
 * iso/plaisirsCoupe.js : un étage par jeu, autant d'étages que de plateaux dehors.
 *
 * Le canevas REMPLIT le cadre ; la coupe est agrandie d'un facteur ENTIER (pixel net)
 * réglé sur la LARGEUR du bâtiment. Quand il est plus haut que le cadre, on DÉFILE
 * d'étage en étage — à la molette, ou vers le lieu choisi (`focus`).
 * Couches : le fond cuit, les HABITANTS de l'âge (les sprites de la ville),
 * l'avant-plan cuit (tables, comptoirs) qui passe devant eux, puis la nuit à l'heure
 * de la carte et ses halos. Le survol et le clic tombent au pixel du LIEU.
 */

// Liseré d'or autour du lieu allumé (survol, sélection).
function ring(g, box, ox, oy, Z, now) {
  const x = ox + box.x0 * Z, y = oy + box.y0 * Z, w = (box.x1 - box.x0) * Z, h = (box.y1 - box.y0) * Z;
  const a = 0.75 + 0.25 * Math.sin(now / 260);
  g.fillStyle = `rgba(255,211,106,${a.toFixed(3)})`;
  g.fillRect(x, y, w, Z); g.fillRect(x, y + h - Z, w, Z); g.fillRect(x, y, Z, h); g.fillRect(x + w - Z, y, Z, h);
}

// `padLeft` : largeur (px CSS) masquée à gauche par le menu volant — le bâtiment se
// centre dans ce qui reste. `onLayout({ Z, ox, oy, dpr, W, H })` : où tombe le pixel
// d'art (0, 0) de la coupe, en pixels d'appareil du canevas, et à quel facteur — la
// vue y pose le bouton d'action et les zones du clavier.
export default function SalleCanvas({ bake, band, lit, padLeft = 0, focus = null, onHover, onPick, onLayout }) {
  const ref = useRef(null);
  const litRef = useRef(lit);
  const padRef = useRef(padLeft);
  const focusRef = useRef(focus);
  const onLayoutRef = useRef(onLayout);
  const layoutRef = useRef(null);
  // Défilement vertical, en pixels d'ART (haut de la vue) : la cible (molette,
  // focus) et la position animée qui la rejoint.
  const scrollRef = useRef({ target: null, cur: null, lastFocus: null, min: 0, max: 0 });
  useEffect(() => { litRef.current = lit; }, [lit]);
  useEffect(() => { padRef.current = padLeft; }, [padLeft]);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { onLayoutRef.current = onLayout; }, [onLayout]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !bake) return undefined;
    let raf = 0, last = 0, alive = true;
    const set = agentSetForBand(band);
    const sc = scrollRef.current;
    sc.target = null; sc.cur = null; sc.lastFocus = null;
    // Le bâtiment : de l'eau à la plateforme d'Icare, dalles débordantes comprises.
    const wMax = Math.max(...bake.levels.map((l) => l.w)) + 36;
    const artTop = bake.roofTop - 6, artBot = bake.H;
    const draw = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      if (now - last < 80) return;                       // ~12 images/s : c'est un décor
      last = now;
      const box = cv.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(box.width * dpr)), H = Math.max(1, Math.round(box.height * dpr));
      const pad = Math.min(W * 0.4, padRef.current * dpr), avail = W - pad;
      // Facteur ENTIER sur la largeur du bâtiment, borné pour qu'un étage entier et
      // son voisin tiennent en hauteur (on lit un étage, on devine le suivant).
      const Z = Math.max(1, Math.min(Math.floor(avail / wMax), Math.floor(H / 70)));
      const viewH = H / Z, bodyH = artBot - artTop;
      // Haut de la vue : collé à l'eau en bas (on entre par le rez), jamais au-delà du
      // toit. Bâtiment plus bas que le cadre : l'eau en bas, le ciel au-dessus.
      sc.max = artBot - viewH;
      sc.min = Math.min(sc.max, artTop);
      // Le lieu choisi vient au milieu du cadre ; pendant une PARTIE (la scène du jeu
      // se pose en bas du cadre et se marque elle-même, cf. views-plaisirs.css), il
      // monte tout en haut : on joue sous sa table, entouré de ses joueurs.
      const fid = focusRef.current, spot = fid && bake.spots[fid];
      const playing = !!spot && !!document.querySelector('.plaisirs-stage .regulation-stage:not(.is-empty)');
      const key = fid ? fid + (playing ? '*' : '') : null;
      if (key !== sc.lastFocus) { sc.lastFocus = key; if (spot) sc.target = playing ? spot.box.y0 - 6 : spot.y - viewH * 0.5; }
      if (sc.target == null || bodyH <= viewH) sc.target = sc.max;
      sc.target = Math.max(sc.min, Math.min(sc.max, sc.target));
      sc.cur = sc.cur == null ? sc.target : sc.cur + (sc.target - sc.cur) * 0.3;
      if (Math.abs(sc.cur - sc.target) < 0.3) sc.cur = sc.target;
      const ox = Math.round(pad + avail / 2 - (bake.W / 2) * Z), oy = Math.round(-sc.cur * Z);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      cv.style.width = W / dpr + 'px';
      cv.style.height = H / dpr + 'px';
      cv.dataset.z = String(Z);
      const L = layoutRef.current;
      if (!L || L.Z !== Z || L.ox !== ox || L.oy !== oy || L.dpr !== dpr || L.H !== H) {
        layoutRef.current = { Z, ox, oy, dpr, W, H };
        if (onLayoutRef.current) onLayoutRef.current(layoutRef.current);
      }
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.globalCompositeOperation = 'source-over';
      // Le ciel au-delà de la coupe (au-dessus), puis la coupe.
      g.fillStyle = bake.skyHex || '#9fd0ee';
      g.fillRect(0, 0, W, H);
      g.drawImage(bake.cv, ox, oy, bake.W * Z, bake.H * Z);
      // Les HABITANTS de l'âge, entre le fond et l'avant-plan.
      for (const f of bake.figures) {
        const spec = agentSpecFor(set, f.type, f.variant);
        if (!spec) continue;
        drawNamedAgentIso(g, ox + (f.x + 0.5) * Z, oy + (f.y + 0.5) * Z, Z, spec.name, spec.scale, f.dir, false, now, (f.x * 0.13) % 1);
      }
      g.drawImage(bake.cvF, ox, oy, bake.W * Z, bake.H * Z);
      // LA NUIT, à l'heure de la carte : la coupe s'assombrit, ses lumières restent,
      // et chaque applique, chaque lustre pose son halo.
      const nf = salleNightF();
      if (nf > 0.02) {
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = `rgba(52,62,104,${(0.72 * nf).toFixed(3)})`;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = Math.min(1, nf * 1.1);
        g.drawImage(bake.cvN, ox, oy, bake.W * Z, bake.H * Z);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'lighter';
        for (const p of bake.lights) {
          const x = ox + (p.x + 0.5) * Z, y = oy + (p.y + 0.5) * Z, r = Z * 12;
          if (y < -r || y > H + r || x < -r || x > W + r) continue;
          const a = 0.3 * nf * (0.88 + 0.12 * Math.sin(now / 240 + p.x));
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, `rgba(255,190,110,${a.toFixed(3)})`);
          grd.addColorStop(1, 'rgba(255,190,110,0)');
          g.fillStyle = grd;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.globalCompositeOperation = 'source-over';
      }
      // Le lieu allumé.
      for (const id of litRef.current || []) {
        const s = bake.spots[id];
        if (s) ring(g, s.box, ox, oy, Z, now);
      }
    };
    raf = requestAnimationFrame(draw);
    // Porte de dev (captures, volet masqué où le rAF est gelé) : une image forcée.
    if (import.meta.env && import.meta.env.DEV) window.__salleForce = (t) => { last = -1e9; draw(t != null ? t : performance.now()); };
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [bake, band]);

  // Pixel du cadre sous la souris → lieu.
  const pick = (e) => {
    const cv = ref.current, L = layoutRef.current;
    if (!cv || !bake || !L) return null;
    const r = cv.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) * L.dpr - L.ox) / L.Z), j = Math.floor(((e.clientY - r.top) * L.dpr - L.oy) / L.Z);
    if (i < 0 || j < 0 || i >= bake.W || j >= bake.H) return null;
    return bake.ids[j * bake.W + i] || null;
  };
  // La molette fait monter et descendre les étages (un tiers d'étage par cran).
  const onWheel = (e) => {
    const sc = scrollRef.current;
    if (sc.target == null || sc.max <= sc.min) return;
    sc.target = Math.max(sc.min, Math.min(sc.max, sc.target + (e.deltaY > 0 ? 14 : -14)));
  };

  return (
    <canvas
      ref={ref}
      className="plaisirs-salle"
      style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }}
      onWheel={onWheel}
      onMouseMove={(e) => onHover && onHover(pick(e))}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={(e) => { const id = pick(e); if (id && onPick) { e.stopPropagation(); onPick(id); } }}
    />
  );
}
