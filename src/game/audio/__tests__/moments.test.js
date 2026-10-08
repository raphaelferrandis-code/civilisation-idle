// LES GRANDS MOMENTS, la lecture (audio/moments/moments.js, lot 7 du paysage sonore).
// Un FAUX contexte audio, un FAUX Worker, des réglages simulés : on compte les sons
// joués et ce que la musique reçoit.
//   · un nouvel âge sonne, une époque plus ample ; rien après une absence rejouée ;
//   · une maison qui sort de terre ne sonne qu'après un achat à la main ; un achat de
//     masse fait une courte rafale ;
//   · la chute : la musique descend, les gros effondrements tombent à leur instant, un
//     saut ne les joue pas tous d'un coup, le glas au deuil, la musique revient à l'aube ;
//   · sans carte pour la jouer : le glas, puis la musique revient à la fin.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const R = { sfx: true, rattrapage: false, tenue: [], efface: [] };
vi.mock('../../core/main.js', () => ({
  getSfxEnabled: () => R.sfx,
  getSfxVolume: () => 0.8,
  duckMusic: (ms) => { R.efface.push(ms); },
  holdMusicLow: (on, ms) => { R.tenue.push(on ? 'basse' : 'rendue:' + (ms || 0)); },
  rattrapageRecent: () => R.rattrapage,
}));

