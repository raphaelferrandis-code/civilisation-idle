# Refonte ISO v2 — état & reprise

> **Branche : `iso-v2`** · doc de reprise (un autre PC, plus tard).
> Objectif : remplacer le rendu de carte par une **cité isométrique en pixel art**
> (réfs type *Pocket City*), en gardant TOUTE la logique de jeu. Reskin pur.

## TL;DR — où on en est (2026-06-23)

- Le **moteur iso** (PixiJS v8) est **greffé sur `main` à jour** (branche `iso-v2`),
  derrière un **feature flag**. Sans flag → ta carte actuelle (fallback intact).
- **Palier T2 (Antique/marchand) complet** : **15 familles de bâtiments** en sprites
  pixel art (générés via PixelLab), + **sol** (tuile) + **routes** (quadrillage) →
  **ça rend comme une vraie petite ville**.
- Tout est **automatisé** : génération PixelLab → téléchargement (Node) → `public/iso/`
  → affichage. 33 tests verts.

## Lancer sur un nouveau PC

```bash
git clone https://github.com/raphaelferrandis-code/civilisation-idle.git
cd civilisation-idle
git checkout iso-v2
npm install            # installe pixi.js (ajouté sur cette branche)
npm run dev            # http://localhost:5173 (ou le port affiché)
```
Puis ouvre le jeu avec **`?iso=1`** (ex. `http://localhost:5173/?iso=1`) — ou en console :
`localStorage.setItem('ce:iso','1')` puis recharge. Sans ça = ancienne carte.

> En **onglet au premier plan**, la boucle de jeu tourne et la cité iso se remplit au
> fur et à mesure des achats. La carte est vide tant qu'on n'a pas de bâtiments.

### Re-brancher PixelLab (MCP) sur le nouveau PC

Nécessaire seulement pour **générer** de nouveaux sprites (pas pour jouer).
1. Installer le CLI : `npm install -g @anthropic-ai/claude-code`
2. `claude mcp add pixellab https://api.pixellab.ai/mcp -t http -H "Authorization: Bearer <TA_CLE>"`
   (`-s user` pour le rendre dispo partout). **La clé est un secret** — récupère-la sur
   ton compte PixelLab (page « Vibe Coding AI Toolkit »). Ne pas la committer.
3. Redémarrer Claude Code. Vérifier : `claude mcp list` (doit montrer `pixellab`).

## Architecture (fichiers clés)

| Fichier | Rôle |
|---|---|
| `src/game/render/cityRenderModel.js` | `getCityRenderModel(state)` — **fonction pure** état → modèle de rendu (le seul tuyau store→rendu) |
| `src/game/render/buildingKinds.js` | 30 bâtiments → **15 familles visuelles** (`kindOf`) |
| `src/game/render/eraTiers.js` | ~45 ères → 10 bandes → **5 paliers visuels** T1..T5 |
| `src/game/render/iso/featureFlag.js` | `?iso=1` / `localStorage ce:iso=1` |
| `src/game/render/iso/isoProjection.js` | maths iso. **TILE_W=128, TILE_H=64** |
| `src/game/render/iso/isoCamera.js` | pan + zoom |
| `src/game/render/iso/cityLayout.js` | placement : `computeCityGrid()` (rues + bâtiments le long des rues) |
| `src/game/render/iso/tileStyle.js` | table **type × palier** ; `tileKey(kind,tier)` = clé de sprite (ex. `market_t2`) |
| `src/game/render/iso/isoScene.js` | scène Pixi : sol, routes, sprites bâtiments + **chargeur de sprites/fallback greybox** |
| `src/game/render/iso/IsoCityCanvas.jsx` | hôte React du canvas ; pose `window.__iso` |
| `src/components/views/CityView.jsx` | câblage : `isoRenderEnabled() ? <IsoCityCanvas/> : <CityMapCanvas/>` |

**Sprites** : `public/iso/<famille>_t<palier>.png` (+ `ground_t<palier>.png`).
Si le PNG existe → affiché ; sinon **boîte greybox** de secours. Convention dans
`public/iso/README.md`.

