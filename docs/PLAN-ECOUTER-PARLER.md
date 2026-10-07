# Plan — Écouter, puis parler

Chantier ouvert le 2026-10-07 sur la demande de Raph :

> « Et possibilité d'interagir avec ? qui jouerait avec le lore et la compréhension qu'ils
> ont du joueur ? Au début une option écouter la discussion pour les comprendre et on
> n'interagit pas avec eux, puis après une option dialogue qui permette de parler avec
> certains. »

**Statut : plan. Rien n'est codé pour l'écoute ni pour les signes ou les mots.** La fiche
d'habitant qui sert de socle est faite (commit `4a99b8bc` : identité, foyers, métier,
humeur et sa cause, « où il est entré »). Les questions du § 11 attendent Raph.
**Ce document fait foi pour ce chantier.**

---

## 0. En bref

- **Deux compréhensions avancent ensemble.** Le joueur comprend les habitants en les
  écoutant. Les habitants comprennent le joueur en le voyant faire.
- **La voix du joueur se gagne** : d'abord le silence (écouter), puis des signes, enfin des
  mots. Aujourd'hui, le joueur n'a jamais parlé, sauf un murmure rapporté dans l'histoire de
  Diogène.
- **Ils n'en savent jamais plus que la Chronique de leur cité.** Elle repart de zéro à
  chaque chute (`resetTemporaryRunState`), leur savoir aussi.
- **Le récit seulement.** Aucun effet de jeu pour l'instant.
- **N'importe quel passant** peut être écouté, recevoir un signe, puis des mots. Les
  figures de la Chronique et des faits divers ont en plus des arcs écrits.

---

## 1. Les décisions de Raph (2026-10-07)

| Question | Réponse |
|---|---|
| « Comprendre » | **Le sens.** Le texte reste lisible ; ce qui se gagne, c'est la confiance, donc la profondeur de ce qu'on entend. Pas de langue à déchiffrer. |
| L'identité du joueur | **Elle suit ce qui se sait dans la Chronique.** |
| La voix du joueur | **Des signes, puis des mots.** Interactions possibles dès le début : souffle de vent, lumière plus intense, feu plus fort, écouter les pensées du passant. |
| Les effets | **Seulement le récit**, « à voir plus tard ». |
| Les interlocuteurs | **N'importe quel passant.** |
| L'ordre | La fiche d'abord (faite), puis le lore et les interactions. |

---

## 2. Les règles

1. **Facultatif.** Écouter et parler ne rapportent rien qu'on regrette d'avoir ignoré. La
   carte reste un rendu qu'on regarde (décision D2 de la refonte des Mythes) et ses actions
   restent facultatives : ni minuteur, ni obligation.
2. **Discret**, comme les faits divers : aucune icône sur la carte pour signaler une
   conversation intéressante, aucun compteur, aucun « ??? ».
3. **Éternel pour le joueur, neuf pour la cité.** Ce que le joueur a entendu et dit survit
   aux chutes et au Grand Reset (`GR_PERSISTENT_FIELDS`). Ce que les habitants SAVENT de lui
   repart avec chaque cité, comme leur gazette. Seules les figures qui traversent les cycles
   (Claude, la troupe, Nancy et William) se souviennent.
4. **Le récit seulement** : aucune ressource, aucune Rupture, aucune Faveur.
5. **Jamais deux fois la même chose.** Un échange entendu ne revient pas tant que la
   réserve de sa situation n'est pas épuisée.
6. **Écrit à la main**, choisi par l'état du jeu. Pas de génération à la volée : le ton est
   tenu, et le jeu tourne hors ligne.
7. **Le style des textes du jeu** : phrases courtes et concrètes, ni tiret, ni « ! », ni
   points de suspension. Le ton de la Chronique et des faits divers : ironie sèche, une
   chute, de la tendresse.

---

## 3. Ce qui existe déjà

### 3.1 Ce que le lore établit (relevé du 2026-10-07)

**La Chronique** est la voix des habitants. Elle publie par **période**, sur l'index d'ère
(`chronicleEvaluator.getPeriod`) : P1 < 4, P2 < 9, P3 < 15, P4 < 21, P5 < 27, P6 < 32, P7
au-delà. Ce qu'elle dit du joueur, période après période :

