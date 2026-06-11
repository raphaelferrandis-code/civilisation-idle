# Audit UI/UX complet — Civilisation : Effondrement Idle (CE 0.3)

> Audit réalisé sur le code (`src/styles/*.css`, `src/components/**`) et sur captures réelles
> en 1920×1080 et 1366×768. Aucun code n'a été modifié : toutes les propositions sont dans
> les sections « Propositions techniques ».

---

## 1. Diagnostic global

### Ce qui fonctionne déjà
- **Identité thématique forte** : Cinzel + ambiance parchemin/or, le journal qui change de style selon l'âge (`is-oral` → `is-cyber-feed` dans `components.css`) est une excellente idée, rare dans le genre.
- **La jauge de pression avec fissures SVG** (`CityView.jsx`, `.sg-cracks`) : feedback diégétique remarquable, à conserver et étendre.
- **Tiers de palier des bâtiments** (`data-tier 1→5`, cuivre→légendaire) : bonne mécanique de progression visuelle, déjà dans l'esprit Cookie Clicker.
- **Divulgation progressive** : un seul bâtiment verrouillé affiché à la fois (`nextLocked` dans `BuildingShop.jsx`) — exactement le bon pattern (Kittens Game fait pareil).
- **Onglets verrouillés masqués** dans la sidebar (Mythes/Ruines n'apparaissent qu'au déblocage).
- **work-bar animée** sur les bâtiments actifs : sensation de « machine qui tourne ».

### Ce qui pose problème visuellement
- **Deux systèmes d'or concurrents** : `--gold: #d97706` (ambre Tailwind) dans `variables.css`, mais la moitié du CSS utilise un or parchemin codé en dur (`#c9a84c`, `#e2bd55`, `rgba(226,189,85,…)`, `#e8c96a`, `#b89455`). Résultat : aucune teinte dorée n'est identique d'un panneau à l'autre.
- **Couches de thèmes superposées** : `components.css` redéfinit `.resource` deux fois (lignes ~197 et ~824) avec `!important`, un thème « premium dark » recouvert par un thème « parchemin antique ». C'est l'origine de l'aspect « slop UI » : décisions empilées, jamais arbitrées.
- **Glow partout** : text-shadow sur quasi tous les titres, box-shadow lumineux sur cartes, badges, barres, boutons. Quand tout brille, rien ne ressort.
- **7 valeurs de border-radius** (3, 4, 6, 8, 9, 10, 12 px) sans logique.
- **Bordures orange/or sur des éléments non interactifs** (cartes stats, barres, panneaux) : l'œil ne sait plus ce qui est cliquable.

### Ce qui pose problème en UX
- Le **coût n'est pas sur le bouton d'achat** : il est noyé dans une rangée de chips identiques (`Cout 10 nourriture` à côté de `palier x2 dans 25` et `Ajoute +0.2 pop/s`). Le joueur ne peut pas scanner « qu'est-ce que je peux acheter ? ».
- **Aucun état « affordable » sur la carte** : seul `button:disabled` change (opacité 0.45). Cookie Clicker / AdCap signalent l'achetabilité sur toute la ligne.
- **Le journal est au-dessus de la boutique** dans `city-right-col` : la zone d'interaction la plus fréquente du jeu est repoussée sous ~250px de contenu narratif.
- **Débordement horizontal à 1366×768** (vérifié en capture) : `.view` impose `minmax(28rem,1.45fr) minmax(20rem,0.85fr)` + sidebar 18rem → scrollbar horizontale, onglet « Infrastructures » coupé, toolbar ×1/×10 hors écran.
- **Textes en 0.65–0.68rem** (10.4–10.9px) dans la topbar : sous le seuil de lisibilité.

### Trop chargé
- Cartes de ressources : 5 zones d'info chacune (header + valeur + flux + jauge + humeur + footer description). La description (« Fondation démographique de votre empire ») est du bruit permanent.
- En-tête de cité : nom + personnalité + jauge + 5 stat-chips, avant même la carte.
- Chips de la carte bâtiment : 3–4 chips visuellement identiques pour des infos de natures différentes (coût ≠ palier ≠ production).

### Trop petit
- Labels topbar `0.66rem`, descriptions `0.66rem`, boutons ×1/×10 `height 1.65rem / font 0.76rem` (~26px de haut), chips `0.74rem`, footer chronique `0.65rem`.

### Hiérarchie visuelle manquante
- Coût, production, niveau et palier ont le même poids (même chip). 
- La valeur de ressource (1.18rem en topbar) est à peine plus grande que son label.
- Les 6 cartes de ressources ont le même poids alors que Vitalité/Pressions est une carte de nature différente.

### Attire trop l'œil (à tort)
- L'animation `ancient-bar-shine` (brillance toutes les 3s) sur **toutes** les barres.
- Le `crisis-danger::after` plein écran (z-index 9999, pulse 2s infini) dès 80% : épuisant en session longue.
- Les bordures or des panneaux décoratifs.

### N'attire pas assez l'œil (à tort)
- Le bouton Acheter quand l'achat est possible (même style qu'au repos).
- La jauge de rupture en topbar (4px de haut, perdue dans la 6e carte).
- Le déblocage d'un nouveau bâtiment (aucune animation d'apparition).

### Impression « UI générée par IA »
- Styles inline massifs dans `CityView.jsx` (panneaux Atrides/Énée : ~150 lignes de style objet), avec **des variables inexistantes** : `var(--orange)` et `var(--text-dim)` ne sont définies nulle part → bordure invisible (bug réel, lignes ~401 et ~563).
- Accents manquants incohérents : « Batiments », « Cout », « Bientot », « Debloque » dans la boutique vs texte accentué ailleurs.
- Dégradés tri-couleurs systématiques sur les barres, radial-gradients décoratifs en coin de chaque carte.

