import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { HOUSE_TINTS, pickHouseTint, applyHouseTint } from "../housePalette.js";

// VARIATION PAR INSTANCE des habitations. Les 12 archétypes étaient stampés à
// l'identique sur ~1300 tuiles : c'est la répétition, pas le nombre de modèles, qui
// faisait « ville photocopiée ». On échange des RAMPES de matière rang pour rang.
// Ce que ces tests verrouillent, ce sont les trois façons dont l'échange peut abîmer
// l'art plutôt que le diversifier.

const HOUSES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../public/pixelart/houses");

// Couleurs que l'échange ne doit JAMAIS toucher, et la raison de chacune. Un ajout de
// rampe distrait qui les avalerait passerait inaperçu à l'œil sur une capture, mais
// dissoudrait le trait ou peindrait un arbre en bleu sur toute la carte.
const INTOUCHABLES = {
  "#211a1d": "noir de contour (11 sprites sur 12)",
  "#0d0b0c": "noir de contour cosmique",
  "#5c7d38": "feuillage", "#8aa24a": "feuillage",
  "#2c6b51": "feuillage", "#4a5f50": "feuillage", "#5aa87d": "feuillage",
  "#dfe08a": "chaume (identité de l'ère 1)", "#b3c840": "chaume",
  "#1f3a44": "teal (eau et verre)", "#356b78": "teal", "#6fb0b8": "teal"
};

const hex = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0");

describe("teintes des habitations", () => {
  it("ne touche à aucune couleur protégée", () => {
    for (const tint of HOUSE_TINTS) {
      if (!tint.map) continue;
      for (const src of tint.map.keys()) {
        expect(
          INTOUCHABLES[hex(src)],
          `teinte ${tint.id} repeint ${hex(src)} — ${INTOUCHABLES[hex(src)]}`
        ).toBeUndefined();
      }
    }
  });

  // Le vrai danger d'un échange de rampes : écraser deux rangs sur la même cible, ce
  // qui aplatit le dégradé et fait perdre le volume. On l'interdit rang par rang.
  // (Le rang 5 de l'ardoise réutilise le rang 4 : exception documentée, d'où le -1.)
  it("préserve les niveaux du dégradé (pas d'écrasement de rangs)", () => {
    for (const tint of HOUSE_TINTS) {
      if (!tint.map) continue;
      const cibles = new Set(tint.map.values());
      expect(cibles.size, `teinte ${tint.id} : trop peu de niveaux distincts`).toBeGreaterThanOrEqual(4);
    }
  });

  // Une teinte qui ne changerait presque rien sur les archétypes TARDIFS ramènerait la
  // ville de fin de partie à son état photocopié. On mesure sur les PNG réels la part
  // de pixels effectivement repeinte, archétype par archétype.
  it("repeint une part visible de CHAQUE archétype, tardifs compris", () => {
    const fichiers = readdirSync(HOUSES_DIR)
      .filter((f) => f.endsWith(".png") && !f.includes("-cosmic-"));
    expect(fichiers.length).toBe(12);

    for (const f of fichiers) {
      const png = PNG.sync.read(readFileSync(join(HOUSES_DIR, f)));
      let meilleur = 0;
      for (const tint of HOUSE_TINTS) {
        if (!tint.map) continue;
        let opaques = 0, touches = 0;
        for (let i = 0; i < png.data.length; i += 4) {
          if (png.data[i + 3] < 128) continue;
          opaques++;
          const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
          if (tint.map.has(key)) touches++;
        }
        meilleur = Math.max(meilleur, touches / opaques);
      }
      // 15 % de la surface opaque : en dessous, la variation ne se lit plus au zoom de jeu.
      expect(meilleur, `${f} : seulement ${(meilleur * 100).toFixed(0)} % de pixels repeints`)
        .toBeGreaterThan(0.15);
    }
  });
});

