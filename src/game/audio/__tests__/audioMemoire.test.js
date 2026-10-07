// MEM-10 (audit du 2026-10-05) : les sons gardaient ~16 Mo de Float32Array à vie (trois
// habits de machine, dix mélodies), recréaient et recopiaient un AudioBuffer à chaque
// lecture, ne débranchaient jamais leurs nœuds, et le contexte audio restait « running »
// des heures. Ici un FAUX contexte audio et un FAUX Worker (rien n'est rendu) : on
// COMPTE les tampons créés, les demandes de rendu, les débranchements, les mises en veille.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const demandes = [];
const compte = { createBuffer: 0, sources: 0, debranches: 0, suspend: 0, resume: 0, tampons: 0 };
let sources = [];
class FauxTampon {
  constructor({ length, sampleRate }) { this.length = length; this.sampleRate = sampleRate; compte.tampons += 1; }
  getChannelData() { return new Float32Array(this.length); }
  copyToChannel() {}
}
class FauxContexte {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createBuffer(n, length, sampleRate) { compte.createBuffer += 1; return new FauxTampon({ length, sampleRate }); }
  createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect: (x) => x, disconnect: () => { compte.debranches += 1; } }; }
  createBufferSource() {
    compte.sources += 1;
    const s = { connect: (x) => x, disconnect: () => { compte.debranches += 1; }, start() {}, stop() { if (s.onended) s.onended(); } };
    sources.push(s);
    return s;
  }
  suspend() { compte.suspend += 1; this.state = 'suspended'; return Promise.resolve(); }
  resume() { compte.resume += 1; this.state = 'running'; return Promise.resolve(); }
}

let Synth = null, S = null, Mel = null;
beforeAll(async () => {
  // Les modules d'abord (le cœur du jeu se charge en Node, sans fenêtre)…
  await import('../../core/main.js');
  Synth = await import('../synth.js');
  S = await import('../slotsSound.js');
  Mel = await import('../melodieScene.js');
  // …puis une fenêtre, un contexte audio, des AudioBuffer et un Worker, tous faux.
  globalThis.window = { AudioContext: FauxContexte };
  globalThis.AudioBuffer = FauxTampon;
  globalThis.Worker = class {
    postMessage(msg) {
      demandes.push(msg);
      queueMicrotask(() => this.onmessage && this.onmessage({ data: { id: msg.id, data: new Float32Array(64) } }));
    }
    terminate() {}
  };
  // 30 s : charger le cœur du jeu en Node dépasse les 10 s par défaut quand toute la suite
  // du son tourne en parallèle (« Hook timed out », vu le 2026-10-07 ; seul, il passe).
}, 30000);
afterAll(() => { delete globalThis.window; delete globalThis.AudioBuffer; delete globalThis.Worker; vi.useRealTimers(); });
beforeEach(() => { demandes.length = 0; sources = []; for (const k in compte) compte[k] = 0; });
const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('la mémoire et le contexte des sons', () => {
  it("un tampon prêt (AudioBuffer) se joue sans être recréé ni recopié à chaque son", () => {
    const t = Synth.enTampon(new Float32Array(320), 32000);
    expect(typeof t.getChannelData).toBe('function');
    for (let i = 0; i < 5; i += 1) Synth.jouerTampon(t, 32000, 0.5);
    expect(compte.sources).toBe(5);
    expect(compte.createBuffer).toBe(0);
    // Un Float32Array nu passe encore (repli) : il est copié pour sa lecture.
    Synth.jouerTampon(new Float32Array(320), 32000, 0.5);
    expect(compte.createBuffer).toBe(1);
    // Chaque son fini débranche sa source et son gain.
    for (const s of sources) s.stop();
    expect(compte.debranches).toBe(12);
  });

  it('le contexte se suspend après un repos sans aucun son, et se réveille au suivant', () => {
    vi.useFakeTimers();
    const t = Synth.enTampon(new Float32Array(320), 32000);
    const p = Synth.jouerTampon(t, 32000, 1, { loop: true });     // un ronron qui tourne
    vi.advanceTimersByTime(Synth.REPOS_MS * 3);
    expect(compte.suspend).toBe(0);                                // il joue : pas de veille
    p.stop();
    vi.advanceTimersByTime(Synth.REPOS_MS - 1);
    expect(compte.suspend).toBe(0);
    vi.advanceTimersByTime(1);
    expect(compte.suspend).toBe(1);                                // plus rien depuis REPOS_MS
    Synth.jouerTampon(t, 32000, 1);
    expect(compte.resume).toBe(1);
    vi.useRealTimers();
  });

  it("la machine ne garde que deux habits : celui en service et la fonte des grands gains", async () => {
    const { prechaufferSons, SONS_SLOTS } = S;
    const parHabit = SONS_SLOTS.length + 1;                        // + le ronron
    for (const look of ['neon', 'fonte', 'cosmic']) { prechaufferSons(look); await attendre(); }
    expect(demandes.length).toBe(parHabit * 3);
    demandes.length = 0;
    prechaufferSons('cosmic');                                     // en service : gardé
    prechaufferSons('fonte');                                      // les grands gains : gardée
    expect(demandes.length).toBe(0);
    prechaufferSons('neon');                                       // oublié au passage au cosmique
    expect(demandes.length).toBe(parHabit);
    await attendre();
    // Les sons rangés sont des tampons prêts : jouer n'en recrée aucun.
    S.sonSlots('tic', 'neon');
    S.sonSlots('jackpot', 'fonte');
    expect(compte.sources).toBe(2);
    expect(compte.createBuffer).toBe(0);
  });

  it('la scène ne garde que deux mélodies, la moins récemment jouée s’oublie', async () => {
    const { prechaufferMelodie } = Mel;
    for (const b of [1, 5, 8]) { prechaufferMelodie(b); await attendre(); }
    expect(demandes.length).toBe(3);
    demandes.length = 0;
    prechaufferMelodie(5);
    prechaufferMelodie(8);
    expect(demandes.length).toBe(0);
    prechaufferMelodie(1);                                         // la plus ancienne : oubliée
    expect(demandes).toEqual([expect.objectContaining({ quoi: 'melodie', band: 1 })]);
    await attendre();
    // Jouée depuis le cache : un tampon prêt, pas de createBuffer.
    Mel.jouerMelodieScene(1);
    expect(compte.sources).toBe(1);
    expect(compte.createBuffer).toBe(0);
  });
});
