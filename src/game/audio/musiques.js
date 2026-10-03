// LES MUSIQUES DU JEU — un DOSSIER, pas une liste à tenir (demande de Raph du
// 2026-10-03 : « la possibilité de changer les musiques quand j'en rajouterai »).
//
// Tout fichier audio posé dans `src/assets/musiques/` devient un morceau : il
// apparaît sur la scène de la Maison des Plaisirs (◀ titre ▶) et dans Options › Son,
// sans une ligne de code. Ceux de `src/assets/musiques/scene/` sont les petites
// mélodies jouées quand on clique sur la scène ; tant qu'il n'y en a aucune, c'est
// celle du jeu, jouée par l'instrument de l'âge (melodieScene.js).
//
//   · L'ORDRE suit le nom du fichier, numéros compris (« 01 - … », « 02 - … ») ;
//   · le TITRE affiché est le nom sans son numéro ni son extension ;
//   · l'IDENTIFIANT retenu (localStorage) est le nom du fichier : renommer un
//     morceau fait revenir les joueurs qui l'avaient choisi au premier de la liste.
//
// `import.meta.glob` est résolu par Vite au build (et suivi en dev : un fichier
// ajouté recharge la page). `?url` : on veut l'ADRESSE du fichier, servie à côté
// du jeu (dist/assets), jamais son contenu dans le paquet JavaScript.
const FICHIERS = import.meta.glob('../../assets/musiques/*.{ogg,mp3,m4a,aac,wav,opus,flac,webm}', {
  eager: true,
  query: '?url',
  import: 'default'
});
const FICHIERS_SCENE = import.meta.glob('../../assets/musiques/scene/*.{ogg,mp3,m4a,aac,wav,opus,flac,webm}', {
  eager: true,
  query: '?url',
  import: 'default'
});

// « 01 - Track 5 (Abstraction).ogg » → « Track 5 (Abstraction) » ;
// « la-taverne_du_port.mp3 » → « La taverne du port ».
export function titreDe(chemin) {
  let nom = String(chemin).split('/').pop().replace(/\.[^.]+$/, '');
  nom = nom.replace(/^\d+\s*[-_.)]\s*/, '');
  // Un nom SANS espace s'écrit avec des tirets : on les rend en espaces. Avec des
  // espaces, il est déjà rédigé (et ses tirets sont voulus).
  if (!/\s/.test(nom)) nom = nom.replace(/[-_]+/g, ' ');
  nom = nom.trim();
  return nom ? nom.charAt(0).toUpperCase() + nom.slice(1) : String(chemin);
}

export function listeDe(fichiers) {
  return Object.entries(fichiers)
    .map(([chemin, url]) => ({ id: chemin.split('/').pop(), title: titreDe(chemin), url }))
    .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true, sensitivity: 'base' }));
}

export const MUSIQUES = listeDe(FICHIERS);
export const MELODIES_SCENE = listeDe(FICHIERS_SCENE);

export function musiqueParId(id) {
  return MUSIQUES.find((m) => m.id === id) || null;
}
