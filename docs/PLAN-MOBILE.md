# Refonte mobile — analyse et plan

État au 2026-07-28. Fait suite aux captures téléphone de Raph (384×782, DPR 3,8).
Le régime tactile existe déjà (`data-pointer="coarse"`, cf. `touch-shell.css`) :
ce document ne parle QUE de lui. Le bureau ne bouge pas.

---

## 1. Le diagnostic, en une phrase

**On a porté une mise en page de bureau sur un téléphone au lieu de concevoir un
écran de téléphone.** Chaque élément a été rétréci et empilé, mais l'organisation
est restée celle d'un écran large : plusieurs surfaces permanentes qui se
partagent la place, en même temps.

Compté sur la dernière capture, l'écran porte **six bandes horizontales**
superposées à la ville : barre de ressources, jauge de rupture, Premiers pas,
feuille boutique, poignée de Régulation, barre d'onglets. Il reste à la carte une
fenêtre d'environ 200 px de haut sur 782 — soit **un quart de l'écran pour ce qui
est censé être le sujet du jeu**.

Trois conséquences, toutes visibles sur les captures :

- **la ville n'est plus un décor, c'est une meurtrière** ;
- **la boutique n'a pas la place d'être une boutique** : à 46 dvh elle montre
  deux rangées et demie, et chaque rangée porte cinq informations ;
- **la lisibilité s'effondre** : des panneaux translucides posés sur une carte
  très texturée (arbres, neige), avec une police pixel à petit corps. Le texte
  passe sur des feuillages, pas sur un fond.

---

## 2. Ce que font les jeux du genre

Quatre familles pertinentes, et ce qu'elles ont en commun.

**City builders mobiles** (TheoTown, Pocket City). Carte en plein écran, sans
concurrence. Un mince bandeau d'état en haut (argent, population, date). En bas,
une rangée de boutons de mode. La sélection de bâtiment arrive en **feuille
basse** qui couvre 60 à 80 % — et pendant qu'on choisit, on ne regarde pas la
ville : c'est assumé.

**Idle « boutique »** (AdVenture Capitalist, Idle Miner). L'écran EST la liste
d'achats. Bandeau de monnaies en haut, onglets en bas, et entre les deux une
liste qui défile avec **un seul gros bouton par rangée**, prix inscrit dessus.
Aucune scène à préserver — quand il y en a une, elle vit dans son propre écran.

**Idle à scène** (Egg Inc.). La scène est le fond permanent, et **tout le reste
est une feuille qui monte et redescend**. Rien ne flotte durablement au-dessus de
la scène, sauf une ou deux pastilles.

**Le point commun, et c'est la règle qu'on n'applique pas :**

> **Un écran = une chose.** Soit on regarde la ville, soit on achète, soit on
> régule. Jamais trois moitiés de chacun.

Les autres constantes du genre :

| Convention | Aujourd'hui chez nous |
|---|---|
| Bandeau d'état ≤ 44 px, non interactif, chiffres seuls | ✅ fait (42 px) |
| Navigation en bas, dans la zone du pouce | ✅ fait (56 px) |
| Tout le reste en feuilles qui s'ouvrent et se ferment | ❌ trois surfaces permanentes |
| Une seule action principale par rangée, prix dessus | ⚠️ rangée à 5 informations |
| Fonds **opaques** sous le texte | ❌ verre translucide sur la carte |
| Détail au tap, pas affiché en permanence | ❌ tout est affiché |
| Zone haute = lecture, zone basse = action | ⚠️ mélangé |

---

## 3. Le plan

Six lots, du plus structurant au plus fin. Chacun est livrable et vérifiable
seul. **M1 et M2 portent l'essentiel du bénéfice.**

### ✅ M1 — Rendre l'écran à la ville *(LIVRÉ 2026-07-28)*

**Résultat mesuré en 384×782 : la carte passe de ~200 px à 651 px de haut.**
Arbitrage validé par Raph : la ville par défaut, la boutique à un tap.

- Boutique : plus de bande permanente. **Fermée elle n'existe pas** (le bouton
  flottant « marteau » en bas à droite l'ouvre), **ouverte elle prend 85 dvh** —
  5 rangées entièrement lisibles au lieu de 2,5. Fermeture par le chevron 44 px
  de son bandeau.
- Régulation : **retirée de la carte**, elle a déjà son onglet dans la barre du
  bas. On payait deux fois la même fonction, en pixels.
