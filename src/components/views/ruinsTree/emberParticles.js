"use strict";

// Particules ambiantes de l'Arbre des Ruines (Phase D) — dessinées en PIXELS à
// la résolution SOURCE de la fresque (canvas .rtp-fx, agrandi ×scale en CSS
// pixelated, cf. décision « pixel, pas de SVG ») :
//   · BRAISES : montent du cratère de la cité morte et de la boule de braise,
//     vacillent, s'éteignent avant la ligne de sol ;
//   · ÉTINCELLES : éclats blancs-chauds qui claquent une fraction de seconde
//     SUR les flammes peintes (points chauds relevés dans l'art même) ;
//   · CENDRES : flocons gris qui tombent sur toute la fresque, d'autant plus
//     nombreux que l'Usure est haute (0 → aucun).
// Cadence basse (~15 fps) assumée : le pas-à-pas chunky EST le style. Coût
// dérisoire (clear + ~110 fillRect sur un 800×400).

import { TREE_ART } from "./anchors.js";
import { FIRE_SPOTS } from "./fireSpots.js";

// Même rampe que le feu peint (scratch/fireRamp.cjs) : les braises sont des
// morceaux de ce feu qui montent, pas un effet posé par-dessus.
const EMBER_COLORS = ["#ffbb63", "#ff9236", "#f04a12"];
const EMBER_DYING = "#8d1510";
const SPARK_HOT = "#fff4e0";  // le cran de cœur de la rampe
const SPARK_WARM = "#ffe0ad";
const ASH_COLOR = "rgba(150, 146, 158, 0.55)";

const EMBER_COUNT = 26;      // braises du cratère
const HEART_EMBERS = 5;      // braises autour de la boule (le cœur respire)
// Étincelles : le compteur est un RÉSERVOIR, pas un nombre à l'écran — chacune
// passe le plus clair de son temps éteinte. Allumées en moyenne : vie / (vie +
// temps mort) ≈ 28 %, soit ~7 éclats simultanés.
const SPARK_COUNT = 26;
const ASH_MAX = 42;          // cendres à usure 1.0

// Zones en coordonnées SOURCE de la fresque (repère art + offset).
const OX = TREE_ART.artOffsetX || 0;
const CRATER = { x0: OX + 70, x1: OX + 250, y0: 300, y1: 372 };
const HEART = { x0: OX + 158, x1: OX + 182, y0: 186, y1: 210 };
const EMBER_DIE_Y = 216;     // les braises s'éteignent vers la ligne de sol
const ASH_DIE_Y = 380;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function spawnEmber(fromHeart) {
  const z = fromHeart ? HEART : CRATER;
  return {
    kind: "ember",
    x: rnd(z.x0, z.x1),
    y: rnd(z.y0, z.y1),
    vy: -rnd(7, 16),                    // monte
    wobble: rnd(0, Math.PI * 2),
    wobbleSpeed: rnd(1.2, 2.6),
    color: pick(EMBER_COLORS),
    size: Math.random() < 0.3 ? 2 : 1,
    life: rnd(3.5, 8),
    age: rnd(0, 3),                     // désynchronise le départ
    fromHeart
  };
}

// Étincelle : posée SUR un pixel chaud de la fresque, elle claque puis s'éteint
// et se rallume ailleurs après un temps mort (sinon le feu grésille en continu
// et le clignotement devient du bruit).
function spawnSpark(lit) {
  const [x, y] = FIRE_SPOTS.length
    ? FIRE_SPOTS[(Math.random() * FIRE_SPOTS.length) | 0]
    : [0, -50];
  return {
    x,
    y,
    age: 0,
    life: rnd(0.2, 0.55),                    // l'éclat lui-même
    wait: lit ? rnd(0, 1.4) : rnd(0.2, 1.7), // temps mort avant le prochain
    big: Math.random() < 0.22
  };
}

function spawnAsh(w, anywhere = false) {
  return {
    kind: "ash",
    x: rnd(0, w),
    // 1re vague : répartie sur toute la hauteur (sinon rien à l'écran avant
    // quelques secondes de chute — et jamais rien sur un onglet caché).
    y: anywhere ? rnd(0, ASH_DIE_Y) : rnd(-30, -2),
    vy: rnd(9, 17),                     // tombe
    vx: rnd(-2.5, 2.5),
    wobble: rnd(0, Math.PI * 2),
    life: rnd(20, 40),
    age: 0
  };
}

export function createEmberField() {
  const w = TREE_ART.w;
  const h = TREE_ART.h;
  const embers = [];
  for (let i = 0; i < EMBER_COUNT; i++) embers.push(spawnEmber(false));
  for (let i = 0; i < HEART_EMBERS; i++) embers.push(spawnEmber(true));
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i++) sparks.push(spawnSpark(true));
  let ashes = [];
  let primed = false;

  function step(dt, usure) {
    const anywhere = !primed;
    primed = true;
    // Braises : montée + vacillement, respawn à l'extinction.
    for (let i = 0; i < embers.length; i++) {
      const p = embers[i];
      p.age += dt;
      p.wobble += p.wobbleSpeed * dt;
      p.y += p.vy * dt;
      p.x += Math.sin(p.wobble) * 3.2 * dt;
      const dieY = p.fromHeart ? p.y - 1 /* jamais par le sol */ : EMBER_DIE_Y;
      if (p.age > p.life || p.y < (p.fromHeart ? HEART.y0 - 26 : dieY)) {
        embers[i] = spawnEmber(p.fromHeart);
      }
    }
    // Étincelles : temps mort, puis éclat, puis on se rallume ailleurs.
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i];
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.age += dt;
      if (p.age > p.life) sparks[i] = spawnSpark(false);
    }
    // Cendres : population proportionnelle à l'Usure.
    const target = Math.round(ASH_MAX * Math.max(0, Math.min(1, usure)));
    while (ashes.length < target) ashes.push(spawnAsh(w, anywhere));
    if (ashes.length > target) ashes = ashes.slice(0, target);
    for (let i = 0; i < ashes.length; i++) {
      const p = ashes[i];
      p.age += dt;
      p.wobble += 1.4 * dt;
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 2.2) * dt;
      if (p.age > p.life || p.y > ASH_DIE_Y) ashes[i] = spawnAsh(w);
    }
  }

  function paint(ctx) {
    ctx.clearRect(0, 0, w, h);
    for (const p of ashes) {
      ctx.fillStyle = ASH_COLOR;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    for (const p of embers) {
      // La braise pâlit en fin de vie (2 crans, pas de fondu lisse : pixel).
      const t = p.age / p.life;
      ctx.fillStyle = t > 0.72 ? EMBER_DYING : p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    // Étincelles par-dessus : blanc au claquement, ambre en retombant.
    for (const p of sparks) {
      if (p.wait > 0) continue;
      const t = p.age / p.life;
      ctx.fillStyle = t < 0.5 ? SPARK_HOT : SPARK_WARM;
      if (p.big && t < 0.5) {
        // Éclat croisé de 1 px de bras — la seule forme lisible à cette taille.
        ctx.fillRect(p.x, p.y - 1, 1, 3);
        ctx.fillRect(p.x - 1, p.y, 3, 1);
      } else {
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }
  }

  return { step, paint };
}
