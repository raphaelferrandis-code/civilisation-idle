# Références UI — assets Kenney

Habillage de l'interface (ambiance **sombre / or / antique**). Ce document fait
foi sur : les packs retenus, les assets **réellement intégrés** au projet (avec
provenance exacte), et la méthode d'intégration. À tenir à jour à chaque ajout.

- **Licence** : tous ces packs Kenney sont **CC0 / libres pour usage commercial**
  (crédit volontaire). Aucun blocage légal.
- **Source sur disque** :
  `C:\Users\Raphi\OneDrive\Bureau\Kenney Game Assets All-in-1 3.5.0\UI assets\`
- **Destination dans le projet** : `src/assets/ui/` (importé via `@import` dans
  `src/index.css` → Vite rebase les `url(...)` relatifs et bundle l'asset).

---

## 1. Packs retenus (par adéquation au thème)

| Pack | Rôle | Style |
| --- | --- | --- |
| **Fantasy UI Borders** | **Habillage principal** : cadres + dividers (9-slice). | Cadres sombres à coins ornés (clé grecque) → parfait sombre/or/antique. |
| **UI Pack - Adventure** | Barres de progression, bannières, badges hexagonaux, scrollbars. | Médiéval coloré/cartoon → **à désaturer/teinter** pour matcher la palette. |
| **UI Adventure Pack** | Boutons (états *pressed*), barres 3-slice. | Bois brun arrondi, chaleureux. |
| **UI Pack** (~868 PNG) | **Base structurelle** : boutons, sliders, cases, flèches, étoiles. | Vectoriel propre, neutre → prendre le dossier **Grey** + recolorer en or. |

### Écartés
- **UI Pack - Pixel Adventure**, **UI Pixel Pack** — pixel art (utiles seulement
  si la refonte iso reprend ; en pause).
- **UI Pack - Sci-fi** — hors thème.
- **Mobile Controls** — d-pads tactiles, inutile (desktop/Electron).
- **Cursor Pack / Cursor Pixel Pack** — curseurs (à la rigueur un curseur
  `gauntlet`/`pointer` thématique, ce ne sont pas des éléments d'UI).

---

## 2. Journal des assets intégrés

### `topbar-frame.png` — cadre OR UNIVERSEL de tous les panneaux
- **Pilotage** : `src/styles/frames.css` (importé **en dernier** dans `index.css`).
  Ne s'applique plus qu'à `.topbar-resources` (budget de cadres, dé-boxing du
  2026-07-10) et, hors de cette feuille, aux `.purchase-row` du dock de la Cité
  (`views-world-fullframe.css`).
- **Knobs** : `--ui-frame-w-ctrl` (épaisseur rendue, 6px), `--ui-frame-src`,
  `--ui-frame-slice`. Pour **exclure** un panneau : `border-image: none !important;`.
- **Hors cadre** (volontaire, à rediscuter) : `.sidebar` (éviterait de nicher avec
  `.city-status-panel`), voiles doux (`.city-stage-hud`), toasts/bannières, boutons.

#### Provenance de l'asset
- **Source** : `Fantasy UI Borders / PNG / Default / Border / panel-border-030.png`
  (48×48, clé grecque, centre transparent, bords pleins jusqu'au pixel).
- **Traitement** : teinté or `#D2BA80` (RGB remplacé, alpha conservé), aucun
  redimensionnement. → `src/assets/ui/topbar-frame.png`.
