// LA SAVE EN FICHIER DU .EXE (audit 2026-10-05, STEAM-4) — fileSave.js tel qu'il
// démarre : la partie ne vivait que dans le localStorage de Chromium (un LevelDB
// que Steam Cloud ne sait pas synchroniser). Elle est désormais aussi écrite dans
// userData/saves/save.json (window.civSave, par le process principal), relue AU
// LANCEMENT avant le localStorage, avec les règles du nuage Drive : la plus
// avancée gagne, jamais d'écrasement d'une partie plus avancée, effacement et
// chargement explicites respectés.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SAVE_KEY, WIPE_KEY, PENDING_LOAD_KEY } from '../saveKey.js';
import { PRE_CLOUD_KEY } from '../saveBackups.js';

const mk = (life, extra = {}) => JSON.stringify({ chronicleStats: { lifetimePlaySec: life }, lastTick: life, saveVersion: 7, ...extra });
const lifeOf = (text) => JSON.parse(text).chronicleStats.lifetimePlaySec;

// Le fichier simulé : read() rend ce qui a été écrit en dernier (ou `file` imposé).
function fakeDisk(file = { status: 'none', text: null }) {
  const disk = { file, writes: [], syncWrites: [], clears: 0 };
  disk.api = {
    read: () => disk.file,
    write: (text) => { disk.writes.push(text); disk.file = { status: 'ok', text }; },
    writeSync: (text) => { disk.syncWrites.push(text); disk.file = { status: 'ok', text }; return true; },
    clear: () => { disk.clears += 1; disk.file = { status: 'none', text: null }; return true; },
  };
  return disk;
}

// Démarre fileSave.js comme dans le .exe : préload (window.civSave), stockage,
// écouteurs de fermeture capturés. `full(k)` : le stockage refuse cette clé.
async function bootFile({ disk, local, extra = {}, full = () => false, withState = false }) {
  const store = new Map(Object.entries(extra));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (full(k)) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    removeItem: (k) => store.delete(k),
  };
  if (local != null) store.set(SAVE_KEY, local);
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }, civSave: disk ? disk.api : undefined };
  vi.resetModules();
  const st = withState ? await import('../state.js') : null;
  const fsv = await import('../fileSave.js');
  const keys = await import('../saveKey.js');
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn());
  return { fsv, keys, st, store, fire };
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('STEAM-4 — arbitrage au lancement', () => {
  it('fichier plus avancé (Steam Cloud, autre poste) : il remplace la save locale AVANT load(), la locale part en copie de secours', async () => {
    const disk = fakeDisk({ status: 'ok', text: '﻿' + mk(90000) });
    const { fsv, store } = await bootFile({ disk, local: mk(300) });
    expect(fsv.fileSaveStatus()).toBe('ok');
    expect(store.get(SAVE_KEY)).toBe(mk(90000)); // BOM retiré
    expect(store.get(PRE_CLOUD_KEY)).toBe(mk(300));
    expect(disk.writes).toEqual([]);
  });

  it('locale plus avancée : gardée, et la save suivante réécrit le fichier', async () => {
    const disk = fakeDisk({ status: 'ok', text: mk(100) });
    const { fsv, store } = await bootFile({ disk, local: mk(500) });
    expect(store.get(SAVE_KEY)).toBe(mk(500));
    fsv.fileMirrorSave(mk(510));
    expect(disk.writes).toEqual([mk(510)]);
    // Même texte : rien ne repart.
    fsv.fileMirrorSave(mk(510));
    expect(disk.writes).toHaveLength(1);
  });

  it('premier lancement de cette version (pas de fichier) : la première save le crée', async () => {
    const disk = fakeDisk();
    const { fsv } = await bootFile({ disk, local: mk(42) });
    fsv.fileMirrorSave(mk(43));
    expect(disk.writes).toEqual([mk(43)]);
  });

  it('save() du jeu écrit le fichier avec ce qu\'elle vient de sérialiser', async () => {
    const disk = fakeDisk();
    const { st, store } = await bootFile({ disk, withState: true });
    st.save();
    expect(disk.writes).toHaveLength(1);
    expect(disk.writes[0]).toBe(store.get(SAVE_KEY));
  });
});

