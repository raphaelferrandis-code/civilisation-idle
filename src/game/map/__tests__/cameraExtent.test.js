import { describe, it, expect } from 'vitest';
import { cameraExtent } from '../iso/cameraExtent.js';
import { ISO_X, ISO_Y, snapZoom } from '../iso/projection.js';

describe('cadrage des extrémités du fleuve', () => {
  it('garde les quatre coins visibles entre les extrémités, même au dézoom maximal', () => {
    for (const [cw, ch] of [[1920, 1080], [3440, 1440], [800, 1200]]) {
      const x0 = -1400, x1 = 2400, relief = 32;
      const extent = cameraExtent(cw, ch, x0, x1, relief);
      for (const zoom of [snapZoom(extent.minZoom, 1), 2, 3.125]) {
        for (const request of [-1e6, 0, 1e6]) {
          const camX = extent.clampX(request, zoom);
          for (const sx of [-cw / 2, cw / 2]) for (const sy of [-ch / 2, ch / 2]) {
            for (const height of [0, relief]) {
              const worldX = camX + (sx / (ISO_X * zoom) + (sy / zoom + height) / ISO_Y) / 2;
              expect(worldX).toBeGreaterThanOrEqual(x0 - 1e-6);
              expect(worldX).toBeLessThanOrEqual(x1 + 1e-6);
            }
          }
        }
      }
    }
  });
  it('préserve la position centrale et recentre une vue trop grande', () => {
    const extent = cameraExtent(1200, 800, -2000, 2000);
    expect(extent.clampX(100, 1)).toBe(100);
    expect(extent.clampX(-5000, 0.1)).toBe(0);
  });
});
