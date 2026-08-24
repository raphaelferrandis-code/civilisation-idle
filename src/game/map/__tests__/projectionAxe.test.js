// LE TROISIÈME AXE DE LA PROJECTION — et le seul peintre qui s'en sert.
//
// `worldToScreen(x, y, wz = 0)` est né le 2026-08-23 pour le chantier du relief, lequel
// a été CLOS par Raph le lendemain (cf. l'en-tête de `docs/PLAN-RELIEF.md`). L'axe, lui,
// reste — parce qu'il ne servait pas qu'au relief : il a permis de retirer la plus
// vieille rustine d'altitude du projet, le dos d'âne du pont.
//
// Avant lui, TOUTE altitude était une retouche du `y` d'écran posée après la projection,
// et il fallait s'en souvenir dans CHAQUE consommateur. Le pont en avait six, dont deux
// que mon propre recensement à la main avait manqués — c'est `no-undef` qui les a
// trouvés. Un axe rend l'oubli impossible : on ne peut plus projeter sans dire à quelle
// hauteur.
//
// Ces gardes tiennent ce qui reste de vrai après la fermeture du chantier.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('projection — le troisième axe', () => {
  it('est un NO-OP quand personne ne passe d altitude', () => {
    // La garantie qui a rendu la migration sûre, et qui la rend encore inoffensive
    // maintenant que le relief est parti : les ~107 appels qui ignorent le 3e argument
    // rendent exactement ce qu'ils rendaient avant.
    const src = SRC('iso/projection.js');
    expect(src).toMatch(/export function worldToScreen\(wx, wy, wz = 0\)/);
    expect(src).toMatch(/- wz \* z/);
  });
});

describe('pont — le dos d âne passe par l axe', () => {
  it('le lift rend des px MONDE : le zoom a quitté son calcul', () => {
    const src = SRC('iso/isoBridge.js');
    const i = src.indexOf('export function bridgeLiftWorld');
    const j = src.indexOf('export function bridgeLiftScreen');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    // La forme d'avant finissait par `sm * hump * kpx * CM.cam.zoom` — l'écran DANS le
    // calcul. Le corps ne doit plus voir le zoom du tout : c'est ce qui rend le lift
    // composable avec n'importe quelle autre altitude.
    expect(src.slice(i, j)).not.toContain('cam.zoom');
  });

  it('plus AUCUN peintre ne corrige le y après coup', () => {
    for (const f of ['iso/isoUnits.js', 'agents.js']) {
      expect(SRC(f)).not.toMatch(/\.y -= bridgeLift/);
    }
  });

  it('les SIX sites passent le lift en 3e argument de la projection', () => {
    // Véhicule, bête de trait, pousseur, émeutier, piéton du tri peintre, et l'ancre de
    // bulle d'agents.js (partagée avec le hit-test du clic). Le compte est verrouillé :
    // un site qui disparaîtrait sans raison, ou un nouveau qui reviendrait à la rustine,
    // fait tomber ce test.
    const n = (SRC('iso/isoUnits.js').match(/worldToScreen\([^;]*bridgeLiftWorld\(/g) || []).length
      + (SRC('agents.js').match(/projWorldToScreen\([^;]*bridgeLiftWorld\(/g) || []).length;
    expect(n).toBe(6);
  });

  it('la variante ÉCRAN ne survit que pour la sonde', () => {
    // `bridgeLiftScreen` reste parce qu'on MESURE en px d'écran sur une capture. Aucun
    // peintre ne doit s'en servir : ce serait la rustine qui revient par la fenêtre.
    expect(SRC('iso/isoBridge.js')).toMatch(/window\.__bridgeLift = \(wx, wy\) => bridgeLiftScreen/);
    for (const f of ['iso/isoUnits.js', 'agents.js']) {
      expect(SRC(f)).not.toContain('bridgeLiftScreen');
    }
  });
});
