// LA MAISON DES PLAISIRS CONSTRUITE PAR LE CODE (refonte du 2026-10-02,
// docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐).
//
// Deux contrats qu'un œil ne vérifierait qu'au hasard d'une partie :
//   · le lieu PARAÎT avec ses jeux — ni avant (un monument qui n'ouvre rien),
//     ni après (des jeux jouables dans un lieu absent de la carte, le défaut
//     d'origine : 25 ères d'écart) ; et ses pavillons suivent les jeux ouverts ;
//   · chaque âge cuit, sans marqueur de nuit oublié, et le lieu GRANDIT avec le
//     temps (« progressif avec le temps », la demande de Raph).
import { describe, it, expect } from 'vitest';
import { bakePlaisirs, plaisirsGames, plaisirsRecipeBand } from '../iso/plaisirsBake.js';
import { wonderKitForBand } from '../iso/wonderKits.js';
import { PLAISIRS_OPEN_ERA } from '../layout.js';
import { scratchUnlocked } from '../../core/actions/scratch.js';
import { blackjackUnlocked } from '../../core/actions/blackjack.js';
import { icarusUnlocked } from '../../core/actions/icarus.js';
import { regulationActionUnlocked } from '../../core/mechanics/crisis-cost.js';
import { REGULATION_ACTIONS } from '../../data/regulationActions.js';

const gamble = REGULATION_ACTIONS.find((a) => a.kind === 'gamble');
const opaque = (R) => { let n = 0; for (let i = 3; i < R.data.length; i += 4) if (R.data[i]) n += 1; return n; };
// Hauteur d'encre (px) : du haut du raster jusqu'au niveau de l'eau.
const inkHeight = (R) => {
  for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) if (R.data[(j * R.w + i) * 4 + 3]) return -(R.oy + j);
  return 0;
};
const ALL = { osselets: true, tickets: true, cartes: true, icare: true, boutique: true };

describe('le lieu paraît avec ses jeux', () => {
  it('chaque pavillon suit le verrou de SON jeu, à toutes les ères', () => {
    for (let be = 0; be <= 8; be += 1) {
      const ctx = { bestEra: be };
      const g = plaisirsGames({ bestEraIndex: be }, 0);
      expect(g.osselets, `osselets ère ${be}`).toBe(regulationActionUnlocked(gamble.id, ctx));
      expect(g.tickets, `tickets ère ${be}`).toBe(scratchUnlocked(ctx));
      expect(g.cartes, `vingt-et-un ère ${be}`).toBe(blackjackUnlocked(ctx));
      expect(g.icare, `Icare ère ${be}`).toBe(icarusUnlocked(ctx));
    }
  });
  it("le seuil d'apparition sur la carte est l'ère du PREMIER jeu ouvert", () => {
    let first = null;
    for (let be = 0; be <= 8 && first == null; be += 1) {
      const ctx = { bestEra: be };
      if (scratchUnlocked(ctx) || blackjackUnlocked(ctx) || icarusUnlocked(ctx) || regulationActionUnlocked(gamble.id, ctx)) first = be;
    }
    expect(PLAISIRS_OPEN_ERA).toBe(first);
  });
  it('la boutique suit son onglet : premier effondrement, Grand Reset ou Faveur détenue', () => {
    expect(plaisirsGames({ bestEraIndex: 5 }).boutique).toBe(false);
    expect(plaisirsGames({ cycles: 1 }).boutique).toBe(true);
    expect(plaisirsGames({ grandResetCount: 1 }).boutique).toBe(true);
    expect(plaisirsGames({ faveur: 3 }).boutique).toBe(true);
  });
});

describe('les âges du lieu', () => {
  const BANDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  it('chaque âge cuit, avec ses lumières, sans marqueur de nuit resté dans l image', () => {
    for (const band of BANDS) {
      for (const winter of [false, true]) {
        const out = bakePlaisirs(wonderKitForBand(band, winter), ALL);
        const tag = `bande ${band}${winter ? ' hiver' : ''}`;
        expect(opaque(out.R), tag).toBeGreaterThan(2000);
        for (let i = 3; i < out.R.data.length; i += 4) {
          const a = out.R.data[i];
          if (a !== 0 && a !== 255) throw new Error(`${tag} : alpha ${a} resté dans l'image`);
        }
        expect(out.N, `${tag} : calque de nuit`).toBeTruthy();
        expect(out.ledges.length, `${tag} : rebords`).toBeGreaterThan(2);
        expect(out.foot, tag).toBeGreaterThan(40);
        for (const p of out.props) expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.h), tag).toBe(true);
      }
    }
  });
  it('le lieu grandit avec le temps : jamais plus bas que l âge d avant', () => {
    const h = (b) => inkHeight(bakePlaisirs(wonderKitForBand(b), ALL).R);
    let prev = 0;
    for (const b of BANDS) {
      const v = h(b);
      expect(v, `bande ${b} (${v} px) plus basse que la précédente (${prev} px)`).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(h(0)).toBeLessThan(h(4));
    expect(h(4)).toBeLessThan(h(6));
  });
  it('les jeux de l Ère III ajoutent leurs pavillons au radeau de l Ère II', () => {
    const K = wonderKitForBand(0);
    const ere2 = bakePlaisirs(K, plaisirsGames({ bestEraIndex: 2 }));
    const ere3 = bakePlaisirs(K, plaisirsGames({ bestEraIndex: 3 }));
    let diff = 0;
    for (let i = 0; i < ere3.R.data.length; i += 4) if (ere3.R.data[i + 3] !== ere2.R.data[i + 3] || ere3.R.data[i] !== ere2.R.data[i]) diff += 1;
    expect(diff).toBeGreaterThan(60);
  });
  it('les âges pas encore dessinés retombent sur une recette existante', () => {
    for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) expect(Number.isInteger(plaisirsRecipeBand(b))).toBe(true);
  });
});
