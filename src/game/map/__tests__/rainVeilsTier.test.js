// DEUX NAPPES DE PLUIE aux paliers des machines modestes (décision de Raph du
// 2026-10-06, PERF-23) : « Performance » et « Équilibrée sans effets » (le choix
// d'Auto en rendu logiciel) composent 2 nappes plein écran au lieu de 4 — 4 blits par
// image au lieu de 8, 8 sous rafale au lieu de 16, moitié de mémoire. Les gouttes
// restent les mêmes, aux mêmes places : seul leur regroupement par vitesse change.
// Les autres paliers n'ont pas bougé.
// Pas de canvas sous Node : un faux document dont chaque contexte note ce qu'il reçoit.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CM } from '../layout.js';
import { drawIsoRain, rainLanes, RAIN_TUNE } from '../iso/isoWeather.js';
import { qualitySettings, setQualityMode } from '../qualityMode.js';

const KEYS = ['ctx', 'cw', 'ch', 'dpr', 'rainF', 'season', 'gustF', 'ambianceK', 'walkRoadSet', 'buildingInfo', 'layout', 'lodActive', 'windX', 'layoutRecomputeAt', 'rainVeils'];
let saved = null, savedCam, savedDoc, canvases, ecran;
function fauxCtx(log) {
  return {
    globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '',
    setTransform() {}, putImageData() {}, fillRect() {},
    clearRect: () => log.push('effacer'),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    drawImage: (cv, ...a) => log.push(a.join(',')),
  };
}
function monter(rainVeils) {
  // Sauvegarde au PREMIER montage du test seulement : un second montage aurait gardé
  // les faux du premier (contexte, document), et afterEach les aurait « restaurés ».
  if (!saved) {
    saved = Object.fromEntries(KEYS.map((k) => [k, CM[k]]));
    savedCam = { ...CM.cam }; savedDoc = globalThis.document;
  }
  canvases = [];
  globalThis.document = {
    createElement: () => { const c = { width: 0, height: 0, log: [] }; const g = fauxCtx(c.log); c.getContext = () => g; canvases.push(c); return c; },
  };
  ecran = [];
  const ctx = fauxCtx([]);
  ctx.drawImage = (cv) => ecran.push(cv);           // l'écran : QUELLE nappe est posée
  Object.assign(CM, {
    ctx, cw: 1201, ch: 803, dpr: 1, rainF: 0, season: 1, gustF: 0, ambianceK: 1,
    walkRoadSet: new Set(), buildingInfo: null, layout: null, lodActive: false, windX: 0, layoutRecomputeAt: 1,
    rainVeils,
  });
  Object.assign(CM.cam, { x: 0, y: 0, zoom: 1 });
  drawIsoRain(0);                                     // ciel dégagé : nappes d'un test précédent rendues
}
afterEach(() => {
  RAIN_TUNE.voies = 0;
  vi.unstubAllGlobals();
  if (!saved) return;
  for (const k of KEYS) CM[k] = saved[k];
  Object.assign(CM.cam, savedCam);
  if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
  saved = null;
});
const nappes = () => canvases.filter((c) => c.log.includes('effacer'));
const contenu = (c) => c.log.slice(c.log.lastIndexOf('effacer') + 1);
let t = 1000;
const image = (r, g = 0) => { CM.rainF = r; CM.gustF = g; ecran.length = 0; drawIsoRain((t += 33)); };

describe('PERF-23 — deux nappes aux paliers modestes', () => {
  it('le palier dit combien : 2 en Performance et sans effets, 4 ailleurs', () => {
    setQualityMode('perf');
    expect(qualitySettings().rainVeils).toBe(2);
    setQualityMode('high');
    expect(qualitySettings().rainVeils).toBe(4);
    setQualityMode('balanced');
    expect(qualitySettings().rainVeils).toBe(4);
    setQualityMode('auto');
  });

  it('2 nappes : 4 blits par image (8 sous rafale), mêmes gouttes qu\'avec 4', () => {
    monter(4);
    image(0.5);
    expect(nappes()).toHaveLength(4);
    expect(ecran).toHaveLength(8);
    const quatre = nappes().flatMap(contenu).sort();
    monter(2);
    image(0.5);
    expect(rainLanes()).toBe(2);
    expect(nappes()).toHaveLength(2);
    expect(ecran).toHaveLength(4);
    // Les mêmes étampes, aux mêmes places : seul le regroupement par nappe change.
    expect(nappes().flatMap(contenu).sort()).toEqual(quatre);
    // Sous rafale : le second rideau tourne d'une voie, il ne repose pas la même
    // nappe à la même vitesse que le premier.
    image(0.5, 1);
    expect(ecran).toHaveLength(8);
    const [a, b] = nappes();
    expect(ecran.slice(0, 4)).toEqual([a, a, b, b]);
    expect(ecran.slice(4)).toEqual([b, b, a, a]);
  });

  it('le palier qui change en pleine averse reforge avec le bon nombre de nappes', () => {
    monter(4);
    image(0.5);
    CM.rainVeils = 2;
    const n0 = canvases.length;
    image(0.5);
    expect(canvases.slice(n0).filter((c) => c.log.includes('effacer'))).toHaveLength(2);
    expect(ecran).toHaveLength(4);
  });

  it('la molette force l\'un ou l\'autre pour l\'A/B, 0 rend la main au palier', () => {
    CM.rainVeils = 4;
    RAIN_TUNE.voies = 2;
    expect(rainLanes()).toBe(2);
    CM.rainVeils = 2;
    RAIN_TUNE.voies = 4;
    expect(rainLanes()).toBe(4);
    RAIN_TUNE.voies = 0;
    expect(rainLanes()).toBe(2);
    CM.rainVeils = undefined;
    expect(rainLanes()).toBe(4);                      // rien de publié : le rideau d'avant
  });
});
