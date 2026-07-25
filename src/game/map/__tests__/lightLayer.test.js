// COUCHE DE LUMIÈRE OCCULTÉE (lightLayer.js). Ce qui se joue ici ne se voit sur
// aucune capture diurne, et deux de ces règles ont déjà mordu pendant l'écriture :
//
//   1. la DÉCOUPE efface par l'ALPHA de sa source — laisser en place le dégradé
//      du dernier halo (alpha → 0 sur les bords) ne découpe presque rien ;
//   2. le blit final ne doit JAMAIS repasser deux fois sur le même pixel : en
//      additif, un pixel blité deux fois double sa lumière ;
//   3. l'échappatoire de couverture (« aucune lumière dans ce coin ») est ce qui
//      rend la couche abordable : sans elle, chaque sprite de la ville paie un
//      blit. Un test l'exige explicitement, sinon la perte serait silencieuse.
//
// Il n'y a pas de canvas sous Node : on en injecte un FAUX qui journalise les
// opérations, ce qui permet de lire composite, teinte et géométrie.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CM } from '../layout.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer, suspendLightLayer,
  lightCtx, lightCut, lightCutImage, paintLightLayer, lightLayerStats,
} from '../lightLayer.js';

let log = [];

function makeCtx() {
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true, fillStyle: '#000',
    _st: [],
    save() { this._st.push([this.globalAlpha, this.globalCompositeOperation, this.imageSmoothingEnabled, this.fillStyle]); },
    restore() {
      const s = this._st.pop();
      if (s) { this.globalAlpha = s[0]; this.globalCompositeOperation = s[1]; this.imageSmoothingEnabled = s[2]; this.fillStyle = s[3]; }
    },
    setTransform() {},
    clearRect(x, y, w, h) { log.push({ op: 'clear', x, y, w, h }); },
    drawImage(img, ...a) {
      const d = a.length >= 8 ? a.slice(4) : a;      // (dx,dy,dw,dh) quelle que soit la forme
      log.push({ op: 'draw', gco: this.globalCompositeOperation, alpha: this.globalAlpha, dx: d[0], dy: d[1], dw: d[2], dh: d[3] });
    },
    fillRect(x, y, w, h) { log.push({ op: 'fillRect', gco: this.globalCompositeOperation, fill: this.fillStyle, x, y, w, h }); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {}, translate() {}, rotate() {},
    fill() { log.push({ op: 'fill', gco: this.globalCompositeOperation, fill: this.fillStyle }); },
    createRadialGradient() { return { addColorStop() {}, _isGradient: true }; },
  };
  return ctx;
}

const IMG = { naturalWidth: 16, naturalHeight: 16, width: 16, height: 16 };
const CELL = 64;

// Dépose une lumière carrée de ~1 case autour de (x,y) et renvoie le contexte.
function glowAt(x, y, r = 24) {
  const lc = lightCtx(x - r, y - r, x + r, y + r);
  if (lc) { lc.fillStyle = { _isGradient: true }; lc.fillRect(x - r, y - r, r * 2, r * 2); }
  return lc;
}

const draws = (gco) => log.filter((e) => e.op === 'draw' && e.gco === gco);

let prev;
beforeEach(() => {
  log = [];
  prev = { cw: CM.cw, ch: CM.ch, dpr: CM.dpr, doc: globalThis.document };
  CM.cw = 640; CM.ch = 384; CM.dpr = 1;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => (globalThis.__lightTestCtx ||= makeCtx()) }) };
  LIGHT_LAYER.on = true; LIGHT_LAYER.cell = CELL;
  suspendLightLayer(false);
  // Purge l'état résiduel de la frame précédente (le module est un singleton).
  beginLightLayer(); endLightLayer(); paintLightLayer(null);
  log = [];
});
afterEach(() => {
  endLightLayer(); suspendLightLayer(false); paintLightLayer(null);
  CM.cw = prev.cw; CM.ch = prev.ch; CM.dpr = prev.dpr;
  if (prev.doc === undefined) delete globalThis.document; else globalThis.document = prev.doc;
  LIGHT_LAYER.on = true;
});

