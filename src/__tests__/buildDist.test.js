// CE QUE LE BUILD LIVRE (audit 2026-10-05, lot 2 « Sortie Steam »).
//   ASSET-1 : les PNG de dist/ sont recompressés SANS PERTE (palette indexée) —
//             pixels décodés identiques, contrôlés ici octet par octet ;
//   WEB-1   : sw.js est daté par l'empreinte de dist/ à chaque build, sinon les
//             sprites redessinés restaient figés chez les joueurs web ;
//   STEAM-3 : aucune dépendance de PRODUCTION — electron-builder les copiait
//             dans app.asar (26 Mo jamais lus) alors que Vite les a intégrées ;
//   STEAM-5 : les notices de licence (MIT, OFL, Font Awesome) partent avec le jeu.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { PNG } from "pngjs";
import { recompressPng } from "../../scripts/build/pngRecompress.mjs";
import { optimizeDistPngs } from "../../scripts/build/optimizeDistPngs.mjs";
import { stampServiceWorker, distBuildId } from "../../scripts/build/stampServiceWorker.mjs";
import { loadLicenseTexts, LICENSE_FILES } from "../components/dialogs/licenseTexts.js";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// PNG RVBA 8 bits tel que l'écrivent pngjs et PixelLab.
function rgbaPng(w, h, pixel) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = pixel(x, y);
    const i = (y * w + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
  }
  return PNG.sync.write(png);
}
const rgba = (buf) => {
  const p = PNG.sync.read(buf);
  return { w: p.width, h: p.height, data: Buffer.from(p.data) };
};
function expectSamePixels(a, b) {
  const A = rgba(a), B = rgba(b);
  expect([B.w, B.h]).toEqual([A.w, A.h]);
  expect(Buffer.compare(A.data, B.data)).toBe(0);
}
const colorType = (buf) => buf[25];
const bitDepth = (buf) => buf[24];
// Pixel art de synthèse : couleurs tirées (pseudo-aléatoire déterministe) dans
// une palette de n teintes. Un dégradé régulier ne convient pas — pngjs le
// compresse déjà à la perfection (lignes identiques, filtre « haut »).
function spritePixel(colors, seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return colors[(s >>> 16) % colors.length]; // bits hauts : les bas d'un LCG bouclent vite
  };
}
const PALETTE_40 = Array.from({ length: 40 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256, 255]);

