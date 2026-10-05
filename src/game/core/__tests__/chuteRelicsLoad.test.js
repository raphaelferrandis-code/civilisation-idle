// LES RUINES DE LA CITÉ TOMBÉE SURVIVENT AU VRAI CHARGEMENT (docs/PLAN-CHUTE.md).
//
// ⚠ Même piège que cityIlotLoad.test.js : `state.js` fait `export let state = load()`
// à l'évaluation, et load → hydrateState → normalizeCityRelics. Le premier jet lisait
// une constante de module (le plafond des ruines) déclarée PLUS BAS que cette ligne :
// zone morte (TDZ), la lecture jetait et la sauvegarde partait en « illisible » —
// partie neuve au lancement qui suit la PREMIÈRE chute (une save sans ruines sortait
// de la fonction avant la lecture). Les tests ordinaires ne le voient pas : sous Node,
// pas de localStorage, load() rend l'état par défaut sans jamais normaliser de ruines.
// La sauvegarde chargée ici porte des ruines au PREMIER format (v1) : leur conversion
// au format v2 (packCityRelics, audit du 05/10 CHUTE-14) tourne, elle aussi, pendant
// load() — et ne doit rien lire qui soit déclaré plus bas.
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { delete globalThis.localStorage; vi.resetModules(); });

describe("chargement d'une sauvegarde avec des ruines", () => {
  it("hydrate les ruines et garde la partie, sans repli sur une partie neuve", async () => {
    const base = await import("../state.js");
    const save = JSON.parse(JSON.stringify(base.state));
    const v1 = {
      v: 1, seed: 4242, n: 120,
      keys: ["h|domus|0||0", "p|courthouses-basilica-grand"],
      items: [[-5, -3, 1, 1, 0, -17.5, -33.25, 49.9, 58.8, 0], [4, 2, 3, 3, 1, -60, -140, 176, 160, 1]],
    };
    const relics = {
      v: 2, seed: 4242,
      keys: ["h|domus|0||0", "p|courthouses-basilica-grand"],
      forms: [[0, 1, 1, -1750, -3325, 4990, 5880], [1, 3, 3, -6000, -14000, 17600, 16000]],
      items: [-5, -3, 0, 4, 2, 1],
    };
    save.mapSeed = 4242;
    save.cityRelics = v1;
    save.population = "123456";
    vi.resetModules();
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a.join(" ")); });
    globalThis.localStorage = { getItem: () => JSON.stringify(save), setItem: () => {}, removeItem: () => {} };
    const fresh = await import("../state.js");
    spy.mockRestore();
    expect(errors.filter((e) => e.includes("illisible")), "sauvegarde jugée illisible").toEqual([]);
    expect(fresh.state.cityRelics).toEqual(relics);
    expect(fresh.state.mapSeed).toBe(4242);
    expect(String(fresh.state.population)).toBe("123456");
  });
});
