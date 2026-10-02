// LA NAPPE SANS ÉCAILLES (2026-10-02, scripts/eauSansEcailles.mjs).
//
// Raph : « qu'est-ce que tu proposes pour les écailles ? », puis sur planche « go
// pour la nouvelle ». La bande calme faisait 16 px — UNE tuile de jeu — et ses anneaux
// clairs dessinaient une grille d'alvéoles dès le zoom 1,5. Les quatre coloris de
// l'état de la partie pointent désormais vers des bandes de 64 px sans forme fermée.
//
// Ce qu'on protège : la PROPRIÉTÉ des PNG branchés (WATER_SHEETS), pas le script.
// Chaque garde a son TÉMOIN, rejoué sur l'ancienne bande de 16 px, qui doit échouer
// (sans lui, un seuil ne prouve rien — cf. waterCalmTile.test.js).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { WATER_SHEETS } from "../iso/isoRiver.js";

const FRAMES = 8;
const read = (src) => PNG.sync.read(fs.readFileSync(path.join(process.cwd(), "public", src)));
const key = (p, x, y) => { const i = (y * p.width + x) * 4; return `${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`; };

// Coloris branché → son ancienne bande de 16 px (même palette de cinq couleurs).
const COLORIS = [
  ["beau", "/pixelart/water/river-tiles-calm-ciel.png"],
  ["usure", "/pixelart/water/river-tiles-calm-turquoise.png"],
  ["hiver", "/pixelart/water/river-tiles-calm-hiver.png"],
  ["pluie", "/pixelart/water/river-tiles-calm.png"],
].map(([cle, ancien]) => ({ cle, png: read(WATER_SHEETS[cle].src), ancien: read(ancien) }));

const tile = (p) => p.height;

// Image 0 d'une bande, répétée sur un carré de côté S (une bande de 16 px montre ainsi
// ce que l'écran voit : sa répétition).
function frame0(p, S = 64) {
  const T = tile(p);
  return { w: S, h: S, at: (x, y) => key(p, ((x % T) + T) % T, ((y % T) + T) % T) };
}

// LA GRILLE : parmi les pixels qui ne sont PAS le fond, quelle part retrouve la même
// couleur 16 px plus loin (une tuile de jeu), en x ET en y. Une bande de 16 px : 100 %.
function grille16(p) {
  const f = frame0(p), cnt = new Map();
  for (let y = 0; y < f.h; y += 1) for (let x = 0; x < f.w; x += 1) cnt.set(f.at(x, y), (cnt.get(f.at(x, y)) || 0) + 1);
  const fond = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
  let n = 0, same = 0;
  for (let y = 0; y < f.h; y += 1) for (let x = 0; x < f.w; x += 1) {
    const c = f.at(x, y);
    if (c === fond) continue;
    n += 1;
    if (f.at(x + 16, y) === c && f.at(x, y + 16) === c) same += 1;
  }
  return same / n;
}

function churn(p) {
  const T = tile(p);
  let n = 0;
  for (let f = 0; f < FRAMES; f += 1) {
    const g = (f + 1) % FRAMES;
    for (let y = 0; y < T; y += 1) for (let x = 0; x < T; x += 1) if (key(p, f * T + x, y) !== key(p, g * T + x, y)) n += 1;
  }
  return 100 * n / (FRAMES * T * T);
}

function socle(p) {
  const T = tile(p);
  let n = 0;
  for (let y = 0; y < T; y += 1) for (let x = 0; x < T; x += 1) {
    let same = true;
    for (let f = 1; f < FRAMES && same; f += 1) if (key(p, f * T + x, y) !== key(p, x, y)) same = false;
    if (same) n += 1;
  }
  return 100 * n / (T * T);
}

