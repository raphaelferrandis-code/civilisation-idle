// GARDE DES REQUÊTES D'HABITANTS (audit du 05/10, ASSET-2). Au chargement du module,
// agents.js préchargeait les bandes de FACE (east/west/south/north) des 64 dessins
// d'ère : 15 seulement en ont, d'où 196 requêtes en échec à chaque lancement — que le
// .exe compte en ERR_FILE_NOT_FOUND. Un faux `Image`, posé AVANT l'import du module,
// note tout ce qui est demandé ; la liste CARDINAL_NAMES est confrontée au disque dans
// les deux sens (rien d'absent n'est demandé, aucun repli existant n'est perdu).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const AGENTS = path.join("public", "pixelart", "agents");
const CARD = ["east", "west", "south", "north"];

const requested = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; requested.push(v); }
}

let A;
let prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  A = await import("../agents.js");
});
afterAll(() => { globalThis.Image = prevImage; });

const hasCardinals = (name) => CARD.every((d) => fs.existsSync(path.join(AGENTS, A.agentDir(name), `${name}-${d}.png`)));

describe("bandes de face des habitants : rien d'absent n'est demandé", () => {
  it("au chargement du module, chaque image d'agent demandée existe", () => {
    const agentReqs = requested.filter((s) => s.startsWith("/pixelart/agents/"));
    expect(agentReqs.length, "aucune bande demandée : la garde ne verrait rien").toBeGreaterThan(0);
    const missing = agentReqs.filter((s) => !fs.existsSync(path.join("public", s.split("?")[0])));
    expect(missing).toEqual([]);
  });

  it("chaque nom de CARDINAL_NAMES a ses 4 bandes de face", () => {
    const bad = [...A.CARDINAL_NAMES].filter((n) => !hasCardinals(n));
    expect(bad).toEqual([]);
  });

  it("aucun repli de face existant n'est perdu (habitants, porteurs, bêtes, émeutiers)", () => {
    const riot = ["", "stone-", "anti-", "ind-", "mod-", "fut-"].flatMap((e) =>
      ["man-fork", "man-torch", "woman-fork", "woman-torch"].map((g) => "rioter-" + e + g));
    const drawable = [...A.ISO_AGENT_NAMES, "villager", "ox", "horse", ...riot];
    const lost = drawable.filter((n) => hasCardinals(n) && !A.CARDINAL_NAMES.has(n));
    expect(lost).toEqual([]);
  });

  it("un dessin d'ère sans bandes de face n'en demande aucune", () => {
    const from = requested.length;
    // Le repli cardinal d'un légionnaire romain : rien sur le disque, rien demandé,
    // et le dessin rend false (l'appelant passe au villageois).
    const ctx = { imageSmoothingEnabled: false, drawImage() {} };
    expect(A.drawNamedAgent(ctx, 0, 0, 1, "romanman3", 0.7, 0, true, 0, 0)).toBe(false);
    expect(requested.slice(from)).toEqual([]);
  });

  it("le premier passant d'une bande précharge les diagonales de sa bande ET de la suivante", async () => {
    const { CM } = await import("../layout.js");
    const prevLayout = CM.layout;
    CM.layout = { counts: { eraBand: 4 } };   // l'Antiquité ; la suivante est la Fonte
    try {
      const from = requested.length;
      const ctx = { imageSmoothingEnabled: false, drawImage() {} };
      expect(A.drawEraAgentIso(ctx, 0, 0, 1, 0, true, 0, 0, 0)).toBe(false);   // rien de décodé
      const asked = requested.slice(from);
      for (const name of ["romanman4", "romanwoman3", "romanchild", "industrialman3", "industrialchild"]) {
        expect(asked).toContain(`/pixelart/agents/inhabitants/${name}-southeast.png`);
      }
      expect(asked.filter((s) => !fs.existsSync(path.join("public", s.split("?")[0])))).toEqual([]);
    } finally {
      CM.layout = prevLayout;
    }
  });
});
