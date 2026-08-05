import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { HOUSE_TINTS, HOUSE_FAMILY, SWAP_PAIRS, COULEURS_PROTEGEES, pickHouseTint, applyHouseTint } from "../housePalette.js";

// VARIATION PAR INSTANCE des habitations. Les 12 archétypes étaient stampés à
// l'identique sur ~1300 tuiles : c'est la répétition, pas le nombre de modèles, qui
// faisait « ville photocopiée ». On échange des RAMPES de matière rang pour rang.
//
// Ces tests verrouillent les cinq façons dont l'échange peut abîmer l'art plutôt que le
// diversifier. QUATRE D'ENTRE ELLES SE SONT PRODUITES, en jeu, sous une garde qui ne
// mordait pas — d'où le commentaire attaché à chacune.

const HOUSES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../public/pixelart/houses");

// Couleurs que l'échange ne doit JAMAIS toucher. La liste vit dans housePalette.js
// (cf. COULEURS_PROTEGEES) parce que l'outil de réparation snapTintRamp.mjs en a
// besoin aussi : une garde et un outil qui divergeraient sur ce qui est intouchable
// seraient pires que pas de liste du tout.
const INTOUCHABLES = COULEURS_PROTEGEES;

// Rampe terre cuite au complet. Aucun archétype de la famille FROIDE ne doit pouvoir en
// recevoir un seul ton : c'est la tour de verre en terre cuite, le défaut d'origine.
const BRIQUE = new Set([
  "#2a1c16", "#4a2f22", "#6b4530", "#7a4a39", "#8a4c33", "#8c3b2a",
  "#8a5a3d", "#a8704a", "#b06a48", "#c98f5c", "#c98a68", "#cf9068", "#ecc6a8", "#f2c2a3"
]);

const hex = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0");
const chroma = (r, g, b) => (Math.max(r, g, b) - Math.min(r, g, b)) * 100 / 255;

// Habitations VOLONTAIREMENT laissées à l'identique (retour Raph, 2026-07-25 : « ne
// rendent pas bien, pas de nécessité de faire des chromas pour eux »). Les quatre
// vernaculaires : la terre cuite y est l'identité, et le seul échange que leur famille
// permettait les faisait chuter de 26-30 de chroma à 10-16 — de la délavure, pas de la
// variation. Cette liste est là pour que l'exclusion reste un CHOIX vérifié et non un
// oubli : le test ci-dessous refuse aussi bien un ajout de teinte ici qu'un retrait ailleurs.
const SANS_TEINTE = new Set(["tent", "hut", "longhouse", "courtyard"]);

// Sprites lus une fois, réutilisés par les tests qui mesurent sur l'art réel.
const SPRITES = readdirSync(HOUSES_DIR)
  .filter((f) => f.endsWith(".png") && !f.includes("-cosmic-"))
  .map((f) => ({ nom: f.replace(".png", ""), png: PNG.sync.read(readFileSync(join(HOUSES_DIR, f))) }));

// Teinte qu'un archétype peut RÉELLEMENT recevoir (0 = origine, donc rien à mesurer).
const teinteDe = (nom) => HOUSE_TINTS[HOUSE_FAMILY[nom] | 0];

