// LA SAUVEGARDE NE SE PERD NI PAR UNE VERSION PLUS RÉCENTE NI PAR UN FAUX CODE
// (audit 2026-10-05).
//   SAV-6 : une save d'une version PLUS RÉCENTE du jeu (branche bêta Steam, build
//           en cache) était ré-estampillée à la version courante par migrate(),
//           ses champs inconnus jetés, puis réécrite par l'autosave des 2 s —
//           et l'import comme les emplacements faisaient pareil ;
//   SAV-7 : importSave acceptait n'importe quel JSON en base64 (42, [], null,
//           « toto », {}) : partie remplacée par une partie NEUVE, écrite en
//           local et poussée de force dans le nuage.
import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeSaveText } from "../utils.js";
import { MID_GAME_FIXTURE } from "./fixtures.js";

const KEY = "civilization-collapse-idle-v1";

// Stockage en mémoire, avec length/key() : la liste des copies de secours
// énumère les clés « -vN-backup ».
function fakeStorage(entries = {}) {
  const store = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
  };
  return store;
}

// Démarrage à froid : un graphe de modules neuf, comme au lancement du jeu.
async function boot(entries) {
  const store = fakeStorage(entries);
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const st = await import("../state.js");
  const keys = await import("../saveKey.js");
  return { st, keys, store };
}

afterEach(() => {
  delete globalThis.localStorage;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("SAV-6 — save d'une version plus récente du jeu", () => {
  it("au chargement : jouée rétrogradée, copie gardée telle quelle, RIEN ne s'écrit avant « Garder »", async () => {
    const future = JSON.stringify({ ...MID_GAME_FIXTURE, saveVersion: 99, cycles: 31, champDeLaV99: { x: 1 } });
    const { st, keys, store } = await boot({ [KEY]: future });
    // La partie du joueur est là (pas une partie neuve)…
    expect(st.state.cycles).toBe(31);
    // … mais l'écriture est suspendue, pour la bonne raison.
    expect(keys.isLocalSaveUnreadable()).toBe(true);
    expect(keys.localSaveSuspendReason()).toBe("newer");
    st.save();
    expect(store.get(KEY)).toBe(future);                     // l'autosave n'écrase plus la v99
    expect(store.get(`${KEY}-v99-backup`)).toBe(future);     // copie intacte, champs inconnus compris
    const { listSaveBackups } = await import("../saveBackups.js");
    const copy = listSaveBackups().find((b) => b.kind === "version");
    expect(copy && copy.version).toBe(99);
    // « Garder » : la partie est enregistrée pour cette version ; l'originale reste.
    const slots = await import("../saveSlots.js");
    slots.keepFallbackGame();
    expect(keys.isLocalSaveUnreadable()).toBe(false);
    expect(JSON.parse(store.get(KEY)).saveVersion).toBe(keys.CURRENT_SAVE_VERSION);
    expect(store.get(`${KEY}-v99-backup`)).toBe(future);
    // Ce build ne la recharge pas (il la rétrograderait) : il le dit.
    expect(slots.loadBackup(`${KEY}-v99-backup`)).toEqual({ ok: false, newer: true });
  }, 30000);

  it("l'import et l'emplacement la refusent, sans toucher à la partie en cours", async () => {
    const { st, store } = await boot({});
    const main = await import("../main.js");
    const slots = await import("../saveSlots.js");
    st.state.cycles = 9;
    st.save();
    const before = store.get(KEY);
    const future = JSON.stringify({ ...MID_GAME_FIXTURE, saveVersion: 99, cycles: 31 });
    expect(main.importSave(encodeSaveText(future))).toBe(false);
    expect(main.getLastImportRefusal()).toBe("newer");
    store.set(`${KEY}-slot0`, future);
    expect(slots.loadSlot(0)).toBe(false);
    expect(slots.getLastSlotRefusal()).toBe("newer");
    expect(st.state.cycles).toBe(9);
    expect(store.get(KEY)).toBe(before);
  }, 30000);
});

describe("SAV-7 — importSave n'accepte que la forme d'une save de ce jeu", () => {
  it("42, [], null, « toto », {} : refusés, la partie et sa sauvegarde restent intactes", async () => {
    const { st, store } = await boot({});
    const main = await import("../main.js");
    const { D } = await import("../num.js");
    st.state.cycles = 9;
    st.state.ruins = D(5000);
    st.save();
    const before = store.get(KEY);
    for (const code of ["NDI=", "W10=", "bnVsbA==", "InRvdG8i", "e30=", "{}", "[1,2]"]) {
      expect(main.importSave(code), code).toBe(false);
      expect(main.getLastImportRefusal(), code).toBe("invalid");
    }
    expect(st.state.cycles).toBe(9);
    expect(String(st.state.ruins)).toBe("5000");
    expect(store.get(KEY)).toBe(before);
    expect(store.has(`${KEY}-before-import`)).toBe(false);
  }, 30000);

  it("un vrai import garde la partie remplacée (Options › Autres), même stockage plein pour la copie", async () => {
    const { st, store } = await boot({});
    const main = await import("../main.js");
    const { listSaveBackups } = await import("../saveBackups.js");
    st.state.cycles = 9;
    st.save();
    const other = JSON.stringify({ ...JSON.parse(JSON.stringify(st.hydrateState(MID_GAME_FIXTURE))), cycles: 4 });
    // La partie importée attend le rechargement qui la met en place (SAV-8).
    const pendingCycles = () => JSON.parse(store.get(`${KEY}:pending-load`)).save.cycles;
    expect(main.importSave(encodeSaveText(other))).toBe(true);
    expect(main.getLastImportRefusal()).toBe("");
    expect(pendingCycles()).toBe(4);
    expect(JSON.parse(store.get(`${KEY}-before-import`)).cycles).toBe(9);
    expect(listSaveBackups().some((b) => b.kind === "before-import")).toBe(true);
    // Les vieilles saves sans saveVersion (population + bâtiments) passent toujours.
    expect(main.importSave(JSON.stringify({ population: 50, buildings: {} }))).toBe(true);
    // Quota plein pour la copie : l'import passe quand même.
    const setItem = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = (k, v) => {
      if (k === `${KEY}-before-import`) throw new Error("QuotaExceededError");
      return setItem(k, v);
    };
    expect(main.importSave(encodeSaveText(other))).toBe(true);
    expect(pendingCycles()).toBe(4);
  }, 30000);
});
