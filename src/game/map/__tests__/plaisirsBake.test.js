// LA MAISON DES PLAISIRS CONSTRUITE PAR LE CODE (refonte du 2026-10-02,
// docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐).
//
// Deux contrats qu'un œil ne vérifierait qu'au hasard d'une partie :
//   · le lieu PARAÎT avec ses jeux — ni avant (un monument qui n'ouvre rien),
//     ni après (des jeux jouables dans un lieu absent de la carte, le défaut
//     d'origine : 25 ères d'écart) ; et ses pavillons suivent les jeux ouverts ;
//   · chaque âge cuit, sans marqueur de nuit oublié, et le lieu GRANDIT avec le
//     temps (« progressif avec le temps », la demande de Raph).
import { describe, it, expect } from 'vitest';
import { bakePlaisirs, plaisirsGames, plaisirsRecipeBand } from '../iso/plaisirsBake.js';
import { applyPlaisirsSkin, plaisirsSkinSpec } from '../iso/plaisirsSkin.js';
import { strollArcs, strollWalker } from '../iso/isoPlaisirs.js';
import { wonderKitForBand } from '../iso/wonderKits.js';
import { PLAISIRS_OPEN_ERA } from '../layout.js';
import { scratchUnlocked } from '../../core/actions/scratch.js';
import { blackjackUnlocked } from '../../core/actions/blackjack.js';
import { icarusUnlocked } from '../../core/actions/icarus.js';
import { regulationActionUnlocked } from '../../core/mechanics/crisis-cost.js';
import { REGULATION_ACTIONS } from '../../data/regulationActions.js';

const gamble = REGULATION_ACTIONS.find((a) => a.kind === 'gamble');
const opaque = (R) => { let n = 0; for (let i = 3; i < R.data.length; i += 4) if (R.data[i]) n += 1; return n; };
// Hauteur d'encre (px) : du haut du raster jusqu'au niveau de l'eau.
const inkHeight = (R) => {
  for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) if (R.data[(j * R.w + i) * 4 + 3]) return -(R.oy + j);
  return 0;
};
const ALL = { osselets: true, tickets: true, cartes: true, icare: true, boutique: true };

describe('le lieu paraît avec ses jeux', () => {
  it('chaque pavillon suit le verrou de SON jeu, à toutes les ères', () => {
    for (let be = 0; be <= 8; be += 1) {
      const ctx = { bestEra: be };
      const g = plaisirsGames({ bestEraIndex: be }, 0);
      expect(g.osselets, `osselets ère ${be}`).toBe(regulationActionUnlocked(gamble.id, ctx));
      expect(g.tickets, `tickets ère ${be}`).toBe(scratchUnlocked(ctx));
      expect(g.cartes, `vingt-et-un ère ${be}`).toBe(blackjackUnlocked(ctx));
      expect(g.icare, `Icare ère ${be}`).toBe(icarusUnlocked(ctx));
    }
  });
  it("le seuil d'apparition sur la carte est l'ère du PREMIER jeu ouvert", () => {
    let first = null;
    for (let be = 0; be <= 8 && first == null; be += 1) {
      const ctx = { bestEra: be };
      if (scratchUnlocked(ctx) || blackjackUnlocked(ctx) || icarusUnlocked(ctx) || regulationActionUnlocked(gamble.id, ctx)) first = be;
    }
    expect(PLAISIRS_OPEN_ERA).toBe(first);
  });
  it('la boutique suit son onglet : premier effondrement, Grand Reset ou Faveur détenue', () => {
    expect(plaisirsGames({ bestEraIndex: 5 }).boutique).toBe(false);
    expect(plaisirsGames({ cycles: 1 }).boutique).toBe(true);
    expect(plaisirsGames({ grandResetCount: 1 }).boutique).toBe(true);
    expect(plaisirsGames({ faveur: 3 }).boutique).toBe(true);
  });
});

