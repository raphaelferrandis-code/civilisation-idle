// LA BIBLE DES SURFACES — sol des lots, chaussée et place, à chaque ère.
//
// Raph, 2026-10-01 : « il faut refaire les sols et les routes aussi, plus de cohérence
// et de lisibilité ». Mesuré le soir même sur les PNG et sur les captures de toutes
// les ères, trois défauts qu'aucune constante ne montrait :
//   · la rue se perdait dans son GRAIN (pavé des bandes 2-3 : 30,8 points d'écart de
//     luminance entre pixels voisins, pour 44 de différence de valeur avec son sol) ;
//   · des DAMIERS : variantes de béton de L105 à L155, de dalle tech de L49 à L73 ;
//   · des places d'une AUTRE pierre que leur quartier, et des valeurs à l'envers —
//     place médiévale plus sombre que la rue, place industrielle noire, sol tech
//     plus sombre que sa chaussée.
//
// Ce test remplace isoRoadGroundContrast.test.js, qui ne lisait que les tons moyens
// des PNG : depuis que les tuiles sont DOSÉES sur un aplat (URBAN_TILE_A,
// ROAD_TILE_A, PLAZA_GROUND), la valeur que l'œil lit est un MÉLANGE aplat/tuile —
// c'est lui qu'on mesure ici, avec les mêmes formules que le bake.
//
// LES RÈGLES (docs/PLAN-MAQUETTE-VIVANTE.md, bible des surfaces) :
//   1. la chaussée est PLUS SOMBRE que le sol des lots, d'au moins 35 de luminance ;
//   2. la place est PLUS CLAIRE que son quartier, de 5 à 35 — la version claire de
//      la même matière, jamais un trou ni un projecteur ;
//   3. grain EFFECTIF (grain de la tuile × dose) : sol ≤ 7,5 · chaussée ≤ 13 ·
//      place ≤ 10 — les fonds calmes de la maquette vivante ;
//   4. aucune matière de sol ou de place ne fait de DAMIER : ses variantes tiennent
//      dans 6 de luminance.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { isoEraSurface } from "../iso/isoGroundDetail.js";
import { ISO_TILE_VARIANTS } from "../iso/isoGroundTiles.js";
import { roadTone } from "../iso/isoRoad.js";
import { PLAZA_ERA_TONE, PLAZA_GROUND } from "../iso/isoPalette.js";
import { plazaEraForBand } from "../iso/isoPlaza.js";
import { lumOf as lum } from "../../../test/pixels.js";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);

const variantNames = (key) => {
  const n = ISO_TILE_VARIANTS[key] || 0;
  return n > 1 ? Array.from({ length: n }, (_, i) => `${key}-${i + 1}.png`) : [`${key}.png`];
};
// Ton moyen et grain de CHAQUE variante (pixels opaques du losange).
const cache = new Map();
function measure(key) {
  if (cache.has(key)) return cache.get(key);
  const out = variantNames(key).map((name) => {
    const p = PNG.sync.read(fs.readFileSync(new URL(name, DIR)));
    const n = p.width * p.height;
    const L = new Float64Array(n), A = new Uint8Array(n);
    const s = [0, 0, 0];
    let px = 0;
    for (let i = 0; i < n; i += 1) {
      A[i] = p.data[i * 4 + 3] >= 128 ? 1 : 0;
      L[i] = lum([p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]]);
      if (!A[i]) continue;
      for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
      px += 1;
    }
    let g = 0, m = 0;
    for (let y = 0; y < p.height; y += 1) {
      for (let x = 0; x < p.width; x += 1) {
        const i = y * p.width + x;
        if (!A[i]) continue;
        if (x + 1 < p.width && A[i + 1]) { g += Math.abs(L[i] - L[i + 1]); m += 1; }
        if (y + 1 < p.height && A[i + p.width]) { g += Math.abs(L[i] - L[i + p.width]); m += 1; }
      }
    }
    return { tone: s.map((v) => v / px), grain: g / m };
  });
  const r = {
    tone: [0, 1, 2].map((c) => out.reduce((a, v) => a + v.tone[c], 0) / out.length),
    grain: out.reduce((a, v) => a + v.grain, 0) / out.length,
    spread: Math.max(...out.map((v) => lum(v.tone))) - Math.min(...out.map((v) => lum(v.tone))),
  };
  cache.set(key, r);
  return r;
}
// ⚠ PAS plazaEraTileKey : il rend la tuile GÉNÉRIQUE tant que les quatre variantes de
// l'ère ne sont pas décodées — donc toujours, sous Node, où aucune image ne décode.
const plazaKey = (era) => 'iso-plaza-' + era;
const mix = (under, tile, a) => under.map((v, i) => v * (1 - a) + tile[i] * a);
const veiled = (tone, veil) => (veil ? tone.map((v, i) => v + (veil[i] - v) * veil[3]) : tone);

