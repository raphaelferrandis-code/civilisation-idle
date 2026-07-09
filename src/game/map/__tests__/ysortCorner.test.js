import { describe, it, expect } from "vitest";

import { CM } from "../layout.js";
import { drawGroundAgents } from "../agents.js";

// Vérifie le Y-SORT piéton ↔ bâtiment EN COIN DE RUE. Le tri classe un piéton « devant » (2e
// passe, dessiné PAR-DESSUS le blit des bâtiments pour ne pas être rogné) quand un bâtiment
// occupe le rang NORD de sa case. Avant le fix, on ne testait QUE la case pile au nord (gy-1) ;
// en coin, cette case est l'autre rue (route) et c'est un bâtiment EN DIAGONALE (NO/NE) qui
// rogne la tête → piéton classé « derrière » → recouvert. Le fix teste aussi la diagonale du
// côté où le sprite déborde (décalage-trottoir p.lox). On stimule le vrai rendu (repli vectoriel
// en node) avec un ctx espion : l'ombre au sol `ellipse` en "rgba(0,0,0,0.22)" = un piéton dessiné.

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

// Renvoie la passe dans laquelle le piéton (case gx,gy ; décalage latéral lox) est dessiné :
// "front" (2e passe, devant les bâtiments) ou "behind" (1re passe). buildingKeys = cases
// bâties ("gx,gy"). TILE=20, caméra centrée → le piéton est à l'écran.
function classify(buildingKeys, gx, gy, lox) {
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.TILE = 20; CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  CM.layout = { counts: { eraBand: 2, eraIndex: 5 } };
  CM.buildingCells = new Set(buildingKeys);
  CM.fountainCells = null; CM.plazaPropCells = null;
  CM.walkRoadList = [{ gx, gy }];
  CM.walkRoadSet = { has: () => true };   // pas de remap
  CM.globalBubbleCooldown = 999;
  CM.vehicles = [];

  const p = {
    gx, gy, x: (gx + 0.5) * CM.TILE, y: (gy + 0.5) * CM.TILE,
    tx: (gx + 0.5) * CM.TILE, ty: (gy + 0.5) * CM.TILE,
    pauseT: 999, speed: 10, phase: 0, dir: 2, charType: 0, skinVariant: 0, fade: 1,
    tox: lox, toy: 0, lox, loy: 0, col: "#8a7a5a", skin: "#e0b890", hat: null,
    thoughtType: null, thoughtTimer: 0,
  };
  CM.citizens = [p];

  const behindLog = []; CM.ctx = makeRecCtx(behindLog);
  drawGroundAgents(0.016, 0, false);          // passe 1 : agents « derrière »
  const frontLog = []; CM.ctx = makeRecCtx(frontLog);
  drawGroundAgents(0, 0, true);               // passe 2 : agents « devant »

  const behind = behindLog.includes("cit"), front = frontLog.includes("cit");
  return front ? "front" : behind ? "behind" : "none";
}

const W = -8, E = 8, C = 0;   // décalage-trottoir : ouest / est / centré (TILE=20, pedEdge≈0.42)

describe("Y-sort piéton ↔ bâtiment — coins de rue", () => {
  it("face droite : bâtiment PILE au nord → devant (cas déjà géré)", () => {
    expect(classify(["8,7"], 8, 8, C)).toBe("front");
  });

  it("COIN : bâtiment en diagonale NO + piéton décalé vers l'ouest → devant (le fix)", () => {
    // Avant le fix : "behind" (on ne testait que la case pile au nord = route ici) → tête rognée.
    expect(classify(["7,7"], 8, 8, W)).toBe("front");
  });

  it("COIN : bâtiment en diagonale NE + piéton décalé vers l'est → devant (le fix)", () => {
    expect(classify(["9,7"], 8, 8, E)).toBe("front");
  });

  it("centré à un coin (décalage nul) → les deux diagonales testées → devant", () => {
    expect(classify(["7,7"], 8, 8, C)).toBe("front");
  });

  it("piéton décalé À L'OPPOSÉ du bâtiment diagonal → reste derrière (pas de faux positif)", () => {
    // Bâtiment NO mais piéton penché vers l'est : il n'est pas sous ce bâtiment → derrière.
    expect(classify(["7,7"], 8, 8, E)).toBe("behind");
  });

  it("aucun bâtiment au rang nord (seulement au sud) → derrière", () => {
    expect(classify(["8,9"], 8, 8, C)).toBe("behind");
  });
});
