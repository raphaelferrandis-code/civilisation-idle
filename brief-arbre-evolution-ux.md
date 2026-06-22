# Brief — Refonte UI/UX de l'arbre d'évolution (Civilisation Effondrement)

## Comment lire ce doc (pour Claude Code)

Ceci est un **brief de diagnostic**, pas un spec d'implémentation. Je veux que tu :

1. Analyses le code actuel de l'arbre d'évolution (localisation, modèle de données, rendu, gestion d'état).
2. Mappes chaque problème ci-dessous (`P0`/`P1`/`P2`) aux fichiers/fonctions concernés.
3. Me proposes un **plan par phases, une phase à la fois**, en commençant par celle que je recommande en bas.
4. Pour chaque phase : effort estimé, risque de régression, fichiers touchés.
5. Signales tout problème que je n'ai pas vu, ou toute contrainte technique qui change l'ordre des priorités.

Ne code rien tant qu'on n'a pas validé le plan ensemble.

---

## Contexte

- Écran concerné : l'**arbre d'évolution / arbre de compétences** (5 axes thématiques rayonnant depuis un nœud central).
- État actuel : ~80+ nœuds répartis en 5 branches colorées (savoir/bleu en haut, économie/or à droite, industrie/rouge en bas, un axe violet en bas-gauche, agriculture-population/vert à gauche). Nœud central affichant une valeur (« 472.3M »). Liens d'exclusion en pointillés rouges entre certains nœuds. Nœuds carrés aux extrémités (capstones présumés). États : acheté (✓) / achetable / verrouillé.
- Stack : React 19 + Vite, système de couleurs **token-based avec couleurs sémantiques** déjà en place.

## Diagnostic central

**L'arbre a poussé, il n'a pas été dessiné.** Chaque branche utilise une grammaire de layout différente (épine de poisson horizontale pour vert/or, arbre qui s'évase pour le bleu, chemin sinueux pour le rouge, diagonale courte pour le violet). L'œil n'arrive pas à construire un modèle mental cohérent. C'est la racine de la plupart des autres problèmes de lisibilité.

---

## Problèmes priorisés

### P0 — Grammaire de layout incohérente *(impact max, chantier lourd)*
- **Symptôme** : 5 axes, ~3 logiques de disposition différentes. La symétrie gauche/droite est lisible, mais haut et bas cassent le pattern.
- **Pourquoi ça compte** : sans grammaire unique, impossible de scanner l'arbre rapidement ; chaque ajout de contenu aggravera le désordre.
- **Piste** : passer à une grammaire **radiale unique** — 5 rayons identiques depuis le centre, nœuds régulièrement espacés, capstone à chaque extrémité. Renforce aussi la lecture « 5 piliers de la civilisation ». Alternative : assumer l'asymétrie mais donner à chaque axe une silhouette *voulue et reconnaissable*.
- **Note de séquencement** : gros refactor du moteur de positionnement → à traiter dans une phase dédiée, **pas en premier**.

### P0 — États mal différenciés *(impact max, chantier léger → à faire en premier)*
- **Symptôme** : « achetable » ne ressort pas assez ; c'est pourtant le seul call-to-action. « Acheté » et « verrouillé » se confondent par endroits ; les nœuds brun/gris du bas-droite sont quasi invisibles sur le fond navy.
- **Pourquoi ça compte** : le joueur doit voir d'un coup d'œil ce qu'il peut prendre maintenant.
- **Piste** :
  - Achetable → anneau lumineux + léger pulse (l'élément le plus saillant de l'écran).
  - Verrouillé → désaturation franche.
  - Acheté → s'efface en arrière-plan (il a déjà fait son job).
  - Vérifier que le brun/gris est un état « verrouillé » assumé et pas un simple défaut de contraste.

### P1 — Tout-icône, zéro texte
- **Symptôme** : icônes répétées (8 livres, plusieurs pièces, épis identiques) → impossible de distinguer les nœuds sans survoler chacun.
- **Pourquoi ça compte** : mur de devinettes qui empire à mesure que le contenu grossit.
- **Piste** : varier les icônes *à l'intérieur d'un axe* (badge de tier, sous-glyphe, numéro) **et** tooltip riche au survol/tap (nom + effet + coût + prérequis).

### P1 — Liens d'exclusion en pointillés = bruit permanent
- **Symptôme** : les arcs rouges traversent le centre et passent par-dessus les nœuds en permanence.
- **Piste** : ne les afficher qu'**au survol/sélection** du nœud concerné. Clic sur un nœud → ses incompatibilités s'illuminent, silence le reste du temps.

### P1 — Capstones illisibles
- **Symptôme** : les nœuds carrés des extrémités sont différenciés par la forme, mais leur sens (« objectif final de l'axe ») n'est pas évident, et ils se font couper par le viewport.
- **Piste** : plus gros / encadrés / nommés. Repère de progression naturel par axe.

### P2 — Navigation
- **Symptôme** : l'arbre déborde du viewport (capstones coupés).
- **Piste** : bouton « recentrer / zoom-to-fit », idéalement mini-map.

### P2 — Nœud central « 472.3M » ambigu
- **Symptôme** : nombre flottant sans label (points dépensables ? cumul ?).
- **Piste** : micro-unité/icône + rôle clair du nœud central (le « cœur » de la civilisation).

### P2 — Poids des traits incohérent
- **Symptôme** : lignes épaisses en dégradé vs chemins fins, sans logique apparente.
- **Piste** : soit le poids encode quelque chose (axe principal vs ramification), soit uniforme — mais pas au hasard.

---

## Contraintes & conventions à respecter

- **Réutiliser le système de couleurs token-based existant** et les couleurs sémantiques déjà définies — ne pas réinventer une palette.
- **Aucune régression** sur les états et la logique d'achat actuels.
- **Perf** : 80+ nœuds + liens, attention aux re-renders inutiles (penser mémoïsation, séparation données/rendu).
- Migration **atomique et réversible** par phase (cohérent avec ma façon de bosser).

## Ce que je veux que tu me rendes (avant tout code)

1. **Cartographie du code** : quel(s) composant(s) gèrent l'arbre, quel est le modèle de données des nœuds/liens, où vit l'état (achat, déblocage), et quelle techno de rendu (SVG ? canvas ? DOM/CSS ?).
2. **Mapping problème → code** : pour chaque `Pn`, les fichiers/fonctions impactés.
3. **Plan par phases** dans l'ordre recommandé ci-dessous, avec pour chacune : objectif, fichiers touchés, effort, risque de régression.
4. **Tes désaccords** : si l'ordre ou une piste te semble mauvais vu le code réel, dis-le.

## Ordre de bataille suggéré

1. **P0 — États** (léger, gros gain de lisibilité, zéro refonte du layout) → *commencer ici*.
2. **P1 — Liens d'exclusion au survol** (calme visuel immédiat).
3. **P1 — Tooltips riches + différenciation des icônes**.
4. **P1 — Capstones lisibles** + **P2 — navigation/zoom-to-fit**.
5. **P0 — Grammaire radiale** (chantier lourd, à isoler une fois le reste stabilisé).
6. **P2 — Hub central + poids des traits** (finitions).

## Questions ouvertes (réponds-moi en analysant le code)

- Quelle techno de rendu pour l'arbre aujourd'hui ?
- Les nœuds carrés sont-ils bien des capstones ? Sont-ils typés différemment dans les données ?
- « 472.3M » correspond à quelle ressource exactement ?
- Le positionnement des nœuds est-il calculé ou codé en dur (coordonnées fixes) ? → détermine la faisabilité du passage en radial.