describe('couche de lumière — dépôt, découpe, blit', () => {
  it('une découpe LOIN de toute lumière ne coûte rien (échappatoire de couverture)', () => {
    expect(beginLightLayer()).toBe(true);
    glowAt(96, 96);
    log = [];
    expect(lightCutImage(IMG, 500, 300, 40, 40)).toBe(false);
    expect(draws('destination-out')).toHaveLength(0);
  });

  it('une découpe SUR la lumière efface la silhouette, à la même géométrie', () => {
    beginLightLayer();
    glowAt(96, 96);
    log = [];
    expect(lightCutImage(IMG, 90, 90, 30, 30)).toBe(true);
    const cut = draws('destination-out');
    expect(cut).toHaveLength(1);
    expect([cut[0].dx, cut[0].dy, cut[0].dw, cut[0].dh]).toEqual([90, 90, 30, 30]);
  });

  it('la découpe est OPAQUE : le dégradé du halo précédent ne doit pas la diluer', () => {
    beginLightLayer();
    glowAt(96, 96);                       // laisse un fillStyle DÉGRADÉ sur le contexte
    log = [];
    lightCut(80, 80, 130, 130, (lc) => { lc.beginPath(); lc.fill(); });
    const f = log.find((e) => e.op === 'fill');
    expect(f).toBeTruthy();
    expect(f.gco).toBe('destination-out');
    expect(f.fill).toBe('#000');          // et surtout PAS l'objet dégradé
  });

  it('avant tout dépôt, il n’y a rien à découper', () => {
    beginLightLayer();
    expect(lightCutImage(IMG, 90, 90, 30, 30)).toBe(false);
  });

  it('suspendue (passe hors écran), la couche refuse dépôt ET découpe', () => {
    beginLightLayer();
    glowAt(96, 96);
    suspendLightLayer(true);
    expect(lightCtx(80, 80, 130, 130)).toBeNull();
    expect(lightCutImage(IMG, 90, 90, 30, 30)).toBe(false);
    suspendLightLayer(false);
    expect(lightCutImage(IMG, 90, 90, 30, 30)).toBe(true);
  });

  it('une lumière hors écran n’allume aucune case', () => {
    beginLightLayer();
    expect(lightCtx(-400, -400, -300, -300)).toBeNull();
    expect(lightLayerStats().glows).toBe(0);
  });

  it('molette éteinte : la couche rend la main (l’appelant repeint en direct)', () => {
    LIGHT_LAYER.on = false;
    expect(beginLightLayer()).toBe(false);
    expect(lightCtx(0, 0, 50, 50)).toBeNull();
    expect(paintLightLayer(makeCtx())).toBe(false);   // false = « à toi de peindre »
  });

  it('sans canvas (Node nu), même repli — la carte ne perd pas ses halos', () => {
    delete globalThis.document;
    expect(beginLightLayer()).toBe(false);
    expect(paintLightLayer(makeCtx())).toBe(false);
  });

  it('appelée avec enabled=false (dézoom), la couche RENONCE et rend la main', () => {
    beginLightLayer(); glowAt(96, 96); endLightLayer(); paintLightLayer(makeCtx());
    // ⚠ le piège : ne PAS appeler beginLightLayer laisserait `usable` à true et
    // la passe de nuit se croirait servie — écran sans le moindre halo.
    expect(beginLightLayer(false)).toBe(false);
    expect(lightCtx(0, 0, 50, 50)).toBeNull();
    expect(paintLightLayer(makeCtx())).toBe(false);
  });
});

describe('couche de lumière — le blit final', () => {
  // Le blit doit rester LOCAL et sans recouvrement : c'est ce qui rend la couche
  // payable, et en additif un pixel posé deux fois brille deux fois.
  function paintAndCollect(spots) {
    beginLightLayer();
    for (const [x, y] of spots) glowAt(x, y);
    endLightLayer();
    log = [];
    const main = makeCtx();
    expect(paintLightLayer(main)).toBe(true);
    return log.filter((e) => e.op === 'draw');
  }

  it('ne repasse jamais deux fois sur le même pixel (halos qui se chevauchent)', () => {
    const rects = paintAndCollect([[96, 96], [120, 110]]);
    expect(rects.length).toBeGreaterThan(0);
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i], b = rects[j];
        const overlap = a.dx < b.dx + b.dw && b.dx < a.dx + a.dw && a.dy < b.dy + b.dh && b.dy < a.dy + a.dh;
        expect(overlap, `plages ${JSON.stringify(a)} et ${JSON.stringify(b)} se chevauchent`).toBe(false);
      }
    }
  });

  it('blitte en ADDITIF, et seulement autour des lampes (pas le plein écran)', () => {
    const rects = paintAndCollect([[96, 96]]);
    expect(rects.every((r) => r.gco === 'lighter')).toBe(true);
    const area = rects.reduce((s, r) => s + r.dw * r.dh, 0);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(CM.cw * CM.ch / 4);   // un plein écran ferait ×10
  });

  it('une frame sans lumière ne blitte rien mais garde la main', () => {
    beginLightLayer(); endLightLayer();
    log = [];
    expect(paintLightLayer(makeCtx())).toBe(true);   // true = la couche a pris en charge
    expect(log.filter((e) => e.op === 'draw')).toHaveLength(0);
  });

  it('l’effacement ne porte que sur les cases qui PORTAIENT de la lumière', () => {
    // Frame 1 : une lampe en haut à gauche.
    beginLightLayer(); glowAt(96, 96); endLightLayer(); paintLightLayer(makeCtx());
    // Frame 2 : la caméra a bougé, la lampe est ailleurs. Le vieux halo doit
    // partir (sinon il rallumerait sa case), le reste du calque n'est pas touché.
    beginLightLayer();
    log = [];
    glowAt(480, 300);
    endLightLayer();
    const cl = log.filter((e) => e.op === 'clear');
    expect(cl.length).toBeGreaterThan(0);
    const cleared = cl.reduce((s, r) => s + r.w * r.h, 0);
    expect(cleared).toBeLessThan(CM.cw * CM.ch / 4);       // pas un plein écran
    const hitsOld = cl.some((r) => r.x <= 96 && 96 < r.x + r.w && r.y <= 96 && 96 < r.y + r.h);
    expect(hitsOld, 'la case de l’ancien halo doit être effacée').toBe(true);
  });

  it('une frame SANS dépôt ne perd pas la trace de la lumière restée dans le calque', () => {
    beginLightLayer(); glowAt(96, 96); endLightLayer(); paintLightLayer(makeCtx());
    beginLightLayer(); endLightLayer(); paintLightLayer(makeCtx());   // frame muette
    beginLightLayer();
    log = [];
    glowAt(96, 96);                                        // même case qu'au début
    endLightLayer();
    const cl = log.filter((e) => e.op === 'clear');
    const hitsOld = cl.some((r) => r.x <= 96 && 96 < r.x + r.w && r.y <= 96 && 96 < r.y + r.h);
    expect(hitsOld, 'sans cet effacement, les deux halos s’additionneraient').toBe(true);
  });
});