| Période | Ce qu'ils savent de toi |
|---|---|
| P1 | Rien. Le feu, le froid, le clan. Claude : « Comme d'habituuude. » |
| P2, P3 | Des dieux capricieux, puis « une main invisible » (Raphaël, p3). |
| P4 | Un culte nouveau, « le Créateur », « Celui qui nous guide », « Celui qui regarde ». Aldric : « Et si nous n'étions pas bénis, mais observés ? » |
| P5 | Le schisme : « Les uns disent qu'il nous guide. Les autres qu'il nous teste. Les derniers qu'il attend. » La Main devient un symbole. |
| P6 | La Main devient un logo ; Khael ouvre un procès contre l'Invisible. **« Vous n'avez répondu à aucun débat. »** |
| P7 | La boucle, le compteur. Edith : **« Demande solennelle à vous voir »**. Raphaël : **« Je crois qu'il joue. »** |

Les âges 7 à 9 (Noosphère, Stellaire, Démiurge) n'ont **aucun article à eux** : ils restent
en P7.

**L'Olympe** lit déjà la façon de jouer : `state.olympus` (éternel) compte les chutes
déclenchées (`manualCollapses`, `totalCollapses`, `collapseRuptureSum`), les crises
résolues ou ignorées, le temps sans intervenir (`idleSeconds`), le temps en Rupture haute.
Il en tire quatre cultes : Dieu de la Fin, Dieu des Registres, Dieu qui Rêve, Dieu du Bord.
Aujourd'hui, personne dans la rue n'en parle.

**Les personnages récurrents de la Chronique**, qu'on ne croise jamais : Claude (gardien du
feu de P1 à P7, « J'ai déjà vu ce genre de nuit »), Edith (comptable puis Intendante),
Raphaël (habitant puis essayiste), Khael (juge), Aldric (philosophe), Nessa, Garin, Renaud,
Doran.

**Deux motifs** reviennent partout : le **feu** (le premier feu, la flamme votive de la
Faveur, la Secte qui attend que le feu parle) et le **regard** (Diogène tourne le dos à la
caméra ; le dernier Grandvent : « Et toi, tu as toujours regardé. Merci. »).

**Ce qui n'est pas établi** : la voix du joueur, les âges 7 à 9, le Grand Reset (absent de la
fiction), le rapport entre le joueur et « les dieux ».

### 3.2 Ce que la carte et la fiche donnent déjà

- **Les causettes** : deux passants qui se croisent s'arrêtent de 3 à 6,5 s
  (`citizenGreetings`, agents.js) ; les compagnons font la causette ; les flâneurs des places
  se tiennent en groupes (`plazaFolk.js`, act `chat`) ; les promeneurs du quai vont par deux.
- **La fiche** (`citizenIdentity.js`, `citizenFocus.js`) : nom, métier, âge, foyer (les
  prénoms du conjoint, des enfants, de l'aïeul), caractère (clés `TRAITS`), humeur et sa
  cause, l'endroit où il est entré (`p._in`).
- **Les comportements** : `citizenTraits` (citizenDay.js) fait agir le caractère.

---

## 4. Écouter

### 4.1 Le geste

- Quand le passant désigné **parle avec quelqu'un** (causette, compagnon, groupe de place),
  la fiche propose **Écouter**. Les deux restent sur place le temps de l'échange (2 à 4
  répliques, environ 3 s chacune). Les répliques remplacent les lignes de la fiche, une à
  une, avec le prénom de qui parle. Sur la carte, une petite marque au-dessus de qui parle,
  jamais de texte. Puis ils reprennent leur route.
