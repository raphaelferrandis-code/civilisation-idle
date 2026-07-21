import { describe, it, expect } from 'vitest';
import { pickMostAdvanced, mayOverwriteCloud } from '../cloudSave.js';

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

  it('BOM UTF-8 en tête : la save reste VALIDE (fichier réécrit par un éditeur)', () => {
    // Sans strip du BOM, JSON.parse échoue → une partie de 40 h passait pour
    // illisible, était ignorée, puis écrasée. Vérifié en vrai sur un fichier
    // écrit par PowerShell (Out-File -Encoding utf8 pose un BOM).
    expect(pickMostAdvanced('﻿' + mk({ life: 144000 }), mk({ life: 10 }))).toBe('cloud');
    expect(pickMostAdvanced(mk({ life: 10 }), '﻿' + mk({ life: 144000 }))).toBe('local');
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

// L'arbitrage ci-dessus ne protège QUE la LECTURE au lancement. Sans garde
// symétrique à l'écriture, le miroir écrasait le nuage en aveugle : c'est le
// bloquant de perte de save trouvé à l'audit du 2026-07-21.
describe('mayOverwriteCloud (garde d\'écriture du miroir)', () => {
  it('nuage ILLISIBLE : aucune écriture, même forcée', () => {
    // Le cas mortel : fichier présent mais non lu (Drive hors ligne, placeholder
    // non hydraté). On ignore ce qu'il contient → on n'y touche pas.
    expect(mayOverwriteCloud('unreadable', -1, 999, false)).toBe(false);
    expect(mayOverwriteCloud('unreadable', -1, 999, true)).toBe(false);
  });

  it('hors .exe / pas de Drive : rien à écrire', () => {
    expect(mayOverwriteCloud('off', -1, 100, true)).toBe(false);
  });

  it('SCÉNARIO DE DESTRUCTION : partie neuve vs nuage avancé → écriture REFUSÉE', () => {
    // PC2, save locale vierge (life 0), nuage à 40 h de jeu (144000 s).
    // L'auto-save des 2 s ne doit PAS remplacer la vraie partie.
    expect(mayOverwriteCloud('ok', 144000, 0, false)).toBe(false);
  });

  it('progression normale : la partie en cours dépasse la référence → écriture OK', () => {
    expect(mayOverwriteCloud('ok', 144000, 144030, false)).toBe(true);
    expect(mayOverwriteCloud('ok', 144000, 144000, false)).toBe(true); // égalité = même partie
  });

  it('nuage vide (référence -1) : la première partie peut s\'y écrire', () => {
    expect(mayOverwriteCloud('ok', -1, 0, false)).toBe(true);
  });

  it('force : un geste explicite du joueur (import, reset) fait autorité', () => {
    // Importer une save moins avancée est un CHOIX — il doit passer.
    expect(mayOverwriteCloud('ok', 144000, 12, true)).toBe(true);
  });

  it('save locale illisible (life -1) : ne remplace pas un nuage valide', () => {
    expect(mayOverwriteCloud('ok', 5000, -1, false)).toBe(false);
  });
});
