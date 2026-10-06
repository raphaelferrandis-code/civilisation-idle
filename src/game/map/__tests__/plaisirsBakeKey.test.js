// LA CUISSON DU LIEU NE SE REFAIT PLUS POUR RIEN (audit du 05/10, PERF-13).
//
// Chaque cuisson de la Maison des Plaisirs coûte 50 à 140 ms dans la frame. Elle se
// refaisait deux ou trois fois à chaque apparition (rendu du code, puis l'habillage,
// puis ses couches vivantes), et encore à chaque hiver et au premier effondrement
// (la boutique) — pour un résultat identique à l'octet près. Trois contrats :
//   · sur un habillage, l'hiver et la boutique ne changent RIEN (R, H, D, N, reflet,
//     corniches, tour des filles) — c'est ce qui permet de les sortir de la clé ;
//   · la clé les ignore sur un habillage, les garde sur le rendu du code ;
//   · l'habillage ne se dit prêt qu'une fois TOUTES ses images arrivées (une image
//     introuvable compte comme arrivée : l'âge retombe sur ce qu'il a).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { bakePlaisirs } from '../iso/plaisirsBake.js';
import { applyPlaisirsSkin, plaisirsSkinSpec, plaisirsSkin, plaisirsSkinLoading, preloadPlaisirsSkin } from '../iso/plaisirsSkin.js';
import { wonderKitForBand } from '../iso/wonderKits.js';
import { plaisirsBakeKey } from '../iso/isoPlaisirs.js';

const pub = (src) => path.join(process.cwd(), 'public', src);
const readPng = (src) => {
  const png = PNG.sync.read(fs.readFileSync(pub(src)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
};
// Tout ce que isoPlaisirs.bakeFor tire de la cuisson (l'ombre et les remous en
// découlent : R et H).
const KEYS = ['R', 'H', 'D', 'N', 'mirror', 'ledges', 'apex', 'foot', 'stroll', 'rail', 'balcony', 'door', 'walk', 'live'];
// Égalité à l'octet près (tableaux typés comparés en octets bruts : NaN et −∞ compris).
const bytes = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const same = (a, b) => {
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && bytes(a).equals(bytes(b));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  return Object.is(a, b);
};

describe('Maison des Plaisirs : une cuisson par âge habillé', () => {
  it("sur un habillage, l'hiver et la boutique ne changent rien à l'octet près", () => {
    // L'âge du feu et la Fonte : les deux qui portent des couches vivantes.
    for (const band of [0, 5]) {
      const spec = plaisirsSkinSpec(band);
      const skin = { ...spec, img: readPng(spec.src) };
      if (spec.live) { skin.back = readPng(spec.src.replace(/\.png$/, '-back.png')); skin.liveImg = readPng(spec.src.replace(/\.png$/, '-live.png')); }
      const bake = (winter, g) => { const out = bakePlaisirs(wonderKitForBand(band, winter), g); return { ...out, ...applyPlaisirsSkin(out, skin) }; };
      const G = { osselets: true, tickets: true, cartes: true, icare: true };
      const a = bake(false, { ...G, boutique: true }), b = bake(true, { ...G, boutique: false });
      for (const k of KEYS) expect(same(a[k], b[k]), `âge ${band}, ${k}`).toBe(true);
    }
  });

  it("la clé ignore l'hiver et la boutique sur un habillage, pas sur le rendu du code", () => {
    const G = { osselets: true, tickets: true, cartes: true, icare: true };
    const k = (winter, boutique, skinned) => plaisirsBakeKey(4, { ...G, boutique }, winter, skinned);
    expect(k(true, true, true)).toBe(k(false, false, true));
    expect(k(true, false, false)).not.toBe(k(false, false, false));
    expect(k(false, true, false)).not.toBe(k(false, false, false));
    expect(k(false, false, true)).not.toBe(k(false, false, false));
    // Les autres jeux déplacent des hauteurs : ils restent dans la clé.
    expect(plaisirsBakeKey(0, { ...G, cartes: false, icare: false }, false, true)).not.toBe(plaisirsBakeKey(0, G, false, true));
    expect(plaisirsBakeKey(3, G, false, true)).not.toBe(plaisirsBakeKey(4, G, false, true));
  });
});

describe("l'habillage n'est prêt que COMPLET", () => {
  // Un faux navigateur : chaque image attend qu'on la livre (ou qu'on la perde).
  const pending = new Map();
  const saved = { Image: globalThis.Image, document: globalThis.document };
  afterEach(() => {
    globalThis.Image = saved.Image; globalThis.document = saved.document;
    pending.clear();
  });
  const fakeDom = () => {
    globalThis.Image = class {
      set src(s) { pending.set(s, this); }
    };
    globalThis.document = {
      createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) }) }),
    };
  };
  const deliver = (src) => { const im = pending.get(src); im.naturalWidth = 2; im.naturalHeight = 2; im.onload(); };
  const lose = (src) => pending.get(src).onerror();

  it('âge à couches vivantes : ni avant le fond et les images vivantes, ni jamais bloqué', () => {
    fakeDom();
    const src = plaisirsSkinSpec(0).src;
    expect(plaisirsSkin(0)).toBe(null);
    expect(plaisirsSkinLoading(0)).toBe(true);
    deliver(src);
    // L'image seule : pas encore (sinon une cuisson jetée à l'arrivée des couches vivantes).
    expect(plaisirsSkin(0)).toBe(null);
    deliver(src.replace(/\.png$/, '-back.png'));
    expect(plaisirsSkinLoading(0)).toBe(true);
    deliver(src.replace(/\.png$/, '-live.png'));
    expect(plaisirsSkinLoading(0)).toBe(false);
    const s = plaisirsSkin(0);
    expect(s && s.img && s.back && s.liveImg).toBeTruthy();
  });

  it("une couche vivante perdue : l'image d'origine ; l'image perdue : plus rien à attendre", () => {
    fakeDom();
    const src5 = plaisirsSkinSpec(5).src;
    preloadPlaisirsSkin(5);
    deliver(src5); deliver(src5.replace(/\.png$/, '-back.png')); lose(src5.replace(/\.png$/, '-live.png'));
    const s = plaisirsSkin(5);
    expect(s && s.img).toBeTruthy();
    expect(s.liveImg).toBeUndefined();
    plaisirsSkin(1);
    lose(plaisirsSkinSpec(1).src);
    expect(plaisirsSkinLoading(1)).toBe(false);
    expect(plaisirsSkin(1)).toBe(null);
  });

  it("une image chargée mais illisible compte comme perdue : le lieu n'attend pas pour toujours", () => {
    fakeDom();
    // Toile « souillée » : getImageData lève (SecurityError).
    globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { throw new Error('SecurityError'); } }) }) };
    expect(plaisirsSkinSpec(2).live).toBeFalsy();
    plaisirsSkin(2);
    deliver(plaisirsSkinSpec(2).src);
    expect(plaisirsSkinLoading(2)).toBe(false);
    expect(plaisirsSkin(2)).toBe(null);
  });
});
