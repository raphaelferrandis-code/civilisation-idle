// LES BANDES DE REPOS DE LA CROUPIÈRE tiennent au disque (audit du 05/10, ASSET-6).
// PlaisirsTable demandait `{nom}-repos` pour TOUTE fille assise à la table — y compris
// la courtisane du duel aux dés, dont la bande n'existe pas : loadWithRetry insistait
// ~11 minutes, une centaine de requêtes en échec. La bande est maintenant un champ de
// la troupe (`repos`), confronté ici au disque dans les deux sens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { plaisirsCast } from '../plaisirsCast.js';

const INH = path.join('public', 'pixelart', 'agents', 'inhabitants');
// Les FACES seulement : le dos d'une bande de repos est lu sur sa face (MIRROR_BACK
// d'agents.js, audit du 05/10, ASSET-8) — les bandes nord n'existent plus.
const DIAG = ['southeast', 'southwest'];
const girlsOfAllBands = () => {
  const seen = new Map();
  for (let b = 0; b <= 9; b += 1) for (const g of plaisirsCast(b).girls) seen.set(g.name, g);
  return [...seen.values()];
};

describe('troupe de la Maison des Plaisirs : bandes de repos', () => {
  it('chaque `repos` déclaré a ses 2 faces (et leurs demi-bandes)', () => {
    const missing = [];
    for (const g of girlsOfAllBands()) {
      if (!g.repos) continue;
      for (const d of DIAG) {
        for (const f of [`${g.repos}-${d}.png`, `${g.repos}-${d}-half.png`]) {
          if (!fs.existsSync(path.join(INH, f))) missing.push(f);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('aucune bande de repos livrée n’est oubliée par la troupe', () => {
    const lost = girlsOfAllBands()
      .filter((g) => !g.repos && fs.existsSync(path.join(INH, `${g.name}-repos-southeast.png`)))
      .map((g) => g.name);
    expect(lost).toEqual([]);
    expect(girlsOfAllBands().filter((g) => g.repos).length).toBeGreaterThanOrEqual(8);
  });

  it('les courtisanes du duel (deuxième et troisième fille) ne réclament aucune bande de repos', () => {
    // DuelStage.dealerOf : { dealer: 'g', variant: 1 + (i % 2) } → girls[variant % 3].
    for (let b = 0; b <= 9; b += 1) {
      for (const v of [1, 2]) expect(plaisirsCast(b).girls[v % 3].repos, `âge ${b}, fille ${v}`).toBeUndefined();
    }
  });
});
