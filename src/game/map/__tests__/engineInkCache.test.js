// Boîte d'encre des scènes moteur (iso/isoEngineScene.js, engineInkFrac) — audit
// 2026-10-05, BUG-59. C'est elle que le survol et le clic visent : rognée sur la
// matière du bâtiment, elle empêche une scène (boîte carrée, très haute) de voler
// le survol de ses voisins.
//
// ⚠ CE QUE CE FICHIER MESURE : la mesure était mémoïsée sur (id, palier, ère) et
// deux trous la figeaient sur une MAUVAISE boîte pour toute l'ère :
//  1. l'EMPREINTE manquait — une halle d'empreinte 3 (sprite « -grand ») et un
//     atelier d'empreinte 2 du même palier partageaient la mesure du premier venu ;
//  2. le CHARGEMENT des PNG — un prop pas encore décodé laisse le REPLI
//     procédural, qui a une vraie encre (souvent toute la boîte) : la première
//     frame d'une sauvegarde mesurait ce repli et le gardait.
// La scène est remplacée par un faux dessin qui encre une boîte connue dans le
// canvas de mesure ; la version des props est pilotée à la main.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ ver: 1, boxFor: null, inkCtx: null }));

vi.mock("../cityEngineSprites.js", async (orig) => ({ ...(await orig()), getPropVersion: () => h.ver }));
// Le faux dessin n'encre QUE le canvas de mesure (CM.ctx y est échangé le temps
// de la mesure) ; le dessin à l'écran passe sur un contexte muet.
vi.mock("../engineSprites.js", async (orig) => ({ ...(await orig()), drawEngineSprite: vi.fn() }));

import { CM } from "../layout.js";
import * as engineSprites from "../engineSprites.js";
import { drawIsoEngineScene, isoEngineSceneBox } from "../iso/isoEngineScene.js";

const REF = 96;
const buf = new Uint8ClampedArray(REF * REF * 4);
const inkCtx = {
  clearRect() { buf.fill(0); },
  getImageData() { return { data: buf }; },
  ink([x0, y0, x1, y1]) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) buf[(y * REF + x) * 4 + 3] = 255;
  },
};
h.inkCtx = inkCtx;

const saved = {};
beforeAll(() => {
  saved.document = globalThis.document;
  saved.layout = CM.layout; saved.cam = CM.cam; saved.cw = CM.cw; saved.ch = CM.ch; saved.ctx = CM.ctx; saved.hover = CM.hover;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => inkCtx }) };
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600; CM.hover = null;
  CM.ctx = {};
  // Le faux dessin : encre la boîte que `h.boxFor(t)` donne, dans le canvas de mesure.
  vi.mocked(engineSprites.drawEngineSprite).mockImplementation((t) => {
    if (CM.ctx === inkCtx && h.boxFor) inkCtx.ink(h.boxFor(t));
  });
});
afterAll(() => {
  globalThis.document = saved.document;
  Object.assign(CM, { layout: saved.layout, cam: saved.cam, cw: saved.cw, ch: saved.ch, ctx: saved.ctx, hover: saved.hover });
});

// Une ère neuve par test : le cache est vidé au changement d'ère, chaque test part
// d'un cache vide sans rien exporter de privé. Sous l'ère 34 : au-delà, l'ère ne
// compte plus dans la clé (MEM-6, ci-dessous).
let era = 10;
beforeEach(() => { era += 1; CM.layout = { counts: { eraBand: 5, eraIndex: era } }; h.ver = 1; });

const T = 16, Z = 1, HH = 8;
const anchor = { x: 400, y: 300 };
// Largeur d'encre publiée, en fraction de la boîte de la scène.
function inkW(t, now) {
  const span = t.size || 1;
  const r = drawIsoEngineScene({}, t, anchor, span, span, T, Z, HH, now);
  const { bw } = isoEngineSceneBox(t, anchor, span, span, T, Z, HH);
  return r.dw / bw;
}
const tile = (id, size, gx, extra = {}) => ({ type: "engine", buildingId: id, tier: 0, size, gx, gy: 30, groupIndex: 1, ...extra });

