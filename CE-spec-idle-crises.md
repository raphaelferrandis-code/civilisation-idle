# CE — Spec : Doctrine de crise automatique + Gain idle

> Spec d'implémentation pour deux chantiers liés, validés en design :
> 1. **Doctrine de crise** — automatiser les choix de crise aux paliers 25/50/75 % + l'effondrement, configurable, débloqué en **ruines**.
> 2. **Gain idle** — pendant l'absence, la cité **continue sa production normale** ; l'**Usure est conservée** (deadline + bonus de ruines).
>
> **Décisions actées** : 3 postures simples · « Conseil de crise » débloque **les 3 paliers d'un coup** · Rupture **gelée** en idle sans automatisation · **gain idle = production capée en temps** (2 h gratuit + paliers ruines « Veilleurs de nuit »), **Usure couplée au même cap** · automatisation = **confort bon marché** (farm multi-effondrement = **v2**, adossé à l'auto-achat Héphaïstos).
>
> **Périmètre v1** : §A (doctrine de crise) + §B sauf B.5 + cap idle paliers. Le farm AFK (B.5) est explicitement v2.

---

## 0. État des lieux (code actuel)

| Mécanique | Aujourd'hui | Réf |
|---|---|---|
| Events 25/50/75 % | **Dialogue modal bloquant** (`setGamePaused(true)` + choix) | [crisis.js:83](src/game/core/actions/crisis.js:83) |
| Auto-régulation | `protocoles_urgence` : Rationner@65 % / Recensement@82 %, cooldown 60 s | [tick.js:202](src/game/core/actions/tick.js:202) |
| Auto-effondrement | `intendant`/`conseil`/`memoire` : 3 tiers fixes (10/6/3 min, 55/80/100 %) | [main.js:149](src/game/core/main.js:149) |
| Hors-ligne | `applyElapsedWear` : **avance UNIQUEMENT l'Usure** (×0,35, cap 6 h), zéro prod | [main.js:131](src/game/core/main.js:131) |
| Tick | `setInterval` 1 s, delta **clampé à 1 s** → pas de rattrapage | [main.js:331](src/game/core/main.js:331) |

**Problème** : le hors-ligne est *net négatif* (la cité vieillit sans rien produire), et les crises bloquent le jeu. Aucune progression idle réelle avant GR1.

---

## A. Doctrine de crise configurable

### A.1 Modèle de données

Nouveau champ dans `state` (cf. [state.js defaultState](src/game/core/state.js)) :

```js
crisisDoctrine: {
  p25: "ask",          // "ask" | "stabiliser" | "temporiser"
  p50: "ask",
  p75: "ask",
  autoCollapse: {
    enabled: false,
    trigger: "rupture100",   // "rupture100" | "usure" | "temps"
    usureThreshold: 0.9,     // si trigger === "usure"
    timeSeconds: 600,        // si trigger === "temps"
    prepare: true            // tente Rationner/Réformes avant d'effondrer
  }
}
```

Hydratation défensive dans `hydrateState` (valeurs par défaut si absent → saves existantes intactes).

### A.2 Tag de posture sur les events

Chaque option de [`CRISIS_POOL`](src/game/data/world.js:204) reçoit un champ `stance` :
- `"stabiliser"` → l'option qui **réduit** la Rupture (`instability *= 0.9x`), paie en ressources.
- `"temporiser"` → l'option économe qui **laisse monter** la Rupture (`instability *= 1.1x`).

Passe data unique sur ~15 events (les deux options sont déjà clairement l'une « − Rupture », l'autre « + Rupture »). L'event aléatoire à pari (`whisper_campaign`) : on tague l'option déterministe comme `stabiliser`, le pari comme `temporiser`.

> **Garde-fou dev-only** (même esprit que [world.js:518](src/game/data/world.js:518)) : en DEV, vérifier que chaque event a exactement une option `stabiliser` et une `temporiser`.

### A.3 Résolution automatique

Dans [`checkCrisisThresholds`](src/game/core/actions/crisis.js:70), avant `openCrisisEvent` :

```js
const palier = slot.id === "_25" ? "p25" : slot.id === "_50" ? "p50" : "p75";
const stance = state.crisisDoctrine?.[palier];
if (stance && stance !== "ask" && crisisAutomationUnlocked()) {
  const event = pickCrisisEvent(slot.threshold);
  state.recentCrisisIds = [...].slice(-7);
  autoResolveCrisisEvent(event, stance);  // PAS de pause, PAS de dialogue
  return;
}
// sinon : comportement actuel (dialogue bloquant)
```

`autoResolveCrisisEvent(event, stance)` : sélectionne l'option dont `stance` correspond (fallback `options[0]`), exécute son `apply()`, clamp l'instabilité, log discret dans la Chronique. **Aucun `setGamePaused`.**

