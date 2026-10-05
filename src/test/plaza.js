// Places de test (audit 2026-10-05, TEST-9) : cinq fichiers recopiaient l'un ou l'autre
// de ces deux plans. Aucun import.

// Une place carrée n×n de cellules `plaza` à partir de (gx0, gy0), seule dans son
// roadMap. `extra` : des cellules `plaza` ISOLÉES ailleurs sur la carte (elles existent
// en vrai et gonflaient la bbox à la ville entière avant le flood-fill).
export function plazaSquare(n, gx0 = 10, gy0 = 10, extra = []) {
  const roadMap = new Map();
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const gx = gx0 + ix, gy = gy0 + iy;
      roadMap.set(gx + "," + gy, { gx, gy, rank: "plaza" });
    }
  }
  for (const [gx, gy] of extra) roadMap.set(gx + "," + gy, { gx, gy, rank: "plaza" });
  return { roadMap };
}

// La même place, ceinte de rues (`street`) et déclarée au plan avec son `kind`, à la
// bande d'ère `band` : le layout minimal que lisent les compositions de place.
export function plazaWithStreets(n, kind, band = 3, gx0 = 10, gy0 = 10) {
  const { roadMap } = plazaSquare(n, gx0, gy0);
  const road = (gx, gy) => roadMap.set(gx + "," + gy, { gx, gy, rank: "street" });
  for (let i = -1; i <= n; i += 1) { road(gx0 + i, gy0 - 1); road(gx0 + i, gy0 + n); road(gx0 - 1, gy0 + i); road(gx0 + n, gy0 + i); }
  return { roadMap, plan: { plazas: [{ gx: gx0 + n / 2, gy: gy0 + n / 2, kind }] }, counts: { eraBand: band } };
}
