// CHARGEMENT À LA DEMANDE DES DÉCORS DE SCÈNE (audit du 05/10, ASSET-5). Le premier
// dessin d'une scène moteur lançait d'un bloc les 211 PNG de PROP_KEYS — toutes les
// ères, les silhouettes cosmiques dès la bande 0, et 30 fichiers que rien ne dessinait
// (modules d'aqueduc, parcelles irriguées, moulins). Chaque décor ne descend plus qu'à
// son premier usage. Un faux `Image`, posé AVANT l'import du module, note chaque requête.
import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as S from "../cityEngineSprites.js";

// ⚠ Posé par vi.hoisted, qui passe AVANT les imports, et non par un import dynamique
// dans beforeAll : la transformation à froid de cityEngineSprites.js (et de tout ce
// qu'il tire) tombait alors dans le délai du hook, 10 s, dépassé sur un poste chargé
// — la CI est 2 à 3 fois plus lente.
const { requested, FakeImage, prevImage } = vi.hoisted(() => {
  const requested = [];
  class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ""; }
    get src() { return this._src; }
    set src(v) { this._src = v; requested.push(v); }
  }
  const prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  return { requested, FakeImage, prevImage };
});

const BUILDINGS = "/pixelart/agents/buildings/";
const PUB = path.join(__dirname, "..", "..", "..", "..", "public", "pixelart", "agents", "buildings");
// La liste lue dans le SOURCE (elle n'est pas exportée).
const SRC = fs.readFileSync(path.join(__dirname, "..", "cityEngineSprites.js"), "utf8");
const KEYS = [...SRC.match(/const PROP_KEYS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

afterAll(() => { globalThis.Image = prevImage; });

const props = (from) => requested.slice(from).filter((s) => s.startsWith(BUILDINGS));

describe("décors des scènes moteur : chargés à la demande", () => {
  it("rien n'est demandé à l'import du module", () => {
    expect(props(0)).toEqual([]);
  });

  it("un décor n'est demandé qu'à son premier usage, et une seule fois", () => {
    const from = requested.length;
    expect(S.propReady("market-prop-stall")).toBe(false);          // en route
    expect(props(from)).toEqual([BUILDINGS + "market-prop-stall.png"]);
    S.propReady("market-prop-stall");
    expect(S.propImage("market-prop-stall")).toBeInstanceOf(FakeImage);
    expect(props(from).length).toBe(1);
  });

  it("un blit sans propReady préalable amorce lui aussi le chargement", () => {
    // blitProp lit l'image sans demander si elle est prête : s'il contournait le
    // chargeur paresseux, un décor jamais testé par propReady ne viendrait jamais.
    const from = requested.length;
    S.blitProp({ imageSmoothingEnabled: false, drawImage: () => {} }, 0, 0, 100, 100, "granary-hall", 0.5, 0.5, 0.5, 0.5);
    expect(props(from)).toEqual([BUILDINGS + "granary-hall.png"]);
  });

  it("les décors en route sont comptés (le noir de la chute les attend, iso/isoChute.js)", () => {
    const n0 = S.propsLoading(), v0 = S.getPropVersion();
    S.propReady("bank-house-glass");
    S.propReady("guild-house");
    expect(S.propsLoading()).toBe(n0 + 2);
    S.propReady("guild-house");                                      // déjà en route
    expect(S.propsLoading()).toBe(n0 + 2);
    S.propImage("bank-house-glass").onload();
    expect(S.propsLoading()).toBe(n0 + 1);
    expect(S.getPropVersion()).toBe(v0 + 1);
    S.propImage("guild-house").onerror();                            // perdu : plus attendu
    expect(S.propsLoading()).toBe(n0);
    expect(S.getPropVersion()).toBe(v0 + 1);
  });

  it("une clé hors de la liste n'est jamais demandée (fichiers retirés compris)", () => {
    const from = requested.length;
    for (const k of ["aqueduct-seg", "aqueduct-roman-intake", "mill-turbine", "mill-house-roman", "field-crop-neon", "cle-inconnue"]) {
      expect(S.propReady(k), k).toBe(false);
    }
    expect(S.animReady("aqueduct-water-seg")).toBe(false);
    expect(requested.slice(from).filter((s) => /aqueduct|mill-|field-|cle-inconnue/.test(s))).toEqual([]);
  });

  it("chaque clé de la liste a son PNG", () => {
    expect(KEYS.length, "liste introuvable dans le source").toBeGreaterThan(150);
    expect(KEYS.filter((k) => !fs.existsSync(path.join(PUB, k + ".png")))).toEqual([]);
  });
});
