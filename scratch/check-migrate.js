"use strict";
// Test jetable de la logique de version-stepping de migrate() (state.js).
// Réplique la fonction pure (sans dépendances navigateur) pour valider les cas
// limites. Lancer : node scratch/check-migrate.js

const CURRENT_SAVE_VERSION = 1;
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

// Trace l'ordre d'application des migrations pour vérifier le séquencement.
const applied = [];
const MIGRATIONS = {
  // Exemples factices pour tester le moteur si CURRENT montait à 3 :
  // 0: (s) => { applied.push(0); s.a = 1; },
  // 1: (s) => { applied.push(1); s.b = 2; },
  // 2: (s) => { applied.push(2); s.c = 3; },
};

function migrate(raw) {
  const save = isPlainObject(raw) ? { ...raw } : {};
  let version = Number.isInteger(save.saveVersion) ? save.saveVersion : 0;
  while (version < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step) step(save);
    version += 1;
  }
  save.saveVersion = CURRENT_SAVE_VERSION;
  return save;
}

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error(`FAIL: ${label}`); }
};

// 1. Vieux save sans saveVersion (v0) -> estampillé à CURRENT, données conservées.
const legacy = migrate({ gold: 42, buildings: { foragers: 3 } });
check("legacy: version stamped", legacy.saveVersion === CURRENT_SAVE_VERSION);
check("legacy: data preserved", legacy.gold === 42 && legacy.buildings.foragers === 3);

// 2. Save déjà à la version courante -> inchangé (hors stamp).
const current = migrate({ saveVersion: 1, ruins: 7 });
check("current: version kept", current.saveVersion === 1);
check("current: data preserved", current.ruins === 7);

// 3. Save plus récent (downgrade) -> ramené au schéma courant sans crash.
const newer = migrate({ saveVersion: 99, foo: "bar" });
check("newer: clamped to current", newer.saveVersion === CURRENT_SAVE_VERSION);
check("newer: unknown field passes through (hydrate filtre ensuite)", newer.foo === "bar");

// 4. Entrées invalides -> objet vide estampillé, pas d'exception.
check("null input", migrate(null).saveVersion === CURRENT_SAVE_VERSION);
check("array input", migrate([1, 2]).saveVersion === CURRENT_SAVE_VERSION);
check("string input", migrate("nope").saveVersion === CURRENT_SAVE_VERSION);

// 5. migrate ne mute pas l'entrée d'origine.
const original = { saveVersion: 0, x: 1 };
migrate(original);
check("input not mutated", original.saveVersion === 0);

console.log(`Tests migrate : ${failures === 0 ? "OK" : failures + " échec(s)"} (CURRENT=${CURRENT_SAVE_VERSION}, applied=[${applied.join(",")}]).`);
process.exit(failures === 0 ? 0 : 1);
