// L'AVERSE QUI MONTE NE REFORGE PLUS SES NAPPES (audit du 2026-10-05, PERF-23).
//
// Pendant la rampe d'une averse, chaque cran de 8 gouttes effaçait les quatre
// nappes plein écran et les ressemait en entier (~120 reforges par averse sur ~400,
// simulées sur une averse réelle). Les gouttes sont un préfixe déterministe
// (rainVeilDraws) : on n'ajoute plus que les nouvelles. La garde : les nappes
// obtenues par ajouts portent EXACTEMENT les mêmes étampes, dans le même ordre,
// qu'une forge complète au même nombre de gouttes — donc les mêmes pixels.
// Pas de canvas sous Node : un faux document dont chaque contexte note ce qu'il reçoit.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { drawIsoRain, rainVeilDraws } from '../iso/isoWeather.js';
import { WINTER } from '../seasonMode.js';

const SUMMER = 1;
const KEYS = ['ctx', 'cw', 'ch', 'dpr', 'rainF', 'season', 'gustF', 'ambianceK', 'walkRoadSet', 'buildingInfo', 'layout', 'lodActive', 'windX', 'layoutRecomputeAt'];
let saved = null, savedCam, savedDoc, canvases;
function fauxCtx(log) {
  return {
    globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '',
    setTransform() {}, putImageData() {}, fillRect() {},
    clearRect: () => log.push('effacer'),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    drawImage: (cv, ...a) => log.push(a.join(',')),
  };
}
function monter() {
  saved = Object.fromEntries(KEYS.map((k) => [k, CM[k]]));
  savedCam = { ...CM.cam }; savedDoc = globalThis.document;
  canvases = [];
  globalThis.document = {
    createElement: () => { const c = { width: 0, height: 0, log: [] }; const g = fauxCtx(c.log); c.getContext = () => g; canvases.push(c); return c; },
  };
  // Vent nul, sans rafale : la forme de la goutte ne bouge pas sur la plage de pluie
  // choisie (longueur 16 px, épaisseur 1) — seul le NOMBRE de gouttes monte.
  Object.assign(CM, {
    ctx: fauxCtx([]), cw: 1201, ch: 803, dpr: 1, rainF: 0, season: SUMMER, gustF: 0, ambianceK: 1,
    walkRoadSet: new Set(), buildingInfo: null, layout: null, lodActive: false, windX: 0, layoutRecomputeAt: 1,
  });
  Object.assign(CM.cam, { x: 0, y: 0, zoom: 1 });
  drawIsoRain(0);                                     // ciel dégagé : nappes d'un test précédent rendues
}
afterEach(() => {
  if (!saved) return;
  for (const k of KEYS) CM[k] = saved[k];
  Object.assign(CM.cam, savedCam);
  if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
  saved = null;
});
// Les nappes : les canvas qui ont été effacés au moins une fois. Ce que chacune porte :
// les étampes posées depuis son dernier effacement.
const nappes = () => canvases.filter((c) => c.log.includes('effacer'));
const contenu = (c) => c.log.slice(c.log.lastIndexOf('effacer') + 1);
const effacements = () => nappes().reduce((s, c) => s + c.log.filter((e) => e === 'effacer').length, 0);
let t = 1000;
const image = (r, season = SUMMER) => { CM.rainF = r; CM.season = season; drawIsoRain((t += 33)); };

describe("PERF-23 — l'averse qui monte", () => {
  it('ajoute les gouttes sans effacer, et finit avec les nappes d\'une forge complète', () => {
    monter();
    for (let r = 0.45; r <= 0.565; r += 0.0025) image(r);
    const rampe = nappes();
    expect(rampe).toHaveLength(4);
    expect(effacements()).toBe(4);                     // UNE forge, au premier cran
    const apres = rampe.map(contenu);
    expect(apres.reduce((s, l) => s + l.length, 0)).toBeGreaterThan(2 * 160);
    // Ciel dégagé (nappes rendues), puis la même pluie d'un coup : forge complète.
    image(0);
    const n0 = canvases.length;
    image(0.5625);
    const neuves = canvases.slice(n0).filter((c) => c.log.includes('effacer'));
    expect(neuves).toHaveLength(4);
    expect(neuves.map(contenu)).toEqual(apres);
  });

  it('la descente reforge (moins de gouttes = effacer), comme avant', () => {
    monter();
    image(0.56);
    const e0 = effacements();
    image(0.45);
    expect(effacements()).toBe(e0 + 4);
  });

  it('la neige qui prend le relais rend les nappes de pluie', () => {
    monter();
    image(0.5);
    const n0 = canvases.length;
    image(0.5, WINTER);
    image(0.5);                                         // la pluie revient : nappes neuves
    expect(canvases.slice(n0).filter((c) => c.log.includes('effacer'))).toHaveLength(4);
  });

  it('rainVeilDraws(n, …, from) est la queue de rainVeilDraws(n, …)', () => {
    const all = rainVeilDraws(300, 1300, 800, 3);
    expect(rainVeilDraws(300, 1300, 800, 3, 120)).toEqual(all.slice(240));
    expect(rainVeilDraws(120, 1300, 800, 3)).toEqual(all.slice(0, 240));
  });
});
