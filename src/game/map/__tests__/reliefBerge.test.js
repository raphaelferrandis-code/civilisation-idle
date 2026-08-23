// Gardes du LOT 1 du relief (docs/PLAN-RELIEF.md) : l'enfoncement de la nappe.
//
// La recette d'acceptation du lot demande une garde PURE, sans canvas : « la face de
// berge naturelle et le mur de quai ont la même hauteur au sample de jonction ». Elle
// est ici, et elle porte sur la SOURCE UNIQUE dont les deux dérivent — c'est ce qui la
// rend vraie par construction plutôt que par réglage, et c'est cela qu'il faut
// verrouiller : le jour où quelqu'un redonne au mur une hauteur à lui, ce test tombe.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CM } from '../layout.js';
import { RELIEF, reliefUnit, waterSinkPx, reliefKey } from '../iso/isoRelief.js';

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('relief — l unité et la profondeur', () => {
  beforeEach(() => { RELIEF.water = 0; CM.cam.zoom = 1; });

  it('l unité est le QUART DE TUILE, et rien d autre', () => {
    // §2.1 du plan, non re-litigable : une marche qui n'est pas un multiple entier de
    // T/4 rouvre la couture entre losanges. On verrouille le diviseur.
    expect(reliefUnit()).toBe(CM.TILE / 4);
  });

  it('à 0, tout est STRICTEMENT l état d avant', () => {
    // Le défaut doit être un no-op parfait : aucun décalage, et une clé de bake vide
    // pour qu'aucun cache existant ne soit jeté.
    RELIEF.water = 0;
    expect(waterSinkPx()).toBe(0);
    expect(reliefKey()).toBe('');
  });

  it('la profondeur est un ENTIER d unités, mise à l échelle du zoom', () => {
    RELIEF.water = 3; CM.cam.zoom = 1;
    expect(waterSinkPx()).toBe(3 * reliefUnit());
    CM.cam.zoom = 0.5;
    expect(waterSinkPx()).toBe(3 * reliefUnit() * 0.5);
    // Une profondeur fractionnaire est tronquée, jamais honorée : c'est la garde de
    // l'unité (un demi-pas rouvrirait la couture).
    RELIEF.water = 2.7; CM.cam.zoom = 1;
    expect(waterSinkPx()).toBe(2 * reliefUnit());
  });

  it('la clé de bake change avec la profondeur', () => {
    // Piège n°1 du plan : sans ça le sol resterait cuit à l'ancienne profondeur.
    RELIEF.water = 2; const a = reliefKey();
    RELIEF.water = 3; const b = reliefKey();
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });
});

describe('relief — la marche a UNE seule hauteur', () => {
  // ⚠ LA GARDE DEMANDÉE PAR LE PLAN. Le mur de quai et la face de berge naturelle
  // doivent avoir la même hauteur à leur jonction, sinon la berge fait une marche
  // d'escalier là où le quai s'arrête. Plutôt que de comparer deux nombres calculés
  // (ce qui ne dirait rien du jour où l'un des deux change de source), on verrouille
  // le fait qu'ils LISENT LA MÊME FONCTION.
  it('le parement de quai dérive de waterSinkPx, pas d une constante d ère', () => {
    const src = SRC('quaysAndRiot.js');
    expect(src).toMatch(/const wh = waterSinkPx\(\) \|\|/);
  });

  it('la face de berge naturelle est bornée par le bord d eau descendu', () => {
    // Elle ne porte AUCUNE hauteur propre : elle est tendue entre le lit peint et le
    // bord d'eau, donc elle vaut l'enfoncement par géométrie. On verrouille les deux
    // extrémités, c'est ce qui rend l'égalité vraie sans réglage.
    const src = SRC('iso/isoRiver.js');
    expect(src).toContain("buildEdges('wave', false)");
    expect(src).toContain("buildEdges('base', false)");
    // …et le bord d'eau est projeté À SON ALTITUDE, le lit peint à zéro.
    expect(src).toMatch(/mode !== 'base' \? waterZ\(\) : 0/);
  });

  // ⚠⚠ CETTE GARDE A MORDU LE JOUR MÊME, et c'est pour ça qu'elle vaut. Elle disait
  // d'abord `q.y += waterSinkPx()` — la RUSTINE. Quand la projection a reçu son
  // troisième axe et que le fleuve y est passé, elle est tombée : le mécanisme avait
  // changé sous elle. Reformulée sur la forme nouvelle, elle verrouille désormais
  // l'invariant FORT — une position se projette avec son altitude, elle ne se corrige
  // pas après coup.
  it('le fleuve projette AVEC son altitude, il ne corrige plus le y après coup', () => {
    const src = SRC('iso/isoRiver.js');
    // Plus une seule retouche de `y` par le décalage d'eau : l'axe s'en charge.
    expect(src).not.toMatch(/\.y \+= (sink|waterSinkPx\(\))/);
    // Les trois projections du fleuve passent leur altitude — le ruban (ses deux
    // bords en un seul `wz`), le contour d'île, et les rives du bas-fond.
    // ⚠ Ne PAS écrire `worldToScreen\([^)]*waterZ\(\)` : `[^)]*` s'arrête à la première
    // parenthèse, or `waterZ()` en contient une. Le motif ne pouvait pas matcher, et
    // c'est la garde qui était fausse, pas le code — deuxième fois de la journée qu'un
    // regex trop malin me fait accuser le mauvais coupable.
    const appels = (src.match(/\bwaterZ\(\)/g) || []).length;
    expect(appels).toBeGreaterThanOrEqual(3);
  });

  it('l axe est un NO-OP quand personne ne passe d altitude', () => {
    // La garantie qui rend la migration sûre : les 96 appels qui ignorent le 3e
    // argument doivent rendre exactement ce qu'ils rendaient avant.
    const src = SRC('iso/projection.js');
    expect(src).toMatch(/export function worldToScreen\(wx, wy, wz = 0\)/);
    expect(src).toMatch(/- wz \* z/);
  });
});

describe('relief — le pont est passé par l axe', () => {
  // Le dos d'âne du pont sprite était la PLUS ANCIENNE rustine d'altitude du projet,
  // et le modèle de toutes les suivantes : projeter au sol, puis retrancher une
  // hauteur d'écran du `y`. Six peintres la portaient, chacun devant se souvenir de
  // l'appliquer. Migré le 2026-08-23, il devient la démonstration que l'axe suffit —
  // ces gardes existent pour que personne ne rouvre le chemin d'avant.

  it('le lift rend des px MONDE : le zoom a quitté son calcul', () => {
    const src = SRC('iso/isoBridge.js');
    const i = src.indexOf('export function bridgeLiftWorld');
    const j = src.indexOf('export function bridgeLiftScreen');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    // La forme d'avant finissait par `sm * hump * kpx * CM.cam.zoom` — l'écran DANS
    // le calcul. Le corps ne doit plus voir le zoom du tout : c'est ce qui rend le
    // lift composable avec n'importe quelle autre altitude.
    expect(src.slice(i, j)).not.toContain('cam.zoom');
  });

  it('plus AUCUN peintre ne corrige le y après coup', () => {
    for (const f of ['iso/isoUnits.js', 'agents.js']) {
      expect(SRC(f)).not.toMatch(/\.y -= bridgeLift/);
    }
  });

  it('les SIX sites passent le lift en 3e argument de la projection', () => {
    // Véhicule, bête de trait, pousseur, émeutier, piéton du tri peintre, et l'ancre
    // de bulle d'agents.js (partagée avec le hit-test du clic). Le compte est verrouillé :
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
