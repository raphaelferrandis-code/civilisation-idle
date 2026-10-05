// LES HALOS DES SCÈNES MOTEUR NE SE PRÉPARENT PLUS POUR RIEN (audit du 05/10, PERF-20).
//
// De jour, ENGINE_HALO.day = 0 : les douze halos copiés-collés d'engineSprites.js
// créaient pourtant un dégradé, ses deux arrêts et un save/restore par scène et par
// frame avant de ne pas remplir ; et la tour cosmique de nacre REMPLISSAIT un disque de
// rayon sw/2 à alpha nul (≈ 2 ms par frame pour 30 tours en rendu logiciel, mesuré).
// Ce que ces tests tiennent, sur les scènes savoir/infra de toutes les bandes :
//   · de jour, aucun dégradé créé sans être peint, aucun remplissage à alpha nul ;
//   · de nuit, les halos sont bien là.
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Les props « chargés » (comme passcount2.mjs de l'audit) : sans image décodée, une
// scène ne dessine rien et le test ne prouverait rien.
class ImagePrete {
  constructor() { this.complete = true; this.naturalWidth = 96; this.naturalHeight = 88; this.width = 96; this.height = 88; this.onload = null; }
  set src(v) { this._src = v; if (this.onload) this.onload(); }
  get src() { return this._src; }
}
let drawEngineSprite, CM;
beforeAll(async () => {
  vi.stubGlobal('Image', ImagePrete);
  ({ drawEngineSprite } = await import('../engineSprites.js'));
  ({ CM } = await import('../layout.js'));
});

// Contexte espion : chaque dégradé créé, et chaque remplissage avec le style courant.
function spy() {
  const st = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false, lineWidth: 1 };
  const stack = [], grads = [], fills = [];
  const ctx = new Proxy(st, {
    get(o, k) {
      if (k in o) return o[k];
      return () => {
        if (k === 'save') stack.push({ ...st });
        else if (k === 'restore') Object.assign(st, stack.pop() || {});
        else if (k === 'createRadialGradient') { const g = { stops: [], used: false, addColorStop(p, c) { g.stops.push(c); } }; grads.push(g); return g; }
        else if (k === 'fill') { if (st.fillStyle && st.fillStyle.stops) st.fillStyle.used = true; fills.push({ style: st.fillStyle, op: st.globalCompositeOperation }); }
        return undefined;
      };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { ctx, grads, fills };
}
const IDS = ['storytellers', 'scribes', 'schools', 'academies', 'ancestral_cult', 'observatories', 'libraries', 'universities', 'printing_houses', 'think_tanks', 'watch', 'sewers', 'bureaucracy', 'courthouses', 'public_works', 'ministries', 'archive_grids'];
// Un âge par stade de scène (1 à 3), puis les trois bandes cosmiques (tours de nacre).
const ERAS = [{ ei: 4, band: 0 }, { ei: 22, band: 4 }, { ei: 32, band: 6 }, { ei: 36, band: 7 }, { ei: 44, band: 9 }];
function drawAll(nightF) {
  const all = { grads: [], fills: [] };
  for (const id of IDS) for (const e of ERAS) for (const now of [1234]) {
    const { ctx, grads, fills } = spy();
    CM.ctx = ctx; CM.nightF = nightF; CM.TILE = 32; CM.cam = { x: 0, y: 0, zoom: 1 };
    CM.layout = { counts: { eraBand: e.band, eraIndex: e.ei } };
    drawEngineSprite({ buildingId: id, tier: 1, gx: 3, gy: 4, size: 2 }, 0, 0, 120, 120, now, 'anim');
    all.grads.push(...grads); all.fills.push(...fills);
  }
  return all;
}
const transparent = (g) => g.stops.length > 0 && g.stops.every((c) => /,0(\.0+)?\)$/.test(c));

describe('halos des scènes moteur', () => {
  it("de jour : aucun dégradé préparé sans être peint, aucun disque rempli à alpha nul", () => {
    const { grads, fills } = drawAll(0);
    expect(grads.filter((g) => !g.used).length).toBe(0);
    expect(fills.filter((f) => f.style && f.style.stops && transparent(f.style)).length).toBe(0);
  });

  it('de nuit : les halos additifs sont peints', () => {
    const { fills } = drawAll(0.95);
    const halos = fills.filter((f) => f.op === 'lighter' && f.style && f.style.stops && !transparent(f.style));
    expect(halos.length).toBeGreaterThan(IDS.length);
  });
});
