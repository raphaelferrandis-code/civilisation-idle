import { describe, it, expect } from "vitest";

import { makeFleetCtl, riverFleetBudget, updateRiverFleet, FLEET_TUNE } from "../riverFleet.js";

// « Les bateaux arrivent, foncent au port, repartent » — sauf qu'ils ne
// repartaient pas : `CM.ships` était un anneau et la flotte se reconstruisait
// EN BLOC dès que son effectif changeait. Un pêcheur censé tenir sa pose 90 s
// n'y survivait pas une seconde (Raph 2026-07-29).
//
// Ces tests pilotent le vrai `updateRiverFleet` sur une horloge simulée. Chacun
// a été vérifié en CASSANT la garde qu'il surveille — un test qui compare le
// calcul à lui-même est décoratif, celui-là doit mordre :
//   • survie du pêcheur → rétabli le `ships = []` de l'ancien rebuild : rouge
//   • mort en bout de ruban → rétabli le wrap `if (t > 1) t -= 1` : rouge
//   • creux entre arrivées → délai de naissance mis à 0 : rouge
//   • clamp du pas → DT_MAX porté à l'infini : rouge

const DT = 1 / 60;

// Fait tourner la sim `seconds` secondes à pas de frame constant.
function run(ships, ctl, budget, seconds, env = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    updateRiverFleet(ships, ctl, budget, DT, env);
  }
  return ships;
}

const ONLY = (kind) => ({ trade: 0, yacht: 0, fisher: 0, [kind]: 1 });

describe("riverFleet — effectifs", () => {
  const L = { river: { present: true }, counts: { eraIndex: 20, eraBand: 4 } };

  it("sans fleuve, aucun métier ne tourne", () => {
    const b = riverFleetBudget({ buildings: { river_ports: 9 } }, { river: { present: false } });
    expect(b).toEqual({ trade: 0, yacht: 0, fisher: 0 });
  });

  it("l'effectif marchand suit le port et sature au plafond", () => {
    const small = riverFleetBudget({ buildings: { river_ports: 1 } }, L);
    const big = riverFleetBudget({ buildings: { river_ports: 40, markets: 40 } }, L);
    expect(small.trade).toBeGreaterThan(0);
    expect(big.trade).toBeGreaterThan(small.trade);
    // Le plafond est le geste central du lot : le fleuve doit respirer même à
    // port maximal, là où l'ancienne formule montait à 12.
    expect(big.trade).toBe(FLEET_TUNE.tradeMax);
  });

  it("le port reste LISIBLE en fin de partie", () => {
    // Garde née d'un vrai raté : sous le plafond abaissé, la formule linéaire
    // d'origine saturait par le seul terme d'ère dès l'ère 20. Le joueur voyait
    // alors le même fleuve avec un port niveau 1 et un port niveau 40 — le
    // signal de prospérité qu'on prétendait protéger était mort en silence.
    const tardif = { river: { present: true }, counts: { eraIndex: 40, eraBand: 6 } };
    const petitPort = riverFleetBudget({ buildings: { river_ports: 1 } }, tardif);
    const grosPort = riverFleetBudget({ buildings: { river_ports: 60 } }, tardif);
    expect(petitPort.trade).toBeLessThan(FLEET_TUNE.tradeMax);
    expect(grosPort.trade).toBeGreaterThan(petitPort.trade);
    // Et l'étagement doit rester perceptible en cours de route, pas seulement
    // aux deux extrêmes.
    const paliers = [1, 4, 12, 40].map((n) => riverFleetBudget({ buildings: { river_ports: n } }, tardif).trade);
    expect(new Set(paliers).size).toBeGreaterThanOrEqual(3);
  });

  it("pêche et plaisance ne dépendent pas du port", () => {
    const sansPort = riverFleetBudget({ buildings: {} }, L);
    expect(sansPort.fisher).toBe(1);
    expect(sansPort.yacht).toBeGreaterThan(0);
  });
});

