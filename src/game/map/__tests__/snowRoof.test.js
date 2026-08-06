// NEIGE SUR LES TOITS (snowRoof.js) — la passe est du RUNTIME, il n'y a donc
// aucun PNG livré à relire : la garde rejoue l'algorithme sur les VRAIS sprites
// du dépôt et vérifie ses promesses. C'est possible parce que le cœur est pur
// (un buffer RGBA entre, un masque sort) et sans DOM.
//
// ⚠ CHAQUE PROMESSE A ÉTÉ VÉRIFIÉE PAR MUTATION, et la liste ci-dessous ne
// contient que celles qui ont effectivement fait ROUGIR la garde quand on casse
// le réglage correspondant. Trois assertions d'un premier jet ne mordaient sur
// rien du tout et ont été remplacées : elles décrivaient le résultat au lieu de
// le contraindre. Réglage fautif → tests qui tombent :
//   depthK 0 (le socle prend la neige)      → « bas du sprite » + « neige haute »
//   thickK 0,03 (la couche s'effondre)      → « ni trait ni ruban » + 3 autres
//   frange coupée (fringePx/grainReach à 0) → « ni trait ni ruban »
//   rampe de feu vidée                      → « jamais sur le feu »
//   descente de matière neutralisée         → « butée vivante »
// Et la passe ADDITIVE (alpha intact, aucun pixel non-neige touché) protège le
// lookup exact de la teinte des habitations : c'est le contrat le plus silencieux
// à casser, donc celui qu'on garde en premier.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { roofSnowMask, applyRoofSnow, SNOW_RAMP, snowRoofTune } from "../snowRoof.js";

const HOUSES = new URL("../../../../public/pixelart/houses/", import.meta.url);
const ENGINE = new URL("../../../../public/pixelart/agents/buildings/", import.meta.url);

// Échantillon TÉMOIN : les deux familles, les matières de toit qui se comportent
// différemment (tuile dithérée, ardoise grise sur pierre grise, chaume, toit
// plat), et les deux tailles extrêmes. Pas un tirage au hasard — ce sont les
// sprites sur lesquels les réglages ont été relevés.
const SAMPLE = [
  [HOUSES, "hut"], [HOUSES, "townhouse"], [HOUSES, "stonehouse"], [HOUSES, "manor"],
  [HOUSES, "block"], [HOUSES, "tenement"], [HOUSES, "tower"], [HOUSES, "longhouse"],
  [ENGINE, "granary-hall"], [ENGINE, "market-macellum"], [ENGINE, "guild-house"],
  [ENGINE, "libraries-monastic"], [ENGINE, "watch-stone"], [ENGINE, "universities-gothic"],
  [ENGINE, "port-house-medieval"], [ENGINE, "works-yard"],
  // Ces deux-là sont dans la liste parce que le seuil de normale (upMin) y mord
  // réellement — il ne change rien sur les quatorze autres.
  [ENGINE, "granary-warehouse"], [ENGINE, "scribes-archive"],
];

const read = (dir, name) => PNG.sync.read(fs.readFileSync(new URL(name + ".png", dir)));

function stats(png, tune) {
  const { width: w, height: h, data } = png;
  const { snow, ink, covered } = roofSnowMask(data, w, h, tune);
  let sy = 0, iy = 0, n = 0, m = 0, y0 = h, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (data[i * 4 + 3] > 16) { iy += y; m += 1; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (snow[i]) { sy += y; n += 1; }
    }
  }
  const H = Math.max(1, y1 - y0);
  return {
    snow, ink, covered,
    frac: covered / (ink || 1),
    baryS: n ? (sy / n - y0) / H : 1,
    baryI: (iy / m - y0) / H,
  };
}

