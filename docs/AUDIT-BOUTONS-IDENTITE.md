# Audit des boutons, pastilles et encoches — reprendre une identité

**Date** : 2026-07-31
**Déclencheur** : Raph a reconnu, dans un autre jeu navigateur (*Destiny Eleven*, également
fait avec Claude), **exactement les mêmes boutons, encoches et pastilles** que dans
Civilisation Éternelle. Le constat est juste, et il est mesurable.

**Décisions déjà prises** (questions du 2026-07-31) :
- **Matériau** : hybride CSS + quelques sprites héros, ET exploration des packs itch.io.
- **Signature visuelle** : à trancher sur planches PixelLab, pas sur description.
- **Ampleur** : socle + hiérarchie complète. Les mini-jeux gardent leur peau.

**Ce document ne code rien.** Il dit ce qui doit changer, par quoi, et dans quel ordre.

---

## 1. Pourquoi ça ressemble à un autre jeu — le constat, chiffré

### 1.1 La source unique du problème

Tout part de 12 lignes dans [`src/styles/base.css:143`](../src/styles/base.css#L143) :

```css
button {
  min-height: 2.5rem;
  border: 1px solid var(--line);
  border-radius: 8px;                                    /* ← tic nº1 */
  background: rgba(255, 255, 255, 0.04);                 /* ← tic nº2 */
  box-shadow: inset 0 1px 0 var(--shine), 0 1px 3px rgba(0,0,0,0.2);  /* ← tic nº3 */
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);     /* ← tic nº4 */
}
button:hover:not(:disabled) {
  transform: translateY(-1px);                           /* ← tic nº5 */
  box-shadow: ..., 0 4px 12px rgba(0,0,0,0.35), 0 0 12px rgba(var(--era-rgb), 0.15);
}
```

Ces cinq traits sont **la signature par défaut** de toute UI sombre générée par un LLM :

| # | Le tic | Pourquoi c'est le défaut | Occurrences dans le projet |
|---|--------|--------------------------|---------------------------|
| 1 | `border-radius: 8px` | La valeur par défaut de Tailwind (`rounded-lg`) | 26 déclarations en 8px, **15 valeurs de rayon différentes** au total |
| 2 | Fond `rgba(255,255,255,0.04)` | Le « verre sombre » canonique | — |
| 3 | Liseré de verre `inset 0 1px 0` | Simule un reflet en haut du bouton | **22** |
| 4 | `cubic-bezier(0.4, 0, 0.2, 1)` | L'easing *ease-in-out* de Material Design | **10** (sur 11 `transition: all`) |
| 5 | `translateY(-1px)` au survol | Le « lift » de la carte Material | **17** |

Et les tics qui en découlent sur le reste du CSS :

- **141** `box-shadow: 0 0 Npx rgba(...)` — des **glows**. Cent quarante et un.
- **78** ombres portées douces `0 Npx Mpx rgba(0,0,0,...)`.
- **40** `backdrop-filter` — le *glassmorphism*, présent partout.

> Le problème n'est pas qu'un de ces traits soit laid. C'est qu'ils sont **le réglage par
> défaut**, donc partagés avec des milliers d'autres interfaces. Un joueur ne saurait pas
> le nommer, mais il l'a déjà vu. Toi, tu l'as reconnu.

### 1.2 Le parc de boutons est ingouvernable

Mesuré sur `src/**/*.jsx` :

| Mesure | Valeur |
|---|---|
| `<button>` dans le jeu | **181**, répartis dans **37 fichiers** |
| Qui portent une variante `.btn-*` | **12** (6,6 %) |
| Qui n'ont **aucune classe** | **43** (23,8 %) |
| Dont le `className` est une expression dynamique | **71** (39,2 %) |
| Variantes déclarées dans `buttons.css` | **6** (`primary`, `secondary`, `danger`, `critical`, `tiny`, + `purchase` ailleurs) |

**Traduction** : 6 variantes existent, presque personne ne les utilise, et un bouton sur
quatre tombe directement sur le style générique. Le système de boutons n'est pas
« incohérent » : il **n'est pas branché**.

Les 43 boutons nus, par rôle réel (relevé complet en annexe A) :

| Rôle implicite | Nb | Où |
|---|---|---|
| **Fermer / Quitter** | ~11 | tous les `*Stage.jsx`, les 4 dialogues, `MythsView` |
| **Debug** | 10 | `DebugDialog.jsx` — sans enjeu |
| **Sauvegarde / import / export / slots** | 6 | `OptionsDialog.jsx` |
| **Rejouer / changer de mise** | ~6 | `AuguryStage`, `IcarusStage`, `BlackjackStage`, `ScratchStage` |
| Divers | ~10 | `HeritageView`, `ContemplationBar`, `TreeNode` |

Le rôle « Fermer » revient **onze fois sans jamais avoir de nom**. C'est le symptôme le
plus net : un rôle qui existe dans le jeu mais pas dans le CSS.

### 1.3 Les pastilles ont proliféré

**14 familles concurrentes** de pastilles/badges, chacune redéfinie à zéro dans sa propre
feuille, pour trois fonctions seulement :

```
annals-chip   augury-chip   effect-chip   level-chip   output-chip
scratch-chip  bj-chip       icarus-crash-chip          choice-badge
milestone-badge   myth-status-badge   hud-dock-badge
subtab-badge      chronicle-reg-badge      (+ pr-milestone-badge)
```

Et **3 familles d'onglets** pour un seul comportement : `options-tab`, `shop-subtab`,
`compte-tab`.

### 1.4 Ce qui n'est PAS le problème

Deux choses vont bien et ne doivent pas être touchées :

- **Les tokens de couleur** ([`variables.css`](../src/styles/variables.css)) sont propres,
  documentés, avec les ratios de contraste mesurés. La palette n'est pas générique : le
  bleu nuit `#0E1320` + or patiné `#C9A968` est un choix, et un bon.
- **La typographie** est réglée et argumentée (Pixelify / Silkscreen / Inter, plancher à
  11 px). Elle porte déjà de l'identité.

**Le problème est 100 % dans la forme et la matière du chrome**, pas dans la couleur ni la
police.

---

## 2. Ce que tu as déjà — l'identité en germe

Bonne nouvelle : **la réponse existe déjà dans le projet**, elle ne couvre juste presque rien.

### 2.1 Le crantage

[`layout.css:91`](../src/styles/layout.css#L91) porte déjà l'intention exacte :

> *« Boutons pixel : coins crantés (encoche 3px via clip-path, pas d'arrondi lisse) +
> biseau haut clair / bas sombre, façon plaque de bronze embossée. »*

C'est **la bonne idée**, et elle est appliquée à **4 endroits sur tout le jeu** :

| Objet | Encoche | Fichier |
|---|---|---|
| `.tab` (nav sidebar) | 3 px | `layout.css:100` |
| `.quick-actions .btn-tiny` | 2 px | `layout.css:226` |
| `.city-status-panel` | 3 px | `layout.css:263` |
| `.roadworks-panel` | 6 px (autre géométrie) | `purchase.css:671` |

Quatre objets. Sur cent quatre-vingt-un boutons.

### 2.2 Le chrome pixel étirable

`public/pixelart/ui/chrome/` contient **deux fichiers, et aucun bouton** :

- `panel-greek.png` (107×109) — cadre de panneau, méandre grec, tranches `48 40 42 48`
- `gauge-frame.png` (20×33) — jonc de jauge, tranches `5 10 5 9`

La méthode 9-slice est **documentée et éprouvée** dans
[`docs/ui-references.md`](ui-references.md) — y compris ses pièges (période de motif de
19 px mesurée par autocorrélation, `round` vs `stretch`, le contour du capuchon effacé à
l'encre). C'est un actif réutilisable tel quel.

### 2.3 Le vivier d'icônes

`public/pixelart/ui/` compte déjà **13 dossiers** d'icônes pixel maison (`nav/`, `res/`,
`seals/`, `foyers/`, `glyphs/`, `faveur/`…), la plupart déclinées en `@16/@24/@32/@48`.
L'iconographie n'est pas le chantier — elle est faite.

> **Conclusion de la section 2** : il ne s'agit pas d'inventer une identité. Il s'agit de
> **généraliser celle qui existe déjà sur 4 objets**, et de lui donner du sens.

---

## 3. La hiérarchie des boutons — le cours

Tu as dit ne pas t'y connaître. Voici le strict nécessaire, en trois idées.

### 3.1 Un bouton dit trois choses à la fois

1. **« Ça se clique »** — l'affordance. La forme seule doit le dire, avant la couleur.
2. **« Voilà l'importance »** — le poids visuel, qui guide l'œil vers l'action attendue.
3. **« Voilà la conséquence »** — réversible ou non, gratuit ou coûteux.

L'erreur du jeu aujourd'hui : **les trois passent par la couleur**. Or la couleur est le
levier le plus faible dont on dispose.

### 3.2 Les leviers, du plus fort au plus faible

| Rang | Levier | Force | Remarque |
|---|---|---|---|
| 1 | **Remplissage** (plein > teinté > transparent > rien) | ★★★★★ | Le seul qui marche à coup sûr |
| 2 | **Taille / hauteur** | ★★★★ | Se lit en vision périphérique |
| 3 | **Contraste du texte** | ★★★ | |
| 4 | **Bordure** (épaisse > fine > aucune) | ★★ | |
| 5 | **Couleur (teinte)** | ★ | ~8 % des hommes sont daltoniens ; et sur fond sombre les teintes se resserrent |

**Doctrine à adopter** : hiérarchiser par le **remplissage** et la **taille**. Ne colorer que
pour dire un **sens** (or = payable, rouge = irréversible, gris = verrouillé).

### 3.3 La règle « 1 / quelques / le reste / +1 »

Sur n'importe quel écran :

- **1 seul** bouton de niveau 1 — l'action pour laquelle le joueur est venu.
- **Quelques** niveau 2 — les alternatives légitimes.
- **Tout le reste** en niveau 3 — les utilitaires, qui ne doivent **pas** attirer l'œil.
- **+1 critique** — le bouton dangereux. Il n'est pas *plus important*, il est *autre*.
  **Il ne doit jamais être le plus attirant de l'écran**, sinon on le clique par réflexe.

> Aujourd'hui `.btn-critical` est le seul bouton plein + le seul avec une ombre portée
> colorée : c'est **le plus attirant du jeu**, et il déclenche un effondrement. C'est
> exactement à l'envers.

---

## 4. Le système cible

### 4.1 L'idée d'identité : **le coin cranté veut dire « ça se clique »**

C'est la proposition centrale, et c'est ce qui te distinguera vraiment. Pas un décor : une
**information**.

| Forme du coin | Signification | Objets |
|---|---|---|
| **Encoche 4 px** | action majeure | Acheter, Confirmer, Lancer un rite |
| **Encoche 3 px** | action normale, navigation | onglets, boutons secondaires |
| **Encoche 2 px** | utilitaire, icône | fermer, zoom, sauvegarder |
| **Coin droit, zéro encoche** | **ça ne se clique pas** | pastilles, jauges, badges, valeurs |
| **Encoche ébréchée / irrégulière** | verrouillé, ruiné | nœuds d'arbre non acquis |

**Conséquence directe** : `border-radius` disparaît du vocabulaire des éléments
interactifs. Les 15 valeurs de rayon actuelles se réduisent à **deux** :
`--r-pill` (999px, réservé aux pastilles de comptage) et `0` partout ailleurs.

Un joueur apprend cette grammaire en dix minutes sans qu'on la lui explique. Et **aucun
autre jeu ne l'utilise**, parce qu'elle demande d'y avoir pensé.

### 4.2 Les 7 rôles

Remplace les 6 variantes actuelles. Nommage `.btn-*` conservé pour limiter la casse.

| Rôle | Quand | Remplissage | Haut. | Encoche | Couleur |
|---|---|---|---|---|---|
| **1. `btn-action`** | L'action de l'écran | **plein** bronze | 40 px | 4 px | or patiné |
| **2. `btn-neutral`** | Alternative légitime | teinté 8 % | 36 px | 3 px | neutre |
| **3. `btn-ghost`** | Utilitaire, « voir plus » | **aucun** | 32 px | 2 px | texte faible |
| **4. `btn-critical`** | Irréversible | teinté rouge, **jamais plein** | 36 px | 4 px | rouge, + confirmation |
| **5. `btn-icon`** | Carré, sans libellé | teinté | 32 px | 2 px | neutre |
| **6. `btn-close`** | **Le rôle manquant** (×11) | aucun | 28 px | 2 px | texte faible |
| **7. `btn-toggle`** | On/off | *ce n'est pas un bouton* | — | — | voir 4.3 |

Plus **2 cas spéciaux qui ne sont pas des boutons** :

- **`.purchase-row`** — c'est une **carte cliquable**, pas un bouton. Elle a sa propre
  grammaire (bord gauche 3 px comme témoin d'état) et doit la garder. Attention :
  ses deux pseudo-éléments sont déjà pris par le splash-art (piège connu).
- **Le groupe segmenté** (`format-option`) — les **28 boutons** de `OptionsDialog` qui
  forment des choix exclusifs (langue, densité, contraste, saison, météo, qualité…)
  ne doivent **pas** être 28 boutons. Ce sont 9 contrôles segmentés : un seul bloc,
  séparé par des filets, avec un seul segment enfoncé.

### 4.3 Les bascules ne sont pas des boutons

`toggle-btn on/off` apparaît 5 fois. Un état binaire persistant se montre par un
**interrupteur** (une position dans une glissière), pas par un bouton qui change de
couleur. Le joueur doit voir l'état **sans lire le texte**.

### 4.4 Les pastilles : 14 familles → 3 rôles

| Rôle | Fonction | Forme |
|---|---|---|
| **`chip-value`** | Porte un nombre (+12 nourriture, ×3) | coin droit, filet 1 px, `--font-number` |
| **`chip-state`** | Porte un état (verrouillé, actif, gagné) | coin droit, fond teinté par le sens |
| **`chip-count`** | Compteur de notification | **le seul objet rond du jeu** (`--r-pill`) |

Les 14 familles deviennent des **modificateurs de couleur** sur ces trois bases
(`.chip-value.is-gain`, `.chip-state.is-locked`…), pas des composants séparés.

> Réserver la forme ronde au **seul** compteur de notification, c'est ce qui la rend
> lisible. Aujourd'hui `999px` est utilisé **23 fois** : la rondeur ne signifie plus rien.

### 4.5 Le mouvement

À supprimer, ce sont des marqueurs génériques :

- `translateY(-1px)` au survol (×17) → remplacer par un **enfoncement au clic**
  (`translateY(+1px)` + inversion du biseau). Une plaque de bronze ne lévite pas ; elle
  s'enfonce. C'est plus juste **et** plus identitaire.
- `transition: all` (×11) → transitions nommées, sur `background` et `border-color`.
- `cubic-bezier(0.4, 0, 0.2, 1)` (×10) → `steps(2)` ou `linear`. Un jeu pixel n'a pas
  d'accélération continue ; l'easing lisse trahit le vectoriel.
- Le **glow** au survol → réservé à `affordable` / `critical` / `milestone`, ce que
  `buttons.css` prescrit **déjà en commentaire, sans l'appliquer**.

---

## 5. Par quoi — les sources

### 5.1 Ce qui reste en CSS (la quasi-totalité)

Encoche, biseau, enfoncement, états, tailles : **tout en CSS**, via `clip-path` et des
`box-shadow` durs (1 px, jamais floutés). Zéro asset, se retaille à toute taille, marche
sur mobile.

**Un piège à connaître** (documenté dans le CSS existant) : `clip-path` sur un parent
**découpe tous ses descendants**, y compris en `position: fixed`. C'est pour ça que
`.tab .tab-badge` est en flux et pas en absolu. Toute pastille débordante sur un bouton
cranté devra suivre la même règle.

### 5.2 Ce qui devient sprite pixel (4 à 5 objets, pas plus)

Seuls les objets où le regard s'arrête méritent un vrai 9-slice :

1. Le bouton **Acheter** de la rangée de boutique (l'objet le plus vu du jeu)
2. Le bouton **Effondrement** (le moment le plus solennel)
3. La barre d'action de **crise**
4. Le bouton **d'invocation de Mythe**
5. *(optionnel)* Le cadre du **groupe segmenté**

Méthode déjà éprouvée : `create_ui_asset` → `scripts/sliceUiChrome.mjs` → `border-image`.
Solde PixelLab : **2428 générations**, une planche en coûte 40.

### 5.3 Les packs itch.io — verdict honnête

Je ne peux **rien télécharger** (Defender fait tomber la session), et itch.io renvoie 403
à mes requêtes automatisées : **je n'ai pas pu vérifier moi-même les licences ci-dessous**,
elles viennent des descriptions publiques. À valider par toi avant tout achat.

| Pack | Adéquation | Verdict |
|---|---|---|
| [Pixel UI Kit — Fantasy RPG GUI](https://amadeva.itch.io/pixel-ui-kit-fantasy-rpg-gui-panels-menus-bars-icons) (KodaMonroezz) | **La meilleure** : panneau sombre + filet or, 9-slice annoncé | À regarder en premier |
| [Ornate Fantasy Pixel UI](https://z-spider.itch.io/dark-fantasy-pixel-ui-modular-interface-for-unity) (zLizard) | 1500+ éléments, 8 thèmes de couleur | Le plus fourni ; risque de bloat |
| [Pixel Art UI — Gothic/Medieval/Dark](https://spellsoftpixel.itch.io/pixel-art-ui-gothic-medieval-rpg-dark-fantasy) (SpellSoft) | Sombre, ornementé | Gothique ≠ antique, à vérifier à l'œil |
| [Gothic Pixel UI](https://abyssowl.itch.io/gothic-pixel-ui) (AbyssOwl) | Sombre | Idem |
| [UI Background 9-Slices Vol. 1](https://ome6a1717.itch.io/ui-background-nine-slices) (ome6a1717) | Fonds 9-slice variés | Utile en complément, pas en base |
| [Mechanical Pixel Art GUI](https://untiedgames.itch.io/mechanical-pixel-art-gui) (unTied) | 9-slice très complet | **Hors thème** (mécanique/steampunk) |
| [FREE Game UI Starter Pack](https://zofiab.itch.io/game-ui-starter-pack) (ZofiaBosak) | Gratuit, 9-slice | Trop clair/neutre pour le jeu |

### 5.4 ⚠ Ce que tu possèdes déjà et qui a été écarté à tort

`docs/ui-references.md` écarte deux packs Kenney avec ce motif : *« pixel art (utiles
seulement si la refonte iso reprend ; en pause) »*. **La refonte iso a repris depuis
longtemps.** Et ils sont sur ton disque, à
`OneDrive/Bureau/Kenney Game Assets All-in-1 3.5.0/UI assets/` :

- **UI Pack - Pixel Adventure** — **514 PNG**, CC0, 4 déclinaisons
  (grandes/petites tuiles × contour épais/fin), 91 tuiles chacune. Contient des panneaux
  9-slice en 5 coloris, boutons, bannières, badges hexagonaux, cadres circulaires,
  glissières. **Zéro téléchargement, zéro licence à vérifier.**
- **UI Pixel Pack** — une planche unique (`UIpackSheet_transparent.png`).

**Mais** : le style Kenney est un cartoon clair à contour épais (beige/brun/bleu/rouge).
L'adopter tel quel reviendrait à **troquer « ça ressemble à tous les jeux Claude » contre
« ça ressemble à tous les jeux de game jam »** — Kenney est le pack le plus utilisé au
monde. Verdict : **à ne pas prendre comme base**, mais excellent comme **banc d'essai**
pour valider la géométrie d'un 9-slice sans dépenser une génération.

---

## 6. Le plan, en lots

Ordre choisi pour que **chaque lot se voie tout seul** et soit annulable.

| Lot | Contenu | Fichiers | Effet visible |
|---|---|---|---|
| **0. Direction** | Choisir la signature sur les 4 planches PixelLab | — | *bloquant* |
| **1. Le socle** | Réécrire `button {}` : encoche, biseau, enfoncement au clic, purge des 5 tics | `base.css`, `variables.css` | **Les 181 boutons changent d'un coup** |
| **2. Les 7 rôles** | Réécrire `buttons.css`, créer `btn-close` et `btn-ghost` | `buttons.css` | Hiérarchie lisible |
| **3. Rebrancher** | Poser une classe sur les 43 boutons nus (annexe A) | 11 fichiers JSX | Plus de bouton orphelin |
| **4. Les pastilles** | 14 familles → 3 rôles ; libérer le rond pour le seul comptage | 8 feuilles | Cohérence |
| **5. Le segmenté** | Les 28 `format-option` → 9 contrôles segmentés ; les 5 `toggle-btn` → interrupteurs | `OptionsDialog.jsx` | Options lisibles |
| **6. Les onglets** | `options-tab` + `shop-subtab` + `compte-tab` → une famille | 3 feuilles | Cohérence |
| **7. Les héros** | 4 sprites 9-slice PixelLab + découpe + `border-image` | `chrome/`, `purchase.css` | Le grain pixel |
| **8. Mobile** | Vérifier le crantage sous `touch-shell.css` (il annule déjà le `clip-path` de `.tab`) | `touch-shell.css` | Parité |

Les **mini-jeux gardent leur peau** (décision prise) : `AuguryStage`, `BlackjackStage`,
`ScratchStage`, `IcarusStage` ne sont touchés qu'au lot 3, pour leurs boutons *Fermer*
et *Rejouer*.

---

## 7. Pièges connus, à ne pas redécouvrir

Tirés de l'historique du projet et du code lu :

1. **`clip-path` découpe tous les descendants**, `position: fixed` compris. Toute pastille
   sur un bouton cranté doit être **en flux** (`layout.css:122`).
2. **Les 2 pseudo-éléments de `.purchase-row` sont pris** par le splash-art. Invisible au
   lint et aux tests — vérifié à l'époque au prix d'une session entière.
3. **Un enfant se peint toujours au-dessus de la bordure de son parent.** C'est pour ça
   que `gauge-frame` est en surcouche `::after` et pas en `border-image`. Même piège
   attendu sur tout bouton 9-slice avec un remplissage.
4. **Ne pas juger un raccord 9-slice au coup d'œil.** Les deux défauts corrigés sur
   `gauge-frame` étaient invisibles en vue d'ensemble ; il a fallu un relevé de couleur
   colonne par colonne pour nommer le coupable (`#010505` à x=8).
5. **Les captures de la preview pane sont fragiles** sur ce projet. Ce qui marche :
   `foreignObject` → canvas → POST `/__shot`. `html2canvas` ne rend **pas** `border-image`.
6. **Vérifier par `npm run lint`** (= `eslint .`), jamais `npx eslint src`.
7. **Une garde déduite d'une table qu'on a soi-même écrite est une garde molle.** Si on
   teste la hiérarchie, tester qu'elle **mord** : casser volontairement une règle et
   vérifier que le test tombe.
8. **Dialogues** : jamais d'`onClose` sur une `<dialog>` (double appel en StrictMode).

---

## 8. Les 4 planches de direction (2026-07-31)

Générées chez PixelLab, `create_ui_asset` 688×384, seed 11, mêmes éléments
(`button ×3`, `icon_button`, `tab`, `health_bar`). Dans
[`docs/concepts/ui-boutons/`](concepts/ui-boutons/).

| | Direction | Ce que ça donne | Verdict |
|---|---|---|---|
| **A** | `dirA-bronze-grave.png` | Champ bleu ardoise + cadre bronze à **coins coupés visibles**. Palette à deux doigts de `#0E1320` / `#C9A968`. | **La plus sûre.** Lisible à toute taille, la plus proche de la palette actuelle, et la seule qui porte déjà le crantage. |
| **C** | `dirC-ardoise-meandre.png` | Ardoise + **méandre grec** bronze courant sur tout le pourtour. | **La plus identitaire.** Cohérente d'emblée avec `panel-greek.png`. Le méandre tient sur un bouton de la taille de « NEW GAME » — ma crainte du § 4.1 était trop prudente. ⚠ reste à vérifier sous 60 px. |
| **B** | `dirB-argile.png` | Terre cuite mate, zéro reflet. | Fidèle à la palette terre cuite validée, mais **perd le bleu nuit** : l'écran deviendrait monochrome chaud. Et l'affordance est molle pour un bouton cliqué mille fois. |
| **D** | `dirD-pierre-gravee.png` | Pierre grise + **runes bleues lumineuses**. | **À écarter.** Runes = Nordique, pas Méditerranée. Et le halo bleu sur les runes est exactement le tic « trop IA » qu'on fuit. |
| **E** | `dirE-reliure-sombre.png` | **Cuir bleu nuit + filet à l'or + clous d'angle.** Générée après le pack « Book » de Raph, pour voler la métaphore du livre sans en prendre le parchemin. | **La meilleure.** Seule des cinq à livrer **les coins coupés** ; palette exactement celle du jeu ; sobre, aucun halo. |

### La leçon des négations

Les 4 premières planches sont toutes sorties avec des **coins arrondis**, malgré
`no rounded corners` écrit noir sur blanc dans le prompt. **PixelLab ignore les
négations.** La planche E l'a obtenu en décrivant la géométrie **en positif** :
*chamfered octagonal corners*. Règle à retenir pour toute génération future.

**Doctrine retenue quand même** : on **découple**. Le crantage reste du **CSS pur**
(`clip-path` le fait parfaitement, à toute taille, sans asset), et les sprites héros
n'apportent que la **matière** — le grain, le filet, la patine. Plus simple, plus
robuste, et ça marche avec n'importe laquelle des directions.

**Classement** : **E** d'abord (palette juste, encoche présente, métaphore du livre qui
colle au vocabulaire du jeu), **C** ensuite (déjà à moitié dans le jeu via
`panel-greek.png`), **A** en repli.

---

## 8 bis. Le pack « Complete UI Book Styles » (fourni par Raph, 2026-07-31)

`Complete_UI_Book_Styles_Pack_Free.7z` à la racine du dépôt. Extrait et mesuré.
*(Pas de 7-Zip installé sur la machine ; le `tar.exe` de `System32` est un bsdtar/libarchive
qui lit le 7z nativement. À réutiliser.)*

### Ce que c'est

**Complete UI Book Styles Pack — version gratuite v1.0**, par **Crusenho Agus Hennihuno**
([crusenho.itch.io](https://crusenho.itch.io/complete-ui-book-styles-pack)). Un seul style
sur les onze du pack complet : `01_TravelBookLite`. Sources Aseprite incluses.

**Licence** : usage commercial autorisé sans limite, modification autorisée.
Revente interdite (y compris modifiée), NFT interdits. **Crédit obligatoire** avec lien
vers la page produit. → une ligne dans l'onglet Crédits des Options suffit.

**Gratuit vs payant** : 77 assets gratuits contre 151 + 589 autres pour **3,90 $**.

### Contenu réel — 67 PNG statiques

| Catégorie | Nb | Utile ici ? |
|---|---|---|
| Glyphes de **manette** (A/B/X/Y, LB, RT, sticks…) | **19** | ❌ jeu navigateur |
| **Chrome interactif** (frames, slots, popup, bascules, barres, poignées) | **18** | ✅ le cœur |
| Icônes (cœur, étoile, pièce, engrenage, éclair…) | 18 | ⚠️ tu en as déjà 13 dossiers |
| Curseurs, marqueurs, points, alerte | 6 | ❌ |
| Prompts de commande (appui/maintien) | 3 | ❌ |
| Couverture + pages de livre | 3 | ⚠️ décoratif |

**18 pièces réellement exploitables sur 67.** Plus 5 images d'une animation de bouton.

### Les mesures qui décident

**1. La géométrie 9-slice est excellente.** `Frame01a` fait 62×14 px et son profil
colonne par colonne donne des **tranches de 2 px à gauche comme à droite** (mesuré : la
colonne x=2 est déjà identique au milieu, idem x=59 en repartant de la droite). Un
`border-image: url(...) 2 fill stretch` suffirait. C'est **beaucoup plus simple** que
`panel-greek.png` (tranches 48 40 42 48) ou `gauge-frame.png`. Aucun risque de couture.

**2. L'animation d'enfoncement valide le § 4.5.** Les 5 images de
`Sprites Animated/UI_TravelBook_Button01a_*` sont exactement l'enfoncement au clic que
l'audit recommande à la place du `translateY(-1px)` : la plaque descend, l'ombre se
resserre. Bonne nouvelle indépendamment du reste.

**3. La palette est l'inverse de la tienne.** 36 couleurs distinctes, dominées par
crème `#FFD7A8` (30 408 px) et brique `#B75B5F` (31 797 px). **Zéro bleu.** Le jeu est
bleu nuit `#0E1320` + or patiné `#C9A968`. Posées sur ton fond
(`docs/concepts/ui-boutons/uibook-pieces-sur-fond-jeu.png`), les pièces crème sont des
dalles éblouissantes.

**4. Il n'y a pas de hiérarchie dedans.** Trois frames (normal, non sélectionné,
sélectionné) et un bouton carré animé. Rien pour bâtir 7 rôles.

### Verdict

**Bien fait, propre, mais il ne résout pas ton problème.**

Ton problème est « mes boutons ressemblent à ceux de tout le monde ». Or `Frame01a` est
une **barre plate avec un biseau, sans le moindre ornement** : c'est le style par défaut
des jeux *cozy*, aussi répandu que le verre sombre de Claude. On troquerait une généricité
contre une autre — et il faudrait en plus **basculer toute l'UI du bleu nuit au parchemin**,
ce qui déborde très largement du chantier boutons.

**Ce qu'il faut lui voler, en revanche** : l'**idée du livre**. Le jeu parle déjà de
Chronique, d'Annales, de Testament, de Stèle, de Fresques. Une **reliure** (cuir sombre,
filet à l'or, clous d'angle) garde le bleu nuit **et** attrape la métaphore. C'est la
direction **E** générée à la suite.

**À garder du pack, concrètement** :
- la recette 9-slice à 2 px comme **banc d'essai gratuit** pour valider le montage
  `border-image` avant de dépenser une génération PixelLab ;
- les **5 images d'enfoncement** comme référence de timing ;
- les sources **Aseprite**, si tu veux repeindre un frame à ta palette plutôt que de
  regénérer (36 couleurs seulement, `scripts/remapPalette.mjs` avale ça sans broncher).

---

## 8 ter. Le pack COMPLET (acheté par Raph, 2026-07-31)

`Complete_UI_Book_Styles_Pack_Full.7z`, 5,7 Mo. **1667 PNG**, 15 sources Aseprite,
**5 styles** + un dossier d'icônes (75) + une police pixel (`Anxel.ttf`).
Rien à voir avec la version gratuite : celle-ci ne montrait qu'un style sur cinq, et
son plus faible.

### Les 5 styles, mesurés

Luminance moyenne pondérée et part de pixels froids, calculées **sur le chrome
seul** (frames, slots, boutons, bannières, barres, bascules — pas les icônes) :

| Style | Chrome | Couleurs | Luminance moy. | Pixels froids | Dominantes |
|---|---|---|---|---|---|
| **05_HoloBook** | 131 fich. | **13** | **0,095** | **98,5 %** | `#213050` `#3490C0` `#243861` |
| 02_WizardBook | 80 | 59 | 0,198 | 33,3 % | `#6C534B` `#5A6278` `#252C40` |
| 04_TabletBook | 103 | 69 | 0,309 | 95,8 % | `#A4A9B9` `#1F2638` `#484E63` |
| 01_TravelBook | 68 | 32 | 0,380 | 0 % | `#FFD7A8` `#45292A` |
| 03_NoteBook | 72 | 28 | 0,512 | 0 % | `#FEF4E4` `#1E1410` |

*(Repère : le fond d'application du jeu, `#0E1320`, vaut 0,010.)*

### Le gagnant est net : **05_HoloBook**

C'est le style le plus sombre (0,095), le plus froid (98,5 %), le plus fourni
(265 statiques + 212 animés = **483 PNG**) et **le plus simple à repeindre : 13 couleurs**.

Et sa dominante `#213050` tombe **pile entre deux tokens du jeu** :
`--surface-panel #161C2B` et `--surface-raised #28324A`. Ce n'est pas une coïncidence
utile, c'est le même bleu nuit.

Surtout, c'est **le seul des cinq à porter une vraie hiérarchie d'états**, exactement
celle qui manque au jeu :

- `Slot Available` / `Slot Selected` / **`Slot Unavailable`** (hachuré + croix)
  → les trois états de `.purchase-row` : achetable / bientôt / verrouillé
- `Slot Quality` — une grille de cadres colorés → paliers de rareté
- `Selection Frame Selected` / `Unselected` → les onglets
- `Button Text Frame` / `Button Icon Frame` / `Button Value Frame` → 3 des 7 rôles
- `Toggle Fill` / `Toggle Flip` / `Toggle Icon Frame` → les bascules du § 4.3
- `Heading`, `TextField`, `Digit Frame`, `Bar Frame/Fill/Handle`, `DropDown`

⚠ **Son accent est cyan** (`#3490C0`) — la couleur que tu as explicitement rejetée
(cf. anti-« trop IA », « pas de cyan » sur les tours cosmiques). **Mais 13 couleurs se
remappent en une commande** : `scripts/remapPalette.mjs` existe déjà pour ça. Cyan →
or patiné `#C9A968` et le style tombe sur tes tokens.
Bonus : ses deux autres accents sont `#7E30DB` (à deux doigts de `--state-usure #9B5DE5`)
et `#1AAB3D` (proche de `--res-food #36B37E`). Les paliers de qualité parlent déjà ta langue.

**Second choix : 04_TabletBook** (pierre grise, 96 % froid, hiérarchie riche avec 7 paliers
de qualité et des slots verrouillés). Thématiquement « tablette » colle mieux à l'Antiquité
que « holo ». Mais à 0,309 de luminance c'est une pierre **de plein jour** : posée sur ton
fond de nuit, elle éblouit. Il faudrait l'assombrir, donc la repeindre aussi — et elle a
69 couleurs contre 13.

**À écarter** : 01_TravelBook et 03_NoteBook (parchemin, zéro pixel froid, les deux plus
clairs). 02_WizardBook est un entre-deux brun/ardoise sans direction franche.

---

## 8 quater. Faut-il prendre « Complete UI Essential Pack » en plus ?

Page lue dans un vrai navigateur (itch.io renvoie 403 aux requêtes automatisées).
⚠ **Je n'ai pas pu voir les aperçus en pixels** — le volet navigateur n'était pas
affiché, donc pas de capture. Ce qui suit s'appuie sur la fiche produit, les textes
alternatifs des images et la licence, **pas sur un examen visuel**.

| | Book Styles (acheté) | Essential Pack |
|---|---|---|
| Prix | payé | **3,51 $** (v2.4) — ou **10 $** le lot de 5 packs |
| Assets | 1667 PNG, 5 styles | 800+, **13 thèmes** |
| Thèmes | TravelBook, WizardBook, NoteBook, TabletBook, HoloBook | Flat, Gradient, Paper, Wood, **Stone**, **Metal**, Hologram, Glass, Pumpkin, **Mystic Wood**, Papernote, **Metalworks**, **Runewood** |
| Métaphore | **le livre** : couvertures, pages, signets, lignes de page | **chrome nu** : cadres, boutons, slots, barres |
| 9-slice | tranches ~2 px, tailles variées (62×14…) | **32×32**, taillé pour ça |
| Licence | commerciale OK, **revente de l'adapté interdite**, crédit obligatoire | **CC BY 4.0** — crédit seul, la plus permissive |
| Police | `Anxel.ttf` | Toriko |

### Verdict : **pas maintenant.**

Le blocage du chantier n'est pas un manque de matière. **Tu viens d'acquérir 1667 PNG dont
tu n'as pas encore posé un seul.** Le blocage est une décision de direction. Acheter un
second pack avant de l'avoir prise ne fait qu'élargir un choix déjà trop large.

Et trois de ses thèmes phares — **Flat, Gradient, Glass** — sont *littéralement* les looks
génériques dont on cherche à sortir. Le pack est conçu comme une boîte à outils
polyvalente, pas comme une identité.

### Mais deux arguments sérieux pour, plus tard

1. **La licence CC BY 4.0 est franchement meilleure.** Celle du pack Book interdit de
   « publier le matériel adapté » — ça vise la revente en pack, pas le jeu (l'usage
   commercial est explicitement autorisé), mais c'est une ambiguïté que CC BY n'a pas.
2. **Le 9-slice natif en 32×32.** C'est la géométrie idéale pour `border-image` et c'est
   plus propre que les tailles hétéroclites du pack Book.

**Donc** : si la direction retenue est une **matière** (Stone, Metalworks, Runewood) plutôt
que la métaphore du livre, 3,51 $ est une évidence. Décide d'abord, achète ensuite.
Et regarde le lot à 10 $ pour 5 packs avant de payer 3,51 $ pour un seul.

---

## 8 quinquies. Deux peaux : WizardBook, puis HoloBook au futur

Idée de Raph (2026-07-31) : partir sur **WizardBook**, et **basculer sur HoloBook** en
arrivant aux ères futuristes. **C'est faisable, et la moitié du travail est déjà faite —
elle dort dans le dépôt.**

### Ce qui existe déjà et ne demande qu'à être rebranché

| Pièce | État | Où |
|---|---|---|
| `eraBandOf(eraIndex)` → bande 0–9 | ✅ vivant, testé | `src/game/data/eraThemes.js:26` |
| Les 10 époques (Feu → Démiurge) | ✅ vivant | `eraThemes.js`, `EPOCHS` |
| Détection de bascule d'époque | ✅ vivant | `App.jsx:127` (`isEpochShift`) |
| Bandeau de cérémonie plein écran | ✅ vivant, **4,8 s** sur bascule d'époque | `App.jsx:132`, `.era-banner--epoch` |
| Fondu du chrome 0,9 s | ✅ écrit | `eras.css:14` |
| **Les 10 peaux structurelles** | ⛔ **CODE MORT** | `eras.css`, 176 lignes |
| L'attribut `data-era-band` | ⛔ **écrit nulle part** | — |

**Le fait décisif** : `.app[data-era-band="N"]` ne matche **rien** depuis le commit
`f9b807c` (2026-06-17). Les 176 lignes d'`eras.css` sont mortes — rayons, polices, teintes
de panneau, scanlines de l'Âge du Néon, tout est inerte. Le commentaire d'`App.jsx:118`
promet encore une « bascule de peau UI » qui n'a plus lieu.

Et `.app` porte **déjà** `data-active-view` (`App.jsx:309`). Rebrancher, c'est **un
attribut de plus sur un élément qui en porte déjà un**.

### ⚠ Mais ça a été coupé exprès — et il faut savoir ce qui a été coupé

Le message de `f9b807c` est explicite :

> *« style UI universel : **fin du skin de couleur par âge** (accent or canonique partout)
> — **la carte et le bandeau d'ère continuent d'évoluer** »*

Ce qui a été rejeté, c'est **la dérive d'ACCENT sur les 35 ères** : une teinte qui bougeait
en continu et rendait l'UI bariolée. Le principe gardé : **le voyage se raconte par la
carte, pas par le chrome.**

**La proposition de Raph n'est pas ça.** Une **bascule unique et cérémonielle**, à un seul
point de la partie, n'est pas une dérive continue. C'est même l'inverse : deux états
stables au lieu de trente-cinq nuances. *(L'audit conseillait « rester universel » au § 9.3 ;
ce conseil visait la dérive continue, pas une bascule unique. Les deux tiennent ensemble.)*

**La règle à ne pas enfreindre** : garder `--brand-gold` **canonique dans les deux peaux**.
On bascule la **matière** (cuir → holo), jamais l'**accent**. Sinon on ressuscite très
exactement le problème que `f9b807c` a réglé.

### Où passe la coupure : **bande 6, l'Âge du Néon**

Le jeu marque déjà ce seuil tout seul, dans `eras.css` :

- `--r-panel: 0` / `--r-card: 0` (les angles deviennent nets)
- chiffres de ressources en **Silkscreen** (« affichage digital »)
- **scanlines** discrètes sur tout l'écran
- panneaux presque noirs (`rgba(10,13,17,.9)`)

| Bandes | Époques | Peau |
|---|---|---|
| 0–5 | Feu, Bois, Pierre taillée, Couronne, Marbre, Fonte | **WizardBook** |
| 6–9 | **Néon**, Noosphère, Stellaire, Démiurge | **HoloBook** |

Six époques de cuir, quatre de holo. La bascule tombe vers l'**ère 30**, derrière un
bandeau plein écran de 4,8 s qui la masque — la chorégraphie était **conçue pour ça**
(commentaire d'`eras.css:12` : *« le bandeau plein écran masque les bascules d'époque »*).

### Ce que ça coûte vraiment

Le mécanisme est gratuit. Le coût, c'est **d'habiller deux fois** les ~10 objets héros
au lieu d'une. Concrètement :

1. Rebrancher `data-era-band` sur `.app` — un attribut.
2. Purger d'`eras.css` ce qui contredit le nouveau système (les `--r-panel: 10px` de la
   bande 2 vont à l'encontre du § 4.1 « zéro rayon »).
3. Deux jeux de ~10 PNG 9-slice au lieu d'un. Poids négligeable.
4. Deux jeux de tokens de **surface** (`--surface-panel`, `--border`…), **jamais d'accent**.

### Les pièges à ne pas découvrir en route

- **Au chargement d'une sauvegarde**, un joueur à l'ère 32 doit démarrer **directement**
  en Holo. L'attribut doit être posé au **premier rendu**, pas dans un `useEffect` après
  montage — sinon on voit un flash de cuir avant la bascule.
- **Une seule bascule.** Si on donne aussi une matière propre aux bandes 7, 8 et 9, on
  refait la dérive. Holo couvre 6→9 d'un bloc ; les variations restent celles, discrètes,
  déjà écrites dans `eras.css`.
- **`.purchase-row`** est l'objet le plus visible ET le plus piégeux : ses deux
  pseudo-éléments appartiennent au splash-art (§ 7.2).
- **Le .exe** doit embarquer les deux jeux de sprites (précédent : 21 `ERR_FILE_NOT_FOUND`
  en iso dans le build Windows).
- **En vitest**, l'ère vient de l'état **global** : sans `setState`, tout test tombe en
  bande 0 et validerait la peau Wizard en croyant tester Holo.

### Verdict

**Oui, et c'est la meilleure idée du chantier jusqu'ici.** Elle donne une raison
narrative à la refonte au lieu d'un simple ravalement, elle réutilise un mécanisme déjà
payé, et elle fait d'un défaut (deux styles qui plaisaient tous les deux) une
fonctionnalité. À placer en **lot 7 bis**, après le socle et les rôles : basculer entre
deux peaux n'a de sens qu'une fois qu'il y a *une* peau.

---

## 9. Décisions arrêtées (2026-07-31)

Plus rien de bloquant. Récapitulatif de ce qui fait foi.

| Sujet | Décision |
|---|---|
| **Matériau** | Hybride. Voir la ligne « chrome » ci-dessous. |
| **Signature** | **WizardBook** (bandes 0–5) → **HoloBook** (bandes 6–9), coupure à l'Âge du Néon. |
| **Ampleur** | Socle + hiérarchie complète. Les mini-jeux gardent leur peau (sauf Fermer/Rejouer). |
| **Chrome des boutons** | **Les 181 boutons en CSS pur** (encoche `clip-path` + biseau + enfoncement), palette prise du pack. **Les ~10 conteneurs en `border-image`** issus des sprites du pack (panneaux, slots, jauges, onglets). |
| **L'encoche a un sens** | ✅ Oui. Cranté = ça se clique, coin droit = ça s'affiche (§ 4.1). Elle vit en CSS, donc elle **survit aux deux peaux**. |
| **WizardBook** | **Garde son cuir brun chaud**, seulement assombri (luminance 0,198 → ~0,12). Le passé est chaud, le futur est froid : la bascule devient narrative. |
| **HoloBook** | Remappé : cyan `#3490C0` → or de marque. 13 couleurs, une passe de `remapPalette.mjs`. |
| **Accent** | `--brand-gold` **canonique dans les deux peaux**. On bascule la matière, jamais l'accent. |
| **Essential Pack** | Repoussé. Le blocage était une décision, pas un manque de matière. |
| **Ordre** | **Tranche verticale d'abord : la Boutique**, de bout en bout. Prod de masse ensuite. |

### Pourquoi « boutons en CSS » et pas les sprites de bouton du pack

Trois raisons, dans l'ordre de poids :

1. `clip-path` et `border-image` **se détruisent mutuellement** — le clip rogne les coins
   dessinés du PNG. Il fallait choisir, et l'encoche est ce qui porte l'identité.
2. Elle doit **survivre à la bascule d'époque**. En CSS elle est la même des deux côtés ;
   en sprite il aurait fallu la redessiner deux fois.
3. **WizardBook n'a pas les trois états de slot** que HoloBook possède. Fonder les rôles
   sur les sprites aurait donné une peau riche au futur et pauvre au passé.

### L'ordre de marche

Lot **0 bis** (tranche verticale, la Boutique) → puis les lots 1 à 6 en prod de masse →
**7** (sprites conteneurs) → **7 bis** (bascule des deux peaux) → **8** (mobile).

La Boutique est choisie parce qu'elle contient **tous les rôles à la fois** : rangée
d'achat, bouton d'action, barre x1/x10/x100, sous-onglets, pastilles, jauge, bascule.

---

## 10. Lot 0 bis livré — la tranche verticale (2026-07-31)

`src/styles/chrome-wizard.css`, importée après `ui-light.css`. **Scopée à
`.shop-panel`** : la retirer d'`index.css` annule le lot sans reste.

### Ce qui a changé de doctrine en route

L'audit posait au § 4.2 une **bordure** sur chaque rôle. En lisant
`ui-light.css` — « LE skin du jeu », dé-boxing du 2026-07-10 — j'ai trouvé la
règle inverse et **antérieure** : *« plus jamais par un contour de plus »*.
La poser aurait rouvert ce qui avait été fermé après une recherche « box-in-box ».

**Réconciliation retenue** : l'encoche **remplace** le contour au lieu de s'y
ajouter. Bouton = silhouette crantée + fond rempli, **zéro bordure**. La forme
porte l'affordance, le fond porte la hiérarchie. C'est exactement ce que dit
déjà `ui-light.css:207` (« l'accent = le remplissage, pas un trait »), avec une
couche de plus. Le résultat est **plus** dé-boxé qu'avant : l'onglet actif perd
même son soulignement de 2 px.

### Vérifié dans la page (pas supposé)

| Contrôle | Résultat |
|---|---|
| Cran posé | `--n` = 4 px (Acheter) / 3 px (onglets) / 2 px (multiplicateurs, chevron) |
| Conteneurs à angle vif | `.shop-panel` et `.purchase-row` → `border-radius: 0` |
| Aucun fond ne fuit sous la plaque | les 5 rôles : `background: transparent`, `border: 0`, `box-shadow: none` sur l'ÉLÉMENT |
| Pastille non rognée | `.subtab-badge` déborde de 2 px vers le haut et reste visible |
| Gardes | `npm run lint` propre ; **1459 tests passent**, 1 ignoré |

⚠ **4 règles antérieures gagnaient** contre un simple `.shop-panel .x` (0,2,0) et
peignaient un fond **rectangulaire** derrière la silhouette crantée — les coins
carrés auraient dépassé du cran. Relevées dans la page, pas devinées, et
neutralisées une par une (bloc « NEUTRALISATION » de la feuille) :
`.city-shop-dock .purchase-row.is-affordable .btn-purchase:not(:disabled)` (0,6,0),
`.shop-subtab[data-cat="city"].active`, `.app .shop-subtab.active`,
`.app .buy-mode.active`.

### Défaut de mise en page trouvé au passage

Le chevron de repli mesurait **140 × 40 px** contre **39 px** par sous-onglet :
il mangeait **43 %** d'un en-tête large de 323 px. **Aucune règle ne le
dimensionnait nulle part** — il étirait l'espace libre du flex. Sans fond, ça ne
se voyait pas ; la plaque l'a révélé. C'était la cause des libellés tronqués en
« M… » / « S.. » / « Inf… ».
Corrigé (`flex: 0 0 auto`, 2,5 rem carré) : chevron **140 → 40 px**, onglets
**39 px → 75 / 43 / 93 px**.

### Ce qui reste ouvert sur cette tranche

- `.pr-count` (la pastille « ×0 ») est encore **entièrement ronde**. Sous la
  règle du § 4.1 c'est un objet qui s'affiche → angle vif. Hors périmètre de la
  plaque, à traiter au lot 4 avec les 22 autres emplois de `999px`.
- Les libellés de catégorie restent tronqués de ~10 px sur « Infrastructure » :
  c'est un problème de largeur de dock et de longueur du mot français, pas de
  chrome. À part.
- **La capture par `foreignObject` perd les polices** (repli serif) : les formes
  et les remplissages sont fidèles, la typographie non. Le rendu réel n'a pas pu
  être photographié — le volet navigateur n'était pas affiché.

---

## 11. Installation générale (2026-07-31)

La tranche verticale validée, la peau est posée sur **tout le jeu** :
base `button`, les 7 rôles, les conteneurs.

### Les deux bugs signalés par Raph, et leur cause

**1. « Les multiplicateurs ×1 ×10 ×25 ×100 passent derrière. »**
La plaque était en `z-index: 0`. Un `::before` positionné à z-index 0 se peint
**au-dessus du TEXTE NU** du parent : les nœuds de texte se rendent dans la phase
inline, sous tout descendant positionné de z-index ≥ 0. La règle `> *` qui
remontait le contenu ne pouvait rien pour eux — mesuré : les cinq `.buy-mode`
ont `children.length === 0`, leur libellé est un nœud de texte, pas un `<span>`.
→ plaque en **`z-index: -1`**, sous le contenu, texte nu compris. `isolation:
isolate` sur le bouton l'empêche de tomber derrière le panneau.
C'était un bug de conception, pas un détail : il touchait tout bouton sans
`<span>` interne, donc une grande partie du jeu une fois généralisé.

**2. « Les boutons sont décalés. »**
`views-world-fullframe.css:156` pose `flex: 1; min-width: 0` sur ces boutons et
`.buy-toolbar` est à `width: 50%` : les **cinq se partageaient 161 px, soit 26 px
chacun** — mesuré. « x100 » et « Palier » ne tiennent pas dans 26 px, leur
libellé sortait de sa boîte. **Le débordement préexistait** ; sans fond il était
invisible, avec une plaque le texte paraît décalé par rapport au cuir qui le
porte.
→ dimensionnement sur le **contenu** : 25/33/35/41/47 px, **194 px au total**
dans les 323 px du dock, plus aucun débordement.

### Vérifié écran par écran, dans la page

| Écran | Boutons visibles | Conformes |
|---|---|---|
| Cité | 28 | **28** |
| Options | 47 | **47** |
| Chronique | 13 | **13** |
| Effondrement | 12 | **12** |
| Régulation | 8 | **8** |
| **Total** | **108** | **108 — zéro défaut** |

Critères testés sur chaque bouton : `border-radius` à 0, plaque présente et
clippée, **aucun fond peint sur l'élément** (il ressortirait en rectangle
derrière la silhouette crantée). Répartition des crans mesurée : 3 px ×17,
2 px ×44, 4 px ×2 — c'est la hiérarchie, vérifiée et non supposée.

`npm run lint` propre. **1460 tests passent**, 1 ignoré.

### Six conflits de spécificité, tous relevés dans la page

Aucun `!important`. Chaque règle antérieure qui peignait un fond sur l'élément a
été nommée et couverte :

| Règle | Spéc. | Objet |
|---|---|---|
| `.city-shop-dock .purchase-row.is-affordable .btn-purchase:not(:disabled)` | (0,6,0) | bouton Acheter |
| `.app[data-active-view="city"] .city-controls-panel .policy-btn.regul-locked` | (0,5,0) | carte de politique verrouillée |
| `.app[data-active-view="city"] .city-controls-panel .policy-btn` | (0,4,0) | carte de politique |
| `.shop-subtab[data-cat="city"].active` | (0,3,0) | sous-onglet Moteurs |
| `.toggle-btn.on` | (0,2,0) | bascule allumée |
| `.compte-tab.is-active` | (0,2,0) | onglet de compte |

⚠ **Deux conventions d'état coexistent** dans le dépôt : `.active` et
`.is-active`. `.compte-tab` porte les deux selon l'endroit, et c'est
`is-active` que le JSX pose sur la Chronique. Les deux sont nommées.

### Deux choix qui corrigent le système, pas seulement le style

- **`.btn-critical` perd son remplissage plein.** Il était le seul bouton plein
  du jeu et le seul avec une ombre portée colorée : donc le plus attirant de
  l'écran — et il déclenche un effondrement. Il garde son cran profond (c'est
  majeur) mais le rouge ne dit plus que la conséquence.
- **La bascule allumée garde son VERT**, elle ne passe pas à l'or. Dans ce
  système l'or dit « payable / choisi », le vert dit « en marche ». Les
  confondre ferait mentir la couleur, seul levier réservé au SENS.

### Rôles posés dans le JSX

`.btn-close` — **le rôle manquant** — est posé sur les **10 boutons
Fermer / Quitter** de `DebugDialog`, `ImportDialog`, `OptionsDialog`,
`AuguryStage` (×2), `BlackjackStage`, `IcarusStage` (×2), `ScratchStage`,
`MythsView`, plus `ContemplationBar`.
Les 16 utilitaires groupés (`.debug-grid`, `.options-save-actions`,
`.save-slot-actions`, `.quick-actions`, `.contemplation-bar`) prennent leur rôle
**par leur conteneur** : ils sont utilitaires par leur emplacement, pas un par un.

### Restes connus

- `.tab` (navigation latérale) est **exclue de la plaque** : elle a son propre
  cran depuis `layout.css:100` et son `::before` porte le marqueur or de
  l'onglet actif. Seul conflit de pseudo-élément du dépôt.
- `.pr-count` (« ×0 ») reste ronde — lot 4, avec les 22 autres `999px`.
- Les libellés de catégorie de la Boutique restent tronqués d'environ 10 px sur
  « Infrastructure » : largeur de dock et longueur du mot français, pas du chrome.

---

## 12. Purge des rayons à la source (2026-07-31)

Raph a signalé que le look générique subsistait dans « plein de zones » :
Sceaux du Grand Reset, boutique de Faveur, comptes de la Cité, Intendance.

### Pourquoi la vérification précédente avait menti

Deux angles morts, tous les deux de ma méthode, pas du code :

1. **Je n'ai compté que les `<button>` MONTÉS ET VISIBLES** dans 5 vues. Le
   Testament, la boutique de Faveur et l'Intendance n'étaient pas rendus. « 108/108 »
   était vrai, et ne prouvait rien sur le reste.
2. **Le garde-fou global était `.app button`**, spécificité **(0,1,1)**. Le dépôt
   contenait **256 déclarations de `border-radius` non nul**, dont **~94 gagnaient
   contre lui**, réparties sur 14 feuilles. Empiler de la spécificité contre ça
   est une course perdue.

### Ce qui a été fait

**223 déclarations mises à 0 dans 18 feuilles** (script de balayage, hors
commentaires, `!important` préservé), plus les **4 tokens** `--r-panel`,
`--r-card`, `--r-tiny`, `--r-pill` — noms conservés pour ne pas renommer une
centaine de règles, valeurs à 0.

| Feuille | Déclarations |
|---|---|
| views-regulation.css | 39 |
| views-city.css | 36 |
| base.css | 20 |
| components.css / purchase.css / views-shop-myths.css | 17 chacune |
| views-crises.css | 15 |
| ruinsTree.css / views-chronicle-timeline.css | 11 chacune |
| 10 autres feuilles | 40 |

Ajouté aussi : les **champs** (`select`, `textarea`, `input`) prennent le cran
et le cuir. ⚠ Sur un contrôle de formulaire natif le `::before` n'est pas rendu
de façon fiable : on pose donc le `clip-path` **sur l'élément**, sans risque —
un `<select>` n'a pas d'enfant débordant à protéger, contrairement aux boutons.
Et le dernier `borderRadius` en style inline du JSX (`ImportDialog`) est retiré.

### Vérification, cette fois exhaustive

**Statique** — balayage de tout le CSS hors commentaires :
**aucun rayon non nul ne subsiste dans les 25 feuilles**. Ce contrôle ne dépend
pas de ce qui est monté à l'écran ; c'est ce qui manquait la première fois.

**Dynamique** — tous les éléments du DOM, pas seulement les `<button>` :

| Écran | Éléments | Coins arrondis | Boutons | Conformes |
|---|---|---|---|---|
| Cité | 366 | **0** | 28 | 28 |
| Régulation | 314 | **0** | 8 | 8 |
| Effondrement | 371 | **0** | 12 | 12 |
| Chronique | 352 | **0** | 13 | 13 |
| Options | 442 | **0** | 48 | 48 |
| **Total** | **1845** | **0** | **109** | **109** |

`npm run lint` propre. **1460 tests passent**, 1 ignoré.

### ⚠ Ce que « tout, sans exception » a coûté, comme annoncé

Raph a choisi la purge totale en connaissant l'avertissement. Effet visible sur
`docs/concepts/ui-boutons/` → capture des Sceaux : **les médaillons ronds sont
devenus carrés**. Idem pour les pips, les avatars et les alvéoles de l'arbre des
Ruines (`ruinsTree.css`, 11 déclarations dont des `50%` sur `.rt-frame` et
`.rt-hub`).

**Non vérifié à l'œil** : l'arbre des Ruines n'est pas débloqué dans la partie
de test, ses médaillons n'ont jamais été rendus. Le changement est certain
(les règles sont à 0), son rendu ne l'est pas.

**Retour arrière** : `git checkout -- src/styles/ruinsTree.css` rend leurs
alvéoles rondes à l'arbre sans rien défaire d'autre.

---

## 13. Passage aux vrais sprites du pack (2026-07-31)

Retour de Raph : *« toujours très parfait IA »*, *« le doré manque de profondeur
par rapport au pack »*, *« il n'y a pas de barre de jauge, de police ou autre
qu'on puisse mettre ? »*.

### La cause, mesurée — et ce n'est pas ce qu'on croirait

| Objet du pack | Tons |
|---|---|
| `Button01a` | **2** (`#6C534B` champ + `#32211B` contour) |
| `Frame01a` | **2** |
| `Fill01a` | 3 |
| `Slot01a` (24×24) | 6 |

**Le pack met MOINS de tons que le CSS, pas plus.** Sa profondeur vient de trois
choses que le CSS n'avait pas :
1. un **contour opaque d'1 px très sombre** qui cerne la matière ;
2. des biseaux en **tons pleins**, pas des voiles `rgba` à 6 % ;
3. un **socle de 6 px** sous le bouton, sur lequel il repose.

Le dé-boxing avait retiré tout contour ; c'est ce qui donnait l'effet
« posé sur rien ».

### ✅ L'encoche survit, contrairement à ce que j'avais annoncé

J'avais prévenu qu'on perdrait le cran en passant aux sprites. **Faux, vérifié
sur les 10 boutons du pack : tous ont déjà les coins coupés.** La grammaire
« cranté = ça se clique » tient, et elle est maintenant dessinée au lieu d'être
clippée.

### Ce qui a été livré

`scripts/exportWizardChrome.mjs` → `public/pixelart/ui/chrome/wizard/`
(11 PNG, lecteur/écrivain PNG maison, aucune dépendance ajoutée).

| Fichier | Source | Tranches |
|---|---|---|
| `button.png` | Button08a 26×18 | T3 R3 B6 L3 (**B6 = le socle**) |
| `button-sm.png` | Button01a 11×8 | T2 R1 B2 L2 |
| `segment.png` | Frame04a 60×12 | T2 |
| `card.png` / `card-on.png` | Slot01a/b 24×24 | T6 R3 B6 L3 |
| `gauge.png` | Bar01a 46×8 | T3 R4 |
| `gauge-fill.png` | Fill01a 9×4 | T1 |
| `*-gold.png` | remap | — |

Tranches **mesurées** par signature de ligne/colonne, pas estimées. Tous les
milieux sont uniformes → `stretch` ne peut pas produire de couture, ce qui avait
coûté deux reprises sur `gauge-frame.png`.

### Le remap or : deux échecs avant le bon

Le pack est brun ; l'état « payable » doit être or. Deux méthodes ont raté :

1. **Par rang** étalé sur toute la rampe → un sprite n'a que 2 à 6 tons, le
   champ (mi-clair) était poussé à l'avant-dernier cran : **bouton blanc cassé**.
2. **Par luminance normalisée** entre le ton le plus sombre et le plus clair
   présents → sur `button.png` le ton le plus clair **EST** le champ (ce sprite
   n'a pas de rehaut plus clair) : il repartait à 1,0, **encore blanc**.
3. ✅ **Ancrage sur le ton DOMINANT** (le plus répandu en pixels = le champ par
   construction), collé sur l'or de marque, chaque voisin décalé d'un cran.
   Résultat vérifié : `button-gold` = `#C9A968` champ, `#6B5423` socle,
   `#3A2C10` contour — même structure de contraste que le cuir.

### ⚠⚠ Le raccourci `border:` remet `border-image` à `none`

Le piège qui a coûté le plus de temps. Deux règles antérieures posent
`border: 1px solid …` sur le bouton d'achat du dock, dont une à **(0,6,0)** :
elles ne se contentaient pas de gagner sur la largeur, elles **effaçaient la
matière**. Un `border-image` ne survit jamais à un `border` déclaré plus fort,
même quand l'auteur ne pensait qu'à la couleur. Repose en **longhand** à
spécificité égale ou supérieure.

### ⛔ La police Anxel est INUTILISABLE — vérifié dans le TTF

Décision prise « Anxel sur les libellés d'UI ». **Annulée après mesure**, comme
promis avant de poser quoi que ce soit.

Lecture directe de la table `cmap` : **97 codepoints, tout l'ASCII et rien
d'autre**. Les 41 caractères français testés sont **tous absents** :
`à â ä ç é è ê ë î ï ô ö ù û ü ÿ œ æ` + capitales + `« » … — ’`.
« Réclamer », « Débloquer », « Régulation », « Cité » rendraient des carrés vides
ou basculeraient sur une autre police au milieu du mot. Modifier le TTF
demanderait un outil non installable (règle « ne rien télécharger »).
→ **la typographie du jeu ne bouge pas.**

### ⚠ Licence — obligation remplie

`OptionsDialog` → onglet Crédits porte désormais la mention Crusenho avec le
lien et la mention que le matériel a été modifié (recoloration). **La licence
l'exige** ; ne pas retirer sans retirer `public/pixelart/ui/chrome/wizard/`.

### Vérification

Tous les rôles portent leur sprite (`button-gold` sur Acheter payable,
`segment-gold` sur onglets et multiplicateurs actifs, `gauge` sur les pistes).
`npm run lint` propre, **1460 tests passent**.

⚠ **La capture par `foreignObject` ne rend pas `border-image` telle quelle** :
un SVG rasterisé ne charge aucune ressource externe. Il faut **inliner les PNG
en data-URI** avant de rasteriser — c'est ce que `docs/ui-references.md`
documentait déjà et que j'avais oublié d'appliquer au premier essai.

---

## 14. Socle généralisé + retour du jonc PixelLab (2026-07-31)

### Le socle passe à tous les boutons cliquables

Le socle de 6 px n'était que sur le rôle ACTION ; il devient **la base**. C'est
lui qui donne le volume — sans lui la plaque flotte, et c'était ça, l'effet
« parfait IA ».

⚠ `box-sizing: border-box` est global : les 9 px verticaux **mangent** la
hauteur utile. Hauteurs relevées dans la page avant de généraliser :

| Bouton | Hauteur | Utile avec socle |
|---|---|---|
| `.policy-btn` | 112 px | (carte, sprite dédié) |
| `.testament-seal` | 42 px | 33 px |
| `.compte-tab` | 40 px | (segment, plat) |
| `.btn-purchase` | 36 px | 27 px |
| `.shop-subtab` | 30 px | (segment, plat) |
| `.btn-tiny` | 26 px | **17 px** — assez pour un corps de 12,5 px |
| `.buy-mode` | **18 px** | 9 px → ⛔ **exception**, petite plaque |

Vérifié après coup : **aucun bouton du jeu ne descend sous 14 px de hauteur
utile**. Les fantômes et les segments inactifs reçoivent `border-width: 2px` —
sans quoi ils gardaient les 9 px du socle, invisibles mais bien présents, et
leur libellé se décalait de 3 px (boîte asymétrique : 6 en bas, 3 en haut).

### ⛔ La jauge de Rupture reprend son jonc PixelLab — et c'est mesuré

Raph : « la jauge Rupture refait très cheap ». Cause trouvée, pas devinée :

- `gauge.png` (du pack) fait **8 px de haut**.
- `.pr-step-track` fait 8 px → **1:1**, impeccable.
- `.sg-track` fait **33 px** → le sprite y était **étiré 4,1×**, ses capuchons
  de 3 px devenaient des **bavures de 12 px**.

`gauge-frame.png` (PixelLab, 20×33) est dessiné POUR 33 px, et
`docs/ui-references.md` note que sa hauteur est *« non négociable : les
capuchons sont des courbes sur toute la hauteur du sprite »*.

**Règle qui en découle, et qui vaut pour la suite : une piste ≤ 12 px prend le
pack, une jauge héros garde son jonc dédié.** Les deux jauges héros sont donc
exclues de la règle générale et retrouvent leur montage en trois couches
(braise en `::before`, jonc en `::after` z-index 3 — un enfant se peint toujours
au-dessus de la bordure de son parent, un `border-image` sur l'élément laissait
un filet noir devant le capuchon) :
`.sg-track` (views-city.css:758) et
`.crisis-hero .barometer-track.rupture-bar` (views-crises.css:134).

Vérifié dans la page : `.sg-track` → `surElement: AUCUN`,
`enSurcouche: gauge-frame`. Le jonc est bien revenu.

`npm run lint` propre, **1460 tests passent**.

---

## 15. Mini-jeux, Doctrine de crise, Chronique (2026-07-31)

Raph signale que ces trois zones n'ont pas la matière. Diagnostic **statique**,
parce que la vérification dynamique ne pouvait pas les voir : dans la partie de
test, les cinq mini-jeux sont **verrouillés** (Ère II/III) et la Doctrine de
crise n'est pas débloquée — la vue Effondrement n'y monte que 4 boutons.

### La cause : 32 règles effaçaient la matière

Recensement de tout le CSS : **32 règles posent un `border:` raccourci** sur un
sélecteur qui atteint un bouton. Le raccourci **remet `border-image` à `none`**.
Parmi elles, exactement les zones signalées :

| Règle | Spéc. | Zone |
|---|---|---|
| `.doctrine-seg-btn` | (0,1,0) | **Demander / Stabiliser / Temporiser** |
| `.testament-seal` | (0,1,0) | les rangées de sceaux |
| `.stake-pick` | (0,1,0) | **choix de mise, les 4 mini-jeux** |
| `.coffre-mult`, `.pupitre-flame`, `.stage-help` | (0,1,0) | temple |
| `.csp-vow-*`, `.edict-tier`, `.gr-rung-btn` | (0,1,0) | vœux, édits, paliers |
| `.shop-item button`, `.upgrade button`, `.outcome-card button` | (0,1,1) | boutique, mythes |
| `.augures-row.augure-fresque` | (0,2,0) | fresques des Augures |

### Le correctif tient en un sélecteur

Ma base était déclarée sur `button` — spécificité **(0,0,1)**. La déclarer sur
**`.app button` (0,1,1)** couvre **29 des 32** d'un coup, sans nommer chaque
classe. Les trois au-dessus sont traitées à part, et deux d'entre elles sont
**voulues** : `.edict-tier .effect-chip` n'est pas un bouton, et
`.augures-row.augure-fresque` doit rester nue (voir plus bas).

⚠ **Effet de bord immédiat, et il se rejouera** : toutes mes exclusions et tous
mes rôles étaient en (0,1,0) — ils **perdaient** dès que la base est passée en
(0,1,1). `.tab` a récupéré une matière dont elle ne veut pas, les fantômes et
les segments aussi. Tout a dû être repréfixé `.app`. **Toute exclusion ajoutée
ici doit l'être également.**

### Rôles attribués

- **Segment** : `.doctrine-seg-btn`, `.coffre-mult`, `.stake-pick`,
  `.csp-vow-option`, `.csp-vow-trigger`, `.edict-tier`
- **Carte** : `.testament-seal`, `.gr-rung-btn` (+ variante or sur
  `.is-favored` / `.is-engraved` / `.is-ready`)
- **Fantôme** : `.stage-help`, `.idle-report-close`, `.rt-zoom-btn`,
  `.hud-dock-btn`, `.first-steps-head`, `.outcome-float`
- **Critique** : `.collapse-hold`
- Les actions des mini-jeux (`.augury-throw`, `.icarus-cashout`,
  `.scratch-reveal-all`, `.scratch-replay`, `.gr-batch-all`,
  `.myth-activate-btn`…) prennent le **socle de base**, c'est le bon rôle.

⛔ **Les fresques des Augures restent NUES.** `.augure-fresque` est un bandeau
400×32 **dessiné** (cf. le lot « fresques augures ») ; une plaque par-dessus
masquerait l'art. Idem pour `.scratch-banner`, `.icarus-banner`, `.shop-hotspot`.
Elles réagissent au survol par la luminosité, pas par une matière.

### ⚠ Une TROISIÈME convention d'état

Après `.active` et `.is-active`, le sélecteur de coffre utilise **`.is-chosen`**.
Les trois sont nommées. Oublier une variante laisse le bouton retenu sans matière.

### Vérification

**Statique** : classes de bouton nommées dans la feuille, 26 → **45 sur 76** ;
les 31 restantes prennent la base, ce qui est le rôle correct. Plus aucune règle
n'efface la matière au-dessus de (0,1,1) hors les deux cas voulus.

**Dynamique** : **109 boutons sur 109** conformes sur les 5 écrans montés
(Cité 28, Options 48, Chronique 13, Effondrement 12, Régulation 8) — chacun
comparé au rôle attendu, matière présente ou absente selon le cas.

`npm run lint` propre, **1460 tests passent**.

⚠ **Non vérifié à l'œil** : les cinq mini-jeux et la Doctrine de crise sont
verrouillés dans la partie de test. Les règles les nomment et les gardes
statiques sont vertes, mais leur rendu n'a pas pu être photographié.

---

## 16. ⛔ Régression de mise en page — et la règle qui en sort (2026-07-31)

Raph : *« l'arbre de ruines n'a pas seulement été changé dans le design, toutes
les icônes ont bougé !! pareil pour la boutique, tout le calibrage est passé à
la trappe »*.

**C'était une régression que j'avais introduite, pas un effet de style.**

### Mesuré, en neutralisant la bordure et en comparant les boîtes

| Bouton | Avec le sprite sur l'élément | Sans bordure | Dérive |
|---|---|---|---|
| `.btn-tiny` | 24×**29** @10,**1194** | 24×26 @10,1200 | +3 px haut, **déplacé de 6 px** |
| `.shop-subtab.active` | **73**×30 @**1026** | 69×30 @1028 | +4 px large, glissé de 2 px |

Le `border-image` était posé sur **l'élément** : sa bordure participe au flux et
grossit la boîte. Sur l'arbre des Ruines, où **37 nœuds sont positionnés en
ABSOLU** sur un dessin, et dans la boutique calibrée au pixel, quelques px par
objet se lisent comme « tout a bougé ».

### 🔑 LA RÈGLE : la matière ne doit rien coûter à la mise en page

La plaque vit désormais sur un **`::before` en position absolue, `inset: 0`**.
Un pseudo-élément absolu **ne participe pas au flux** : la boîte du bouton est
exactement celle d'avant le chantier.

Vérifié après correction, sur les mêmes boutons : **dérive `0,0` en taille comme
en position, partout.**

Corollaire noté dans la feuille : l'enfoncement au clic déplace **la plaque**,
jamais le bouton — déplacer le bouton déplacerait aussi sa cible de clic, ce qui
sur un nœud d'arbre est un bug de jeu, pas un détail visuel.

### Or = actionnable, cuir = état

Raph : *« de gros boutons jaune ocre pas très beaux »*, et surtout *« la chute
annoncée est présélectionnée donc toujours en jaune, ça ne va pas »*.

Il a raison, et ça corrige ma doctrine : **un état permanent peint en or est un
bruit permanent.** Sur la Doctrine de crise un des trois segments est toujours
choisi, sur le Testament une chute est toujours présélectionnée.

- **Or** — ce qui appelle un clic *maintenant* : achat payable, action
  principale. Transitoire.
- **Cuir** — ce qui est simplement retenu ou actif. Persistant.

Les segments retenus, les onglets actifs et les sceaux favoris passent donc au
cuir. Le seul or restant est `button-gold` sur l'achat payable.

### Les CTA des mini-jeux sont des `<span>`

« Jeter / Gratter / Jouer / Voler » (`.icarus-banner-cta`) ne sont **pas des
boutons** : ce sont les libellés d'appel posés sur les bandeaux. Aucune règle
`button` ne pouvait les atteindre. Ils reçoivent la plaque explicitement, et
leur bandeau parent (`.augure-fresque`) reste nu — c'est de l'art dessiné.

### Vérification

**109 boutons sur 109** conformes sur les 5 écrans montés. Dérive de mise en
page nulle. Le marqueur or de l'onglet actif de la sidebar est intact (3×36 px,
dégradé), et son cran maison aussi. `npm run lint` propre, **1460 tests**.

⚠ Toujours **non vérifié à l'œil** : les mini-jeux, la Doctrine de crise et
l'arbre des Ruines sont verrouillés dans la partie de test.

---

## 17. Arbre des Ruines et encoches au repos (2026-07-31)

### 🚫 L'arbre : ma purge avait défait une décision documentée

Raph : « l'arbre de ruines n'est pas corrigé ». La cause n'était pas la position
des nœuds mais leur **forme**, et elle était écrite dans son propre CSS,
`ruinsTree.css:529` :

> *« Les dogmes sont RONDS comme les autres (**retour Raphaël : le carré arrondi
> évoquait l'ancien rendu SVG**). »*

La purge « tout sans exception » avait carré `.rt-frame`. Or `.rt-frame::after`
pose un **anneau pixel-art rond** (`/pixelart/ui/ruins/frame.png`) par-dessus le
disque CSS : disque carré + anneau rond ne coïncident plus, et le décalage se lit
comme « toutes les icônes ont bougé ».

`git checkout -- src/styles/ruinsTree.css` → les **6 `border-radius: 50%`** sont
revenus, rien d'autre n'a bougé (le diff ne contenait que mes 11 rayons).

**Leçon** : un commentaire qui cite un retour utilisateur est une décision, pas
une préférence de rédaction. Grep des commentaires avant toute purge de masse.

### Les encoches au repos

Raph : « tu as enlevé les encoches des boutons non sélectionnés des doctrines de
crise ». Exact, et ça **contredisait la grammaire du chantier** : le cran dit
« ça se clique ». En posant `border-image: none` au repos, « Demander » et
« Temporiser » devenaient du simple texte, indistinguables d'un libellé.

→ Un segment au repos porte désormais la **petite plaque**, volontairement
**assombrie** (`brightness(0.52) saturate(0.65)`). La silhouette et son cran
subsistent, le poids visuel recule. **La hiérarchie passe par la luminosité, pas
par la présence ou l'absence de l'objet.**

⚠ Piège corrigé au passage : le segment RETENU héritait de l'assombrissement,
car sa règle ne déclarait pas `filter`. Il porte maintenant `filter: none`
explicitement.

### ⚠ Piège de mesure : la pane fige les transitions

`getComputedStyle(el, '::before').filter` renvoyait `brightness(1) saturate(1)`
— l'identité d'interpolation — alors que la règle dit `brightness(0.52)`. Cause :
**l'onglet du volet ne composite pas**, donc les transitions restent figées à
leur point de départ. Ce n'était pas un bug de CSS mais un artefact de lecture.
Pour mesurer une propriété en transition dans la pane, **injecter
`transition: none !important` avant de lire**.

### Vérification

Dérive de mise en page toujours **nulle** après l'ajout de la plaque au repos.
Segments au repos : `button-sm` assombri. Segment retenu : `segment` non
assombri. `npm run lint` propre, **1460 tests passent**.

---

## Annexe A — Les 43 boutons sans classe

```
DebugDialog.jsx      (10)  L58-66 debug, L69 Fermer
OptionsDialog.jsx     (7)  L888 Sauvegarder, L891 Exporter, L894 Importer,
                           L909 fichier, L930/933 slots, L1161 Fermer
AuguryStage.jsx       (6)  L343, L350, L353, L388, L395, L398
IcarusStage.jsx       (4)  L369, L372, L399, L402
BlackjackStage.jsx    (3)  L295 Rester, L350 Changer de mise, L351 Quitter
ContemplationBar.jsx  (2)  L25 capture, L28 sortie
ScratchStage.jsx      (2)  L477 nouveau ticket, L480 Quitter
HeritageView.jsx      (2)  L402 Gravé (disabled), L421
ImportDialog.jsx      (1)  L83 Fermer
MythsView.jsx         (1)  L389 fermeture modale
TreeNode.jsx          (1)  nœud d'arbre
```

## Annexe B — Inventaire des rayons actuels

`0` ×32 · `8px` ×26 · `999px` ×23 · `6px` ×20 · `50%` ×20 · `4px` ×18 · `3px` ×18 ·
`10px` ×14 · `2px` ×11 · `12px` ×10 · `9px` ×3 · `1px` ×5 · `14px` ×2 · `99px` ×2 ·
`5px` ×2 · `7px` ×2 · `13px` ×1

**Cible** : `0` partout, `--r-pill` pour le seul compteur de notification.
