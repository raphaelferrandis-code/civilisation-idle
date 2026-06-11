"use strict";
// Test de non-régression jetable : compare l'ancienne boucle for et la formule
// fermée de la série géométrique utilisée dans buildingBatchCost.
// Lancer : node scratch/check-batchcost.js

// Ancienne version : somme terme à terme (base * scale^(count+i) * discount).
function loopSum(base, scale, count, batch, discount) {
  let total = 0;
  for (let i = 0; i < batch; i += 1) {
    const n = count + i;
    total += base * Math.pow(scale, n) * discount;
  }
  return total;
}

// Nouvelle version : somme fermée de la série géométrique × discount.
const geomSum = (B, s, n, k) =>
  s === 1 ? B * k : B * Math.pow(s, n) * (Math.pow(s, k) - 1) / (s - 1);
function closedSum(base, scale, count, batch, discount) {
  return geomSum(base, scale, count, batch) * discount;
}

const scales = [1, 1.07, 1.15];
const counts = [0, 10, 137];
const batches = [1, 25, 500];
const bases = [10, 12500];
const discounts = [1, 0.8];

const TOL = 1e-9;
let checked = 0;
let failures = 0;

for (const scale of scales) {
  for (const count of counts) {
    for (const batch of batches) {
      for (const base of bases) {
        for (const discount of discounts) {
          const a = loopSum(base, scale, count, batch, discount);
          const b = closedSum(base, scale, count, batch, discount);
          checked += 1;
          const denom = Math.max(Math.abs(a), 1);
          const relErr = Math.abs(a - b) / denom;
          if (relErr > TOL) {
            failures += 1;
            console.error(
              `FAIL scale=${scale} count=${count} batch=${batch} base=${base} discount=${discount} ` +
              `loop=${a} closed=${b} relErr=${relErr}`
            );
          }
        }
      }
    }
  }
}

console.log(`Vérifié ${checked} combinaisons, ${failures} échec(s) (tolérance relative ${TOL}).`);
process.exit(failures === 0 ? 0 : 1);
