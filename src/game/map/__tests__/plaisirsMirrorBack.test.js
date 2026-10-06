// LE DOS RECOPIE LA FACE (audit du 05/10, ASSET-8). La danse et le repos des filles de
// la Maison des Plaisirs n'ont que des vues de face : leurs bandes nord étaient des
// copies binaires des bandes sud — 64 fichiers livrés, et deux décodages par paire.
// agents.js lit désormais le nord sur le sud (MIRROR_BACK) : un faux `Image`, posé
// AVANT l'import du module, note ce qui est demandé et permet de « décoder » à la main.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const made = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ''; made.push(this); }
  get src() { return this._src; }
  set src(v) { this._src = v; }
}

let A;
let prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  A = await import('../agents.js');
});
afterAll(() => { globalThis.Image = prevImage; });

const INH = path.join('public', 'pixelart', 'agents', 'inhabitants');
const DANSE = 'plaisirs-antique-bacchante-danse';
const base = (name) => `/pixelart/agents/inhabitants/${name}-`;
// Index = direction monde (ISO_DIAG) : 0 SE, 1 NO, 2 SO, 3 NE.
const SE = 0, NO = 1, SO = 2, NE = 3;

describe('bandes de danse et de repos : le dos est lu sur la face', () => {
  it('une bande de danse ne demande que ses deux faces sud (et leurs demi-bandes), toutes livrées', () => {
    const from = made.length;
    expect(A.agentFrameIso(DANSE, NE, 1, 1)).toBe(null);   // rien de décodé
    const asked = made.slice(from).map((im) => im.src).sort();
    expect(asked).toEqual(['southeast', 'southeast-half', 'southwest', 'southwest-half'].map((d) => `${base(DANSE)}${d}.png`).sort());
    expect(asked.filter((s) => !fs.existsSync(path.join('public', s)))).toEqual([]);
  });

  it('une fois les deux faces décodées, le nord-est se dessine avec le sud-est et le nord-ouest avec le sud-ouest', () => {
    const full = made.filter((im) => im.src.startsWith(base(DANSE)) && !im.src.includes('-half'));
    expect(full.length).toBe(2);
    for (const im of full) { im.naturalWidth = 256; im.naturalHeight = 32; im.complete = true; im.onload(); }
    const ne = A.agentFrameIso(DANSE, NE, 1, 1);
    expect(ne, 'les quatre directions comptent prêtes').not.toBe(null);
    expect(ne.img).toBe(A.agentFrameIso(DANSE, SE, 1, 1).img);
    expect(ne.img.src).toBe(`${base(DANSE)}southeast.png`);
    expect(A.agentFrameIso(DANSE, NO, 1, 1).img).toBe(A.agentFrameIso(DANSE, SO, 1, 1).img);
  });

  it('une marche garde ses quatre diagonales', () => {
    const walk = 'plaisirs-antique-bacchante';
    const from = made.length;
    A.agentFrameIso(walk, SE, 1, 1);
    const asked = made.slice(from).map((im) => im.src).filter((s) => !s.includes('-idle-'));
    for (const d of ['southeast', 'northwest', 'southwest', 'northeast']) expect(asked).toContain(`${base(walk)}${d}.png`);
  });

  it('aucune bande nord de danse ou de repos n’est livrée (ce seraient des doublons jamais lus)', () => {
    const north = fs.readdirSync(INH).filter((f) => /^plaisirs-.+-(danse|repos)-north/.test(f));
    expect(north).toEqual([]);
  });
});
