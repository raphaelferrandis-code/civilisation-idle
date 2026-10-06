# Succès Steam — liste, suivi, pont Steamworks

Rédigé le 2026-10-06 (audit du 05/10, entrée STEAM-9, décision de Raph : « beaucoup de succès qui
accompagnent la progression du joueur ; l'App ID sera créé plus tard → préparer définitions FR/EN +
suivi + pont Steamworks optionnel + doc »).

**État : tranches 1 et 2 faites** (liste, conditions, suivi dans la sauvegarde, pont, export ; puis
la liste des succès dans la Chronique et les icônes 64×64 débloqué / verrouillé, décision de Raph :
« oui pour les deux »). Reste l'App ID, à créer plus tard (§ 4).

---

## 1. Ce qui est en place

| Morceau | Fichier | Ce qu'il fait |
|---|---|---|
| La liste | `src/game/data/achievements.js` | 80 succès : nom d'API, famille, nom et condition en FR et EN, caché ou non. Module pur. |
| Les conditions | `src/game/core/achievements.js` | Lues sur l'état toutes les 5 s par la boucle de jeu (`main.js`), et une fois au lancement. |
| Le suivi | `state.achievements` | `{ [nom d'API]: horodatage du déblocage }` — survit au Grand Reset, normalisé au chargement. |
| Effondrements à vie | `chronicleStats.collapses` | Compté à chaque chute (`recordCollapse`) ; semé depuis `cycles` (+10 si le sceau I est réclamé) pour une save d'avant. |
| Le pont | `preload.cjs` (`window.civSteam`), `main.cjs`, `desktopFiles.cjs` (`createSteamAchievements`) | Envoie chaque déblocage au process principal, qui l'active dans Steamworks s'il répond. |
| L'export | `scripts/exportSteamAchievements.mjs` → `docs/steam/succes.json`, `docs/steam/succes.csv` | Les fichiers à reporter sur le site Steamworks, chemins des deux icônes compris. |
| Les icônes | `scripts/bakeAchievementIcons.cjs` → `public/pixelart/ui/achievements/<ID>.png` et `<ID>-gris.png` | 64×64, débloquée (couleur) et verrouillée (gris assombri) ; les mêmes fichiers servent le jeu et Steam. |
| La liste dans le jeu | `src/components/ui/AchievementsChronique.jsx` (Chronique › la Bibliothèque, sous les trois colonnes) | Une icône par succès, rangée par famille ; nom, condition et date dans l'infobulle. |
| Les tests | `src/game/core/__tests__/achievements.test.js`, `achievementIcons.test.js`, `src/components/ui/__tests__/achievementsChronique.test.jsx`, `src/__tests__/steamAchievementsBridge.test.js` | Liste complète et cohérente avec le jeu, déblocage, sauvegarde, pont, export à jour, deux icônes 64×64 par succès, affichage (secrets cachés, aucune phrase à l'écran). |

### Les icônes

D'abord l'art **déjà dans le jeu**, suivi par git et d'origine connue, sans aucune réduction :
emblèmes de l'arbre des Ruines (maîtres 64 px de `art/emblemes-ruines/`), icônes des Mythes,
couronne, colonne, Icare, mises et faces des osselets (le dessin de Raph), amphore de la Faveur
(×2), cartes du vingt-et-un (pack Bit Digitalis, crédité : posées en éventail, pixels 1:1), icônes
de la boutique (32 px agrandies ×2 au plus proche voisin). Les symboles de tickets de
`public/pixelart/ui/scratch/` n'ont pas servi : jamais committés, d'origine inconnue (ASSET-9).
Pour les succès sans art existant (les Mythes sans emblème, une partie de la Maison, quelques
jalons), **22 icônes PixelLab** générées directement en 64×64 (palette forcée sur
`public/pixelart/master-palette.gpl`), gardées telles quelles dans `art/succes/`. La table succès →
source est en tête du script ; planche de validation : `planches/succes/icones-succes.png` (hors
dépôt, à côté du dossier du jeu).

La version grise : luminance, contraste resserré, assombrie, même silhouette. Dans la Chronique,
un succès verrouillé montre son icône grise ; un **secret** pas encore révélé ne montre ni son
icône ni son nom (un « ? »), comme sur Steam.

Steam demande des icônes de 64×64 en JPG ou PNG : les fichiers s'envoient tels quels (fond
transparent). Si Valve venait à réclamer 256×256, un agrandissement ×4 au plus proche voisin
tombe juste.

Comment le jeu décide :

