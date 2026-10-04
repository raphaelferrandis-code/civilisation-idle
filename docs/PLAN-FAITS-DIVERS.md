# Plan — Les Faits divers (micro-événements de la carte)

Chantier ouvert le 2026-10-04 sur la demande de Raph :

> « qu'en se baladant le joueur tombe sur des micros événements […] pour que ça donne l'envie
> de rester et une impression de continuité »

Point de départ : les habitants des places qui se tiennent en cercle « comme une secte ».
Référence : les rencontres aléatoires de RDR2 et de GTA V.
**Ce document fait foi pour ce chantier.**

---

## 1. Les décisions de Raph (2026-10-04)

| Question | Réponse |
|---|---|
| Forme | Des **feuilletons** : chaque histoire a plusieurs chapitres. Un chapitre est débloqué quand le joueur **clique** sur la scène, puis il s'inscrit dans la Chronique. |
| Indices | **Aucun** : rien dans la Chronique sur le lieu ou le moment, et rien sur le nombre d'histoires ou de chapitres qui restent. |
| Visuel | **Discret**. Ce sont des éléments de la ville. Si le joueur les rate, c'est normal. |
| Retenus | Secte, Tortue de Zénon, Chèvre des toits, Philosophe du tonneau (**Diogène, poussé à fond**), Homme-volant, Querelle de la Borne, Monstre du fleuve, Musicien. |
| Ajout | **Les Amoureux** : deux personnes qui se cherchent, s'éloignent et finissent par se marier. On les trouve dans les bâtiments de la ville, à moitié par hasard et à moitié grâce à ce que l'autre a dit. |
| Refusés | Voyageur égaré, Chat des Ruines, Charlatan, Visiteurs. |
| Principes | Validés : on ne les révèle qu'au clic, un chapitre à la fois, rater ne coûte rien, la progression est éternelle, une histoire finie laisse une trace. |

---

## 2. Les règles du jeu

1. **Rien n'est écrit avant le clic.** La scène vit sur la carte comme n'importe quel habitant.
   Le clic ouvre la fiche (le même pipeline que la fiche d'habitant), qui affiche la réplique,
   et le chapitre s'inscrit.
2. **Un chapitre à la fois par histoire.** Le chapitre N+1 n'existe pas tant que le N n'a pas
   été vu. Chaque chapitre a ses conditions : une plage d'âges (`eraBand`, 0 = Feu … 9 = Démiurge),
   le jour ou la nuit (`CM.nightF`), un type de lieu, et un délai minimum depuis le chapitre
   précédent, compté en temps de jeu à vie (`lifetimePlaySec`).
3. **La rareté.** Au plus **deux scènes** en même temps sur la carte (les Amoureux comptent pour
   une). Une scène dure quelques minutes, puis s'en va et revient plus tard. On ne la voit jamais
   apparaître ni disparaître à l'écran : elle naît hors champ ou arrive en marchant.
4. **Rater ne coûte rien.** Si le joueur a dépassé la plage d'âges d'un chapitre, celui-ci
   l'attend au cycle suivant (chaque effondrement fait repasser par les âges).
5. **La progression est éternelle.** Elle survit à l'effondrement et au Grand Reset
   (`GR_PERSISTENT_FIELDS`). Les histoires enjambent les cycles : c'est la continuité.
6. **Une histoire finie laisse une trace permanente** sur la carte, présente à chaque cycle
   suivant : un cercle de pierres, un tonneau, une borne…
7. **Ce qui rend une scène discrète** : elle est à l'échelle des habitants (`sceneHumanH`), sans
   icône, sans bulle, sans halo. Seule une lumière qui existe dans la scène est permise, comme
   le feu de camp la nuit. Pas de son, sauf celui de la scène quand elle est désignée (le
   Musicien). Ce qui la distingue, c'est qu'elle n'est pas à sa place : un cercle à la lisière,
   une chèvre sur un toit, un homme dans un tonneau.

---

## 3. Les feuilletons

Les chapitres sont des propositions. Les répliques exactes seront écrites lot par lot.

### 3.1 La Secte du Feu qui parle

Elle se tient à la **lisière**, **la nuit**. Le cercle grandit d'âge en âge.

| Âge | Chapitre |
|---|---|
| Feu | Six silhouettes en cercle autour d'un feu, à l'écart du camp. « Nous attendons qu'il parle. » |
| Pierre | Un cercle de menhirs. Ils sont douze. |
| Marbre | Un temple grand comme une cabane. Un oracle lit les braises. |
| Fonte | Ils vénèrent la chaudière d'une usine. |
| Néon | Une enseigne rouge qui grésille. Ils interprètent chaque clignotement. |
| Stellaire | Ils prient une étoile. |
| Démiurge | Le feu parle enfin, une seule phrase, à choisir avec Raph (proposition : « Vous auriez pu remettre une bûche. »). |

**Trace** : le cercle de pierres reste à la lisière.
**Art** : le feu de camp du conteur (`storyteller-fire`) au Feu, puis un décor par âge.
Les fidèles sont les habitants de la bande.

### 3.2 La Tortue de Zénon

Elle traverse le monde pendant toute la partie. Son trajet est fixe, d'un bord du monde à
l'autre. **À chaque âge, elle parcourt la moitié de ce qui lui reste** (c'est le paradoxe) :
elle n'arrive donc jamais, jusqu'au Démiurge, où elle arrive. Elle est toujours là, minuscule,
et le clic inscrit le chapitre de l'âge en cours.

