// LA NATURE DU PAYSAGE SONORE (lot 2, docs/PLAN-AMBIANCE-SONORE.md) : les règles qui
// décident quoi jouer, testées sans le jeu.
//   · les nappes : les grillons la nuit, les sauterelles le jour dans les prés, les
//     cigales les jours d'été ; la pluie et l'hiver font taire les insectes ; dézoomé,
//     la nature se tait et le vent d'altitude prend sa place, moins si la ville est grande ;
//   · les ponctuels semés : un oiseau là où il y a de la forêt, de jour ; la chouette la
//     nuit ; rien aux âges cosmiques ; l'habituation divise par deux ;
//   · où semer : un lieu de l'écran qui porte le milieu ;
//   · les enregistrements : le nom de fichier fait la famille.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciblesNappes, tauxSeme, enregistresUtiles, SEMES, NAPPES, EMETTEURS } from '../paysage/paysage.js';
import { nouvelleMesure, tirerLieu, MILIEUX } from '../paysage/milieux.js';
import { listeEnregistres, famille, ENREGISTRES } from '../paysage/enregistrements.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const parts = (o) => ({ ...Object.fromEntries(MILIEUX.map((m) => [m, 0])), ...o });
const PRE = parts({ prairie: 1 }), BOIS = parts({ foret: 1 }), EAU = parts({ eau: 0.6, rive: 0.6, prairie: 0.4 });
const JOUR_ETE = { nuit: 0, saison: 1 }, NUIT_ETE = { nuit: 1, saison: 1 };

describe('les nappes de la nature', () => {
  it('les grillons chantent la nuit, les sauterelles le jour, dans les prés', () => {
    const jour = ciblesNappes(PRE, JOUR_ETE), nuit = ciblesNappes(PRE, NUIT_ETE);
    expect(jour.stridulations).toBeGreaterThan(0.5);
    expect(jour.grillons).toBe(0);
    expect(nuit.grillons).toBeGreaterThan(0.5);
    expect(nuit.stridulations).toBe(0);
  });

  it('les cigales chantent les jours d’été, dans les arbres, et jamais une autre saison', () => {
    expect(ciblesNappes(BOIS, JOUR_ETE).cigales).toBeGreaterThan(0.5);
    for (const saison of [0, 2, 3]) expect(ciblesNappes(BOIS, { nuit: 0, saison }).cigales).toBe(0);
    expect(ciblesNappes(BOIS, NUIT_ETE).cigales).toBe(0);
  });

  it("la pluie et l'hiver font taire les insectes, pas le vent", () => {
    const averse = ciblesNappes(PRE, { ...JOUR_ETE, pluie: 1 });
    expect(averse.stridulations).toBe(0);
    expect(averse.souffle).toBeGreaterThan(0.5);
    const hiver = ciblesNappes(PRE, { nuit: 1, saison: 3 });
    expect(hiver.grillons).toBe(0);
    expect(ciblesNappes(PRE, { nuit: 0, saison: 3 }).stridulations).toBe(0);
  });

  it("dézoomé, la nature se tait et le vent d'altitude prend sa place, moins si la ville est grande", () => {
    const pres = ciblesNappes(EAU, { ...JOUR_ETE, proche: 1, loin: 0 });
    const loin = ciblesNappes(EAU, { ...JOUR_ETE, proche: 0, loin: 1 });
    expect(pres.courant).toBeGreaterThan(0.5);
    expect(pres.altitude).toBe(0);
    expect(loin.courant).toBe(0);
    expect(loin.altitude).toBeGreaterThan(0.5);
    const ville = ciblesNappes(EAU, { ...JOUR_ETE, proche: 0, loin: 1, taille: 1 });
    expect(ville.altitude).toBeLessThan(loin.altitude / 2);
    expect(ville.lointain).toBeCloseTo(1, 6);
  });
});

