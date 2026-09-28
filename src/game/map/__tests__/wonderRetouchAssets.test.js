import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PNG } from 'pngjs';

describe('retouches des merveilles — géométrie native', () => {
  for (const key of ['era_empire-t4', 'era_singularity-t5']) {
    it(`${key} conserve sa taille et sa transparence`, () => {
      const root = new URL('../../../../public/pixelart/wonders/', import.meta.url);
      const original = PNG.sync.read(fs.readFileSync(new URL(`${key}.png`, root)));
      const refined = PNG.sync.read(fs.readFileSync(new URL(`refined/${key}.png`, root)));
      expect([refined.width, refined.height]).toEqual([original.width, original.height]);
      let clear = 0, ink = 0;
      for (let i = 3; i < refined.data.length; i += 4) {
        if (refined.data[i] === 0) clear += 1;
        if (refined.data[i] > 240) ink += 1;
      }
      expect(clear).toBeGreaterThan(refined.width * refined.height * 0.15);
      expect(ink).toBeGreaterThan(refined.width * refined.height * 0.15);
      expect(refined.data.equals(original.data)).toBe(false);
    });
  }
});
