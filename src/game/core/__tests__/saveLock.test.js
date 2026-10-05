// UNE SEULE PARTIE PAR NAVIGATEUR (audit 2026-10-05, SAV-9). Deux onglets (ou
// la PWA et un onglet) sauvegardaient la même clé toutes les 10 s : le dernier à
// écrire effaçait la progression de l'autre. Chaque « onglet » est ici une
// instance neuve du module (vi.resetModules), qui partage avec les autres le
// même faux LockManager et le même faux BroadcastChannel — comme deux onglets
// d'une même origine.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const KEY = "civilization-collapse-idle-v1";

// LockManager minimal : un seul verrou, file d'attente, ifAvailable, signal, steal.
function fakeLocks() {
  let holder = null;
  const queue = [];
  const next = () => { if (!holder && queue.length) grant(queue.shift()); };
  function grant(entry) {
    holder = entry;
    let held;
    try { held = Promise.resolve(entry.cb({ name: "civ-save" })); } catch (e) { held = Promise.reject(e); }
    held.then(
      (v) => { if (holder === entry) { holder = null; entry.resolve(v); next(); } },
      (e) => { if (holder === entry) { holder = null; entry.reject(e); next(); } }
    );
  }
  return {
    get held() { return holder !== null; },
    request(name, opts, cb) {
      if (typeof opts === "function") { cb = opts; opts = {}; }
      return new Promise((resolve, reject) => {
        const entry = { cb, resolve, reject };
        if (opts.steal) {
          if (holder) {
            const old = holder;
            holder = null;
            old.reject(Object.assign(new Error("stolen"), { name: "AbortError" }));
          }
          grant(entry);
          return;
        }
        if (!holder) { grant(entry); return; }
        if (opts.ifAvailable) { Promise.resolve(cb(null)).then(resolve, reject); return; }
        queue.push(entry);
        opts.signal?.addEventListener("abort", () => {
          const i = queue.indexOf(entry);
          if (i >= 0) { queue.splice(i, 1); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }
        });
      });
    },
  };
}

// BroadcastChannel minimal : livre aux AUTRES instances du même nom.
function fakeChannels() {
  const open = new Set();
  return class FakeChannel {
    constructor(name) { this.name = name; this.onmessage = null; open.add(this); }
    postMessage(data) {
      for (const c of open) if (c !== this && c.name === this.name) setTimeout(() => c.onmessage?.({ data }), 0);
    }
    close() { open.delete(this); }
  };
}

function fakeSession() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Un « onglet » = une instance neuve de saveLock.js.
async function openTab() {
  vi.resetModules();
  return import("../saveLock.js");
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Node a un VRAI BroadcastChannel global : sans ce masque, les onglets simulés
// se parleraient d'un test à l'autre. Les tests qui en veulent un passent le faux.
beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", undefined);
});

