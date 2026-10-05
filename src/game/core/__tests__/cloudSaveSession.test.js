// LE MIROIR NUAGE EN SESSION (audit 2026-10-05) — le module cloudSave.js tel qu'il
// démarre dans le .exe : arbitrage à l'import, miroirs, écriture de fermeture.
//   SAV-2 : la fermeture était FORCÉE et passait outre la garde d'écriture — un
//           nuage redevenu lisible en cours de session était écrasé par la partie
//           de quelques minutes jouée en attendant ;
//   SAV-1 : une save nuage avec BOM gagnait l'arbitrage, était recopiée TELLE
//           QUELLE dans localStorage, et load() repartait sur une partie neuve —
//           que la fermeture renvoyait ensuite dans le nuage.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SAVE_KEY } from '../saveKey.js';

const DIR = 'G:\\Mon Drive\\Civilisation Idle';
const mk = (life, extra = {}) => JSON.stringify({ chronicleStats: { lifetimePlaySec: life }, lastTick: life, saveVersion: 7, ...extra });
const lifeOf = (text) => JSON.parse(text).chronicleStats.lifetimePlaySec;

// Démarre cloudSave.js comme dans le .exe : préload (window.civCloud), stockage,
// écouteurs de fermeture capturés pour pouvoir les déclencher. Le « fichier » du
// nuage est simulé : read() rend ce qui a été écrit en dernier (ou `read` imposé),
// et `drive.file` permet à un AUTRE poste d'écrire par-dessus.
async function bootCloud({ initial, read, local, extra = {}, clear }) {
  const store = new Map(Object.entries(extra));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  if (local != null) store.set(SAVE_KEY, local);
  const listeners = {};
  const writes = [];
  const drive = { file: initial, reads: 0 };
  globalThis.window = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    civCloud: {
      dir: DIR,
      initial,
      read: () => { drive.reads += 1; return read ? read() : drive.file; },
      write: (text) => { writes.push(text); drive.file = { status: 'ok', text }; return true; },
      clear: clear || (() => { drive.file = { status: 'none', text: null }; return true; }),
    },
  };
  vi.resetModules();
  const cs = await import('../cloudSave.js');
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn());
  return { cs, store, writes, fire, drive };
}

