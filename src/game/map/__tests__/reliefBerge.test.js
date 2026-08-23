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
    // et le bord d'eau descend, le lit peint non
    expect(src).toMatch(/if \(mode !== 'base'\) q\.y \+= waterSinkPx\(\)/);
  });
});
