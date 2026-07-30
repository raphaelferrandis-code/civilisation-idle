import { describe, it, expect, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";

import RoadworksPanel from "../RoadworksPanel.jsx";
import { roadNetworkInfo } from "../roadNetwork.js";
import { state, setState, defaultState, buildingById } from "../../../game/core/state.js";
import { D } from "../../../game/core/num.js";

// Rendu SSR de l'encart Voirie : les TROIS phases produisent la bonne
// structure (bouton-verbe, jauges, pastilles) sans navigateur. Garde née d'une
// session où la pane rechargeait en boucle (édits parallèles sur src/game/) et
// où seule la phase « réserve » avait pu être vérifiée à l'œil.

beforeEach(() => { setState(defaultState()); state.knowledge = D("1e9"); });

const roads = () => buildingById.roads;

// React SSR intercale des marqueurs <!-- --> entre nœuds texte : on les gomme
// pour asserter sur le texte que verra vraiment le joueur.
const render = () => renderToString(<RoadworksPanel building={roads()} />).replace(/<!-- -->/g, "");

describe("encart Voirie — rendu des trois phases", () => {
  it("raccord : verbe + tuiles + file de 3 pastilles + jauge réseau", () => {
    state.roadNext = { kind: "link", tiles: 23, count: 5, targetId: null, toRank: null };
    state.roadCoverage = 0.82;
    const html = render();
    expect(html).toMatch(/Raccorder 5 bâtiments|Link 5 buildings/);
    expect(html).toMatch(/23 (tuiles|tiles)/);
    expect(html).toContain("fa-link");
    expect(html).toContain("rw-net-fill");
    expect(html).toContain("82%");
    expect((html.match(/rw-dot/g) || []).length).toBe(3);
    expect(html).not.toContain("rw-pip");
  });

  it("chantier actif : la barre est à mi-course, la file montre 2 pastilles pleines", () => {
    state.roadNext = { kind: "link", tiles: 4, count: 1, targetId: "granaries_city", toRank: null };
    state.roadWorks = {
      active: { kind: "link", tiles: 4, targetId: null, toRank: null, total: 10, left: 5 },
      queue: [{ kind: "link", tiles: 4, targetId: null, toRank: null, total: 12, left: 12 }]
    };
    const html = render();
    expect(html).toMatch(/width:50%/);
    expect((html.match(/rw-dot is-filled/g) || []).length).toBe(2);
  });

  it("autoroute : le verbe et l'icône changent d'échelon", () => {
    state.roadNext = { kind: "widen", tiles: 14, count: 1, targetId: null, toRank: "twin" };
    const html = render();
    expect(html).toMatch(/Doubler en autoroute|Twin into a highway/);
    expect(html).toContain("fa-road");
  });

  it("les PORTES RÉELLES remontent à l'affichage quand la carte les publie", () => {
    // Garde née du « 100 % relié » affiché sur une ville pleine de bâtiments
    // sans rue : la jauge se joue sur les desservables (sinon le plein bonus
    // serait hors d'atteinte), mais le compte brut — cœurs d'îlots murés
    // compris — reste disponible pour le dire à l'écran.
    state.roadCoverage = 1;
    state.roadDoors = { onRoad: 533, total: 601 };
    const net = roadNetworkInfo();
    expect(net.pct).toBe(100);
    expect(net.doors).toEqual({ onRoad: 533, total: 601 });
    // Pas de carte montée (partie neuve) : rien à dire, pas de faux chiffre.
    state.roadDoors = null;
    expect(roadNetworkInfo().doors).toBeNull();
  });

  it("réseau achevé : pips de réserve et « Mettre en réserve »", () => {
    state.roadNext = { kind: "done", tiles: 0, count: 0, targetId: null, toRank: null };
    state.roadWorksBank = 7;
    state.roadCoverage = 1;
    const html = render();
    expect(html).toMatch(/Mettre en réserve|Stockpile/);
    expect(html).toContain("fa-box-archive");
    expect((html.match(/rw-pip is-filled/g) || []).length).toBe(7);
    expect(html).toContain("100%");
    expect(html).not.toContain("rw-dot");
  });
});
