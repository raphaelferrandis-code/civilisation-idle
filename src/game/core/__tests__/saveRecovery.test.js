// SAUVEGARDE ILLISIBLE : RIEN NE SE PERD EN SILENCE (audit 2026-10-05, SAV-3).
// Avant : le catch de load() copiait la save sous une seule clé de secours, puis
// rendait une partie neuve ; l'autosave des 2 s écrasait la clé principale, un
// deuxième échec la copie de secours, et aucune interface ne savait la relire.
// L'hydratation était « tout ou rien » : une seule chaîne non numérique dans un
// champ Decimal (`new Decimal("abc")` lève) jetait la partie entière.
import { describe, it, expect, vi, afterEach } from "vitest";
import { D } from "../num.js";
import { decimalField, hydrateState, defaultState } from "../state.js";
import { encodeSaveText } from "../utils.js";
import { MID_GAME_FIXTURE } from "./fixtures.js";

const KEY = "civilization-collapse-idle-v1";

function fakeStorage(entries = {}) {
  const store = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

// Démarrage à froid : un graphe de modules neuf, comme au lancement du jeu. Une
// `window` minimale fait tourner le démarrage de cloudSave.js, qui met en place une
// partie chargée par rechargement (import, copie de secours : SAV-8).
async function boot(entries) {
  const store = fakeStorage(entries);
  globalThis.window = { addEventListener: () => {} };
  vi.resetModules();
  const errors = [];
  vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a.map(String).join(" ")); });
  const st = await import("../state.js");
  const keys = await import("../saveKey.js");
  return { st, keys, store, errors };
}
// Le rechargement qui suit un chargement : même stockage, graphe neuf.
const reboot = (prev) => boot(Object.fromEntries(prev.store));

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
  vi.doUnmock("../faitsDiversState.js");
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Decimal relus d'une save : une chaîne invalide retombe au défaut au lieu de lever", () => {
  it("D() et decimalField() ne lèvent plus, et refusent l'infini", () => {
    expect(() => D("abc")).not.toThrow();
    expect(D("abc").toString()).toBe("0");
    expect(D("Infinity").toString()).toBe("0");
    expect(D("1.5e+30").toString()).toBe("1.5e+30");
    expect(decimalField("abc", 12).toString()).toBe("12");
    expect(decimalField("Infinity", 3).toString()).toBe("3");
    expect(decimalField({ mantissa: 1, exponent: 9e15 }, 4).toString()).toBe("4");
    expect(decimalField("123456", 0).toString()).toBe("123456");
  });

  it("fuzz : CHAQUE nombre sérialisé en chaîne d'une vraie save, remplacé par « abc », laisse la partie se charger", () => {
    // Les champs Decimal sont sérialisés en chaînes ("1.5e+30") — premier niveau et
    // objets imbriqués (pics du cycle, ruines…). Chacun, cassé seul, ne doit coûter
    // que lui-même.
    const save = JSON.parse(JSON.stringify(hydrateState(MID_GAME_FIXTURE)));
    const paths = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...path, i]));
      else if (node && typeof node === "object") Object.entries(node).forEach(([k, v]) => walk(v, [...path, k]));
      else if (typeof node === "string" && node !== "" && Number.isFinite(Number(node))) paths.push(path);
    };
    walk(save, []);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      const broken = JSON.parse(JSON.stringify(save));
      let node = broken;
      for (const k of path.slice(0, -1)) node = node[k];
      node[path[path.length - 1]] = "abc";
      expect(() => hydrateState(broken), path.join(".")).not.toThrow();
    }
  });
});

describe("load() : repli champ par champ", () => {
  it("un normaliseur qui lève sur UN champ ne coûte que ce champ, et la save complète est gardée", async () => {
    vi.doMock("../faitsDiversState.js", async (orig) => {
      const real = await orig();
      return { ...real, normalizeFaitsDivers: (v) => { if (v) throw new ReferenceError("TDZ simulée"); return real.normalizeFaitsDivers(v); } };
    });
    const raw = JSON.stringify({ ...JSON.parse(JSON.stringify(hydrateState(MID_GAME_FIXTURE))), cycles: 41, faitsDivers: { bidon: 1 } });
    const { st, keys, store, errors } = await boot({ [KEY]: raw });
    expect(st.state.cycles).toBe(41);                     // la partie du joueur, pas une neuve
    expect(keys.isLocalSaveUnreadable()).toBe(false);     // elle s'enregistre normalement
    expect(store.get(KEY + "-corrupt-backup")).toBe(raw); // copie complète gardée
    expect(st.state.history.at(-1)).toMatch(/faitsDivers/);
    expect(errors.some((e) => e.includes("illisible"))).toBe(true); // les tests de chargement le voient
  }, 60000);
});

