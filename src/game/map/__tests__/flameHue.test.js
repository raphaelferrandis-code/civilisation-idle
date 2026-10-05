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
  // (Les bandes de flamme des merveilles sont parties avec leurs sprites « de face »
  // le 2026-10-02 : les merveilles sont cuites par le code, docs/PLAN-MERVEILLES.md.)
  ['agents/buildings/watch-fire.png', 450],
  ['agents/buildings/ancestralcult-fire.png', 500],
  // Palier du stade 0. C'est le seul feu du jeu dont la couleur est posée PAR DU
  // CODE : scripts/ancestralCultFire.mjs reprend la silhouette dessinée du petit,
  // la rematérialise à 1,52× et sert la rampe par profondeur, dans les
  // proportions mesurées sur le petit. Si ce classement dérapait hors rampe, rien
  // d'autre ne le dirait. 2619 px mesurés → plancher à la moitié.
  ['agents/buildings/ancestralcult-fire-grand.png', 1200],
  ['agents/buildings/storyteller-fire.png', 900],
  // Le feu RÉELLEMENT affiché au foyer du campement : copie nettoyée de la bande
  // des Conteurs (bloc et étincelles retirés, scripts/pixelsPerdus.mjs) — 1 748 px
  // de rampe mesurés → plancher à la moitié.
  ['agents/buildings/camp-hearth-fire.png', 850],
  ['agents/buildings/mint-forge-fire.png', 450],
  ['agents/buildings/watch-prop.png', 60],
  ['agents/buildings/ancestralcult-prop.png', 45],
  ['agents/buildings/storyteller-prop-fire.png', 150],
  ['agents/buildings/mint-prop-forge.png', 7],
  ['agents/buildings/cult-vesta.png', 12],
  // Braseros des places (et des ponts, des merveilles) : la flamme est posée PAR
  // DU CODE, scripts/plazaBrazierAnim.mjs. Celle de l'antique a passé des mois en
  // #b06a48 / #f2c2a3 — le même feu couleur chair. Mesurés 54 / 77 (statiques) et
  // 411 / 618 (bandes) → planchers à la moitié.
  ['iso/plaza/brazier-antique.png', 27],
  ['iso/plaza/brazier-medieval.png', 38],
  ['iso/plaza/anim/brazier-antique.png', 200],
  ['iso/plaza/anim/brazier-medieval.png', 300],
  // Feux PEINTS des bâtiments-moteur rendus vivants (scripts/sceneLive.mjs) :
  // flammes redessinées sur la rampe, braises de la tour de pierre avivées par
  // elle. Mesurés 282 / 110 / 107 / 423 / 274 → planchers à la moitié.
  ['agents/buildings/cult-vesta-live.png', 140],
  ['agents/buildings/cult-mausoleum-live.png', 55],
  ['agents/buildings/cult-memorial-live.png', 50],
  ['agents/buildings/cult-memorial-grand-live.png', 210],
  ['agents/buildings/watch-stone-live.png', 135],
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

  // 80 PNG décodés par pngjs : sous la charge de la suite complète, elle dépassait
  // les 5 s par défaut de vitest et tombait « au hasard » — un faux rouge qui
  // apprend à ignorer le rouge. Le délai global de vite.config.js (relevé pour la
  // CI) lui suffit, sans délai propre (audit 2026-10-05, TEST-14).
  it('les 80 bandes de torche d\'émeutier brûlent toutes', () => {
    // Le lot le plus exposé à un remap de masse : 5 ères × 2 genres × 8
    // directions. Une seule torche oubliée = un émeutier au flambeau blanc au
    // milieu du cortège.
    const dir = path.join(PUB, 'agents/events');
    // ⚠ Le filtre `-half` n'est PAS décoratif : une cuisson de bandes
    // demi-taille (lot G1 de docs/PLAN-GRILLE-PIXELS.md) déposerait 40 fichiers
    // de plus ici et ferait tomber ce compte. Elle a été essayée le 2026-08-30
    // puis ANNULÉE — mais le filtre reste, pour que la garde survive à la
    // prochaine tentative au lieu de casser sur un dénombrement.
    const files = readdirSync(dir).filter((f) => f.includes('-torch-') && !f.endsWith('-half.png'));
    // 80 + 4 : les bandes diagonales du manifestant moderne à la torche de route
    // (rioter-mod-man-torch, 2026-10-02 ; l'ère moderne n'a pas de femme à torche).
    expect(files.length).toBe(84);
    const cold = files.filter((f) => rampPixels(path.join('agents/events', f)) < 20);
    expect(cold, `torches sans rampe de feu : ${cold.join(', ')}`).toEqual([]);
  });
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
