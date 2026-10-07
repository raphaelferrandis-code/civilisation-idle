// LES SONS ENREGISTRÉS DU PAYSAGE (docs/PLAN-AMBIANCE-SONORE.md, lot 2) : un DOSSIER,
// pas une liste à tenir, comme les musiques (audio/musiques.js).
//
// Tout fichier de `src/assets/sons/` devient un son du paysage, rangé par FAMILLE d'après
// le début de son nom : « oiseau-merle-1.ogg » est de la famille « oiseau ». Le
// directeur (paysage.js, SEMES) joue chaque famille là et quand elle vit — les oiseaux
// de jour dans la forêt à l'écran, la chouette la nuit… Une famille sans fichier se
// tait, simplement.
//
// Ces fichiers sont ÉCRITS par scripts/importSons.mjs (découpés, ramenés en mono,
// normalisés, encodés en Ogg) à partir des enregistrements que Raph dépose dans
// /assets/sons/, non versionné (règle Defender : il télécharge lui-même).
//
// DÉCLARÉS par import.meta.glob, jamais sondés par URL : la leçon de l'.exe (une chaîne
// de replis d'URL demande tous ses maillons). `?url` : on veut l'adresse du fichier,
// servie à côté du jeu, jamais son contenu dans le paquet JavaScript.
const FICHIERS = import.meta.glob('../../../assets/sons/*.{ogg,opus,mp3,m4a,webm,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// { chemin: url } → [{ id, famille, url }], trié par nom.
export function listeEnregistres(fichiers) {
  return Object.entries(fichiers || {})
    .map(([chemin, url]) => {
      const id = String(chemin).split('/').pop().replace(/\.[^.]+$/, '');
      return { id, famille: id.split('-')[0], url };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }));
}

export const ENREGISTRES = listeEnregistres(FICHIERS);

export function famille(nom, liste = ENREGISTRES) {
  return liste.filter((e) => e.famille === nom);
}
