// LA SONDE DU GRAIN NE TOURNE PLUS EN PROD (audit du 05/10, DEV-2). recDens faisait un
// toFixed et une clé chaîne à chaque blit de maison et de décor, prod comprise, et
// __grainAudit embarquait dans le build un JSON d'annotations de 54 Ko. Deux gardes :
// le bloc des molettes n'existe qu'en dev (rejoué ici en changeant import.meta.env.DEV
// avant de réimporter le module), et chaque appel de recDens passe par grainProbe.on.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MAP = path.resolve(__dirname, '..');
let prevWindow;
afterEach(() => {
  vi.unstubAllEnvs();
  if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
});
async function freshSpriteScale(dev) {
  prevWindow = globalThis.window;
  globalThis.window = {};
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  return import('../spriteScale.js');
}

describe('sonde du grain', () => {
  it('hors dev : ni __grainAudit ni __grainDens, sonde éteinte', async () => {
    const m = await freshSpriteScale(false);
    expect(globalThis.window.__grainAudit).toBeUndefined();
    expect(globalThis.window.__grainDens).toBeUndefined();
    expect(m.grainProbe.on).toBe(false);
  });

  it('en dev : éteinte au chargement, armée par le premier __grainAudit()', async () => {
    const m = await freshSpriteScale(true);
    expect(m.grainProbe.on).toBe(false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expect(await globalThis.window.__grainAudit()).toEqual([]);
    } finally {
      info.mockRestore();
    }
    expect(m.grainProbe.on).toBe(true);
  });

  it('chaque appel de recDens dans le rendu est gardé par grainProbe.on', () => {
    const naked = [];
    for (const f of ['pixelHouses.js', 'cityEngineSprites.js']) {
      const lines = fs.readFileSync(path.join(MAP, f), 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (/\brecDens\(/.test(l) && !/grainProbe\.on/.test(l)) naked.push(`${f}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(naked).toEqual([]);
  });
});
