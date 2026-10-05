// LE LISERÉ DE SURVOL DE LA MAISON DES PLAISIRS (iso/isoEngineScene.js,
// drawSpriteOutline) — audit du 2026-10-05, PERF-32. Il se refaisait à CHAQUE frame
// du survol, à la taille écran du lieu (jusqu'à 1 373 × 2 205 px : un effacement,
// quatre poses agrandies, un remplissage), sur un canevas qui ne rétrécissait jamais
// (~12 Mo gardés toute la session). Gardes : tant que l'image, la taille et la teinte
// ne changent pas, la frame ne fait que POSER le liseré (même pose, au même endroit) ;
// il se refait au changement de zoom ou de cuisson ; il est rendu quand le survol cesse.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CM } from '../layout.js';
import { drawSpriteOutline, dropSpriteOutline } from '../iso/isoEngineScene.js';

const made = [];          // les canevas du liseré créés, et ce qu'on y a fait
const saved = {};
beforeAll(() => {
  saved.document = globalThis.document; saved.ctx = CM.ctx;
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0, ops: 0 };
      const g = {
        imageSmoothingEnabled: true, globalCompositeOperation: 'source-over', fillStyle: '#000',
        clearRect() { cv.ops += 1; }, drawImage() { cv.ops += 1; }, fillRect() { cv.ops += 1; },
      };
      cv.getContext = () => g;
      made.push(cv);
      return cv;
    },
  };
});
afterAll(() => { globalThis.document = saved.document; CM.ctx = saved.ctx; dropSpriteOutline(); });

function screen() {
  const poses = [];
  CM.ctx = { imageSmoothingEnabled: true, drawImage: (...a) => poses.push(a) };
  return poses;
}

describe('liseré de survol du lieu : gardé tant que rien ne change (PERF-32)', () => {
  it('dix frames de survol : une seule fabrication, dix poses identiques', () => {
    const img = { id: 'cuisson-1' }, poses = screen();
    for (let f = 0; f < 10; f += 1) drawSpriteOutline(img, 100, 50, 429, 689, '#f0c84a');
    expect(made.length).toBe(1);
    const cv = made[0];
    expect(cv.ops).toBe(5);                          // 4 poses + 1 remplissage (le redimensionnement a effacé)
    expect(poses.length).toBe(10);
    for (const p of poses) expect(p).toEqual([cv, 0, 0, 431, 691, 99, 49, 431, 691]);
  });

  it('il se refait au changement de zoom ou de cuisson, pas au déplacement', () => {
    const cv = made[0], poses = screen();
    const n0 = cv.ops;
    drawSpriteOutline({ id: 'cuisson-1' }, 300, 80, 429, 689, '#f0c84a');   // autre objet : une autre cuisson
    expect(cv.ops).toBeGreaterThan(n0);
    const n1 = cv.ops;
    const img = { id: 'cuisson-2' };
    drawSpriteOutline(img, 300, 80, 429, 689, '#f0c84a');
    const n2 = cv.ops;
    expect(n2).toBeGreaterThan(n1);
    drawSpriteOutline(img, 310, 90, 429, 689, '#f0c84a');                   // la caméra glisse : rien à refaire
    expect(cv.ops).toBe(n2);
    drawSpriteOutline(img, 310, 90, 858, 1378, '#f0c84a');                  // le zoom double : refait
    expect(cv.ops).toBeGreaterThan(n2);
    expect(poses.length).toBe(4);
  });

  it('le survol cessé, le canevas est rendu ; le suivant en reprend un neuf', () => {
    const cv = made[made.length - 1];
    expect(cv.width).toBeGreaterThan(0);
    dropSpriteOutline();
    expect(cv.width).toBe(0);
    expect(cv.height).toBe(0);
    screen();
    drawSpriteOutline({ id: 'cuisson-3' }, 0, 0, 40, 30, '#f0c84a');
    expect(made.length).toBe(2);
    expect(made[1].width).toBe(42);
  });
});
