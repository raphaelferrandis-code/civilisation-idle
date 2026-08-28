// LE CALQUE À L'ÉCHELLE DE L'ART — et le piège qui a fait bouger les quais.
//
// Le calque bascule le repère de projection (zoom 1, viewport = ses propres
// dimensions) le temps du tracé. Le 2026-08-24 il ne basculait QUE ça : un
// consommateur qui prend sa cible dans `CM.ctx` — `cityMapDrawQuays` le fait,
// il la capture en tête — peignait donc sur l'ÉCRAN avec la géométrie du zoom 1,
// pendant qu'on composait un calque resté vide par-dessus. Symptôme rapporté par
// Raph : « les quais bougent au zoom/dézoom ». Erreur NULLE à z = 1 (le calque y
// est 1:1) et croissante en s'en éloignant — jusqu'à 34 px mesurés à z 1,25.
//
// Ces gardes tiennent l'invariant : pendant le calque, TOUT le contexte de dessin
// pointe le calque, et il est intégralement rendu ensuite.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { artLayerBegin, artLayerEnd } from '../isoArtLayer.js';

// Faux contexte 2D : on n'a besoin que des méthodes que le calque appelle.
const fauxCtx = () => ({
  setTransform() {}, clearRect() {}, drawImage() { this.dessins += 1; },
  dessins: 0, imageSmoothingEnabled: true,
});

// ⚠ Le harnais n'a NI `document` NI `OffscreenCanvas` : le calque fabrique un
// canevas, il faut donc lui en donner un. Stub minimal — il ne sert qu'à porter
// `width`/`height` et à rendre un contexte : ce test verrouille le CÂBLAGE
// (projection, cible, restitution), jamais des pixels.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => fauxCtx() }),
  };
}

const saved = { cw: CM.cw, ch: CM.ch, ctx: CM.ctx, zoom: CM.cam && CM.cam.zoom };
afterEach(() => {
  CM.cw = saved.cw; CM.ch = saved.ch; CM.ctx = saved.ctx;
  if (CM.cam) CM.cam.zoom = saved.zoom;
});

describe('calque à l échelle de l art', () => {
  it('bascule la CIBLE autant que la projection, et rend tout', () => {
    CM.cw = 800; CM.ch = 600; CM.cam = { ...CM.cam, x: 0, y: 0, zoom: 0.5 };
    const ecran = fauxCtx();
    CM.ctx = ecran;
    const lay = artLayerBegin(0.5);
    expect(lay, 'le calque doit se créer (OffscreenCanvas ou <canvas>)').toBeTruthy();

    // PENDANT : projection ET cible pointent le calque.
    expect(CM.cam.zoom, 'zoom du calque').toBe(1);
    expect(CM.cw).toBe(lay.w);
    expect(CM.ch).toBe(lay.h);
    expect(CM.ctx, 'LA CIBLE — le point qui manquait').toBe(lay.ctx);
    expect(CM.ctx).not.toBe(ecran);

    artLayerEnd(lay, ecran, 0.5);

    // APRÈS : tout est rendu, et la composition a bien eu lieu sur l'écran.
    expect(CM.cam.zoom).toBe(0.5);
    expect(CM.cw).toBe(800);
    expect(CM.ch).toBe(600);
    expect(CM.ctx).toBe(ecran);
    expect(ecran.dessins, 'le calque doit être composé sur la cible').toBe(1);
  });

  it('le calque couvre le viewport à toute échelle (jamais de bord nu)', () => {
    CM.cw = 800; CM.ch = 600; CM.cam = { ...CM.cam, x: 0, y: 0, zoom: 1 };
    for (const z of [0.375, 0.5, 1, 2]) {
      CM.cam.zoom = z;
      const ecran = fauxCtx();
      CM.ctx = ecran;
      const lay = artLayerBegin(z);
      const w = lay.w, h = lay.h;
      artLayerEnd(lay, ecran, z);
      // Composé à l'échelle z, le calque doit déborder le viewport — sinon une
      // frange du bord resterait non peinte.
      expect(w * z, `largeur couverte à z ${z}`).toBeGreaterThanOrEqual(800);
      expect(h * z, `hauteur couverte à z ${z}`).toBeGreaterThanOrEqual(600);
    }
  });
});
