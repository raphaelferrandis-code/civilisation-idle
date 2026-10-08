// LES TABLES DE LA MAISON DES PLAISIRS (audio/tables, lots 10 et 11 du paysage sonore) :
// la synthèse (chaque son se rend, dans chaque matière) et la lecture (quels sons partent
// à quel geste), sous un FAUX contexte audio et des réglages simulés.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import {
  rendreTable, SONS_TABLES, TABLES_SR, matiereJeton, matiereDes, matiereCartes, matiereTicket,
} from '../tables/tablesSynth.js';
import { matiereRoue, matierePiste, matiereVol, SONS_SCENES } from '../tables/tablesSynthScenes.js';

const R = { sfx: true };
vi.mock('../../core/main.js', () => ({
  getSfxEnabled: () => R.sfx,
  getSfxVolume: () => 0.8,
  duckMusic: () => {},
  holdMusicLow: () => {},
  rattrapageRecent: () => false,
}));

class Param {
  constructor(v) { this.value = v; this.points = []; }
  setTargetAtTime(v) { this.value = v; }
  setValueAtTime(v, t) { this.points.push([t, v]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.points.push([t, v]); }
  cancelScheduledValues() { this.points = []; }
}
class Noeud { connect(x) { return x; } disconnect() {} }
class FauxTampon {
  constructor({ length, sampleRate }) { this.length = length; this.sampleRate = sampleRate; this.duration = length / sampleRate; }
  getChannelData() { return new Float32Array(this.length); }
  copyToChannel() {}
}
const J = { sources: [] };
class FauxContexte {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = new Noeud(); }
  createGain() { const n = new Noeud(); n.gain = new Param(1); return n; }
  createStereoPanner() { const n = new Noeud(); n.pan = new Param(0); return n; }
  createDynamicsCompressor() { const n = new Noeud(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0); return n; }
  createBufferSource() {
    const s = new Noeud();
    s.playbackRate = new Param(1);
    s.start = () => { s.joue = true; };
    s.stop = (quand) => { s.arretee = quand ?? true; if (s.onended) s.onended(); };
    J.sources.push(s);
    return s;
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

describe('les sons des tables, la synthèse', () => {
  it('chacun se rend, fini, sans écrêtage ni silence', () => {
    expect(SONS_TABLES.length).toBe(105);
    expect(SONS_SCENES.length).toBe(28);
    for (const nom of SONS_TABLES) {
      const b = rendreTable(nom);
      expect(b, nom).toBeInstanceOf(Float32Array);
      expect(b.length / TABLES_SR, nom).toBeGreaterThan(0.2);
      expect(b.every(Number.isFinite), nom).toBe(true);
      expect(b.reduce((m, v) => Math.max(m, Math.abs(v)), 0), nom).toBeLessThanOrEqual(0.96);
    }
    expect(rendreTable('inconnu')).toBe(null);
  });

  it('chaque table prépare ses sons, et le râtelier seul ses jetons', async () => {
    const { sonsDeTable } = await import('../tables/tables.js');
    expect(sonsDeTable('jetons', 5)).toEqual(['jeton-argile-1', 'jeton-argile-2', 'jetons-argile']);
    for (const jeu of ['osselets', 'cartes', 'tickets', 'roulette', 'courses', 'duel', 'icare']) {
      // La foule des courses est un enregistrement : elle n'a pas de synthèse.
      for (let b = 0; b <= 9; b += 1) for (const nom of sonsDeTable(jeu, b)) if (nom !== 'foule') expect(SONS_TABLES, `${jeu} ${b} ${nom}`).toContain(nom);
    }
  });

  it("la matière suit l'âge, comme la table la dessine", () => {
    expect([0, 3, 5, 6, 8].map(matiereJeton)).toEqual(['os', 'bronze', 'argile', 'plastique', 'lumiere']);
    expect([0, 3, 4, 6, 7].map(matiereDes)).toEqual(['os', 'os', 'ivoire', 'casino', 'lumiere']);
    expect([2, 3, 5, 7].map(matiereCartes)).toEqual(['bois', 'parchemin', 'papier', 'cristal']);
    expect([0, 1, 2, 4, 5, 6, 9].map(matiereTicket)).toEqual(['argile', 'bois', 'papier', 'metal', 'papier', 'vernis', 'cristal']);
    // Le lot 11 : la roue, la piste, l'aviateur (plaisirsMaterial.icarusFlyer).
    expect([0, 5, 6, 7].map(matiereRoue)).toEqual(['bois', 'bois', 'casino', 'lumiere']);
    expect([0, 6, 7, 9].map(matierePiste)).toEqual(['sabots', 'sabots', 'lumiere', 'lumiere']);
    expect([0, 4, 5, 6, 7].map(matiereVol)).toEqual(['icare', 'icare', 'ballon', 'delta', 'lumiere']);
  });
});

describe('les sons des tables, la lecture', () => {
  let T = null;
  const vider = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
  const compte = (prefixe) => Object.entries(T.etatTables().compte).filter(([k]) => k.startsWith(prefixe)).reduce((s, [, v]) => s + v, 0);
  const page = { hidden: false };

  beforeAll(async () => {
    globalThis.window = { AudioContext: FauxContexte };
    globalThis.document = page;
    globalThis.AudioBuffer = FauxTampon;
    globalThis.Worker = class {
      postMessage(msg) { queueMicrotask(() => this.onmessage && this.onmessage({ data: { id: msg.id, data: new Float32Array(3200) } })); }
      terminate() {}
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    T = await import('../tables/tables.js');
    for (const jeu of ['osselets', 'cartes', 'tickets', 'roulette', 'courses', 'duel', 'icare']) T.preparerTable(jeu, 5);
    await vider();
  }, 30000);
  afterAll(() => {
    vi.useRealTimers();
    delete globalThis.window; delete globalThis.document; delete globalThis.AudioBuffer; delete globalThis.Worker;
  });
  beforeEach(() => { R.sfx = true; page.hidden = false; vi.advanceTimersByTime(2000); });

  it('les jetons : un par clic, jamais deux en 60 ms ; la même mise en fait deux ; la pile reprise glisse', () => {
    const j0 = compte('jeton-argile'), s0 = compte('jetons-argile');
    T.sonJetons(5, 'pose');
    T.sonJetons(5, 'pose');
    expect(compte('jeton-argile') - j0).toBe(1);
    vi.advanceTimersByTime(100);
    T.sonJetons(5, 'meme');
    expect(compte('jeton-argile') - j0).toBe(3);
    T.sonJetons(5, 'reprend');
    expect(compte('jetons-argile') - s0).toBe(1);
  });

  it('les osselets : le lancer, quatre qui retombent, le petit gain ; un gros gain laisse sa fanfare', () => {
    const l0 = compte('des-ivoire-lance'), t0 = compte('des-ivoire-'), g0 = compte('gain-petit'), p0 = compte('perte');
    T.sonOsselets(5, 'lance');
    for (let i = 0; i < 4; i += 1) T.sonOsselets(5, 'tombe', { i });
    expect(compte('des-ivoire-lance') - l0).toBe(1);
    expect(compte('des-ivoire-') - t0).toBe(5);
    T.sonOsselets(5, 'verdict', { gagne: true, gros: false });
    T.sonOsselets(5, 'verdict', { gagne: true, gros: true });
    T.sonOsselets(5, 'verdict', { gagne: false });
    expect(compte('gain-petit') - g0).toBe(1);
    expect(compte('perte') - p0).toBe(1);
  });

  it('le vingt-et-un : le battage puis quatre cartes, le croupier retourne puis tire, le verdict', () => {
    const m0 = compte('melange-papier'), c0 = compte('carte-papier'), r0 = compte('retourne-papier');
    const d1 = T.sonCartes(5, 'donne', { n: 4, melange: true });
    expect(compte('melange-papier') - m0).toBe(1);
    expect(compte('carte-papier') - c0).toBe(4);
    const d2 = T.sonCartes(5, 'croupier', { n: 2, dans: d1 });
    expect(compte('retourne-papier') - r0).toBe(1);
    expect(compte('carte-papier') - c0).toBe(6);
    expect(d2).toBeGreaterThan(d1);
    const g0 = compte('gain-petit'), e0 = compte('egalite');
    T.sonVerdictCartes('blackjack', d2);
    T.sonVerdictCartes('push');
    expect(compte('gain-petit') - g0).toBe(1);
    expect(compte('egalite') - e0).toBe(1);
  });

  it('les tickets : le ticket posé, les cases (jamais deux en 80 ms), la révélation ; le grattage boucle et s’arrête', () => {
    const a0 = compte('ticket-papier'), c0 = compte('case'), v0 = compte('revele');
    T.sonTicket(5, 'achat');
    T.sonTicket(5, 'case');
    T.sonTicket(5, 'case');
    vi.advanceTimersByTime(100);
    T.sonTicket(5, 'case');
    T.sonTicket(5, 'revele');
    expect([compte('ticket-papier') - a0, compte('case') - c0, compte('revele') - v0]).toEqual([1, 2, 1]);
    const avant = J.sources.length;
    T.grattage(5, 1.2);
    expect(T.etatTables().gratte).toBe(true);
    T.grattage(5, 0.3);
    expect(J.sources.length).toBe(avant + 1);          // une seule boucle, réglée
    T.finGrattage();
    expect(T.etatTables().gratte).toBe(false);
  });

  it('la roulette : le tour sur une scène que la fermeture coupe, puis le verdict', () => {
    const r0 = compte('roue-bois'), g0 = compte('gain-petit'), p0 = compte('perte');
    T.sonRoulette(5, 'lance');
    expect(compte('roue-bois') - r0).toBe(1);
    expect(T.etatTables().scene).toBe(true);
    T.finScene();
    expect(T.etatTables().scene).toBe(false);
    T.sonRoulette(5, 'verdict', { gagne: true, gros: false });
    T.sonRoulette(5, 'verdict', { gagne: true, gros: true });
    T.sonRoulette(5, 'verdict', { gagne: false });
    expect([compte('gain-petit') - g0, compte('perte') - p0]).toEqual([1, 1]);
  });

  it('les courses : tout se pose au départ, calé sur le plan ; la photo seulement si c’est serré', () => {
    const avant = J.sources.length;
    const s0 = compte('stalles-sabots'), a0 = compte('arrivee-sabots'), ph0 = compte('photo'), g0 = compte('galop-sabots');
    T.sonCourse(5, 'depart', { fin: 6200, dernier: 7400, photo: false });
    expect([compte('stalles-sabots') - s0, compte('galop-sabots') - g0, compte('arrivee-sabots') - a0, compte('photo') - ph0]).toEqual([1, 1, 1, 0]);
    // Le galop : monté au départ, plus fort à la ligne, éteint après le dernier, arrêté.
    const galop = J.sources.slice(avant).find((s) => s.loop);
    expect(galop.arretee).toBeCloseTo(0.05 + 7.4 + 1.3, 3);
    T.sonCourse(5, 'depart', { fin: 6200, dernier: 6900, photo: true });
    expect(compte('photo') - ph0).toBe(1);
    T.finScene();
    const v0 = compte('gain-petit');
    T.sonCourse(5, 'verdict', { gagne: true });
    expect(compte('gain-petit') - v0).toBe(1);
  });

  it('le duel : les dés de chaque camp, la manche gagnée, perdue ou nulle, le verdict', () => {
    const l0 = compte('des-ivoire-lance'), t0 = compte('des-ivoire-');
    T.sonDuel(5, 'lance', { camp: 'flambeur' });
    for (let i = 0; i < 4; i += 1) T.sonDuel(5, 'tombe', { camp: 'flambeur', i });
    expect(compte('des-ivoire-lance') - l0).toBe(1);
    expect(compte('des-ivoire-') - t0).toBe(5);
    const mg = compte('manche-gagnee'), mp = compte('manche-perdue'), eg = compte('egalite');
    T.sonDuel(5, 'manche', { gagnant: 'joueur' });
    T.sonDuel(5, 'manche', { gagnant: 'flambeur' });
    T.sonDuel(5, 'manche', { gagnant: null });
    expect([compte('manche-gagnee') - mg, compte('manche-perdue') - mp, compte('egalite') - eg]).toEqual([1, 1, 1]);
  });

  it("le vol d'Icare : l'envol, une seule boucle qui monte avec la hauteur, la pose puis le gain, la chute", () => {
    const e0 = compte('envol-ballon');
    T.sonIcare(5, 'envol');
    expect(compte('envol-ballon') - e0).toBe(1);
    const avant = J.sources.length;
    T.volIcare(5, 0);
    const v = J.sources[J.sources.length - 1];
    const bas = v.playbackRate.value;
    T.volIcare(5, 1);
    expect(J.sources.length).toBe(avant + 1);          // la même boucle, réglée
    expect(v.playbackRate.value).toBeGreaterThan(bas);
    expect(T.etatTables().vol).toBe(true);
    const p0 = compte('pose-ballon'), g0 = compte('gain-petit');
    T.sonIcare(5, 'pose', { gros: false });
    expect(T.etatTables().vol).toBe(false);
    expect([compte('pose-ballon') - p0, compte('gain-petit') - g0]).toEqual([1, 1]);
    T.volIcare(5, 0.5);
    const b0 = compte('brule-ballon');
    T.sonIcare(5, 'brule');
    expect(compte('brule-ballon') - b0).toBe(1);
    expect(T.etatTables().vol).toBe(false);
  });

  it('onglet caché ou Bruitages coupés : rien', () => {
    const j0 = compte('jeton-'), d0 = compte('des-');
    page.hidden = true;
    T.sonJetons(5, 'pose');
    T.sonOsselets(5, 'lance');
    page.hidden = false; R.sfx = false;
    vi.advanceTimersByTime(100);
    T.sonJetons(5, 'pose');
    expect(compte('jeton-') - j0).toBe(0);
    expect(compte('des-') - d0).toBe(0);
  });
});
