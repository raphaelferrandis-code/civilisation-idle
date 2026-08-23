// Dallage du parvis des merveilles (drawWonderPaving).
//
// Régression 2026-07-24 (« qu'est-ce qu'on peut faire pour avoir un rendu de
// place sans l'effet carré des plaques au sol ? ») : le parvis dessinait son
// dallage AU PAS DE LA CELLULE — un joint le long de deux arêtes de chaque
// losange, plus un damier ±5 % indexé sur (gx+gy)&1. Une cellule vaut un lot de
// maison : à cette période l'œil lit des plaques, pas un dallage.
//
// Ce qui remplace ne se voit sur AUCUNE assertion de couleur, d'où ce test : la
// géométrie de l'appareillage. Deux invariants, et un seul compte vraiment —
// le DÉCALAGE d'une rangée sur deux, indexé sur le rang ABSOLU. Sans lui les
// joints de bout se réalignent en maille croisée et on retombe sur un
// quadrillage ; indexé sur le rang LOCAL (dk au lieu de gy * div + dk) il se
// remet à zéro à chaque cellule et le quadrillage revient au pas de la grille,
// exactement le défaut qu'on retire. `pave: 3` (impair) est choisi ici parce
// que c'est le cas où rang local et rang absolu DIVERGENT : à pas pair les deux
// coïncident et le test ne mordrait pas.
//
// ⚠ LE DALLAGE PROCÉDURAL EST ÉTEINT PAR DÉFAUT depuis le 2026-07-28 : le parvis
// a reçu sa propre tuile PixelLab (`iso-wonder`, mosaïque), qui porte ses joints
// dans l'art — deux appareillages superposés faisaient une trame double, donc
// `WONDER_GROUND.joint` vaut 0. Le tracé reste, et ce test le garde vivant : il
// ALLUME le knob dans son montage, comme il allumait déjà `pave: 3`. Sans ça les
// quatre invariants de géométrie passaient au vert sur zéro segment dessiné.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Le PEINTRE du dallage est resté dans isoRenderer (il dépend de la machinerie de
// tuiles) ; sa CONFIG est partie dans isoWonderGround.js le 2026-08-23, parce que
// la forêt sauvage la lit aussi et ne pouvait pas importer depuis isoRenderer.
import { drawWonderPaving } from '../iso/isoWonderGround.js';
import { WONDER_GROUND } from '../iso/isoWonderGround.js';

const HW = 64, HH = 32;                 // demi-losange écran (2:1), valeurs rondes
const PX = 500, PY = 300;               // coin NORD de la cellule de référence
const DIV = 3;
const JOINT = 0.07;                     // valeur d'avant l'extinction : le dallage tracé

// ctx d'enregistrement : on ne garde que les couples moveTo/lineTo.
function recorder() {
  const segs = [];
  let cur = null;
  return {
    segs,
    strokeStyle: '', lineWidth: 0,
    beginPath() { cur = null; },
    moveTo(x, y) { cur = [x, y]; },
    lineTo(x, y) { if (cur) segs.push({ ax: cur[0], ay: cur[1], bx: x, by: y }); cur = null; },
    stroke() {},
  };
}

// Écran → indices de DALLE absolus. Inverse exact de la projection du dessin
// (sx = px + (dj−dk)·ex, sy = py + (dj+dk)·ey) : le test relit donc la même
// géométrie que le rendu, pas une copie approchée.
function toSlab(gx, gy, x, y, div) {
  const ex = HW / div, ey = HH / div;
  const a = (x - PX) / ex, b = (y - PY) / ey;
  return { j: gx * div + (b + a) / 2, k: gy * div + (b - a) / 2 };
}

function paveCell(gx, gy, div) {
  const ctx = recorder();
  // px/py du coin nord : +1 cellule en x monde = (+hw, +hh), en y = (−hw, +hh).
  const px = PX + (gx * HW) - (gy * HW), py = PY + (gx * HH) + (gy * HH);
  const save = { px: PX, py: PY };
  // toSlab est ancré sur (PX, PY) = cellule (0, 0) : on lui passe la cellule
  // réelle, la conversion recolle les indices absolus.
  drawWonderPaving(ctx, gx, gy, px, py, HW, HH);
  return ctx.segs.map((s) => ({
    a: toSlab(0, 0, s.ax, s.ay, div),
    b: toSlab(0, 0, s.bx, s.by, div),
    _: save,
  }));
}

const near = (v, t) => Math.abs(v - t) < 1e-6;
const isHalfInteger = (v) => near(Math.abs(v - Math.round(v)), 0.5);