- une condition ne lit que des champs déjà tenus à jour (registre de la Chronique, sceaux, Mythes,
  pics du cycle, rang de la Maison, faits divers) : rien n'est recalculé, et rien ne tourne au tick ;
- une ancienne sauvegarde reçoit au premier lancement tout ce qu'elle a déjà mérité (un seul
  toast « 🏆 N succès » et une seule ligne de journal) ;
- un succès ne se reperd jamais (ni chute, ni Grand Reset) ; il ne s'annonce pas pendant la chute
  (deuil, cinématique) : il attend la relecture suivante ;
- au lancement, toute la liste débloquée repart vers Steam ; le process principal n'active que ce
  qui manque. Un succès gagné hors Steam, ou avant que l'App ID existe, rejoint donc Steam au premier
  lancement où le client répond.

## 2. La liste

La référence est `docs/steam/succes.json` (noms et descriptions sous les codes de langue de Steam,
`french` et `english`) ; `docs/steam/succes.csv` est la même chose pour un tableur. Après toute
retouche de `src/game/data/achievements.js` : `node scripts/exportSteamAchievements.mjs` (le test
échoue tant que les deux fichiers ne suivent pas).

Les 16 succès **cachés** : les onze sceaux (le jeu masque un sceau tant qu'il n'est pas découvert),
le Ragnarök, le ciel d'Atlas qui écrase la cité, le coup du Chien, le videur, le mariage de Nancy et
William. Dans le jeu, un secret déjà « révélé » ailleurs (sceau découvert, pacte du Ragnarök
annoncé, amoureux déjà croisés) peut montrer son nom avant d'être débloqué.

### Les ères (10)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `ERE_HAMEAU` | Les premiers sentiers | The First Trails | Atteindre l'ère du Hameau. |  |
| `ERE_VILLAGE` | La terre partagée | The Divided Land | Atteindre l'ère du Village. |  |
| `ERE_BOURG_MARCHAND` | L'or et l'étranger | Gold and the Stranger | Atteindre l'ère du Bourg marchand. |  |
| `ERE_CITE_FORTIFIEE` | Inventer l'ennemi | Inventing the Enemy | Atteindre l'ère de la Cité fortifiée. |  |
| `ERE_ROYAUME` | Un sceptre pour les provinces | One Scepter for the Provinces | Atteindre l'ère du Royaume. |  |
| `ERE_EMPIRE` | Au bord de sa propre chute | On the Brink of Its Own Fall | Atteindre l'ère de l'Empire. |  |
| `ERE_METROPOLE` | Une mer humaine | A Human Sea | Atteindre l'ère de la Métropole. |  |
| `ERE_SINGULARITE` | Le titan de métal | The Titan of Metal | Atteindre l'ère de la Singularité. |  |
| `ERE_CONSCIENCE` | La cité devenue monde | The City Became the World | Atteindre l'ère de la Conscience planétaire. |  |
| `ERE_DYSON` | Pas un photon perdu | Not a Photon Wasted | Atteindre l'ère de la Sphère de Dyson. |  |

### Les chutes (9)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `CHUTE_PREMIERE` | Tout ce qui s'élève | All That Rises | Traverser un premier effondrement. |  |
| `CHUTE_10` | Le pli de l'histoire | The Fold of History | Traverser 10 effondrements. |  |
| `CHUTE_50` | Mémoire des cendres | Memory of Ashes | Traverser 50 effondrements. |  |
| `CHUTE_100` | Cent fois sur le métier | A Hundred Times Over | Traverser 100 effondrements. |  |
| `CHUTE_250` | L'éternel retour | The Eternal Return | Traverser 250 effondrements. |  |
| `CYCLE_UNE_HEURE` | Tenir debout | Still Standing | Faire tenir une civilisation une heure avant sa chute. |  |
| `CRISES_TROIS` | Trois fois sauvée | Saved Three Times | Stabiliser les trois crises d'un même cycle. |  |
| `VOEU_TENU` | Parole tenue | A Promise Kept | Accomplir le vœu d'un cycle. |  |
| `TESTAMENT` | Les dernières volontés | Last Wishes | Graver un testament pour les cités à venir. |  |

