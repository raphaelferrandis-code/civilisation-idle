// Textes de licence livrés avec le jeu (audit 2026-10-05, STEAM-5) : MIT et
// OFL imposent que chaque copie du jeu porte la notice de copyright et le texte
// de la licence. Lus à la demande (onglet Crédits) plutôt qu'intégrés au
// bundle : une dizaine de Ko que personne ne lit à chaque lancement.
//   · THIRD-PARTY-LICENSES.md — React, react-dom, scheduler, break_infinity.js,
//     pad-end. PRODUIT PAR LE BUILD (vite.config.js, build.license) : absent en
//     dev, présent dans dist/ et dans l'.exe ;
//   · OFL-polices.txt — les quatre polices (public/licenses/) ;
//   · FontAwesome-LICENSE.txt — copie du LICENSE.txt du paquet (icônes CC BY 4.0,
//     police OFL, code MIT), que la minification du CSS ne garde pas.
export const LICENSE_FILES = [
  'licenses/THIRD-PARTY-LICENSES.md',
  'licenses/OFL-polices.txt',
  'licenses/FontAwesome-LICENSE.txt',
];

const SEPARATOR = '\n\n' + '-'.repeat(72) + '\n\n';

// Chemin RELATIF au document (base './') : marche en https, en app:// (.exe) et
// hors ligne. Un fichier manquant est sauté, jamais une erreur.
export async function loadLicenseTexts(fetchImpl = globalThis.fetch) {
  const parts = await Promise.all(LICENSE_FILES.map(async (file) => {
    try {
      const rep = await fetchImpl('./' + file);
      if (!rep || !rep.ok) return null;
      const text = await rep.text();
      // Le serveur de dev répond la page du jeu (200) pour un fichier absent.
      return /^\s*<!doctype html/i.test(text) ? null : text.trim();
    } catch {
      return null;
    }
  }));
  return parts.filter(Boolean).join(SEPARATOR);
}
