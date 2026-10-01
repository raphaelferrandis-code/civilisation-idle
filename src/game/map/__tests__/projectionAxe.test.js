// LE TROISIÈME AXE DE LA PROJECTION.
//
// `worldToScreen(x, y, wz = 0)` est né le 2026-08-23 pour le chantier du relief, lequel
// a été CLOS par Raph le lendemain (cf. l'en-tête de `docs/PLAN-RELIEF.md`). L'axe, lui,
// reste : toute altitude passe par lui, jamais par une retouche du `y` d'écran posée
// après la projection (il fallait s'en souvenir dans CHAQUE consommateur — le vieux dos
// d'âne du pont en avait six, dont deux que le recensement à la main avait manqués).
//
// Depuis la refonte du pont (2026-10-01, docs/PLAN-PONTS.md) le tablier est PLAT, au ras
// de la route : plus aucun traverseur n'est soulevé.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('projection — le troisième axe', () => {
  it('est un NO-OP quand personne ne passe d altitude', () => {
    // Les appels qui ignorent le 3e argument rendent exactement ce qu'ils rendaient
    // avant l'axe.
    const src = SRC('iso/projection.js');
    expect(src).toMatch(/export function worldToScreen\(wx, wy, wz = 0\)/);
    // Depuis la v2 du relief (2026-08-24), LE TERRAIN passe par l'axe DANS la
    // formule : terrainZ rend 0 à TERRAIN.amp = 0 — le no-op reste garanti par
    // la molette, plus par l'absence de terrain.
    expect(src).toMatch(/- \(wz \+ terrainZ\(wx, wy\)\) \* z/);
  });
});

describe('pont — tablier plat, plus de lift', () => {
  it('aucun peintre ne soulève les traverseurs, ni par l axe ni après coup', () => {
    for (const f of ['iso/isoUnits.js', 'agents.js', 'iso/isoBridge.js']) {
      expect(SRC(f)).not.toMatch(/bridgeLift/);
      expect(SRC(f)).not.toMatch(/\.y -= bridge/);
    }
  });
});
