// LA RAFALE NE REFORGE PLUS LE RIDEAU À CHAQUE CRAN (audit du 2026-10-05, PERF-23,
// décision de Raph : trois paliers d'inclinaison, nappes inchangées).
//
// Inclinaison, longueur et épaisseur de la goutte entrent dans la clé des quatre
// nappes plein écran (isoWeather.rainVeilFor) : suivies en continu, chaque bourrasque
// les reforgeait à chaque cran de 4 px — ~280 reforges par averse, jusqu'à 7 par
// seconde. Elles ne suivent plus la rafale qu'en TROIS paliers (calme, demi, pleine) ;
// vitesse de chute et rideau de rafale la suivent toujours en continu.
import { describe, it, expect, afterEach } from "vitest";
import { gustTier, rainDropShape, rainVeilGeo, RAIN_TUNE } from "../iso/isoWeather.js";
import { rainAt, gustAt, windAt } from "../weatherMode.js";

afterEach(() => { RAIN_TUNE.tiers = 3; });

// Une averse réelle (le cycle 1000, de son début à sa fin), à 30 images/s : combien de
// fois la géométrie de la nappe change, et au plus combien de fois par seconde.
function averse() {
  const CYCLE = 1440000, t0 = 1000 * CYCLE, w = windAt(1000);
  let prev = "", n = 0, frames = 0;
  const perSec = new Map();
  for (let t = t0; t < t0 + CYCLE; t += 1000 / 30) {
    const r = rainAt((t / CYCLE) % 1);
    if (!(r > 0.01)) continue;
    frames += 1;
    const g = Math.max(0, Math.min(1, gustAt(t) * r));
    const s = rainDropShape(r, gustTier(g), w);
    const key = rainVeilGeo(s.dx, s.dy, s.th).join(",");
    if (key !== prev) { n += 1; prev = key; const k = Math.floor((t - t0) / 1000); perSec.set(k, (perSec.get(k) || 0) + 1); }
  }
  return { n, frames, maxPerSec: Math.max(...perSec.values()) };
}

describe("PERF-23 — la forme de la goutte suit la rafale par paliers", () => {
  it("trois paliers : calme, demi-rafale, pleine rafale ; tiers < 2 = continu (A/B)", () => {
    const seen = new Set();
    for (let g = 0; g <= 1.0001; g += 0.01) seen.add(gustTier(g));
    expect([...seen].sort()).toEqual([0, 0.5, 1]);
    expect(gustTier(0.37, 0)).toBe(0.37);
    // Au calme, la goutte est EXACTEMENT celle d'avant (rien ne change sans rafale).
    const s = rainDropShape(0.8, gustTier(0.1), -0.6);
    const len = 10 + 14 * 0.8;
    expect(s).toEqual({ dx: -0.6 * len * 0.8, dy: len, th: Math.max(1, Math.round(1 + 0.6 * 0.8)) });
  });

  it("une averse reforge ses nappes bien moins souvent qu'en continu", () => {
    RAIN_TUNE.tiers = 0;
    const cont = averse();
    RAIN_TUNE.tiers = 3;
    const tiers = averse();
    expect(cont.frames).toBeGreaterThan(30 * 120);          // une vraie averse (plusieurs minutes)
    expect(tiers.n).toBeLessThan(cont.n * 0.6);
    expect(tiers.maxPerSec).toBeLessThanOrEqual(3);
    expect(tiers.maxPerSec).toBeLessThan(cont.maxPerSec);
  });
});
