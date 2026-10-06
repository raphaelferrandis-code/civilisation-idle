// SONDE DES TUILES DE SOL (audit du 05/10, ASSET-8). La disponibilité d'une matière se
// sondait sur sa base `<clé>.png` alors que blitIsoTileKey ne dessine que ses variantes
// `<clé>-1..N` : deux URL, deux décodages (boîte, face masquée) pour les mêmes pixels.
// Un faux `Image`, posé AVANT l'import, note les fichiers demandés.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const requested = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ''; }
  get src() { return this._src; }
  set src(v) { this._src = v; requested.push(v); }
}

let T;
let prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  T = await import('../iso/isoGroundTiles.js');
});
afterAll(() => { globalThis.Image = prevImage; });

const ISO = path.join('public', 'pixelart', 'iso');

describe('sonde de disponibilité des tuiles de sol', () => {
  it('une matière à variantes se sonde sur sa variante 1, jamais sur sa base', () => {
    const from = requested.length;
    T.isoTileProbe('iso-grass');
    expect(requested.slice(from)).toEqual(['/pixelart/iso/iso-grass-1.png']);
    // Et c'est bien la tuile que le blit demandera pour un hash qui tombe sur la 1.
    expect(T.isoVariantKey('iso-grass', 0)).toBe('iso-grass-1');
  });

  it('une clé sans variantes se sonde elle-même ; une clé absente ne demande rien', () => {
    const from = requested.length;
    expect(T.isoTileProbe(null)).toBe(null);
    T.isoTileProbe('test-sans-variante');
    expect(requested.slice(from)).toEqual(['/pixelart/iso/test-sans-variante.png']);
  });

  it('chaque matière de sol, de place et de chaussée sondée existe sur le disque', () => {
    const keys = [
      ...Object.values(T.ISO_TILE_KEYS).filter(Boolean),
      ...Object.keys(T.ISO_TILE_VARIANTS),
    ];
    const absents = keys
      .map((k) => T.isoVariantKey(k, 0))
      .filter((k) => !fs.existsSync(path.join(ISO, k + '.png')));
    expect(absents).toEqual([]);
  });

  it('les tabliers de pont gardent leur tuile de chaussée de BASE (lue par isoArt, isoBridge.roadSampler)', async () => {
    const { bridgeKitForBand } = await import('../iso/bridgeKits.js');
    const decks = new Set();
    for (let b = 0; b <= 9; b += 1) { const k = bridgeKitForBand(b); if (k && k.deck && k.deck.tile) decks.add(k.deck.tile); }
    expect(decks.size).toBeGreaterThanOrEqual(3);
    expect([...decks].filter((t) => !fs.existsSync(path.join(ISO, t + '.png')))).toEqual([]);
  });
});