describe('STEAM-4 — fail-closed : on n’écrase pas ce qu’on ne connaît pas', () => {
  it('fichier illisible (droits, verrou) : ni adopté ni écrasé ; relu au bout de 5 min seulement', async () => {
    const disk = fakeDisk({ status: 'error', text: null });
    const { fsv, store } = await bootFile({ disk, local: mk(300) });
    expect(fsv.fileSaveStatus()).toBe('unreadable');
    expect(store.get(SAVE_KEY)).toBe(mk(300));
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    fsv.fileMirrorSave(mk(310));
    expect(disk.writes).toEqual([]);
    // Le verrou est levé, et le fichier portait une partie PLUS avancée.
    disk.file = { status: 'ok', text: mk(5000) };
    now += 60_000;
    fsv.fileMirrorSave(mk(320));
    expect(fsv.fileSaveStatus()).toBe('unreadable'); // pas encore relu
    now += 5 * 60_000;
    fsv.fileMirrorSave(mk(330));
    expect(fsv.fileSaveStatus()).toBe('ok');
    expect(fsv.fileSaveBehind()).toBe(true); // garde : la partie plus avancée reste
    expect(disk.writes).toEqual([]);
  });

  it('fichier d’une version PLUS RÉCENTE (bêta Steam) : ni adopté ni écrasé', async () => {
    const disk = fakeDisk({ status: 'ok', text: mk(90000, { saveVersion: 99 }) });
    const { fsv, store } = await bootFile({ disk, local: mk(300) });
    expect(fsv.fileSaveStatus()).toBe('newer');
    expect(store.get(SAVE_KEY)).toBe(mk(300));
    fsv.fileMirrorSave(mk(310));
    expect(disk.writes).toEqual([]);
  });

  it('fichier abîmé (ni lui ni sa copie ne se relisent) : archivé en copie de secours, puis remplacé', async () => {
    const disk = fakeDisk({ status: 'ok', text: '{"chronicleStats": {"lifetimePlay' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fsv, store } = await bootFile({ disk, local: mk(300) });
    expect(fsv.fileSaveStatus()).toBe('ok');
    expect([...store.values()]).toContain('{"chronicleStats": {"lifetimePlay');
    fsv.fileMirrorSave(mk(310));
    expect(disk.writes).toEqual([mk(310)]);
  });

  it('stockage plein au lancement (le fichier plus avancé n’a pas pu être recopié) : la partie jouée ne l’écrase pas', async () => {
    const disk = fakeDisk({ status: 'ok', text: mk(90000) });
    const { fsv, store } = await bootFile({ disk, local: mk(300), full: (k) => k === SAVE_KEY || k === PRE_CLOUD_KEY });
    expect(store.get(SAVE_KEY)).toBe(mk(300));
    fsv.fileMirrorSave(mk(310));
    expect(disk.writes).toEqual([]);
    expect(fsv.fileSaveBehind()).toBe(true);
  });

  it('save locale illisible au lancement (partie neuve de repli) : rien ne part, même à la fermeture', async () => {
    const disk = fakeDisk({ status: 'ok', text: mk(100) });
    const { fsv, keys, fire } = await bootFile({ disk, local: mk(100) });
    keys.markLocalSaveUnreadable();
    fsv.fileMirrorSave(mk(1));
    fire('pagehide');
    expect(disk.writes).toEqual([]);
    expect(disk.syncWrites).toEqual([]);
  });

  it('navigateur (pas de pont civSave) : neutre', async () => {
    const { fsv, store } = await bootFile({ disk: null, local: mk(300) });
    expect(fsv.fileSaveStatus()).toBe('off');
    fsv.fileMirrorSave(mk(310));
    expect(store.get(SAVE_KEY)).toBe(mk(300));
  });
});

describe('STEAM-4 — gestes explicites et fermeture', () => {
  it('« Recommencer depuis le tout premier feu » : le fichier est effacé et jamais adopté', async () => {
    const disk = fakeDisk({ status: 'ok', text: mk(90000) });
    const { fsv, store } = await bootFile({ disk, local: mk(90000), extra: { [WIPE_KEY]: String(Date.now()) } });
    expect(disk.clears).toBe(1);
    expect(store.has(SAVE_KEY)).toBe(false);
    fsv.fileMirrorSave(mk(3));
    expect(disk.writes).toEqual([mk(3)]);
  });

  it('partie choisie (import, emplacement) : écrite de force dans le fichier, même moins avancée', async () => {
    const disk = fakeDisk({ status: 'ok', text: mk(90000) });
    const chosen = JSON.parse(mk(10, { saveEpoch: { id: 'choisie', at: Date.now() } }));
    const { store } = await bootFile({
      disk,
      local: mk(90000),
      extra: { [PENDING_LOAD_KEY]: JSON.stringify({ at: Date.now(), save: chosen }) },
    });
    expect(store.get(SAVE_KEY)).toBe(JSON.stringify(chosen));
    expect(disk.writes).toEqual([JSON.stringify(chosen)]);
    expect(lifeOf(disk.file.text)).toBe(10);
  });

  it('fermeture (pagehide) : la dernière save repart en SYNCHRONE', async () => {
    const disk = fakeDisk();
    const { fsv, fire } = await bootFile({ disk, local: mk(42) });
    fsv.fileMirrorSave(mk(50));
    fire('pagehide');
    expect(disk.syncWrites).toEqual([mk(50)]);
  });
});