// Le RECHARGEMENT qui suit un import ou un emplacement (SAV-8) : la page qui part
// se ferme, puis un graphe de modules neuf démarre sur le même stockage, avec un
// préload relancé (cliché du fichier nuage tel qu'il est à ce moment-là).
function reboot(prev) {
  prev.fire('beforeunload');
  prev.fire('pagehide');
  return bootCloud({ initial: prev.drive.file, extra: Object.fromEntries(prev.store) });
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('SAV-2 — la fermeture garde la garde d’écriture', () => {
  it('nuage illisible au lancement, relu plus avancé en cours de session : la fermeture n’écrit RIEN', async () => {
    // Nouveau PC : Drive pas encore synchronisé au lancement, partie neuve en local.
    let cloudNow = { status: 'error', text: null };
    const { cs, store, writes, fire } = await bootCloud({
      initial: cloudNow,
      read: () => cloudNow,
      local: mk(300),
    });
    expect(cs.cloudSaveStatus()).toBe('unreadable');
    // Drive se synchronise pendant la session : le nuage porte 100 h.
    cloudNow = { status: 'ok', text: mk(360000) };
    store.set(SAVE_KEY, mk(420));
    cs.cloudMirrorSave(); // miroir ordinaire : relit, adopte la référence, refuse
    expect(cs.cloudSaveStatus()).toBe('ok');
    expect(writes).toEqual([]);
    // Fermeture : le handler de main.js (save + miroir), puis le flush du module.
    // C'est lui qui était FORCÉ : il remplaçait les 100 h par la partie neuve.
    const main = await import('../main.js');
    main.saveOnExit();
    fire('beforeunload');
    fire('pagehide');
    expect(writes).toEqual([]);
  }, 60000);

  it('flush saute le délai de 30 s mais écrit une partie au moins aussi avancée', async () => {
    const { cs, store, writes } = await bootCloud({ initial: { status: 'ok', text: mk(1000) }, local: mk(1000) });
    store.set(SAVE_KEY, mk(1010));
    cs.cloudMirrorSave();                 // 1re écriture (délai écoulé depuis 0)
    store.set(SAVE_KEY, mk(1020));
    cs.cloudMirrorSave();                 // < 30 s : retenue
    expect(writes.map(lifeOf)).toEqual([1010]);
    cs.cloudMirrorSave({ flush: true });  // fermeture : passe le délai
    expect(writes.map(lifeOf)).toEqual([1010, 1020]);
  });

  it('force (import, emplacement) fait toujours autorité sur une partie moins avancée', async () => {
    const { cs, store, writes } = await bootCloud({ initial: { status: 'ok', text: mk(360000) }, local: mk(360000) });
    store.set(SAVE_KEY, mk(216000));
    cs.cloudMirrorSave({ flush: true });
    expect(writes).toEqual([]);
    cs.cloudMirrorSave({ force: true });
    expect(writes.map(lifeOf)).toEqual([216000]);
  });
});

describe('SAV-1 — nuage avec BOM', () => {
  it('la save adoptée est recopiée SANS le BOM, et load() la relit (pas de partie neuve)', async () => {
    const cloud = { chronicleStats: { lifetimePlaySec: 144000 }, lastTick: 5, saveVersion: 7, cycles: 42, cityName: 'Ourouk' };
    const text = '\uFEFF' + JSON.stringify(cloud);
    const { cs, store } = await bootCloud({ initial: { status: 'ok', text }, local: mk(30) });
    expect(cs.cloudSaveStatus()).toBe('ok');
    const raw = store.get(SAVE_KEY);
    expect(raw.charCodeAt(0)).not.toBe(0xFEFF);
    expect(JSON.parse(raw).cycles).toBe(42);
    // La locale évincée reste archivée.
    expect(lifeOf(store.get(SAVE_KEY + ':pre-cloud'))).toBe(30);
    // Le vrai chargement (state.js) relit la partie du nuage.
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.join(' ')); });
    const st = await import('../state.js');
    expect(errors.filter((e) => e.includes('illisible'))).toEqual([]);
    expect(st.state.cycles).toBe(42);
    expect(st.state.cityName).toBe('Ourouk');
  }, 60000);

  it('load() retire aussi le BOM d’une save LOCALE', async () => {
    const store = new Map([[SAVE_KEY, '\uFEFF' + mk(500, { cycles: 7 })]]);
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    vi.resetModules();
    const st = await import('../state.js');
    expect(st.state.cycles).toBe(7);
  }, 60000);

  it('save locale illisible (hydrateState lève sur une save nuage valide) : plus AUCUNE écriture nuage, même forcée', async () => {
    // Régression simulée d'un normaliseur qui lève pour TOUTE save : load() ne peut
    // rien sauver, la partie en mémoire est une partie neuve de repli.
    vi.doMock('../faitsDiversState.js', async (orig) => {
      const real = await orig();
      return { ...real, normalizeFaitsDivers: () => { throw new ReferenceError('TDZ simulée'); } };
    });
    const { cs, store, writes, fire } = await bootCloud({
      initial: { status: 'ok', text: mk(144000, { cycles: 42 }) },
      local: mk(30),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const st = await import('../state.js');
    const keys = await import('../saveKey.js');
    expect(keys.isLocalSaveUnreadable()).toBe(true);
    expect(st.state.cycles).toBe(0); // partie neuve de repli
    // L'autosave ne touche pas la clé principale (la save du nuage y reste)…
    st.save();
    expect(lifeOf(store.get(SAVE_KEY))).toBe(144000);
    expect(st.getLastSaveError()).not.toBe('');
    // … et rien ne part vers le nuage, ni miroir, ni fermeture, ni force.
    cs.cloudMirrorSave();
    cs.cloudMirrorSave({ flush: true });
    cs.cloudMirrorSave({ force: true });
    fire('beforeunload');
    expect(writes).toEqual([]);
    // Une copie de secours est gardée.
    expect(lifeOf(store.get(SAVE_KEY + '-corrupt-backup'))).toBe(144000);
    vi.doUnmock('../faitsDiversState.js');
  }, 60000);
});