- Jauge de rupture : bande de 60 px → **33 px**, réduite au filet + pourcentage
  (libellé d'état et gain de ruines retirés).
- Ressources : valeurs **centrées** dans leur cellule et **unité d'échelle
  lisible** (0,72 → 0,85 em, opacité rendue) — sans elle, « 2.06 » peut valoir
  deux ou deux milliards.

*Détail d'origine ci-dessous, conservé comme trace de l'intention.*

### M1 — Rendre l'écran à la ville *(structurant)*

Objectif : **la carte occupe tout, sauf deux bandes fines.**

- La boutique cesse d'être une bande permanente : elle devient une **feuille
  plein écran** (85 dvh) ouverte depuis la barre du bas. Le partage 50/50
  actuel est un compromis de bureau, il ne survit pas à 384 px de large.
- La Régulation suit le même chemin : plus de poignée permanente, une **pastille
  d'alerte** sur la carte quand une tension monte, et la feuille au tap.
- **Premiers pas → pastille « i »** au bord de l'écran. *(déjà fait)*
- La jauge de rupture se fond dans le bandeau de ressources (un filet de 3 px
  sous les chiffres) au lieu d'occuper sa propre bande de 60 px.

Gain attendu : de ~200 px de carte à **~600 px**.

### ✅ M2 et M3 — LIVRÉS 2026-07-31

**M2** : le compteur possédé remonte sur la ligne du nom, le pied devient
« bouton large + gain à droite ». Le bouton passe de 38 % à **82-94 % de la
largeur** de la rangée. Aucune information retirée, seulement hiérarchisée.

**M3** : tous les panneaux du HUD deviennent **opaques** sur téléphone (le verre
dépoli posé sur une forêt était la vraie cause de l'illisibilité — c'est le
contraste qui manquait, pas les pixels), et le plancher des petits caractères
de la boutique passe de 11,5 à 12,5 px. **Contrastes mesurés : 5,7 à 18,2**,
tous au-dessus du seuil de 4,5.

⚠ Reste un point : les libellés d'onglets de la barre basse sont à 11 px et
« EFFONDREMENT » se tronque. Le remède n'est pas typographique mais éditorial —
des libellés courts propres au mobile. À traiter en M4.

### M2 — Refaire la rangée d'achat *(le geste du jeu)*

Aujourd'hui une rangée porte : nom, deux débits, délai de paiement, bouton,
pourcentage de gain, compteur possédé. **Six informations pour un geste.**

- Ligne 1 : nom + compteur possédé.
- Ligne 2 : **le bouton**, prix inscrit dessus, pleine largeur.
- Le reste (débits, %, délai) → au tap sur la rangée, ou dans une ligne
  secondaire grise d'une seule ligne.
- Cible ≥ 44 px, jamais moins.

### M3 — Lisibilité

- **Fonds opaques** pour toute feuille et tout panneau posé sur la carte. Le
  verre translucide est joli sur un fond calme ; sur une forêt il rend le texte
  illisible, ce que montre chaque capture.
- Remonter le plancher typographique mobile de 11 à **12-13 px** pour le texte
  secondaire (le plancher de 11 px a été calibré sur un écran de bureau à 1×).
- Passer les valeurs de la topbar en police chiffres à chasse fixe et vérifier
  le contraste réel (ratio mesuré, pas à l'œil).

### M4 — Ergonomie du pouce

- Toute action principale dans le tiers bas de l'écran.
- Feuilles fermables par **balayage vers le bas** ET par un bouton visible.
- Zones de tap élargies aux rangées entières plutôt qu'aux seuls boutons.

### M5 — Ce qui manque encore

- Le **débit « /s »** a disparu de la topbar (place). À rendre au tap.
- L'encart d'état (Âge/Usure/vœu/clepsydre) vit dans une feuille « État » :
  à retravailler en même temps que M1, une fois qu'il aura de la place.

### M6 — Vérification

- Rejouer la grille d'audit automatique (débord, texte sous plancher, cibles
  < 32 px) sur les 4 vues et les 2 régimes.
- Ajouter au harnais une mesure de **contraste** texte/fond, seul moyen objectif
  de trancher la question « c'est lisible ».
- Une capture de référence par vue, sur téléphone.

---

## 4. Ce que ça implique, et qui doit trancher

- **La mise en page mobile va DIVERGER franchement du bureau.** C'est le but :
  aujourd'hui elle en est une réduction, et c'est précisément le problème.
- **On ne verra plus la ville et la boutique en même temps.** L'arbitrage
  d'origine (« la carte et la boutique, les deux permanentes ») tient sur un
  écran large ; sur 384 px il donne deux surfaces trop petites pour servir. La
  proposition est de le remplacer par « la ville par défaut, la boutique à un
  tap ». **C'est la décision de Raph, elle conditionne M1.**
- Ordre conseillé : **M1 → M2 → M3**, puis le reste selon l'usage réel.