### Fatigue sur session longue
- 6+ animations infinies simultanées (shine, pulses, vignette crise, LED presse, scan cyber).
- Contrastes faibles (muted #b0b9c4 sur panel rgba(24,27,38,.82)) qui forcent l'accommodation.
- Aucun respect de `prefers-reduced-motion`.

---

## 2. Structure générale de la page

| Zone | État actuel | Verdict |
|---|---|---|
| Sidebar | 18rem (288px) fixe, sticky | Trop large pour 3–6 onglets texte. 240px suffisent ; 64–72px en mode icônes serait encore mieux à 1366. |
| Ressources (topbar) | 6 colonnes `minmax(9.4rem,1fr)`, overflow-x auto | Bon placement, mauvaise densité interne. Le scroll horizontal de secours est un anti-pattern. |
| Carte | colonne gauche, `clamp(26rem, 100vh-32rem, 58rem)` | Très grande, purement décorative au premier regard, pousse les mythes/panneaux sous le fold. |
| Journal | colonne droite, **au-dessus** de la boutique | Mauvais ordre : la boutique est l'action n°1 du genre. |
| Boutique | colonne droite ~35–40% (`0.85fr`, min 20rem) | Trop étroite pour son contenu (titre + 3 chips + bouton 8.8rem). |

Problèmes transverses :
- **Densité** : `gap: 0.45–0.75rem` partout, padding 0.7–1rem ; aucune zone ne respire plus qu'une autre → mur uniforme.
- **Alignement** : la topbar n'est pas alignée verticalement avec les colonnes en dessous (margins différents) ; les chips wrappent de façon irrégulière.
- **Scroll** : 3 contextes de scroll imbriqués possibles (page, chronique `max-height 12.5rem`, log `32rem`) + scroll horizontal accidentel à 1366.
- **Plein écran 1920** : la colonne centrale s'étire, lignes de description > 90 caractères dans la boutique ; aucune max-width de contenu.
- **Petits écrans** : breakpoints à 980/768/560px seulement — rien entre 980 et 1440 alors que c'est la zone critique (1366×768 = ~25% des laptops Steam).

### Propositions
- Grille app : `grid-template-columns: 240px minmax(0,1fr)` ; sous 1500px : sidebar 64px icônes.
- Vue Cité : `grid-template-columns: minmax(0, 1fr) clamp(24rem, 34vw, 30rem)` — la boutique devient une colonne **fixe et confortable**, la carte absorbe le reste.
- Breakpoint intermédiaire à **1440px** : réduire les paddings de 25%, masquer les descriptions de ressources.
- Journal **sous** la boutique, hauteur max `14rem`, ou onglet « Chronique » du panneau droit.

---

## 3. Menu d'achat (analyse principale)

### Constats détaillés
1. **Taille/position** : ~380–450px de large à 1920 ; correct. À 1366 : écrasé + toolbar éjectée (capturé).
2. **Catégories** (`.shop-subtab`) : Cinzel 0.95rem dans des boutons `flex:1` → « Infrastructures » déborde dès 1500px. Pas de compteur ni d'indicateur « quelque chose d'achetable ici ».
3. **Carte bâtiment** : grid `1fr auto`, bouton vertical pleine hauteur de 8.8rem de large = ~30% de la carte pour un bouton qui ne dit même pas le prix.
4. **Bouton Acheter** : libellé `Acheter x{n}` ; le coût est ailleurs ; pas d'état affordable ; disabled = opacité seule.
5. **Hiérarchie de l'info** : nom (1rem) > tout le reste en chips 0.74rem identiques. Le « Niv. » (info de fierté) et le « Coût » (info de décision) ont le même traitement.
6. **Barres de progression** : la work-bar est ambiguë (`--work-fill: count%` → ressemble à une progression vers quelque chose alors que c'est juste le nombre possédé, plafonné à 100).
7. **Valeurs numériques** : pas de `font-variant-numeric: tabular-nums` → les chiffres « sautent » à chaque tick.
8. **Multiplicateurs ×1/×10/×25/×100** : 26px de haut, dans la même rangée que les sous-onglets ; ×25 est non standard (×10/×100/Max suffisent — Realm Grinder utilise ×10/×100/Max, AdCap ×1/×10/×100/Max). Pas de raccourci clavier (Shift=×10, Ctrl=×100 : standard du genre).
9. **Compréhension immédiate** : aucune réponse visuelle à « qu'est-ce qui est rentable ? » (pas de ROI), « qu'est-ce que je peux acheter ? » (pas d'état), « qu'est-ce qui est bloqué ? » (ok), « qu'est-ce qui progresse ? » (work-bar ambiguë).

### Standards du genre à transposer
- **Cookie Clicker** : 3 états de ligne (achetable = pleine couleur, vu-mais-trop-cher = assombri avec prix rouge, inconnu = silhouette). Coût + icône ressource directement sur la ligne.
- **AdVenture Capitalist** : gros bouton = prix ; barre de progression vers le prochain palier ×2 visible en permanence.
- **Melvor Idle** : badge de niveau bien séparé du coût ; grilles compactes scannables.
- **Antimatter Dimensions** : le bouton contient « Coût : X » et change littéralement de couleur quand achetable.
- **Kittens Game** : prix colorés par ressource manquante.

### Propositions de refonte (12 variantes)

**A. Version compacte (recommandée comme base)**
- Rangée de 64px : `[icône 36px] [nom + prod/s] [Niv.] [bouton 110×44px avec coût]`.
- Chips supprimées : production sous le nom en 12px vert (`+12.4 nour/s`), coût **dans** le bouton.
- ✅ 2× plus de bâtiments visibles, scan instantané. ❌ Moins de place pour le lore/palier. 
- Quand : c'est le défaut du genre. Intégration : refactor du JSX de `BuildingShop.jsx` en composant `PurchaseRow`, nouveau bloc CSS, aucune logique modifiée.

**B. Version premium / carte large**
- Carte 96px : icône 48px, nom Cinzel, description 1 ligne, footer `coût | production | palier`, bouton 100% largeur en bas.
- ✅ Mise en valeur du thème. ❌ 4–5 bâtiments visibles max ; scroll fatigant en late game. Quand : si < 8 bâtiments par catégorie.

**C. Version idle classique (Cookie Clicker)**
- Liste serrée 52px, prix coloré (vert = payable, rouge = non), icône ressource du coût, quantité possédée en très gros chiffre fantôme à droite (`24` en 32px à 15% d'opacité).
- ✅ Lisibilité du « combien j'en ai » immédiate. ❌ Moins d'infos secondaires. Quand : si vous assumez le pur idle.

**D. Version tableau optimisé**
- `display:grid` à colonnes fixes : Nom | Niv | Prod/s | Coût | [Acheter]. En-têtes cliquables pour trier (coût, prod, ROI).
- ✅ Parfait pour joueurs min-maxers, très dense. ❌ Froid, casse le thème. Quand : en option « affichage compact » dans les Options.

**E. Version gros bouton intégré**
- Toute la carte **est** le bouton (comme Kittens Game). Clic n'importe où = achat. Hover = surbrillance totale.
- ✅ Zone de clic énorme, très satisfaisant. ❌ Risque de mis-clic ; conflit avec de futurs sous-boutons (vendre, info). Quand : mobile/Steam Deck.

**F. Version cartes visuelles**
- Sprite du bâtiment (déjà existants dans `buildingShapes.js` !) en vignette 40px à gauche, teintée par catégorie.
- ✅ Reconnaissance pré-attentive, lien carte↔boutique. ❌ Demande un rendu canvas→PNG ou des icônes dédiées. Quand : phase polish.

**G. Catégories mieux séparées**
- Garder les 3 sous-onglets mais : compteur d'achetables en badge (`Moteurs •3`), couleur d'accent par catégorie (or/bleu/violet), barre active 2px sous l'onglet au lieu du fond plein.
- ✅ Le joueur sait où aller sans cliquer. ❌ Rien. À faire dans tous les cas.

**H. Onglets élégants**
- Onglets « livre » : texte Cinzel small-caps, soulignement doré animé, plus de boîtes pleines. Hauteur 40px fixe, `text-overflow` interdit (libellés courts : Moteurs / Savoir / Infra).
- ✅ Règle le débordement à 1366. ❌ Moins « boutons ». 

**I. Tri automatique des achetables**
- Les bâtiments payables remontent en tête de liste (tri stable, animé via `view-transition` ou FLIP).
- ✅ Zéro scroll pour agir. ❌ La liste bouge sous la souris → risque de mis-clic (NGU Idle a ce défaut). Quand : plutôt en **épinglage** : une section « Disponibles » en haut, pas un réordonnancement continu.

**J. Achats importants mis en avant**
- Quand un bâtiment est à <1 palier d'un milestone (×2), liseré animé + chip palier dorée. Premier achat d'un bâtiment jamais possédé : bordure `--gold-bright` + petit badge « Nouveau ».
- ✅ Guide le joueur vers les achats à fort impact. ❌ À doser pour ne pas re-créer du glow partout.

**K. Indication ROI**
- Tooltip (ou ligne discrète) : `Rentabilisé en ~4m 12s` = coût / production marginale. Option « Afficher l'efficacité » dans Options, avec surlignage du meilleur ROI (étoile discrète).
- ✅ Le cœur du plaisir incremental pour 30% des joueurs. ❌ Spoile l'optimisation pour les autres → opt-in. Intégration : pur calcul dérivé de `buildingBatchCost` + delta de `rates()`, zéro changement de gameplay.

**L. Icônes de ressources**
- Remplacer « 10 nourriture » par `10 🌾` (ou Font Awesome déjà chargé : `fa-wheat-awn`, `fa-coins`, `fa-book-open`, `fa-archway`, `fa-users`). Coûts multi-ressources : `1.2K 🪙 · 300 📖`.
- ✅ Compression + lisibilité + langue-agnostique. ❌ Aucun. À faire partout (coûts, production, journal).

**Recommandation finale** : A + G + H + J + L en socle, K et I (version « section épinglée ») en option, F en polish.

### Proposition technique — composant `PurchaseRow`
```jsx
// src/components/ui/PurchaseRow.jsx (nouveau)
<article className={`purchase-row ${affordable ? 'is-affordable' : 'is-locked-cost'}`} data-tier={tier}>
  <div className="pr-icon">{icon}</div>
  <div className="pr-main">
    <div className="pr-name-row">
      <h3>{b.name}</h3>
      {milestoneInfo && <span className="pr-milestone">{milestoneInfo.label}</span>}
    </div>
    <span className="pr-prod">+{fmt(prodPerSec)} {resIcon}/s</span>
    <div className="pr-milestone-track"><span style={{width: pctToNextMilestone}}/></div>
  </div>
  <span className="pr-count">{count}</span>
  <button className="btn-purchase" disabled={!affordable} onClick={buy}>
    <span className="bp-action">Acheter ×{n}</span>
    <span className="bp-cost">{costIconLabel}</span>
  </button>
</article>
```
```css
.purchase-row { display:grid; grid-template-columns: 36px minmax(0,1fr) auto 116px;
  gap:.65rem; align-items:center; min-height:64px; padding:.55rem .75rem;
  border:1px solid var(--border-soft); border-left:3px solid var(--tier-color, var(--border-soft));
  border-radius:6px; background: var(--bg-card); }
.purchase-row.is-affordable { border-color: color-mix(in srgb, var(--accent-gold), transparent 55%); }
.purchase-row.is-locked-cost { opacity:.78; }
.purchase-row.is-locked-cost .bp-cost { color: var(--crisis-red); }
.pr-count { font:700 1.6rem var(--font-title); color:rgba(240,200,96,.28); font-variant-numeric:tabular-nums; }
```
- Multiplicateurs : sortir `BuyToolbar` de `shop-controls-row` → **barre sticky** en haut du panneau (`position:sticky; top:0; z-index:2; background:var(--bg-panel)`), boutons 32px de haut, et raccourcis Shift/Ctrl au clic.
- Pulse « affordable » : un seul keyframe discret, uniquement sur le **premier** achat possible de la liste :
```css
@keyframes affordable-breathe { 0%,100%{box-shadow:0 0 0 0 rgba(240,200,96,0)} 50%{box-shadow:0 0 0 3px rgba(240,200,96,.14)} }
.purchase-row.is-affordable:first-of-type .btn-purchase { animation: affordable-breathe 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce){ .btn-purchase{ animation:none !important; } }
```

---

## 4. Système de boutons

### Constats
- `base.css button` : min-height 2.5rem, radius 8 — correct mais recouvert partout par des variantes locales (`.buy-mode` 1.65rem/radius 3, `.shop-subtab` radius 4, `.archive-tab` radius 6, `.toggle-btn` radius 4…).
- Save/Export/Import/Options : style générique + **styles inline dans `App.jsx`** (`style={{marginTop:'auto', padding:'1rem'}}`) qui dupliquent `.quick-actions` du CSS.
- États : hover ok, active ok, mais **pas d'état focus-visible global**, pas d'état « affordable », disabled = opacité seule (insuffisant : garder le label lisible, griser le fond).

### Spécifications recommandées
| Type | Hauteur | Radius | Police | Usage |
|---|---|---|---|---|
| `btn-primary` | 40px | 6px | Inter 700 14px | actions de panneau (Exhumer, Confirmer) |
| `btn-purchase` | 44px | 6px | Inter 700 13px + coût 12px | achat bâtiment/upgrade |
| `btn-critical` | 48px | 6px | Cinzel 700 15px | Effondrement, Grand Reset |
| `btn-secondary` | 36px | 6px | Inter 600 13px | toggles, archive-tabs |
| `btn-danger` | 40px | 6px | Inter 700 14px | suppression de save |
| `btn-nav` (sidebar) | 42px | 6px | Inter 600 13px small-caps | navigation |
| `btn-tiny` | 28px | 4px | Inter 700 11px | ×1/×10/×100/Max, format nombres |

Règles :
- **Cible cliquable ≥ 32×32px toujours**, 44px pour les actions répétées (achat).
- **Ombres** : une seule ombre portée `0 2px 8px rgba(0,0,0,.35)` ; **glow réservé** à `is-affordable` et `btn-critical`.
- **Bordures** : 1px ; l'or en bordure = « interactif et disponible », jamais décoratif.
- Hover : fond +6% luminosité + bordure or, `translateY(-1px)` ; Active : `translateY(0) scale(.98)` ; Disabled : `background:var(--bg-inset); color:var(--text-disabled); border-color:var(--border-soft); opacity:1`.
- Focus clavier : `outline:2px solid var(--accent-gold-bright); outline-offset:2px` global.
- Intégration à l'univers : coins légèrement biseautés en option (`clip-path: polygon(...)` 3px) sur `btn-critical` uniquement ; éviter le skeuomorphisme lourd.
- Couleurs à éviter sur boutons : violet/bleu/vert pleins (réservés aux ressources) ; le rouge plein réservé à `btn-critical`/`btn-danger`.

### Proposition technique
```css
.btn { display:inline-flex; align-items:center; justify-content:center; gap:.45rem;
  min-height:40px; padding:0 1rem; border-radius:6px; border:1px solid var(--border-soft);
  background:var(--bg-card); color:var(--text-main); font:600 14px/1 var(--font-body);
  cursor:pointer; transition: background .15s, border-color .15s, transform .1s, box-shadow .15s; }
.btn:focus-visible { outline:2px solid var(--accent-gold-bright); outline-offset:2px; }
.btn-purchase { min-height:44px; flex-direction:column; gap:.15rem;
  border-color: var(--accent-gold); background: color-mix(in srgb, var(--accent-gold), transparent 88%);
  color: var(--accent-gold-bright); }
.btn-purchase:not(:disabled):hover { background: var(--accent-gold); color:#16100a; }
.btn-purchase:disabled { background:var(--bg-inset); border-color:var(--border-soft);
  color:var(--text-disabled); opacity:1; }
.btn-purchase .bp-cost { font:700 12px var(--font-body); font-variant-numeric:tabular-nums; }
```

---

## 5. Couleurs

### Diagnostic
- ✅ Fond sombre bleu-noir `#0d1018` : bon socle. Couleurs de ressources (vert/bleu/violet/or) : mapping clair et cohérent avec le genre.
- ❌ **Deux ors** (ambre #d97706 vs parchemin #c9a84c/#e2bd55) → impression brouillonne (cause n°1 du « slop »).
- ❌ Fonds bruns codés en dur (`#211408`, `#1a1208`, `#15100a`, `#251608`…) qui tirent l'UI vers le marron-boue et jurent avec le fond bleu-noir des panneaux.
- ❌ Saturation : `--red #ef4444` et les gradients tri-couleurs sont très saturés sur fond sombre ; le rouge doit être **réservé** à crise/danger (il est aussi utilisé pour la carte Vitalité, des bordures, du texte).
- ❌ Contrastes : `--muted #b0b9c4` sur `--panel` ≈ 4.2:1 — limite pour du 11px ; `#8a7050` sur `#1a1208` ≈ 3:1 — insuffisant ; `#8c7355` (chronique) idem.
- Réserver : **or vif** = achetable/actif/sélection ; **rouge** = crise/danger/irréversible ; **vert** = flux positifs ; **cyan** = journal/chronique uniquement.

### Palette proposée (design tokens)
```css
:root {
  /* Fonds */
  --bg-main:   #0d1018;
  --bg-panel:  #161a26;
  --bg-card:   #1d2231;
  --bg-card-2: #242a3c;   /* hover / surélevé */
  --bg-inset:  #0a0d13;   /* pistes de barres, champs */
  /* Bordures */
  --border-soft:   rgba(255,255,255,.08);
  --border-strong: rgba(255,255,255,.16);
  --border-active: #d6a84b;
  /* Textes */
  --text-main:      #f2f4f7;
  --text-secondary: #c8cfda;
  --text-muted:     #8d96a6;
  --text-disabled:  #5c6373;
  /* Accents (UN seul or) */
  --accent-gold:        #d6a84b;
  --accent-gold-bright: #f0c860;
  --accent-gold-deep:   #8f6b25;
  --crisis-red:    #e25548;
  --positive-green:#3fc98e;
  --knowledge-blue:#5fa3f0;
  --infra-violet:  #a78bfa;
  --journal-cyan:  #5fd4e0;
  --purchase-orange:#e8943a;
  --disabled:      #4b5363;
  /* Tokens ressources (uniques, réutilisés partout : topbar, coûts, carte) */
  --res-pop:   #d9c27f;
  --res-food:  var(--positive-green);
  --res-gold:  #f0a94a;
  --res-know:  var(--knowledge-blue);
  --res-infra: var(--infra-violet);
}
```
Migration : remplacer mécaniquement `#c9a84c|#e2bd55|rgba(226,189,85` → `var(--accent-gold)`, `#d97706` → décision unique (garder `--accent-gold` ambré chaud), purger les bruns `#211408` etc. → `var(--bg-card)`.

---

## 6. Typographie

### Constats
- Cinzel (titres) : bon choix identitaire, mais utilisé jusque sur les **chiffres de ressources** et les boutons ×1/×10 → chiffres à chasse irrégulière qui « dansent ».
- Crimson Text est déclaré (`--font-serif`) mais quasi inutilisé — soit l'employer pour le journal, soit le retirer du chargement.
- Excès de MAJUSCULES + letter-spacing sur du 10–11px : illisible (`.resource-name`, `.gauge-label`, `.chronicle-meta-top`…).
- Aucun `tabular-nums` sauf un endroit isolé.

### Système proposé
| Rôle | Police | Taille | Poids | LS | LH |
|---|---|---|---|---|---|
| H1 (nom de cité, titre de vue) | Cinzel | 28px / 1.75rem | 700 | .02em | 1.15 |
| H2 (titre de panneau) | Cinzel | 20px | 700 | .03em | 1.2 |
| H3 (nom de bâtiment, carte) | Inter | 15px | 650 | 0 | 1.25 |
| Label (uppercase) | Inter | **11px min** | 700 | .07em | 1.2 |
| Valeur de ressource | Inter `tabular-nums` | 22px | 700 | 0 | 1.05 |
| Coût | Inter `tabular-nums` | 13px | 700 | 0 | 1.2 |
| Bonus / production | Inter | 12px | 600 | 0 | 1.3 |
| Description / lore | Crimson Text | 14px | 400 italique | 0 | 1.55 |
| Texte secondaire | Inter | 13px | 500 | 0 | 1.45 |
| Tiny (plancher absolu) | Inter | 11px | 600 | .02em | 1.3 |
| Texte bouton | Inter | 14px (13px purchase) | 700 | .02em | 1 |

```css
:root {
  --fs-h1:1.75rem; --fs-h2:1.25rem; --fs-h3:.9375rem; --fs-label:.6875rem;
  --fs-value:1.375rem; --fs-cost:.8125rem; --fs-body:.875rem; --fs-tiny:.6875rem;
}
.num { font-variant-numeric: tabular-nums; }
```
Règle : **plus rien sous 11px** ; Cinzel réservé à H1/H2 et `btn-critical`.

---

## 7. Sidebar

### Constats
- 288px pour 3–6 liens texte + 4 boutons : ratio info/surface faible ; à 1366 elle coûte 21% de l'écran.
- État actif bien marqué (or) mais hover ≈ actif (mêmes teintes).
- `tab-locked` (opacité .25 + bordure rougeâtre) : les onglets verrouillés sont en réalité **masqués** dans `App.jsx` — le style locked ne sert que pendant `crisisLocked` ; ambigu.
- Quick-actions : doublon CSS + inline style ; « Save » redondant avec l'autosave (à reléguer dans Options ?).
- Aucune info de statut dans la sidebar (âge, cycle) alors que la place est là.

### Variantes proposées
1. **Sobre** : 240px, onglets 42px, icône 18px + libellé 13px, actif = fond or 10% + barre 3px à gauche, hover = fond blanc 4% seulement. Quick-actions en rangée d'icônes 32px avec tooltip.
2. **Premium** : idem + cartouche d'ère sous le brand (nom d'âge + mini barre de progression) ; séparateurs gravés (`border-image` dégradé or 20%).
3. **Civilisation antique** : icônes glyphe (colonne, amphore, parchemin) dessinées en SVG mono-trait or ; actif = glyphe rempli ; texture pierre très subtile (noise 2% d'opacité) sur le fond.
4. **Terminal/chronique** : monospace, préfixe `▸` sur l'actif, compteur de cycle qui s'incrémente — réservé aux âges tardifs (cohérent avec le journal cybernétique : la sidebar pourrait suivre le même theming par âge que le journal, idée signature).
5. **Compacte** : 64px icône-seule + tooltip, libellés au hover (expansion 240px en overlay). Défaut sous 1500px.

Onglet verrouillé visible (teaser) : afficher Mythes/Ruines **grisés avec cadenas + condition** (« Atteindre 1 cycle ») plutôt que masqués — le teasing d'onglet est un moteur de motivation standard (Melvor, NGU).

---

## 8. Cartes de ressources (topbar)

### Constats
- 6 cartes × 5 zones = ~30 éléments d'info permanents ; labels 0.66rem ; descriptions tronquées par ellipsis à 1366 (« RESER… », « MEM… »).
- La valeur (1.18rem) ne domine pas ; l'humeur (« Famine proche ») est plus visible que le flux.
- La carte « Vitalité & Pressions » mélange Âge/Usure/Légitimité dans le même gabarit que les ressources : confusion de nature.

### Version améliorée
- **2 lignes par carte, c'est tout** : `icône + nom` / `valeur 22px` + `+x/s` 12px coloré (vert/rouge **+ signe ▲▼** pour le daltonisme). Jauge de réserve : filet 3px en bord inférieur de la carte (pas de label « Réserves » ni humeur — l'humeur passe en tooltip).
- Icône 16px teintée par `--res-*` ; bord gauche 3px conservé (bon système).
- Tooltip riche au hover (déjà un pattern dans le code avec `data-tooltip`) : description, humeur, multiplicateurs, détail du flux.
- État négatif : la valeur elle-même passe en rouge + ▼ (pas seulement le rate).
- La 6e carte devient un **bandeau d'état** distinct (pleine largeur sous la topbar ou intégré à l'en-tête de cité) : Âge + barre, Usure + paliers de sédiment, Rupture.
- Espacement : `gap: 8px`, padding `10px 12px`, hauteur cible 72px (actuellement ~96–110px).

---

## 9. Zone centrale / carte de ville

### Constats
- La carte occupe jusqu'à `58rem` de haut : magnifique potentiellement, mais au premier cycle c'est un grand champ vert quasi vide qui domine l'écran (capturé), sans légende ni contrôles visibles.
- Elle est déjà **interactive** (cursor grab, pensées de citoyens cliquables avec récompense — excellent game feel, sous-exploité car invisible : rien n'indique qu'on peut cliquer).
- Rôle réel : feedback de progression (bâtiments achetés apparaissent) + micro-interactions. C'est le bon rôle ; il faut le rendre lisible.

### Propositions
- **Cadre** : conserver la bordure fine, ajouter un **bandeau d'overlay bas** semi-transparent (32px) : nom de l'âge, population, icônes de filtres.
- **Contrôles** : boutons zoom +/− et recentrage (28px, coin bas-droit) ; le hint « cliquez-glissez » existe (`.map-interaction-hint`) — le faire disparaître après la première interaction.
- **Calques/filtres** : toggle « production » (halo discret par catégorie sur les bâtiments), « danger » (zones affectées par la crise).
- **Légende** : tooltip au survol d'un bâtiment (nom + niveau) — relie boutique et carte (variante F §3).
- **Crise sur la carte** : au lieu de la vignette plein écran, fissures/fumées **dans la carte** quand instabilité > 75% (cohérent avec `.sg-cracks`), teinte du ciel qui vire au rouge sombre. La carte devient le baromètre émotionnel.
- **Animation de vie** : déjà des agents ; ajouter 1 oiseau/fumée de cheminée par tranche de population — petit, pas de coût UI.
- Hauteur : plafonner à `min(48vh, 34rem)` pour que boutique et mythes restent au-dessus du fold à 1080p.

---

## 10. Chronique / journal

### Constats
- Le système de 7 thèmes par âge est la **meilleure idée UI du jeu** — gardez-le tel quel sur le fond.
- Problèmes : placé au-dessus de la boutique (concurrence directe), masthead + méta + bordures = ~90px de chrome pour 1 entrée visible ; badge « NEW » petit ; footer 0.65rem.

### Recommandation retenue (décision post-audit) : le bandeau-dépêche
Les articles étant des one-liners percutants à usage unique (pas de relecture souhaitée, pas d'archive),
le panneau journal est remplacé par un **ticker** (pattern Cookie Clicker / Universal Paperclips) :
- **Une ligne pleine largeur (~36px)** entre la topbar et les deux colonnes : glyphe-préfixe + la phrase. Pas de masthead, pas de méta.
- **L'arrivée est l'événement** : animation d'écriture (machine à écrire / télex / scanline selon l'âge).
- La dépêche **reste affichée jusqu'à la suivante** (pas de timeout, pas d'archive). Ring buffer de 1–3 entrées en mémoire, non sauvegardé ; survol = aperçu fantôme des 2 précédentes.
- Les **7 thèmes par âge** se transposent au bandeau (pointillés oral → relief argile → Crimson parchemin → double filet gazette → mono+LED presse → scanline cyan).
- **Dépêche de crise** : bordure rouge + persistance tant que la crise est active (seul cas fonctionnel).
- Code : `JournalPanel.jsx` → `ChronicleTicker.jsx`, sort de `city-right-col` ; la boutique remonte en tête de colonne droite (~250px récupérés). Logique de génération inchangée.

---

## 11. Barre de crise / rupture

### Constats
- La `stability-gauge` (en-tête de cité) est bonne : paliers de couleur, fissures progressives, labels narratifs.
- Mais la rupture vit à **3 endroits** (stability-gauge, carte Vitalité topbar, vue Crises) avec des gradients différents → laquelle fait foi ?
- La vignette `crisis-danger::after` plein écran pulse 2s en infini : trop agressive, et **binaire** (rien… puis tout).

### Propositions
- **Une seule barre canonique**, dans l'en-tête de cité, avec **graduations de seuil** (ticks à 25/50/75/90%) et icônes de palier (bouclier→⚠→🔥→💀 déjà en place).
- Montée : la barre « respire » légèrement (+2% de largeur en pulse) uniquement > 75%.
- Franchissement de seuil : flash unique 600ms + entrée de journal — pas d'animation permanente.
- Effet progressif global au lieu du binaire : `filter: saturate()` du fond de page qui glisse de 1 → .85 et vignette **statique** dont l'opacité = f(instabilité). Le pulse animé seulement > 90%.
- Tooltip explicatif sur la barre : sources de pression (+x bâtiments, +y population, −z savoir) — les données existent dans `pressureBreakdown()`.

---

## 12. Responsive

| Cible | Stratégie |
|---|---|
| 1920×1080 | Layout actuel 2 colonnes + sidebar 240px ; max-width 1720px centrée pour éviter l'étirement. |
| 1536–1366×768 | **Breakpoint 1500px** : sidebar 64px icônes, topbar descriptions masquées, cartes ressources 2 lignes, boutique min 22rem, paddings −25%. Objectif : zéro scroll horizontal (bug actuel). |
| Ultra-wide | max-width du contenu ; la carte peut s'étendre, pas les panneaux texte. |
| Tablette (1024) | 1 colonne : topbar sticky compacte (valeurs seules), carte repliable (`<details>` ou toggle), boutique pleine largeur, journal en onglet. |
| Sticky | topbar ressources (sticky top) ; BuyToolbar (sticky en haut du panneau boutique) ; barre de rupture si > 75% (mini-bandeau). |
| Scrollable | uniquement : liste de bâtiments, journal, archives. Jamais la page horizontalement. |

---

## 13. Accessibilité

- **Contraste** : passer `--text-muted` à `#8d96a6` minimum et interdire muted sous 12px ; vérifier les bruns (#8a7050, #8c7355) — tous < 4.5:1 actuellement.
- **Rouge/vert daltonisme** : flux toujours accompagnés de `+`/`−` et `▲▼` ; états affordable signalés par bordure + icône, pas seulement la couleur.
- **Cibles** : ×1/×10 actuellement ~26px → 32px min ; chips cliquables interdites sous 24px.
- **Focus clavier** : outline global `:focus-visible` (n'existe que sur `.resource`) ; ordre de tabulation boutique = ordre visuel ; Escape ferme déjà → bien.
- **Tooltips** : accessibles au focus (pas seulement hover), délai 300ms.
- **Réduction de mouvement** : `@media (prefers-reduced-motion: reduce)` coupe shine/pulses/scan (aucune occurrence aujourd'hui).
- **Sons** : toggle déjà présent ; ajouter volumes séparés UI/ambiance.
- **Fatigue** : limiter à 2 animations infinies simultanées visibles ; bannir les pulses < 1.5s hors danger réel.

---

## 14. Game feel

- **Achat réussi** : bouton flash or 150ms + compteur `counter-bump` (existe déjà) + **+1 flottant** qui monte depuis le bouton + le bâtiment apparaît sur la carte avec un petit « pop » de poussière. Son : tampon/sceau discret.
- **Achat impossible** : shake horizontal 3px/120ms du bouton + le coût manquant clignote en rouge 1×. Pas de son ou son mat.
- **Ressource qui monte** : déjà `counter-bump` ; ajouter tick visuel sur la carte ressource quand un palier d'humeur change.
- **Pulse achetable** : uniquement 1er item payable (cf. §3), respiration 2.6s.
- **Barre qui se remplit** : la barre d'ère scintille 1× au franchissement de 10% (pas en continu).
- **Palier/milestone** : `milestone-flash` existe — ajouter une chip qui « se frappe » (scale 1.3→1).
- **Nouvel âge** : bandeau plein écran 2s style fresque (nom de l'âge en Cinzel, fond de la carte qui change de palette) + entrée de journal qui change de thème **sous les yeux du joueur** (transition 1s) — moment signature.
- **Crise imminente** : désaturation progressive + fissures carte + tambour sourd à 90%.
- **Effondrement** : l'écran se fissure (réutiliser les paths SVG de `sg-cracks` en overlay), puis fondu vers la chronique. 
- **Récompense post-achat** : à chaque ×25 bâtiments, mini-pluie de particules dorées sur la ligne (500ms, une fois).

---

## 15. Recommandations priorisées

### URGENT (bugs / bloquants lisibilité)
1. **Scroll horizontal à 1366×768** — `.view` minmax trop rigides. → grilles `minmax(0,1fr)` + breakpoint 1500px. Impact : 25% des joueurs Steam. Difficulté : faible. Fichiers : `views.css` (l.1–9), `layout.css`. 
2. **`var(--orange)` / `var(--text-dim)` inexistantes** dans `CityView.jsx` (~l.401, 563) → bordures/texte invisibles. → définir les tokens ou corriger. Difficulté : triviale.
3. **Coût absent du bouton d'achat + aucun état affordable** → refonte `PurchaseRow` (§3). Impact : cœur de la boucle de jeu. Difficulté : moyenne. Fichiers : `BuildingShop.jsx`, nouveau `PurchaseRow.jsx`, CSS dédié.
4. **Textes < 11px** (topbar, chips, footers). → plancher 11px. Difficulté : faible mais diffuse.
5. **Accents manquants** (« Batiments », « Cout », « Bientot »…) : `BuildingShop.jsx`, incohérent avec le reste. Trivial.

### IMPORTANT
6. **Unifier l'or** (2 systèmes → 1 token). Fichiers : tous les CSS ; recherche/remplacement contrôlé. Impact : cohérence globale immédiate.
7. **Journal sous la boutique** (`CityView.jsx` l.717–720 : inverser l'ordre + hauteur max). Trivial, gros impact UX.
8. **BuyToolbar sticky + boutons 32px + Shift/Ctrl**. `BuyToolbar.jsx`, `components.css`.
9. **Vignette de crise progressive** au lieu du pulse binaire plein écran. `layout.css`, `App.jsx`.
10. **Cartes ressources 2 lignes + tooltip riche**. `Topbar.jsx`, `views.css`.
11. **Sortir les styles inline** de `CityView.jsx` (panneaux Atrides/Énée) vers des classes. Dette technique + cohérence.

### ESTHÉTIQUE
12. Purger le CSS mort/dupliqué (`.resource` legacy ×2 dans `components.css`, `#exhumeBtn` vs `.exhume-btn-redesigned`, `.era-card` « plus utilisée mais conservée »).
13. Radius unifiés (12 panneaux / 6 cartes-boutons / 4 tiny / 999 jauges-chips).
14. Glow : retirer des titres/panneaux, réserver à affordable/critical/milestone.
15. Onglets boutique : accent par catégorie + badge compteur d'achetables.

### CONFORT
16. ROI opt-in (tooltip « rentabilisé en… »), tri/épinglage des achetables, `tabular-nums` partout.
17. Sidebar 240px + variante 64px ; teasing des onglets verrouillés.
18. `prefers-reduced-motion`.

### POLISH
19. Icônes ressources dans coûts/production ; vignettes de bâtiments ; transition de thème du journal au changement d'âge ; effets d'effondrement (fissures plein écran).

---

## 16. Plan d'implémentation (version finale, intègre les décisions post-audit)

> Décisions intégrées : ticker à la place du panneau journal (§10), état « affordable » au niveau
> de la ligne entière, dédoublonnage des badges (`x256 atteint` + `Niv. 200`), barre de palier
> = progression vers le prochain palier (masquée au max), tooltip sur les suffixes de nombres,
> crise visible globalement à 99%.

### Phase 1 — Fondations : tokens, bugs, lisibilité
- **Objectif** : une seule source de vérité visuelle ; plus rien d'illisible ; bugs corrigés.
- **Changements** : nouvelle `variables.css` (palette §5, échelle typo §6, radius, tokens ressources) ; unification des deux ors ; plancher 11px ; `tabular-nums` global sur les valeurs ; fix `var(--orange)`/`var(--text-dim)` (CityView.jsx ~l.401/563) ; accents français (« Bâtiments », « Coût », « Bientôt », « Débloqué ») ; purge du CSS mort (`.resource` legacy ×2, `.era-card`, `#exhumeBtn`).
- **Fichiers** : `variables.css`, `base.css`, `components.css`, `views.css`, `BuildingShop.jsx`, `CityView.jsx`.
- **Risques** : remplacement de couleurs trop large → migrer token par token, vue par vue.
- **Tests** : capture avant/après de chaque vue ; `npm test` vert ; grep `#[0-9a-f]{6}` en baisse.

### Phase 2 — Layout : structure de la vue Cité
- **Objectif** : zéro scroll horizontal à toutes résolutions ; la boutique en tête de colonne droite ; le ticker remplace le journal.
- **Changements** : `.view` → `minmax(0,1fr) clamp(24rem, 34vw, 30rem)` ; breakpoint 1500px (paddings −25%, sidebar compacte) ; carte plafonnée `min(48vh, 34rem)` ; **`ChronicleTicker.jsx`** (ex-JournalPanel) en bandeau pleine largeur sous la topbar, thèmes par âge transposés, dépêche de crise persistante ; sidebar 240px.
- **Fichiers** : `layout.css`, `views.css`, `CityView.jsx`, `JournalPanel.jsx`→`ChronicleTicker.jsx`, `components.css`.
- **Risques** : hauteurs de carte dépendantes de `--work-fill`/canvas → vérifier le resize du canvas ; les 7 thèmes CSS à re-tester un par un (le state debug permet de forcer l'âge).
- **Tests** : 1920/1536/1366 sans scrollbar horizontale ; boutique visible sans scroll à 1080p ; ticker anime à chaque nouvel article ; rien n'est persisté dans la save.

### Phase 3 — Menu d'achat (`PurchaseRow`)
- **Objectif** : répondre en <1s à « que puis-je acheter, pour combien, ça rapporte quoi ? ».
- **Changements** : composant `PurchaseRow.jsx` (rangée 64px : icône | nom+prod/s | compteur fantôme | bouton 116×44 avec coût intégré) ; état `is-affordable` / `is-locked-cost` sur la **ligne** (pas seulement le bouton), coût en rouge si impayable ; badges fusionnés (un seul badge palier : `×256` doré, `Niv. 200` déplacé en compteur fantôme) ; barre de palier = progression vers le **prochain** milestone, masquée si max atteint ; `BuyToolbar` sticky en tête de panneau, boutons 32px, Shift-clic ×10 / Ctrl-clic ×100 ; onglets catégorie : accent couleur + badge « n achetables », libellés courts (Moteurs/Savoir/Infra) ; icônes de ressources dans les coûts/production ; tooltip valeur exacte sur les suffixes (Sx, Oc, Qi…) ; pulse discret sur le 1er item achetable uniquement.
- **Fichiers** : nouveau `PurchaseRow.jsx` + `purchase.css` ; `BuildingShop.jsx` (rendu seul, zéro logique), `BuyToolbar.jsx`.
- **Risques** : ids/classes consommés ailleurs (`invalidateRenderCache("buildings")`, milestone-flash) ; Babel-blocked à préserver.
- **Tests** : achat ×1/×10/×100/Max ; item Babel bloqué ; item verrouillé ; milestone flash ; tri visuel stable (pas de réordonnancement sous le curseur).

### Phase 4 — Système de boutons & états interactifs
- **Objectif** : 8 types de boutons cohérents (§4), états complets.
- **Changements** : `buttons.css` (`.btn`, `.btn-primary/-purchase/-critical/-secondary/-danger/-nav/-tiny`) ; `:focus-visible` global or ; disabled = fond grisé + `--text-disabled` (plus d'opacité seule) ; glow réservé à affordable/critical/milestone ; quick-actions sidebar en `btn-tiny` (suppression des styles inline d'`App.jsx`) ; styles inline Atrides/Énée → classes.
- **Fichiers** : `base.css`, nouveau `buttons.css`, `App.jsx`, `CityView.jsx`, migration progressive des variantes locales.
- **Risques** : spécificité de la cascade existante → migrer panneau par panneau, ne pas tout basculer d'un coup.
- **Tests** : navigation complète au clavier ; chaque état (hover/active/disabled/affordable) sur chaque type.

### Phase 5 — Topbar & communication de crise
- **Objectif** : ressources scannables en un regard ; la crise se ressent dans toute l'UI, progressivement.
- **Changements** : cartes ressources 2 lignes (valeur 22px + flux signé ▲▼), descriptions/humeurs déplacées en tooltip riche, jauge de réserve en filet 3px bas de carte ; 6e carte → bandeau d'état distinct (Âge + Usure + paliers sédiment) ; **une seule barre de rupture canonique** (en-tête de cité) avec graduations 25/50/75/90 et tooltip `pressureBreakdown()` ; vignette `crisis-danger` remplacée par désaturation + vignette statique = f(instabilité), pulse uniquement >90% ; fissures/teinte rouge dans la carte de ville >75%.
- **Fichiers** : `Topbar.jsx`, `views.css`, `layout.css`, `App.jsx`, `CityMapCanvas.jsx`/`renderWorld.js` (teinte).
- **Risques** : perfs du filtre plein écran (utiliser `filter` sur un overlay, pas sur `.app` entier qui contient le canvas).
- **Tests** : forcer instabilité 0/30/60/80/95 via debug ; vérifier lisibilité du texte sous désaturation.

### Phase 6 — Responsive & accessibilité
- **Objectif** : 1366 natif, tablette utilisable, conformité de base.
- **Changements** : sidebar 64px icônes <1500px ; tablette 1 colonne (topbar sticky compacte, carte repliable, boutique pleine largeur) ; `prefers-reduced-motion` coupe shine/pulses/scanlines ; contrastes muted ≥4.5:1 ; cibles ≥32px ; tooltips accessibles au focus.
- **Fichiers** : `layout.css`, `views.css`, `App.jsx`, media queries 1500/1200/980/768.
- **Tests** : parcours complet à 1366×768 et 1024×768 ; axe-core ou Lighthouse a11y ≥ 90.

### Phase 7 — Polish & game feel
- **Objectif** : satisfaction tactile, moments signature.
- **Changements** : feedbacks d'achat (+1 flottant, flash 150ms, pop sur la carte, shake si impossible) ; bandeau de changement d'âge (2s, fresque) + mutation du thème du ticker sous les yeux du joueur ; vignettes de bâtiments dans la boutique (lien carte↔boutique) ; ROI opt-in (« rentabilisé en ~Xm ») ; effets d'effondrement (fissures plein écran réutilisant `sg-cracks`) ; sons UI (tampon achat, télex dépêche).
- **Fichiers** : `purchase.css`, `ChronicleTicker.jsx`, `CityMapCanvas.jsx`, `OptionsDialog.jsx` (toggles ROI/sons).
- **Risques** : surcharge d'animations → respecter la règle « 2 animations infinies max visibles » ; perfs canvas en cycle long.
- **Tests** : session de 30 min en late game (200+ bâtiments), FPS stable, fatigue visuelle subjective.

### Ordre et dépendances
`P1 → P2 → P3` forment le cœur (chacune dépend de la précédente). `P4` peut chevaucher P3.
`P5` et `P6` sont indépendantes entre elles. `P7` en dernier, par petites touches.
Critère de passage : captures avant/après archivées + `npm test` vert + zéro régression fonctionnelle.

---

## 17. Erreurs à éviter
- Ne pas réordonner la liste d'achats en continu sous le curseur (mis-clics).
- Ne pas ajouter de glow « partout où c'est joli » — c'est l'état actuel.
- Ne pas descendre sous 11px pour gagner de la place : couper de l'info à la place.
- Ne pas multiplier les barres de progression de sens différents (possession ≠ progression ≠ jauge).
- Ne pas garder deux sources de vérité pour la rupture.
- Ne pas styler dans le JSX : tout état visuel = classe.
- Ne pas animer en infini ce qui n'est pas un danger actif.
