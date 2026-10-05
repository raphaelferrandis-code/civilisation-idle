// CHARGER UNE AUTRE PARTIE = RECHARGER LA PAGE (audit 2026-10-05, SAV-8).
// importSave, loadSlot et loadBackup remplaçaient l'état SUR PLACE : la partie
// quittée continuait d'agir dans la nouvelle. Exploit mesuré : écrire un
// emplacement, miser au vingt-et-un, recharger l'emplacement (mise rendue), puis
// jouer la main — le gain tombait dans la partie chargée. Idem pour le vol d'Icare,
// les tours différés, le deuil du Grand Reset, la caméra, les faits divers.
// Désormais la partie choisie est posée sous PENDING_LOAD_KEY, la page recharge, et
// le démarrage (cloudSave.js, avant state.js) la met en place — dans le navigateur
// comme dans le .exe, où elle part aussi de force dans le nuage.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SAVE_KEY, PENDING_LOAD_KEY, WIPE_KEY } from "../saveKey.js";
import { hydrateState } from "../state.js";
import { BEFORE_IMPORT_KEY } from "../saveBackups.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const DIR = "G:\\Mon Drive\\Civilisation Idle";
const C = (rank) => ({ rank, suit: "olive" });

// Une save sérialisée comme la laisse save() (format courant).
const saveText = (patch = {}) => JSON.stringify({
  ...JSON.parse(JSON.stringify(hydrateState({ ...MID_GAME_FIXTURE, saveVersion: 7 }))),
  ...patch,
});
const lifeOf = (text) => JSON.parse(text).chronicleStats.lifetimePlaySec;

// Lance le jeu comme au démarrage : graphe de modules NEUF (ce que fait un
// rechargement), stockage persistant d'une page à l'autre, préload du .exe
// facultatif. `full` : refuser l'écriture de certaines clés (stockage plein).
async function boot(store, { cloud = null, full = () => false, withMain = false } = {}) {
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (full(k)) throw new Error("QuotaExceededError"); store.set(k, String(v)); },
    removeItem: (k) => store.delete(k),
  };
  const listeners = {};
  const reload = vi.fn();
  globalThis.location = { reload };
  // `initial` est le cliché du fichier nuage pris par le préload AU CHARGEMENT de
  // la page : on le fige ici, au démarrage.
  const civCloud = cloud && { ...cloud.api, initial: cloud.drive.file };
  globalThis.window = { addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); }, civCloud };
  vi.resetModules();
  const st = await import("../state.js");
  const slots = await import("../saveSlots.js");
  const cs = await import("../cloudSave.js");
  const main = withMain ? await import("../main.js") : null;
  // La sortie de page : le handler de main.js (save + miroir), puis ceux du module nuage.
  const leave = () => {
    if (main) main.saveOnExit();
    for (const t of ["beforeunload", "pagehide"]) (listeners[t] || []).forEach((fn) => fn());
  };
  return { st, slots, cs, main, reload, leave };
}