describe('les ponctuels semés', () => {
  const cond = (o) => ({ nuit: 0, saison: 0, sec: 1, vivant: 1, ...o });

  it("un oiseau là où il y a de la forêt, de jour ; la nuit, c'est la chouette", () => {
    expect(tauxSeme(SEMES.oiseau, BOIS, cond())).toBeGreaterThan(0.1);
    expect(tauxSeme(SEMES.oiseau, parts({ ville: 1 }), cond())).toBe(0);
    expect(tauxSeme(SEMES.oiseau, BOIS, cond({ nuit: 1 }))).toBe(0);
    expect(tauxSeme(SEMES.chouette, BOIS, cond({ nuit: 1 }))).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.chouette, BOIS, cond({ nuit: 0 }))).toBe(0);
  });

  it('les grenouilles près de l’eau la nuit, les corneilles l’hiver, le coucou au printemps', () => {
    expect(tauxSeme(SEMES.grenouille, EAU, cond({ nuit: 1 }))).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.grenouille, BOIS, cond({ nuit: 1 }))).toBe(0);
    expect(tauxSeme(SEMES.corneille, PRE, cond({ saison: 3 }))).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.corneille, PRE, cond({ saison: 1 }))).toBe(0);
    expect(tauxSeme(SEMES.coucou, BOIS, cond({ saison: 0 }))).toBeGreaterThan(tauxSeme(SEMES.coucou, BOIS, cond({ saison: 1 })));
    expect(tauxSeme(SEMES.coucou, BOIS, cond({ saison: 2 }))).toBe(0);
  });

  it("aux âges cosmiques, plus de bêtes ; dézoomé, plus rien ; l'habituation divise par deux", () => {
    const base = tauxSeme(SEMES.oiseau, BOIS, cond());
    expect(tauxSeme(SEMES.oiseau, BOIS, cond({ vivant: 0 }))).toBe(0);
    expect(tauxSeme(SEMES.oiseau, BOIS, cond(), 0)).toBe(0);
    expect(tauxSeme(SEMES.oiseau, BOIS, cond(), 1, 0.5)).toBeCloseTo(base / 2, 9);
    // À pleine forêt, le taux est celui annoncé (par minute).
    expect(base * 60).toBeCloseTo(SEMES.oiseau.taux, 6);
  });

  it('une famille qui a peu de sons se fait rare : deux oiseaux qui alternent se reconnaissent vite', () => {
    const plein = tauxSeme(SEMES.oiseau, BOIS, cond());
    const deux = tauxSeme(SEMES.oiseau, BOIS, cond(), 1, 1, 2);
    expect(deux).toBeCloseTo(plein * (2 / SEMES.oiseau.variantes), 9);
    expect(tauxSeme(SEMES.oiseau, BOIS, cond(), 1, 1, 0)).toBe(0);
    expect(tauxSeme(SEMES.oiseau, BOIS, cond(), 1, 1, 50)).toBeCloseTo(plein, 9);
  });
});

describe('où semer', () => {
  it("un lieu de l'écran qui porte le milieu, en proportion ; aucun s'il est absent", () => {
    const m = nouvelleMesure();
    m.lieux.n = 4;
    m.lieux.de.foret.set([0, 3, 0, 1]);
    const vus = [0, 0, 0, 0];
    for (let k = 0; k < 400; k += 1) vus[tirerLieu(m, 'foret', (k + 0.5) / 400)] += 1;
    expect(vus[0]).toBe(0);
    expect(vus[2]).toBe(0);
    expect(vus[1]).toBe(300);
    expect(vus[3]).toBe(100);
    expect(tirerLieu(m, 'eau', 0.5)).toBe(-1);
  });
});

describe('les enregistrements livrés', () => {
  it("chaque fichier de src/assets/sons a sa place : une famille semée, ou une nappe, ou un émetteur — un nom mal écrit se tairait sans un mot", () => {
    const listes = [...Object.values(NAPPES), ...Object.values(EMETTEURS)].flatMap((d) => d.enregistres || []);
    for (const e of ENREGISTRES) {
      expect(Boolean(SEMES[e.famille]) || listes.includes(e.id), `${e.id} : ni famille semée, ni nappe, ni émetteur`).toBe(true);
    }
  });

  it('seuls se décodent les fichiers qui jouent : la variante écartée d’une nappe reste sur le disque', () => {
    const l = [{ id: 'oiseau-merle-1', famille: 'oiseau' }, { id: 'causerie-place-1', famille: 'causerie' }, { id: 'causerie-groupe-1', famille: 'causerie' }];
    const u = enregistresUtiles(l, new Set(l.map((e) => e.id)));
    expect(u.has('oiseau-merle-1')).toBe(true);
    expect(u.has('causerie-place-1')).toBe(true);
    expect(u.has('causerie-groupe-1')).toBe(false);
    // Sans la première, la variante joue.
    expect(enregistresUtiles(l.slice(2), new Set(['causerie-groupe-1'])).has('causerie-groupe-1')).toBe(true);
  });

  it('chaque son du catalogue a été importé, et rien d’autre ne traîne dans le dossier', () => {
    const cat = JSON.parse(readFileSync(path.join(ROOT, 'scripts/sons/catalogue.json'), 'utf8'));
    const ids = new Set(cat.sons.map((s) => s.id));
    expect(new Set(ENREGISTRES.map((e) => e.id))).toEqual(ids);
  });
});

describe('les enregistrements', () => {
  it('le nom de fichier fait la famille ; la liste est triée', () => {
    const l = listeEnregistres({
      '../../../assets/sons/oiseau-merle-2.ogg': 'u2',
      '../../../assets/sons/chouette-hulotte-1.ogg': 'u3',
      '../../../assets/sons/oiseau-merle-10.ogg': 'u10',
      '../../../assets/sons/oiseau-merle-1.ogg': 'u1',
    });
    expect(l.map((e) => e.id)).toEqual(['chouette-hulotte-1', 'oiseau-merle-1', 'oiseau-merle-2', 'oiseau-merle-10']);
    expect(famille('oiseau', l).map((e) => e.url)).toEqual(['u1', 'u2', 'u10']);
    expect(famille('grenouille', l)).toEqual([]);
  });
});
