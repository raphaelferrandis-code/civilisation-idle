import { describe, it, expect } from 'vitest';
import { pickMostAdvanced } from '../cloudSave.js';

// L'arbitrage « la partie la plus avancée gagne » : l'horloge à vie
// chronicleStats.lifetimePlaySec départage, lastTick ne sert qu'à égalité.
// (Le module s'importe hors navigateur sans effet de bord : pas de window.)

const mk = ({ life, tick } = {}) => JSON.stringify({
  chronicleStats: { lifetimePlaySec: life ?? 0 },
  lastTick: tick ?? 0,
});

describe('pickMostAdvanced (sauvegarde nuage Google Drive)', () => {
  it("l'horloge à vie la plus haute gagne, dans les deux sens", () => {
    expect(pickMostAdvanced(mk({ life: 100 }), mk({ life: 90 }))).toBe('cloud');
    expect(pickMostAdvanced(mk({ life: 90 }), mk({ life: 100 }))).toBe('local');
  });

  it("un poste resté hors ligne mais ouvert en DERNIER ne bat pas la partie avancée", () => {
    // Scénario du danger : PC2 a une vieille partie (90 h) au lastTick récent ;
    // le nuage porte la vraie partie (100 h). Un arbitrage au timestamp perdrait
    // 10 h — l'horloge à vie, non.
    expect(pickMostAdvanced(mk({ life: 100, tick: 1000 }), mk({ life: 90, tick: 9999 }))).toBe('cloud');
  });

  it('à horloge égale, le save le plus récent gagne', () => {
    expect(pickMostAdvanced(mk({ life: 50, tick: 200 }), mk({ life: 50, tick: 100 }))).toBe('cloud');
    expect(pickMostAdvanced(mk({ life: 50, tick: 100 }), mk({ life: 50, tick: 200 }))).toBe('local');
  });

  it('pas de save locale → le nuage gagne (nouveau poste)', () => {
    expect(pickMostAdvanced(mk({ life: 1 }), null)).toBe('cloud');
    expect(pickMostAdvanced(mk({ life: 1 }), '')).toBe('cloud');
  });

  it('nuage corrompu ou non-objet → on garde le local, toujours', () => {
    expect(pickMostAdvanced('{pas du json', mk({ life: 0 }))).toBe('local');
    expect(pickMostAdvanced('{pas du json', null)).toBe('local');
    expect(pickMostAdvanced('null', null)).toBe('local');
    expect(pickMostAdvanced('42', mk({ life: 0 }))).toBe('local');
  });

  it('local corrompu → le nuage (valide) le remplace', () => {
    expect(pickMostAdvanced(mk({ life: 5 }), '{cassé')).toBe('cloud');
  });

  it("saves d'anciennes versions sans chronicleStats : traitées comme horloge 0", () => {
    expect(pickMostAdvanced(JSON.stringify({ lastTick: 50 }), JSON.stringify({ lastTick: 10 }))).toBe('cloud');
    expect(pickMostAdvanced(JSON.stringify({ lastTick: 10 }), mk({ life: 1, tick: 5 }))).toBe('local');
  });
});