beforeEach(() => { WONDER_GROUND.pave = DIV; WONDER_GROUND.joint = JOINT; });
afterEach(() => { WONDER_GROUND.pave = 4; WONDER_GROUND.joint = 0; });   // défauts réels

describe('dallage du parvis : appareillage en repère monde', () => {
  it('ne trace aucun joint au pas de la cellule (le défaut retiré)', () => {
    const segs = paveCell(0, 0, DIV);
    expect(segs.length).toBeGreaterThan(0);
    // Un joint « de cellule » relierait deux SOMMETS du losange : dans le repère
    // dalle, un segment de longueur `div` en k (arête NO→SO) ou de longueur nulle.
    // Les joints de bout doivent tous faire exactement UNE dalle de haut.
    const cross = segs.filter((s) => near(s.a.j, s.b.j));
    expect(cross.length).toBeGreaterThan(0);
    for (const s of cross) expect(near(Math.abs(s.b.k - s.a.k), 1)).toBe(true);
  });

  it('décale une rangée sur deux d une demi-dalle (sinon : maille croisée)', () => {
    const cross = paveCell(0, 0, DIV).filter((s) => near(s.a.j, s.b.j));
    for (const s of cross) {
      const k = Math.min(s.a.k, s.b.k);          // rang du bandeau
      const pair = Math.round(k) % 2 === 0;
      expect(pair ? near(s.a.j, Math.round(s.a.j)) : isHalfInteger(s.a.j)).toBe(true);
    }
  });

  it('le décalage suit le rang ABSOLU : il ne se remet pas à zéro d une cellule à l autre', () => {
    // Cellule (0,1) : ses rangs sont 3, 4, 5 → le rang 3 est IMPAIR, donc décalé.
    // Un décalage indexé sur le rang local (0,1,2) le rendrait pair = non décalé,
    // et le raccord avec la cellule du dessus casserait pile sur la grille.
    const cross = paveCell(0, 1, DIV).filter((s) => near(s.a.j, s.b.j));
    const rang3 = cross.filter((s) => near(Math.min(s.a.k, s.b.k), 3));
    expect(rang3.length).toBe(DIV);
    for (const s of rang3) expect(isHalfInteger(s.a.j)).toBe(true);
  });

  it('les rangs longs se raboutent d une cellule à la suivante (aucun trou)', () => {
    const rows = (gx) => paveCell(gx, 0, DIV).filter((s) => near(s.a.k, s.b.k));
    const r0 = rows(0), r1 = rows(1);
    expect(r0.length).toBe(DIV);
    // Le rang k=0 de la cellule 0 finit exactement là où celui de la cellule 1
    // commence : les joints longs forment une ligne continue sur tout le parvis.
    const end0 = Math.max(...r0.filter((s) => near(s.a.k, 0)).map((s) => Math.max(s.a.j, s.b.j)));
    const start1 = Math.min(...r1.filter((s) => near(s.a.k, 0)).map((s) => Math.min(s.a.j, s.b.j)));
    expect(near(end0, start1)).toBe(true);
  });

  it('chaque joint interne est tracé UNE fois : les cellules ne redessinent pas les arêtes de la voisine', () => {
    // La cellule ne trace ni son arête SO (rang div) ni ses joints de bout de
    // colonne div : ils appartiennent à la cellule suivante. Sans cette règle le
    // trait partagé serait tracé deux fois et ressortirait plus sombre — soit
    // une grille au pas de la cellule, remise par la porte de derrière.
    const segs = paveCell(0, 0, DIV);
    for (const s of segs) {
      expect(Math.min(s.a.k, s.b.k)).toBeLessThan(DIV);
      expect(Math.min(s.a.j, s.b.j)).toBeLessThan(DIV);
    }
    expect(segs.length).toBe(DIV + DIV * DIV);   // div rangs + div² joints de bout
  });

  it('se tait quand la dalle passe sous ~5 px écran (trame illisible = gris sale)', () => {
    const ctx = recorder();
    drawWonderPaving(ctx, 0, 0, PX, PY, 6, 3);   // dalle = 2·6/3 = 4 px
    expect(ctx.segs.length).toBe(0);
  });

  it('se tait si le joint est mis à zéro (knob de retour)', () => {
    const saved = WONDER_GROUND.joint;
    WONDER_GROUND.joint = 0;
    const ctx = recorder();
    drawWonderPaving(ctx, 0, 0, PX, PY, HW, HH);
    WONDER_GROUND.joint = saved;
    expect(ctx.segs.length).toBe(0);
  });
});
