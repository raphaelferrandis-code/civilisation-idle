// Les sons rendus HORS DU FIL PRINCIPAL (audit du 2026-10-05, PERF-41) : la synthèse
// des bruitages (slotsSynth.js) et de la mélodie de la scène (melodieSynth.js) est pure
// mais lourde — d'un bloc, 50 à 100 ms par gros son, autant d'images figées. Un Worker
// (synthese.worker.js) rend à la demande, dans l'ordre des demandes, et renvoie le
// Float32Array transféré ; chacun garde son cache côté page. Le Worker s'arrête quand il
// n'a plus rien à faire. Sans Worker (refusé, en erreur), la promesse échoue : chacun
// garde son repli sur le fil principal.
let ouvrier = null, horsService = false, num = 0, repos = null;
const attente = new Map();

function fermer() {
  if (ouvrier) ouvrier.terminate();
  ouvrier = null;
}
// Plus rien en attente depuis quelques secondes : le Worker rend sa mémoire.
function reposer() {
  clearTimeout(repos);
  if (!attente.size) repos = setTimeout(fermer, 5000);
}
function lancer() {
  if (ouvrier) return ouvrier;
  if (horsService || typeof Worker === 'undefined') return null;
  try {
    ouvrier = new Worker(new URL('./synthese.worker.js', import.meta.url), { type: 'module' });
  } catch {
    horsService = true;
    return null;
  }
  ouvrier.onmessage = (ev) => {
    const { id, data, err } = ev.data || {};
    const p = attente.get(id);
    if (!p) return;
    attente.delete(id);
    if (data) p.resolve(data); else p.reject(new Error(err || 'rendu vide'));
    reposer();
  };
  ouvrier.onerror = (ev) => {
    horsService = true;
    const e = ev.error || new Error(ev.message || 'Worker des sons en erreur');
    for (const p of attente.values()) p.reject(e);
    attente.clear();
    fermer();
  };
  return ouvrier;
}

// `tache` : { quoi: 'son', nom, look } | { quoi: 'ronron', look } | { quoi: 'melodie', band }.
// Rend une promesse du Float32Array.
export function rendreAilleurs(tache) {
  const w = lancer();
  if (!w) return Promise.reject(new Error('sans Worker'));
  clearTimeout(repos);
  return new Promise((resolve, reject) => {
    num += 1;
    attente.set(num, { resolve, reject });
    w.postMessage({ ...tache, id: num });
  });
}
