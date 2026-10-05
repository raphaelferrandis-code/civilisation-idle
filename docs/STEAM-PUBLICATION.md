# Publication Steam — déclarations et brouillons prêts à copier

Rédigé le 2026-10-05 (audit du 05/10, entrées STEAM-6 et STEAM-7) à partir de faits vérifiés
dans le dépôt : chaque affirmation renvoie au fichier qui la prouve. Steamworks change la
formulation de ses questionnaires : **relire les cases au moment de remplir**, puis reporter ici
ce qui a été réellement envoyé (date, version du build), pour que la prochaine mise à jour
reparte de la vérité.

À tenir à jour : tout ajout plus osé dans la Maison des Plaisirs, tout nouveau jeu d'argent, toute
nouvelle source d'images (pack, outil d'IA) se reporte ici **avant** la mise en ligne du build.

---

## 1. Questionnaire de contenu mature (STEAM-6)

### 1.1 Ce que le jeu montre (faits)

**La Maison des Plaisirs** — onglet ouvert très tôt : dès que l'un de ses jeux est débloqué
(`src/game/core/actions/tick.js`, fait `plaisirs` ; tickets à gratter à `bestEra ≥ 2`), encore
dans l'âge du Feu ; la façade est sur la carte dès `PLAISIRS_OPEN_ERA = 2`
(`src/game/map/layout.js`). Elle reste ouverte après un effondrement. **Aucune option ne la
masque** aujourd'hui.

- Danseuses, hôtesses et courtisanes en pixel art (32 px), une troupe par âge
  (`src/game/map/iso/plaisirsCast.js`, dessinées par `scripts/plaisirsGirls.mjs`) :
  - corps en sablier, poitrine exagérée « type push-up » qui **rebondit** à la marche et à la
    danse ;
  - tenues révélatrices : ventre nu, haut « bandeau » qui **laisse voir le dessous des seins**
    (troupe du Feu, bacchante et danseuse antiques : `scripts/plaisirsGirls.mjs`, commentaires
    du buste et du bandeau), robes fendues (hétaïre, courtisane), justaucorps échancré et
    résilles (la revue), cancan ;
  - **pas de nudité explicite** : ni mamelons ni sexe ne sont dessinés (planches regardées à ×8
    le 05/10 : troupe du Feu, alanguies).
- 8 **courtisanes alanguies**, allongées sur le meuble de leur époque, posées dans les
  antichambres (`scripts/plaisirsAlanguies.mjs`) — habillées.
- **Gigolos** torse nu (gilet ouvert, nœud papillon) au service et au bar
  (`scripts/plaisirsGirls.mjs`, section « LES GIGOLOS »).
- Thème de **maison close** assumé : « la maison close Belle Époque » (troupe de la Fonte,
  `plaisirsCast.js`), « Courtisane · Maison des Plaisirs » dans la fiche d'habitant
  (`src/game/map/iso/isoPlaisirs.js`) ; la nuit, au boudoir, **un couple enlacé en ombre
  derrière une vitre sur deux**, et une danseuse jambe levée en ombre chinoise au cabaret
  (`src/game/map/iso/plaisirsBake.js`, « LA VIE DES ÉTAGES »).

**Jeux d'argent simulés** (aucun argent réel) :

- les osselets (dés), les tickets à gratter, le vingt-et-un (avec un videur qui raccompagne les
  compteurs de cartes), le vol d'Icare (jeu de « crash »), la roulette, les courses de chevaux, le
  duel de dés contre le grand flambeur, la **machine à sous** (5 rouleaux, tours gratuits, roue,
  Hold & Win, jackpots MINI / MAJEUR / GRAND : `src/game/core/actions/slots.js`) ;
- une roue offerte chaque heure (`src/game/core/actions/roueMaison.js`), une « Nuit du Grand
  Jeu » toutes les trois heures, des titres de fidélité façon casino (Familier → Prince de la
  Maison), un mode « Laisser courir » et des automatisations qui jouent seules ;