| Âge | Chapitre |
|---|---|
| Feu | Elle part. |
| Marbre | Achille la défie à la course. Il ne la rattrapera jamais. |
| Fonte | Achille II, en vélocipède. |
| Néon | Achille IV, en jetpack. |
| Stellaire | Achille VII, presque à la vitesse de la lumière, toujours derrière. |
| Démiurge | Elle touche l'autre bord. Achille applaudit. |

**Trace** : une statue de la tortue au point d'arrivée.

### 3.3 La Chèvre des toits

Elle est toujours là où une chèvre ne peut pas être. Le sprite de chèvre existe déjà
(`critters.js`). Les toits de maisons viennent de la recherche des pigeons (`roofHouses`,
`isoVieOiseaux.js`), qui a déjà résolu « se poser sur un toit sans flotter ».

| Âge | Lieu |
|---|---|
| Bois | Elle s'évade de l'enclos. |
| Pierre | Sur un toit de maison. |
| Couronne | Sur le toit du temple. |
| Marbre | Au sommet d'une merveille. |
| Fonte | Sur une cheminée d'usine. |
| Néon | Sur une enseigne. |
| Stellaire | Sur une station en orbite basse. |
| Démiurge | De retour dans l'enclos du Bois, comme si de rien n'était. |

Ce sont ses descendantes, avec la même robe. **Trace** : un enclos avec une chèvre, au bord du
terroir.

### 3.4 Le Cynique (Diogène, poussé à fond)

On transpose une anecdote vraie de Diogène par âge. Il a un **chien** qui le suit partout
(*kunikos*, « comme un chien » : le chien de `critters.js`).

