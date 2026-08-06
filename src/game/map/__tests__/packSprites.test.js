// Deux packs tiers sont entrés dans la carte le 2026-08-05 : la flotte moderne
// (MinZinn) et le bétail (LaserKiwi). Leurs sprites sont GÉNÉRÉS par des scripts
// qui lisent des archives NON versionnées — personne ne les régénérera au moment
// où un fichier disparaîtra du dépôt, et le rendu est conçu pour ne rien casser
// dans ce cas : un skin absent retombe sur la bande nue, une bête absente ne se
// dessine pas. C'est exactement le genre de panne muette que rien ne signale.
//
// D'où ces gardes d'EXISTENCE, ancrées sur les tables que le jeu utilise vraiment.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { VEH_SKINS } from '../vehicleSkins.js';
import { CRITTER_SIZES, CRITTER_DIAG, CRITTER_HERD, CRITTER_PETS } from '../critters.js';
import { AGE_CONFIG } from '../procedural/ageVisualConfig.js';
import { vehSkinFor } from '../agents.js';

const PIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/pixelart/agents');
const DIAG = ['southeast', 'southwest', 'northwest', 'northeast'];
const vehBand = (type, skin, dir) => path.join(PIX, 'vehicles', `veh-${type}${skin ? '-' + skin : ''}-${dir}.png`);
const critBand = (kind, dir) => path.join(PIX, 'animals', `critter-${kind}-${dir}.png`);
// Gabarit lu dans l'IHDR : pas besoin d'un décodeur pour vérifier une découpe.
const pngSize = (f) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

describe('flotte moderne — sprites du pack de véhicules', () => {
  it('chaque skin du manifeste a ses 4 diagonales', () => {
    const missing = [];
    for (const [type, spec] of Object.entries(VEH_SKINS)) {
      for (const skin of spec.skins) {
        for (const dir of DIAG) if (!existsSync(vehBand(type, skin, dir))) missing.push(`${type}/${skin}-${dir}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('chaque type du manifeste a sa bande nue, le repli quand un skin manque', () => {
    const missing = [];
    for (const type of Object.keys(VEH_SKINS)) {
      for (const dir of DIAG) if (!existsSync(vehBand(type, '', dir))) missing.push(`${type}-${dir}`);
    }
    expect(missing).toEqual([]);
  });

  // Sans ceci les deux gardes ci-dessus seraient DÉCORATIVES : un manifeste vidé
  // les ferait passer au vert en ne vérifiant plus rien. La liste de référence
  // est celle du TIRAGE (ageVisualConfig), une source indépendante du manifeste —
  // c'est elle qui décide ce que la carte demandera à l'écran.
  it('tout véhicule tiré par une ère existe côté art', () => {
    const drawnTypes = new Set();
    for (const age of AGE_CONFIG) for (const v of (age.vehicles || [])) drawnTypes.add(v.type);
    // Les types historiques (charrette, char, tram, panier, drone) ne viennent pas
    // d'un pack : on ne vérifie ici que ceux que le manifeste prétend fournir.
    const fromPack = [...drawnTypes].filter((t) => VEH_SKINS[t]);
    expect(fromPack.length).toBeGreaterThanOrEqual(6);   // bus, van, camion, taxi, police, ambulance…
    for (const type of fromPack) {
      expect(existsSync(vehBand(type, '', 'southeast')), `${type} sans bande nue`).toBe(true);
    }
  });

  // ⛔ Refus de Raph le 2026-08-05 : des berlines modernes sur sa capitale de
  // pierre, « ça ne va pas ». La flotte du pack ne roule qu'à partir de la
  // bande 6. Deux verrous à tenir, et un seul des deux ne suffit pas : les poids
  // d'ère (ce qui est TIRÉ) et le skin (la PEINTURE d'une voiture, dont le type
  // existe des deux côtés de la frontière).
  it('aucun véhicule venu du pack avant la bande 6', () => {
    // `car` est exempté : il a son art d'origine (la vieille automobile sombre),
    // c'est son SKIN qui est gelé, pas son existence.
    const intrus = [];
    AGE_CONFIG.forEach((age, band) => {
      if (band >= 6) return;
      for (const v of (age.vehicles || [])) {
        if (v.type !== 'car' && VEH_SKINS[v.type]) intrus.push(`bande ${band} : ${v.type}`);
      }
    });
    expect(intrus).toEqual([]);
  });

  it('une voiture d\'avant la bande 6 ne prend aucune teinte du pack', () => {
    expect(vehSkinFor('car', 7, 5)).toBe('');
    expect(vehSkinFor('car', 7, 0)).toBe('');
    // …et la garde ne serait rien si elle rendait toujours du vide.
    expect(VEH_SKINS.car.skins).toContain(vehSkinFor('car', 7, 6));
  });

  // La taille de CUISSON suit la taille de BOÎTE (cf. l'en-tête du script
  // d'import) : un bus cuit à la frame d'une berline serait une image étirée.
  // On relit donc le rapport sur le disque plutôt que sur la table.
  it('un véhicule plus grand est cuit dans une frame plus grande', () => {
    const car = pngSize(vehBand('car', VEH_SKINS.car.skins[0], 'southeast')).h;
    const bus = pngSize(vehBand('bus', '', 'southeast')).h;
    expect(VEH_SKINS.bus.size).toBeGreaterThan(VEH_SKINS.car.size);
    expect(bus).toBeGreaterThan(car);
  });
});

describe('bétail et animaux de rue', () => {
  it('chaque bête dessinable a ses 4 diagonales', () => {
    const missing = [];
    for (const kind of Object.keys(CRITTER_SIZES)) {
      for (const dir of CRITTER_DIAG) if (!existsSync(critBand(kind, dir))) missing.push(`${kind}-${dir}`);
    }
    expect(missing).toEqual([]);
  });

  // Le plan tire dans CRITTER_HERD/CRITTER_PETS ; le rendu cherche la taille dans
  // CRITTER_SIZES et le fichier d'après le nom. Une bête tirée mais absente de la
  // table serait posée sur la carte et jamais dessinée — sans une ligne de log.
  it('tout ce que le plan peut poser a une taille et un sprite', () => {
    for (const kind of [...CRITTER_HERD, ...CRITTER_PETS]) {
      expect(CRITTER_SIZES[kind], `${kind} sans taille`).toBeGreaterThan(0);
      expect(existsSync(critBand(kind, 'southeast')), `${kind} sans sprite`).toBe(true);
    }
  });

  it('le chat est plus petit que la vache, et les deux tiennent sous un habitant', () => {
    expect(CRITTER_SIZES.cat).toBeLessThan(CRITTER_SIZES.sheep);
    expect(CRITTER_SIZES.sheep).toBeLessThan(CRITTER_SIZES.cow);
    // Le bœuf de trait vaut 0,975 tuile : aucune bête posée ne doit le dépasser.
    for (const s of Object.values(CRITTER_SIZES)) expect(s).toBeLessThan(0.975);
  });
});
