// NEIGE D'HIVER. La saison ne change pas la MÉTÉO (le même signal rainF, la même
// averse courte), elle change ce qui TOMBE. Deux choses se jouent ici et aucune
// ne se voit sur une capture : l'embranchement lui-même, et le fait que le
// flocon ne soit pas une goutte repeinte en blanc.
//
// ⚠ Ces tests ne comparent pas le calcul à lui-même : les seuils sont des
// valeurs ABSOLUES tenues à la main (px/s, bornes d'écran). Reprendre les
// constantes du module les rendrait décoratifs.
import { describe, it, expect } from "vitest";

import { precipKind, isoSnowFlake } from "../iso/isoWeather.js";
import { SPRING, SUMMER, AUTUMN, WINTER } from "../seasonMode.js";

const W = 1280, H = 800;

describe("precipKind — l'hiver change la forme, jamais la fréquence", () => {
  it("il neige en hiver et il pleut le reste de l'année", () => {
    expect(precipKind(WINTER, 1)).toBe("snow");
    for (const s of [SPRING, SUMMER, AUTUMN]) expect(precipKind(s, 1)).toBe("rain");
  });

  it("le temps dégagé reste dégagé, hiver compris", () => {
    for (const s of [SPRING, SUMMER, AUTUMN, WINTER]) {
      expect(precipKind(s, 0)).toBe("none");
      expect(precipKind(s, 0.005)).toBe("none");   // sous le seuil : rien à dessiner
    }
  });

  it("une averse naissante tombe déjà en neige (pas de pluie au démarrage)", () => {
    expect(precipKind(WINTER, 0.02)).toBe("snow");
  });

  it("saison absente ou hors bornes : on retombe sur la pluie, jamais sur rien", () => {
    expect(precipKind(undefined, 1)).toBe("rain");
    expect(precipKind(99, 1)).toBe("rain");
  });
});

// Vitesse verticale mesurée sur un pas court, wrap exclu (le flocon qui repasse
// en haut du cadre donnerait une vitesse négative).
function fallSpeeds(t, wind, unit, count) {
  const dt = 40;                       // ms
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = isoSnowFlake(i, t, W, H, wind, unit);
    const b = isoSnowFlake(i, t + dt, W, H, wind, unit);
    if (b.y > a.y) out.push(((b.y - a.y) / dt) * 1000);
  }
  return out;
}

describe("isoSnowFlake — un flocon, pas une goutte", () => {
  it("dix fois plus lent que la pluie (qui tombe à 900-1600 px/s)", () => {
    const v = fallSpeeds(0, 0, 3, 400);
    expect(v.length).toBeGreaterThan(300);
    expect(Math.max(...v)).toBeLessThan(200);
    expect(Math.min(...v)).toBeGreaterThan(60);
  });

  it("le premier plan tombe plus vite et plus gros : c'est ce qui fait la profondeur", () => {
    const near = [], far = [];
    for (let i = 0; i < 400; i += 1) {
      const a = isoSnowFlake(i, 0, W, H, 0, 3);
      const b = isoSnowFlake(i, 40, W, H, 0, 3);
      if (b.y <= a.y) continue;
      (a.near ? near : far).push({ v: (b.y - a.y) / 0.04, size: a.size });
    }
    expect(near.length).toBeGreaterThan(50);
    expect(far.length).toBeGreaterThan(50);
    const avg = (l) => l.reduce((s, o) => s + o.v, 0) / l.length;
    expect(avg(near)).toBeGreaterThan(avg(far) * 1.2);
    expect(Math.min(...near.map((o) => o.size))).toBeGreaterThan(Math.max(...far.map((o) => o.size)));
  });

  it("tangage : sans un souffle de vent, le flocon dérive quand même", () => {
    // Sinon mille carrés descendent en rails et l'œil relit de la pluie blanche.
    const xs = [];
    for (let t = 0; t <= 4000; t += 200) xs.push(isoSnowFlake(7, t, W, H, 0, 3).x);
    const amp = Math.max(...xs) - Math.min(...xs);
    expect(amp).toBeGreaterThan(2);      // il bouge…
    expect(amp).toBeLessThan(40);        // …sans traverser l'écran
  });

  it("position PURE : deux appels au même instant donnent le même flocon", () => {
    for (const i of [0, 13, 257]) {
      const a = isoSnowFlake(i, 12345, W, H, 0.4, 3);
      const b = isoSnowFlake(i, 12345, W, H, 0.4, 3);
      expect(a).toEqual(b);
    }
  });

  it("aucun flocon hors du cadre vertical, quel que soit l'instant", () => {
    for (let t = 0; t < 60000; t += 3700) {
      for (let i = 0; i < 200; i += 1) {
        const f = isoSnowFlake(i, t, W, H, 0.7, 3);
        expect(f.y).toBeGreaterThanOrEqual(-f.size - 0.001);
        expect(f.y).toBeLessThanOrEqual(H + f.size + 0.001);
      }
    }
  });

  it("pas de colonne vide au bord au vent, à plein vent des deux côtés", () => {
    // L'écueil que la pluie documente : la dérive vide le bord d'où vient le
    // vent quand la bande de chute n'est pas élargie. Ce que cette garde tient,
    // c'est qu'AUCUNE case du cadre ne se retrouve vide, à n'importe quel vent
    // et à n'importe quelle hauteur. Elle ne dit rien de l'origine de la dérive
    // (milieu ou haut de l'écran) : les deux passent, l'écart vaut ~2 % d'une
    // rangée. Vérifié en cassant la formule, pas en la relisant.
    const COLS = 16, ROWS = 3, N = 900;
    for (const wind of [-0.7, -0.3, 0, 0.3, 0.7]) {
      const grid = new Array(COLS * ROWS).fill(0);
      // Plusieurs instants : un rideau ne doit pas être creux À UN MOMENT non
      // plus, mais tester un seul t ferait rougir la garde au moindre réglage
      // de vitesse, ce qu'elle ne surveille pas.
      for (const t of [0, 5000, 21500]) {
        for (let i = 0; i < N; i += 1) {
          const f = isoSnowFlake(i, t, W, H, wind, 3);
          if (f.x < 0 || f.x >= W || f.y < 0 || f.y >= H) continue;
          const c = Math.floor((f.x / W) * COLS), r = Math.floor((f.y / H) * ROWS);
          grid[r * COLS + c] += 1;
        }
      }
      for (let k = 0; k < grid.length; k += 1) {
        expect(grid[k], `vent ${wind}, case ${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("le vent penche la chute sans la coucher à l'horizontale", () => {
    // À plein vent, la dérive sur toute la hauteur reste bien sous la hauteur :
    // une neige qui traverserait l'écran en biais lirait comme une rafale.
    const mid = isoSnowFlake(3, 0, W, H, 0, 3);
    let maxDrift = 0;
    for (let i = 0; i < 200; i += 1) {
      const f0 = isoSnowFlake(i, 0, W, H, 0, 3);
      const f1 = isoSnowFlake(i, 0, W, H, 0.7, 3);
      maxDrift = Math.max(maxDrift, Math.abs(f1.x - f0.x));
    }
    expect(mid).toBeTruthy();
    expect(maxDrift).toBeGreaterThan(20);        // le vent se voit…
    expect(maxDrift).toBeLessThan(H * 0.5);      // …sans coucher la chute
  });
});