| Âge | Chapitre |
|---|---|
| Bois | **La jarre.** Il dort dans une grande jarre couchée (c'était un *pithos*, pas un tonneau). « Logis : une jarre. » |
| Pierre | **L'écuelle.** Il voit un enfant boire dans ses mains et jette son écuelle. « Un enfant m'a battu en simplicité. » |
| Couronne | **La statue.** Il tend la main à une statue de la place. « Je m'exerce à essuyer des refus. » |
| Marbre | **Le soleil.** Le tonneau, enfin. « Ôte-toi de mon soleil. » C'est la caméra qui le gêne. |
| Marbre | **Le poulet.** Devant l'Académie, il brandit un poulet plumé. « Voici l'homme de Platon. » |
| Fonte | **À reculons.** Il marche à reculons sous les arcades, à contre-courant de la foule. |
| Néon | **La lanterne.** Une lampe allumée en plein midi, sous les néons. « Je cherche un humain. » |
| Noosphère | **Hors réseau.** Le seul esprit débranché de la ville. « Citoyen du monde. Pas du réseau. » |
| Stellaire | **La capsule.** Il vit dans une capsule de survie vide. « Ôtez-vous de mon étoile. » |
| Démiurge | **Alexandre.** Le Démiurge (le joueur) vient le voir : « Que veux-tu ? » — « Que tu t'ôtes de mon soleil. » |

**Gags permanents** (sa fiche n'est pas celle d'un habitant) :
- Logis : « le monde ». Métier : « aucun, merci ». Humeur : « parfaitement content », quelle
  que soit la santé de la cité, même pendant une émeute.
- **Quand la caméra le suit, il tourne le dos à la caméra.** Si on le suit trop longtemps,
  il déplace son tonneau.
- Une fois son chapitre lu, chaque nouveau clic lui fait dire un aphorisme pris dans une
  réserve d'une vingtaine (adaptées de Diogène Laërce, le domaine est public).
- **Trace** : le tonneau reste sur la place. Le chien dort dedans.

### 3.5 L'Homme-volant

Il se tient sur une **hauteur** (le pont, une butte, une tour), avec 3 ou 4 badauds. La même
lignée et le même nom de famille d'âge en âge. Il saute, et une petite courbe le mène jusqu'aux
ronds dans l'eau (`vieRing`).

| Âge | Chapitre |
|---|---|
| Pierre | Des ailes de plumes. Il finit dans le fleuve. |
| Couronne | La catapulte. |
| Marbre | Il se fait appeler Icare (un clin d'œil au Vol d'Icare du temple). |
| Fonte | La montgolfière. |
| Néon | Le jetpack. |
| Stellaire | Il vole enfin. C'est le seul habitant du ciel qui a le vertige. |

**Trace** : une plaque sur le parapet du pont.

### 3.6 La Querelle de la Borne

Deux familles, une pierre. Les noms des deux familles sont fixes.

| Âge | Chapitre |
|---|---|
| Pierre | Deux voisins se disputent une borne de clôture au terroir (`fenceEdges`). |
| Couronne | Un duel à l'épée sur le pont. |
| Marbre | Un procès au forum. |
| Fonte | Un duel au pistolet. Les deux ratent. |
| Néon | Un procès télévisé. |
| Stellaire | Un duel de robots géants. |
| Démiurge | La borne était une météorite sans valeur, et ils sont cousins. |

**Trace** : la borne reste, avec une plaque.

### 3.7 Le Monstre du fleuve

Ça se passe sur le pont ou le ponton. On reprend **le pêcheur du pont qui existe déjà**
(`isoBridge`, les accoudés). L'aileron dans l'eau est l'ombre de poisson de la petite vie
(`fishShadowSprite`) en grand.

| Âge | Chapitre |
|---|---|
| Bois | La ligne du pêcheur plie à casser. |
| Couronne | Un aileron devant le quai. Une foule s'attroupe. |
| Fonte | Un sous-marin à vapeur part à sa recherche. |
| Néon | Une équipe de télé. |
| Stellaire | On le revoit. Il n'a pas vieilli. |
| Démiurge | C'est un poisson aussi vieux que la ville, qui n'a jamais rien fait de mal. On le baptise. |

**Trace** : sa statue sur le quai.

### 3.8 Le Musicien des rues

Il joue au coin d'une place. Son instrument change avec les âges : flûte en os, luth, violon,
accordéon, guitare électrique, thérémine cosmique. **Quand il est désigné, sa mélodie joue**
(`jouerMelodieScene(band)`, `melodieScene.js`). Au Démiurge, il rejoue la mélodie du Feu avec
l'hologramme de tous ses ancêtres. **Trace** : un chapeau posé par terre au coin de la place.

### 3.9 Les Amoureux

Deux noms fixes (à choisir avec Raph) qui traversent tous les âges, comme la troupe des
Plaisirs. Ils portent le costume de la bande en cours, plus **un même ruban rouge** :
c'est le seul signe distinctif, 1 ou 2 pixels.

Cette histoire n'est **pas liée aux âges** : elle avance par rendez-vous, dans la ville qui
existe à ce moment-là. On les trouve **au seuil des bâtiments** : à la porte, au sol, jamais
SUR une scène moteur (cf. petite vie). Quand le bâtiment a une vue intérieure (la coupe des
Plaisirs), on peut aussi les trouver à l'intérieur.

**Le mécanisme de la piste** : quand on trouve l'un des deux, il parle de l'autre **par une
périphrase du bâtiment** où l'autre attend. L'autre attend vraiment là, devant un bâtiment de
ce type qui existe sur la carte. Il y a une table de périphrases par type de bâtiment, deux ou
trois chacune, en fr et en en. Par exemple :

| Bâtiment | Périphrase |
|---|---|
| Port | « Il a parlé de partir avec le premier bateau. » |
| Bibliothèque | « Elle lit tout ce qui lui tombe sous la main. » |
| Marché | « Il m'a promis des oranges. » |
| Monnaie / banque | « Elle compte, toujours. Elle compte tout. » |
| Moulin | « Il aime le bruit de l'eau qui tourne. » |
| Merveille | « Elle voulait voir la chose la plus haute de la ville. » |
| Maison des Plaisirs | « On l'a vu près de la Maison des Plaisirs. Il jure qu'il n'a fait que passer. » |

Celui qu'on a trouvé **reste là** tant que l'autre n'a pas été trouvé : on peut revenir le
relire. **La Chronique ne garde que le récit au passé, jamais la piste** (décision n° 2).
Si le bâtiment visé disparaît (changement d'âge, recalcul), l'autre attend devant un bâtiment
du même type ailleurs. Si le type n'existe plus du tout, on prend une périphrase de repli (la
place).

| Acte | Rendez-vous |
|---|---|
| I · La rencontre | 1. **Par hasard** : A, seul devant un bâtiment, regarde partout. Un ruban rouge, quelqu'un d'aperçu dans la foule. Première piste. 2. B : « C'est moi qui lui ai donné ce ruban. » Piste vers A, qui s'est déplacé. 3. A : « Il a demandé de mes nouvelles ? » Piste. |
| II · Ils se cherchent | 4 à 7. La chaîne de pistes à travers les bâtiments de la ville. Ils se ratent de peu (« Il était là ce matin »). |
| III · Ils s'éloignent | 8. **Enfin ensemble**, pour la première fois au même endroit. 9. **La dispute** : au même endroit, chacun tourne le dos à l'autre. « Elle veut partir. » « Il ne veut pas quitter la ville. » 10. **Chacun de son côté**, aux deux bouts de la ville. Ils ne parlent plus l'un de l'autre, il n'y a plus de piste : pur hasard. 11. **Le joueur messager** : trouver l'un puis l'autre (dans n'importe quel ordre) suffit, et le second demande « Il t'a parlé de moi ? » |
| IV · Le mariage | 12. L'un attend : « Dis-lui que je l'attends là où on s'est vus la première fois. » C'est le bâtiment du rendez-vous 1, retenu dans la sauvegarde : c'est la continuité. 13. **Le mariage** sur la place (ou au temple, ou au parvis de la merveille). Les invités se tiennent **en cercle**, en clin d'œil aux cercles des places qui ont lancé le chantier. Le Musicien joue s'il a été rencontré. Diogène regarde depuis son tonneau s'il a été rencontré (« Je ne vais pas aux mariages. »). |

