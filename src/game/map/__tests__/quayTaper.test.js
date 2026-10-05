import { describe, expect, it, vi } from 'vitest';
import { quayTaperProfile } from '../iso/isoQuay.js';

// Ce qu'isoRiver pousse au quai (cf. « clapotis des quais » plus bas) : le vrai
// setQuayWave, observé au passage.
const pushed = vi.hoisted(() => ({ fn: null }));
vi.mock('../iso/isoQuay.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, setQuayWave: (fn) => { pushed.fn = fn; return mod.setQuayWave(fn); } };
});

// LA FIN DU QUAI SUR UNE GRÈVE (2026-10-02, retour Raph : la pointe du quai sur la
// plage du port « ne rend pas bien et fait buguer le reflet »). Le profil
// d'effilement est lu à DEUX endroits — la hauteur du mur (isoQuay) et la descente
// du reflet (isoRiver → isoReflect) : s'ils divergeaient, le reflet retomberait de
// toute la hauteur d'un mur qui s'enfonce dans le sable.

// Masque d'une rive : `on` = samples où le quai trace, `natural` = coupures naturelles.
const gate = (n, on, natural = []) => {
  const drawPlus = new Uint8Array(n), drawMinus = new Uint8Array(n), naturalOff = new Uint8Array(n);
  for (const [a, b] of on) for (let i = a; i <= b; i += 1) drawPlus[i] = 1;
  for (const i of natural) naturalOff[i] = 1;
  return { drawPlus, drawMinus, naturalOff };
};

describe('profil d\'effilement du quai', () => {
  it('s\'enfonce vers la grève (coupure en ville), mur plein ailleurs', () => {
    // Quai de 0 à 20, puis la grève du port à partir de 21.
    const p = quayTaperProfile(gate(30, [[0, 20]], [0]), 30, 1);
    expect(p[20]).toBe(0);                       // dernier sample : le mur a disparu
    expect(p[19]).toBeGreaterThan(0);
    expect(p[19]).toBeLessThan(1);
    expect(p[17]).toBe(1);                       // au-delà de TAPER : mur plein
    for (let k = 1; k <= 20; k += 1) expect(p[k]).toBeLessThanOrEqual(p[k - 1] + 1e-9);
    for (let k = 21; k < 30; k += 1) expect(p[k]).toBe(0);   // pas de quai : rien
  });

  it('un bout NATUREL finit carré, sans effilement', () => {
    // La coupure à 21 est naturelle (extrémité, port du XIXe) : mur plein jusqu'au bout.
    const p = quayTaperProfile(gate(30, [[0, 20]], [0, 21]), 30, 1);
    expect(p[20]).toBe(1);
    expect(p[19]).toBe(1);
  });

  it('reste dans 0..1 et se met en cache sur le masque (même tableau)', () => {
    const g = gate(40, [[3, 12], [18, 35]], [0]);
    const p = quayTaperProfile(g, 40, 1);
    for (const v of p) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(quayTaperProfile(g, 40, 1)).toBe(p);
    // La rive d'en face n'a pas de quai dans ce masque : profil nul.
    expect(Math.max(...quayTaperProfile(g, 40, -1))).toBe(0);
  });
});

// LE CLAPOTIS AU PIED DU MUR (2026-10-03) bat sur l'onde du fleuve, que isoRiver lui
// POUSSE (setQuayWave) : isoRiver importe déjà isoQuay (quayTaperProfile), et l'import
// inverse ferait un cycle de modules — une zone morte à l'import, piège déjà payé deux
// fois sur ce chantier (cf. isoRiverLife). L'interdiction de cet import est une règle
// ESLint (no-restricted-imports sur isoQuay.js, eslint.config.js) depuis l'audit
// 2026-10-05 (TEST-11) : le test lisait le texte des deux sources, au guillemet près.
describe('clapotis des quais', () => {
  it("isoRiver pousse son onde au quai dès son chargement", async () => {
    await import('../iso/isoRiver.js');
    expect(typeof pushed.fn, "isoRiver n'a pas branché l'onde du quai").toBe('function');
    // Hors fleuve (aucun layout), l'onde se tait au lieu de lever.
    expect(pushed.fn(0, 1)).toBeNull();
  });
});