describe("load() en échec total : partie neuve de repli, rien ne s'écrase", () => {
  it("copie gardée, clé principale intacte, pastille d'erreur ; « Garder » reprend l'écriture", async () => {
    const truncated = JSON.stringify({ cycles: 40, chronicleStats: { lifetimePlaySec: 9000 } }).slice(0, -7);
    const { st, keys, store } = await boot({ [KEY]: truncated });
    expect(st.state.cycles).toBe(defaultState().cycles);
    expect(keys.isLocalSaveUnreadable()).toBe(true);
    expect(store.get(KEY + "-corrupt-backup")).toBe(truncated);
    st.save();                                       // l'autosave des 2 s…
    expect(store.get(KEY)).toBe(truncated);          // … n'écrase plus rien
    expect(st.getLastSaveError()).not.toBe("");      // et l'échec reste affiché
    const slots = await import("../saveSlots.js");
    slots.keepFallbackGame();
    expect(keys.isLocalSaveUnreadable()).toBe(false);
    expect(JSON.parse(store.get(KEY)).cycles).toBe(defaultState().cycles);
    expect(store.get(KEY + "-corrupt-backup")).toBe(truncated); // la copie survit au choix
  }, 60000);

  it("deux copies DIFFÉRENTES gardées, jamais de doublon", async () => {
    const a = '{"cycles": 1, "tronque';
    const b = '{"cycles": 2, "tronque';
    let r = await boot({ [KEY]: a });
    r = await boot({ ...Object.fromEntries(r.store), [KEY]: a }); // même échec relancé
    expect(r.store.get(KEY + "-corrupt-backup")).toBe(a);
    expect(r.store.has(KEY + "-corrupt-backup-2")).toBe(false);
    r = await boot({ ...Object.fromEntries(r.store), [KEY]: b });
    expect(r.store.get(KEY + "-corrupt-backup")).toBe(b);
    expect(r.store.get(KEY + "-corrupt-backup-2")).toBe(a);
    const { listSaveBackups } = await import("../saveBackups.js");
    expect(listSaveBackups().map((x) => x.kind)).toEqual(["unreadable", "unreadable"]);
  }, 60000);

  it("une copie de secours se recharge (et lève la suspension)", async () => {
    const good = JSON.stringify({ ...JSON.parse(JSON.stringify(hydrateState(MID_GAME_FIXTURE))), cycles: 33 });
    const first = await boot({ [KEY]: "{tronqué", [KEY + ":pre-cloud"]: good });
    expect(first.keys.isLocalSaveUnreadable()).toBe(true);
    const res = (await import("../saveSlots.js")).loadBackup(KEY + ":pre-cloud");
    expect(res.ok).toBe(true);
    // Mise en place au rechargement (SAV-8).
    const { st, keys, store } = await reboot(first);
    expect(st.state.cycles).toBe(33);
    expect(keys.isLocalSaveUnreadable()).toBe(false);
    expect(JSON.parse(store.get(KEY)).cycles).toBe(33);
    const slots = await import("../saveSlots.js");
    expect(slots.loadBackup(KEY + "-corrupt-backup").ok).toBe(false); // illisible : refusé, rien ne bouge
    expect(slots.loadBackup("autre-cle").ok).toBe(false);
    expect(st.state.cycles).toBe(33);
  }, 60000);

  it("copie relue en partie : la ligne du Journal survit au rechargement, même Journal plein", async () => {
    // Le Journal est borné à 48 lignes : une 49e ligne ajoutée sans borne
    // disparaissait au rechargement (SAV-8, quand normalizeHistory gardait les 48
    // PREMIÈRES ; il garde les 48 plus récentes depuis SAV-13) — le joueur ne
    // savait jamais quels champs avaient été remis à neuf.
    vi.doMock("../faitsDiversState.js", async (orig) => {
      const real = await orig();
      return { ...real, normalizeFaitsDivers: (v) => { if (v && v.bidon) throw new ReferenceError("TDZ simulée"); return real.normalizeFaitsDivers(v); } };
    });
    const base = JSON.parse(JSON.stringify(hydrateState(MID_GAME_FIXTURE)));
    const full = Array.from({ length: 48 }, (_, i) => `Entrée ${i}`);
    const copy = JSON.stringify({ ...base, cycles: 34, history: full, faitsDivers: { bidon: 1 } });
    const first = await boot({ [KEY]: JSON.stringify(base), [KEY + ":pre-cloud"]: copy });
    const res = (await import("../saveSlots.js")).loadBackup(KEY + ":pre-cloud");
    expect(res.ok).toBe(true);
    expect(res.dropped).toEqual(["faitsDivers"]);
    const { st } = await reboot(first);
    expect(st.state.cycles).toBe(34);
    expect(st.state.history.length).toBe(48);
    expect(st.state.history.at(-1)).toMatch(/faitsDivers/);
  }, 60000);
});

describe("importSave : JSON brut et BOM acceptés", () => {
  it("accepte le code base64, le JSON brut, avec ou sans BOM — et lève la suspension", async () => {
    const save = { ...JSON.parse(JSON.stringify(hydrateState(MID_GAME_FIXTURE))), cycles: 21 };
    let g = await boot({ [KEY]: "{tronqué" });
    expect(g.keys.isLocalSaveUnreadable()).toBe(true);
    expect((await import("../main.js")).importSave("﻿" + JSON.stringify(save))).toBe(true);
    // Mise en place au rechargement (SAV-8).
    g = await reboot(g);
    expect(g.st.state.cycles).toBe(21);
    expect(g.keys.isLocalSaveUnreadable()).toBe(false);
    let main = await import("../main.js");
    expect(main.importSave(encodeSaveText("﻿" + JSON.stringify({ ...save, cycles: 22 })))).toBe(true);
    g = await reboot(g);
    expect(g.st.state.cycles).toBe(22);
    main = await import("../main.js");
    expect(main.importSave("pas une sauvegarde")).toBe(false);
    g = await reboot(g);
    expect(g.st.state.cycles).toBe(22);
  }, 60000);
});
