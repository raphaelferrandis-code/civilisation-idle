import { describe, it, expect, afterEach } from 'vitest';
import { vehicleGapFactors, VEH_GAP } from '../agents.js';

// DISTANCE ENTRE VÉHICULES (retour Raph, 2026-10-03 : un aurige dessiné par-dessus une
// charrette d'amphores). Instantanés en TUILES : position rendue, cap unitaire, longueur.
const snap = (x, y, hx, hy, L = 0.5) => ({ x, y, hx, hy, L });

describe('vehicleGapFactors — suivre sans se chevaucher', () => {
  const saved = { ...VEH_GAP };
  afterEach(() => Object.assign(VEH_GAP, saved));

  it('le suiveur collé s\'arrête, celui de devant roule', () => {
    const k = vehicleGapFactors([snap(0, 0, 1, 0), snap(0.55, 0, 1, 0)]);
    expect(k[0]).toBe(0);
    expect(k[1]).toBe(1);
  });
  it('il ralentit dans la zone de suivi, roule librement au-delà', () => {
    const mid = VEH_GAP.stop + (VEH_GAP.free - VEH_GAP.stop) / 2;
    const k = vehicleGapFactors([snap(0, 0, 1, 0), snap(0.5 + mid, 0, 1, 0)]);
    expect(k[0]).toBeCloseTo(0.5, 5);
    expect(vehicleGapFactors([snap(0, 0, 1, 0), snap(2, 0, 1, 0)])[0]).toBe(1);
  });
  it('ignore la file d\'en face et la file voisine', () => {
    expect(vehicleGapFactors([snap(0, 0.15, 1, 0), snap(0.4, -0.15, -1, 0)])).toEqual([1, 1]);
    expect(vehicleGapFactors([snap(0, 0, 1, 0), snap(0.5, 0.3, 1, 0)])).toEqual([1, 1]);
  });
  it('deux véhicules au même point : un seul attend (apparition groupée)', () => {
    const k = vehicleGapFactors([snap(3, 3, 0, 1), snap(3, 3, 0, 1)]);
    expect(k.filter((x) => x === 0)).toHaveLength(1);
  });
  it('au carrefour, celui qui arrive cède à celui qui est dans son chemin', () => {
    // A roule vers l'est, B traverse devant lui (vers le sud) : A attend, B passe.
    const k = vehicleGapFactors([snap(0, 0, 1, 0), snap(0.4, 0, 0, 1)]);
    expect(k[0]).toBe(0);
    expect(k[1]).toBe(1);
  });
  it('deux véhicules en travers qui se barrent mutuellement : jamais d\'interblocage', () => {
    const k = vehicleGapFactors([snap(0, 0, 1, 0), snap(0.3, -0.3, 0, 1)]);
    expect(Math.max(...k)).toBeGreaterThan(0);
  });
  it('se coupe à la molette', () => {
    VEH_GAP.on = false;
    expect(vehicleGapFactors([snap(0, 0, 1, 0), snap(0.3, 0, 1, 0)])).toEqual([1, 1]);
  });
  it('porteurs et drones (instantané nul) ne gênent personne', () => {
    expect(vehicleGapFactors([snap(0, 0, 1, 0), null])).toEqual([1, 1]);
  });
});
