# Manifeste de sprites — Cité isométrique pixel art

> Livrable de la **Phase 5** du plan ([plan-refonte-iso-CE.md](plan-refonte-iso-CE.md)).
> La liste exacte des images à trouver/créer, prête pour la chasse aux assets (Phase 6).
> Les clés de fichiers correspondent à `tileKey(kind, tier)` déjà dans le code
> (`src/game/render/iso/tileStyle.js`) → l'intégration (Phase 7) sera un simple branchement.

## Spécifications globales (figées)

| Paramètre | Valeur |
|---|---|
| Style | Pixel art net & lisible (city-builder classique) |
| Tuile de sol | **64×32 px** (losange iso 2:1) |
| Empreinte bâtiment | **1 tuile** (la grandeur passe par la HAUTEUR ; la silhouette peut déborder au-dessus/sur les côtés, l'empreinte au sol reste 1 case) |
| Direction de lumière | **Haut-gauche** (toutes les faces, packs comme sur-mesure) |
| Point d'ancrage | **Bas-centre** = pointe basse du losange (le « pied » du bâtiment posé au centre de la tuile) |
| Format | PNG 32 bits transparent, assemblés en atlas (Phase 6) |
| Palette | Reprend l'ambiance d'ère existante (`src/game/data/eraThemes.js`) |

## Les 5 paliers d'ère (l'axe « âge »)

| Palier | Époques source | Matériaux & silhouette | Palette | Sourcing |
|---|---|---|---|---|
| **T1 — Primitif** | feu, bois | Huttes basses, chaume/toits coniques, palissades, feux de camp, terre battue | Braise orange + ocre chaud | sur-mesure |
| **T2 — Antique / marchand** | pierre, couronne | Pierre claire à étage, halles, étals, tours de guet, premières murailles | Or parchemin + touche pourpre | packs |
| **T3 — Impérial / monumental** | marbre, fonte | Marbre, colonnes, dômes, forums ; bronze/cuivre patiné | Marbre clair + bleu lapis + cuivre | packs |
| **T4 — Industriel / mégalopole** | néon | Brique sombre, acier, verre, gratte-ciels, cheminées, enseignes | Gris acier + cyan néon froid | packs |
| **T5 — Cosmique** | noosphère (dominant) | **Jade bioluminescent** : structures organiques qui « respirent », lueur interne | Jade + accents lumineux | sur-mesure |

> **Hauteur par palier** (rappel `tileStyle`) : la ville monte avec l'âge. Multiplicateur
> de hauteur indicatif T1→T5 : **0.5× · 0.8× · 1.0× · 1.35× · 1.8×** (les dimensions
> ci-dessous sont données au palier de référence **T3 = 1.0×**).

## Les 15 familles (l'axe « type »)

Chaque famille = **5 fichiers** (`<kind>_t1` … `<kind>_t5`). Largeur ~64 (1 tuile),
hauteur indicative au palier T3, ancre bas-centre. Une silhouette plus large (halle,
aqueduc…) déborde sur canvas transparent mais garde son empreinte 1 tuile.

| Clé `kind` | Bâtiments du jeu regroupés | Archétype visuel | Dim. T3 (px) |
|---|---|---|---|
| `food` | Cueilleurs | hutte à vivres / cabane | 64×52 |
| `granary` | Entrepôts | silo / grenier trapu | 64×64 |
| `farm` | Champs irrigués | parcelle cultivée (au ras du sol) | 64×40 |
| `market` | Caravanes, Marchés | étals / halle à auvents | 80×56 |
| `craft` | Guildes | atelier / forge (cheminée) | 64×60 |
| `mill` | Moulins | moulin à roue à aube | 72×72 |
| `port` | Ports fluviaux | quai / embarcadère (sur l'eau) | 80×44 |
| `mint` | Hôtels des monnaies | petite frappe (enclume, pièces) | 64×64 |
| `bank` | Banques Nationales | grande banque à fronton / coffre | 72×80 |
| `knowledge` | Scribes, Conteurs, Écoles, Académies, Bibliothèques, Universités, Imprimeries, Think tanks | école / bibliothèque (colonnes, livres) | 64×76 |
| `temple` | Culte des ancêtres | sanctuaire / temple (autel, dôme sacré) | 72×84 |
| `observatory` | Observatoires | **tour à coupole (landmark haut)** | 64×108 |
| `civic` | Routes, Bureaucratie, Égouts, Tribunaux, Travaux publics, Ministères, Archives, Architectes de ruines | bâtiment civique / mairie | 64×64 |
| `aqueduct` | Aqueducs | arches d'eau | 96×64 |
| `watchtower` | Guet | **tour de garde crénelée / rempart** | 64×96 |

→ **15 familles × 5 paliers = 75 sprites de bâtiments.**

## Sols, eau & décor

| Catégorie | Clés | Dim. | Notes |
|---|---|---|---|
| Sol par palier | `ground_t1` … `ground_t5` | 64×40 | Losange + épaisseur de tuile. Terre→pavé→marbre→asphalte→trame jade. |
| Eau par palier | `water_t1` … `water_t5` | 64×40 | Au moins 1 image ; idéalement 2-3 trames pour l'anim (Phase 9). |
| Décor (optionnel) | `prop_<tier>_<n>` | variable | Arbres/rochers/lampes/feux par palier (~2-3 chacun) pour habiller le vide. |

→ **5 sols + 5 eaux + ~10-15 props ≈ 20-25 sprites d'ambiance.**

## Total & stratégie de sourcing

- **~75 bâtiments + ~25 ambiance ≈ 100 sprites.**
- **Packs (T2, T3, T4)** : 15 familles × 3 paliers = **45 bâtiments** + sols/eau associés → priorité Kenney (CC0) / itch `#isometric #city`, **une seule famille d'artiste** pour la cohérence.
- **Sur-mesure (T1 primitif + T5 cosmique jade)** : 15 familles × 2 paliers = **30 bâtiments** + sols/eau → IA pixel art ou commande, calés sur la tuile 64×32, lumière haut-gauche, palette du palier.

## Garde-fou (rappel du rythme)

Avant de produire les ~100 sprites : **tranche verticale** — produire et intégrer
**UN seul palier entièrement abouti** (proposé : **T2 Antique/marchand**, le mieux
servi par les packs) pour verrouiller la direction artistique et l'« envie de rester »
**avant** la production de masse.