### A.4 Auto-effondrement configurable

Généraliser [`checkAutoCollapse`](src/game/core/main.js:149) pour lire `state.crisisDoctrine.autoCollapse` au lieu des 3 tiers en dur :
- `trigger === "rupture100"` → effondre quand crise terminale ouverte (comportement intendant actuel).
- `trigger === "usure"` → effondre dès `timeWear >= usureThreshold`.
- `trigger === "temps"` → effondre après `timeSeconds` de cycle.
- `prepare` → tente Rationner/Réformes avant (logique tiers 2-3 actuelle).

Les 3 upgrades existants (`intendant`/`conseil`/`memoire`) sont **remplacés** (cf. A.5) ; leur logique migre dans ce bloc paramétré.

### A.5 Refonte des upgrades ruines

On remplace `intendant_de_crise` / `conseil_de_regence` / `memoire_institutionnelle` ([upgrades.js:1107](src/game/data/upgrades.js:1107)) par **deux** upgrades clairs (branche « Rupture » du prestige) :

| id | nom | coût | unlockCycles | débloque |
|---|---|---|---|---|
| `conseil_de_crise` | Conseil de crise | **8 ruines** | 2 | l'auto des **3 paliers** (postures `stabiliser`/`temporiser` configurables) |
| `edit_effondrement` | Édit d'effondrement | **15 ruines** | 3 | l'**auto-effondrement** configurable (A.4) |