// SAV-4 : la garde comparait à une référence FIGÉE au lancement, sans jamais relire
// le fichier — deux postes ouverts s'écrasaient tour à tour ; et rien ne marquait
// un geste explicite (reset, import, emplacement) : un autre poste remettait
// l'ancienne partie, plus avancée, dans Drive à son lancement suivant.
describe('SAV-4 — relire avant d’écrire, époque de la partie', () => {
  const epoch = (id, at) => ({ saveEpoch: { id, at } });

  it('un autre poste a écrit pendant la session : statut « conflict », plus aucune écriture', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { cs, store, writes, fire, drive } = await bootCloud({ initial: { status: 'ok', text: mk(1000) }, local: mk(1000) });
    store.set(SAVE_KEY, mk(1010));
    cs.cloudMirrorSave();
    expect(writes.map(lifeOf)).toEqual([1010]);
    // Le portable, ouvert en même temps, écrit sa branche.
    drive.file = { status: 'ok', text: mk(1500, { lastTick: 777 }) };
    vi.setSystemTime(1_800_000_031_000);
    store.set(SAVE_KEY, mk(1041));
    cs.cloudMirrorSave();
    expect(cs.cloudSaveStatus()).toBe('conflict');
    cs.cloudMirrorSave({ flush: true });
    fire('beforeunload');
    expect(writes.map(lifeOf)).toEqual([1010]);              // la branche du portable survit
    expect(lifeOf(drive.file.text)).toBe(1500);
    vi.useRealTimers();
  });

  it('le fichier effacé par un autre poste (reset) est aussi un conflit', async () => {
    const { cs, store, writes, drive } = await bootCloud({ initial: { status: 'ok', text: mk(1000) }, local: mk(1000) });
    drive.file = { status: 'none', text: null };
    store.set(SAVE_KEY, mk(1010));
    cs.cloudMirrorSave({ flush: true });
    expect(cs.cloudSaveStatus()).toBe('conflict');
    expect(writes).toEqual([]);
  });

  it('une lecture ratée juste avant d’écrire n’écrit pas, et la fermeture retente', async () => {
    let fail = true;
    const { cs, store, writes, fire, drive } = await bootCloud({
      initial: { status: 'ok', text: mk(1000) },
      read: () => (fail ? { status: 'error', text: null } : drive.file),
      local: mk(1000),
    });
    store.set(SAVE_KEY, mk(1010));
    cs.cloudMirrorSave();
    expect(writes).toEqual([]);
    expect(cs.cloudSaveStatus()).toBe('ok');
    fail = false;
    fire('beforeunload');                                    // cloudDirty → flush
    expect(writes.map(lifeOf)).toEqual([1010]);
  });

  it('nuage plus récent en version relu avant d’écrire : « newer », rien n’est écrit', async () => {
    const { cs, store, writes, drive } = await bootCloud({ initial: { status: 'ok', text: mk(1000) }, local: mk(1000) });
    drive.file = { status: 'ok', text: mk(1200, { saveVersion: 99 }) };
    store.set(SAVE_KEY, mk(1300));
    cs.cloudMirrorSave({ flush: true });
    expect(cs.cloudSaveStatus()).toBe('newer');
    expect(writes).toEqual([]);
  });

  it('nuage illisible : relu au plus toutes les 5 min, pas à chaque autosave', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { cs, store, drive } = await bootCloud({
      initial: { status: 'error', text: null },
      read: () => ({ status: 'error', text: null }),
      local: mk(10),
    });
    store.set(SAVE_KEY, mk(20));
    cs.cloudMirrorSave();
    expect(drive.reads).toBe(1);
    for (let i = 1; i <= 20; i += 1) { vi.setSystemTime(1_800_000_000_000 + i * 10_000); cs.cloudMirrorSave(); }
    expect(drive.reads).toBe(1);                             // 200 s : pas de relecture
    vi.setSystemTime(1_800_000_000_000 + 5 * 60_000 + 1);
    cs.cloudMirrorSave();
    expect(drive.reads).toBe(2);
    vi.useRealTimers();
  });

  it('arbitrage : l’époque la plus récente gagne avant l’horloge à vie', async () => {
    const { cs } = await bootCloud({ initial: { status: 'none', text: null }, local: null });
    // Import (ou reset) sur le poste A : partie moins avancée, mais geste plus récent.
    expect(cs.pickMostAdvanced(mk(500, epoch('imp', 2000)), mk(360000))).toBe('cloud');
    expect(cs.pickMostAdvanced(mk(500, epoch('imp', 2000)), mk(360000, epoch('vieux', 1000)))).toBe('cloud');
    expect(cs.pickMostAdvanced(mk(360000, epoch('vieux', 1000)), mk(500, epoch('imp', 2000)))).toBe('local');
    // Même partie (même époque) : la plus avancée, comme avant.
    expect(cs.pickMostAdvanced(mk(500, epoch('e', 1)), mk(900, epoch('e', 1)))).toBe('local');
    // Garde d'écriture : époque plus récente = autorité ; plus ancienne = jamais.
    expect(cs.mayOverwriteCloud('ok', 360000, 500, false, 1)).toBe(true);
    expect(cs.mayOverwriteCloud('ok', 10, 900000, false, -1)).toBe(false);
    expect(cs.mayOverwriteCloud('conflict', -1, 900000, true, 1)).toBe(false);
  });

  it('un poste resté sur l’ancienne partie ADOPTE l’import fait ailleurs (au lieu de la ressusciter)', async () => {
    const imported = mk(500, { ...epoch('imp', 2000), cycles: 3 });
    const { store, cs } = await bootCloud({ initial: { status: 'ok', text: imported }, local: mk(360000, { cycles: 90 }) });
    expect(cs.cloudSaveStatus()).toBe('ok');
    expect(JSON.parse(store.get(SAVE_KEY)).cycles).toBe(3);
    expect(lifeOf(store.get(SAVE_KEY + ':pre-cloud'))).toBe(360000); // l'ancienne reste archivée
  });

  it('import / emplacement : époque fraîche, puis les miroirs ordinaires reprennent', async () => {
    const first = await bootCloud({ initial: { status: 'ok', text: mk(360000) }, local: mk(360000) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const main = await import('../main.js');
    const save = { ...JSON.parse(JSON.stringify((await import('../state.js')).hydrateState({}))), chronicleStats: { lifetimePlaySec: 216000 } };
    expect(main.importSave(JSON.stringify(save))).toBe(true);
    // Mise en place au RECHARGEMENT (SAV-8) : c'est le démarrage qui écrit le nuage.
    const { cs, writes } = await reboot(first);
    const st = await import('../state.js');
    expect(st.state.saveEpoch && st.state.saveEpoch.id).toBeTruthy();
    expect(writes.length).toBeGreaterThan(0);
    expect(lifeOf(writes.at(-1))).toBe(216000);              // moins avancée, mais elle fait autorité
    // La partie importée continue : ses miroirs ne sont plus bloqués par l'ancienne horloge.
    st.state.chronicleStats.lifetimePlaySec = 216031;
    st.save();
    cs.cloudMirrorSave({ flush: true });
    expect(lifeOf(writes.at(-1))).toBe(216031);
  }, 60000);

  it('« Recommencer depuis le premier feu » : la partie neuve naît d’une époque fraîche et s’écrit même si le fichier a résisté', async () => {
    // Effacement du fichier raté (verrou Drive) : il porte encore l'ancienne partie.
    const old = mk(360000, epoch('vieux', 1000));
    const { store, writes } = await bootCloud({
      initial: { status: 'ok', text: old },
      local: old,
      extra: { [SAVE_KEY + ':wipe']: String(Date.now()) },
      clear: () => false,
    });
    expect(store.has(SAVE_KEY)).toBe(false);
    const st = await import('../state.js');
    expect(st.state.saveEpoch && st.state.saveEpoch.id).toBeTruthy();
    expect(st.state.saveEpoch.at).toBeGreaterThan(1000);
    st.save();
    const cs = await import('../cloudSave.js');
    cs.cloudMirrorSave({ flush: true });
    expect(writes.length).toBeGreaterThan(0);
    expect(JSON.parse(writes.at(-1)).saveEpoch.id).toBe(st.state.saveEpoch.id);
  }, 60000);
});

