// UNE ÈRE SANS ART POUR UN OBJET POSÉ (audit 2026-10-05, BRASERO-INDUSTRIEL). Le lieu
// d'une merveille cuit à la bande 4 reste affiché le temps que celui de la bande 5 se
// cuise : ses braseros se dessinaient avec l'ère industrielle, et plaza/brazier-
// industrial.png n'existe pas (ERR_FILE_NOT_FOUND dans le .exe). L'ère industrielle
// prend la corbeille de fer forgé médiévale ; tout art demandé existe sur le disque.
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { propArt } from "../isoProps.js";

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../public");

afterEach(() => { vi.unstubAllGlobals(); });

describe("art des objets posés : ères sans art", () => {
  it("un brasero de l'ère industrielle (ou moderne) demande un art qui existe", () => {
    const srcs = [];
    vi.stubGlobal("Image", class { set src(v) { srcs.push(v); } });
    for (const era of ["antique", "medieval", "industrial", "modern", "cosmic"]) propArt({ prop: "brazier", era });
    const want = srcs.filter((s) => s.includes("brazier"));
    expect(want.length).toBe(3);                         // antique, medieval, cosmic
    expect(want.some((s) => s.includes("industrial") || s.includes("modern"))).toBe(false);
    for (const s of want) expect(fs.existsSync(path.join(PUB, s)), s).toBe(true);
  });
});
