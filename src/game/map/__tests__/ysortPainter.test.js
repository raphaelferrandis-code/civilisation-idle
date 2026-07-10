import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { frontByPainter, drawGroundAgents } from "../agents.js";

// Y-SORT « peintre » (frontByPainter) : décision passe 1/2 par comparaison des pieds
// de l'agent avec la LIGNE DE BASE des sprites bâtis (CM.buildingInfo, fiches posées
// au recompute). Deux artefacts d'origine (rapport Raph 2026-07-10, capture in-game) :
//   1. rue entre deux rangs de tours → piétons dessinés SUR le toit de la tour sud ;
//   2. piéton longeant le flanc d'une tour → mangé par le débord latéral du sprite.
// Ici on pilote la fonction pure : true = passe 2 (devant), false = passe 1 (derrière),
// null = pas d'info (repli cellulaire de l'appelant).

const T = 20;

// Fiche d'une maison-tour 1×1 à la cellule (gx,gy) : base au bas de sa tuile, sprite
// haut de `h` tuiles (défaut 2.5 — tour d'immeuble typique).
function tower(gx, gy, h = 2.5, clipOnly = false) {
  return [gx * 10000 + gy, {
    x0: gx * T, x1: (gx + 1) * T,
    baseY: (gy + 1) * T, topY: (gy + 1 - h) * T,
    clipOnly,
  }];
}

function setInfo(...recs) {
  CM.buildingInfo = new Map(recs);
}

// Pieds d'un agent au centre de la cellule (gx,gy), + décalages optionnels en px monde.
const feet = (gx, gy, dx = 0, dy = 0) => [(gx + 0.5) * T + dx, (gy + 0.5) * T + dy];

beforeEach(() => {
  CM.TILE = T;
  CM.buildingInfo = null;
});

describe("frontByPainter — tri peintre agents ↔ bâtiments", () => {
  it("sans buildingInfo → null (l'appelant garde le test cellulaire)", () => {
    expect(frontByPainter(...feet(8, 8))).toBe(null);
  });

  it("tour PILE au nord → devant (passe 2, la façade ne rogne plus la tête)", () => {
    setInfo(tower(8, 7));
    expect(frontByPainter(...feet(8, 8))).toBe(true);
  });

  it("RUE ENTRE DEUX RANGS DE TOURS → derrière (fini les piétons debout sur les toits)", () => {
    // Avant : la tour nord donnait « devant » → l'agent était AUSSI dessiné par-dessus
    // la tour sud, dont le sprite (2.5 tuiles) recouvre la rue. Le peintre tranche :
    // la tour sud a sa base plus sud que les pieds → elle passe devant l'agent.
    setInfo(tower(8, 7), tower(8, 9));
    expect(frontByPainter(...feet(8, 8))).toBe(false);
  });

  it("tour au sud TROP BASSE pour recouvrir la rue → la tour nord garde l'agent devant", () => {
    // Hutte d'1 tuile de haut au sud : son sprite ne remonte pas jusqu'aux pieds.
    setInfo(tower(8, 7), tower(8, 9, 1.0));
    expect(frontByPainter(...feet(8, 8))).toBe(true);
  });

  it("LONGEUR DE FLANC : tour sur la MÊME RANGÉE (à l'est) → pas un occulteur", () => {
    // Piéton sur la rue verticale, décalé trottoir vers la tour voisine (est) : sa base
    // n'est qu'à ~0.5 tuile au sud des pieds (< eps 1.0) → pas occulteur ; la colonne de
    // tours continue au NE → rognage de tête → devant. Il marche PAR-DESSUS le débord.
    setInfo(tower(9, 8), tower(9, 7));
    expect(frontByPainter(...feet(8, 8, T * 0.42, 0))).toBe(true);
  });

  it("tour même rangée SANS voisine au nord → devant quand même (anti-avalement du débord)", () => {
    // Même seule, la tour voisine de rangée peut manger le piéton par son débord
    // latéral : base ≈ 0.5 tuile au sud des pieds (< eps) → traitée en « rognage »
    // → passe 2. Un agent hors du couloir de débord (test suivant) reste derrière.
    setInfo(tower(9, 8));
    expect(frontByPainter(...feet(8, 8, T * 0.42, 0))).toBe(true);
  });

  it("même rangée mais SANS recouvrement de colonne (pas de décalage) → derrière", () => {
    setInfo(tower(9, 8));
    expect(frontByPainter(...feet(8, 8))).toBe(false);
  });

  it("pas de recouvrement de colonne (tour au sud 2 colonnes plus loin) → ignorée", () => {
    setInfo(tower(8, 7), tower(10, 9, 3.0));
    expect(frontByPainter(...feet(8, 8))).toBe(true);
  });

  it("bâtiment clipOnly (moteur/district) au sud → n'occulte JAMAIS (statu quo scènes basses)", () => {
    setInfo(tower(8, 7), tower(8, 9, 3.0, true));
    expect(frontByPainter(...feet(8, 8))).toBe(true);
  });

  it("empreinte multi-tuiles : base = rang SUD de l'empreinte, partagée par cellule", () => {
    // Bâtiment 2×2 dont l'empreinte couvre (8..9, 6..7) : base au bas de la rangée 7.
    const rec = { x0: 8 * T, x1: 10 * T, baseY: 8 * T, topY: (8 - 2.5) * T, clipOnly: false };
    setInfo([8 * 10000 + 6, rec], [9 * 10000 + 6, rec], [8 * 10000 + 7, rec], [9 * 10000 + 7, rec]);
    // Agent sous la rangée sud (rangée 8) : base (160) au nord des pieds (170) → devant.
    expect(frontByPainter(...feet(8, 8))).toBe(true);
  });
});

