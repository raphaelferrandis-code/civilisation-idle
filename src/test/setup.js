// Préparation commune de TOUS les tests Vitest (vite.config.js, test.setupFiles).
//
// UN localStorage EN MÉMOIRE (audit 2026-10-05, TEST-2). Node n'en fournit pas :
// chaque test qui sauvegardait passait par le chemin d'ÉCHEC de save() (« localStorage
// is not defined », 327 piles d'erreur en CI qui noyaient les vrais avertissements),
// jamais par celui de la réussite. Il est posé AVANT l'import des fichiers de test :
// state.js lit la sauvegarde à son import (`export let state = load()`).
//
// Vidé avant chaque test : une partie écrite par un test ne fuit pas dans le
// suivant. Un test qui pose SON propre stockage (simulé, plein, qui lève…) le
// garde — ce fichier ne touche qu'au sien ; et un test qui retire le global pour
// exercer « pas de stockage » le retrouve neuf au test suivant.
import { beforeEach } from "vitest";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(String(key)) ? data.get(String(key)) : null),
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: (key) => { data.delete(String(key)); },
    clear: () => { data.clear(); },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}

export const memoryStorage = createMemoryStorage();

if (globalThis.localStorage === undefined) globalThis.localStorage = memoryStorage;

beforeEach(() => {
  if (globalThis.localStorage === undefined) globalThis.localStorage = memoryStorage;
  if (globalThis.localStorage === memoryStorage) memoryStorage.clear();
});
