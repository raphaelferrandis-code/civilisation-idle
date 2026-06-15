# Prochaine étape — Ères au-delà de 35 (boosts ressentis en fin de partie)

> Doc de reprise. Lire d'abord [`RAPPORT-REFONTE-RUPTURE.md`](RAPPORT-REFONTE-RUPTURE.md)
> pour le contexte rupture/trésor (terminé). Ce doc capture le **prochain fil** :
> donner une destination à la puissance de fin de partie.

## Le problème (mesuré)
- Outil : [`scratch/sim-gold-anchor.js`](../scratch/sim-gold-anchor.js) — auto-partie longue
  qui logge l'échelle des ressources et les foyers. (`node scratch/sim-gold-anchor.js 50`)
- À **50 h** de sim (joueur-robot optimal), la **population atteint ~10⁸⁴**.
- L'**ère max** (« Singularité », index 34) tombe à **10³⁵**.
- → Le joueur dépasse la dernière ère de **~49 ordres de grandeur**. Pire : dans **un seul
  cycle**, la pop fait 10 → 10⁸⁴, donc **les 35 ères sont franchies dans les premières secondes**,
  puis plus aucun palier.
- **Conséquence** : les **boosts de production** débloqués par les Mythes (héritages) ne font
  franchir **aucun nouveau cap** une fois l'ère 35 atteinte → **ils ne se ressentent pas**.

## La courbe actuelle des ères ([`src/game/data/world.js`](../src/game/data/world.js), `eras`)
35 ères, **~1 ordre de grandeur par ère**, de 10¹ (Campement) à 10³⁵ (Singularité). Régulier,
puis ça s'arrête net.

## Le plan proposé (validé en discussion)
Pour que les boosts soient **ressentis**, il faut **DEUX** choses :

1. **Des paliers** → de nouvelles ères **beaucoup plus dures** au-delà de 35 (écarts accélérants
   : ×10², ×10³…), placées là où la pop voyage vraiment (via la sim).
   - **(A)** tranche **handcraftée** de ~15-25 ères « transcendantes » (beaux noms cosmiques)
     jusqu'à ~10⁹⁰.
   - **(B)** filet **procédural infini** au-delà (seuil = 10^f(n), noms générés) → ne jamais
     re-buter sur un mur (les nombres sont sans borne, Decimal).
   - Reco : **(A) + (B)**.

2. **Une récompense qui SCALE** (sinon les ères ne sont que des noms) :
   - ✅ Le **+1 Ruine par ère** (`ERA_RUIN_BONUS_PER_INDEX`, appliqué dans `ruinGain` via
     `eraFlatBonus = ERA_RUIN_BONUS_PER_INDEX * bestEraIndex`) scale déjà bien.
   - ⚠️ **LE VRAI BLOCAGE** : le bonus de prod par ère (`recurring_ages`) est **normalisé pour
     plafonner à ×1,665 quel que soit le nombre d'ères**. Dans
     [`mechanics.js`](../src/game/core/mechanics.js) `globalMultiplier()` :
     `normalizedBestEraIndex = bestEraIndex * (19 / (eras.length - 1))` puis
     `recurringAgeBonus = 1 + normalizedBestEraIndex * 0.035`.
     → à l'ère max, normalized = 19 **toujours**. Ajouter des ères ne donne **aucune** prod en
     plus au sommet. **Il faut délier ce plafond** (ne plus diviser par `eras.length-1`, ou
     repenser la courbe) pour que les hautes ères paient en production.

## Garde-fous (ne pas casser)
- **`ruinGain()`** : son terme d'ère (`normalizedEraIndex`) est **figé sur `RUIN_REFERENCE_POP`
  (1.5e11), PAS sur `eras.length`** — volontaire (cf. commentaire). Ajouter des ères ne le touche
  pas → ne pas y toucher.
- **`recurring_ages` normalisation** : c'est elle qu'il faut délier (cf. ci-dessus) ; vérifier
  qu'on ne nerfe pas l'early en le faisant.
- Re-mesurer au besoin (`scratch/sim-gold-anchor.js`, ou un bench dédié era-pacing).
- Autres dépendances à `bestEraIndex` / `eras.length` à auditer : `currentEraIndex()`, `mapStage`,
  golden tests (`economy.golden.test.js`).

## Lien avec les Mythes (contexte de la discussion)
- Les Mythes (14, en 3 actes + Ragnarök) sont gatés derrière **Grand Reset 1** (`isMythUnlocked`)
  et donnent des **héritages permanents** (boosts de prod) + gatent les GR profonds. C'est la
  **vraie route principale**.
- Mais l'échelle des ères se **complète indépendamment** (sim atteint l'ère 34 sans mythes) → les
  ères « volent la vedette » et rendent les boosts mythiques sans destination. Étendre les ères
  **redonne une destination** aux héritages mythiques.

---

## Prompt de reprise (à coller dans une nouvelle session)

> On reprend le travail sur le **pacing des ères** (suite de la refonte rupture/trésor, voir
> `docs/PROCHAINE-ETAPE-ERES.md` et `docs/RAPPORT-REFONTE-RUPTURE.md`).
>
> Constat mesuré : en fin de partie la population dépasse la dernière ère (10³⁵) de ~49 ordres de
> grandeur (pop ~10⁸⁴ à 50 h de sim), donc les boosts de prod des Mythes ne font franchir aucun
> nouveau palier → ils ne se ressentent pas.
>
> Objectif : ajouter des **ères beaucoup plus dures au-delà de la 35e** (handcraftées + filet
> procédural infini), **ET délier le plafond de récompense de prod par ère** (la normalisation
> `recurring_ages` dans `globalMultiplier` plafonne à ×1,665 quel que soit le nombre d'ères) pour
> que les hautes ères paient vraiment. Place les seuils avec `scratch/sim-gold-anchor.js`, sans
> casser `ruinGain` (figé sur `RUIN_REFERENCE_POP`) ni les golden tests. Propose le design chiffré
> puis prototype + mesure.