describe("neige de toit — contrats de la passe", () => {
  it("ne touche NI l'alpha NI un pixel non enneigé (le lookup de teinte en dépend)", () => {
    // applyHouseTint (housePalette.js) reconnaît ses rampes au pixel EXACT. Si la
    // passe d'hiver refroidissait les murs — ce que fait snowTrees.mjs sur le
    // feuillage — la teinte ne reconnaîtrait plus rien et les 20 aspects des
    // habitations tomberaient à 1 en hiver, sans le moindre message.
    for (const [dir, name] of SAMPLE) {
      const png = read(dir, name);
      const { width: w, height: h } = png;
      const src = Uint8ClampedArray.from(png.data);
      const dst = new Uint8ClampedArray(src.length);
      applyRoofSnow(src, dst, w, h);
      const { snow } = roofSnowMask(src, w, h);
      // On COMPTE au lieu d'asserter pixel par pixel : 16 sprites × ~10 000 px
      // font 600 000 assertions, et le test dépassait son délai avant de rien
      // prouver. Le compteur dit la même chose, en une assertion.
      let touched = 0, alphaMoved = 0, bled = 0;
      for (let i = 0; i < w * h; i += 1) {
        if (dst[i * 4 + 3] !== src[i * 4 + 3]) alphaMoved += 1;
        if (snow[i]) { touched += 1; continue; }
        for (let c = 0; c < 3; c += 1) if (dst[i * 4 + c] !== src[i * 4 + c]) { bled += 1; break; }
      }
      expect(alphaMoved, name).toBe(0);
      expect(bled, name).toBe(0);
      expect(touched, name).toBeGreaterThan(0);
    }
  });

  it("n'emploie QUE les trois tons du sol d'hiver", () => {
    // Deux matières enneigées côte à côte qui ne partagent pas leur blanc se
    // lisent comme deux hivers différents : la rampe est celle de snowTrees.mjs
    // et des tuiles iso-grass-winter-*.
    const png = read(ENGINE, "granary-hall");
    const { width: w, height: h } = png;
    const src = Uint8ClampedArray.from(png.data);
    const dst = new Uint8ClampedArray(src.length);
    applyRoofSnow(src, dst, w, h);
    const { snow } = roofSnowMask(src, w, h);
    const seen = new Set();
    for (let i = 0; i < w * h; i += 1) {
      if (!snow[i]) continue;
      seen.add([dst[i * 4], dst[i * 4 + 1], dst[i * 4 + 2]].join(","));
    }
    expect([...seen].sort()).toEqual(SNOW_RAMP.map((c) => c.join(",")).sort());
  });

  it("pose la neige HAUT dans le sprite", () => {
    // Le piège le plus coûteux de la mise au point : un test de PENTE acceptait
    // le bord d'un mur (en iso 2:1 il descend comme une arête de toit) et la
    // neige coulait le long des façades jusqu'au sol. Trois mécanismes s'y
    // opposent aujourd'hui — normale de la frontière, amincissement par
    // l'inclinaison, profondeur de matière sous la graine — et ce test tient le
    // RÉSULTAT commun plutôt que l'un d'eux.
    // Marge large : sur les témoins l'écart mesuré va de 0,22 à 0,46. Un test
    // serré serait un test du réglage ; celui-ci teste la règle.
    for (const [dir, name] of SAMPLE) {
      const s = stats(read(dir, name));
      expect(s.baryS, name).toBeLessThan(s.baryI - 0.15);
    }
  });

  it("garde une charge dans la bande utile sur tous les témoins", () => {
    // Bornes larges à dessein : elles attrapent l'effondrement (liseré d'un
    // pixel, mesuré à 4-8 % quand la couche ne suivait que la crête) et le
    // débordement (bâtiment repeint en blanc), pas le réglage fin — celui-là se
    // juge sur planche, pas en assertion.
    for (const [dir, name] of SAMPLE) {
      const s = stats(read(dir, name));
      expect(s.frac, name).toBeGreaterThan(0.02);   // tent (toit conique tres raide) = 2,7 %
      expect(s.frac, name).toBeLessThan(0.25);
    }
  });

  it("n'est ni un trait ni un ruban : la couche a du corps et un bord irrégulier", () => {
    // LES DEUX DÉFAUTS VUS EN JEU, l'un après l'autre, et ils se contredisent —
    // d'où deux assertions opposées sur la même mesure.
    //   « quand ça fait un trait blanc c'est pas beau » : une couche écrasée à
    //   1-2 px se lit comme un contour tiré à l'encre. → il faut du CORPS.
    //   « ça se voit trop que c'est une bande blanche ajoutée » : une couche
    //   d'épaisseur constante longeant l'arête se lit comme un ruban collé
    //   par-dessus le dessin. → il faut de l'IRRÉGULARITÉ.
    // On mesure les filets verticaux de neige, colonne par colonne. Un trait
    // donne un maximum de 1 ou 2 ; un ruban donne une seule longueur répétée.
    // Vérifié par mutation : thickK à 0,03 fait tomber le maximum à 1, et
    // couper la frange (fringePx et grainReach à 0) fait tomber le nombre de
    // longueurs distinctes à 2.
    for (const [dir, name] of SAMPLE) {
      const png = read(dir, name);
      const { width: w, height: h } = png;
      const { snow } = roofSnowMask(png.data, w, h);
      const runs = [];
      for (let x = 0; x < w; x += 1) {
        let y = 0;
        while (y < h) {
          if (!snow[y * w + x]) { y += 1; continue; }
          let len = 0;
          while (y + len < h && snow[(y + len) * w + x]) len += 1;
          runs.push(len);
          y += len;
        }
      }
      expect(runs.length, name).toBeGreaterThan(0);
      // Du CORPS : mesuré de 4 (la hutte, dont le toit conique rabote la couche)
      // à 13 sur les grandes scènes.
      expect(Math.max(...runs), name).toBeGreaterThanOrEqual(4);
      // De l'IRRÉGULARITÉ : mesuré de 3 (la hutte) à 13.
      expect(new Set(runs).size, name).toBeGreaterThanOrEqual(3);
      // Et la couche n'est pas QUE du grain : mesuré de 29 % (la hutte) à 99 %.
      const body = runs.filter((r) => r >= 3).reduce((a, b) => a + b, 0);
      const total = runs.reduce((a, b) => a + b, 0);
      expect(body / total, name).toBeGreaterThan(0.25);
    }
  });

  it("ne descend jamais dans le bas du sprite (le socle n'est pas un toit)", () => {
    // Beaucoup de props portent leur bout de terrain dans le sprite. Sans la
    // règle de PROFONDEUR (depthK), la passe pose deux coins blancs en biseau de
    // part et d'autre de la base — et le sol, lui, est déjà enneigé par les
    // tuiles d'hiver. Mesuré : le pixel de neige le plus bas descend à 0,67 de
    // l'encre au pire (works-yard) avec la règle, à 0,94 sans elle.
    for (const [dir, name] of SAMPLE) {
      const png = read(dir, name);
      const { width: w, height: h, data } = png;
      const { snow } = roofSnowMask(data, w, h);
      let y0 = h, y1 = -1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      let low = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) if (snow[y * w + x]) low = Math.max(low, (y - y0) / Math.max(1, y1 - y0));
      }
      expect(low, name).toBeLessThan(0.75);
    }
  });

  it("la butée par la MATIÈRE est vivante, pas décorative", () => {
    // Elle est facile à croire inerte : l'épaisseur est déjà bornée par T0. Elle
    // ne l'est pas — mesurée sur les 352 sprites du dépôt, elle retient la
    // couche sur 103 d'entre eux, et sur granary-hall elle empêche 35 % de neige
    // de couler au-delà de la face de toit. Ce test échoue si quelqu'un « range »
    // la descente de matière en croyant supprimer du code mort.
    const png = read(ENGINE, "granary-hall");
    const bridee = roofSnowMask(png.data, png.width, png.height).covered;
    const libre = roofSnowMask(png.data, png.width, png.height,
      { chroma: 9, capMax: 0, maxRunK: 1 }).covered;
    expect(libre).toBeGreaterThan(bridee * 1.2);
  });

  it("ne pose JAMAIS de neige sur le feu", () => {
    // Le sommet d'une flamme est une crête parfaite : sans garde, tout brasero
    // de scène reçoit sa calotte. La détection est un lookup EXACT sur la rampe
    // de feu — surtout pas un test « rouge orangé », qui prendrait la terre
    // cuite des toits.
    const ramp = JSON.parse(fs.readFileSync(
      new URL("../../../../public/pixelart/fire-ramp.json", import.meta.url), "utf8"));
    const hex = ramp.steps.map((s) => s.hex.replace("#", ""));
    const W = 24, H = 24;
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 4;
        if (y < 4) { png.data[o + 3] = 0; continue; }         // ciel
        const h = hex[Math.min(hex.length - 1, y - 4)];
        const fire = x >= 8 && x < 16;                        // colonne de flamme
        png.data[o] = fire ? parseInt(h.slice(0, 2), 16) : 120;
        png.data[o + 1] = fire ? parseInt(h.slice(2, 4), 16) : 118;
        png.data[o + 2] = fire ? parseInt(h.slice(4, 6), 16) : 112;
        png.data[o + 3] = 255;
      }
    }
    const { snow } = roofSnowMask(png.data, W, H);
    let onFire = 0, total = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!snow[y * W + x]) continue;
        total += 1;
        if (x >= 8 && x < 16) onFire += 1;
      }
    }
    expect(onFire).toBe(0);
    expect(total).toBeGreaterThan(0);      // le reste de la dalle, lui, est enneigé
  });

  it("couvre le dessus d'un bloc, pas ses flancs, et ignore une aiguille", () => {
    // Les deux cas d'école, sur des formes synthétiques : c'est le test qui dit
    // ce que la règle PROMET, indépendamment de l'art livré.
    const build = (fn) => {
      const W = 32, H = 32;
      const p = new PNG({ width: W, height: H });
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const o = (y * W + x) * 4;
          const on = fn(x, y);
          p.data[o] = 150; p.data[o + 1] = 145; p.data[o + 2] = 140;
          p.data[o + 3] = on ? 255 : 0;
        }
      }
      return p;
    };
    // Un bloc : le DESSUS prend la neige, les FLANCS n'en prennent pas. C'est
    // exactement la distinction que le test de pente ratait (en iso, l'arête
    // d'un toit et le bord d'une masse descendent pareil) et que la normale de
    // la frontière tranche.
    const W = 32, H = 32;
    const block = build((x, y) => y >= 6 && y < 30 && x >= 4 && x < 28);
    const { snow, covered } = roofSnowMask(block.data, W, H);
    expect(covered).toBeGreaterThan(40);
    let deepest = 0;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      if (snow[y * W + x]) deepest = Math.max(deepest, y - 6);
    }
    expect(deepest).toBeLessThan(6);        // rien ne coule le long des flancs

    // Une aiguille : trop étroite pour porter une couche, et rien dessous.
    const spire = build((x, y) => y >= 4 && y < 12 && Math.abs(x - 16) <= (y - 4) / 6);
    expect(roofSnowMask(spire.data, W, H).covered).toBe(0);
  });

  it("expose des réglages, pas des constantes cachées", () => {
    // La molette __snowRoofTune doit avoir prise sur la charge : c'est tout
    // l'intérêt d'une passe de runtime plutôt que de 353 PNG dérivés.
    const png = read(ENGINE, "granary-hall");
    const base = stats(png).covered;
    const thin = stats(png, { thickK: 0.03 }).covered;
    const thick = stats(png, { thickK: 0.3, thickMax: 40 }).covered;
    expect(thin).toBeLessThan(base);
    expect(thick).toBeGreaterThan(base);
    expect(snowRoofTune.on).toBe(true);
  });
});