- **Intégration** : `src/styles/components.css` → `.topbar-resources`
  - `border: 13px solid transparent;`
  - `border-image: url(../assets/ui/topbar-frame.png) 12 stretch;`
    (slice **12** = largeur du motif d'angle ; bords simplement étirés = filet or).
  - La plaque porte aussi le voile sombre + `backdrop-filter: blur(14px)` (lisibilité
    sur la carte) ; les 5 ressources deviennent des cellules transparentes séparées
    par un filet or (`::before` dégradé). Override overlay : `views.css`
    `.app[data-active-view="city"] .topbar(-resources)`.
  - **Réglages faciles** : épaisseur du cadre = `border-width` (baisser à ~10px pour
    un bandeau plus fin) ; pour changer de motif, rebaker un autre `panel-border-0XX`
    (mêmes 48×48 → slice 12 inchangé) ; pour la teinte, rebaker avec une autre couleur.

---

## 2 bis. Chrome PIXEL étirable — clé grecque (2026-07-23)

Le cadre Kenney ci-dessus est du trait **vectoriel** : il s'interpole quand on
l'étire, et l'élément qui le porte n'a pas `image-rendering: pixelated`. Jusqu'à
cette date le jeu n'avait donc **aucun chrome pixel étirable** : tout
`public/pixelart/ui/**` est à taille fixe.

### Source et découpe
- **Source** : `docs/concepts/ui-panneau/pixellab-cle-grecque-512.png`, planche
  512² générée chez PixelLab (`create_ui_asset`, 512×512, seed 7, pièce
  `rounded_rect` de rayon 0). Ardoise sombre + méandre bronze/or : le même
  ornement que le cadre Kenney, en pixels.
- **Découpe** : `node scripts/sliceUiChrome.mjs` → `public/pixelart/ui/chrome/`.
  Le script **évide le champ** (diffusion depuis le centre : le cadre ne peint
  que son anneau, le fond reste celui du panneau) puis **resserre le milieu à
  une période de motif**.

### `panel-greek.png` — cadre de panneau, 107×109
- Tranches **48 40 42 48** (asymétriques : le dessin l'est, angle gauche 45 px,
  angle droit à partir de 181 px). `border-width` doit valoir ces tranches,
  sinon les ornements d'angle sont écrasés.
- Répétition **`round`**, pas `stretch` : la tuile du milieu vaut **une période
  de méandre (19 px, mesurée par autocorrélation)**, le navigateur en fait tenir
  un nombre entier. Mesuré : 19,00 px en largeur, 19,29 en hauteur sur un
  panneau 620×360, soit 1,5 % d'écart au pire.
- **Consommateurs** : `#history .panel`, `#prestige .panel`, `#mythView .panel`
  (frames.css). Le padding passe à 0, la bande de titre perd son débord.
  Sous 720 px de large on repasse au panneau nu.

### `gauge-frame.png` — jonc de jauge, 20×33
- Tranches **5 10 5 9**, `stretch`. Le milieu ne fait qu'**une seule colonne**,
  prise au **centre** de la barre source (x=147). Première version : deux
  colonnes prises juste après le capuchon, là où le jonc est encore en
  transition — leurs deux teintes différaient, `stretch` les a étalées en deux
  moitiés et **le jonc changeait de ton pile au milieu de la barre**, ce qui se
  lisait comme un cadre autour des paliers. Une colonne unique rend la couture
  impossible par construction.
- **Contour intérieur du capuchon GAUCHE effacé** sur la hauteur du champ. Il
  restait sinon une bande noire d'1 px entre la pierre et la couleur, mesurée à
  l'encre (`#010505` à x=8) : le remplissage passe bien derrière le jonc, mais ce
  contour, lui, se peint par-dessus. Le script efface tout ce qui est sombre ou
  transparent depuis l'intérieur jusqu'au premier pixel de pierre, donc la
  couleur épouse la silhouette du montant, creux compris.
  Le capuchon DROIT garde son contour : de ce côté le remplissage s'arrête au
  bord du chenal (sa largeur est un % du chenal), il ne passe pas derrière, et
  l'effacer ouvrirait le noir du chenal à 100 %.
- **Hauteur 33 px non négociable** : les capuchons sont des courbes sur toute la
  hauteur du sprite, toute autre hauteur les étire. On ne resserre donc qu'en
  largeur — un premier essai qui coupait aussi le milieu vertical réduisait la
  barre à une pastille.
- **Consommateurs** — les deux jauges de Rupture, volontairement le même objet :
  - `.crisis-hero .barometer-track.rupture-bar` (`views-crises.css`), jauge héros
    du mode crise. Même montage en trois couches que `.sg-track` : braise en
    `::before` (débordant de 7 px à gauche), jonc en `::after`. Un `background`
    sur l'élément ne pouvait pas convenir — clippé au padding box il n'atteint
    pas le montant, clippé au border box il ressort autour des capuchons.
  - `.sg-track` (`views-city.css`), jauge du bandeau d'identité de la Cité.
    Passée de 7 px à 33 px : **le débord de `.sg-tick` et `.sg-target-ghost`
    (`top/bottom` négatifs) a été annulé**, il barrait la pierre.
    Ici le jonc n'est **pas** posé sur la piste mais en **surcouche `::after`**
    (`z-index: 3`) : un enfant se peint toujours au-dessus de la bordure de son
    parent, donc en `border-image` le remplissage s'arrêtait DEVANT le capuchon
    et laissait un filet noir. En surcouche il passe DERRIÈRE. La piste garde
    une bordure **transparente** de mêmes dimensions, qui ne montre rien mais
    cale le padding box sur le chenal : les % de largeur et les crans restent
    mesurés sur le chenal. Le remplissage déborde de 7 px à gauche
    (`content-box` + `padding-left: 7px`, donc le bout droit ne bouge pas) pour
    glisser sous le montant, qui occupe les colonnes 2 à 8 du sprite.
- **Pas de version fine** : une génération PixelLab dédiée (« thin horizontal
  progress bar frames », `docs/concepts/ui-panneau/pixellab-joncs-jauge-688.png`)
  ressort en joncs de ~50-70 px — le rendu se fait à l'échelle du canevas, on ne
  commande pas une épaisseur en pixels. Et le jonc existant ne se retaille pas
  sous ~29 px : le profil ligne à ligne (`scratch/capRows.mjs`) montre un
  **bossage aux rangs 13-18** des capuchons, seules 4 rangées sont strictement
  identiques donc supprimables. Ne pas recommencer.

### Vérification
Les captures de la pane sont HS sur ce projet et `html2canvas` ne rend pas
`border-image`. Ce qui marche : **`foreignObject` → canvas → POST `/__shot`**
(plugin dev de `vite.config.js`), en inlinant les feuilles de style de la page
et en remplaçant les URL des PNG par des data-URI. Le rendu est celui du moteur,
donc `border-image` y est fidèle.

Deux limites rencontrées :
- **Ne pas juger un raccord au coup d'œil.** Les deux défauts corrigés (couture
  du jonc au milieu, bande noire au départ) sont invisibles sur une vue
  d'ensemble. Les voir demande un **zoom ×8 sur les bouts et le milieu**, et
  surtout un **relevé des couleurs colonne par colonne** (`scratch/scanRow.mjs`) :
  c'est lui qui a nommé le coupable, `#010505` à x=8.
- Le harnais **n'a pas rendu le `::after`** de `.rupture-bar` alors que les
  styles calculés étaient bons dans la page. Repli utilisé :
  `scratch/previewGauge.mjs`, qui recompose la jauge hors navigateur (braise
  tuilée puis 9-slice par-dessus) avec les mêmes constantes que le CSS.

---

## 3. Méthode (recette de réintégration)

1. **Choisir** le cadre dans `Fantasy UI Borders/PNG/Default/Border/` (centre
   transparent — on fournit nous-mêmes le fond via CSS). Variantes `Border` (filet),
   `Double` (double trait) ; éviter `Panel` (centre or plein).
2. **Teinter** en or (script PowerShell `System.Drawing` : remplacer RGB, garder
   l'alpha) et déposer dans `src/assets/ui/`.
3. **Poser en 9-slice** via `border-image: url(...) <slice> stretch` avec une
   `border-width` qui contrôle l'épaisseur rendue. Slice ≈ largeur du motif d'angle
   en px source (12 pour ces tuiles 48×48 ; vérifier au cas par cas).
4. **Fond** : la couleur/le voile vient du `background` de l'élément (le cadre ne
   dessine que l'anneau de bordure tant qu'on n'ajoute pas le mot-clé `fill`).