### La cité (10)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `RUINES_CENT` | Bonne moisson | A Fine Harvest | Récolter 100 Ruines en un seul effondrement. |  |
| `RUINES_MILLION` | Un champ de ruines | A Field of Ruins | Récolter un million de Ruines en un seul effondrement. |  |
| `RUINES_BILLIARD` | Des décombres à perte de vue | Rubble as Far as the Eye Can See | Récolter un million de milliards de Ruines en un seul effondrement. |  |
| `ARBRE_RACINE` | Une première racine | A First Root | Acquérir un premier nœud de l'arbre des Ruines. |  |
| `ARBRE_COURONNE` | Couronner une branche | Crowning a Branch | Acquérir la couronne d'une branche de l'arbre des Ruines. |  |
| `RAYONNEMENT_GOGOL` | Un gogol | A Googol | Porter le Rayonnement à un gogol (10^100). |  |
| `MERVEILLE_PREMIERE` | La pierre se souvient | Stone Remembers | Ériger une première merveille. |  |
| `MERVEILLES_TOUTES` | Les six merveilles | The Six Wonders | Ériger les six merveilles. |  |
| `MERVEILLE_RANG_V` | Le faîte de la pierre | The Summit of Stone | Élever une merveille à son cinquième rang. |  |
| `CITE_BAPTISEE` | Un nom pour la cité | A Name for the City | Donner soi-même son nom à la cité. |  |

### Les sceaux (12)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `SCEAU_I` | Le Premier Crépuscule | The First Dusk | Réclamer le sceau I : traverser 10 effondrements. | oui |
| `SCEAU_II` | La Première Merveille | The First Wonder | Réclamer le sceau II : ériger 3 merveilles. | oui |
| `SCEAU_III` | Premier Pacte Mythique | First Mythic Pact | Réclamer le sceau III : accomplir un premier Mythe. | oui |
| `SCEAU_IV` | La Colonne du Million | The Column of the Million | Réclamer le sceau IV : porter le Rayonnement au seuil du sceau. | oui |
| `SCEAU_V` | L'Olympe se prononce | Olympus Speaks | Réclamer le sceau V : obtenir le verdict de l'Olympe. | oui |
| `SCEAU_VI` | Acte I : La Fondation Scellée | Act I: The Foundation Sealed | Réclamer le sceau VI : accomplir 5 Mythes. | oui |
| `SCEAU_VII` | Le Jackpot d'Icare | Icarus's Jackpot | Réclamer le sceau VII : se poser à ×25 ou plus au vol d'Icare, sur une grosse mise. | oui |
| `SCEAU_VIII` | Acte II : La Domination Scellée | Act II: Dominion Sealed | Réclamer le sceau VIII : accomplir 8 Mythes. | oui |
| `SCEAU_IX` | Les Couronnes Jumelles | The Twin Crowns | Réclamer le sceau IX : acquérir les 4 couronnes de l'arbre des Ruines. | oui |
| `SCEAU_X` | Au-delà de la Singularité | Beyond the Singularity | Réclamer le sceau X : franchir l'ère du sceau, au-delà de la Singularité. | oui |
| `SCEAU_XI` | Sous le Regard du Ragnarök | Under Ragnarök's Gaze | Réclamer le sceau XI : accomplir les 14 Mythes, Ragnarök compris. | oui |
| `SCEAUX_TOUS` | Le livre scellé | The Sealed Book | Réclamer les onze sceaux du Grand Reset. |  |

### Les Mythes (15)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `MYTHE_CHAOS` | Né du néant | Born of the Void | Accomplir le Mythe du Chaos. |  |
| `MYTHE_PROMETHEE` | Le feu volé | The Stolen Fire | Accomplir le Mythe de Prométhée. |  |
| `MYTHE_ENEE` | La migration fondatrice | The Founding Migration | Accomplir le Mythe d'Énée. |  |
| `MYTHE_CADMOS` | Les noms de pouvoir | Names of Power | Accomplir le Mythe de Cadmos. |  |
| `MYTHE_HEPHAISTOS` | La forge des automates | The Forge of Automatons | Accomplir le Mythe d'Héphaïstos. |  |
| `MYTHE_SISYPHE` | Le rocher au sommet | The Boulder at the Summit | Accomplir le Mythe de Sisyphe. |  |
| `MYTHE_BABEL` | La langue commune | The Common Tongue | Accomplir le Mythe de Babel. |  |
| `MYTHE_AGE_OR` | Les caravanes | The Caravans | Accomplir le Mythe de l'Âge d'Or. |  |
| `MYTHE_ATLAS` | Porter le ciel | Bearing the Sky | Accomplir le Mythe d'Atlas. |  |
| `MYTHE_ICARE` | Les ailes de cire | Wings of Wax | Accomplir le Mythe d'Icare. |  |
| `MYTHE_PHENIX` | Trois fois renaître | Reborn Three Times | Accomplir le Mythe du Phénix. |  |
| `MYTHE_ATRIDES` | La dette payée | The Debt Repaid | Accomplir le Mythe des Atrides. |  |
| `MYTHE_ANTEE` | Le géant et la terre | The Giant and the Earth | Accomplir le Mythe d'Antée. |  |
| `MYTHE_RAGNAROK` | Le crépuscule des dieux | Twilight of the Gods | Achever l'Arche et conjurer le Ragnarök. | oui |
| `CIEL_TOMBE` | Le ciel est tombé | The Sky Fell | Laisser le ciel d'Atlas écraser la cité. | oui |

