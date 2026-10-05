// LA FICHE D'ÎLOTS SURVIT AU VRAI CHARGEMENT (docs/PLAN-ILOTS.md).
//
// ⚠ Pourquoi un test de chargement de MODULE : `state.js` fait `export let state =
// load()` à l'évaluation, et load → hydrateState → normalizeCityCore →
// normalizeCityIlot. Le premier essai lisait deux constantes de module déclarées
// PLUS BAS que cette ligne : zone morte (TDZ), la lecture jetait, et la sauvegarde
// entière partait en « illisible » — partie neuve (cf. le précédent MIGRATIONS).
// Les tests ordinaires ne le voient pas : sous Node, pas de localStorage, load()
// rend l'état par défaut sans jamais normaliser une fiche.
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { delete globalThis.localStorage; vi.resetModules(); });

describe("chargement d'une sauvegarde à îlots", () => {
  it("hydrate la fiche sans repli sur une partie neuve", async () => {
    const base = await import("../state.js");
    const save = JSON.parse(JSON.stringify(base.state));
    save.cityCore = {
      seed: 123, dx: 1, dy: -2, bx: 0, maxN: 120,
      ilot: { v: 1, blocks: ["0:0", "-1:0", "0:-1"], plazas: { "-1:0": "centrale" },
        halls: { "1:guilds:0": "0:-1" }, annexes: { "1:guilds:3": [4, -7] } },
    };
    vi.resetModules();
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a.join(" ")); });
    globalThis.localStorage = { getItem: () => JSON.stringify(save), setItem: () => {}, removeItem: () => {} };
    const fresh = await import("../state.js");
    spy.mockRestore();
    expect(errors.filter((e) => e.includes("illisible")), "sauvegarde jugée illisible").toEqual([]);
    expect(fresh.state.cityCore && fresh.state.cityCore.ilot).toEqual({
      v: 1, blocks: ["0:0", "-1:0", "0:-1"], plazas: { "-1:0": "centrale" },
      halls: { "1:guilds:0": "0:-1" }, annexes: { "1:guilds:3": [4, -7] },
    });
  });
});