afterEach(() => {
  delete globalThis.localStorage;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("SAV-9 — verrou de la partie entre onglets", () => {
  it("sans Web Locks : l'onglet joue, comme avant", async () => {
    const tab = await openTab();
    await expect(tab.claimSaveLock({ locks: undefined, storage: fakeSession() })).resolves.toBe(true);
    expect(tab.isSaveSuspendedForOtherTab()).toBe(false);
  });

  it("le .exe (app://) ne prend aucun verrou : une page figée rechargée ne doit pas s'y heurter", async () => {
    const locks = fakeLocks();
    locks.request("civ-save", () => new Promise(() => {})); // page figée qui le tient encore
    const spy = vi.spyOn(locks, "request");
    const tab = await openTab();
    await expect(tab.claimSaveLock({ locks, storage: fakeSession(), protocol: "app:", waitMs: 20 })).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(tab.isSaveSuspendedForOtherTab()).toBe(false);
  });

  it("le deuxième onglet ne joue pas et n'écrit plus rien", async () => {
    const locks = fakeLocks();
    const A = await openTab();
    const B = await openTab();
    const readSave = () => "save";
    await expect(A.claimSaveLock({ locks, storage: fakeSession(), readSave })).resolves.toBe(true);
    await expect(B.claimSaveLock({ locks, storage: fakeSession(), readSave, waitMs: 20 })).resolves.toBe(false);
    expect(A.isSaveSuspendedForOtherTab()).toBe(false);
    expect(B.isSaveSuspendedForOtherTab()).toBe(true);
  });

  it("F5 : le verrou de l'ancienne page, relâché un instant plus tard, revient à la nouvelle", async () => {
    const locks = fakeLocks();
    let release;
    locks.request("civ-save", () => new Promise((r) => { release = r; })); // l'ancienne page
    const tab = await openTab();
    const claim = tab.claimSaveLock({ locks, storage: fakeSession(), readSave: () => "save", waitMs: 500 });
    setTimeout(() => release(), 30); // déchargement de l'ancienne page
    await expect(claim).resolves.toBe(true);
    expect(tab.isSaveSuspendedForOtherTab()).toBe(false);
  });

  it("onglet fermé pendant l'attente après une dernière save : on recharge au lieu de jouer une copie périmée", async () => {
    const locks = fakeLocks();
    let release;
    locks.request("civ-save", () => new Promise((r) => { release = r; }));
    let disk = "save-1";
    const reload = vi.fn();
    const tab = await openTab();
    tab.claimSaveLock({ locks, storage: fakeSession(), readSave: () => disk, reload, waitMs: 500 });
    setTimeout(() => { disk = "save-2"; release(); }, 30); // l'autre onglet sauve en partant
    await wait(80);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tab.isSaveSuspendedForOtherTab()).toBe(true);
  });

  it("« Jouer ici » : l'onglet qui joue sauve, cède et recharge en spectateur ; l'autre recharge et joue", async () => {
    const locks = fakeLocks();
    const Channel = fakeChannels();
    const A = await openTab();
    const B = await openTab();
    const sessionA = fakeSession();
    const order = [];
    const beforeYield = vi.fn(() => order.push("save A"));
    const reloadA = vi.fn(() => order.push("reload A"));
    const reloadB = vi.fn(() => order.push("reload B"));
    const readSave = () => "save";
    await A.claimSaveLock({ locks, storage: sessionA, BroadcastChannelImpl: Channel, beforeYield, reload: reloadA, readSave });
    await B.claimSaveLock({ locks, storage: fakeSession(), BroadcastChannelImpl: Channel, readSave, waitMs: 20 });

    B.takeOverSave({ locks, BroadcastChannelImpl: Channel, reload: reloadB, stealAfterMs: 1000 });
    await wait(20);
    expect(order).toEqual(["save A", "reload A", "reload B"]); // la save d'A précède la relecture de B
    expect(A.isSaveSuspendedForOtherTab()).toBe(true);           // le beforeunload d'A n'écrase plus rien

    // Au rechargement, A redémarre spectateur SANS redemander le verrou.
    const A2 = await openTab();
    const spy = vi.spyOn(locks, "request");
    await expect(A2.claimSaveLock({ locks, storage: sessionA, readSave })).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(A2.isSaveSuspendedForOtherTab()).toBe(true);
  });

  it("céder = quitter : les gardes de sortie (gain en vol d'un jeu du Temple) passent AVANT la coupure des saves", async () => {
    const locks = fakeLocks();
    const Channel = fakeChannels();
    const A = await openTab();
    const B = await openTab();
    // Onglet A caché, course en cours : mise déjà prélevée (100 → 90), gain de 30
    // en attente de la fin d'animation (rAF gelé) — son flushOnExit le crédite.
    const page = new EventTarget();
    const partie = { faveur: 90 };
    const disque = [];
    const saveA = () => { if (!A.isSaveSuspendedForOtherTab()) disque.push(partie.faveur); }; // comme save()
    let enVol = () => { partie.faveur += 30; };
    page.addEventListener("beforeunload", () => { if (enVol) { enVol(); enVol = null; saveA(); } });
    await A.claimSaveLock({
      locks, storage: fakeSession(), BroadcastChannelImpl: Channel, readSave: () => "s",
      beforeYield: () => A.leaveGame(saveA, page),
      reload: () => page.dispatchEvent(new Event("beforeunload")), // le vrai rechargement
    });
    await B.claimSaveLock({ locks, storage: fakeSession(), BroadcastChannelImpl: Channel, readSave: () => "s", waitMs: 20 });
    B.takeOverSave({ locks, BroadcastChannelImpl: Channel, reload: () => {}, stealAfterMs: 1000 });
    await wait(20);
    expect(A.isSaveSuspendedForOtherTab()).toBe(true);
    expect(disque.at(-1)).toBe(120); // B relira la partie AVEC le gain
  });

  it("onglet muet (sans canal ; null : Node a un vrai BroadcastChannel) : « Jouer ici » prend le verrou de force et l'ancien onglet cède", async () => {
    const locks = fakeLocks();
    const A = await openTab();
    const B = await openTab();
    const beforeYield = vi.fn();
    const reloadA = vi.fn();
    const reloadB = vi.fn();
    await A.claimSaveLock({ locks, storage: fakeSession(), BroadcastChannelImpl: null, beforeYield, reload: reloadA, readSave: () => "s" });
    B.takeOverSave({ locks, BroadcastChannelImpl: null, reload: reloadB, stealAfterMs: 10 });
    await wait(30);
    expect(reloadB).toHaveBeenCalledTimes(1);
    expect(reloadA).toHaveBeenCalledTimes(1);
    expect(beforeYield).not.toHaveBeenCalled(); // pris de force : plus le droit d'écrire
    expect(A.isSaveSuspendedForOtherTab()).toBe(true);
  });

  it("save() n'écrit rien quand la partie est à un autre onglet", async () => {
    const store = new Map([[KEY, JSON.stringify({ saveVersion: 1 })]]);
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
    };
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const st = await import("../state.js");
    const lock = await import("../saveLock.js");
    const before = store.get(KEY);
    const session = fakeSession();
    session.setItem("civ-save-yielded", "1"); // onglet qui vient de céder
    await lock.claimSaveLock({ storage: session });
    st.save();
    expect(store.get(KEY)).toBe(before);
    expect(st.getLastSaveError()).toMatch(/autre onglet/);
  });
});

describe("SAV-9 — stockage persistant", () => {
  function target() {
    const handlers = {};
    return {
      handlers,
      addEventListener: (t, f) => { handlers[t] = f; },
      removeEventListener: (t) => { delete handlers[t]; },
    };
  }

  it("demandé au premier geste, une seule fois, s'il ne l'est pas déjà", async () => {
    const tab = await openTab();
    const storageManager = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    const t = target();
    tab.askPersistentStorage({ storageManager, protocol: "https:", target: t });
    expect(storageManager.persist).not.toHaveBeenCalled();
    t.handlers.pointerdown();
    await flush();
    expect(storageManager.persist).toHaveBeenCalledTimes(1);
    expect(t.handlers.pointerdown).toBeUndefined();
  });

  it("jamais dans le .exe (app://)", async () => {
    const tab = await openTab();
    const t = target();
    tab.askPersistentStorage({ storageManager: { persist: vi.fn() }, protocol: "app:", target: t });
    expect(Object.keys(t.handlers)).toHaveLength(0);
  });
});