> **v1** : ces deux upgrades sont du **confort** (plus de blocage modal, banque l'effondrement mûr au retour), PAS un farm — d'où le prix modeste. Le vrai farm AFK (auto-achat) est repoussé en v2, adossé à l'héritage **Héphaïstos** (post-GR1). L'axe de **progression idle** vit dans le cap de temps (§B.3).

Justification du coût : §D. Migration des saves : si un joueur possédait `intendant`/`conseil`/`memoire`, lui octroyer `conseil_de_crise` + `edit_effondrement` à l'hydratation (pas de régression).

> `protocoles_urgence` (légitimité) : on le **garde** comme auto-régulation hors-paliers (Rationner@65/Recensement@82), il est complémentaire. Option : le replier plus tard dans la doctrine, hors scope v1.

---

## B. Gain idle : prod continue, Usure conservée

### B.1 Le chokepoint unique

Reload et retour d'onglet caché passent **tous deux** par [`applyElapsedWear`](src/game/core/main.js:131) (via [`applyOfflineProgress`](src/game/core/main.js:145) et [`handleVisibilityChange`](src/game/core/main.js:356)). On y branche tout le rattrapage.

### B.2 Nouvelle fonction `applyOfflineProgress(elapsedSeconds)`

Pseudocode :

```
elapsed = clamp(elapsedSeconds, 0, idleCapSeconds())   // CAP = paliers ruines (B.3)
if (elapsed <= 10 || collapseInProgress || state.crisisLimitAnnounced) return

// 1. PRODUCTION (nouveau) — la cité continue à produire, au taux courant
const r = rates()                         // snapshot au taux courant
state.population = state.population.add(r.population.mul(elapsed))   // Decimal
state.food       = state.food.add(r.food.mul(elapsed))
... (gold, knowledge, infrastructure)

// 2. USURE (conservée) — MÊME `elapsed` que la prod → prod et vieillissement
//    couplés au même cap. Au-delà du cap : tout gèle (ni prod, ni Usure).
state.timeWear = clamp(timeWear + timeWearRate() * elapsed, 0, 1)

// 3. RUPTURE
if (crisisAutomationActive()) {
  simulateAwayCrises(elapsed)             // rejoue Rupture + doctrine (B.5)
} else {
  // pas d'automatisation → Rupture GELÉE (décision actée) : rien
}

// 4. Résumé "pendant ton absence" (log/popup)
```

> **Couplage Usure↔prod (important)** : l'Usure utilise le **même `elapsed` clampé** que la production. Donc pendant la fenêtre, la cité produit *et* vieillit ; au-delà du cap, **tout gèle**. On supprime l'ancien `×0,35` et le cap 6 h indépendant de [`applyElapsedWear`](src/game/core/main.js:131) : c'est la source du ressenti punitif (vieillir plus que produire). Résultat : on revient sur une cité **plus riche ET plus mûre** (dans la limite du cap) → prête pour un bel effondrement.

> **Intégration linéaire** suffit en v1 (bâtiments constants hors-ligne → `rates()` ~stable). La simu par pas grossiers (B.5) ne sert que si l'automatisation enchaîne des effondrements.

### B.3 Le cap idle = l'axe de progression (paliers ruines)

Le cap de temps crédité est **gratuit à 2 h pour tous** (corrige « ferme l'onglet → rien » dès la minute zéro), puis étendu par des upgrades de ruines « Veilleurs de nuit ». **Pas besoin de scaler le cap par ère** : le rendement idle scale déjà ~×13/ère tout seul (§F), donc on ne vend que des *heures*.

| upgrade | coût | cap idle |
|---|---|---|
| *(base, gratuit)* | — | **2 h** |
| `veilleurs_nuit_1` | 8 ruines | 4 h |
| `veilleurs_nuit_2` | 40 ruines | 8 h |
| `veilleurs_nuit_3` | 200 ruines | 12 h |
| `veilleurs_nuit_4` | 1 500 ruines | 24 h |

`idleCapSeconds()` = `2h` + somme des paliers possédés. Coûts calés sur l'échelle existante des upgrades de ruines (1→90→…) ; **non cassé** car 2 h idle ≤ 2 h de jeu actif (rendement = taux courant × cap, cf. §F).

### B.4 Rupture gelée (sans automatisation) — le cas par défaut

La cité **produit + vieillit** mais la jauge de Rupture **ne bouge pas** pendant l'absence. Au retour, tu trouves une cité plus riche et plus vieille (Usure ↑ → `sedimentMod` ↑ dans [ruinGain](src/game/core/mechanics/prestige.js:99)) → **effondrement manuel juteux**. Agence préservée, aucune crise ne « se passe » sans toi.

### B.5 Farm multi-effondrement (avec automatisation) — `simulateAwayCrises(elapsed)` — ⚠️ v2

Si `conseil_de_crise` **et** `edit_effondrement` actifs : on rejoue le temps d'absence par **pas grossiers** (ex. `STEP = 30 s`), en réutilisant la vraie logique :

```
remaining = elapsed; collapses = 0
while (remaining > 0 && collapses < OFFLINE_MAX_COLLAPSES) {
  step = min(STEP, remaining); remaining -= step
  tick(step)                            // prod + Usure + Rupture + doctrine auto (A.3)
  if (crisisOpen()) {                   // terminal (Rupture 100 % ou Usure)
    bankRuins(ruinGain())               // crédite les ruines
    completeCollapse(...)               // reset cycle, garde ruines/héritages
    collapses++
  }
}
```

- `OFFLINE_MAX_COLLAPSES` = cap (ex. **20**) → borne perf + équilibre (pas de farm infini sur une absence de 3 jours).
- Le `STEP` grossier reste correct car la prod est dominée par les bâtiments (constants) et la Rupture dérive lentement.
- **Ne fonde PAS de dynastie automatiquement** (la fondation reset la cité + choix de doctrine = décision joueur). Les ruines s'**accumulent** ; le joueur fonde/GR à son retour.

> **⚠️ Finding mesuré (sim) — pourquoi ce farm est v2, pas v1.** L'auto-effondrement seul **ne farme quasi rien** : (1) une cité bien gérée stabilise sa Rupture sous 100 % et **ne tombe jamais seule** (mesuré : 3 effondrements réels sur 20 cycles ; une cité monte à 38M hab sans chuter) ; (2) **sans auto-ACHAT, la cité est vide après chaque chute** → ne rebâtit pas → le farm s'essouffle au 1er cycle. Un vrai farm AFK exige donc **auto-achat (rebuild)** + un **trigger forcé** (`temps`/`usure` plutôt que `rupture100`). L'auto-achat = héritage **Héphaïstos** (post-GR1) → ce bloc B.5 attend la v2. En **v1**, `edit_effondrement` sert juste à **banquer l'unique effondrement mûr** quand on revient.

### B.6 Boucle idle résultante

| Le joueur possède… | En fermant / laissant en fond, il retrouve… |
|---|---|
| Rien (cap 2 h gratuit) | cité qui a **produit** + vieilli (sediment ↑) → effondrement manuel juteux |
| `conseil_de_crise` | + crises **auto-résolues** (plus de blocage modal) |
| + `edit_effondrement` | + **l'effondrement mûr auto-banqué** au retour (pas un farm continu — cf. B.5) |
| Paliers « Veilleurs de nuit » | + **cap d'absence étendu** (2 h → 24 h) = l'axe de progression idle |
| **v2** : auto-achat (Héphaïstos) | + **farm multi-effondrement** réel (≤ `OFFLINE_MAX_COLLAPSES`) |

---

## C. Invariants à préserver

1. **Anti-immortalité** : l'Usure reste la deadline garantie ([TIME_WEAR_MITIGATION_CAP=5](src/game/core/balance.js:213)). Le farm idle ne doit pas geler l'Usure (B.2 étape 2 la fait avancer).
2. **Golden master** : `rates()`/`ruinGain()` inchangés → tests [economy.golden.test.js](src/game/core/__tests__/economy.golden.test.js) intacts. On n'ajoute que des *consommateurs* de ces formules.
3. **Saves existantes** : `crisisDoctrine` hydraté avec défauts ; migration intendant→conseil (A.5).
4. **Decimal** : les ressources sont Decimal → l'accumulation B.2 utilise `.add()`/`.mul()`, pas `+`.
5. **Pas de farm en crise terminale déjà ouverte** : si `crisisLimitAnnounced` au départ, pas de rattrapage prod (B.2 garde).

---

## D. Coût en ruines — validé par simulation

Revenu de ruines en début de partie : **~2-5 ruines/cycle** (cf. [balance.js:231](src/game/core/balance.js:231)). Échelle des upgrades précoces : 1 / 2 / 2 / 5 / 6 / 7 / 8 / 12… ([upgrades.js:54](src/game/data/upgrades.js:54)).

**Confort de crise** (QoL, pas farm — d'où le prix bas) :
- **`conseil_de_crise` = 8 ruines** (unlockCycles 2) → atteignable **cycle ~2-3**, après 1-2 crises subies manuellement.
- **`edit_effondrement` = 15 ruines** (unlockCycles 3) → banque l'effondrement mûr au retour.

**Cap idle « Veilleurs de nuit »** (l'axe de progression, §B.3) : 8 / 40 / 200 / 1 500 ruines pour 4h / 8h / 12h / 24h. Calés sur l'échelle existante des upgrades de ruines.

**Validation sim** (`sim-idle-impact.js`, 20 cycles) : cumul de **12 ruines atteint au cycle 3** (~78 min virt.), **42 au cycle 7** (~3 h). → `conseil_de_crise` (8) tombe vers le cycle 2-3, le 1er palier de cap (8) idem : automatisation + premier cran d'idle accessibles dans la **première session**, sans être gratuits dès la minute 0. ✅

---

## E. Plan d'implémentation

1. **Data** : tag `stance` sur `CRISIS_POOL` + garde-fou dev (A.2).
2. **State** : `crisisDoctrine` dans `defaultState` + hydratation + migration (A.1, A.5).
3. **Upgrades** : remplacer les 3 upgrades par `conseil_de_crise` + `edit_effondrement` (A.5).
4. **Crise** : `autoResolveCrisisEvent` + branchement `checkCrisisThresholds` (A.3).
5. **Effondrement** : généraliser `checkAutoCollapse` (A.4).
6. **Cap idle** : upgrades `veilleurs_nuit_*` + `idleCapSeconds()` (B.3).
7. **Idle** : réécrire `applyOfflineProgress` (prod + Usure couplées au cap, B.2). `simulateAwayCrises` (B.5) = **v2**.
8. **UI** : panneau « Doctrine de crise » (3 sélecteurs de posture + config auto-effondrement) — débloqué par les upgrades.
9. **Tests** : auto-résolution sans pause ; idle crédite la prod ; Usure avance et **gèle au cap** ; saves migrées.

> **Périmètre v1** = étapes 1-8 sauf `simulateAwayCrises`. Le farm multi-effondrement (B.5) + son auto-achat sont **v2**.

---

## F. Simulation d'impact — résultats

Script [`sim-idle-impact.js`](sim-idle-impact.js) (20 cycles, vraies formules). Aujourd'hui le gain idle = **0** (l'Usure avance, rien ne produit).

**Rendement idle = production × cap, par ère** (mesuré) :

| Ère | prod/s | 2 h (gratuit) | 4 h | 8 h | 12 h | 24 h |
|---|---|---|---|---|---|---|
| Clans (3) | 82,5 K | 594 M | 1,19 B | 2,38 B | 3,56 B | 7,13 B |
| Maîtrise du bois (4) | 376 K | 2,71 B | 5,41 B | 10,8 B | 16,2 B | 32,5 B |
| Hameau (5) | 1,64 M | 11,8 B | 23,6 B | 47,2 B | 70,8 B | 141,6 B |

- Le rendement **scale ~×13 par ère** → un cap en *heures* s'auto-adapte ; inutile de scaler le cap par palier d'ère.
- **Non cassé** : 2 h idle = exactement 2 h de prod active (rendement = taux courant × temps) → le cap n'excède jamais le jeu actif, il évite juste de *perdre* le temps.

**Ruines idle** (confirme que B.5 est v2) : ~62 ruines/effondrement réel, mais **3 effondrements sur 20 cycles** seulement (cités stables) → l'auto-effondrement seul ne farme pas. Cf. finding B.5.

**Atteignabilité des coûts** : 12 ruines cumulées @ cycle 3, 42 @ cycle 7. Valide §D.