describe("teintes des habitations", () => {
  // Sentinelle : un 13e sprite qui arriverait sans qu'on ait tranché sa famille sortirait
  // à l'identique en silence (défaut sûr de pickHouseTint). Ce test rend le silence bruyant.
  it("les 12 archétypes livrés sont tous tranchés", () => {
    expect(SPRITES.map((s) => s.nom).sort()).toEqual(
      [...Object.keys(HOUSE_FAMILY), ...SANS_TEINTE].sort()
    );
  });

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

  // ⚠ DÉFAUT VÉCU. Le vrai danger d'un échange de rampes est d'écraser deux rangs sur la
  // même cible : le dégradé perd un niveau et le volume s'aplatit. L'ancienne garde
  // comptait les cibles distinctes (« ≥ 4 ») — elle est passée au vert pendant que le
  // rang 5 de l'ardoise, qui dupliquait le rang 4, faisait tomber #b4a890, #d8cdb4 ET
  // #e9e4d6 sur le même #aab0b8. Compter ne suffit pas : on vérifie l'INJECTIVITÉ.
  it("aucune fusion de rangs : deux canoniques ne tombent jamais sur la même cible", () => {
    for (const [id, pairs] of Object.entries(SWAP_PAIRS)) {
      const map = HOUSE_TINTS.find((t) => t.id === id).map;
      const parCible = new Map();
      for (const canon of pairs.flatMap(([A, B]) => [A[0], B[0]])) {
        const cible = map.get(parseInt(canon.slice(1), 16));
        if (cible === undefined) continue;                 // orphelin assumé, cf. SWAP_FROID
        expect(
          parCible.get(cible),
          `échange ${id} : ${parCible.get(cible)} et ${canon} tombent tous deux sur ${hex(cible)}`
        ).toBeUndefined();
        parCible.set(cible, canon);
      }
    }
  });

  // Chaque échange est une INVOLUTION : si a part sur b, b doit revenir sur a. Sans ça
  // l'échange a un sens privilégié et une matière se vide au profit de l'autre.
  it("chaque échange est une involution sur ses canoniques", () => {
    for (const [id, pairs] of Object.entries(SWAP_PAIRS)) {
      const map = HOUSE_TINTS.find((t) => t.id === id).map;
      for (const [A, B] of pairs) {
        const a = parseInt(A[0].slice(1), 16), b = parseInt(B[0].slice(1), 16);
        expect(map.get(a), `échange ${id} : ${A[0]} ne part pas sur ${B[0]}`).toBe(b);
        expect(map.get(b), `échange ${id} : ${B[0]} ne revient pas sur ${A[0]}`).toBe(a);
      }
    }
  });

  // ⚠ DÉFAUT VÉCU, LE PRINCIPAL. Les deux 3-cycles d'origine envoyaient tour, megablock
  // et arcologyhome sur la rampe brique : deux tours sur trois sortaient en terre cuite,
  // avec les couleurs les plus saturées des 41 de la palette sur les plus grandes
  // surfaces plates de la carte. Rien dans les tests d'alors ne l'interdisait.
  //
  // ⚠⚠ CETTE GARDE EST ANCRÉE SUR LE PNG, PAS SUR HOUSE_FAMILY. Première version écrite :
  // elle sélectionnait les archétypes « froids » d'après HOUSE_FAMILY, donc elle comparait
  // la table à elle-même — remettre `tower` dans la famille chaude la laissait VERTE
  // (mutant passé, vérifié). C'est l'art qui décide : un sprite qui ne contient presque
  // pas de terre cuite ne doit pas pouvoir en être couvert.
  //
  // La séparation est franche, aucune zone grise : les quatre sprites froids sont à 0,0 /
  // 0,0 / 2,3 / 5,8 % de terre cuite, les huit chauds à 30 % ou plus. L'échange interdit
  // les ferait monter à 17,5 / 40,0 / 25,8 / 21,9 %.
  it("un bâtiment qui n'est pas en brique ne peut pas le devenir", () => {
    for (const { nom, png } of SPRITES) {
      const tint = teinteDe(nom);
      let opaques = 0, avant = 0, apres = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] < 128) continue;
        opaques++;
        const brut = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
        if (BRIQUE.has(hex(brut))) avant++;
        const teint = tint.map ? (tint.map.get(brut) ?? brut) : brut;
        if (BRIQUE.has(hex(teint))) apres++;
      }
      if (avant / opaques >= 0.10) continue;      // bâtiment de brique : l'échange lui va
      expect(
        apres / opaques,
        `${nom} : ${(100 * avant / opaques).toFixed(1)} % de terre cuite à l'origine, ` +
        `${(100 * apres / opaques).toFixed(1)} % après la teinte « ${tint.id} »`
      ).toBeLessThan(0.10);
    }
  });

  // ⚠ DÉFAUT VÉCU. « Couleurs criardes » : mesuré sur les PNG, la chroma moyenne montait
  // de 7,1 à 15,2 sur arcologyhome, 9,2 à 15,2 sur megablock, 13,9 à 18,0 sur tower.
  // On borne donc la HAUSSE (la baisse reste libre : un quartier de calcaire est un choix
  // d'art valide). Marge mesurée sur les tables actuelles : +2,3 au pire (megablock).
  it("aucun archétype ne voit sa chroma moyenne s'envoler", () => {
    for (const { nom, png } of SPRITES) {
      const tint = teinteDe(nom);
      if (!tint.map) continue;
      let opaques = 0, avant = 0, apres = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] < 128) continue;
        opaques++;
        const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
        avant += chroma(r, g, b);
        const t = tint.map.get((r << 16) | (g << 8) | b);
        apres += t === undefined ? chroma(r, g, b) : chroma((t >> 16) & 255, (t >> 8) & 255, t & 255);
      }
      const delta = (apres - avant) / opaques;
      expect(delta, `${nom} : chroma ${(avant / opaques).toFixed(1)} → ${(apres / opaques).toFixed(1)}`)
        .toBeLessThan(3);
    }
  });

  // Une teinte qui ne changerait presque rien sur les archétypes TARDIFS ramènerait la
  // ville de fin de partie à son état photocopié. On mesure sur les PNG réels la part
  // de pixels effectivement repeinte — et sur la SEULE teinte que l'archétype peut
  // recevoir, pas sur la plus favorable des trois (l'ancienne garde prenait le maximum,
  // ce qui la rendait insensible au fait qu'une teinte soit interdite à cet archétype).
  it("repeint une part visible de CHAQUE archétype teinté, tardifs compris", () => {
    for (const { nom, png } of SPRITES) {
      const tint = teinteDe(nom);
      // Garde DANS LES DEUX SENS : rendre une teinte à une vernaculaire échoue, en retirer
      // une à un archétype qui doit en avoir échoue aussi. Sans le second sens, vider
      // FAMILY passerait au vert (plus de teinte à mesurer = plus rien à reprocher).
      expect(Boolean(tint.map), `${nom} : teinte déclarée alors qu'elle ne le devrait pas, ou l'inverse`)
        .toBe(!SANS_TEINTE.has(nom));
      if (!tint.map) continue;
      let opaques = 0, touches = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] < 128) continue;
        opaques++;
        if (tint.map.has((png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2])) touches++;
      }
      // 15 % de la surface opaque : en dessous, la variation ne se lit plus au zoom de jeu.
      // Le plus maigre est `tower` à 28 % (son ton le plus clair est l'orphelin de SWAP_FROID).
      expect(touches / opaques, `${nom} : seulement ${(100 * touches / opaques).toFixed(0)} % de pixels repeints`)
        .toBeGreaterThan(0.15);
    }
  });
});

