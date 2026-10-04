# La Nuit des Plaisirs — un casino hors du temps

> Raph, 2026-10-04 : « tout est fait pour la maison des plaisirs ? un véritable casino,
> lieu de luxure et d'argent hors du temps ? » puis « met tout en place. La luxure tu
> peux pousser l'idée au max ».
>
> Limite posée en retour : l'ambiance maison close / cabaret poussée au maximum, mais
> SUGGESTIVE — pas de nudité, pas d'acte explicite.

Quatre lots, dans l'ordre.

| Lot | Contenu | État |
|---|---|---|
| 1 | La Nuit du Grand Jeu, le spectacle, le duel des grands flambeurs, les courses | ✅ fait |
| 2 | La salle hors du temps : toujours la nuit, la cagnotte au mur, les gagnants qu'on voit, la fête | ✅ fait |
| 3 | La luxure poussée au maximum (suggestive) | ✅ fait |
| 4 | Compter les cartes au vingt-et-un (le sabot, le videur) | à faire |

---

## Lot 1 — la Nuit, le spectacle, le duel, les courses ✅

### La Nuit du Grand Jeu (`actions/nuitGrandJeu.js`)

- Toutes les **3 h** (`NUIT_INTERVAL_H`), pour **20 min** (`NUIT_DUREE_MIN`). La première
  une heure après qu'on la découvre (`NUIT_PREMIERE_H`). Une absence ne fait pas
  rattraper les Nuits manquées : la suivante s'ouvre au retour.
- À l'ouverture : **6 h de recettes** versées à la cagnotte (`NUIT_POT_H`, bornée par
  son plafond de 24 h), un **tour de roue** offert, la **troupe sur scène** toute la nuit
  (la salle pleine : la caisse ×2), un **grand flambeur** tiré parmi huit (`FLAMBEURS`).
- Pendant la Nuit : **toutes les portes ouvertes** (roulette, salon privé, courses, le
  duel) et la **réputation compte double** (`NUIT_REPUTATION_MULT`, `recordWager`).
- Le tick : `tickNuit()` dans `tickTempleAutomation`. Les écouteurs : `onNuit(fn)`.
- L'**horloge de la Nuit traverse le Grand Reset** (`nuitProchaine`, `nuitCompte` dans
  `GR_PERSISTENT_FIELDS`) : au rythme des sceaux, sinon, on n'en verrait plus une. Une
  Nuit en cours, elle, s'éteint avec la cité.

### Le spectacle

- Hors de la Nuit : la troupe joue pour **¼ h de recettes** (`SPECTACLE_COUT_H`), 20 min
  de salle pleine (la caisse se remplit ×2 : `actions/affluence.js`, lu par
  `offeringTrunk`), puis 40 min de repos (`SPECTACLE_REPOS_MIN`).
- `figerCaisse(now)` fige la caisse au débit d'avant : l'affluence ne compte qu'à partir
  du lever de rideau (pas de rattrapage rétroactif).

### Le duel des grands flambeurs (`actions/duel.js`, `ui/DuelStage.jsx`)