describe("tirage de l'aspect", () => {
  // cmHash rend un entier SIGNÉ. Si le `>>> 0` saute côté appelant, un seed négatif
  // ne doit toujours pas sortir d'index invalide.
  it("reste dans les bornes même sur un seed négatif", () => {
    for (const seed of [-1, -999999, 0, 1, 2 ** 31, 2 ** 32 - 1]) {
      const i = pickHouseTint(seed);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(HOUSE_TINTS.length);
    }
  });

  it("répartit équitablement sur les trois teintes", () => {
    const n = new Array(HOUSE_TINTS.length).fill(0);
    for (let s = 0; s < 4000; s += 1) n[pickHouseTint((s * 2654435761) >>> 0)] += 1;
    // Poids égaux depuis le retrait du miroir : aucune teinte ne doit occuper la moitié
    // de la ville, sinon on rétablit la répétition qu'on cherche à casser.
    for (let i = 0; i < n.length; i += 1) {
      expect(n[i], `teinte ${HOUSE_TINTS[i].id} sous-représentée`).toBeGreaterThan(4000 * 0.25);
      expect(n[i], `teinte ${HOUSE_TINTS[i].id} sur-représentée`).toBeLessThan(4000 * 0.42);
    }
  });
});

describe("application de la teinte", () => {
  const W = 3, H = 2;
  // 2 lignes de 3 pixels : une couleur de rampe connue, une couleur libre, un transparent.
  function buffer() {
    const d = new Uint8ClampedArray(W * H * 4);
    const put = (i, r, g, b, a) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; };
    put(0, 0xcf, 0x90, 0x68, 255);   // brique rang 4 — dans les tables
    put(1, 0x12, 0x34, 0x56, 255);   // hors palette — doit passer tel quel
    put(2, 0, 0, 0, 0);              // transparent
    put(3, 0x21, 0x1a, 0x1d, 255);   // noir de contour — protégé
    put(4, 0x8a, 0xa2, 0x4a, 255);   // feuillage — protégé
    put(5, 0xff, 0xff, 0xff, 255);
    return d;
  }

  it("laisse passer les couleurs hors table et préserve l'alpha", () => {
    const src = buffer(), dst = new Uint8ClampedArray(W * H * 4);
    applyHouseTint(src, dst, W, H, 1);
    expect([dst[4], dst[5], dst[6]]).toEqual([0x12, 0x34, 0x56]);   // hors palette intact
    expect(dst[11]).toBe(0);                                        // transparent reste transparent
    expect([dst[12], dst[13], dst[14]]).toEqual([0x21, 0x1a, 0x1d]); // contour intact
    expect([dst[16], dst[17], dst[18]]).toEqual([0x8a, 0xa2, 0x4a]); // feuillage intact
  });

  it("remplace bien une couleur de rampe", () => {
    const src = buffer(), dst = new Uint8ClampedArray(W * H * 4);
    applyHouseTint(src, dst, W, H, 1);
    expect([dst[0], dst[1], dst[2]]).not.toEqual([0xcf, 0x90, 0x68]);
  });

  // GARDE-FOU MIROIR. Un miroir horizontal a été tenté puis retiré : l'éclairage et
  // l'ombre portée sont cuits dans les sprites, les retourner met la maison en
  // contradiction avec ses voisines. Le levier paraît gratuit, il reviendra donc à
  // l'idée de quelqu'un. Ce test le refuse : la teinte ne doit DÉPLACER aucun pixel,
  // seulement en changer la couleur. Un flip, une translation ou une rotation le casse.
  it("ne déplace aucun pixel (pas de miroir, pas de décalage)", () => {
    const src = buffer(), dst = new Uint8ClampedArray(W * H * 4);
    for (const tint of HOUSE_TINTS.keys()) {
      dst.fill(0);
      applyHouseTint(src, dst, W, H, tint);
      for (let p = 0; p < W * H; p += 1) {
        expect(dst[p * 4 + 3], `teinte ${HOUSE_TINTS[tint].id}, pixel ${p} déplacé`)
          .toBe(src[p * 4 + 3]);
      }
    }
  });

  // Contrôle négatif : la teinte d'origine doit rendre une copie à l'identique. Si ce
  // test tombe, c'est la passe elle-même qui abîme le sprite, pas la table.
  it("teinte d'origine : copie strictement conforme", () => {
    const src = buffer(), dst = new Uint8ClampedArray(W * H * 4);
    applyHouseTint(src, dst, W, H, 0);
    expect(Array.from(dst)).toEqual(Array.from(src));
  });
});
