// LES MÉTIERS DU PAYSAGE SONORE (lot 4) : quelle scène fait quel bruit (paysage/metiers.js),
// et ce qui dose le troupeau, les bêtes, le coq, la cloche du bord (paysage.js). On ne les
// entend pas ici — Raph les juge au banc d'écoute — : on vérifie que chaque âge a ses
// métiers, et rien d'autre.
import { describe, it, expect } from 'vitest';
import { familleMetier } from '../paysage/metiers.js';
import { ciblesNappes, tauxSeme, sonDeNappe, NAPPES, EMETTEURS, SEMES, PONCTUELS } from '../paysage/paysage.js';
import { rendrePaysage, SONS_PAYSAGE } from '../paysage/paysageSynth.js';

describe('quelle scène fait quel bruit', () => {
  it("la forge des premiers âges, la charpente des cités, la vapeur de la Fonte, le bourdon du Néon", () => {
    expect(familleMetier('guilds', 0)).toBe('forge');
    expect(familleMetier('guilds', 3)).toBe('forge');
    expect(familleMetier('mint_houses', 1)).toBe('forge');
    expect(familleMetier('public_works', 3)).toBe('charpente');
    expect(familleMetier('caravans', 2)).toBe('charpente');
    expect(familleMetier('caravans', 1)).toBe(null);          // le mulet au repos ne travaille pas
    expect(familleMetier('mint_houses', 5)).toBe('vapeur');
    expect(familleMetier('printing_houses', 5)).toBe('vapeur');
    expect(familleMetier('printing_houses', 6)).toBe('electrique');
    expect(familleMetier('granaries_city', 3)).toBe(null);    // un grenier ne fait pas de bruit
  });

  it("au Marbre, seul l'atelier du forgeron frappe ; le potier et le teinturier se taisent", () => {
    expect(familleMetier('guilds', 4, 1)).toBe('forge');
    expect(familleMetier('guilds', 4, 2)).toBe(null);
    expect(familleMetier('guilds', 4, 3)).toBe(null);
  });

  it("le feu crépite là où la scène en dessine un ; les âges cosmiques n'ont pas d'atelier qui s'entende", () => {
    expect(familleMetier('ancestral_cult', 0)).toBe('feu');
    expect(familleMetier('ancestral_cult', 2)).toBe(null);
    expect(familleMetier('ancestral_cult', 4)).toBe('feu');
    expect(familleMetier('watch', 3)).toBe('feu');
    expect(familleMetier('watch', 4)).toBe(null);
    expect(familleMetier('markets', 3)).toBe('etals');
    expect(familleMetier('river_ports', 2)).toBe('port');        // le port loin de l'eau, dessiné en scène
    expect(familleMetier('river_ports', 6)).toBe('port');
    for (const id of ['guilds', 'mint_houses', 'ancestral_cult', 'markets']) expect(familleMetier(id, 8), id).toBe(null);
  });
});

describe('ce qui dose les métiers', () => {
  const P = { foret: 0, prairie: 1, champ: 0, eau: 0, rive: 0, ville: 0, place: 0 };
  const cond = { nuit: 0, saison: 1, sec: 1, vivant: 1, aube: 0 };

  it('le troupeau sonne près des bêtes, moins la nuit ; sans bêtes, rien', () => {
    expect(ciblesNappes(P, { betail: 2 }).troupeau).toBeGreaterThan(0.4);
    expect(ciblesNappes(P, { betail: 0 }).troupeau).toBe(0);
    expect(ciblesNappes(P, { betail: 2, nuit: 1 }).troupeau).toBeCloseTo(ciblesNappes(P, { betail: 2 }).troupeau / 2, 9);
  });

  it("la vache et la chèvre qu'on voit ; le coq à l'aube seulement, du côté des champs", () => {
    expect(tauxSeme(SEMES.vache, {}, cond, 1, 1, 3, 2)).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.vache, {}, cond, 1, 1, 3, 0)).toBe(0);
    expect(tauxSeme(SEMES.chevre, {}, cond, 1, 1, 3, 2)).toBeGreaterThan(0);
    const champ = { champ: 1 };
    expect(tauxSeme(SEMES.coq, champ, cond)).toBe(0);
    expect(tauxSeme(SEMES.coq, champ, { ...cond, aube: 1 })).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.coq, champ, { ...cond, aube: 1, vivant: 0 })).toBe(0);
  });

  it('la charpente travaille de jour ; la vapeur siffle sur ses machines', () => {
    expect(tauxSeme(SEMES.charpente, {}, cond, 1, 1, 4, 1)).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.charpente, {}, { ...cond, nuit: 1 }, 1, 1, 4, 1)).toBe(0);
    expect(tauxSeme(SEMES.sifflet, {}, cond, 1, 1, 1, 1)).toBeGreaterThan(0);
  });

  it('la cloche du bord et le bourdon électrique sont synthétisés ; le reste attend ses fichiers', () => {
    for (const n of PONCTUELS.cloche.sons) expect(SONS_PAYSAGE).toContain(n);
    expect(SONS_PAYSAGE).toContain('electrique');
    expect(rendrePaysage('electrique').length).toBeGreaterThan(0);
    for (const fam of ['feu', 'forge', 'vapeur']) expect(sonDeNappe(fam, EMETTEURS[fam], new Set()), fam).toBe(null);
    expect(sonDeNappe('troupeau', NAPPES.troupeau, new Set())).toBe(null);
  });
});
