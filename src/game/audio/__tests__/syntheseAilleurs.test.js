// PERF-41 (audit du 2026-10-05) : les sons lourds (jackpot ~100 ms, gros gain ~55 ms,
// mélodie de la scène 10-70 ms) se rendaient d'un bloc sur le fil principal, et même
// bruitages coupés. Ils passent par le Worker des sons. Ici un FAUX Worker (rien n'est
// vraiment rendu, aucun minuteur) : on compte les demandes.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

const demandes = [];
let ouverts = 0, M = null, S = null, Mel = null;
beforeAll(async () => {
  // Les modules d'abord (le cœur du jeu se charge en Node, sans fenêtre)…
  M = await import('../../core/main.js');
  S = await import('../slotsSound.js');
  Mel = await import('../melodieScene.js');
  // …puis une fenêtre et un faux Worker, pour les gardes de la préparation.
  globalThis.window = {};
  globalThis.Worker = class {
    constructor() { ouverts += 1; }
    postMessage(msg) {
      demandes.push(msg);
      queueMicrotask(() => this.onmessage && this.onmessage({ data: { id: msg.id, data: new Float32Array(8) } }));
    }
    terminate() {}
  };
});
afterAll(() => { delete globalThis.window; delete globalThis.Worker; });
beforeEach(() => { demandes.length = 0; });
const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('les sons rendus hors du fil principal', () => {
  it('bruitages coupés : la machine ne prépare rien', async () => {
    const { setSfxEnabled } = M, { prechaufferSons } = S;
    setSfxEnabled(false);
    const annuler = prechaufferSons('neon');
    await attendre();
    expect(demandes.length).toBe(0);
    expect(typeof annuler).toBe('function');
    setSfxEnabled(true);
  });

  it("la machine demande chaque son de l'habit une fois, au Worker, le jackpot en dernier", async () => {
    const { prechaufferSons, SONS_SLOTS } = S;
    prechaufferSons('fonte');
    prechaufferSons('fonte');                       // remonté (StrictMode) : pas de doublon
    expect(demandes.length).toBe(SONS_SLOTS.length + 1);   // + le ronron
    expect(demandes[demandes.length - 1]).toMatchObject({ quoi: 'son', nom: 'jackpot', look: 'fonte' });
    expect(demandes.some((d) => d.quoi === 'ronron' && d.look === 'fonte')).toBe(true);
    await attendre();
    // Tout est en cache : rouvrir la machine ne redemande rien.
    demandes.length = 0;
    prechaufferSons('fonte');
    expect(demandes.length).toBe(0);
    expect(ouverts).toBe(1);
  });

  it("la mélodie de l'âge est prête avant le clic, demandée une seule fois", async () => {
    const { prechaufferMelodie } = Mel;
    prechaufferMelodie(5);
    prechaufferMelodie(5);
    expect(demandes).toEqual([expect.objectContaining({ quoi: 'melodie', band: 5 })]);
    await attendre();
    prechaufferMelodie(5);
    prechaufferMelodie(12);                         // au-delà des âges : la dernière bande
    expect(demandes.length).toBe(2);
    expect(demandes[1]).toMatchObject({ quoi: 'melodie', band: 9 });
  });
});