Si un effondrement arrive au milieu de l'histoire, ils se retrouvent dans la ville suivante :
« On s'est perdus dans l'effondrement. »
**Trace** : un banc de la place leur appartient. On les y voit vieux, à la tombée du jour.

### 3.10 Croisements

Seulement si les deux histoires ont été rencontrées : le Musicien et Diogène au mariage, la
chèvre qui devient l'animal sacré de la Secte, et Achille qui demande la direction à
l'Homme-volant.

### 3.11 Les gags d'un seul coup (à confirmer)

Ce sont des scènes sans suite : la file d'attente devant rien, la charrette de citrouilles,
l'habitant coincé sur un toit, la sieste collective dans le blé, l'ivrogne sous la fenêtre,
le cerf-volant dans l'arbre, la vache sur le pont, le mime. Dans la Chronique : un compteur de
« curiosités vues ». Ce serait un dernier lot si Raph les garde.

---

## 4. L'architecture

Le gros du travail existe déjà : **viser, survoler, suivre et afficher une fiche marche pour
tout personnage de scène qui se signale** (`noteSceneFigure`, `citizenFocus.js`). Un fait
divers est donc une scène qui se signale.

| Fichier | Rôle |
|---|---|
| `src/game/data/faitsDivers.js` | **Catalogue** déclaratif. Pour chaque histoire : ses chapitres `{ id, bands:[min,max], night, place, delaySec, cast, scene, line:{fr,en}, chronicle:{fr,en} }`, sa trace, et pour les Amoureux la table des périphrases. Données pures. |
| `src/game/core/faitsDivers.js` | **Seule source de mutation** (même modèle que `chronicleStats.js`) : `recordFaitDivers(storyId, chId)` horodate le chapitre (âge + `lifetimePlaySec`) et pose la trace à la fin. |
| `state.faitsDivers` | `{ seen: { [story]: [{ ch, band, at }] }, lovers: { step, firstSpot, … }, traces: [], rev }`. Ajouté à `defaultState`, au normaliseur et à **`GR_PERSISTENT_FIELDS`**. ⚠ Le déclarer avant `export let state = load()` (piège TDZ, perte de sauvegarde). |
| `src/game/map/faitsDivers/director.js` | **Le metteur en scène.** Il fait un tour toutes les ~5 s, sur l'horloge murale et jamais `setTimeout` (`__demoCity` coupe les timers, la fenêtre cachée les ralentit). Il prend les chapitres éligibles (fonction pure, testée), limite à deux scènes, choisit un lieu, fait naître la scène hors champ, puis la fait partir après sa durée. |
| `src/game/map/faitsDivers/spots.js` | **Les types de lieux.** Lisière (cellules sauvages au bord de la ville, `vieIsOccupied`), place (rec des places), quai, pont (accoudés de `isoBridge`), toit (`roofHouses`), champ et clôture (`fenceEdges`), fleuve, et `batiment:<id>`, c'est-à-dire la cellule de sol devant la façade d'une tuile de `CM.layout.tiles` (clé du bâtiment + ε). Ils sont déterministes à graine fixe. |
| `src/game/map/faitsDivers/scenes.js` | **Le dessin.** Un acteur du peintre par scène (`registerVieActors`, tri en profondeur comme un mouton). Les personnages sont les habitants de la bande (`drawNamedAgentIso`) plus quelques décors, et chaque personnage appelle `noteSceneFigure(q, 'fait', …)`. |
| `citizenFocus.js` | `citizenSheet()` : une figure qui porte `p.fait` renvoie `{ kind: 'fait', name, line, … }` (Diogène : logis, métier et humeur écrits à la main). Le **focus** d'un chapitre non vu appelle `recordFaitDivers`. |
| `CitizenSheet.jsx` | Le mode « réplique » : la phrase dite à la place de l'humeur et des traits. |
| `ChronicleView.jsx` | Le panneau **« Faits divers »**. Il ne montre que les histoires déjà rencontrées, et pour chacune les chapitres vus, datés (âge + temps à vie). Une histoire finie reçoit un sceau. **Pas de « ??? », pas de compte, pas d'indice.** ⚠ Le re-rendu doit être piloté par une primitive (`faitsDivers.rev`) : une mutation en place ne relance pas `useGameState` (piège payé par le registre). |
| Traces | Une couche permanente, lue depuis `state.faitsDivers.traces`, posée à un lieu déterministe de son type et redessinée à chaque cycle. |