describe("tirage de l'aspect", () => {
  // cmHash rend un entier signé avant son `>>> 0`. Si le rebrassage saute côté appelant,
  // un seed négatif ne doit toujours pas sortir d'index invalide.
  it("reste dans les bornes même sur un seed négatif", () => {
    for (const seed of [-1, -999999, 0, 1, 2 ** 31, 2 ** 32 - 1]) {
      for (const v of ["hut", "tower", "inconnue"]) {
        const i = pickHouseTint(seed, v);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(HOUSE_TINTS.length);
      }
    }
  });

  // Défaut sûr : une variante hors table sort à l'identique plutôt qu'en couleur fausse.
  it("une variante inconnue ne reçoit aucune teinte", () => {
    for (let s = 0; s < 500; s += 1) expect(pickHouseTint(s * 2654435761, "zzz")).toBe(0);
  });

  it("n'offre à chaque archétype que la matière de sa famille", () => {
    for (const [variante, fam] of Object.entries(HOUSE_FAMILY)) {
      const vus = new Set();
      for (let s = 0; s < 2000; s += 1) vus.add(pickHouseTint((s * 2654435761) >>> 0, variante));
      expect([...vus].sort(), `${variante} : teintes tirées`).toEqual([0, fam]);
    }
  });

  // ⚠ DÉFAUT ÉVITÉ DE JUSTESSE, et le plus sournois. Le tirage à deux états prend UN BIT
  // du hash ; or cmHash est un FNV-1a, dont le multiplieur final est impair — son bit de
  // poids faible n'est que la parité de l'entrée. Sur « hvar:gx:gy », `hash & 1` produit
  // un DAMIER PARFAIT : mesuré sur 60×60 tuiles, 8,5 % de voisins identiques au lieu de
  // 50 %. Et la répartition globale sort à 50,0 % PILE, donc le test de distribution
  // ci-dessous serait resté vert sur une ville en alternance stricte. C'est le voisinage
  // qu'il faut mesurer, pas le total.
  it("ne corrèle pas deux tuiles voisines (pas de damier)", () => {
    const cmHash = (text) => {
      let h = 2166136261;
      for (let i = 0; i < String(text).length; i += 1) { h ^= String(text).charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    const N = 60, g = [];
    for (let y = 0; y < N; y += 1) {
      g[y] = [];
      for (let x = 0; x < N; x += 1) g[y][x] = pickHouseTint(cmHash("hvar:" + x + ":" + y), "townhouse");
    }
    let memes = 0, total = 0;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        if (x + 1 < N) { total += 1; if (g[y][x] === g[y][x + 1]) memes += 1; }
        if (y + 1 < N) { total += 1; if (g[y][x] === g[y + 1][x]) memes += 1; }
      }
    }
    const part = memes / total;
    expect(part, `voisins identiques : ${(100 * part).toFixed(1)} % (attendu ~50 %)`).toBeGreaterThan(0.42);
    expect(part, `voisins identiques : ${(100 * part).toFixed(1)} % (attendu ~50 %)`).toBeLessThan(0.58);
  });

  it("répartit également l'origine et l'échange", () => {
    for (const variante of Object.keys(HOUSE_FAMILY)) {
      let echanges = 0;
      for (let s = 0; s < 4000; s += 1) if (pickHouseTint((s * 2654435761) >>> 0, variante)) echanges += 1;
      // Poids égaux : ni l'origine ni l'échange ne doit occuper les deux tiers de la ville,
      // sinon on rétablit la répétition qu'on cherche à casser.
      expect(echanges, `${variante} : échange sous-représenté`).toBeGreaterThan(4000 * 0.42);
      expect(echanges, `${variante} : échange sur-représenté`).toBeLessThan(4000 * 0.58);
    }
  });
});

describe("application de la teinte", () => {
  const W = 3, H = 2;
  // 2 lignes de 3 pixels : une couleur de rampe connue, une couleur libre, un transparent.
  function buffer() {
    const d = new Uint8ClampedArray(W * H * 4);
    const put = (i, r, g, b, a) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; };
    put(0, 0xcf, 0x90, 0x68, 255);   // brique rang 4 — dans la table chaude
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
