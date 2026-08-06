# Crédits — ressources externes

Les archives sources de ces packs ne sont **pas** versionnées (`.gitignore` : `*.7z`, `/*.zip`,
`/assets/`). Seuls les sprites dérivés embarqués dans `public/pixelart/` le sont.

> ⛔ Règle commune à tous les packs sous licence : leurs sprites ne doivent **jamais** être fournis
> en entrée à un générateur d'images tiers (PixelLab compris), ce serait une redistribution.

## Packs utilisés

À documenter au fil des passages (auteur, URL, termes exacts) :

- **Pixel Vehicles** (MinZinn, <https://minzinn.itch.io/pixelvehicles>) — flotte moderne des ères 5
  et 6 : voitures (5 modèles × 4 teintes), bus, camion, camionnette, taxi, police, ambulance.
  Licence **Creative Commons Attribution 4.0** : l'attribution ci-dessus est OBLIGATOIRE partout où
  le jeu est diffusé. Sprites dérivés par `scripts/importPackVehicles.mjs` (recadrage, réduction à
  la taille de rendu, désaturation, quantification) — l'archive `TopDown Vehicles v1.17.zip` reste
  hors dépôt.
- **2D Pixel Animal Character Pack** (LaserKiwi, <https://laserkiwi.itch.io/2d-pixel-animal-character-pack>)
  — bétail (vache, mouton, chèvre) et animaux de rue (chien, chat).
  ⚠ **Licence non affichée sur la page itch.io** au 2026-08-05 : téléchargement gratuit, mais aucun
  terme publié. À confirmer auprès de l'auteur avant toute diffusion publique du jeu ; en cas de
  refus, `scripts/importPackAnimals.mjs` et les 20 sprites `critter-*` se retirent d'un bloc (le
  rendu ne dessine rien si les fichiers manquent).
- Raven Fantasy Icons — icônes d'interface
- Bit Digitalis — cartes du Vingt-et-un
- Crusenho, *Complete UI Book Styles* — cadres et panneaux d'interface
- Kenney — tuiles et éléments d'interface (CC0)
- Cainos — végétation top-down (touffes conservées)
- Packs d'eau et de sol isométrique — surfaces animées et matières du sol

## Écartés après essai

- **16x16 Puny Characters** (Shade) — évalué le 2026-08-05 pour les habitants de la carte, écarté :
  aucun calage d'échelle ne convient (voir la fiche mémoire `pack-puny-characters`). Rien de ce pack
  n'est embarqué dans le dépôt.