// Ce que le bake PEINT, ère par ère.
function surfaces(band) {
  const s = isoEraSurface(band);
  const g = measure(s.ground), r = measure(s.road);
  const ground = mix(s.groundTone, g.tone, s.groundDose);
  // Chaussée : l'aplat roadTone (voile compris) sous la tuile voilée et dosée.
  const road = mix(roadTone(band), veiled(r.tone, s.veil), s.roadDose);
  const era = plazaEraForBand(band);
  let plaza = null, plazaGrain = null;
  if (era) {
    const p = measure(plazaKey(era));
    plaza = mix(PLAZA_ERA_TONE[era], p.tone, PLAZA_GROUND.tileAlpha);
    plazaGrain = p.grain * PLAZA_GROUND.tileAlpha;
  }
  return {
    ground, road, plaza, era,
    groundGrain: g.grain * s.groundDose,
    roadGrain: r.grain * s.roadDose,
    plazaGrain,
  };
}

describe("bible des surfaces — sol, chaussée, place, par ère", () => {
  for (let band = 0; band <= 9; band += 1) {
    it(`ère ${band} : la chaussée est plus sombre que le sol des lots`, () => {
      const s = surfaces(band);
      const d = lum(s.ground) - lum(s.road);
      expect(d, `sol L${lum(s.ground).toFixed(0)} / chaussée L${lum(s.road).toFixed(0)}`).toBeGreaterThanOrEqual(35);
    });
    it(`ère ${band} : grains calmes (sol ≤ 7,5 · chaussée ≤ 13)`, () => {
      const s = surfaces(band);
      expect(s.groundGrain, "grain du sol").toBeLessThanOrEqual(7.5);
      expect(s.roadGrain, "grain de la chaussée").toBeLessThanOrEqual(13);
    });
    const era = plazaEraForBand(band);
    if (era) {
      it(`ère ${band} : la place (${era}) est la version claire de son quartier`, () => {
        const s = surfaces(band);
        const d = lum(s.plaza) - lum(s.ground);
        expect(d, `place L${lum(s.plaza).toFixed(0)} / sol L${lum(s.ground).toFixed(0)}`).toBeGreaterThanOrEqual(5);
        expect(d).toBeLessThanOrEqual(35);
        expect(s.plazaGrain, "grain de la place").toBeLessThanOrEqual(10);
      });
    }
  }

  it("aucun damier : les variantes de chaque sol et de chaque place tiennent dans 6 de luminance", () => {
    const keys = new Set();
    for (let band = 0; band <= 9; band += 1) {
      keys.add(isoEraSurface(band).ground);
      const era = plazaEraForBand(band);
      if (era) keys.add(plazaKey(era));
    }
    for (const key of keys) expect(measure(key).spread, key).toBeLessThanOrEqual(6);
  });

  // ⚠ LE point du test : les aplats et les doses FONT la lisibilité. Sans eux (tuile
  // pleine, telle que livrée), l'ère cosmique lit À L'ENVERS — la dalle tech (L61) est
  // plus sombre que sa voie (L87) — et le pavé des bandes 2-3 grésille au-dessus du
  // plafond. Une garde qui passerait aussi bien sans ce qu'elle protège ne protège rien.
  it("mord : sans aplat ni dose, l'ère cosmique lit à l'envers et le pavé grésille", () => {
    const s7 = isoEraSurface(7);
    expect(lum(measure(s7.ground).tone)).toBeLessThan(lum(measure(s7.road).tone));
    const s2 = isoEraSurface(2);
    expect(measure(s2.road).grain).toBeGreaterThan(13);
    expect(measure(s2.ground).grain).toBeGreaterThan(7.5);
  });
});
