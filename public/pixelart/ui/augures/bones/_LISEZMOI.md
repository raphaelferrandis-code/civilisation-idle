# Osselets de la Table des augures — gabarit Aseprite

## Le fichier à retoucher

**`bones.png`** — c'est LUI que le jeu charge. Tu le redessines, tu sauvegardes
par-dessus, tu recharges la page : c'est en jeu. Rien d'autre à faire.

Les autres fichiers sont des aides :

| fichier | à quoi ça sert |
|---|---|
| `_gabarit-vierge.png` | canevas vide aux dimensions exactes, pour repartir de zéro |
| `_guide.png` | planche de référence ×8 (grille de 8px + rampe) — à regarder, pas à peindre |
| `_palette.gpl` | la palette, à charger dans Aseprite |
| `bone-1/3/4/6.png` | les faces séparées, EN LECTURE SEULE : le jeu ne les charge pas et le script les régénère — pour bosser une face, édite la frame correspondante de `bones.png` |

## Le contrat (à respecter, sinon ça casse)

1. **Planche horizontale de 4 cadres carrés**, actuellement `128 × 32` = 4 × `32×32`.
2. **Ordre des faces, de gauche à droite : `1` · `3` · `4` · `6`.** Non négociable —
   le CSS cale la face tombée sur cette position, et l'animation de culbute fait
   défiler la planche dans cet ordre. Inverser deux cadres afficherait un 4 sur
   un jet de 3.
3. **Fond transparent.** Pas d'ombre portée peinte : le CSS en ajoute une
   (`drop-shadow`), tu la doublerais.
4. **Lumière en haut à gauche** — règle de tout le projet, les ombres tombent en
   bas à droite.
5. **Les pips portent l'information de jeu.** Ce n'est pas de la décoration : le
   joueur lit la valeur du jet dessus. Garde-les lisibles à la taille réelle.

Tu peux changer la taille source (par ex. `48×48`, donc une planche `192×48`) :
le CSS suit tout seul. Garde juste des cadres **carrés** et un facteur d'échelle
**entier** à l'écran (32 → 96px c'est ×3 ; 48 → 96px c'est ×2), sinon la grille
de pixels bave. ⚠ Le facteur doit rester entier AUSSI pour le repli petit écran
(`--bone: 64px` sous 720px dans `views-regulation.css`) : 64 n'est pas un
multiple de 48 — si tu passes en `48×48`, ajuste ce repli (48px ou 96px).

## Dans Aseprite

- **Ouvrir en frames** : `File → Import Sprite Sheet`, type *Horizontal*, taille
  `32 × 32`. Tu obtiens 4 frames éditables une à une.
  (Sinon, ouverture simple + `View → Grid Settings` à `32×32`.)
- **Charger la palette** : menu de la palette → `Load Palette` → `_palette.gpl`.
  Pas obligatoire, mais elle est **échantillonnée sur la fresque `osselets.png`**
  du jeu — la respecter garde les os raccord avec le bandeau.
- **Réexporter** : `File → Export Sprite Sheet`, *Horizontal*, 4 colonnes,
  **padding à 0**, vers `bones.png` (écrase le fichier).

## Deux pièges

- **Le script ne doit plus tourner.** `scripts/makeOsselets.mjs` a généré la
  version actuelle. Il refuse désormais d'écraser `bones.png` s'il détecte une
  retouche à la main (empreinte dans `.bones.stamp`). Mais `FORCE=1` passe
  outre : **ne le lance pas avec `FORCE=1`** après avoir dessiné.
- **Cache HTTP collant** sur les PNG de `public/` réécrits : si la page montre
  encore l'ancien dessin après sauvegarde, fais un rechargement dur
  (`Ctrl+Shift+R`).

## Rendu en jeu

Affichés à **96 px** (×3), en rangée de 4, espacés de 14 px, sur le fond sombre
de la scène (`rgb(14, 19, 32)`). Sous 720 px de large, repli à 64 px (×2).
La face `1` (le Chien) reçoit en plus un halo rouge par CSS — inutile de le
peindre.