describe('les âges du lieu', () => {
  const BANDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  it('chaque âge cuit, avec ses lumières, sans marqueur de nuit resté dans l image', () => {
    for (const band of BANDS) {
      for (const winter of [false, true]) {
        const out = bakePlaisirs(wonderKitForBand(band, winter), ALL);
        const tag = `bande ${band}${winter ? ' hiver' : ''}`;
        expect(opaque(out.R), tag).toBeGreaterThan(2000);
        for (let i = 3; i < out.R.data.length; i += 4) {
          const a = out.R.data[i];
          if (a !== 0 && a !== 255) throw new Error(`${tag} : alpha ${a} resté dans l'image`);
        }
        expect(out.N, `${tag} : calque de nuit`).toBeTruthy();
        expect(out.ledges.length, `${tag} : rebords`).toBeGreaterThan(2);
        expect(out.foot, tag).toBeGreaterThan(40);
        for (const p of out.props) expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.h), tag).toBe(true);
      }
    }
  });
  it('le lieu grandit avec le temps : jamais plus bas que l âge d avant', () => {
    const h = (b) => inkHeight(bakePlaisirs(wonderKitForBand(b), ALL).R);
    let prev = 0;
    for (const b of BANDS) {
      const v = h(b);
      expect(v, `bande ${b} (${v} px) plus basse que la précédente (${prev} px)`).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(h(0)).toBeLessThan(h(4));
    expect(h(4)).toBeLessThan(h(6));
  });
  it('les jeux de l Ère III ajoutent leurs pavillons au radeau de l Ère II', () => {
    const K = wonderKitForBand(0);
    const ere2 = bakePlaisirs(K, plaisirsGames({ bestEraIndex: 2 }));
    const ere3 = bakePlaisirs(K, plaisirsGames({ bestEraIndex: 3 }));
    let diff = 0;
    for (let i = 0; i < ere3.R.data.length; i += 4) if (ere3.R.data[i + 3] !== ere2.R.data[i + 3] || ere3.R.data[i] !== ere2.R.data[i]) diff += 1;
    expect(diff).toBeGreaterThan(60);
  });
  it('les âges pas encore dessinés retombent sur une recette existante', () => {
    for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) expect(Number.isInteger(plaisirsRecipeBand(b))).toBe(true);
  });
});

// LES FILLES DE LA MAISON passent derrière ce qui est DEVANT elles, au pixel : la cuisson
// note la profondeur (x + y) de chaque pixel (retour de Raph, 2026-10-03 : coupées sur le
// pont qu'elles foulaient, la fille du balcon du mauvais côté de la balustrade).
describe('la profondeur de chaque pixel', () => {
  it('chaque pixel a sa profondeur, et le pont sous les pieds d une promeneuse est à la sienne', () => {
    for (let b = 0; b <= 9; b += 1) {
      const out = bakePlaisirs(wonderKitForBand(b), ALL), R = out.R, D = out.D, st = out.stroll;
      for (let k = 0; k < R.w * R.h; k += 1) if (R.data[k * 4 + 3] && Number.isNaN(D[k])) throw new Error(`bande ${b} : pixel ${k} sans profondeur`);
      // Le tour du ponton, moitié avant : le pixel sous ses pieds est le pont, à sa
      // profondeur (les poteaux et les fils de la guirlande font le reste).
      let n = 0, ok = 0;
      for (let a = 0; a < 360; a += 5) {
        const t = (a * Math.PI) / 180, x = st.r * Math.cos(t), y = st.r * Math.sin(t);
        if (x + y <= 0) continue;
        const k = Math.floor((x + y) / 2 - st.h - R.oy) * R.w + Math.floor(x - y - R.ox);
        if (!R.data[k * 4 + 3]) continue;
        n += 1;
        if (Math.abs(D[k] - (x + y)) <= 2.5) ok += 1;
      }
      expect(ok / n, `bande ${b} : ${ok}/${n}`).toBeGreaterThan(0.8);
    }
  });
  it('l habillage replace la fille du balcon sur son plancher, derrière sa balustrade', () => {
    const out = bakePlaisirs(wonderKitForBand(4), ALL), R = out.R;
    // Un habillage d'un pixel opaque, posé sur le pied du fût (un pixel du code).
    const img = { width: 1, height: 2, data: new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255]) };
    const at = [0, -1], skin = { img, at, glass: null, balcony: { foot: [30, 40], h: 57, rail: [20, 37, 50, 41] } };
    const sk = applyPlaisirsSkin(out, skin);
    const [x, y, h] = sk.balcony;
    expect(x - y).toBeCloseTo(at[0] + 30);
    expect((x + y) / 2 - h).toBeCloseTo(at[1] + 40);
    expect(h).toBe(57);
    expect(sk.rail).toEqual([at[0] - R.ox + 20, at[1] - R.oy + 37, at[0] - R.ox + 50, at[1] - R.oy + 41]);
    // L'hôtesse de la porte, sur le seuil dessiné ; le tour en ellipse de l'image.
    const sk2 = applyPlaisirsSkin(out, { ...skin, door: { foot: [12, 34], h: 10 }, walk: { e: [5, 6, 64, 20], h: 10, gap: [8, 82] } });
    const [dx, dy] = sk2.door;
    expect(dx - dy).toBeCloseTo(at[0] + 12);
    expect((dx + dy) / 2 - 10).toBeCloseTo(at[1] + 34);
    expect(sk2.walk.ex).toEqual([at[0] + 5, at[1] + 6, 64, 20]);
    expect(sk2.walk.gap).toEqual([8, 82]);
    expect(sk2.walk.r).toBeCloseTo(64 / Math.SQRT2);
    // Pas de profondeur sur un habillage (audit du 05/10, MEM-3) : rien ne la lisait — la
    // fille du balcon passe derrière sa balustrade, les autres ne sont découpées par rien.
    expect(sk.D).toBe(null);
  });
});