- Quand il **marche seul**, la fiche propose **Écouter ses pensées** (l'interaction de Raph) :
  une ligne, plus franche que ce qu'il dirait tout haut.

### 4.2 Ce qu'ils disent : trois couches

1. **Leur vie** : le métier, le foyer (par leurs vrais prénoms, ceux de la fiche), le
   travail, le voisin. « Talia dit que le four ne suit plus. »
2. **La cité telle qu'elle est** : le foyer de Rupture qui domine (la même source que la
   cause de l'humeur), la pluie, la nuit, la dernière crise, la merveille, l'émeute, et **la
   dernière dépêche de la Chronique** : on parle des nouvelles.
   « Plus de farine au moulin. » « Il y en avait hier. » « Hier, c'était hier. »
3. **Toi** : ce qu'ils croient (§ 6). Tard, et pas devant tout le monde.

### 4.3 La confiance

Ce qui ouvre la troisième couche :
- **le nombre d'échanges déjà entendus** (éternel) : plus le joueur a écouté, plus la cité
  ose parler de lui ;
- **ce qui se sait** : la période de la Chronique et les articles déjà parus dans ce cycle ;
- **le lieu et l'heure** : la nuit, à l'écart, pas au milieu de la grand-place ;
- **le caractère** : le curieux, le superstitieux et le pieux en parlent, le taciturne jamais ;
- **les pensées** avant les paroles : on y pense avant d'oser le dire.

### 4.4 La trace

Un panneau **« Ce qu'on dit de toi »** dans la Chronique, sur le modèle du panneau des faits
divers. Il ne montre que ce que le joueur a entendu sur lui, daté (âge, temps de jeu), sans
compte ni « ??? ». C'est là qu'apparaît **le nom qu'ils te donnent** (§ 6.4).

---

## 5. Les signes

### 5.1 Le geste

Dès le début, comme l'a voulu Raph. Dans la fiche, une rangée de signes ; le passant réagit
(il lève les yeux, s'arrête, se retourne), puis une pensée dit ce qu'il en fait. Un signe ne
change rien au jeu : le feu monte à l'écran, la production ne bouge pas.

### 5.2 Le répertoire

Retenus par Raph :
- **le souffle de vent** autour de lui ;
- **la lumière plus intense** sur lui ;
- **le feu plus fort**, le feu le plus proche ;
- **écouter ses pensées**, rangé avec l'écoute (§ 4.1).

Proposés, à choisir (§ 11, question 1) :
1. **Souffler une idée** : une bulle s'allume au-dessus de lui, l'inverse de cueillir ses
   pensées (`rewardCitizenThought`).
2. **Envoyer un rêve** à un dormeur, qu'il raconte le lendemain dans une causette (le Dieu
   qui Rêve de l'Olympe).
3. **Les bêtes te voient** : un chien ou une chèvre s'arrête et fixe la caméra ; il suit son
   regard.
4. **L'ombre d'un nuage** qui ne passe que sur lui.
5. **Une étoile filante**, la nuit, dont on entend le vœu.
6. **Un poisson qui saute** sans raison, près du quai.
7. **Un mot dans la cendre du feu** : le passage des signes aux mots (§ 7.1).
8. **Le même signe change de forme avec les âges** : le feu, puis la lampe, puis le néon
   qui grésille (la Secte du Feu lit déjà les clignotements d'une enseigne).

### 5.3 Comment ils les lisent

- **Par l'âge** (la période de la Chronique) : au Feu, un esprit ; au Marbre, un dieu ; à la
  Fonte, un courant d'air ; au Néon, une panne.
- **Par le caractère** : le pieux y voit un message, le superstitieux a peur, le curieux
  demande « Encore une fois ? », le râleur se plaint, le taciturne regarde et ne dit rien.
- **Par la répétition** : la première fois la surprise, la deuxième une explication, la
  troisième « Ça suffit. ». C'est la seule limite : pas de délai de recharge.
- **En réponse** : quand un passant demande un signe (§ 7.1), le signe est une réponse, et il
  l'interprète, parfois de travers.

### 5.4 Garde-fous de DA

- Des phénomènes naturels seulement : ni orbe, ni halo, ni lueur cyan, ni anneau
  (« trop IA », rejeté).
- Pas de fenêtres qui s'allument (rejeté au lot 1 « ville habitée »).
- Le feu passe par les flammes existantes : le feu n'est pas un pigment (`SKIP_FIRE`,
  rampe à part).
- Le son des signes se règle avec le chantier « ambiance sonore »
  (`docs/PLAN-AMBIANCE-SONORE.md`).

---

## 6. Ce qu'ils savent et ce qu'ils croient de toi

### 6.1 Ce qui se sait : la Chronique de la cité

- **Le cadre** : la période de la Chronique (tableau du § 3.1). Un habitant de P2 ne parle
  pas du Créateur.
- **Les faits publiés** : les articles déjà parus dans ce cycle
  (`state.chronicleEntries[].articleId`). On ne parle du procès de Khael qu'après que la
  gazette l'a annoncé. À la chute, tout est oublié, comme la gazette.

### 6.2 Ce que tu fais

Les faits que la cité a vus, et qui nourrissent les rumeurs de la troisième couche :

| Fait | Où il se lit | Exemple |
|---|---|---|
| Les chutes que tu déclenches | `state.olympus` (éternel) | « Mon grand-père a vu tomber deux cités. » |
| Les crises résolues ou ignorées | `state.olympus` | « Il paraît qu'on règle nos crises dans des registres. » |
| Le temps sans intervenir | `state.olympus.idleSeconds` | « Les veilleurs parlent bas. » |
| Ton absence | rapport d'absence (`idleReport.js`) | « Trois jours sans que rien ne bouge. » « Les champs ont poussé quand même. » « C'est bien ce qui m'inquiète. » |
| Le legs choisi à la chute | `activeEpitaphLegacy` | « Sous les ruines, il y avait du grain. Quelqu'un l'avait gardé pour nous. » |
| Les bulles de pensée cueillies | **à compter** (rien ne les compte aujourd'hui) | « J'avais une idée ce matin. » « Et alors ? » « Elle est partie. Quelqu'un l'a prise. » |
| La Maison des Plaisirs | `chronicleStats.games` | « Il paraît que là-haut, on joue nos récoltes aux dés. » |
| La caméra qui suit quelqu'un | la session (`CM.focus`) | le superstitieux presse le pas, l'enfant fait signe |

Le chemin d'une crise (Traiter ou Profiter) n'est consigné nulle part aujourd'hui : à
ajouter seulement si on veut des rumeurs dessus.

### 6.3 Leur caractère fait la lecture

Le même fait, plusieurs voix, jamais un verdict. Après une chute que tu as déclenchée, le
pieux dit « Il nous a reposés », le râleur « Il nous a jetés ».

### 6.4 Le nom qu'ils te donnent

Un nom par période et par culte dominant de l'Olympe (`lastDominantProfile`). Des noms nus
et concrets, jamais un verbe et une allitération. Pistes à écrire avec Raph : « Celui qui
regarde », « le Dormeur », « la Main », « le Comptable », « l'Absent ».

---

## 7. Les mots

### 7.1 Le déclic

Aucun bouton n'apparaît tout seul. Un soir, au Feu, le joueur écoute deux hommes près du feu :

> Garin : « Tu crois que le feu nous entend ? »
> Claude : « Le feu, non. » *(il lève les yeux vers la caméra)* « Mais quelqu'un écoute. »

C'est le gardien du feu de la Chronique, celui qui a déjà vu ce genre de nuit. À partir de
là, des passants peuvent **demander un signe** (« Si tu m'entends, fais monter le feu. ») :
le dialogue commence par des signes. Si le joueur ne fait rien : « Comme d'habitude. »

### 7.2 Quand viennent les mots

Proposition (§ 11, question 2) : les mots s'ouvrent quand la Chronique reproche au joueur de
ne pas répondre, en P6 (« Vous n'avez répondu à aucun débat. »). Avant, des signes. Chaque
cité refait le chemin ; Claude, lui, se souvient : « On s'est déjà parlé. Pas dans cette
vie. »

### 7.3 Le format

Dans la fiche : la réplique du passant, puis deux ou trois réponses courtes. Un échange
tient en deux ou trois tours. Le tutoiement suit le lien : « tu » au coin du feu, « vous »
quand le joueur devient une institution (le Créateur, le tribunal de Khael : « Vous êtes
accusé de cycles. »), « tu » de nouveau au Démiurge, entre égaux.

### 7.4 Qui

- **N'importe quel passant** (décision 5) : de courts échanges choisis par la situation et le
  caractère.
- **Les figures, avec des arcs écrits** :
  - Claude, Edith, Raphaël, Khael et Aldric descendent dans la rue, reconnaissables, et
    changent de métier d'âge en âge comme dans la gazette ;
  - Diogène et la Secte du Feu, qui attend qu'une voix sorte du feu.

### 7.5 Ce que ça change

Le récit seulement :
- ce que le joueur dit change ce qu'ils croient et le nom qu'ils lui donnent ;
- la gazette en parle ;
- les figures qui traversent les cycles s'en souviennent ;
- une promesse se paie : « je reviendrai », puis trois jours d'absence, et quelqu'un s'en
  souvient.

**Le Grand Reset entre dans la fiction.** Au Démiurge, Claude : « Tu vas tout effacer. Même
ça ? » Après le reset, au premier feu : « J'ai rêvé que tu avais dit non. »

---

## 8. L'écriture

- **Un catalogue déclaratif**, comme celui des faits divers. Chaque entrée :
  `{ id, couche, genre ('causette' | 'pensée' | 'signe' | 'dialogue'), quand: { bandes,
  période, articles parus, nuit, temps, foyer de Rupture, trait, métier, faits }, répliques:
  [{ qui, fr, en }], poids }`.
- **Des noms vrais** : une réplique peut citer le conjoint, l'enfant, l'atelier, le logis de
  la fiche (`{conjoint}`, `{enfant}`, `{travail}`). Le mari parle de sa vraie femme.
- **Jamais de redite** (règle 5) : les identifiants entendus sont gardés (éternel).
- **Le volume** : quelques centaines d'échanges en tout, écrits âge par âge et lot par lot,
  comme les faits divers. C'est le vrai coût du chantier.

---

## 9. L'architecture proposée

| Fichier | Rôle |
|---|---|
| `src/game/data/paroles.js` | Le catalogue : données pures. |
| `src/game/core/paroles.js` | **Seule source de mutation** (modèle `faitsDivers.js`) : entendu, signes donnés, déclic, mots dits, nom donné. `state.paroles` déclaré avant `export let state = load()` (piège TDZ), au normaliseur, et dans `GR_PERSISTENT_FIELDS`. |
| `src/game/map/paroles/pick.js` | Le choix d'un échange, **pur et testé** : situation, candidats, poids, pas de redite. |
| `src/game/map/paroles/scene.js` | Tenir la causette le temps de l'échange (`pauseT`, `chatT`), les réactions (pose, regard vers la caméra). |
| `src/game/map/paroles/signs.js` | Les effets des signes, par forme d'âge. |
| `citizenFocus.js`, `CitizenSheet.jsx` | Écouter, Signes, Parler ; la vue d'échange dans la fiche. |
| `ChronicleView.jsx` | Le panneau « Ce qu'on dit de toi ». |
| Tests | Le choix, la redite, l'éligibilité par période, la survie au Grand Reset, l'i18n. |

À compter en plus : les bulles cueillies (§ 6.2).

---

## 10. Les lots

1. **Écouter, le socle** : le geste, les pensées, les couches 1 et 2 du Feu à la Couronne, la
   mémoire de l'entendu, le panneau. Raph juge en jeu.
2. **Ce qu'on dit de toi** : la troisième couche, branchée sur la Chronique et l'Olympe ; le
   nom qu'ils te donnent.
3. **Les signes** : les trois de Raph et ceux qu'il retient, les réactions par âge et par
   caractère.
4. **Le déclic et le dialogue par signes** : Claude, du Feu à la Couronne.
5. **Les mots** : les passants, puis les figures de la Chronique.
6. **Les âges 7 à 9, le Démiurge, le Grand Reset dans la fiction.**

---

## 11. Questions ouvertes

1. **Quels signes** en plus des trois de Raph ? (§ 5.2, propositions 1 à 8)
2. **Quand s'ouvrent les mots** : en P6, quand la Chronique reproche au joueur de ne pas
   répondre, ou plus tôt ?
3. **Les âges 7 à 9** : écrire d'abord leurs articles de Chronique (les habitants n'en savent
   pas plus qu'elle), ou les laisser en P7 ?
4. **Écouter ses pensées** : dès le début pour tous, ou après le déclic ?
5. **Le nom qu'ils te donnent** : écrit dans la Chronique, ou seulement entendu ?
6. **Le son des signes** : avec le chantier « ambiance sonore » ?

---

## 12. Journal

- 2026-10-07 : idée de Raph et ses cinq décisions. La fiche d'habitant, socle du chantier,
  est faite et committée (`4a99b8bc`). Plan écrit ; aucun code.