describe("boîte d'encre des scènes moteur (BUG-59)", () => {
  it("une halle d'empreinte 3 et un atelier d'empreinte 2 du même palier ont chacun LEUR mesure", () => {
    h.boxFor = (t) => (t.size === 3 ? [10, 10, 85, 95] : [30, 40, 65, 95]);
    const halle = tile("ministries", 3, 10);
    const atelier = tile("ministries", 2, 20, { groupIndex: 2 });
    expect(inkW(halle, 1000)).toBeCloseTo(76 / REF, 5);
    // Avant : l'atelier rendait la mesure de la halle (76/96).
    expect(inkW(atelier, 1000)).toBeCloseTo(36 / REF, 5);
  });

  it("une mesure prise sur le REPLI (PNG pas encore décodé) est refaite au décodage", () => {
    const uni = tile("universities", 2, 40);
    // Repli procédural : toute la boîte est encrée.
    h.boxFor = () => [0, 0, REF - 1, REF - 1];
    expect(inkW(uni, 2000)).toBeCloseTo(1, 5);
    // Même version : la mesure est servie par le cache (le dessin n'est pas refait).
    h.boxFor = () => [20, 30, 70, 95];
    expect(inkW(uni, 2016)).toBeCloseTo(1, 5);
    // Le PNG arrive (la version des props bouge) : on re-mesure le vrai sprite.
    h.ver = 2;
    expect(inkW(uni, 2033)).toBeCloseTo(51 / REF, 5);
  });

  it("les re-mesures sont bornées par frame ; les suivantes servent l'ancienne boîte, puis rattrapent", () => {
    const tiles = Array.from({ length: 10 }, (_, i) => tile("sp" + i, 2, 50 + i * 3));
    h.boxFor = () => [0, 0, REF - 1, REF - 1];
    // Première vue : toutes mesurées tout de suite, dans la même frame.
    for (const t of tiles) expect(inkW(t, 3000)).toBeCloseTo(1, 5);
    h.ver = 2;
    h.boxFor = () => [24, 0, 71, REF - 1];
    const f1 = tiles.map((t) => inkW(t, 3016));
    const fresh = f1.filter((w) => Math.abs(w - 48 / REF) < 1e-6).length;
    expect(fresh).toBe(8);
    // Frame suivante : les deux restantes rattrapent.
    const f2 = tiles.map((t) => inkW(t, 3033));
    for (const w of f2) expect(w).toBeCloseTo(48 / REF, 5);
  });
});

// Audit 2026-10-05, MEM-6 — la clé portait l'ère EXACTE : chaque ère transcendante
// vidait le cache et refaisait toutes les mesures, pour des scènes qui ne dépendent
// plus que de leur bande au-delà de l'ère 34. On compte les dessins de mesure.
describe("ères transcendantes : la boîte d'encre n'est plus remesurée à chaque ère (MEM-6)", () => {
  it("de l'ère 35 à l'ère 120, une seule mesure par scène et par bande", () => {
    h.boxFor = () => [20, 10, 75, 95];
    const t = tile("banks", 2, 70);
    // Une mesure = un dessin de la scène dans le canvas de mesure.
    let inked = 0;
    const spy = vi.mocked(engineSprites.drawEngineSprite).getMockImplementation();
    vi.mocked(engineSprites.drawEngineSprite).mockImplementation((tt, ...rest) => { if (CM.ctx === inkCtx) inked += 1; return spy(tt, ...rest); });
    try {
      for (let ei = 35; ei <= 120; ei += 1) {
        CM.layout = { counts: { eraBand: ei < 60 ? 7 : 8, eraIndex: ei } };
        expect(inkW(t, 4000 + ei * 16)).toBeCloseTo(56 / REF, 5);
      }
      expect(inked).toBe(2);                       // bande 7, puis bande 8
      // Sous l'ère 34, l'ère compte toujours : une ère neuve, une mesure neuve.
      CM.layout = { counts: { eraBand: 5, eraIndex: 20 } }; inkW(t, 9000);
      CM.layout = { counts: { eraBand: 5, eraIndex: 21 } }; inkW(t, 9016);
      expect(inked).toBe(4);
    } finally {
      vi.mocked(engineSprites.drawEngineSprite).mockImplementation(spy);
    }
  });
});
