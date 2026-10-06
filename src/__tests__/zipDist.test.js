// L'ARCHIVE DU BUILD WEB (audit 2026-10-05, SCRIPT-14). Deux scripts fabriquaient
// la même archive : zip-netlify.ps1 (câblé dans npm, avec une relecture de
// contrôle) et zipDist.mjs (celui que la mémoire prescrivait, sans relecture, date
// DOS 0). Il ne reste que zipDist.mjs (`npm run zip:web`), qui a repris la
// relecture. Ce test garde les deux moitiés, sur un faux dist/ minuscule :
//   1. l'archive écrite a des noms en barres obliques, index.html à la racine, le
//      contenu exact des fichiers et une vraie date (relue par adm-zip, une autre
//      implémentation que l'écrivain) ;
//   2. la relecture REFUSE ce qui a déjà coûté un site blanc (des antislashs dans
//      les noms) et une archive sans index.html à la racine.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { zipDossier, verifierArchive } from "../../scripts/zipDist.mjs";

const ROOT = path.resolve(__dirname, "../..");
const ANTISLASH = String.fromCharCode(92);

describe("zipDist — l'archive du build web", () => {
  let dossier, source;
  const contenu = {
    "index.html": "<!doctype html><title>t</title>",
    "assets/index-abc.js": "console.log(1);".repeat(50),
    "pixelart/iso/sol.png": Buffer.from([137, 80, 78, 71, 0, 1, 2, 3, 255]),
  };
  beforeAll(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), "civ-zip-"));
    source = path.join(dossier, "dist");
    for (const [nom, octets] of Object.entries(contenu)) {
      fs.mkdirSync(path.dirname(path.join(source, nom)), { recursive: true });
      fs.writeFileSync(path.join(source, nom), octets);
    }
  });
  afterAll(() => { fs.rmSync(dossier, { recursive: true, force: true }); });

  it("écrit le CONTENU de dist/ en barres obliques, relu à l'identique", async () => {
    const sortie = path.join(dossier, "web.zip");
    const tailles = await zipDossier(source, sortie);
    expect(verifierArchive(sortie, tailles).sort()).toEqual(Object.keys(contenu).sort());
    const entrees = new AdmZip(sortie).getEntries();
    expect(entrees.map((e) => e.entryName).sort()).toEqual(Object.keys(contenu).sort());
    for (const e of entrees) {
      expect(e.getData().equals(Buffer.from(contenu[e.entryName])), e.entryName).toBe(true);
      // date DOS réelle : l'ancienne version écrivait 0 (mois 0, jour 0)
      expect(e.header.time.getFullYear(), e.entryName).toBeGreaterThanOrEqual(2020);
    }
  });

  it("la relecture refuse les antislashs et l'absence d'index.html", () => {
    const fabriquer = (noms) => {
      const z = new AdmZip();
      for (const n of noms) z.addFile(n.split(ANTISLASH).join("/"), Buffer.from(n));
      // adm-zip normalise à l'ajout : on remet le nom brut, comme l'écrivait Compress-Archive
      z.getEntries().forEach((e, i) => { e.entryName = noms[i]; });
      const p = path.join(dossier, `faux-${noms.length}-${noms[0].length}.zip`);
      fs.writeFileSync(p, z.toBuffer());
      return p;
    };
    expect(() => verifierArchive(fabriquer(["index.html", `assets${ANTISLASH}index-abc.js`])))
      .toThrow(/antislash/);
    expect(() => verifierArchive(fabriquer(["dist/index.html", "dist/assets/index-abc.js"])))
      .toThrow(/index\.html absent/);
  });

  it("un seul script d'archive : npm run zip:web, plus de zip-netlify.ps1", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["zip:web"]).toBe("node scripts/zipDist.mjs");
    expect(Object.values(pkg.scripts).some((s) => /zip-netlify|Compress-Archive/.test(s))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "scripts/zip-netlify.ps1"))).toBe(false);
  });
});
