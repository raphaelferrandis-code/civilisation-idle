// TENUES SAGES (audit 2026-10-05, STEAM-6 ; Raph : « oui, désactivée par défaut »).
// Une case des Options : la Maison des Plaisirs ne montre plus ses troupes, chaque
// lecteur de plaisirsCast prend le repli prévu pour un âge sans troupe (les habitants
// de l'âge). Préférence d'affichage, hors save.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { plaisirsCast, tenuesSages, setTenuesSages } from '../plaisirsCast.js';
import { crewSpec } from '../boatCrew.js';

afterEach(() => setTenuesSages(false));

describe('tenues sages', () => {
  it('désactivée par défaut : chaque âge a sa troupe', () => {
    expect(tenuesSages).toBe(false);
    for (let b = 0; b <= 9; b += 1) expect(plaisirsCast(b).girls.length, `âge ${b}`).toBeGreaterThan(0);
  });

  it('cochée : plus aucune troupe, à aucun âge (filles, danseuses, alanguies, gigolos)', () => {
    setTenuesSages(true);
    expect(tenuesSages).toBe(true);
    for (let b = 0; b <= 9; b += 1) expect(plaisirsCast(b), `âge ${b}`).toBe(null);
    setTenuesSages(false);
    expect(plaisirsCast(5).alanguie).toBe('plaisirs-fonte-alanguie');
  });

  it("l'hôtesse d'un bateau de plaisance redevient un marin de l'âge", () => {
    const M = { role: 'pleasure' }, cr = { role: 'hostess', id: 3, pose: 'stand' };
    expect(crewSpec(5, M, cr).name).toMatch(/^plaisirs-/);
    setTenuesSages(true);
    const spec = crewSpec(5, M, cr);
    expect(spec.name).not.toMatch(/^plaisirs-/);
    expect(spec.scale).toBe(null); // celle du jeu d'habitants
  });

  it('retenue hors save (localStorage) et relue au lancement suivant', async () => {
    setTenuesSages(true);
    expect(localStorage.getItem('civ-opt-plaisirs-sages')).toBe('true');
    vi.resetModules();
    const again = await import('../plaisirsCast.js');
    expect(again.tenuesSages).toBe(true);
    expect(again.plaisirsCast(0)).toBe(null);
    again.setTenuesSages(false);
  });
});
