# L'Atlas de l'Effondrement

> Carte complète du jeu **Civilisation : Effondrement** — mécaniques, boucles, but.
> Synthèse ancrée dans `src/game/**` (12 systèmes relus).

---

## Le pitch

Un idle où l'on bâtit une civilisation **vouée à tomber** — et où chaque chute rend la suivante plus puissante.

Toute la tension tient dans un pari : **produire le plus haut possible, puis tomber au bon moment.**

**En chiffres :** 7 onglets · 5 ressources · 32 bâtiments · 299 ères · 14 mythes · 11 sceaux de Grand Reset · 4 jeux du temple · 208 articles de chronique.

---

## Le but

Il n'y a pas d'écran « victoire ». Le sommet, c'est le **Ragnarök** : honorer les **14 Mythes** débloque le **sceau final**, qui grave un titre permanent dans la Chronique et accorde un ×4 éternel sur les Ruines.

Au-delà, les **ères transcendantes** (jusqu'au Démiurge) donnent une destination sans fin à la puissance : il y a toujours un palier de plus.

La boucle qui y mène :

```
produire → s'effondrer → gagner des Ruines →
renforcer → monter plus haut →
réclamer un sceau (×2) → recommencer plus fort
```

---

## Le cœur — moment à moment

Un tick à **1 Hz** transforme les bâtiments possédés en production.

**5 ressources qui se financent en escalier :**
Population → Nourriture → Or → Savoir → Infrastructure

On achète des bâtiments (3 catégories : Moteurs / Savoir / Infra). **Tous les 25 achats, un jalon multiplie la production du type par ×2** (cité) ou **×1.5** (savoir/infra) — c'est ça le vrai moteur de croissance, pas l'accumulation linéaire.

### Les deux horloges

| Horloge | Nature |
|---|---|
| **Rupture** (instabilité) | *Maîtrisable.* Dérive vers une cible faite de 6 foyers (pénurie, inégalités, complexité, dissidence, structurel, démesure). On la ralentit — jamais on ne la fige. |
| **Usure** (temps) | *La deadline.* Use la cité inexorablement. C'est **elle** qui garantit qu'aucune cité n'est immortelle. |

À 100 % de l'une ou l'autre → crise terminale → effondrement → **+Ruines**.

---

## L'architecture : 4 boucles imbriquées

### 1. Le cycle *(minutes)*
Bâtir → s'effondrer. La civilisation lègue une **épitaphe** qui buffe la suivante.

### 2. La méta des Ruines *(heures)*
Les Ruines s'accumulent entre cycles, dopent passivement toute la production
(`1 + ruines^0.62 × 0.09`) et s'investissent dans l'**Arbre des Ruines** (4 branches + dogmes exclusifs).

### 3. Le Grand Reset *(jours)*
**×2 production & Ruines par sceau réclamé.** Efface tout — sauf les **héritages** (Mythes, artefacts éternels, sceaux déjà pris). Voir la section dédiée plus bas.

### 4. En parallèle — le Temple
La **Faveur** se gagne à 4 jeux d'argent (osselets, Vol d'Icare, tickets à gratter, vingt-et-un) et au tronc des offrandes. On l'investit en boosters, puis en **reliques de production éternelles** (Char / Corne ×2 / Œil ×4) qui, elles, **survivent au Grand Reset**.

> Le carburant se re-farme, les multiplicateurs acquis restent acquis.
> **C'est la vraie colonne vertébrale de l'end-game.**

---

## Les sept onglets

| Onglet | Rôle | Déblocage |
|---|---|---|
| **Cité** | Carte iso + boutique de bâtiments | dès le début |
| **Régulation** | Piloter la stabilité + gagner de la Faveur | dès le début |
| **Effondrement** | Édits terminaux, bilan de Ruines, testament, sceaux | dès le début |
| **Ruines** | L'arbre de compétences permanent (fresque pixel) | 1ᵉʳ effondrement |
| **Boutique** | Tout se paie en Faveur : boosters, artefacts, reliques | 1ʳᵉ Faveur |
| **Mythes** | 14 cycles-défis, la progression de fin de partie | 1ᵉʳ Grand Reset |
| **Chronique** | Le récit + le vrai bilan chiffré du cycle | dès le début |

---

## Les 11 Sceaux du Grand Reset (ordre libre)

Ce ne sont **pas** une échelle : c'est une **collection**. Chaque sceau se débloque **indépendamment, dans n'importe quel ordre** — le sceau IX peut tomber avant le II.

### Les trois états d'un sceau

| État | Sens |
|---|---|
| **Masqué** | condition jamais remplie (« ??? ») |
| **Prêt** ✦ | condition remplie une fois → **banké, réclamable à vie** |
| **Réclamé** ✓ | encaissé via un reset → **×2 permanent** |

### La stratégie du banking

Remplir une condition la **latche pour toujours**, mais *réclamer* coûte un reset (1 sceau). D'où la vraie décision :