### La Maison des Plaisirs (16)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `OSSELETS_VENUS` | Coup de Vénus | Venus Throw | Tirer un coup de Vénus aux osselets. |  |
| `OSSELETS_CHIEN` | Le coup du Chien | The Dog Throw | Tirer le coup du Chien aux osselets. | oui |
| `ICARE_X10` | Plus près du soleil | Closer to the Sun | Se poser à ×10 ou plus au vol d'Icare. |  |
| `GRATTEUX_SOLEIL` | Un soleil sous la cire | A Sun Beneath the Wax | Gratter un soleil sur un ticket. |  |
| `VINGTETUN_NATUREL` | Vingt-et-un d'entrée | A Natural Twenty-One | Être servi d'un vingt-et-un naturel. |  |
| `VINGTETUN_SERIE` | La voix de l'oracle | The Oracle's Voice | Gagner 5 mains de suite au vingt-et-un. |  |
| `VIDEUR` | Raccompagné à la porte | Shown the Door | Se faire sortir du vingt-et-un par le videur. | oui |
| `MACHINE_HOLD` | Tenir et gagner | Hold and Win | Déclencher le Hold & Win à la machine à sous. |  |
| `MACHINE_JACKPOT` | Le gros lot | The Big One | Rafler un jackpot à la machine à sous. |  |
| `DUEL_GAGNE` | Le flambeur à terre | The High Roller Falls | Gagner un duel contre le grand flambeur. |  |
| `COURSE_OUTSIDER` | Le tocard | The Long Shot | Gagner une course sur un outsider coté à 10 contre 1 ou plus. |  |
| `ROUE_MAISON` | La roue tourne | The Wheel Turns | Prendre un tour de la roue de la Maison. |  |
| `NUIT_GRAND_JEU` | La Nuit du Grand Jeu | The Night of High Play | Vivre une Nuit du Grand Jeu. |  |
| `MAISON_FAMILIER` | Un visage familier | A Familiar Face | Devenir Familier de la Maison. |  |
| `MAISON_MECENE` | Mécène | Patron | Devenir Mécène de la Maison. |  |
| `MAISON_PRINCE` | Prince de la Maison | Prince of the House | Atteindre le plus haut titre de la Maison. |  |

### Faits divers (5)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `FD_PREMIER` | Ça s'est passé près de chez vous | It Happened Around the Corner | Surprendre un premier fait divers dans les rues. |  |
| `FD_HISTOIRE` | Le fin mot de l'histoire | The End of the Story | Suivre un feuilleton des rues jusqu'à son dernier chapitre. |  |
| `FD_TOUTES` | La gazette des rues | The Street Gazette | Suivre tous les feuilletons des rues jusqu'au bout. |  |
| `FD_CURIOSITES` | Le badaud | The Onlooker | Remarquer toutes les curiosités de la ville. |  |
| `FD_AMOUREUX` | Le ruban recousu | The Ribbon Mended | Mener Nancy et William jusqu'à leur mariage. | oui |

### La Chronique (3)

| Nom d'API | Nom (FR) | Name (EN) | Condition | Caché |
|---|---|---|---|---|
| `TEMPS_UNE_HEURE` | Une heure d'histoire | An Hour of History | Jouer une heure. |  |
| `TEMPS_DIX_HEURES` | Le chroniqueur | The Chronicler | Jouer dix heures. |  |
| `TEMPS_CENT_HEURES` | La mémoire des âges | The Memory of the Ages | Jouer cent heures. |  |

## 3. Créer les succès sur le site Steamworks

Une fois l'App ID attribué : Steamworks › l'application › **Stats & Achievements** › Achievements.
Pour chaque ligne de `succes.json` :

1. « New Achievement » : **API Name** = `apiName` (exactement, majuscules comprises) ;
2. Display Name / Description en anglais (langue par défaut de la page) = `name.english` /
   `description.english`, puis le français (`french`) dans le sélecteur de langue ;