// SAV-5 : après une écriture FORCÉE d'une partie moins avancée (emplacement,
// import), la référence gardait l'ancienne horloge (Math.max) : plus aucun miroir
// de la session, et Options affichait « Active ». La référence suit désormais ce
// qui a été écrit (SAV-4) ; un refus de la garde est exposé (`behind`).
describe('SAV-5 — miroir après un emplacement, refus de la garde visible', () => {
  it('emplacement moins avancé : écrit de force, puis les miroirs ordinaires reprennent', async () => {
    const first = await bootCloud({ initial: { status: 'ok', text: mk(36000) }, local: mk(36000) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const slots = await import('../saveSlots.js');
    // Instantané d'il y a 10 h, rangé dans l'emplacement 1.
    const old = (await import('../state.js')).state;
    old.chronicleStats.lifetimePlaySec = 0;
    first.store.set(SAVE_KEY + '-slot0', JSON.stringify({ ...JSON.parse(JSON.stringify(old)), chronicleStats: { lifetimePlaySec: 600 } }));
    expect(slots.loadSlot(0)).toBe(true);
    // Mise en place au RECHARGEMENT (SAV-8) : c'est le démarrage qui écrit le nuage.
    const { cs, writes } = await reboot(first);
    const st = await import('../state.js');
    expect(lifeOf(writes.at(-1))).toBe(600);
    expect(cs.cloudSyncInfo().behind).toBe(false);
    // La partie chargée continue : le miroir suivant l'écrit (avant : bloqué 10 h).
    st.state.chronicleStats.lifetimePlaySec = 640;
    st.save();
    cs.cloudMirrorSave({ flush: true });
    expect(lifeOf(writes.at(-1))).toBe(640);
  }, 60000);

  it('nuage relu plus avancé en cours de session : refus exposé (`behind`), levé dès que la partie le rattrape', async () => {
    let cloudNow = { status: 'error', text: null };
    const { cs, store, writes } = await bootCloud({ initial: cloudNow, read: () => cloudNow, local: mk(300) });
    cloudNow = { status: 'ok', text: mk(1000) };
    store.set(SAVE_KEY, mk(420));
    cs.cloudMirrorSave({ flush: true });
    expect(writes).toEqual([]);
    expect(cs.cloudSyncInfo().behind).toBe(true);           // Options : « En pause », plus « Active »
    store.set(SAVE_KEY, mk(1001));
    cs.cloudMirrorSave({ flush: true });
    expect(writes.map(lifeOf)).toEqual([1001]);
    expect(cs.cloudSyncInfo().behind).toBe(false);
  });
});