> Reset maintenant (encaisser 1 sceau, perdre l'élan de la run) **ou** pousser encore pour banker plusieurs sceaux dans cette run puissante avant de lâcher ?

Tu peux banker 3 sceaux dans une grosse run, puis les encaisser un par un sur les resets suivants — sans avoir à les re-remplir.

### La liste

| # | Sceau | Condition |
|---|---|---|
| I | Le Premier Crépuscule | 10 effondrements |
| II | La Première Merveille | 3 merveilles érigées |
| III | Premier Pacte Mythique | 1 Mythe honoré |
| IV | La Colonne du Million | **pop ≥ 1e6 × 10^(sceaux réclamés)** |
| V | L'Olympe se prononce | un profil d'Olympe débloqué |
| VI | Acte I — La Fondation Scellée | 5 Mythes |
| VII | Le Jackpot d'Icare | 1 jackpot |
| VIII | Acte II — La Domination Scellée | 8 Mythes |
| IX | Les Couronnes Jumelles | les 4 capstones (arbre entier) |
| X | Au-delà de la Singularité | **ère ≥ 40 + 2 × (sceaux réclamés)** |
| XI | Sous le Regard du Ragnarök | 14 Mythes (+ héritage Ragnarök) |

Les sceaux **IV** et **X** sont **relatifs** : leur cible est indexée sur le nombre de sceaux déjà réclamés — donc jamais triviaux tard, jamais infaisables tôt. Le total reste **×2^réclamés**, quel que soit l'ordre.

---

## Les 14 Mythes

| Acte | Mythes | Rôle |
|---|---|---|
| **I · Fondation** | 5 — Chaos, Prométhée, Énée, Cadmos, Héphaïstos | **Le vrai mur du jeu.** Tant qu'il n'est pas scellé, tout le reste est verrouillé. |
| **II · Domination** | 3 — Sisyphe, Babel, Âge d'Or | Multiplicateurs d'échelle : coûts, adjacence, cité dorée. |
| **III · Apocalypse** | 5 — Atlas, Icare, Phénix, Atrides, Antée | Débloquent les grosses mécaniques : Surchauffe, automatisation, Ruines actives. |
| **Ragnarök** | 1 — finale | Les 13 contraintes réunies. Tenir 90 s + puissance ×3. |

Un Mythe = un **cycle-défi** : il impose une contrainte forte ; l'honorer donne un **héritage permanent**. Leurs objectifs sont **relatifs** (« ×100 pop depuis le début du cycle », « 150 s de ta production d'Or ») — c'est ce qui les garde difficiles à toute échelle.

---

## Les deux monnaies méta

### 🏛 Ruines — le prestige du cycle
- **Gagnées** à chaque effondrement (patience, pic de pop, savoir, infra, ère)
- **Dépensées** dans l'Arbre des Ruines
- **Effet passif** : `1 + ruines^0.62 × 0.09` sur toute la production
- **Persistance** : s'accumulent entre cycles · **effacées au Grand Reset**

### ✦ Faveur — la monnaie du temple
- **Gagnée** aux 4 jeux + tronc des offrandes (+2/min, cap 60)
- **Dépensée** en boosters, artefacts, reliques
- **Effet passif** : reliques Corne ×2 / Œil ×4 (×8 cumulé)
- **Persistance** : remise à 0 au GR — **mais les achats, eux, survivent**

> Cette distinction *carburant vs acquis* est le cœur du design end-game.

---

## Les partis pris — ce qui fait la signature du jeu

**Deux horloges, pas une.** La Rupture est pilotable, l'Usure est inexorable.

**Le calme se paie.** Sur-stabiliser la Rupture déclenche la *stagnation* : l'Usure accélère jusqu'à ×3. Rester trop tranquille rapproche la fin par l'autre bout.

**Tomber au bon moment.** L'effondrement est *récompensé* : tomber tard rapporte plus de Ruines. Le pari central = **temporiser** vs **survivre**.

**La nourriture ne se mange pas.** Ce n'est pas un stock consommé mais un *score* : une cité affamée croît juste plus lentement et voit sa Rupture monter. Jamais de mort par famine directe.

**Un casino à edge maison.** Les 4 jeux perdent en espérance… jusqu'à la **« bascule »** où les boosters les transforment en imprimante volontaire (RTP > 1).

**Une fin sans fin.** Après la Singularité, des ères transcendantes infinies (avec des sous-ères « factices » pour le sentiment de progrès) — jamais de mur final.

**Débloquer dans l'ordre qu'on veut.** Aucun sceau ne peut en bloquer un autre : si le jackpot ne tombe pas, on va chercher ailleurs.

---

## Où se joue vraiment le pacing

Enseignement mesuré au simulateur : **les seuils numériques ne sont pas le levier.**

Contre le ×2^n de production, un seuil fixe est écrasé. Ce qui pace réellement la fin de partie :

1. **La difficulté des Mythes** (sceaux III / VI / VIII / XI) — le vrai mur.
2. **Le sceau IV (population)** — le seul seuil qui fait un mur franc (~2 jours).
3. **Le jackpot d'Icare** (sceau VII) — un gate de chance, désormais non bloquant.

C'est pourquoi les sceaux IV et X ont été rendus **relatifs**, et pourquoi le système est passé en **ordre libre**.

---

*Généré depuis le code source du jeu. Les formules citées sont celles réellement en vigueur.*
