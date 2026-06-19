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
  Applique le cadre 9-slice à `.panel`, `.hud-panel`, `.city-status-panel`,
  `.chronicle-ticker`, `.topbar-resources` via `!important` (skin global).
- **Knob unique** : `--ui-frame-w` (épaisseur, défaut 12px) ; aussi `--ui-frame-src`
  / `--ui-frame-slice`. Pour **exclure** un panneau : `border-image: none !important;`.
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