3. **Hidden** coché si `hidden` vaut `true` ; **Set By** : Client ;
4. les deux icônes 64×64 : **Achieved** = `icon`, **Unachieved** = `iconGray` (chemins depuis la
   racine du dépôt, `public/pixelart/ui/achievements/`) ;
5. « Publish » (les succès ne sont visibles des joueurs qu'une fois publiés).

⚠ Un **nom d'API ne se renomme jamais** une fois publié : ceux qui ont déjà le succès le perdraient.
Corriger un nom affiché ou une description, en revanche, ne coûte rien.

## 4. Mettre le pont en service

Rien n'est installé aujourd'hui : sans `steamworks.js`, sans App ID ou sans client Steam, le jeu
tourne exactement pareil et les succès restent dans la sauvegarde.

1. **Installer le module** : `npm install steamworks.js` (en `dependencies`, pas en
   `devDependencies` : il doit partir dans l'.exe). C'est un module natif (`.node` + `steam_api64.dll`)
   : ajouter dans `package.json › build` un `"asarUnpack": ["node_modules/steamworks.js/**"]` pour
   qu'il soit chargeable hors de l'archive asar.
2. **Remplir l'App ID** : `STEAM_APP_ID` en tête du bloc « SUCCÈS STEAM » de `main.cjs`. Il n'est lu
   que par la version Steam (lancée par Steam, ou build `npm run dist-steam`) : l'.exe hors Steam ne
   parle pas à Steam. Lancé par le client Steam, le jeu prend de toute façon `SteamAppId` dans son
   environnement.
3. **Tester en développement** : client Steam ouvert, sur un compte qui possède l'application ; un
   fichier `steam_appid.txt` contenant l'App ID à côté de l'exe (ou à la racine du projet avec
   `npm run electron`). **Ne jamais livrer ce fichier** (Valve le réserve au développement).
4. **Vérifier** dans le journal `%APPDATA%\civilisation-effondrement\logs\civilisation.log` :
   `[steam] Steamworks prêt (App ID …)` au lancement ; un nom d'API absent du site Steamworks y est
   noté une fois (`succès refusé par Steamworks`). Pour rejouer les déblocages pendant les essais, la
   console de Steam (`steam://open/console`) accepte `reset_all_stats <AppID>`.

Overlay (Maj+Tab) : les deux réglages Electron qu'il demande (`in-process-gpu`,
`disable-direct-composition`) sont déjà posés par `main.cjs` quand le jeu est lancé par Steam
(`--no-steam-overlay` dans les options de lancement les retire, pour comparer). Steamworks est
ouvert avant la fenêtre. À mesurer sur une branche privée Steam avant la sortie (clignotements,
coût du GPU dans le process principal) ; à défaut, désactiver l'overlay dans les réglages de
l'application sur Steamworks.

## 5. Ajouter ou retoucher un succès

1. `src/game/data/achievements.js` : l'entrée (nom d'API neuf, famille, textes FR/EN). Une famille
   existante (ère, effondrements, sceau, Mythe) n'a besoin que de son `need` ; sinon, écrire la
   condition dans `CUSTOM` de `src/game/core/achievements.js` (lecture d'un champ déjà tenu à jour —
   jamais un calcul de production).
2. L'icône : une ligne dans `SOURCES` de `scripts/bakeAchievementIcons.cjs` (un art existant de
   64 px ou moins, jamais réduit ; sinon un tirage PixelLab 64×64 rangé dans `art/succes/<ID>.png`),
   puis `node scripts/bakeAchievementIcons.cjs`.
3. `node scripts/exportSteamAchievements.mjs`, puis reporter la ligne sur Steamworks (§ 3).
4. `achievements.test.js` vérifie qu'aucun succès n'est sans condition, que chaque Mythe et chaque
   sceau a le sien, et que l'export suit la liste ; `achievementIcons.test.js`, que chaque succès a
   ses deux icônes et qu'aucune n'est orpheline.

## 6. Pas fait (à décider plus tard)

- **Présence enrichie** (« Ère : … » dans la liste d'amis Steam) : proposée dans la question de
  l'audit, pas tranchée — rien n'est codé.
- Les icônes PixelLab des Mythes sans emblème (Chaos, Prométhée, Cadmos, Atlas, Antée, Ragnarök,
  dans `art/succes/`) ne remplacent PAS les initiales et icônes provisoires du Panthéon et de la
  Cité : changer ces écrans reste une décision de Raph.
