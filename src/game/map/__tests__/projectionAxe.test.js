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
//
// ⚠ Gardes de RÉSULTAT depuis l'audit 2026-10-05 (TEST-11) : elles lisaient la signature
// et la formule dans le TEXTE de projection.js, au caractère près — un reformatage les
// cassait sans que rien ne change. On vérifie ce que la projection REND, avec et sans
// altitude. (Le relief de terrain, qui s'ajoutait à l'axe, est parti le 2026-10-06 —
// audit MORT-14 : sa garde est partie avec lui, le sol est à l'altitude 0.)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CM } from '../layout.js';
import { worldToScreen, ISO_X, ISO_Y } from '../iso/projection.js';

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PTS = [[0, 0], [64, 32], [-96, 160], [17, 5]];

let saved;
beforeEach(() => {
  saved = { cam: CM.cam, cw: CM.cw, ch: CM.ch };
  Object.assign(CM, { cam: { x: 40, y: -24, zoom: 2 }, cw: 800, ch: 600 });
});
afterEach(() => {
  Object.assign(CM, saved);
});

describe('projection — le troisième axe', () => {
  it('est un NO-OP quand personne ne passe d altitude', () => {
    // Les appels qui ignorent le 3e argument rendent exactement ce qu'ils rendaient
    // avant l'axe : le losange plan.
    const z = CM.cam.zoom;
    for (const [wx, wy] of PTS) {
      const dx = wx - CM.cam.x, dy = wy - CM.cam.y;
      expect(worldToScreen(wx, wy)).toEqual({ x: (dx - dy) * ISO_X * z + CM.cw / 2, y: (dx + dy) * ISO_Y * z + CM.ch / 2 });
      expect(worldToScreen(wx, wy, 0)).toEqual(worldToScreen(wx, wy));
    }
  });

  it('une altitude ne fait que MONTER le point, de wz × zoom', () => {
    const z = CM.cam.zoom;
    for (const [wx, wy] of PTS) {
      const sol = worldToScreen(wx, wy), haut = worldToScreen(wx, wy, 7);
      expect(haut.x).toBe(sol.x);
      expect(haut.y).toBeCloseTo(sol.y - 7 * z, 9);
    }
  });
});

// Un symbole RETIRÉ qui ne doit pas revenir : aucun test de résultat ne voit une
// retouche qui n'existe plus. Lu dans le source, mais sans dépendre de sa mise en forme.
describe('pont — tablier plat, plus de lift', () => {
  it('aucun peintre ne soulève les traverseurs, ni par l axe ni après coup', () => {
    for (const f of ['iso/isoUnits.js', 'agents.js', 'iso/isoBridge.js']) {
      expect(SRC(f)).not.toMatch(/bridgeLift/);
      expect(SRC(f)).not.toMatch(/\.y\s*-=\s*bridge/);
    }
  });
});