describe("ASSET-1 — recompression sans perte des PNG", () => {
  it("pixel art ≤ 256 couleurs → palette indexée + tRNS, pixels identiques (alpha partiel et transparents colorés compris)", () => {
    const next = spritePixel(PALETTE_40);
    const src = rgbaPng(40, 30, (x, y) => {
      if (x < 5) return [x * 9, y, 7, 0];          // transparents de couleurs DIFFÉRENTES
      if (x < 10) return [200, 100, 50, 128];      // alpha partiel
      return next();
    });
    const out = recompressPng(src);
    expect(out).not.toBeNull();
    expect(out.length).toBeLessThan(src.length);
    expect(colorType(out)).toBe(3);
    expectSamePixels(src, out);
  });

  it("deux couleurs → palette 1 bit", () => {
    const src = rgbaPng(33, 19, spritePixel([[0, 0, 0, 0], [255, 200, 0, 255]], 7));
    const out = recompressPng(src);
    expect(bitDepth(out)).toBe(1);
    expectSamePixels(src, out);
  });

  it("plus de 256 couleurs, tout opaque → RVB, pixels identiques", () => {
    const src = rgbaPng(64, 64, (x, y) => [x * 4, y * 4, ((x * 7) ^ (y * 13)) & 255, 255]);
    const out = recompressPng(src);
    expect(out).not.toBeNull();
    expect(colorType(out)).toBe(2);
    expectSamePixels(src, out);
  });

  it("vrais sprites du jeu : décodage identique à l'original", () => {
    const dir = path.join(ROOT, "public/pixelart/houses");
    const files = readdirSync(dir).filter((f) => f.endsWith(".png")).slice(0, 6);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(path.join(dir, f));
      const out = recompressPng(src);
      if (out) expectSamePixels(src, out);
    }
  });

  it("ce qu'on ne sait pas refaire à l'identique reste tel quel : chunk d'affichage (gAMA), 16 bits, fichier illisible", () => {
    const src = rgbaPng(8, 8, () => [10, 20, 30, 255]);
    const len = Buffer.alloc(4); len.writeUInt32BE(4);
    const gama = Buffer.concat([len, Buffer.from("gAMA"), Buffer.from([0, 0, 0xb1, 0x8f]), Buffer.alloc(4)]);
    const withGama = Buffer.concat([src.subarray(0, 33), gama, src.subarray(33)]);
    expect(recompressPng(withGama)).toBeNull();

    const sixteen = Buffer.from(src);
    sixteen[24] = 16;
    expect(recompressPng(sixteen)).toBeNull();
    expect(recompressPng(Buffer.from("pas un png"))).toBeNull();
  });

  it("passe de build en parallèle sur un dossier : remplace sur place, rien d'autre ne bouge", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "png-opt-"));
    try {
      mkdirSync(path.join(dir, "pixelart"));
      const a = rgbaPng(48, 48, spritePixel([...PALETTE_40, [0, 0, 0, 0]], 3));
      const b = rgbaPng(30, 30, spritePixel(PALETTE_40.slice(0, 12), 5));
      writeFileSync(path.join(dir, "pixelart", "a.png"), a);
      writeFileSync(path.join(dir, "b.png"), b);
      writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
      const res = await optimizeDistPngs(dir, { workers: 2 });
      expect(res.files).toBe(2);
      expect(res.after).toBeLessThan(res.before);
      expectSamePixels(a, readFileSync(path.join(dir, "pixelart", "a.png")));
      expectSamePixels(b, readFileSync(path.join(dir, "b.png")));
      expect(readFileSync(path.join(dir, "index.html"), "utf8")).toBe("<!doctype html>");
      expect(readdirSync(path.join(dir, "pixelart"))).toEqual(["a.png"]); // aucun .tmp oublié
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("le plugin tourne dans le build (dist-win compris), jamais sur public/", () => {
    const cfg = read("vite.config.js");
    expect(cfg).toMatch(/apply: 'build'[\s\S]*closeBundle[\s\S]*optimizeDistPngs\(outDir\)/);
    expect(cfg).toMatch(/distFinishPlugin\(\)\]/);
    expect(read("package.json")).toMatch(/"dist-win": "vite build && electron-builder/);
  });
});

describe("WEB-1 — service worker daté à chaque build", () => {
  function fakeDist(files) {
    const dir = mkdtempSync(path.join(tmpdir(), "sw-stamp-"));
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), content);
    }
    return dir;
  }
  const SW = "const CACHE = 'civ-effondrement-v3-__BUILD_ID__';";

  it("public/sw.js porte le repère dans le nom de son cache, et activate purge les autres", () => {
    const sw = read("public/sw.js");
    expect(sw).toMatch(/const CACHE = 'civ-effondrement-v3-__BUILD_ID__';/);
    expect(sw).toMatch(/noms\.filter\(\(n\) => n !== CACHE\)\.map\(\(n\) => caches\.delete\(n\)\)/);
  });

  it("un sprite redessiné change le nom du cache ; un build identique le garde", () => {
    const d1 = fakeDist({ "sw.js": SW, "index.html": "x", "pixelart/a.png": "v1" });
    const d2 = fakeDist({ "sw.js": SW, "index.html": "x", "pixelart/a.png": "v1" });
    const d3 = fakeDist({ "sw.js": SW, "index.html": "x", "pixelart/a.png": "v2" });
    try {
      const id1 = stampServiceWorker(d1);
      expect(id1).toMatch(/^[0-9a-f]{12}$/);
      expect(readFileSync(path.join(d1, "sw.js"), "utf8")).toBe(`const CACHE = 'civ-effondrement-v3-${id1}';`);
      expect(stampServiceWorker(d2)).toBe(id1);
      expect(stampServiceWorker(d3)).not.toBe(id1);
      // sw.js lui-même n'entre pas dans l'empreinte (sinon elle ne serait pas stable).
      expect(distBuildId(d1)).toBe(id1);
    } finally {
      for (const d of [d1, d2, d3]) rmSync(d, { recursive: true, force: true });
    }
  });

  it("en-têtes Netlify : /assets/* immuable, /sw.js toujours revalidé (fichier copié dans dist/, vaut aussi pour le zip)", () => {
    const h = read("public/_headers");
    expect(h).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(h).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
  });

  it("pas d'enregistrement sur localhost (npm run preview) : https seulement", () => {
    const main = read("src/main.jsx");
    expect(main).toMatch(/if \(local\) \{\s*navigator\.serviceWorker\.getRegistrations\(\)/);
    expect(main).toMatch(/\} else if \(location\.protocol === 'https:'\) \{/);
  });
});

