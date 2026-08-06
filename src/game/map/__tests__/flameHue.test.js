// LE FEU N'A PAS LE DROIT DE PÂLIR.
//
// Le 2026-07-01, `remapPalette.mjs --dir public/pixelart/agents` a rabattu tous
// les sprites sur le cœur de la palette maître pour tuer le jaune. Le cœur ne
// contient aucun rouge saturé : les quatre feux animés (forge, conteurs, culte,
// tour de guet) et les torches des émeutiers sont donc partis sur les rampes
// bois / argile / PEAU. La flamme de la tour de guet a passé plusieurs semaines
// peinte en #f2c2a3 (skin-lit) — un feu couleur chair. Rien ne l'a signalé : ni
// le lint, ni les 900 tests, ni les captures diurnes.
//
// D'où cette garde. Elle ne compare RIEN à une valeur enregistrée depuis les
// sprites (ce serait décoratif : régénérer les PNG déplacerait la référence avec
// eux). Elle confronte les pixels à deux absolus extérieurs :
//   1. la rampe public/pixelart/fire-ramp.json doit rester du rouge feu —
//      teinte sous 45°, saturation forte ;
//   2. chaque sprite de feu doit porter cette rampe, en quantité.
// Rejouer le remap sur ces fichiers fait tomber la seconde ; adoucir la DA du
// feu en pastel fait tomber la première.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

import { FLAME_COL, FIRE_INK } from '../flameGlow.js';
import { ANIM_FIRE_CORES } from '../cityEngineSprites.js';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/pixelart');
const RAMP = JSON.parse(readFileSync(path.join(PUB, 'fire-ramp.json'), 'utf8'));

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Teinte en degrés et saturation HSL — le vocabulaire dans lequel « feu pâlot »
// veut dire quelque chose : une flamme délavée garde sa teinte orange mais perd
// sa saturation (skin-lit #f2c2a3 = 24°, mais 75 % de clarté et 64 % de sat).
function hsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0));
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  const l = (mx + mn) / 2;
  return { h, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

// Planchers VOLONTAIREMENT bas (mesuré ÷ 2 environ, arrondi) : ils doivent tomber
// si un remap efface la rampe, pas grogner parce qu'un sprite a été redessiné
// avec deux flammes de moins.
const FIRE_SPRITES = [
  ['wonders/flame-small.png', 900],
  ['wonders/flame-large.png', 3000],
  ['wonders/pop1m-flame-spiral.png', 4000],
  ['agents/buildings/watch-fire.png', 450],
  ['agents/buildings/ancestralcult-fire.png', 500],
  // Palier du stade 0. C'est le seul feu du jeu dont la couleur est posée PAR DU
  // CODE : scripts/ancestralCultFire.mjs reprend la silhouette dessinée du petit,
  // la rematérialise à 1,52× et sert la rampe par profondeur, dans les
  // proportions mesurées sur le petit. Si ce classement dérapait hors rampe, rien
  // d'autre ne le dirait. 2619 px mesurés → plancher à la moitié.
  ['agents/buildings/ancestralcult-fire-grand.png', 1200],
  ['agents/buildings/storyteller-fire.png', 900],
  ['agents/buildings/mint-forge-fire.png', 450],
  ['agents/buildings/watch-prop.png', 60],
  ['agents/buildings/ancestralcult-prop.png', 45],
  ['agents/buildings/storyteller-prop-fire.png', 150],
  ['agents/buildings/mint-prop-forge.png', 7],
  ['agents/buildings/cult-vesta.png', 12],
  // Mausolée rang V : ~100 braseros CUITS dans le sprite, dont 57 seulement sont
  // recouverts par un overlay animé. Repeindre les seuls overlays laissait donc
  // une moitié du monument en or à côté de l'autre en rouge.
  ['wonders/dynasty1-t5.png', 2000],
];

const rampSet = new Set(RAMP.steps.map((s) => s.hex.toLowerCase()));
function rampPixels(rel) {
  const png = PNG.sync.read(readFileSync(path.join(PUB, rel)));
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    const hex = '#' + [png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    if (rampSet.has(hex)) n += 1;
  }
  return n;
}

describe('rampe du feu — rouge feu, pas ambre pâlot', () => {
  it('chaque pas de la rampe est chaud et saturé', () => {
    expect(RAMP.steps.length).toBeGreaterThanOrEqual(6);
    for (const step of RAMP.steps) {
      const [r, g, b] = hexToRgb(step.hex);
      const { h, s, l } = hsl(r, g, b);
      expect(h, `${step.name} ${step.hex} : teinte hors du feu`).toBeLessThanOrEqual(45);
      // Le cœur incandescent est le SEUL pas autorisé à être clair et donc peu
      // saturé en apparence ; tous les autres doivent mordre.
      if (l < 0.8) expect(s, `${step.name} ${step.hex} : délavé`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('la masse de la rampe est rouge, pas orangée', () => {
    // Sans ceci, une rampe entièrement orange (teintes 30-45°) passerait le test
    // précédent : c'est exactement le feu d'avant, en plus saturé.
    const reds = RAMP.steps.filter((s) => hsl(...hexToRgb(s.hex)).h <= 20);
    expect(reds.length, 'aucun vrai rouge dans la rampe').toBeGreaterThanOrEqual(3);
  });
});

describe('sprites de feu — la rampe est bien posée dessus', () => {
  for (const [rel, floor] of FIRE_SPRITES) {
    it(`${rel} porte au moins ${floor} px de rampe`, () => {
      expect(rampPixels(rel)).toBeGreaterThanOrEqual(floor);
    });
  }

  // Timeout explicite : 80 PNG décodés par pngjs, c'est la garde la plus chère du
  // dépôt. Sous la charge de la suite complète elle dépassait les 5 s par défaut
  // et tombait « au hasard » — un faux rouge qui apprend à ignorer le rouge.
  it('les 80 bandes de torche d\'émeutier brûlent toutes', () => {
    // Le lot le plus exposé à un remap de masse : 5 ères × 2 genres × 8
    // directions. Une seule torche oubliée = un émeutier au flambeau blanc au
    // milieu du cortège.
    const dir = path.join(PUB, 'agents/events');
    const files = readdirSync(dir).filter((f) => f.includes('-torch-'));
    expect(files.length).toBe(80);
    const cold = files.filter((f) => rampPixels(path.join('agents/events', f)) < 20);
    expect(cold, `torches sans rampe de feu : ${cold.join(', ')}`).toEqual([]);
  }, 30000);
});

describe('lueurs du code — accordées à la rampe', () => {
  it('la teinte par défaut d\'un feu est celle du fire-ramp.json', () => {
    expect(FLAME_COL).toBe(RAMP.glow.core);
  });

  it('les encres vectorielles sont des pas de la rampe', () => {
    for (const [k, hex] of Object.entries(FIRE_INK)) {
      expect(rampSet.has(hex.toLowerCase()), `FIRE_INK.${k} = ${hex} hors rampe`).toBe(true);
    }
  });

  it('chaque foyer de bande éclaire chaud, jamais ambre pâle', () => {
    for (const [key, core] of Object.entries(ANIM_FIRE_CORES)) {
      const [r, g, b] = core.col.split(',').map(Number);
      const { h, s } = hsl(r, g, b);
      expect(h, `${key} : lueur trop froide`).toBeLessThanOrEqual(32);
      expect(s, `${key} : lueur délavée`).toBeGreaterThanOrEqual(0.9);
    }
  });
});