**Le banc d'essai** : une molette `__faits({ story: 'secte', ch: 2 })` qui fait naître le chapitre
près de la caméra, `__faitsState()` pour la progression, et des tests unitaires pour
l'éligibilité, l'enregistreur (y compris la survie au Grand Reset dans `grandReset.test.js`)
et la chaîne de pistes des Amoureux.

**L'art** : on réutilise d'abord les habitants par bande, `critters.js` (chèvre, chien), le feu
du conteur, l'ombre de poisson et les ronds dans l'eau. Il faut des décors neufs pour les
menhirs, la jarre et le tonneau, la borne, les instruments, etc. Estimation : environ 35 décors
PixelLab plus quelques animations. ⚠ `get_balance` avant chaque série (le crédit se renouvelle
le 30/10).

---

## 5. Les lots

1. **Socle et pilote** : état, enregistreur, metteur en scène, lieux (lisière, place,
   bâtiment), fiche en mode réplique, panneau de la Chronique, molette. Avec **la Secte**
   (Feu → Couronne) et **les Amoureux, acte I**. Raph juge en jeu.
2. **Les Amoureux en entier** et **Diogène en entier**.
3. **La Tortue** et **la Chèvre** (les scènes qui se déplacent).
4. **L'Homme-volant**, **la Querelle**, **le Monstre**, **le Musicien**.
5. **Fins et traces** (la Secte jusqu'au Démiurge, les croisements), puis les gags si Raph les
   garde.

---

## 6. Questions ouvertes

- Les Amoureux : les noms et le genre de chacun (les répliques françaises en dépendent).
- La phrase du feu au Démiurge.
- Les gags d'un seul coup : on les garde ?

---

## 7. Journal

- 2026-10-04 : chantier ouvert, catalogue et architecture écrits. Aucun code pour l'instant.
- 2026-10-04, Raph : « pas d'indices dans la chronique, ni sur le lieu, ni combien
  d'événements sont encore à suivre » ; OK pour la bûche et les gags ; les Amoureux
  s'appellent **Nancy** (elle) et **William** (lui) ; « travaille bien l'écriture,
  subtilité et profondeur dans certains, humour dans d'autres » ; tout mettre en place
  dans la journée, un commit par étape, étalé dans le temps (effet de surprise).
- **Lot 1 (socle) :** le texte de TOUTES les histoires est écrit (`data/faitsDivers.js`,
  `data/faitsDiversAmoureux.js`, 29 types de bâtiments × 2 pistes, accordées aux deux).
  En jeu : la Secte (les 7 âges) et Nancy et William jusqu'à l'acte II (les rendez-vous
  d'une seule personne, piste par piste).
  - La fiche d'habitant n'étant pas commitée (sa session attend le feu vert de Raph),
    les faits divers ont **leur propre** visée, survol et plaque de réplique
    (`fdPick.js`, `FaitDiversCard.jsx`) : rien n'importe `citizenFocus.js`. La plaque
    prend la place de la fiche (même coin) et la ferme (`CM.focus = null`).
  - La Chronique suit la grammaire de la Bibliothèque : un chapitre = son titre, son
    récit dans l'infobulle (comme « Les Âges traversés »). Le panneau n'existe pas
    tant que rien n'a été vu.
  - ⚠ Lisière : au campement la grille fait 20 cases et la forêt est dense — la recherche
    déborde la grille de 8 cases, et exige un losange SANS ARBRE devant la scène (la
    couronne d'un arbre au sud-est la recouvrait entièrement).
  - Banc : `__faits({ story: 'secte', ch: 2 })`, `__faits({ lovers: true })`,
    `__faits()` (état), `__faits({ clear: true })`.
  - Commité `5ef12ee0`.
- **Lot 2 : Diogène et Nancy-William en entier.**
  - Un module par histoire (`fdSecte.js`, `fdCynique.js`, `fdLovers.js`), les outils
    communs dans `fdKit.js`, le registre dans `fdScenes.js`.
  - Diogène se tient au BORD des places (convenu avec la session des places : leurs
    flâneurs ne s'arrêtent qu'au cœur), devant l'Académie pour le poulet, dans une rue
    droite pour la marche à reculons. Jarre, tonneau et capsule sont vus PAR
    L'OUVERTURE : le fond avant lui, la lèvre après — il est assis dedans. Sa plaque
    porte une ligne de fiche (« Logis : un tonneau · Humeur : parfaitement content ») ;
    quand on le regarde, il tourne le dos.
  - Nancy et William : rendez-vous à deux, le couple séparé (DEUX scènes à la fois,
    une seule « histoire » pour le plafond de deux), « là où tout a commencé » retenu
    par sa clé de bâtiment (`lovers.firstPlace`), le mariage sous une arche fleurie
    avec des pétales (invités en grappes lâches, jamais en cercle), le banc au bord de
    l'eau.
  - ⚠ VISIBILITÉ : dans une ville dense, un bâtiment planté devant une scène (plus près
    de l'œil) la cache entièrement. Toutes les places sont classées par le CÔNE VERS
    L'ŒIL (`openFront` : dx + dy = 1…prof, |dx − dy| ≤ 1, plus profond aux âges des
    tours) — les arbres de ville comptent aussi.
  - Commité `aecd22fa`.
- **Lot 3 : la Tortue de Zénon et la Chèvre des toits.**
  - La tortue longe le fleuve (la berge la plus habitée, du premier au dernier point
    « en ville ») ; à chaque chapitre la moitié de ce qui reste (`ZENON`). Achille la
    suit à partir du Marbre, en courant sur place (l'odomètre fait tourner les
    jambes) : vélocipède, réacteur (flammes), traînées de lumière. La ligne d'arrivée
    au Démiurge.
  - RÉSIDENTE : une fois rencontrée, la tortue reste sur la carte à son dernier
    chapitre vu (hors du plafond des deux scènes) ; son chapitre suivant la remplace,
    hors champ — elle a avancé.
  - Blanquette se pose sur la ligne d'encre d'un toit, comme les pigeons
    (`drawnBoxOf` + `inkTopAt`), triée JUSTE APRÈS sa maison — ⚠ avec la même clé
    poussée vers la rue (`isoFrontOffset`), sinon elle passe avant la maison et la
    boîte du toit n'existe pas encore. Un Seguin en bas, la tête levée (de dos).
  - Commité `21f528dd`.
- **Lot 4 : les Grandvent, la Borne, le Monstre, le Musicien.**
  - Grandvent : une boucle à graine — élan (ailes qui battent), saut en arc, plouf
    (ronds dans l'eau), retour ; catapulte, montgolfière qui dérive et descend dans le
    fleuve, réacteur trois secondes ; au Stellaire il vole et tremble ; au Démiurge,
    ailes rangées, il nous regarde.
  - La Borne : épées qui se fendent, pistolets qui fument tous les « mardis », caméra
    au procès télévisé, robots géants, la savante agenouillée au Démiurge.
  - Le Monstre : la ligne du pêcheur jusqu'à l'eau, l'aileron qui longe la rive, le
    sous-marin et ses bulles, la caméra et son projecteur la nuit, l'ombre immense,
    le dos d'Anselme et sa bulle au baptême (la foule : des figurants `mute`).
  - Le Musicien : un instrument par âge, des notes qui montent ; au clic, sa mélodie
    JOUE (`jouerMelodieScene`) ; au Démiurge, ses ancêtres en silhouettes pâles, chacun
    au costume de SON âge (`fdFigure(f, band)`), et la mélodie du premier soir.
  - ⚠ BERGES : sur le modèle des hérons (iso/isoRiverLife) — cadre du fleuve, quai à
    hw + 0,35, ni pont (`bridgeBlocks`) ni quai coupé (`CM.quayGate`), loin des
    merveilles (leur parvis compte désormais comme bâti). Le point d'EAU à
    max(0,3·hw, hw − 1,4) du fil : le lit dessiné garde une bande de VASE le long des
    quais (l'aileron s'y posait à mi-largeur).
  - Commité `051ff5a1`.
- **Lot 5 : les gags, les traces, les croisements.**
  - Les huit gags (`fdGags.js`) : la file d'attente le long d'une rue, la charrette de
    citrouilles, l'homme coincé sur un toit (posé sur la ligne d'encre, l'échelle trop
    courte en bas), la sieste dans le blé (on ne voit que les têtes — `sink` ; jamais
    sous la neige : condition `when` d'une scène), la sérénade (notes, fenêtre qui
    s'allume, seau d'eau), le cerf-volant dans un arbre de ville, la vache, le mime.
    Ils passent APRÈS les histoires (une chance sur deux quand aucune n'est à tirer).
    ⚠ Rues : en ville seulement (les chemins de campagne filent sous la forêt).
  - Les traces (`fdTraces.js`) des histoires finies : RÉSIDENTES (hors plafond, sans
    départ), écartées les unes des autres, fondues si elles naissent à l'écran ; un clic
    dit ce qu'on y lit (`traceSay` des données).
  - Croisements : au mariage, le musicien (s'il a été rencontré) joue — et sa mélodie
    joue au clic — ; Diogène regarde depuis son tonneau ; chez la secte (dès le Marbre),
    une chèvre sacrée si Blanquette a été rencontrée.
