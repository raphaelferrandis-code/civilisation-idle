// Gardes de la SONDE DE GRILLE (pixelGrid.js — lot G0 de
// docs/PLAN-GRILLE-PIXELS.md).
//
// Trois choses, et rien d'autre :
// 1) la densité est CUMULÉE (Σboîte / Σplanche), pas une moyenne de ratios —
//    c'est ce qui rend le pont mesurable malgré son blit en tranches ;
// 2) elle est NORMALISÉE au zoom, sinon deux mesures prises à deux zooms ne se
//    comparent pas et tout le tableau ment ;
// 3) le classement carte/vivant tient — c'est lui qui porte la thèse du plan
//    (« deux mondes, pas un continuum »), donc une famille non classée doit se
//    voir, pas se ranger en silence du bon côté.
import { describe, it, expect, beforeEach } from 'vitest';
import { CM } from '../layout.js';
import { pxProbe, recPx, pxGridRows, pxGridVerdict } from '../pixelGrid.js';

const arme = () => { pxProbe.rows.clear(); pxProbe.on = true; };
const ligne = (fam) => pxGridRows().find((r) => r.famille === fam);

describe('recPx — la mesure', () => {
  beforeEach(() => { arme(); CM.cam.zoom = 1; });

  it('densité = boîte / planche, normalisée au zoom', () => {
    recPx('habitant', 56, 20);
    expect(ligne('habitant').densite).toBeCloseTo(20 / 56, 3);
    // Le MÊME sprite au zoom 2 : la boîte double, la densité ne bouge pas.
    arme(); CM.cam.zoom = 2;
    recPx('habitant', 56, 40);
    expect(ligne('habitant').densite).toBeCloseTo(20 / 56, 3);
  });

  it('le zoom « en grille » est l inverse de la densité', () => {
    recPx('bete · ox', 68, 15.6);
    const r = ligne('bete · ox');
    expect(r['zoom grille']).toBeCloseTo(1 / r.densite, 1);
  });

  it('CUMULE au lieu de moyenner les ratios — le cas du pont en tranches', () => {
    // Un ouvrage blité en tranches de 1 px source dont les bords sont arrondis
    // au pixel entier : la moitié rend 1 px, l'autre 2. Densité vraie = 1,5.
    for (let i = 0; i < 50; i += 1) recPx('pont · pierre', 1, i % 2 ? 2 : 1);
    expect(ligne('pont · pierre').densite).toBeCloseTo(1.5, 3);
    // ⚠ Et la dispersion reste VISIBLE : c'est elle qui dit « bruit d'arrondi ».
    expect(ligne('pont · pierre')['dens min']).toBeCloseTo(1, 3);
    expect(ligne('pont · pierre')['dens max']).toBeCloseTo(2, 3);
  });

  it('ignore le blit dégénéré (planche ou boîte nulle) au lieu de rendre Infinity', () => {
    recPx('habitant', 0, 20);
    recPx('habitant', 56, 0);
    expect(pxGridRows()).toHaveLength(0);
  });

  it('la planche est rendue en INTERVALLE — c est là que se voit la bascule -half', () => {
    recPx('habitant', 56, 20);
    recPx('habitant', 28, 20);
    expect(ligne('habitant').planche).toBe('28–56');
  });
});

describe('pxGridVerdict — les deux mondes', () => {
  beforeEach(() => { arme(); CM.cam.zoom = 1; });

  it('sépare carte et vivant, et chiffre la falaise entre les deux', () => {
    recPx('sol', 64, 64);                 // carte : 1,00
    recPx('bati · habitation', 44, 50);   // carte : 1,136
    recPx('emeutier', 92, 13.4);          // vivant : 0,146
    recPx('habitant', 30, 20);            // vivant : 0,667
    const v = pxGridVerdict();
    expect(v.familles).toBe(4);
    expect(v.carte).toMatch(/^1–1\.14 /);
    expect(v.vivant).toMatch(/^0\.15–0\.67 /);
    expect(v.ecart).toBe('×7.78');        // 1,136 / 0,146
  });

  it('une famille inconnue se range en « ? », jamais d office dans un monde', () => {
    recPx('licorne · rose', 40, 20);
    expect(ligne('licorne · rose').monde).toBe('?');
    const v = pxGridVerdict();
    expect(v.carte).toBe('—');
    expect(v.vivant).toBe('—');
  });
});
