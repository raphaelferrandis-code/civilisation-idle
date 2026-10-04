import { useEffect, useRef } from 'react';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../../../game/map/agents.js';
import { CM } from '../../../game/map/layout.js';
import { plaisirsCast } from '../../../game/map/iso/plaisirsCast.js';
import { salleNightF } from './salleBake.js';
import { nuitActive, spectacleActif } from '../../../game/core/actions/nuitGrandJeu.js';
import { dehorsCss } from './salleLumiere.js';

// LA FÊTE (la Nuit du Grand Jeu, le spectacle) : des paillettes d'or et de rose tombent
// dans la coupe, et les lustres brillent plus fort. Une paillette = un pixel d'art, sa
// place se tire de son numéro (rien à garder d'une image à l'autre).
const PAILLETTES = 90;
const PAILLETTE_COULEURS = ['#ffe08a', '#ffd76a', '#ff8fb5', '#fff6dc', '#f2c230'];
// Les COURTISANES ALANGUIES (type 'L' des figures) : un sprite par âge, chargé une fois.
const alanguies = new Map();
function alanguieImg(name) {
  if (!name || typeof Image === 'undefined') return null;
  let im = alanguies.get(name);
  if (!im) {
    im = new Image();
    im.src = `/pixelart/agents/inhabitants/${name}.png`;
    alanguies.set(name, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

// Les ÉTOILES du ciel de nuit, au-dessus de la verrière.
const ETOILES = 70;
const hashP = (i, k) => {
  let x = (i | 0) * 374761393 + (k | 0) * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * LA MAISON DES PLAISIRS EN COUPE (refonte du 2026-10-02, phase 2 reprise le
 * 2026-10-03 — docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐).
 *
 * Retour de Raph sur la première salle (une terrasse iso, tout au rez) : « quel
 * intérêt d'avoir un bâtiment de plus en plus grand si tout se passe au
 * rez-de-chaussée ? ». La salle est donc la COUPE du bâtiment, de face, cuite par
 * iso/plaisirsCoupeHD.js : un étage par jeu, autant d'étages que de plateaux dehors.
 *
 * Le canevas REMPLIT le cadre ; la coupe est agrandie d'un facteur ENTIER (pixel net)
 * réglé sur la LARGEUR du bâtiment. Quand il est plus haut que le cadre, on DÉFILE
 * d'étage en étage — à la molette, ou vers le lieu choisi (`focus`).
 * Couches : le fond cuit, les HABITANTS de l'âge (les sprites de la ville),
 * l'avant-plan cuit (tables, comptoirs) qui passe devant eux, puis la nuit à l'heure
 * de la carte et ses halos. Le survol et le clic tombent au pixel du LIEU.
 */

// Où en est une PISTE (clés datées en secondes, cf. courtship dans plaisirsCoupeHD.js) :
// position interpolée, tenue de la clé en cours.
function trackAt(keys, period, now) {
  const tt = ((now / 1000) % period + period) % period;
  let k = 0;
  while (k < keys.length - 1 && keys[k + 1].t <= tt) k += 1;
  const a = keys[k], b = keys[k + 1] || a, f = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dir: a.dir, walk: !!a.walk, hide: !!a.hide };
}
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
    // Les FILLES DE LA MAISON (type « g ») et la troupe de la scène (« d ») ; un âge
    // qui n'a pas encore les siennes prend les femmes de son jeu d'habitants.
    const cast = plaisirsCast(band);
    const specOf = (type, variant) => {
      if (type === 'g' || type === 'd') {
        const list = cast && (type === 'd' ? cast.dancers : cast.girls);
        return list && list.length ? list[variant % list.length] : agentSpecFor(set, 1, variant);
      }
      // Les GIGOLOS (« m ») ; sans les siens, un âge prend les hommes de son jeu d'habitants.
      if (type === 'm') {
        const list = cast && cast.gigolos;
        return list && list.length ? list[variant % list.length] : agentSpecFor(set, 0, variant);
      }
      return agentSpecFor(set, type, variant);
    };
    const mo = bake.motions;
    // LA GRILLE DES FILLES (coupe `hd`) : un pixel de coupe = un pixel de sprite. L'échelle
    // d'un habitant (0,71 pour une planche de 32 px, 1,24 pour 56 px…) le ramène à la
    // toise de la carte ; ce facteur commun le pose pixel pour pixel sur le décor.
    const HDK = bake.hd ? 32 / (CM.TILE * 0.71 * AGENT_SCALE) : 1;
    const haloR = bake.hd ? bake.hd.haloR : 12, floorH = bake.hd ? bake.hd.floorH * 2 : 70;
    const sc = scrollRef.current;
    sc.target = null; sc.cur = null; sc.x = null; sc.lastFocus = null;
    // Le bâtiment : de l'eau à la plateforme d'Icare, dalles débordantes comprises.
    const wMax = Math.max(...bake.levels.map((l) => l.w)) + (bake.hd ? bake.hd.margin : 36);
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
      // Pendant une PARTIE (la scène du jeu se pose en bas du cadre et se marque
      // elle-même, cf. views-plaisirs.css), la salle choisie vient se poser JUSTE
      // AU-DESSUS de la scène, un cran plus près : on joue sous sa table, entouré de
      // ses joueurs.
      const fid = focusRef.current, spot = fid && bake.spots[fid];
      const stageEl = spot ? document.querySelector('.plaisirs-stage .regulation-stage:not(.is-empty)') : null;
      const playing = !!stageEl;
      // Facteur ENTIER sur la largeur du bâtiment, borné pour qu'un étage entier et
      // son voisin tiennent en hauteur (on lit un étage, on devine le suivant).
      const Z = Math.max(1, Math.min(Math.floor(avail / wMax), Math.floor(H / floorH))) + (playing ? 1 : 0);
      const viewH = H / Z, bodyH = artBot - artTop;
      // Haut de la vue : collé à l'eau en bas (on entre par le rez), jamais au-delà du
      // toit. Bâtiment plus bas que le cadre : l'eau en bas, le ciel au-dessus.
      // Le haut de la scène du jeu, en pixels d'art depuis le haut du cadre (relu à
      // chaque image : elle s'ouvre en glissant) ; le sol de la salle s'y pose.
      const atStage = playing ? spot.box.y1 + 3 - Math.max(viewH * 0.3, ((stageEl.getBoundingClientRect().top - box.top) * dpr) / Z) : 0;
      sc.max = playing ? Math.max(artBot - viewH, atStage) : artBot - viewH;
      sc.min = Math.min(sc.max, artTop);
      // Le lieu choisi vient au milieu du cadre.
      const key = fid ? fid + (playing ? '*' : '') : null;
      if (key !== sc.lastFocus) { sc.lastFocus = key; sc.target = spot ? spot.y - viewH * 0.5 : null; }
      if (playing) sc.target = atStage;
      if (sc.target == null || (bodyH <= viewH && !playing)) sc.target = sc.max;
      sc.target = Math.max(sc.min, Math.min(sc.max, sc.target));
      sc.cur = sc.cur == null ? sc.target : sc.cur + (sc.target - sc.cur) * 0.3;
      if (Math.abs(sc.cur - sc.target) < 0.3) sc.cur = sc.target;
      const tx = playing ? spot.x : bake.W / 2;
      sc.x = sc.x == null ? tx : sc.x + (tx - sc.x) * 0.3;
      if (Math.abs(sc.x - tx) < 0.3) sc.x = tx;
      const ox = Math.round(pad + avail / 2 - sc.x * Z), oy = Math.round(-sc.cur * Z);
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
      g.fillStyle = bake.waterHex || '#355d78';                    // et l'eau, en dessous
      g.fillRect(0, oy + bake.H * Z, W, H);
      // Cadre plus large que la coupe (petit facteur) : ses colonnes du bord,
      // prolongées, continuent le ciel, la rive et l'eau jusqu'aux bords.
      if (ox > 0) g.drawImage(bake.cv, 0, 0, 1, bake.H, 0, oy, ox, bake.H * Z);
      if (ox + bake.W * Z < W) g.drawImage(bake.cv, bake.W - 1, 0, 1, bake.H, ox + bake.W * Z, oy, W - ox - bake.W * Z, bake.H * Z);
      g.drawImage(bake.cv, ox, oy, bake.W * Z, bake.H * Z);
      // Les HABITANTS de l'âge, entre le fond et l'avant-plan.
      // Ceux de DEVANT (de dos, qui regardent le jeu) passent après l'avant-plan.
      const people = (front) => {
        // Le MANÈGE de l'hôtesse (elle, son client) suit ses pistes.
        if (!front && mo) for (const tr of mo.tracks) {
          const st = trackAt(tr.keys, mo.period, now), spec = specOf(tr.type, tr.variant);
          if (st.hide || !spec) continue;
          drawNamedAgentIso(g, ox + (Math.round(st.x) + 0.5) * Z, oy + (Math.round(st.y) + 0.5) * Z, Z, spec.name, spec.scale * HDK, st.dir, st.walk, now, 0);
        }
        for (const f of bake.figures) {
          if (!!f.front !== front) continue;
          // La courtisane alanguie : son sprite, posé sur le sol, retourné vers la gauche.
          if (f.type === 'L') {
            const im = alanguieImg(cast && cast.alanguie);
            if (!im) continue;
            const w = im.naturalWidth, h = im.naturalHeight, x0 = ox + (f.x - Math.floor(w / 2)) * Z, y0 = oy + (f.y - h + 1) * Z;
            if (f.dir === 2) {
              g.save();
              g.translate(x0 + w * Z, y0);
              g.scale(-1, 1);
              g.drawImage(im, 0, 0, w * Z, h * Z);
              g.restore();
            } else g.drawImage(im, x0, y0, w * Z, h * Z);
            continue;
          }
          const spec = specOf(f.type, f.variant);
          if (!spec) continue;
          // La troupe DANSE (sa bande de danse, jouée en boucle sur place).
          if (f.type === 'd' && spec.danse) {
            drawNamedAgentIso(g, ox + (f.x + 0.5) * Z, oy + (f.y + 0.5) * Z, Z, spec.danse, (spec.danseScale || spec.scale) * HDK, f.dir, true, now, f.phase || 0, 1, null, true);
            continue;
          }
          let x = f.x, dir = f.dir, walking = false;
          if (f.walk) {
            // Le PASSANT va et vient d'un lieu à l'autre, à son pas (px d'art/s).
            const [a, b] = f.walk, span = b - a, T = (2 * span) / (f.speed || 5) * 1000;
            const p = ((now / T) + (f.x - a) / (2 * span)) % 1, there = p < 0.5;
            x = a + span * (there ? p * 2 : 2 - p * 2);
            dir = there ? 0 : 2;
            walking = true;
          }
          // Le SERVEUR passe avec son plateau (sa bande « -plateau »).
          const nom = f.tray && spec.plateau ? spec.plateau : spec.name;
          drawNamedAgentIso(g, ox + (Math.round(x) + 0.5) * Z, oy + (f.y + 0.5) * Z, Z, nom, spec.scale * HDK, dir, walking, now, (f.x * 0.13) % 1);
        }
      };
      // La cabine de l'ascenseur, à la hauteur où la porte le manège (au rez sinon).
      const cabY = bake.lift ? Math.round(mo && mo.cabin ? trackAt(mo.cabin.map((k) => ({ t: k.t, x: 0, y: k.y })), mo.period, now).y : bake.lift.stops[0] + 1) : null;
      // La CABINE (cuite en deux calques : le fond avant les passagers, la grille après).
      const cab = bake.cabinCv, cabAt = (img) => g.drawImage(img, ox + (bake.lift.x0 + 2) * Z, oy + (cabY - cab.h + 1) * Z, cab.w * Z, cab.h * Z);
      if (cabY != null && cab) cabAt(cab.back);
      people(false);
      if (cabY != null && cab) cabAt(cab.front);
      g.drawImage(bake.cvF, ox, oy, bake.W * Z, bake.H * Z);
      people(true);
      // LA NUIT — la Maison est hors du temps, il y fait toujours nuit (salleNightF) :
      // la coupe s'assombrit, ses lumières restent, chaque applique, chaque lustre pose
      // son halo ; plus fort pendant la fête.
      const nf = salleNightF();
      const fete = nuitActive() || spectacleActif();
      const lum = bake.lumiere;
      const bw = bake.W * Z, bh = bake.H * Z;
      if (nf > 0.02 && lum) {
        // LA LUMIÈRE CALCULÉE (salleLumiere.js) : la carte d'éclairage en multiply — la
        // nuit dehors, la pénombre dedans, les lampes et les cônes des tables.
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = dehorsCss();
        if (oy > 0) g.fillRect(0, 0, W, oy);
        if (oy + bh < H) g.fillRect(0, oy + bh, W, H - oy - bh);
        if (ox > 0) g.fillRect(0, Math.max(0, oy), ox, Math.min(H, oy + bh) - Math.max(0, oy));
        if (ox + bw < W) g.fillRect(ox + bw, Math.max(0, oy), W - ox - bw, Math.min(H, oy + bh) - Math.max(0, oy));
        g.drawImage(lum.cv, ox, oy, bw, bh);
        g.globalCompositeOperation = 'source-over';
        // Ce qui brille par lui-même : flammes, lanternes, néons.
        g.drawImage(bake.cvN, ox, oy, bw, bh);
        g.globalCompositeOperation = 'lighter';
        // Les ÉTOILES au-dessus du toit, qui scintillent.
        const yCiel = Math.min(H, oy + (bake.roofTop - 4) * Z);
        for (let i = 0; i < ETOILES && yCiel > 0; i += 1) {
          const sx = Math.round(hashP(i, 11) * W / Z) * Z, sy = Math.round(hashP(i, 12) * yCiel / Z) * Z;
          const a = 0.35 + 0.45 * Math.max(0, Math.sin(now / (600 + (i % 7) * 130) + i));
          g.fillStyle = `rgba(255,246,220,${a.toFixed(3)})`;
          g.fillRect(sx, sy, Z, Z);
        }
        // Les REFLETS des lumières dans l'eau : la couche des lumières renversée sous la
        // ligne d'eau, rangée par rangée, ondulante, de plus en plus pâle.
        const wy = bake.waterY;
        if (wy) {
          const vague = Math.floor(now / 180);
          for (let y = wy + 1; y < bake.H; y += 1) {
            const sy = Math.round(wy - (y - wy) * 1.4);
            if (sy < 0) break;
            if ((y + vague) % 3 === 0) continue;
            const dx = Math.round(Math.sin(now / 520 + y * 0.9) * 1.6);
            g.globalAlpha = Math.max(0, 0.36 - (y - wy) * 0.009);
            g.drawImage(bake.cvN, 0, sy, bake.W, 1, ox + dx * Z, oy + y * Z, bw, Z);
          }
          g.globalAlpha = 1;
        }
        // Les RAIS des tables : la lumière vue dans l'air, plus dense pendant la fête.
        g.globalAlpha = fete ? 0.95 : 0.7;
        g.drawImage(lum.rais, ox, oy, bw, bh);
        // La LUEUR autour des flammes et des néons (un flou agrandi).
        if (bake.lueurCv) {
          g.imageSmoothingEnabled = true;
          g.globalAlpha = (fete ? 0.75 : 0.55) * (lum.lueur || 1);
          g.drawImage(bake.lueurCv, ox, oy, bw, bh);
          g.imageSmoothingEnabled = false;
        }
        g.globalAlpha = 1;
        // Les POURSUITES de la scène : deux faisceaux des cintres vers la troupe, qui
        // balayent lentement ; roses et dorés pendant la fête.
        const sc = bake.spots.scene;
        if (sc) {
          const b = sc.box, top = oy + (b.y0 + 9) * Z, solY = oy + (b.y1 - 9) * Z, cxs = ox + sc.x * Z;
          for (const [src, k] of [[ox + (b.x0 + 8) * Z, 0], [ox + (b.x1 - 8) * Z, 1]]) {
            const cible = cxs + Math.sin(now / 1700 + k * 2.1) * 22 * Z, w2 = 13 * Z;
            const grd = g.createLinearGradient(0, top, 0, solY);
            const tint = fete ? (k ? '255,150,200' : '255,215,120') : '255,236,200';
            grd.addColorStop(0, `rgba(${tint},0.30)`);
            grd.addColorStop(1, `rgba(${tint},0.08)`);
            g.fillStyle = grd;
            g.beginPath();
            g.moveTo(src - 2 * Z, top); g.lineTo(src + 2 * Z, top);
            g.lineTo(cible + w2, solY); g.lineTo(cible - w2, solY);
            g.closePath();
            g.fill();
            // La tache de la poursuite sur les planches.
            g.fillStyle = `rgba(${tint},0.22)`;
            g.beginPath();
            g.ellipse(cible, solY, w2, 3 * Z, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        // Les halos des lampes : resserrés (la carte éclaire déjà la salle), vacillants.
        for (const p of bake.lights) {
          const x = ox + (p.x + 0.5) * Z, y = oy + (p.y + 0.5) * Z, r = Z * haloR * 0.6;
          if (y < -r || y > H + r || x < -r || x > W + r) continue;
          const vac = 0.82 + 0.1 * Math.sin(now / 240 + p.x) + 0.08 * Math.sin(now / 97 + p.y * 1.3);
          const a = (fete ? 0.34 : 0.24) * vac;
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          // Halo de la couleur de sa lampe (rose au boudoir), ambre par défaut — rose
          // partout pendant la fête : la Maison passe à la lumière rouge.
          const rgb = p.c ? [1, 3, 5].map((i) => parseInt(p.c.slice(i, i + 2), 16)).join(',') : fete ? '255,140,150' : '255,190,110';
          grd.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
          grd.addColorStop(1, `rgba(${rgb},0)`);
          g.fillStyle = grd;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.globalCompositeOperation = 'source-over';
      }
      // LA FÊTE : les paillettes tombent sur toute la largeur du bâtiment, en oscillant.
      if (fete) {
        const x0 = bake.W / 2 - wMax / 2, span = artBot - artTop;
        for (let i = 0; i < PAILLETTES; i += 1) {
          const v = 6 + hashP(i, 1) * 10;                        // px d'art par seconde
          const y = artTop + ((hashP(i, 2) * span + (now / 1000) * v) % span);
          const x = x0 + hashP(i, 3) * wMax + Math.round(Math.sin(now / 700 + i) * 2);
          const sx = ox + Math.round(x) * Z, sy = oy + Math.round(y) * Z;
          if (sy < -Z || sy > H || sx < -Z || sx > W) continue;
          // Une paillette sur trois scintille (elle s'éteint un instant).
          if (i % 3 === 0 && Math.sin(now / 160 + i * 1.7) < -0.6) continue;
          g.fillStyle = PAILLETTE_COULEURS[i % PAILLETTE_COULEURS.length];
          g.fillRect(sx, sy, Z, Z);
        }
      }
      // LES OMBRES DE LA TENTURE, par-dessus la nuit (la tenture s'y allume) : la fille
      // seule qui aguiche, ou le couple quand l'hôtesse a mené son client derrière.
      const sh = bake.show, shCv = bake.showCv;
      if (sh && shCv) {
        let duo = false;
        if (mo) { const st = trackAt(mo.tracks[0].keys, mo.period, now); duo = st.hide && Math.abs(st.x - sh.x) < 14; }
        const seq = duo ? sh.coupleSeq : sh.soloSeq, ms = duo ? sh.coupleMs : sh.soloMs;
        const img = (duo ? shCv.couple : shCv.solo)[seq[Math.floor(now / ms) % seq.length]];
        if (img) g.drawImage(img, ox + (sh.x - Math.floor(sh.w / 2)) * Z, oy + (sh.y - sh.h + 1) * Z, sh.w * Z, sh.h * Z);
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
    const step = bake && bake.hd ? bake.hd.wheel : 14;
    sc.target = Math.max(sc.min, Math.min(sc.max, sc.target + (e.deltaY > 0 ? step : -step)));
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