// ── Pipeline complet : drawGroundAgents choisit la bonne PASSE via le peintre ────
// Même harnais espion que ysortCorner.test.js : l'ombre `ellipse` en rgba(0,0,0,0.22)
// signe le rendu d'un piéton (repli vectoriel en node). On vérifie que le split des
// 2 passes suit frontByPainter quand CM.buildingInfo est présent.

function makeRecCtx(log) {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    lineJoin: "miter", globalAlpha: 1, imageSmoothingEnabled: true,
    canvas: { width: 800, height: 600 },
  };
  const noop = () => {};
  for (const m of [
    "beginPath", "moveTo", "lineTo", "arc", "closePath", "fill", "stroke", "save",
    "restore", "translate", "rotate", "scale", "quadraticCurveTo", "arcTo", "rect",
    "roundRect", "strokeRect", "fillRect", "fillText", "drawImage", "setTransform", "clip",
  ]) ctx[m] = noop;
  ctx.ellipse = () => { if (ctx.fillStyle === "rgba(0,0,0,0.22)") log.push("cit"); };
  return ctx;
}

function classifyPainter(infoRecs, gx, gy, lox = 0) {
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.TILE = T; CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  CM.layout = { counts: { eraBand: 2, eraIndex: 5 } };
  CM.buildingCells = new Set();               // le peintre doit décider SEUL (pas le repli)
  CM.buildingInfo = new Map(infoRecs);
  CM.fountainCells = null; CM.plazaPropCells = null;
  CM.walkRoadList = [{ gx, gy }];
  CM.walkRoadSet = { has: () => true };
  CM.globalBubbleCooldown = 999;
  CM.vehicles = [];
  const p = {
    gx, gy, x: (gx + 0.5) * T, y: (gy + 0.5) * T,
    tx: (gx + 0.5) * T, ty: (gy + 0.5) * T,
    pauseT: 999, speed: 10, phase: 0, dir: 2, charType: 0, skinVariant: 0, fade: 1,
    tox: lox, toy: 0, lox, loy: 0, col: "#8a7a5a", skin: "#e0b890", hat: null,
    thoughtType: null, thoughtTimer: 0,
  };
  CM.citizens = [p];
  const behindLog = []; CM.ctx = makeRecCtx(behindLog);
  drawGroundAgents(0.016, 0, false);
  const frontLog = []; CM.ctx = makeRecCtx(frontLog);
  drawGroundAgents(0, 0, true);
  CM.buildingInfo = null;                     // ne pas fuiter vers les autres tests
  const behind = behindLog.includes("cit"), front = frontLog.includes("cit");
  return front ? "front" : behind ? "behind" : "none";
}

describe("drawGroundAgents — split de passes piloté par le peintre", () => {
  it("rue entre deux rangs de tours → passe 1 (recouvert par la tour sud)", () => {
    expect(classifyPainter([tower(8, 7), tower(8, 9)], 8, 8)).toBe("behind");
  });

  it("tour au nord seulement → passe 2 (devant)", () => {
    expect(classifyPainter([tower(8, 7)], 8, 8)).toBe("front");
  });

  it("longeur de flanc (tour même rangée, penché dessus) → passe 2 (plus avalé)", () => {
    expect(classifyPainter([tower(9, 8)], 8, 8, T * 0.42)).toBe("front");
  });
});