class Param {
  constructor(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
}
class Noeud {
  connect(x) { return x; }
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
  createStereoPanner() { const n = new Noeud(); n.pan = new Param(0); return n; }
  createDynamicsCompressor() {
    const n = new Noeud();
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0);
    return n;
  }
  createBufferSource() {
    const s = new Noeud();
    s.playbackRate = new Param(1);
    s.start = () => {};
    s.stop = () => { if (s.onended) s.onended(); };
    return s;
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

let M = null, A = null, C = null;
const vider = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const compte = (prefixe) => Object.entries(M.etatMoments().compte).filter(([k]) => k.startsWith(prefixe)).reduce((s, [, v]) => s + v, 0);

beforeAll(async () => {
  globalThis.window = { AudioContext: FauxContexte };
  globalThis.AudioBuffer = FauxTampon;
  globalThis.Worker = class {
    postMessage(msg) { queueMicrotask(() => this.onmessage && this.onmessage({ data: { id: msg.id, data: new Float32Array(3200) } })); }
    terminate() {}
  };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  M = await import('../moments/moments.js');
  A = await import('../moments/annonces.js');
  C = await import('../../map/iso/chuteState.js');
}, 30000);
afterAll(() => {
  M.desarmerMoments();
  vi.useRealTimers();
  delete globalThis.window; delete globalThis.AudioBuffer; delete globalThis.Worker;
});
beforeEach(async () => {
  M.desarmerMoments();
  R.sfx = true; R.rattrapage = false; R.tenue.length = 0; R.efface.length = 0;
  Object.assign(C.CHUTE, { act: null, short: false, t0: 0, scrub: null, fade: 0, done: false, sons: null });
  M.armerMoments(3);
  vi.advanceTimersByTime(8100);          // les sons se préparent
  await vider();
  vi.advanceTimersByTime(2000);
});

describe('un nouvel âge', () => {
  it("une frappe pour un âge, plus ample pour une époque (la musique s'efface) ; rien après une absence rejouée", () => {
    const age0 = compte('age-3'), ep0 = compte('epoque-4');
    M.sonNouvelAge({ bande: 3 });
    expect(compte('age-3')).toBe(age0 + 1);
    vi.advanceTimersByTime(1600);
    M.sonNouvelAge({ bande: 4, epoque: true });
    expect(compte('epoque-4')).toBe(ep0 + 1);
    expect(R.efface.length).toBe(1);
    vi.advanceTimersByTime(1600);
    R.rattrapage = true;
    M.sonNouvelAge({ bande: 3 });
    expect(compte('age-3')).toBe(age0 + 1);
    // Bruitages coupés : rien.
    R.rattrapage = false; R.sfx = false;
    vi.advanceTimersByTime(1600);
    M.sonNouvelAge({ bande: 3 });
    expect(compte('age-3')).toBe(age0 + 1);
  });
});

describe('une maison qui sort de terre', () => {
  it("ne sonne qu'après un achat à la main ; un achat de masse fait une courte rafale", () => {
    const b0 = compte('batiment-');
    A.annoncer('batiment', { sx: 100, cw: 1000, vu: true, bande: 3 });
    expect(compte('batiment-')).toBe(b0);                 // l'automatisation : rien
    A.annoncer('achat', { id: 'guilds' });
    A.annoncer('batiment', { sx: 100, cw: 1000, vu: true, bande: 3 });
    expect(compte('batiment-pierre')).toBe(b0 + 1);
    vi.advanceTimersByTime(1600);
    A.annoncer('achats', { n: 40 });
    A.annoncer('batiment', { sx: 900, cw: 1000, vu: true, bande: 3 });
    expect(compte('batiment-') - b0 - 1).toBe(5);
  });
});

describe('la chute', () => {
  const chutes = [];
  for (let i = 0; i < 300; i += 1) chutes.push({ at: 700 + i * 17, pan: ((i % 21) - 10) / 10, poids: i % 37 === 0 ? 8 : 1 + (i % 3) });

  it('les gros effondrements : les plus lourds, jamais deux trop serrés, une douzaine au plus', () => {
    const pris = M.choisirEffondrements(chutes);
    expect(pris.length).toBe(12);
    for (let i = 1; i < pris.length; i += 1) expect(pris[i].at - pris[i - 1].at).toBeGreaterThanOrEqual(220);
    expect(M.choisirEffondrements(chutes, true).length).toBe(5);
    const dens = M.densiteChutes(chutes);
    expect(Math.max(...dens)).toBeCloseTo(1, 9);
  });

  it("la musique descend ; les effondrements tombent à leur instant ; un saut ne les joue pas tous ; le glas ; l'aube rend la musique", () => {
    const e0 = compte('effondrement-'), g0 = compte('glas');
    Object.assign(C.CHUTE, { act: 'fall', t0: performance.now(), sons: { chutes, bande: 3 } });
    A.annoncer('chute:debut', { raison: 'manual' });
    expect(R.tenue).toEqual(['basse']);
    A.annoncer('chute:vague');
    vi.advanceTimersByTime(3000);
    const joues = compte('effondrement-pierre') - e0;
    expect(joues).toBeGreaterThan(2);
    expect(M.etatMoments().grondement).toBe(true);
    // Le joueur passe la chute (clic) : le temps saute au fondu, rien ne déferle.
    C.CHUTE.t0 -= 12000;
    vi.advanceTimersByTime(200);
    expect(compte('effondrement-') - e0).toBeLessThanOrEqual(joues + 1);
    // Le noir, le deuil : trois coups de glas.
    C.CHUTE.fade = 1; C.CHUTE.done = true;
    A.annoncer('chute:deuil', { jouee: true });
    expect(compte('glas') - g0).toBe(3);
    A.annoncer('chute:fin', { jouee: true });
    // Le lever : la musique revient à l'aube, pas avant.
    Object.assign(C.CHUTE, { act: 'rise', t0: performance.now(), fade: 1, done: false });
    vi.advanceTimersByTime(2000);
    expect(R.tenue).toEqual(['basse']);
    vi.advanceTimersByTime(2500);
    expect(R.tenue[1]).toMatch(/^rendue/);
    expect(M.etatMoments().chute).toBe(null);
  });

  it('sans carte pour la jouer : le glas au deuil, la musique revient à la fin', () => {
    const g0 = compte('glas');
    A.annoncer('chute:debut', { raison: 'auto_collapse' });
    A.annoncer('chute:deuil', { jouee: false });
    expect(compte('glas') - g0).toBe(3);
    A.annoncer('chute:fin', { jouee: false });
    expect(R.tenue).toEqual(['basse', 'rendue:2400']);
    expect(M.etatMoments().chute).toBe(null);
  });

  it("Bruitages coupés : aucun son, mais la musique descend quand même pendant la chute", () => {
    R.sfx = false;
    const g0 = compte('glas');
    A.annoncer('chute:debut', { raison: 'manual' });
    A.annoncer('chute:deuil', { jouee: false });
    A.annoncer('chute:fin', { jouee: false });
    expect(compte('glas')).toBe(g0);
    expect(R.tenue).toEqual(['basse', 'rendue:2400']);
  });
});

describe("l'interface (lot 8)", () => {
  it("un achat à la main fait un toc ; si une maison sort de terre, on n'entend qu'elle", () => {
    const t0 = compte('achat-'), b0 = compte('batiment-');
    A.annoncer('achat', { id: 'scribes' });
    vi.advanceTimersByTime(100);
    expect(compte('achat-pierre')).toBe(t0 + 1);
    vi.advanceTimersByTime(1600);
    A.annoncer('achat', { id: 'guilds' });
    A.annoncer('batiment', { sx: 500, cw: 1000, vu: true, bande: 3 });
    vi.advanceTimersByTime(100);
    expect(compte('achat-')).toBe(t0 + 1);
    expect(compte('batiment-')).toBe(b0 + 1);
    // Un achat de masse loin de la carte : deux tocs.
    vi.advanceTimersByTime(1600);
    A.annoncer('achats', { n: 12 });
    vi.advanceTimersByTime(100);
    expect(compte('achat-')).toBe(t0 + 3);
  });

  it("la bulle d'un passant : l'or, le savoir, la nourriture", () => {
    const or0 = compte('bulle-or'), sa0 = compte('bulle-savoir'), no0 = compte('bulle-nourriture');
    A.annoncer('bulle', { type: 'lightning' });
    vi.advanceTimersByTime(200);
    A.annoncer('bulle', { type: 'scroll' });
    vi.advanceTimersByTime(200);
    A.annoncer('bulle', { type: 'thought' });
    expect([compte('bulle-or') - or0, compte('bulle-savoir') - sa0, compte('bulle-nourriture') - no0]).toEqual([1, 1, 1]);
  });

  it('un succès sonne une fois ; deux succès collés, un seul carillon', () => {
    const s0 = compte('succes');
    A.annoncer('succes', { n: 1 });
    A.annoncer('succes', { n: 1 });
    expect(compte('succes')).toBe(s0 + 1);
  });

  it("l'alerte de crise : un coup à 75 %, deux à 90 % ; rien après une absence rejouée", () => {
    const c1 = compte('crise-1'), c2 = compte('crise-2');
    M.sonAlerteCrise(1);
    expect(compte('crise-1')).toBe(c1 + 1);
    vi.advanceTimersByTime(4100);
    M.sonAlerteCrise(2);
    expect(compte('crise-2')).toBe(c2 + 1);
    vi.advanceTimersByTime(4100);
    R.rattrapage = true;
    M.sonAlerteCrise(2);
    expect(compte('crise-2')).toBe(c2 + 1);
  });
});

describe('les merveilles', () => {
  it("érigée : la pierre, le bourdon, la musique qui s'efface ; un rang de plus, une frappe ; un seul son par vague ; rien après une absence", () => {
    const m0 = compte('merveille-3'), r0 = compte('rang-3');
    A.annoncer('merveille', { erigee: true });
    A.annoncer('merveille', { erigee: false });   // la même vague : un seul son
    expect(compte('merveille-3')).toBe(m0 + 1);
    expect(compte('rang-3')).toBe(r0);
    expect(R.efface.length).toBe(1);
    vi.advanceTimersByTime(2600);
    A.annoncer('merveille', { erigee: false });
    expect(compte('rang-3')).toBe(r0 + 1);
    expect(R.efface.length).toBe(1);
    vi.advanceTimersByTime(2600);
    R.rattrapage = true;
    A.annoncer('merveille', { erigee: true });
    expect(compte('merveille-3')).toBe(m0 + 1);
  });
});

describe('le Grand Reset', () => {
  it('le sceau (la musique s’efface), puis le renouveau', () => {
    const s0 = compte('sceau'), r0 = compte('renouveau');
    A.annoncer('sceau');
    expect(compte('sceau')).toBe(s0 + 1);
    expect(R.efface.length).toBe(1);
    A.annoncer('renouveau');
    expect(compte('renouveau')).toBe(r0 + 1);
  });
});