// Le fichier Drive simulé : read() rend ce qui a été écrit en dernier.
function fakeDrive(initialText) {
  const writes = [];
  const drive = { file: initialText == null ? { status: "none", text: null } : { status: "ok", text: initialText } };
  const api = {
    dir: DIR,
    read: () => drive.file,
    write: (text) => { writes.push(text); drive.file = { status: "ok", text }; return true; },
    clear: () => { drive.file = { status: "none", text: null }; return true; },
  };
  return { drive, api, writes };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.location;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("SAV-8 — l'emplacement se charge par un rechargement (navigateur)", () => {
  it("mise au vingt-et-un, emplacement rechargé : la mise est rendue ET la main disparaît", async () => {
    const store = new Map([[SAVE_KEY, saveText({ faveur: 1_000_000, cityName: "Ici" })]]);
    let g = await boot(store);
    const bj = await import("../actions/blackjack.js");
    expect(g.slots.writeSlot(0).ok).toBe(true);
    expect(bj.dealBlackjack(4, { deck: [C("10"), C("9"), C("7"), C("8"), C("10")] })).toBeTruthy();
    const stake = 1_000_000 - g.st.state.faveur;
    expect(stake).toBeGreaterThan(0);
    expect(g.slots.loadSlot(0)).toBe(true);
    expect(g.reload).toHaveBeenCalledTimes(1);
    expect(store.has(PENDING_LOAD_KEY)).toBe(true);
    // La page qui part sauve encore l'ancienne partie (beforeunload)…
    g.st.save();
    g.leave();
    // … et le démarrage suivant met l'emplacement en place, état de module neuf.
    g = await boot(store);
    const bj2 = await import("../actions/blackjack.js");
    expect(g.st.state.faveur).toBe(1_000_000);
    expect(g.st.state.cityName).toBe("Ici");
    expect(bj2.blackjackActive()).toBe(false);
    bj2.standBlackjack(); // l'ancienne main ne paie plus rien
    expect(g.st.state.faveur).toBe(1_000_000);
    expect(store.has(PENDING_LOAD_KEY)).toBe(false);
    expect(JSON.parse(store.get(SAVE_KEY)).faveur).toBe(1_000_000);
    expect(g.st.state.saveEpoch?.id).toBeTruthy(); // l'emplacement REMPLACE la partie (SAV-4)
  }, 60000);

  it("aucune absence créditée : l'emplacement écrit il y a 2 h repart à l'heure du chargement", async () => {
    const store = new Map([[SAVE_KEY, saveText()]]);
    let g = await boot(store);
    g.st.state.lastTick = FIXED_NOW - 2 * 3600 * 1000;
    g.slots.writeSlot(1);
    vi.setSystemTime(FIXED_NOW + 5000);
    expect(g.slots.loadSlot(1)).toBe(true);
    vi.setSystemTime(FIXED_NOW + 7000); // le rechargement prend deux secondes
    g = await boot(store, { withMain: true });
    expect(g.st.state.lastTick).toBe(FIXED_NOW + 5000);
    const food = g.st.state.food.toString();
    g.main.applyOfflineProgressSafely();
    expect(g.st.state.food.toString()).toBe(food);
  }, 60000);

  it("import : la partie importée arrive au démarrage, avec sa ligne de Journal ; l'ancienne est gardée de côté", async () => {
    const store = new Map([[SAVE_KEY, saveText({ cityName: "Ici", cycles: 4 })]]);
    let g = await boot(store, { withMain: true });
    expect(g.main.importSave(saveText({ cityName: "Ailleurs", cycles: 99 }))).toBe(true);
    expect(g.reload).toHaveBeenCalledTimes(1);
    expect(g.st.state.cityName).toBe("Ici"); // rien ne change sur place
    expect(JSON.parse(store.get(BEFORE_IMPORT_KEY)).cityName).toBe("Ici");
    g.leave();
    g = await boot(store);
    expect(g.st.state.cityName).toBe("Ailleurs");
    expect(g.st.state.cycles).toBe(99);
    expect(g.st.state.history.at(-1)).toMatch(/importee reprend son cycle/);
  }, 60000);

  it("stockage plein : refus dit, pas de rechargement, la partie en cours ne bouge pas", async () => {
    const store = new Map([[SAVE_KEY, saveText({ cityName: "Ici" })]]);
    const g = await boot(store, { withMain: true, full: (k) => k === PENDING_LOAD_KEY });
    g.slots.writeSlot(0);
    expect(g.slots.loadSlot(0)).toBe(false);
    expect(g.slots.getLastSlotRefusal()).toBe("storage");
    expect(g.main.importSave(saveText({ cityName: "Ailleurs" }))).toBe(false);
    expect(g.main.getLastImportRefusal()).toBe("storage");
    expect(g.reload).not.toHaveBeenCalled();
    expect(g.st.state.cityName).toBe("Ici");
    expect(store.has(PENDING_LOAD_KEY)).toBe(false);
  }, 60000);
});

describe("SAV-8 — le démarrage valide la clé en attente", () => {
  const pending = (save, at = FIXED_NOW) => JSON.stringify({ at, save });

  it("périmée (plus d'une minute) : ignorée et consommée, la partie en place est gardée", async () => {
    const store = new Map([
      [SAVE_KEY, saveText({ cityName: "Ici" })],
      [PENDING_LOAD_KEY, pending(JSON.parse(saveText({ cityName: "Ailleurs" })), FIXED_NOW - 61_000)],
    ]);
    const g = await boot(store);
    expect(g.st.state.cityName).toBe("Ici");
    expect(store.has(PENDING_LOAD_KEY)).toBe(false);
  }, 60000);

  it("invalide (pas une save, version plus récente, JSON cassé) : ignorée et consommée", async () => {
    for (const bad of [pending(42), pending({ saveVersion: 99, cityName: "Futur" }), "{tronqué"]) {
      const store = new Map([[SAVE_KEY, saveText({ cityName: "Ici" })], [PENDING_LOAD_KEY, bad]]);
      const g = await boot(store);
      expect(g.st.state.cityName).toBe("Ici");
      expect(store.has(PENDING_LOAD_KEY)).toBe(false);
    }
  }, 60000);

  it("effacement ET chargement en attente : l'effacement (confirmé deux fois) l'emporte", async () => {
    const store = new Map([
      [SAVE_KEY, saveText({ cityName: "Ici", cycles: 4 })],
      [WIPE_KEY, String(FIXED_NOW)],
      [PENDING_LOAD_KEY, pending(JSON.parse(saveText({ cityName: "Ailleurs", cycles: 99 })))],
    ]);
    const g = await boot(store);
    expect(g.st.state.cycles).toBe(0);
    expect(store.has(PENDING_LOAD_KEY)).toBe(false);
    expect(store.has(WIPE_KEY)).toBe(false);
  }, 60000);
});

describe("SAV-8 — dans le .exe : le nuage reçoit la partie choisie, pas l'ancienne", () => {
  it("import moins avancé : la page qui part n'écrit rien, le démarrage l'impose au nuage sans arbitrage", async () => {
    const old = saveText({ cityName: "Ici", chronicleStats: { lifetimePlaySec: 360000 } });
    const cloud = fakeDrive(old);
    const store = new Map([[SAVE_KEY, old]]);
    let g = await boot(store, { cloud, withMain: true });
    expect(g.cs.cloudSaveStatus()).toBe("ok");
    expect(g.main.importSave(saveText({ cityName: "Ailleurs", chronicleStats: { lifetimePlaySec: 600 } }))).toBe(true);
    // Autosave et fermeture de la page sortante : l'ancienne partie ne part plus.
    g.st.state.chronicleStats.lifetimePlaySec = 360031;
    g.st.save();
    g.leave();
    expect(cloud.writes).toEqual([]);
    // Démarrage : le nuage (100 h) ne l'emporte pas sur le choix du joueur.
    g = await boot(store, { cloud });
    expect(g.st.state.cityName).toBe("Ailleurs");
    expect(cloud.writes.length).toBe(1);
    expect(lifeOf(cloud.writes[0])).toBe(600);
    expect(JSON.parse(cloud.writes[0]).cityName).toBe("Ailleurs");
    expect(g.cs.cloudSaveStatus()).toBe("ok");
    expect(store.has(SAVE_KEY + ":pre-cloud")).toBe(false); // pas d'arbitrage, rien d'évincé
    // La partie chargée continue : ses miroirs passent.
    g.st.state.chronicleStats.lifetimePlaySec = 640;
    g.st.save();
    g.cs.cloudMirrorSave({ flush: true });
    expect(lifeOf(cloud.writes.at(-1))).toBe(640);
  }, 60000);

  it("nuage illisible au redémarrage : la partie choisie se joue, le nuage n'est pas touché", async () => {
    const cloud = fakeDrive(saveText({ cityName: "Ici" }));
    const store = new Map([[SAVE_KEY, saveText({ cityName: "Ici" })]]);
    let g = await boot(store, { cloud });
    g.slots.writeSlot(0);
    store.set(SAVE_KEY + "-slot0", saveText({ cityName: "Emplacement" }));
    expect(g.slots.loadSlot(0)).toBe(true);
    cloud.drive.file = { status: "error", text: null };
    g = await boot(store, { cloud });
    expect(g.st.state.cityName).toBe("Emplacement");
    expect(g.cs.cloudSaveStatus()).toBe("unreadable");
    expect(cloud.writes).toEqual([]);
  }, 60000);
});