// Raccord : l'écart entre la dernière et la première colonne (ou rangée) du carreau,
// rapporté au PLUS GRAND écart entre deux colonnes voisines à l'intérieur. ≤ 1 : le bord
// ne se distingue pas de l'intérieur. (La mesure de waterCalmTile — bord contre écart
// MOYEN — ne convient pas à une nappe unie à 88 % : une seule colonne qui croise un
// creux suffit à doubler la moyenne. Mesuré : 0,68 à 0,83 ici, 0,64 à 0,80 sur les
// anciennes bandes de 16 px.)
function raccord(p) {
  const T = tile(p);
  const px = (x, y) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; };
  const d = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  let worst = 0;
  for (let f = 0; f < FRAMES; f += 1) {
    const o = f * T, col = [], row = [];
    for (let x = 0; x < T; x += 1) { let v = 0; for (let y = 0; y < T; y += 1) v += d(px(o + x, y), px(o + (x + 1) % T, y)); col.push(v); }
    for (let y = 0; y < T; y += 1) { let v = 0; for (let x = 0; x < T; x += 1) v += d(px(o + x, y), px(o + x, (y + 1) % T)); row.push(v); }
    worst = Math.max(worst, col[T - 1] / (Math.max(...col.slice(0, T - 1)) || 1), row[T - 1] / (Math.max(...row.slice(0, T - 1)) || 1));
  }
  return worst;
}

const teintes = (p) => { const s = new Set(); for (let i = 0; i < p.data.length; i += 4) s.add(`${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`); return s; };
const moyenne = (p) => {
  const sum = [0, 0, 0], n = p.width * p.height;
  for (let i = 0; i < p.data.length; i += 4) { sum[0] += p.data[i]; sum[1] += p.data[i + 1]; sum[2] += p.data[i + 2]; }
  return sum.map((v) => v / n);
};
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("la nappe sans écailles", () => {
  for (const c of COLORIS) {
    describe(`coloris « ${c.cle} » (${WATER_SHEETS[c.cle].src})`, () => {
      it("est une bande de 8 images de 64×64", () => {
        expect([c.png.width, c.png.height]).toEqual([64 * FRAMES, 64]);
      });

      it("garde EXACTEMENT les cinq couleurs de son coloris (rien d'inventé)", () => {
        const a = teintes(c.png), b = teintes(c.ancien);
        expect(a.size).toBe(5);
        for (const t of a) expect(b.has(t), `teinte étrangère ${t}`).toBe(true);
      });

      it("ne dessine plus de grille à l'échelle d'une tuile de jeu", () => {
        expect(grille16(c.png)).toBeLessThan(0.3);
      });

      it("reste calme : un socle figé, peu de pixels qui changent", () => {
        expect(churn(c.png)).toBeLessThan(15);
        expect(socle(c.png)).toBeGreaterThan(55);
        expect(churn(c.png)).toBeGreaterThan(0);          // les reflets vivent encore
      });

      it("se répète sans couture", () => {
        expect(raccord(c.png)).toBeLessThanOrEqual(1);
      });

      it("garde la FAMILLE de son coloris : même canal dominant, à peine plus sombre", () => {
        // La nouvelle nappe a moins de pixels clairs que l'ancienne (c'étaient eux qui
        // dessinaient la grille) : elle est un peu plus sombre — mesuré −3 au beau fixe,
        // −7 à −10 sur l'hiver, l'averse et l'usure, jugé sur planche (2026-10-02). Ce
        // qu'on garde : la couleur qui domine (un bleu reste bleu, un turquoise reste
        // vert-bleu) et un écart de luminosité borné.
        const a = moyenne(c.png), b = moyenne(c.ancien);
        expect(a.indexOf(Math.max(...a))).toBe(b.indexOf(Math.max(...b)));
        expect(Math.abs(lum(a) - lum(b))).toBeLessThanOrEqual(12);
      });

      it("son liseré reste PLUS CLAIR que l'eau", () => {
        const lis = WATER_SHEETS[c.cle].shore[2].split(",").map(Number);
        expect(lum(lis)).toBeGreaterThan(lum(moyenne(c.png)) + 30);
      });
    });
  }

  it("TÉMOIN : l'ancienne bande de 16 px se répète à l'identique à chaque tuile", () => {
    for (const c of COLORIS) expect(grille16(c.ancien)).toBe(1);
  });

  it("les quatre coloris restent franchement DISTINCTS entre eux", () => {
    for (let i = 0; i < COLORIS.length; i += 1) for (let j = i + 1; j < COLORIS.length; j += 1) {
      const a = moyenne(COLORIS[i].png), b = moyenne(COLORIS[j].png);
      const dist = a.reduce((s2, v, k) => s2 + Math.abs(v - b[k]), 0);
      expect(dist, `${COLORIS[i].cle} vs ${COLORIS[j].cle}`).toBeGreaterThan(40);
    }
  });
});
