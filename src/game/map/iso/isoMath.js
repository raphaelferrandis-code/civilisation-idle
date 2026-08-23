// Petits outils numériques partagés par les passes du rendu iso.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10, découpage). Ces deux helpers sont
// génériques : ils ne connaissent ni la carte, ni la caméra, ni le canvas. Les
// laisser dans isoRenderer aurait forcé chaque module extrait à importer DEPUIS
// lui — donc un cycle. Ce projet a déjà payé une perte de save sur un TDZ ; on ne
// rejoue pas ce motif pour deux lignes.
//
// ⚠ Le préfixe `_` de leurs noms date de leur vie de variables privées. Il est
// conservé tel quel : le déplacement doit rester PROUVABLE ligne à ligne, et
// renommer 17 sites d'appel dans la foulée mélangerait deux gestes.

// Partie fractionnaire, correcte pour les négatifs (contrairement à `x % 1`).
export const _frac = (x) => x - Math.floor(x);

// Bruit-hash déterministe [0,1) à partir de 2 entiers (graine mât + index particule).
export const _rnd = (s, i) => _frac(Math.sin(s * 12.9898 + i * 78.233) * 43758.5453);