### Modèle de rendu attendu (pour tester sans jouer)
`window.__iso` expose `setModel`, `setTierOverride`, `groundLayer`, `buildingsG`, `camera`.
```js
window.__iso.setModel({ era:{tier:{index:2}}, instability:0.1, population:50000,
  buildings:[{id:'markets',kind:'market',count:4},{id:'ancestral_cult',kind:'temple',count:3}, ...] });
window.__iso.setTierOverride(2);            // force le palier visuel
window.__iso.setModel = () => {};           // GÈLE (sinon la boucle de jeu réécrase, cf. gotchas)
```

## Direction artistique (figée)

- **Style** : pixel art **épuré** (pas réaliste). PixelLab : `detail=low`, `shading=basic`,
  `outline=single color`. Palette gardée (« très bien » côté user).
- **Couleurs par âge** : **clair/lumineux aux premières ères → sombre aux dernières**.
- **Méthode** : bâtiments = **`create_map_object`** (vue `high top-down`, plus de présence) ;
  sol/eau = **`create_isometric_tile`**. Largeur normalisée à `TILE_W` côté moteur ;
  **hauteur par famille** (générée) → tailles relatives cohérentes (marché < temple).
- **Ancre** : bas-centre. **Lumière** : haut-gauche.

## Pipeline de génération (automatisé)

1. Générer : MCP `create_map_object` / `create_isometric_tile` → renvoie un ID.
2. Attendre/relever : `get_map_object` / `get_isometric_tile`. ⚠ PixelLab **rate-limite
   à ~5 générations/rafale** → générer par vagues.
3. Télécharger : `node scripts/fetch-sprite.mjs <download_url> public/iso/<nom>.png`
   (Node, **PAS** PowerShell — cf. gotchas). URL = `.../map-objects/<id>/download` ou
   `.../isometric-tile/<id>/download`. IDs T2 dans `scripts/_t2-jobs.json`.

## ⚠️ Gotchas (importants)

- **Windows Defender / ClickFix** : un `Invoke-WebRequest` PowerShell qui télécharge depuis
  le web déclenche un **faux positif** « Trojan:Win32/ClickFix » et **bloque powershell**.
  → **Toujours télécharger via `scripts/fetch-sprite.mjs` (Node)**, jamais via PowerShell.
- **La boucle de jeu écrase l'injection debug** : en 1er plan, le jeu re-pousse le vrai
  `getCityRenderModel` via `setModel`. Pour figer pendant un test : `window.__iso.setModel = ()=>{}`.
- **Vite renvoie `index.html` (200) pour un PNG absent** (pas 404) → le chargeur vérifie le
  `content-type` avant de décoder.
- **TDZ** : `buildGround()` doit être appelé APRÈS la déclaration de `const texCache`.

## Inventaire `public/iso/` (palier T2)

15 bâtiments + sol : `food, granary, farm, market, craft, mill, port, mint, bank,
knowledge, temple, observatory, civic, aqueduct, watchtower` (`_t2.png`) + `ground_t2.png`.

## TODO / prochaines étapes

- [ ] **Reprise 1-à-1 des bâtiments** : `watchtower` trop sombre (éclaircir) ; uniformiser
      bases/ancrage (léger flottement = padding transparent → envisager un trim) ; recaler
      1-2 échelles. Régénérer chaque famille (seed + référence de style pour la cohérence).
- [ ] **Peaufiner la ville** : style des routes (liseré/passages), **place/forum central**,
      décors (arbres/fontaines/lampes) sur les îlots vides, 2-3 variantes de sol.
- [ ] **Brancher sur la vraie carte** : aujourd'hui validé en démo via `__iso.setModel` ;
      vérifier le rendu en jeu réel (la boucle pousse déjà le modèle).
- [ ] **Eau** (tuiles iso) + intégration fleuve.
- [ ] **Autres paliers** T1 / T3 / T4 / T5 (15 familles chacun) — même pipeline.
- [ ] Agents (citoyens) en sprites animés (PixelLab `create_character`), plus tard.

## Historique annexe (hors iso)
`docs/FREELANCE-BRIEF.md`, `DEV-ONBOARDING.md`, `INVENTAIRE-RENDU.md`,
`PREMIER-ENTRETIEN.md`, `BRIEF-ART-FIVERR.md` = exploration « embaucher un dev/artiste »
(budget 500 €), **abandonnée** au profit du DIY PixelLab ci-dessus. Gardés pour archive.
