// LES ATTELAGES DU TERROIR ET LA PETITE VIE HORS CHAMP NE VONT PLUS AU PEINTRE
// (audit du 05/10, PERF-45).
//
// pushTerroirTeams poussait un item par attelage (trois moissonneurs par champ l'été)
// sans regarder l'écran, et drawDraftIso / drawNamedAgentIso ne cullent pas : ombre,
// reflet et blit se payaient hors champ. La petite vie (linge : ~55 fillRect par
// corde, chiens, chats, drapeaux…) était poussée de même. Ce que ces tests tiennent :
//   · un attelage hors du champ de vue n'a pas d'item ; dans le champ, si ;
//   · il reste inscrit au REGISTRE DES FIGURES (un passant hors champ l'évite toujours) ;
//   · un acteur de la petite vie hors champ n'a pas d'item ; un acteur sans pied, si.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { collectIsoItems } from '../iso/isoLiveCollect.js';
import { registerVieActors } from '../iso/isoVie.js';
import { figuresBeginFrame, eachFig, FIG } from '../figures.js';
import { AUTUMN } from '../seasonMode.js';

const T = 32;
// Deux grands champs irrigués (parcelles paires) : l'un à l'ouest, l'autre à l'est.
const field = (gx, gy) => ({ gx, gy, buildingId: 'irrigated_fields', type: 'field', rural: true, parcel: 0, spanX: 4, spanY: 3 });
const L = {
  tiles: [field(2, 2), field(40, 2)], trees: [], critters: [], gridN: 64, mapSeed: 7,
  counts: { eraBand: 2, eraIndex: 12 }, roadSet: new Set(), urbanSet: new Set(),
};
// Le champ de vue : tout ce qui est à l'ouest de x = 20 tuiles. Écrit comme le vrai
// (isoRenderer : « hors champ » = une comparaison VRAIE), un point indéfini y est visible.
const dvVis = (wx0) => !(wx0 > 20 * T);
const bake = () => ({ T, L, b: { gx0: -5, gx1: 80, gy0: -5, gy1: 80 }, band: 2, dvVis, z: 1, smokeK: 0, eraIdx: 12 });

// Deux acteurs de petite vie de test : un à l'ouest, un à l'est, et un sans pied.
let vieOn = false;
const VIE_TEST = [{ wx: 5 * T, wy: 5 * T, tag: 'ouest' }, { wx: 50 * T, wy: 5 * T, tag: 'est' }, { tag: 'sans-pied' }];
registerVieActors((now, out) => {
  if (!vieOn) return;
  for (const a of VIE_TEST) out.push({ ...a, draw() {} });
});

function setup() {
  CM.TILE = T; CM.layout = L; CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 1280; CM.ch = 720;
  CM.citizens = []; CM.vehicles = []; CM.ships = []; CM.nightF = 0; CM.season = AUTUMN;
  CM.lodActive = false; CM.collapseAt = null;
}
afterEach(() => { vieOn = false; CM.layout = null; });

describe('collecte iso : le hors-champ ne va pas au peintre', () => {
  it("un attelage hors champ n'a pas d'item, mais reste au registre des figures", () => {
    setup();
    const items = collectIsoItems(bake(), 5000);
    const teams = items.filter((it) => it.kind === 'terroirTeam');
    expect(teams.length).toBe(1);
    expect(teams[0].team.x).toBeLessThan(20);
    // Le registre de la frame (lu à la suivante) compte les DEUX laboureurs.
    figuresBeginFrame();
    let scene = 0;
    eachFig((x, y, f) => { if (f & FIG.SCENE) scene += 1; });
    expect(scene).toBe(2);
  });

  it("un acteur de la petite vie hors champ n'a pas d'item ; un acteur sans pied, si", () => {
    setup();
    vieOn = true;
    const items = collectIsoItems(bake(), 5000);
    const tags = items.filter((it) => it.kind === 'vie' && it.v.tag).map((it) => it.v.tag).sort();
    expect(tags).toEqual(['ouest', 'sans-pied']);
  });
});