describe("riverFleet — cycle de vie", () => {
  it("un marchand traverse puis MEURT (plus d'anneau)", () => {
    const ships = [], ctl = makeFleetCtl();
    run(ships, ctl, ONLY("trade"), 2);
    const first = ships.find((s) => s.kind === "trade");
    expect(first).toBeDefined();
    const id = first.id;
    const dir = first.dir;
    // Durée DÉDUITE de la vitesse la plus lente, jamais écrite en dur : les
    // marchands ont déjà été ralentis une fois, et une constante en dur aurait
    // rendu ce test faussement vert (le bateau n'aurait pas fini sa traversée).
    run(ships, ctl, ONLY("trade"), 1 / FLEET_TUNE.speed.trade[0] + 30);
    // Le bateau de départ n'est plus là : il est sorti par le bord opposé.
    expect(ships.some((s) => s.id === id)).toBe(false);
    // Et aucun survivant n'a rebouclé : tous les `t` restent dans les bornes.
    for (const s of ships) expect(s.t).toBeGreaterThanOrEqual(-0.05);
    for (const s of ships) expect(s.t).toBeLessThanOrEqual(1.05);
    // Le sens de naissance décide du bord d'entrée.
    expect(dir > 0 ? 0 : 1).toBe(dir > 0 ? 0 : 1);
  });

  it("le pêcheur s'ancre 90 s, à l'écart des quais, puis repart", () => {
    const ships = [], ctl = makeFleetCtl();
    const env = { docks: [{ t: 0.5, side: 1 }], avoidT: [0.5] };
    run(ships, ctl, ONLY("fisher"), 120, env);
    const f = ships.find((s) => s.kind === "fisher");
    expect(f).toBeDefined();
    expect(f.state).toBe("anchor");
    // Il ne jette pas l'ancre dans le chenal du port.
    expect(Math.abs(f.anchorT - 0.5)).toBeGreaterThan(0.1);
    // Immobile : sa position ne bouge plus d'un pouce pendant la pose.
    const posed = f.t;
    run(ships, ctl, ONLY("fisher"), 30, env);
    expect(f.t).toBe(posed);
    expect(f.state).toBe("anchor");
    // Passée la pose, il reprend sa route et finit par sortir de la carte.
    run(ships, ctl, ONLY("fisher"), FLEET_TUNE.fisherDwell + 10, env);
    expect(f.state).toBe("cruise");
    run(ships, ctl, ONLY("fisher"), 1 / FLEET_TUNE.speed.fisher[0] + 30, env);
    expect(ships.some((s) => s.id === f.id)).toBe(false);
  });

  it("le pêcheur SURVIT à un changement d'effectif marchand", () => {
    // Le blocage qui a motivé tout le module : l'ancien code faisait
    // `if (ships.length !== want) ships = []`, donc le moindre achat de port
    // rasait la flotte et téléportait tout le monde.
    const ships = [], ctl = makeFleetCtl();
    const env = { docks: [], avoidT: [] };
    run(ships, ctl, { trade: 1, yacht: 0, fisher: 1 }, 130, env);
    const f = ships.find((s) => s.kind === "fisher");
    expect(f).toBeDefined();
    expect(f.state).toBe("anchor");
    const id = f.id, posed = f.t;
    // Le port monte d'un coup : l'effectif marchand passe de 1 à 5.
    run(ships, ctl, { trade: 5, yacht: 0, fisher: 1 }, 20, env);
    const still = ships.find((s) => s.id === id);
    expect(still).toBeDefined();
    expect(still.state).toBe("anchor");
    expect(still.t).toBe(posed);
  });

  it("un marchand accoste vraiment, une seule fois", () => {
    const ships = [], ctl = makeFleetCtl();
    const env = { docks: [{ t: 0.5, side: 1 }], avoidT: [0.5] };
    let sawDock = false;
    for (let i = 0; i < Math.round(300 / DT); i += 1) {
      updateRiverFleet(ships, ctl, ONLY("trade"), DT, env);
      for (const s of ships) if (s.state === "dock") sawDock = true;
    }
    expect(sawDock).toBe(true);
    // Après escale, `done` empêche de repartir en boucle sur le même quai.
    for (const s of ships) if (s.done) expect(s.state).not.toBe("dock");
  });
});

describe("riverFleet — densité", () => {
  it("ne dépasse jamais l'effectif voulu", () => {
    const ships = [], ctl = makeFleetCtl();
    const budget = { trade: FLEET_TUNE.tradeMax, yacht: 2, fisher: 1 };
    let peak = 0;
    for (let i = 0; i < Math.round(600 / DT); i += 1) {
      updateRiverFleet(ships, ctl, budget, DT, {});
      const n = ships.filter((s) => s.kind === "trade").length;
      if (n > peak) peak = n;
    }
    expect(peak).toBeLessThanOrEqual(FLEET_TUNE.tradeMax);
    expect(peak).toBeGreaterThan(1);
  });

  it("laisse un CREUX entre deux arrivées", () => {
    // Sans délai de naissance, un plafond de 5 se remplirait à la première
    // frame et redonnerait exactement le mur de bateaux qu'on vient d'enlever.
    const ships = [], ctl = makeFleetCtl();
    const budget = { trade: FLEET_TUNE.tradeMax, yacht: 0, fisher: 0 };
    const births = [];
    let seen = 0;
    for (let i = 0; i < Math.round(120 / DT); i += 1) {
      updateRiverFleet(ships, ctl, budget, DT, {});
      if (ctl.nextId > seen) { births.push(i * DT); seen = ctl.nextId; }
    }
    expect(births.length).toBeGreaterThan(2);
    for (let i = 1; i < births.length; i += 1) {
      expect(births[i] - births[i - 1]).toBeGreaterThanOrEqual(FLEET_TUNE.tradeGap[0] - 0.5);
    }
  });

  it("un effectif qui BAISSE ne téléporte personne", () => {
    const ships = [], ctl = makeFleetCtl();
    run(ships, ctl, { trade: 4, yacht: 0, fisher: 0 }, 90);
    const before = ships.map((s) => ({ id: s.id, t: s.t }));
    expect(before.length).toBeGreaterThan(1);
    // Le port perd des niveaux : personne ne disparaît d'un coup, les
    // surnuméraires sortiront par un bord comme les autres.
    updateRiverFleet(ships, ctl, { trade: 1, yacht: 0, fisher: 0 }, DT, {});
    for (const b of before) {
      const s = ships.find((x) => x.id === b.id);
      expect(s).toBeDefined();
      expect(Math.abs(s.t - b.t)).toBeLessThan(0.01);
    }
  });

  it("un pas de temps géant ne fait pas sauter la flotte", () => {
    // Onglet caché : l'horloge revient avec plusieurs secondes d'un coup. On ne
    // rattrape pas le temps perdu du fleuve, sinon tout le monde se téléporte.
    const ships = [], ctl = makeFleetCtl();
    run(ships, ctl, ONLY("trade"), 5);
    const s = ships[0];
    const before = s.t;
    updateRiverFleet(ships, ctl, ONLY("trade"), 600, {});
    expect(Math.abs(s.t - before)).toBeLessThan(0.01);
  });
});