- **la monnaie est la Faveur, gagnée uniquement en jeu** : aucun achat, aucun retrait, aucun
  code de paiement dans le dépôt (vérifié : ni Steamworks, ni boutique, ni microtransaction ; la
  Faveur ne s'obtient que par le jeu).
- L'Aide (Options › Aide › « Les tables ») décrit désormais tous ces jeux, machine à sous
  comprise (`src/game/data/helpChapters.js`, gardé par `helpChapters.test.js`).

**Alcool** : références visuelles seulement (le bar de la Maison, l'échanson et les hôtesses
« cocktail » de la revue), sans mécanique de jeu.

**Violence** : émeutes stylisées pendant les crises — silhouettes avec torches et fourches
(`src/game/map/quaysAndRiot.js`, `drawRiotWeapon`), **sans sang ni mort montrée**. Effondrement
des civilisations raconté, pas montré de façon violente.

### 1.2 Brouillon des réponses

Cases à cocher (intitulés du formulaire de 2024-2025, à relire) :

- ☑ **Some Nudity or Sexual Content** — tenues révélatrices, dessous des seins visible, thème de
  maison close, silhouettes enlacées ; aucune nudité explicite, aucun acte sexuel.
- ☑ **General Mature Content** — jeux de casino simulés avec une monnaie de jeu uniquement
  (impossible à acheter ou à retirer) ; références à l'alcool.
- ☐ Frequent Violence or Gore — non (émeutes stylisées, ni sang ni gore).
- ☐ Adult Only Sexual Content — non.
- ☐ Gratuitous Sexual Content — non.

Description affichée sur la page du magasin — **anglais** :

> This game contains suggestive content: stylized pixel-art dancers, hostesses and courtesans in
> revealing outfits (bare midriffs, low-cut tops showing the underside of the breasts, slit
> dresses, fishnets) in a brothel-themed "House of Pleasures", shirtless male hosts, and
> embracing couples seen as silhouettes behind windows. There is no explicit nudity and no
> sexual act is shown. The game also features simulated gambling (dice, scratch cards,
> blackjack, roulette, horse races, a crash game and a slot machine) played only with an in-game
> currency that cannot be bought with real money or cashed out, and references to alcohol.

Même description — **français** :

> Ce jeu contient du contenu suggestif : danseuses, hôtesses et courtisanes en pixel art, en
> tenues révélatrices (ventre nu, hauts échancrés laissant voir le dessous des seins, robes
> fendues, résilles), dans une « Maison des Plaisirs » au thème de maison close, des hôtes torse
> nu et des couples enlacés vus en ombre derrière des fenêtres. Aucune nudité explicite, aucun
> acte sexuel n'est montré. Le jeu propose aussi des jeux d'argent simulés (dés, tickets à
> gratter, vingt-et-un, roulette, courses de chevaux, jeu de « crash », machine à sous) joués
> uniquement avec une monnaie de jeu qui ne s'achète pas et ne se retire pas, ainsi que des
> références à l'alcool.

Classification d'âge (questionnaire IARC demandé par Steam) : répondre dans le même sens —
nudité partielle / contenu sexuel suggestif, **jeu de hasard simulé**, références à l'alcool,
violence légère et stylisée.

### 1.3 Captures de référence à joindre ici avant l'envoi

Pas encore prises (elles demandent une partie avancée) : la scène de la Maison avec la troupe du
Feu (âges 0-1), la troupe de la Fonte (cancan), une antichambre avec une alanguie, le boudoir de
nuit (ombres enlacées), la machine à sous pendant un Hold & Win. Les ranger dans
`docs/steam/captures/` (PNG du jeu, pas d'asset tiers brut : cf. `CREDITS.md`).

### 1.4 Question ouverte pour Raph

Une case « Maison des Plaisirs : tenues sages » (repli déjà prévu sur les femmes du jeu
d'habitants, `plaisirsCast.js`) permettrait de viser une classification plus basse et rassurerait
les streamers. C'est un choix de conception : rien n'est codé.

---

## 2. Déclaration « contenu généré par IA » (STEAM-7)

Le formulaire distingue le contenu **pré-généré** (créé avec des outils d'IA pendant le
développement) et le contenu **généré en direct** (créé pendant que le jeu tourne). Valve affiche
la réponse sur la page du magasin.

### 2.1 Généré en direct : **aucun**

Le jeu n'appelle aucun service d'IA ni aucun serveur pendant la partie : aucun `fetch` vers une
URL distante dans `src/`, aucune mention de pixellab.ai, Anthropic ou OpenAI dans `src/`,
`main.cjs` ou `preload.cjs` (vérifié le 05/10). La seule écriture hors du dossier du jeu est le
miroir de la sauvegarde vers un dossier Google Drive local quand il existe (.exe) : une copie de
fichier, qui ne génère rien.

### 2.2 Pré-généré : l'inventaire

Ordres de grandeur au 05/10, sur ~4 990 PNG de `public/pixelart/` :

| Famille | Origine | Où | Preuve |
|---|---|---|---|
| Bâtiments-moteur, maisons, ruines, scènes iso | **PixelLab** (IA), puis retouche et quantification | `agents/buildings` (424), `houses` (84), `ruins` (210), `iso` (~590) | `scripts/fetchBuildings.mjs`, `fetchProps.mjs`, `fetchHouseSkin.mjs`, `fetchIsoTiles.mjs`, `fetchIsoPhase5.mjs`, `fetchStageScene.mjs`, `fetchCosmicScene.mjs` ; fiche DA PixelLab dans `public/pixelart/README.md` |
| Habitants de la carte, émeutiers | **PixelLab** | `agents/inhabitants` hors `plaisirs-*` (~1 760), `agents/events` (256) | `scripts/fetchAgents*.mjs`, `fetchFarmer.mjs`, `fetchRiot*.mjs` |
| Véhicules d'époque, bêtes de trait (cheval, bœuf), bateaux | **PixelLab** | `agents/vehicles` hors pack MinZinn (~146), `agents/animals` (8), `agents/boats` (7) | `scripts/fetchVehicles*.mjs`, `fetchDraftAnimals.mjs`, `fetchBoats.mjs`, `fetchBoatAnims.mjs` |
| Tuiles de sol, places, mobilier, fontaines, arbres | **PixelLab** | `iso/`, `places/` | `scripts/fetchGroundTiles.mjs`, `fetchPlazaProp.mjs`, `fetchPlazaAnim.mjs`, `fetchFountainAnims.mjs`, `installVegetation.mjs` (« generate-with-style-v2 ») |
| Icônes d'interface et de boutique, arbre des Ruines | **PixelLab** (Pixflux, API v2, Pro) | `ui/` hors cartes et chrome (~530), `boutique/` (47), `ruins-tree/` | `scripts/bakeUiIcons.cjs` (en-tête : « générées par Pixflux »), `scripts/ruinsPixellab.mjs`, `src/components/views/ruinsTree/sapMaterials.js` |
| Courtisanes alanguies de la Maison | **PixelLab** (« Create Image (Pro) ») avec la fille de l'âge du jeu en référence | 8 `plaisirs-*-alanguie.png` | `scripts/plaisirsAlanguies.mjs`, tirages bruts dans `art/plaisirs/pixellab/` |
| Filles, troupes et gigolos de la Maison | **Dessinés pixel par pixel dans le code** (grilles de lettres), après rejet de deux passes PixelLab ; sources Aseprite exportées | ~608 bandes `plaisirs-*` | `scripts/plaisirsGirls.mjs`, `art/plaisirs/*.aseprite` |
| Petite vie (oiseaux, canards, chiens, chats…), décors des faits divers, merveilles, Maison des Plaisirs sur la carte et sa coupe | **Dessinés pixel par pixel dans le code**, cuits à l'exécution (pas de PNG) | — | `src/game/map/iso/vieArt.js`, `src/game/map/faitsDivers/fdArt.js`, `src/game/map/iso/wonderBake.js`, `src/game/map/iso/plaisirsBake.js` |
| Osselets des âges anciens | **Dessinés à la main par Raph** (Aseprite, après le refus d'une version procédurale) | `ui/augures/bones/bones.png` | `src/components/ui/plaisirsMaterial.js` (en-tête) |
| Packs d'artistes tiers (véhicules modernes, chrome, cartes, eau, herbes, cadre) | humains d'après leurs pages (non vérifiable par nous) | ~270 fichiers | tableau de `CREDITS.md` |
| Musique | **compositeur humain** (Abstraction) | `src/assets/musiques/` | `CREDITS.md` |
| Sons | synthétisés par le code à l'exécution | — | `src/game/audio/synth.js` |
| Code (et le dessin « pixel par pixel » ci-dessus) | écrit avec un **assistant de programmation IA** (Claude, Anthropic), sous la direction et la relecture de Raph | tout le dépôt | 732 commits sur 757 portent « Co-Authored-By: Claude » (`git log`, 05/10) |

Le pack LaserKiwi (bétail, chiens, chats), lui-même un export PixelLab d'un tiers sans licence, a
été **retiré du jeu** le 05/10 (`CREDITS.md`, « Retirés du jeu ») : il n'est plus à déclarer.

### 2.3 Le processus de retouche (à résumer dans le formulaire)

1. **Génération guidée** : chaque famille suit une fiche de direction artistique fixe (vue,
   lumière haut-gauche, palette réduite, contour fin ; suffixe de prompt identique pour toute une
   série : `public/pixelart/README.md`), parfois avec une image du jeu en référence de style
   (`scripts/installVegetation.mjs`, alanguies de `scripts/plaisirsAlanguies.mjs`).
2. **Sélection** par Raph parmi plusieurs tirages ; les refus sont nombreux (les filles de la
   Maison ont été entièrement redessinées après deux passes, cf. `scripts/plaisirsGirls.mjs`).
3. **Mise au propre par scripts** : quantification sur la palette du jeu
   (`scripts/quantize.cjs`, `scripts/remapPalette.mjs` en OKLab), cuisson à la taille d'affichage
   (`scripts/bakeUiIcons.cjs`), alpha binarisé, découpe des bandes d'animation.
4. **Retouche à la main** quand il le faut (Aseprite : sources `art/`, `.aseprite`), et
   relevés au pixel faits dans le code (fenêtres de nuit, ancrages, occlusions).
5. Règle tenue depuis le début : **aucun sprite d'un pack tiers n'est donné en entrée à
   PixelLab** (`CREDITS.md`). Les générations faites par l'outil MCP ou l'API REST n'ont pas laissé
   de journal ; la règle n'est donc attestée que par les scripts versionnés.

### 2.4 Brouillon de la déclaration

**Anglais** (champ « Pre-Generated ») :

> Most of the game's pixel art (buildings, townsfolk, vehicles, boats, ground tiles, trees,
> interface and shop icons, some scenes) was generated with the PixelLab AI tool, following a
> fixed art direction, then selected, palette-reduced, resized and retouched by the developer.
> Other sprites were drawn pixel by pixel in code with the help of an AI coding assistant, which
> was also used to write the game's code; a few were drawn by hand by the developer. The music
> was composed by a human artist (Abstraction), and several art packs by human artists are
> credited in the game. No content is generated by AI while the game is running: the game makes
> no calls to AI services.

**Français** :

> L'essentiel du pixel art du jeu (bâtiments, habitants, véhicules, bateaux, tuiles de sol,
> arbres, icônes d'interface et de boutique, certaines scènes) a été généré avec l'outil d'IA
> PixelLab, selon une direction artistique fixe, puis sélectionné, ramené à la palette du jeu,
> redimensionné et retouché par le développeur. D'autres sprites ont été dessinés pixel par pixel
> dans le code avec l'aide d'un assistant de programmation IA, qui a aussi servi à écrire le code
> du jeu ; quelques-uns ont été dessinés à la main par le développeur. La musique est l'œuvre
> d'un compositeur (Abstraction), et plusieurs packs graphiques d'artistes sont crédités dans le
> jeu. Aucun contenu n'est généré par IA pendant la partie : le jeu n'appelle aucun service d'IA.

**Généré en direct** : ne rien cocher.

### 2.5 À vérifier avant d'envoyer

- Les conditions d'utilisation de PixelLab (<https://pixellab.ai/termsofservice>) couvrent-elles
  l'usage commercial de **toutes** les générations, y compris celles faites avant l'abonnement
  actuel ? Garder une copie datée des conditions lues.
- Selon la formulation du formulaire du moment, l'assistant de code (Claude) doit-il être
  mentionné ? Le brouillon le mentionne par prudence, parce qu'il a aussi « dessiné » des sprites
  dans le code ; si Valve exclut explicitement les outils de développement, la phrase sur le code
  peut tomber, pas celle sur les sprites.
- Les textes du jeu (FR/EN) : à Raph de dire quelle part a été rédigée avec l'assistant ; s'il y
  en a une, ajouter « and to help write the in-game texts ».

---

## 3. Crédits pour la page du magasin

Les licences des packs demandent un crédit « partout où le jeu est diffusé » (MinZinn, CC BY 4.0)
ou un lien vers la page produit (Crusenho). L'onglet Options › Crédits du jeu le fait ; pour la
page Steam (section « À propos » ou mentions légales), bloc prêt à coller :

> Credits — Modern vehicles: "Pixel Vehicles" by MinZinn (minzinn.itch.io/pixelvehicles), CC BY
> 4.0 (creativecommons.org/licenses/by/4.0), modified. Interface chrome: "Complete UI Book Styles
> Pack" by Crusenho Agus Hennihuno (crusenho.itch.io/complete-ui-book-styles-pack), modified.
> Playing cards: "Pixel Playing Cards" by Bit Digitalis. Water tiles: Zro Dfects. Grass and
> bushes: "Pixel Art Top Down - Basic" by Cainos. Golden frame: Kenney (CC0). Music: "Track 5"
> from "Ludum Dare 30" by Abstraction (abstractionmusic.com). Icons: Font Awesome Free by
> Fonticons, Inc. (CC BY 4.0 / SIL OFL 1.1 / MIT). Typefaces: Jersey 15, Pixelify Sans,
> Silkscreen, Inter (SIL OFL 1.1).

Tableau complet, termes et fichiers : `CREDITS.md`.
