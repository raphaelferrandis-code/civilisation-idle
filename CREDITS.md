# Crédits — ressources externes

Ce fichier fait foi pour la conformité : **une ligne par pack réellement livré** dans le jeu
(web, .exe, Steam). Il a été réécrit le 2026-10-05 d'après l'inventaire de `dist/` de l'audit
(STEAM-1) ; le tenir à jour à chaque pack ajouté, modifié ou retiré.

## Règles

> ⛔ **Jamais en entrée d'un générateur.** Les sprites d'un pack sous licence ne doivent
> **jamais** être fournis à un générateur d'images tiers (PixelLab compris) : ce serait une
> redistribution.

> ⛔ **Aucun asset tiers BRUT dans `docs/`** (ni ailleurs dans le dépôt). Pas de planche de
> comparaison, de capture de pack ou d'extrait d'archive qui montre les sprites d'un pack tels
> quels : le dépôt n'est pas un jeu, et la plupart des licences interdisent la redistribution
> des fichiers eux-mêmes. Seuls les **dérivés embarqués** (recadrés, recolorés, cuits par leur
> script d'import) vivent dans `public/` ou `src/assets/`. Une planche d'étude montre les
> icônes **du jeu**, ou reste dans le bac à sable de la session (`scratchpad/`, non versionné).
> Les planches Raven et Crusenho de `docs/concepts/` ont été retirées pour cette raison le
> 2026-10-05 (audit STEAM-2) ; elles restent dans l'historique git tant que le dépôt n'est
> pas réécrit, d'où l'intérêt de le garder **privé**.

> **Archives non versionnées.** Les archives sources des packs ne sont pas dans git
> (`.gitignore` : `*.7z`, `/*.zip`, `/assets/`) ; chaque script d'import dit où les poser.

> **Onglet Crédits.** Chaque ligne dont la colonne « Repère » n'est pas vide a son crédit dans
> Options › Crédits, **en français ET en anglais**
> (`src/components/dialogs/OptionsDialog.jsx`). Un test le vérifie
> (`src/components/dialogs/__tests__/credits.test.js`) : ajouter un pack = ajouter sa ligne ici
> et dans l'onglet.

## Packs livrés

| Pack | Auteur | Page | Termes (commercial · crédit · redistribution · IA) | Crédit en jeu | Repère | Fichiers livrés | Import |
|---|---|---|---|---|---|---|---|
| Pixel Vehicles | MinZinn | <https://minzinn.itch.io/pixelvehicles> | **CC BY 4.0** : commercial oui, modification oui ; crédit + lien vers la licence + mention des modifications **obligatoires** partout où le jeu est diffusé | **exigé** | MinZinn | 164 bandes `public/pixelart/agents/vehicles/veh-*` : 116 bandes teintées (liste dans `src/game/map/vehicleSkins.js`) + 48 bandes nues de van, camion, bus, taxi, police, ambulance (la bande nue `veh-car-*` est la vieille automobile PixelLab) | `scripts/importPackVehicles.mjs` (+ `scripts/lib/packBake.mjs`) : recadrage, réduction, désaturation, quantification |
| Complete UI Book Styles Pack (Full, style `02_WizardBook`) | Crusenho Agus Hennihuno | <https://crusenho.itch.io/complete-ui-book-styles-pack> | commercial oui, modification oui ; crédit **avec lien vers la page produit** et mention des modifications ; revente interdite, même modifiée ; NFT interdits | **exigé** | Crusenho | 11 PNG `public/pixelart/ui/chrome/wizard/` (recolorés par remap exact) | `scripts/exportWizardChrome.mjs` |
| Pixel Playing Cards | Bit Digitalis | bitdigitalis.itch.io (page produit exacte à reporter) | commercial oui ; crédit demandé (`src/components/ui/cardSprites.js`) | **exigé** | Bit Digitalis | 54 PNG `public/pixelart/ui/cards/` : 52 cartes, `back.png`, `deck.png` (ramené à sa taille native) | copiés tels quels ; 6 cartes reposées 1:1 en éventail dans 2 icônes de succès (`public/pixelart/ui/achievements/VINGTETUN_*`, `scripts/bakeAchievementIcons.cjs`) |
| 16x16 Water Tiles Animated (Tile Set 1) | Zro Dfects | zrodfects.itch.io (page produit exacte à reporter) | commercial oui, modification oui ; crédit apprécié ; **redistribution du pack interdite** (`scripts/bakeWaterTiles.mjs`) | conseillé (présent) | Zro Dfects | 12 PNG `public/pixelart/water/river-tiles*.png` (remappés à la rampe ardoise du fleuve) | `scripts/bakeWaterTiles.mjs` |
| Pixel Art Top Down - Basic | Cainos | <https://cainos.itch.io/pixel-art-top-down-basic> | gratuit ; commercial oui ; **redistribution interdite** (`scripts/sliceCainosPlants.mjs`) ; crédit non exigé d'après l'en-tête du script — termes à relire sur la page avant la sortie | conseillé (présent) | Cainos | 15 touffes `public/pixelart/iso/deco/tuft-*.png`, 6 buissons `public/pixelart/iso/bush-1..6.png` et leurs 6 versions d'hiver `bush-N-winter.png` | `scripts/sliceCainosPlants.mjs` puis `scripts/remapPalette.mjs` ; hiver : `scripts/snowTrees.mjs` |
| Fantasy UI Borders (#030, clé grecque) | Kenney | <https://kenney.nl> | **CC0** (domaine public) : aucune condition | facultatif (présent) | Kenney | `src/assets/ui/topbar-frame.png` (teinté or) | à la main (commit `4bf0e16d`) |
| BigSoundBank (24 enregistrements : 9 de nature, deux merles, deux rouges-gorges, deux chouettes hulottes, une grenouille, deux corneilles ; 15 de la ville, des foules, des conversations, des enfants qui jouent, un marché, un carrefour, des pas, des chevaux, une roue qui grince) | Joseph Sardin ; Le tiroir du fond | <https://bigsoundbank.com> (une page par son : `scripts/sons/catalogue.json`) | **CC0 1.0** (domaine public) : commercial oui, modification oui, aucune restriction ; crédit « Joseph SARDIN - BigSoundBank.com » demandé par courtoisie, non exigé | facultatif (présent) | BigSoundBank | 39 `.ogg` `src/assets/sons/` (découpés, mono, normalisés ; les foules recomposées en grains pour qu'aucune langue ne s'y reconnaisse) | `scripts/importSons.mjs` d'après `scripts/sons/catalogue.json` ; sources dans `/assets/sons/bigsoundbank/` (non versionné) |
| « Track 5 », album « Ludum Dare 30 » | Abstraction (Benjamin Burnes) | <https://abstractionmusic.com> | selon les conditions de l'auteur : crédit avec titre de la piste, nom et lien ; usage commercial à reconfirmer sur son site avant la sortie | **exigé** | Abstraction | `src/assets/musiques/01 - Track 5 (Abstraction).ogg` | aucun : tout fichier du dossier devient un morceau (`src/assets/musiques/LISEZMOI.md`) |
| Font Awesome Free 6.7.2 | Fonticons, Inc. | <https://fontawesome.com> | icônes **CC BY 4.0** ; fichiers de police **SIL OFL 1.1** ; code (CSS) **MIT** (`LICENSE.txt` du paquet) | **exigé** | Fonticons | CSS + `fa-solid-900.woff2`/`.ttf`, intégrés au bundle (`dist/assets/`) | npm `@fortawesome/fontawesome-free`, importé par `src/index.css` |
| Polices Jersey 15, Pixelify Sans, Silkscreen, Inter | Sarah Cadigan-Fried ; Stefie Justprince ; Jason Kottke ; Rasmus Andersson | <https://fonts.google.com> | **SIL OFL 1.1** : commercial oui ; la notice de copyright et la licence accompagnent la police ; pas de vente de la police seule | **exigé** (notice) | SIL Open Font | 10 woff2 `src/assets/fonts/` | `scripts/vendorFonts.mjs` (génère `src/assets/fonts.css`) |

Volet **IA** de la colonne « Termes » : pas encore relevé pack par pack (seule la licence Raven,
écartée, l'interdisait noir sur blanc) ; d'ici là, la règle « Jamais en entrée d'un générateur »
vaut pour tous les packs du tableau. À relire sur chaque page avant la sortie, avec le reste.

Les bibliothèques de code intégrées au bundle (React, react-dom, scheduler, break_infinity.js,
pad-end : licence MIT) ont leurs notices dans Options › Crédits › licences logicielles
(`src/components/dialogs/SoftwareLicenses.jsx`, audit STEAM-5).

## Outil de génération : PixelLab

L'essentiel de l'art du jeu (bâtiments-moteur, habitants, véhicules d'époque, bateaux, tuiles de
sol, arbres, animaux, icônes de boutique, scènes, Maison des Plaisirs) est **pré-généré** avec
[PixelLab](https://www.pixellab.ai) (abonnement), puis retouché et quantifié par les scripts du
dépôt (`scripts/fetch*.mjs`, `scripts/quantize.cjs`, `scripts/remapPalette.mjs`…). Aucune
génération n'a lieu pendant la partie. Ce n'est pas un pack : aucun crédit n'est exigé — Raph a
tout de même voulu une ligne **« Génération d'images »** dans Options › Crédits (2026-10-05,
audit STEAM-7), en français et en anglais —, mais la déclaration « contenu généré par IA » de
Steam l'est — inventaire et brouillon dans
[`docs/STEAM-PUBLICATION.md`](docs/STEAM-PUBLICATION.md). Conditions d'utilisation :
<https://pixellab.ai/termsofservice> (vérifier l'usage commercial de toutes les générations, y
compris celles d'avant l'abonnement actuel).

## Retirés du jeu

- **2D Pixel Animal Character Pack** (LaserKiwi, <https://laserkiwi.itch.io/2d-pixel-animal-character-pack>)
  — bétail (vache, mouton, chèvre) et animaux de rue (chien, chat). **Retiré le 2026-10-05**
  (décision de Raph, audit STEAM-1) : la page n'a jamais publié de licence, et le pack est
  lui-même un export PixelLab d'un tiers. Ses 20 `critter-*.png` et
  `scripts/importPackAnimals.mjs` sont supprimés (ils restent dans l'historique git). Les
  bêtes sont revenues le même jour, **faites maison avec PixelLab** (vache, mouton, chèvre,
  chien, chat : planche `planches/animaux-maison`, validée par Raph ; manifeste des objets
  PixelLab dans sa `sources/manifest.json`) : mêmes noms de fichiers
  (`public/pixelart/agents/animals/critter-*.png`), `CRITTERS_ON = true`, feuilleton « La
  Chèvre des toits » rallumé. La curiosité « La vache » reste dessinée par le bœuf maison des
  attelages.

## Écartés après essai (rien d'embarqué)

- **Raven Fantasy Icons** — étudié le 2026-07-31 (`docs/AUDIT-ICONES-RAVEN.md`), pas adopté.
  Licence lue alors : redistribution des assets tels quels interdite. Ses planches de
  comparaison, qui montraient le pack brut, ont été retirées de `docs/concepts/icones-raven/`
  le 2026-10-05 (seule `jeu-icones-actuelles.png`, qui montre les icônes du jeu, est restée).
- **Complete UI Book Styles Pack** : seules les 11 pièces dérivées ci-dessus sont livrées ; les
  planches brutes du pack (`uibook-5-styles.png`, `uibook-zoom-boutons.png`,
  `wizard-candidats.png`, et `uibook-pieces-sur-fond-jeu.png` de la version gratuite) ont été
  retirées de `docs/concepts/ui-boutons/` le 2026-10-05. `wizard-exporte.png` y reste : il
  montre les 11 dérivés recolorés, ceux que le jeu livre.
- **16x16 Puny Characters** (Shade) — évalué le 2026-08-05 pour les habitants de la carte,
  écarté : aucun calage d'échelle ne convient (voir la fiche mémoire `pack-puny-characters`).
  Rien de ce pack n'est embarqué dans le dépôt.