// Sur un habillage, rien ne découpe les promeneuses (la profondeur du code ne suit pas le
// dessin) : leur tour ne doit JAMAIS passer derrière la maison — le bord des galeries ne
// les cachait pas (Raph, 2026-10-04) — ni dans un secteur pris (escalier, kiosque, feu).
describe('le tour des promeneuses sur les habillages', () => {
  it('reste devant la maison et hors des secteurs pris', () => {
    for (let b = 0; b <= 9; b += 1) {
      const walk = plaisirsSkinSpec(b) && plaisirsSkinSpec(b).walk;
      expect(walk && walk.gap, `bande ${b} : pas de tour calé`).toBeTruthy();
      const arcs = strollArcs(walk), gaps = Array.isArray(walk.gap[0]) ? walk.gap : [walk.gap];
      expect(arcs.length, `bande ${b} : aucun arc ouvert`).toBeGreaterThan(0);
      for (const [a0, L] of arcs) {
        for (let u = 0; u <= L + 1e-9; u += 0.01) {
          const d = ((((a0 + u) * 180) / Math.PI) % 360 + 360) % 360;
          // Le cœur de l'arrière, où la maison cache toujours (un habillage peut ouvrir ses
          // côtés tant qu'elles restent À CÔTÉ de la tour : la Pierre).
          expect(d < 150 || d > 270, `bande ${b} : ${d.toFixed(1)}° derrière la maison`).toBe(true);
          for (const [g0, g1] of gaps) expect(((d - g0) % 360 + 360) % 360 > g1 - g0, `bande ${b} : ${d.toFixed(1)}° dans [${g0}, ${g1}]`).toBe(true);
        }
      }
    }
  });
  // Audit des comportements (2026-10-04) : sur une ellipse, l'angle à vitesse constante
  // faisait varier le pas au sol ; et deux promeneuses du même chemin se traversaient.
  it('marche à vitesse constante au sol, et les deux du même chemin ne se traversent pas', () => {
    const img = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    for (let b = 0; b <= 9; b += 1) {
      const sk = plaisirsSkinSpec(b), out = bakePlaisirs(wonderKitForBand(b), ALL);
      const st = { ...out.stroll, ...applyPlaisirsSkin(out, { ...sk, img }).walk };
      const prev = [null, null];
      let minGap = Infinity, maxGap = 0;
      for (let t = 0; t <= 120000; t += 40) {
        const W = [strollWalker(st, 0, t), strollWalker(st, 1, t)];
        for (let k = 0; k < 2; k += 1) {
          const w = W[k], q = prev[k];
          // Hors des demi-tours (le pas revient sur lui-même) : 7 px/s au sol.
          if (q && q.vx * w.vx + q.vy * w.vy > 0) {
            const v = Math.hypot(w.x - q.x, w.y - q.y) / 0.04;
            expect(Math.abs(v - 7), `bande ${b}, fille ${k}, t = ${t} : ${v.toFixed(2)} px/s`).toBeLessThan(0.7);
          }
          prev[k] = w;
        }
        if (strollArcs(st).length === 1) {
          const g = Math.hypot(W[0].x - W[1].x, W[0].y - W[1].y);
          minGap = Math.min(minGap, g); maxGap = Math.max(maxGap, g);
        }
      }
      if (minGap < Infinity) expect(minGap, `bande ${b} : elles se traversent`).toBeGreaterThan(2.4);
      // … et ne marchent pas collées (un simple décalage, sur un arc court, les y gardait).
      if (maxGap > 0) expect(maxGap, `bande ${b} : elles restent collées`).toBeGreaterThan(15);
    }
  });
});
