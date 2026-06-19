# Reprise — Refonte visuelle du fleuve (2026-06-19)

Point d'étape pour reprendre sur un autre poste. Tout est **commité et poussé sur `main`**.
Après `git pull`, lancer `npm install` puis `npm run dev`.

---

## Ce qui a été fait aujourd'hui (validé)

Refonte du fleuve de la vue Cité, en 4 temps. **Tout est livré, lint/build/tests OK, validé visuellement.**

### 1. Couleur de l'eau — `src/game/map/renderWorld.js` (`cityMapDrawRiver`, ~l.460)
- Le bleu « électrique » `#2a5a8b` → **ardoise bleu-nuit désaturée** : `edge #1a2e3a`, `mid #2c4a5e` (accordée à la palette UI `--surface-raised`).
- États **usé** (vert stagnant) et **effondrement** (noir) **inchangés** (teintes de déclin volontaires).

### 2. Fleuve élargi + serpentant — `src/game/map/layout.js` (~l.780-795)
- Largeur : `hw = 2.0 + 1.1*sin(πu)` (avant `1.5 + 0.5*sin`). Plus large, et le contraste bord→centre est accentué → « le fleuve s'ouvre devant la ville ». **Universel** (recalculé à chaque layout).
- Méandre : amplitude des waypoints `×N*0.32` (avant `×0.22`). **Nouvelles parties seulement** (le tracé `riverWP` est figé dans les sauvegardes).
- L'effilement des bouts a été **tenté puis retiré** au profit du clamp caméra (cf. ci-dessous).

### 3. Caméra bornée — `src/game/map/cityMapRuntime.js` (`cmClampCamera`, appelée chaque frame après `cityMapEnsureLayout`)
- Borne la caméra à une **boîte** : X = étendue du fleuve (`samples[0].x`…`samples[last].x`, marge 3 tuiles), Y = grille `[0,N]` + **½ grille** de nature de chaque côté.
- Plancher de zoom = `max(cw/boxW, ch/boxH)` → on ne voit jamais le bout net du ruban ni la nature infinie.
- **Réglages** : la marge verticale = le `0.5` des lignes `by0 = -0.5*N*T` / `by1 = (N+0.5*N)*T` (monter pour plus de dézoom, baisser pour serrer) ; marge X = `3*T`.

### 4. Quais (berges construites) — `src/game/map/renderWorld.js`
- **Principe clé** (ce qui ratait avant) : le quai **suit le ruban lisse** (`samples` + `cmRiverNormalAt`), **jamais par cellule** — le `bankSet` diverge du bleu peint dans les courbes (cf. mémoire `map-water-placement.md`) → escalier garanti si tile-based.
- `ensureQuayGate()` : gating « berge urbaine ? » via `L.roadSet` (8-voisinage), **caché par layout** (`CM.quayGate` clé `layoutRecomputeAt`, + `CM.quayBankCells`). Pur (urbain/non), la décision de dessiner dépend de l'ère/usure par frame.
- `cityMapDrawQuays(now)` : promenade **multi-strates** (surface + ombre côté eau + lèvre humide + liseré terre) suivant le ruban, **effilée** aux bouts ; mobilier (lampes/bornes, **chaudes la nuit**), joints de dalles, bord lumineux néon/cosmique. Appelée juste **après `cityMapDrawRiver`**, avant la brume/bateaux/blit statique (ponts/bâtiments la recouvrent gratuitement).
- Roseaux supprimés sous le quai (boucle roseaux de `cityMapDrawRiver`, via `CM.quayBankCells`).
- **Mise en scène par ère** (table `st` dans `cityMapDrawQuays`) :
  | band | look |
  |---|---|
  | 0-1 | rien (campement) |
  | 2-3 pierre | promenade pierre chaude + joints + lampes chaudes |
  | 4 marbre | promenade marbre pâle |
  | 5 fonte | béton + garde-corps métal |
  | 6 néon | béton froid + liseré néon cyan |
  | 7-9 cosmique | surface d'énergie + bord d'eau lumineux (couleur d'ère) |
- **Réglages** : la table `st` (couleurs / `W` largeur) en tête de `cityMapDrawQuays`.

---

## Vérification effectuée
- `npx eslint` (renderWorld + cityMapRuntime) : OK
- `npx vite build` : OK
- `npx vitest run` : 117/117 OK
- Visuel : eau, largeur/méandre, clamp caméra (X+Y) vérifiés en preview ; quais **pierre (band 3)** et **cosmique (band 8)** vérifiés via rendu forcé temporaire (reverté).

### Gotcha preview (à savoir)
- Le preview démarre à l'ère 0 → **pas de quai** (band ≤ 1, voulu). Les quais n'apparaissent qu'à partir de la pierre, là où des **routes longent le fleuve**.
- Injecter des ressources via le debug (taper `debug` → « Ressources late ») fait **monter la population mais pas l'ère**, et déclenche des crises en boucle → mauvais banc de test. Les ères se vérifient mieux dans une vraie sauvegarde avancée.

---

## TODO / pistes pour la suite

### Finitions quais (si besoin)
- Affiner les palettes/largeurs par âge (seuls pierre + cosmique ont été regardés de près). Tout est dans la table `st`.

### Le menu « fleuve qui traverse la ville » — reste à faire (déjà cadré)
1. ~~Quais~~ ✅ (fait)
2. **Reflets de la ville sur l'eau la nuit** (traînées de lumière chaude sous les bâtiments riverains, clippées au ruban comme la brume). Fort impact, rendu pur.
3. **Ponts = monuments + trafic** : ponts éclairés la nuit, pont historique élargi/cintré, charrettes/piétons qui traversent visiblement.
4. ~~Élargir + serpenter~~ ✅ (fait)
5. **Sillages des bateaux + bateaux liés au port** (`drawShips` dans `agents.js` ; compte `wantShips` dans `cityMapRuntime`).
6. Liseré de rive mouillée (polish).
7. **La ville épouse le fleuve** (biais d'urbanisation vers la rive — `buildAnchors` dans `cityPlan.js` pousse déjà l'agricole).

### Dette de fond
- **Tokeniser les couleurs de la carte** (le vrai « connecter la carte à l'UI ») : les hex du canvas (eau, verts d'arbres) vivent hors du système de tokens `variables.css`. Centraliser dans `eraThemes.js` / tokens partagés pour que carte et UI bougent ensemble.

---

## Note sur ce commit
- Le commit du fleuve embarque aussi une **WIP pré-existante** non liée (statut cité, nom de cité procédural `cityName.js`, ajustements crise/état) — sauvegardée pour ne rien perdre en changeant de poste.
- `kenney_isometricPrototypeTiles/` (5 Mo, reliquat de l'expérience iso annulée) est **gitignoré** (même convention que les assets Kenney source, hors versionnement).