- Pendant la Nuit, et à toute heure pour un **Prince** de la Maison.
- Quatre **dés** chacun (faces 1 à 6 : les os gravés de Raph aux premiers âges, les dés
  de l'âge ensuite), la plus haute somme prend la manche, une égalité se rejoue, au
  meilleur des trois. Les deux jettent les mêmes dés : une chance sur deux.
- Le vainqueur prend les deux mises moins la part de la Maison : **97 %**
  (`DUEL_RTP`, ×1,94 la mise). Mise libre, **sans plafond**, au moins **1 h de recettes**.
- La table : le flambeur se tient en face, à la place de la croupière — une courtisane
  de la Maison (filles 1 et 2 de l'âge) ou un **homme de l'âge, assis** (PlaisirsTable :
  sa hauteur est mesurée sur son image, ses pieds descendent sous le plateau jusqu'à
  ce que sa tête tienne dans le cadre).
- L'écran déroule les manches dé par dé ; le gain n'est versé qu'au dernier dé
  (anti-spoiler, flush à `pagehide`). « Laisser courir » : tout le gain sur un nouveau
  duel.

### Les courses (`actions/courses.js`, `ui/CoursesStage.jsx`, `plaisirs/coursesArt.js`)

- Au **Notable**, et pour tous pendant la Nuit. Six partants à **cotes fixes** : un
  profil de chances (`COURSES_PROFILS`) réparti au hasard sur les couloirs, cote =
  `COURSES_RTP / p` (**95 %** sur chaque cheval). Le gagnant est tiré à la chance, les
  autres arrivent dans un ordre tiré lui aussi (Plackett-Luce).
- Mise totale dans les limites de la table (la salle commune).
- La piste est **dessinée par le code**, à la grille de la table (k entier, plafonné à 4) :
  ciel de nuit, tribune et sa foule, six couloirs, stalles numérotées, poteau en damier.
  Le **cheval monté** est un gabarit au pixel (`CORPS`, quatre images de galop `JAMBES`),
  robe par nom, casaque par couloir (rouge, blanc, bleu, jaune, vert, noir), contour
  ajouté par le code. Aux âges cosmiques : des **chevaux de lumière** (robe nacrée,
  crinière de la lumière de l'ère, traînée). Des ailes de pégase ont été essayées : à
  cette taille, des pavés illisibles.
- Le moteur tire l'arrivée avant la course ; `planCourse` la met en scène (écarts tirés,
  allures « en tête puis rattrapé » ou « finisseur » qui font les changements de tête,
  **photo** quand les deux premiers sont à moins de 160 ms).
- Pas de lancement de course à blanc : « Course suivante » garde les mises sur les
  mêmes couloirs, le nouveau champ et ses cotes s'affichent avant le départ.

### L'interface

- **Menu** : « Les courses » (cadenas Notable) et « Le grand flambeur » (cadenas
  « Nuit »), rangés au rez-de-chaussée (pas de salle dans la coupe).
- **Bourse** : la lune 🌙 (allumée pendant la Nuit avec les minutes qui restent ; la
  prochaine Nuit dans l'infobulle), le bouton **Spectacle** (or quand la troupe est prête).
- **Bandeau** (`plaisirs/NuitBandeau.jsx`) : à l'ouverture d'une Nuit, un ruban de
  velours descend sur la salle (le flambeur, la cagnotte versée). Son minuteur part
  APRÈS l'affichage, et une salle remontée le retrouve (temps compté depuis
  `state.nuitDebut`).
- ⚠ **La coupe ne se recuit pas pour la Nuit** : elle montre les lieux ACQUIS
  (`anchors.spotOuvertSalle`), pas ce que la Nuit ouvre pour vingt minutes. Avant :
  l'ouverture d'une Nuit changeait la liste des lieux ouverts → cuisson synchrone de la
  coupe → page figée plusieurs secondes, et le bandeau s'éteignait avant d'être peint.

### Mesure (bench-plaisirs.js, 20 h, 3 courbes × 6 profils)

Le banc joue désormais huit jeux, la Nuit et le spectacle. Sur la graine 7 :

- Le **joueur** (5 %) : Mécène à Prince selon la courbe ; la première relique 1 à 2 h plus
  tôt qu'avant la Nuit. L'arc de 20 h tient.
- Les **agressifs** (25 %, tout ou rien) restent fauchés 55 à 88 % du temps de table,
  ruinés 4 à 13 fois : « miser gros, grosse perte » tient.
- ⚠ Un défaut du **banc** (pas du jeu) a été corrigé : la mise minimale du duel forçait
  le profil « joueur » à miser toute sa bourse ; il passe désormais son tour quand 5 %
  de sa bourse n'atteint pas la mise minimale.

---

## Lot 2 — la salle hors du temps ✅

- **Toujours la nuit** dans la Maison (`salleBake.salleNightF`) : la salle ne suit plus
  le cycle de 9 min de la carte. Seul le réglage d'affichage « toujours plein jour » du
  joueur la rallume.
- **L'enseigne de la cagnotte** (`plaisirs/CagnotteSalle.jsx`) en haut de la salle, au
  milieu de la coupe : velours, cadre d'or, deux rangs d'ampoules qui courent, le
  montant qui ROULE vers sa nouvelle valeur (jamais depuis zéro). Elle s'emballe pendant
  la Nuit. Les annonces de la salle descendent sous elle, le bandeau de la Nuit dessous.
- **Les gagnants qu'on voit** (`AnnoncesSalle`) : à chaque annonce, une gerbe de pièces
  jaillit de la TABLE du jeu annoncé dans la coupe (`posOf` → `geo(spot)` de la vue), et
  le gain monte au-dessus. Les courses (pas de salle) n'ont que la ligne d'annonce.
- **La fête** (Nuit du Grand Jeu, spectacle) : des paillettes d'or et de rose tombent
  dans la coupe (un pixel d'art chacune, tirées de leur numéro), les lustres brillent
  plus fort.
- **Les jetons sur les tables** : déjà dans la coupe (la table de dés porte ses piles,
  le vingt-et-un sa boîte à jetons) — rien à ajouter.
- Pas de salle plus pleine pendant la fête : il faudrait recuire la coupe (voir le piège
  de la cuisson au lot 1).

## Lot 3 — la luxure, poussée au maximum, suggestive ✅

- **Les ombres du boudoir** (`shadowFrames`, plaisirsCoupeHD.js) : au solo, après la
  jambe qui monte, un NUMÉRO BURLESQUE — le pied sur un tabouret, elle roule son bas (deux
  images, penchée), le fait tourner au bout du bras, puis se cambre, bras levés, le
  chignon défait. À deux, après le baiser et le renversé : il passe derrière elle (les
  mains à ses hanches, elle se laisse aller contre lui, un bras à sa nuque), puis elle
  enroule une jambe autour de lui. Le couple reste plus longtemps derrière la tenture
  (22 s au lieu de 14). `woman()` gagne la jambe arrière libre, les cheveux défaits et
  trois bras ('haut', 'bas', 'gant').
- **Le baiser de la croupière** : à chaque beau gain (×3 la mise et plus,
  `grandsGains.onGainReaction`, plusieurs abonnés), une bouche rouge s'envole de ses
  lèvres (PlaisirsTable).
- **La lumière rouge** : pendant la fête (Nuit, spectacle), les halos de la salle virent
  au rose.
- **Les mots** : de nouveaux gagnants dans la salle (la veuve joyeuse, l'évêque en civil,
  la comtesse sans son mari, le notaire masqué, le prince incognito, la maîtresse du
  gouverneur) ; la Nuit s'ouvre sur « ce qui se passe à la Maison reste à la Maison » ;
  les gros duels s'écrivent à la Chronique (le mouchoir parfumé, « une fille à chaque
  bras »).
- ⛔ Pas de nudité, pas d'acte explicite.
- Pas fait, et pourquoi : le french cancan sur la scène et des courtisanes alanguies
  demandent de NOUVELLES bandes de sprites pour les filles — dessinées à la main par Raph
  (.aseprite) : à lui de dire s'il les veut, et dessinées par qui.

## Lot 4 — compter les cartes (à faire)

- Un sabot persistant au vingt-et-un, le compte Hi-Lo possible pour le joueur attentif,
  et un **videur** qui raccompagne celui dont les mises suivent trop bien le compte.
- Recalibrer le banc (le compteur discipliné peut-il battre la Maison ?).

---

## Pièges relevés en route

- **Capture sans écran** : le Chrome sans écran ne produit pas d'images entre deux
  captures — une animation CSS qui part de l'opacité 0 reste invisible. Pour la
  capturer : `animation.currentTime = durée` avant la capture.
- **Serveur partagé** : les autres sessions éditent `src/game/` en continu et le plugin
  `game-full-reload` recharge la page en pleine capture. Pour capturer : un Vite à part,
  sans surveillance des fichiers (config du projet, `server.watch.ignored: ['**/*']`,
  `hmr: false`, sans le plugin), à redémarrer après chaque modification.
- **Un homme de l'âge derrière une table** est bien plus grand qu'une fille de la
  Maison (planche de 56 px, marge au-dessus de la tête) : mesurer sa hauteur sur son
  image plutôt que l'estimer.
