import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

import { POSE_NAMES, POSE_NONE, IDLE_ONE, citizenPose } from "../agents.js";
import { CM } from "../layout.js";
import { isoPlazaCompositions } from "../iso/isoPlaza.js";
import { folkAt, FOLK } from "../iso/plazaFolk.js";
import { depthOf } from "../iso/projection.js";

// docs/PLAN-COMPORTEMENTS.md §8 — S'ASSEOIR, SALUER, et les filles de la Maison qui
// respirent. Les poses sont des bandes {nom}-{sit|wave}-{vue}.png tirées de l'image
// d'attente de chaque habitant (faces sud seulement) ; une pose absente n'est JAMAIS
// demandée (POSE_NONE) — le .exe compte chaque fichier manquant. Ces gardes lisent le DISQUE.

const DIR = path.resolve(__dirname, "../../../../public/pixelart/agents/inhabitants");
const read = (f) => PNG.sync.read(fs.readFileSync(path.join(DIR, f)));
const palette = (img, x0 = 0, w = img.width) => {
  const s = new Set();
  for (let y = 0; y < img.height; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] > 128) s.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
    }
  }
  return s;
};
const inkHeight = (img, f) => {
  const fh = img.height;
  let top = -1, bot = -1;
  for (let y = 0; y < fh; y += 1) {
    for (let x = f * fh; x < (f + 1) * fh; x += 1) {
      if (img.data[(y * img.width + x) * 4 + 3] > 128) { if (top < 0) top = y; bot = y; }
    }
  }
  return bot - top;
};

describe("§8 — les poses des habitants (s'asseoir, saluer)", () => {
  it("chaque habitant des ères a ses poses, sauf les exceptions nommées", () => {
    expect(POSE_NAMES.size).toBe(64);
    for (const k of POSE_NONE) expect(POSE_NAMES.has(k.split(":")[0])).toBe(true);
  });

  for (const name of POSE_NAMES) {
    it(`${name} : assis et salut, faces sud, au format de sa marche, dans sa palette`, () => {
      const pw = new Set([...palette(read(`${name}-southeast.png`)), ...palette(read(`${name}-southwest.png`))]);
      for (const d of ["southeast", "southwest"]) {
        const walk = read(`${name}-${d}.png`);
        for (const kind of ["sit", "wave"]) {
          const f = `${name}-${kind}-${d}.png`;
          if (POSE_NONE.has(`${name}:${kind}`)) { expect(fs.existsSync(path.join(DIR, f))).toBe(false); continue; }
          const strip = read(f), half = read(f.replace(".png", "-half.png"));
          expect(strip.height).toBe(walk.height);
          expect(strip.width % strip.height).toBe(0);
          expect(strip.width / strip.height).toBeGreaterThanOrEqual(kind === "wave" ? 4 : 2);
          expect(half.height).toBe(Math.floor(strip.height / 2));
          for (const c of palette(strip)) expect(pw.has(c)).toBe(true);
          // ASSIS : la dernière image (tenue) est nettement plus basse que la première.
          if (kind === "sit") {
            const n = strip.width / strip.height;
            expect(inkHeight(strip, n - 1)).toBeLessThan(inkHeight(strip, 0));
          }
        }
      }
    });
  }
});

describe("§8 — les filles de la Maison des Plaisirs respirent à la porte", () => {
  it("les 16 filles de porte et de balcon sont listées", () => {
    expect(IDLE_ONE.size).toBe(16);
  });
  for (const name of IDLE_ONE) {
    it(`${name} : attente de face, image 0 = celle de la marche, dans sa palette`, () => {
      const walk = read(`${name}-southeast.png`);
      const idle = read(`${name}-idle-southeast.png`);
      const half = read(`${name}-idle-southeast-half.png`);
      const fh = walk.height;
      expect(idle.height).toBe(fh);
      expect(idle.width / fh).toBeGreaterThanOrEqual(3);
      expect(half.height).toBe(Math.floor(fh / 2));
      const pw = palette(walk);
      for (const c of palette(idle)) expect(pw.has(c)).toBe(true);
      // Raccord exact : la première image d'attente EST l'image 0 de la marche.
      for (let y = 0; y < fh; y += 1) {
        for (let x = 0; x < fh; x += 1) {
          const a = (y * walk.width + x) * 4, b = (y * idle.width + x) * 4;
          expect(idle.data[b + 3] > 128).toBe(walk.data[a + 3] > 128);
        }
      }
    });
  }
});

describe("§8 — le salut des passants qui se croisent", () => {
  it("la causette commence par un salut d'1,3 s, puis plus rien", () => {
    const a = { chatT: 4, _chat0: 4, _chatWith: {} };
    expect(citizenPose(a)).toEqual({ kind: "wave", u: 0 });
    a.chatT = 3.35;
    expect(citizenPose(a).u).toBeCloseTo(0.5, 2);
    a.chatT = 2.5;
    expect(citizenPose(a)).toBeNull();
    expect(citizenPose({ chatT: 0 })).toBeNull();
  });
});

describe("§8 — on s'assoit sur les bancs des places", () => {
  beforeEach(() => { Object.assign(FOLK, { on: true, slot: 30, speed: 0.27, leaveP: 0.1, viaP: 0.4, density: 1 }); });
  it("une place à bancs a des sièges, et quelqu'un finit assis (pose tenue)", () => {
    let seated = 0, held = 0, withSeats = 0;
    for (const kind of ["marche", "centrale", "jardin"]) {
      for (const n of [4, 5]) {
        CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
        const roadMap = new Map();
        for (let iy = 0; iy < n; iy += 1) for (let ix = 0; ix < n; ix += 1) roadMap.set((10 + ix) + "," + (10 + iy), { gx: 10 + ix, gy: 10 + iy, rank: "plaza" });
        const road = (gx, gy) => roadMap.set(gx + "," + gy, { gx, gy, rank: "street" });
        for (let i = -1; i <= n; i += 1) { road(10 + i, 9); road(10 + i, 10 + n); road(9, 10 + i); road(10 + n, 10 + i); }
        const comp = isoPlazaCompositions({ roadMap, plan: { plazas: [{ gx: 10 + n / 2, gy: 10 + n / 2, kind }] }, counts: { eraBand: 3 } }, 3)[0];
        if (!comp || !comp.folk) continue;
        const seats = comp.folk.posts[0].seat.length + comp.folk.posts[1].seat.length;
        if (!seats) continue;
        withSeats += 1;
        for (let s = 0; s <= 900; s += 0.5) {
          for (const r of folkAt(comp.folk, s * 1000, CM.TILE, depthOf)) {
            if (r.act !== "seat" || r.walking) continue;
            seated += 1;
            expect(r.pose && r.pose.kind).toBe("sit");
            if (r.pose.u >= 1) held += 1;
          }
        }
      }
    }
    expect(withSeats).toBeGreaterThan(0);
    expect(seated).toBeGreaterThan(0);
    expect(held).toBeGreaterThan(0);
  });
});
