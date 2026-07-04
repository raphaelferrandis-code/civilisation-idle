# REPRISE — Bulles de pensée des habitants (💭 📜 ⚡)

**État : à investiguer.** Symptôme signalé : « il n'y a plus de bulles qui apparaissent »
au-dessus des habitants sur la carte de ville. Mis de côté volontairement pendant la refonte
du déplacement piéton (marche au bord de route, trajets domicile/travail, mouvement continu).

> Contexte : la refonte piéton correspondante est committée (voir le commit
> `feat(carte): habitants …`). Fichiers concernés par les bulles : `src/game/map/agents.js`
> et `src/game/map/cityMapRuntime.js`.

---

## 1. Comment le système fonctionne (pipeline complet)

Une bulle = une petite récompense cliquable qui flotte au-dessus d'un habitant pendant 18 s.

1. **Apparition** — `drawCitizens()` dans `src/game/map/agents.js` (~l. 358-377) :
   - `CM.globalBubbleCooldown` initialisé aléatoirement à **10-25 s** (première bulle).
   - Chaque frame : scan `hasActiveThought` (un habitant a-t-il déjà `thoughtType` + `thoughtTimer > 0` ?),
     puis `globalBubbleCooldown -= dt`.
   - Quand le cooldown ≤ 0 **et** qu'aucune bulle n'est active **et** `CM.citizens.length > 0` :
     on tire **UN** habitant au hasard parmi `idleCitizens` (= `CM.citizens.filter(c => !c.thoughtType || c.thoughtTimer <= 0)`),
     on lui met `thoughtType` ∈ {`"thought"`,`"scroll"`,`"lightning"`}, `thoughtTimer = 18`,
     et le cooldown repart à **90-180 s**.
   - ⇒ **Une seule bulle à la fois**, première à 10-25 s, puis ~toutes les 90-180 s, durée 18 s.

2. **Minuteur** — décrémenté EN TÊTE de la boucle `for (const p of CM.citizens)` de `drawCitizens`
   (`p.thoughtTimer -= dt`, passe `thoughtType = null` à 0). *Déplacé récemment en tête de boucle
   (avant tout `continue`) : avant, un porteur off-screen/dormeur gelait son minuteur → `hasActiveThought`
   restait vrai → plus aucune nouvelle bulle. Ce point est donc désormais corrigé.*

3. **Dessin** — `drawCitizenThoughts()` dans `agents.js` (~l. 509+), appelée depuis la boucle
   d'`initCityMap` **seulement si `!CM.lodActive`** (donc pas en vue très dézoomée). Condition de
   dessin : `p.thoughtType && p.thoughtTimer > 0 && !p._nightHidden`. Position = `(p.x + p.lox, p.y + p.loy)`
   projetée, bulle à `sy - 18`.

4. **Clic → récompense** — `cityMapHitTestCitizenWithThought()` dans `cityMapRuntime.js` (~l. 310)
   trouve l'habitant sous le curseur (rayon `max(16, 14·z)`), puis `onCitizenThoughtClicked(hitCitizen, type)`
   (~l. 406-414) déclenche la récompense. *Hit-test réaligné récemment sur `p.lox/p.loy` (sinon le clic
   ratait dès l'ère 5).*

---

## 2. Hypothèse principale (la plus probable)

**La bulle est assignée à un habitant TIRÉ AU HASARD parmi TOUS les `CM.citizens`, sans filtre
« à l'écran ».** En fin de partie la ville compte jusqu'à ~450 habitants et la caméra n'en montre
qu'une fraction → le porteur de la bulle est **presque toujours hors champ**, donc la bulle est
invisible pendant ses 18 s. Comme il n'y a qu'**une bulle toutes les 90-180 s**, on peut jouer
longtemps sans jamais en voir une à l'écran.

**Correctif proposé :** restreindre `idleCitizens` aux habitants **actuellement visibles**
(ou proches du centre caméra) avant le tirage. Ex. dans `drawCitizens`, collecter pendant la
boucle de rendu la liste des habitants dont `sx/sy` tombent dans `[0..CM.cw] × [0..CM.ch]`
(ils sont déjà calculés), et tirer la bulle dans cette liste. Repli sur la liste complète si vide.
Bonus : augmenter légèrement la fréquence (cooldown 90-180 s → p.ex. 30-70 s) une fois le tirage
ciblé sur le champ visible.

---

## 3. Hypothèses secondaires

- **Nuit + dormeur** : `p._nightHidden` masque la bulle des dormeurs du tiers nocturne quand
  `nightF` est haut. Si la bulle tombe sur un dormeur estompé, elle n'est ni dessinée ni cliquable
  (voulu). À vérifier si le test a été fait « de nuit » (cycle jour/nuit ≈ 5 min).
- **Vue dézoomée (LOD)** : si `CM.lodActive` est vrai (zoom faible), `drawCitizenThoughts()` n'est
  pas appelée → aucune bulle dessinée. Vérifier le niveau de zoom pendant le test.
- **Rareté pure** : même sans bug, 1 bulle/90-180 s pendant 18 s est facile à manquer.

*Note : les modifications récentes (minuteur en tête de boucle, `_nightHidden`, réalignement du
hit-test) ne devraient PAS avoir cassé l'apparition de jour — elles la fiabilisent plutôt. À
confirmer en repartant de la vérification ci-dessous.*

---

## 4. Étapes de diagnostic (rapides)

1. **Confirmer que le pipeline tire bien des bulles** : dans `drawCitizens`, au moment de
   l'assignation, ajouter temporairement un `console.log("BULLE →", p.gx, p.gy, p.thoughtType)`
   et forcer `CM.globalBubbleCooldown` bas (p.ex. init à 2 et re-cooldown à 5). Jouer 30 s :
   - si des logs sortent mais rien à l'écran → c'est bien un problème de **visibilité** (hyp. 1/LOD/nuit).
   - si aucun log → problème d'**assignation** (cooldown jamais ≤ 0, `hasActiveThought` bloqué,
     `CM.citizens` vide, ou `drawCitizens` pas appelée).
2. **Vérifier l'état en console** (jeu ouvert) : inspecter `CM.citizens.filter(c=>c.thoughtType)` —
   y a-t-il un porteur bloqué avec un `thoughtTimer` qui ne descend pas ? Et `CM.lodActive` / `CM.cam.zoom`.
3. **Vérifier le rendu isolément** : forcer une bulle sur un habitant visible via la console
   (`CM.citizens[0].thoughtType='thought'; CM.citizens[0].thoughtTimer=60;`) et regarder si elle
   s'affiche → isole apparition vs dessin.

---

## 5. Pistes de correction (par ordre de rapport qualité/effort)

1. **Cibler les habitants visibles** au tirage (hyp. 1) — probablement LE correctif.
2. Fréquence un peu plus élevée une fois le tirage ciblé.
3. S'assurer que la bulle ne tombe pas sur un dormeur nocturne masqué (filtrer `!c._nightHidden`
   dans `idleCitizens` aussi).
4. Optionnel : garder une bulle « au moins visible X s à l'écran » (repositionner le tirage si le
   porteur sort du champ trop vite).

---

## Points d'entrée code

- Apparition + minuteur : `src/game/map/agents.js` → `drawCitizens()`
- Dessin : `src/game/map/agents.js` → `drawCitizenThoughts()`
- Hit-test + récompense : `src/game/map/cityMapRuntime.js` → `cityMapHitTestCitizenWithThought()`
  et le handler `onCitizenThoughtClicked`