describe("STEAM-3 — rien de node_modules dans l'.exe", () => {
  it("aucune dépendance de production : Vite intègre tout au bundle", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(Object.keys(pkg.dependencies || {})).toEqual([]);
    for (const dep of ["react", "react-dom", "break_infinity.js", "@fortawesome/fontawesome-free"]) {
      expect(pkg.devDependencies[dep], dep).toBeTruthy();
    }
    // Le verrou suit (sinon `npm ci` refuse d'installer, en CI comme sur Netlify).
    const lock = JSON.parse(read("package-lock.json"));
    expect(Object.keys(lock.packages[""].dependencies || {})).toEqual([]);
    expect(lock.packages["node_modules/react"].dev).toBe(true);
  });
});

describe("STEAM-5 — notices de licence livrées", () => {
  it("Vite regroupe les licences des bibliothèques intégrées dans dist/licenses", () => {
    expect(read("vite.config.js")).toMatch(/build: \{ license: \{ fileName: 'licenses\/THIRD-PARTY-LICENSES\.md' \} \}/);
    expect(LICENSE_FILES).toContain("licenses/THIRD-PARTY-LICENSES.md");
  });

  it("polices : les quatre copyrights et le texte OFL 1.1 ; Font Awesome : copie conforme du LICENSE.txt du paquet", () => {
    const ofl = read("public/licenses/OFL-polices.txt");
    for (const holder of ["The Soft Type Project Authors", "The Pixelify Sans Project Authors", "The Silkscreen Project Authors", "The Inter Project Authors"]) {
      expect(ofl).toContain(holder);
    }
    expect(ofl).toContain("SIL OPEN FONT LICENSE\nVersion 1.1");
    expect(ofl).toContain("OTHER DEALINGS IN THE FONT SOFTWARE.");
    // Une montée de version de Font Awesome doit recopier sa licence.
    expect(read("public/licenses/FontAwesome-LICENSE.txt"))
      .toBe(read("node_modules/@fortawesome/fontawesome-free/LICENSE.txt"));
  });

  it("l'.exe les pose aussi à côté du programme", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.build.extraFiles).toContainEqual({ from: "dist/licenses", to: "licenses" });
  });

  it("onglet Crédits : textes lus à la demande, fichier absent sauté (et la page de repli du dev aussi)", async () => {
    const files = {
      "./licenses/THIRD-PARTY-LICENSES.md": { ok: true, text: "<!doctype html><html>" }, // dev : page du jeu
      "./licenses/OFL-polices.txt": { ok: true, text: "OFL\n" },
      "./licenses/FontAwesome-LICENSE.txt": { ok: false, text: "" },
    };
    const fetchImpl = async (url) => ({ ok: files[url].ok, text: async () => files[url].text });
    await expect(loadLicenseTexts(fetchImpl)).resolves.toBe("OFL");
    const options = read("src/components/dialogs/OptionsDialog.jsx");
    expect(options).toMatch(/<SoftwareLicenses \/>/);
  });
});

// Garde de la garde : zlib seul suffit à relire nos IDAT (pas de dépendance cachée).
describe("encodeur", () => {
  it("l'IDAT produit est un flux zlib standard", () => {
    const out = recompressPng(rgbaPng(24, 24, spritePixel(PALETTE_40, 9)));
    let o = 8, idat = null;
    while (o < out.length) {
      const len = out.readUInt32BE(o);
      if (out.toString("latin1", o + 4, o + 8) === "IDAT") idat = out.subarray(o + 8, o + 8 + len);
      o += 12 + len;
    }
    expect(() => zlib.inflateSync(idat)).not.toThrow();
  });
});
