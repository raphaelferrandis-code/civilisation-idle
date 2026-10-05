// UN LAYOUT NE RETIENT PAS LES DONNÉES DE TRAVAIL DE SON CALCUL (audit 2026-10-05,
// MEM-4). Sous V8, les fermetures d'une même fonction partagent un seul contexte :
// riverYAt, créée dans computeCityLayout et publiée sur L.river, y gardait cells,
// claimed, le plan des îlots… (mesuré à N = 292 : 19,5 Mo retenus par layout, 5,9 Mo
// une fois riverYAt fabriquée hors de la fonction). Deux gardes :
//  · aucune fonction publiée sur L hors du modèle d'eau (L.river, alias L.water) ;
//  · riverYAt ne voit pas le contexte de computeCityLayout (lu dans ses [[Scopes]]
//    par l'inspecteur de Node, la seule façon de voir ce qu'une fermeture retient).
import { describe, it, expect, beforeAll } from "vitest";
import { Session } from "node:inspector";
import { state } from "../../core/state.js";
import { growCity } from "../../../test/city.js";

// Une ville neuve (aucune mémoire de rues ni de cœur) à l'ère `i`.
function grow(i, level = 30) {
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.riverWP = null;
  return growCity(i, level);
}
// Toutes les fonctions atteignables depuis L, avec leur chemin.
function functionsOf(L) {
  const seen = new Set(), out = [];
  const walk = (o, path, d) => {
    if (!o || d > 6 || seen.has(o)) return;
    if (typeof o === "function") { out.push([path, o]); return; }
    if (typeof o !== "object" || ArrayBuffer.isView(o)) return;
    seen.add(o);
    if (o instanceof Map) { for (const [k, v] of o) walk(v, path + "<" + k + ">", d + 1); return; }
    if (o instanceof Set) { for (const v of o) walk(v, path + "{}", d + 1); return; }
    for (const k of Object.keys(o)) walk(o[k], path + "." + k, d + 1);
  };
  walk(L, "L", 0);
  return out;
}
// Les portées d'une fermeture : [{ desc, names }] (hors portée globale).
function scopesOf(fn) {
  const s = new Session();
  s.connect();
  const post = (m, p) => { let out, err; s.post(m, p, (e, r) => { err = e; out = r; }); if (err) throw err; return out; };
  try {
    globalThis.__mem4Probe = fn;
    const { result } = post("Runtime.evaluate", { expression: "globalThis.__mem4Probe" });
    const props = post("Runtime.getProperties", { objectId: result.objectId, ownProperties: false });
    const sc = (props.internalProperties || []).find((p) => p.name === "[[Scopes]]");
    const list = post("Runtime.getProperties", { objectId: sc.value.objectId, ownProperties: true });
    return list.result.filter((p) => p.value && p.value.objectId && !/Global/.test(p.value.description)).map((p) => ({
      desc: p.value.description,
      names: post("Runtime.getProperties", { objectId: p.value.objectId, ownProperties: true }).result.map((v) => v.name),
    }));
  } finally {
    delete globalThis.__mem4Probe;
    s.disconnect();
  }
}

describe("MEM-4 — mémoire retenue par un layout", () => {
  let L;
  beforeAll(() => { L = grow(0, 4); });

  it("aucune fonction publiée hors du modèle d'eau", () => {
    const stray = functionsOf(L).map(([p]) => p).filter((p) => !p.startsWith("L.river.") && !p.startsWith("L.water."));
    expect(stray).toEqual([]);
  });

  it("riverYAt ne retient que sa colonne, pas le contexte de computeCityLayout", () => {
    expect(typeof L.river.riverYAt).toBe("function");
    const scopes = scopesOf(L.river.riverYAt);
    expect(scopes.length).toBeGreaterThan(0);
    for (const sc of scopes) {
      expect(sc.desc).not.toMatch(/computeCityLayout/);
      expect(sc.names).not.toContain("cells");
      expect(sc.names).not.toContain("claimed");
    }
  });
});
