// LA VIE DU DIRECTEUR DU PAYSAGE SONORE (paysage/paysage.js). Un FAUX contexte audio, un
// FAUX Worker, une fausse page : on compte les sources, on lit les cibles des gains.
//   · il s'éveille avec la carte, s'endort quand on la quitte, et rend le contexte
//     audio, qui peut alors dormir (MEM-10) ;
//   · fenêtre cachée ou Ambiance coupée : silence ;
//   · une fenêtre ouverte l'assourdit, les Options non ;
//   · le plouf d'un poisson vu à gauche sonne à gauche ; trop loin, rien ; jamais deux
//     ploufs collés.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const J = { sources: [], filtres: [], suspend: 0 };
class Param {
  constructor(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
}
class Noeud {
  connect(x) { this.cible = x; return x; }
  disconnect() {}
}
class FauxTampon {
  constructor({ length, sampleRate }) { this.length = length; this.sampleRate = sampleRate; this.duration = length / sampleRate; }
  getChannelData() { return new Float32Array(this.length); }
  copyToChannel() {}
}
class FauxContexte {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = new Noeud(); }
  createGain() { const n = new Noeud(); n.gain = new Param(1); return n; }
  createBiquadFilter() { const n = new Noeud(); n.frequency = new Param(350); n.Q = new Param(1); J.filtres.push(n); return n; }
  createStereoPanner() { const n = new Noeud(); n.pan = new Param(0); return n; }
  createAnalyser() { const n = new Noeud(); n.fftSize = 2048; n.getFloatTimeDomainData = (a) => a.fill(0); return n; }
  createBufferSource() {
    const s = new Noeud();
    s.playbackRate = new Param(1);
    s.start = () => { s.joue = true; };
    s.stop = () => { s.arretee = true; if (s.onended) s.onended(); };
    J.sources.push(s);
    return s;
  }
  createBuffer(n, length, sampleRate) { return new FauxTampon({ length, sampleRate }); }
  suspend() { J.suspend += 1; this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
const page = {
  hidden: false,
  ouverte: null,
  addEventListener() {}, removeEventListener() {},
  querySelector(sel) {
    if (!this.ouverte || !sel.startsWith('dialog[open]')) return null;
    if (sel.includes(':not(.options-dialog)') && this.ouverte.classe === 'options-dialog') return null;
    return this.ouverte;
  },
};

let P = null, E = null, R = null, Synth = null, CM = null;
const boucles = () => J.sources.filter((s) => s.loop && s.joue && !s.arretee);
// Les nappes synthétisées : ici, les enregistrements ne se décodent pas (aucun fichier servi).
const nappesSynth = () => Object.values(P.NAPPES).filter((d) => !d.enregistres).length;
const ponctuels = () => J.sources.filter((s) => !s.loop);
const vider = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
// Le panoramique d'un ponctuel : source → gain → panoramique (mixeur.js).
const panDe = (s) => s.cible.cible.pan.value;

beforeAll(async () => {
  // Les modules d'abord, sans fenêtre (la carte se charge en Node)…
  ({ CM } = await import('../../map/layout.js'));
  Synth = await import('../synth.js');
  E = await import('../paysage/evenements.js');
  R = await import('../paysage/reglages.js');
  P = await import('../paysage/paysage.js');
  // …puis une page, un contexte audio, des tampons et un Worker, tous faux.
  globalThis.window = { AudioContext: FauxContexte, location: { search: '' }, addEventListener() {}, removeEventListener() {} };
  globalThis.document = page;
  globalThis.AudioBuffer = FauxTampon;
  globalThis.Worker = class {
    postMessage(msg) { queueMicrotask(() => this.onmessage && this.onmessage({ data: { id: msg.id, data: new Float32Array(3200) } })); }
    terminate() {}
  };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  // 30 s : charger la carte en Node prend plus des 10 s par défaut quand toute la suite
  // tourne en parallèle (« Hook timed out », vu le 2026-10-07 ; seul, il passe).
}, 30000);
afterAll(() => {
  vi.useRealTimers();
  delete globalThis.window; delete globalThis.document; delete globalThis.AudioBuffer; delete globalThis.Worker;
});
beforeEach(async () => {
  // Chaque essai part d'un paysage endormi, la carte démontée.
  P.paysageDetacher();
  vi.advanceTimersByTime(3000);
  await vider();
  page.hidden = false; page.ouverte = null;
  R.setPaysageActif(true); R.setPaysageVolume(0.6);
  CM.layout = null; CM.cw = 1000; CM.ch = 600;
  CM.cam.x = 0; CM.cam.y = 0; CM.cam.zoom = 2;
  J.sources.length = 0; J.filtres.length = 0; J.suspend = 0;
});
async function eveiller() {
  P.paysageAttacher();
  await vider();                       // le Worker rend les sons
  vi.advanceTimersByTime(200);         // les nappes montent
  await vider();
}

describe('le directeur du paysage sonore', () => {
  it("s'éveille avec la carte, s'endort quand on la quitte, et rend le contexte au repos", async () => {
    await eveiller();
    expect(P.etatPaysage().eveille).toBe(true);
    expect(boucles().length).toBe(2 * nappesSynth());   // chaque nappe, deux têtes
    P.paysageDetacher();
    vi.advanceTimersByTime(1000);
    expect(P.etatPaysage().eveille).toBe(true);       // le fondu de sortie d'abord…
    vi.advanceTimersByTime(1000);
    expect(P.etatPaysage().eveille).toBe(false);      // …puis le sommeil
    expect(boucles().length).toBe(0);
    vi.advanceTimersByTime(Synth.REPOS_MS + 100);
    expect(J.suspend).toBe(1);                         // plus rien ne joue : le contexte dort
  });

  it('fenêtre cachée : il ne joue pas, et se réveille au retour', async () => {
    page.hidden = true;
    await eveiller();
    expect(P.etatPaysage().eveille).toBe(false);
    expect(boucles().length).toBe(0);
    page.hidden = false;
    vi.advanceTimersByTime(200);
    await vider();
    vi.advanceTimersByTime(200);
    expect(P.etatPaysage().eveille).toBe(true);
    expect(boucles().length).toBe(2 * nappesSynth());
  });

  it("Ambiance coupée dans les Options : il se tait et s'endort", async () => {
    await eveiller();
    R.setPaysageActif(false);
    vi.advanceTimersByTime(2000);
    expect(P.etatPaysage().eveille).toBe(false);
    expect(boucles().length).toBe(0);
  });

  it("une fenêtre ouverte l'assourdit ; les Options, non", async () => {
    await eveiller();
    const etouffoir = J.filtres[0];                    // le premier filtre du mixeur
    page.ouverte = { classe: 'event-dialog' };
    vi.advanceTimersByTime(150);
    expect(etouffoir.frequency.value).toBe(1500);
    page.ouverte = { classe: 'options-dialog' };
    vi.advanceTimersByTime(150);
    expect(etouffoir.frequency.value).toBe(20000);
  });

  it('le plouf d’un poisson vu à gauche sonne à gauche ; trop loin, rien ; jamais deux collés', async () => {
    await eveiller();
    const avant = ponctuels().length;
    // À l'ouest-sud-ouest de la caméra : à gauche de l'écran, à quelques cases.
    E.noteSon('plouf', -3 * CM.TILE, 3 * CM.TILE, 1);
    vi.advanceTimersByTime(110);
    const joues = ponctuels().slice(avant);
    expect(joues.length).toBe(1);
    expect(panDe(joues[0])).toBeLessThan(0);
    // Très loin : rien.
    E.noteSon('plouf', 300 * CM.TILE, 0, 1);
    vi.advanceTimersByTime(110);
    expect(ponctuels().length).toBe(avant + 1);
    // Deux ploufs au même instant : un seul sonne.
    E.noteSon('plouf', 2 * CM.TILE, 0, 1);
    E.noteSon('plouf', 2 * CM.TILE, 0, 1);
    vi.advanceTimersByTime(110);
    expect(ponctuels().length).toBe(avant + 2);
    expect(panDe(ponctuels()[avant + 1])).toBeGreaterThan(0);
  });

  it('carte démontée : le guichet est fermé, un plouf déposé ne sonne pas au retour', async () => {
    await eveiller();
    P.paysageDetacher();
    vi.advanceTimersByTime(2000);
    E.noteSon('plouf', 0, 0, 1);                       // déposé pendant le sommeil
    expect(E.paysageEcouteActive()).toBe(false);
    const avant = ponctuels().length;
    await eveiller();
    vi.advanceTimersByTime(110);
    expect(ponctuels().length).toBe(avant);
  });
});
