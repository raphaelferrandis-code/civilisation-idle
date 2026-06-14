# Rapport — Refonte de la Rupture : reculer & ralentir la progression

> Suite de [`RAPPORT-REGULATION-TENSIONS.md`](RAPPORT-REGULATION-TENSIONS.md) et de
> [`rupture-impact.md`](../rupture-impact.md). **Aucun code modifié** — ce document est
> un plan de conception chiffré et relié aux symboles existants, prêt à implémenter.
>
> **Demande à l'origine :** « Les foyers et leviers ne font que *baisser la jauge*,
> jamais *ralentir voire reculer la progression*, ce qui est frustrant surtout en début
> de run. Je veux que certains systèmes — foyers, achat d'infrastructure, réduction du
> trésor — permettent de reculer/ralentir durablement. » + « Que la gestion de crise soit
> **la plus impactante quand elle est bien jouée**. »

---

## ✅ État d'implémentation — Phase 1 LIVRÉE (Levier A : `foyerReform`)

Le recul **durable** des foyers est implémenté et vérifié. Calibration **mesurée** par
[`scratch/measure-foyers.js`](../scratch/measure-foyers.js) (cible `pressureBreakdown().total`,
4 foyers réformés au plafond) :

| Échelle | Cible nue | Réformée (max) | Réf + apais. (max) | Invariant |
|---|---|---|---|---|
| early | 0.201 | **0.018** | 0.018 | foyer éteint, **durable** |
| mid | 0.861 | **0.436** | 0.436 | divisé par ~2 |
| late | 1.607 | **1.016** | 1.016 | **≥ 1.0 → effondrement garanti** ✓ |

« Réf + apais = Réformée » prouve l'anti-immortalité : réforme et apaisement **partagent**
le plafond `FOYER_RELIEF_CAP` (0.45) → la réduction combinée d'un foyer ne dépasse jamais ce
que l'apaisement seul atteignait déjà. La réforme n'élève donc pas le plafond : elle rend le
recul **permanent** (sur le run) et **tenable sur les 4 foyers à la fois** — c'est là qu'est
l'impact réel d'une crise bien gérée (suppression continue → survie longue → `ruinGain` patience/sédiment).

**Fichiers touchés :** [`balance.js`](../src/game/core/balance.js) (`FOYER_REFORM`, `REFORM_ACTION_FOYER`),
[`state.js`](../src/game/core/state.js) (état `foyerReform` + hydratation + reset),
[`mechanics.js`](../src/game/core/mechanics.js) (`pressureBreakdown` réduction combinée, `crisisCosts`
les 4 réformes), [`crisis.js`](../src/game/core/actions/crisis.js) (`runCrisisAction` branche réforme),
[`CrisisActionBar.jsx`](../src/components/ui/CrisisActionBar.jsx) + [`views.css`](../src/styles/views.css)
(boutons « Réforme de fond », badge « réformé »).

**Vérifié :** 62/62 tests (golden + hydratation inchangés), lint propre, et test en navigateur
(boutons rendus, clic → recul durable + badge, aucune erreur console).

## ✅ Levier B + extension à 5 actions/foyer LIVRÉS

**Levier B (infra lisible)** : ligne « 🛡️ Tes institutions (infra + légitimité) absorbent −X% de
pression » dans la barre de crise (dérivée de `pressure.mitigation`) + action **Travaux publics**
(trésor→infra) → l'infra devient un outil anti-rupture explicite.

**5 actions par foyer, déblocables** via un registre déclaratif
[`src/game/data/regulationActions.js`](../src/game/data/regulationActions.js) : 10 nouvelles
actions de paliers T3-T5, gating par **bestEra** (Ère II/III/IV) et **mythes complétés**. Les
verrouillées s'affichent en aperçu « 🔒 Ère / mythe ». Kinds : `soothe` (temporaire), `reform`
(durable), + effets éco optionnels (`infraAdd`/`legitAdd`) → la gestion de crise nourrit aussi la
croissance. Plomberie : `regulationContext()`/`regulationActionUnlocked()` (mechanics), dispatch
dans `runCrisisAction`, costs auto-générés dans `crisisCosts`, UI registre + teasers.

**Vérifié :** 9/9 checks moteur ([`scratch/check-reg-actions.js`](../scratch/check-reg-actions.js) :
unlock, soothe+infra, reform+infra/légit, action verrouillée sans effet), 62/62 tests, lint propre,
navigateur (5 actions/foyer, teasers 🔒, ligne tampon −44%, aucune erreur console).

## ✅ Levier C LIVRÉ — Politiques permanentes (ralentir la montée)

Toggles de gouvernance qui, tant qu'actifs, **ralentissent la MONTÉE** de la jauge
(`policyRiseSlow` → `orderSlow` dans tick, plafond commun 0.8) contre un **coût de production
CONTINU et RÉCUPÉRABLE** (`policyProductionMultiplier` replié dans `crisisProductionMultiplier`
→ revient à 1 dès qu'on désactive). 4 politiques (`REGULATION_POLICIES`) déblocables par
ère/mythe : Couvre-feu (départ) ▸ Loi martiale (Ère II) ▸ Conseil permanent (Ère IV) ▸ Pax Divina
(1 mythe). Bornées à **`POLICY_MAX_ACTIVE` = 2** (budget de stabilité).

**Levier le plus SÛR** : il n'agit ni sur la valeur ni sur la cible → il ne fait que *gagner du
temps*, ne peut **jamais** empêcher l'effondrement quand la cible ≥ 1.0. Le coût continu (économie
bridée) est le contre-pouvoir : on ne le tient pas indéfiniment sans saborder sa croissance.

**Plomberie :** `state.activePolicies` (défaut + hydratation + reset), `togglePolicy` (crisis.js,
exporté via actions.js), `policyRiseSlow`/`policyProductionMultiplier`/`regulationPolicyUnlocked`
(mechanics), `orderSlow` (tick.js), section UI « Politiques permanentes » (les deux variantes).

**Vérifié :** 11/11 checks moteur ([`scratch/check-policies.js`](../scratch/check-policies.js) :
riseSlow, coût récupérable, max 2, déblocage, cumul), 62/62 tests (golden inchangé → coût = 1 sans
politique), lint propre, navigateur (toggle, surbrillance active, teasers 🔒, aucune erreur console).

---

**Restent à faire :** reworks §5 — « Ruines si effondrement maintenant », fantôme de la cible sur la
jauge, actions **pari/RNG**, fatigue de régulation, politiques à effets variés (overshoot, foyer-damp).

---

## 1. Diagnostic — pourquoi « on écope » au lieu de gagner du terrain

Le moteur expose **trois variables** sur lesquelles on peut agir. Aujourd'hui les leviers du
joueur n'en touchent qu'une vraiment :

| Niveau | Variable | Agi dessus aujourd'hui | Durable ? |
|---|---|---|---|
| **La valeur** (la bille) | `state.instability` | coup instantané des actions (`relief × 0.4`) | ❌ redérive aussitôt |
| **La cible** (vers où la bille va) | `pressureBreakdown().total` | infra/stabilisants/légitimité ; `foyerRelief` | ◑ infra durable mais invisible ; relief **temporaire** |
| **La vitesse de montée** | dérive ([`tick.js:104`](../src/game/core/actions/tick.js:104)) | seulement `holdOrder` en crise terminale | ❌ rien dans la couche continue |

Détail clé : `foyerRelief` **touche bien la cible** ([`pressureBreakdown` l.524-528](../src/game/core/mechanics.js:524)),
mais il est **multiplicatif, plafonné à 0.45, demi-vie 30 s** → la cible plonge puis remonte
en ~1 min. Et l'infrastructure **recule réellement la cible** (mesuré dans `rupture-impact.md` :
−0.094 early sur +25 égouts) mais (a) c'est invisible, le joueur ne la voit pas comme l'outil
anti-rupture, (b) son effet **rétrécit fortement late** (soft-caps).

**Conclusion :** le ressenti du joueur est juste. Aucun levier ne *recule durablement* la cible,
et rien ne *ralentit la montée* dans la couche qu'on manipule en continu. Early, où l'on n'a ni
trésor pour l'infra, ni relief assez fort, il ne reste que l'écopage.

---

## 2. Le principe directeur (ce qui rend la refonte sûre)

Le danger est écrit dans [`balance.js`](../src/game/core/balance.js:48) : un recul durable mal
borné → cité **immortelle** → `ruinGain()` s'effondre (chute à gain nul). La parade est élégante
et déjà employée par `mitigation` (terme log plafonné) :

> **Faire reculer la cible par un terme ABSOLU / log, jamais multiplicatif non borné.**

- **Early** : foyer brut ≈ 0.08 → un recul *plat* de −0.05 ≈ une quasi-suppression → **vraie reconquête, ressentie.**
- **Late** : foyer brut ≈ 0.6 → le même −0.05 ≈ −8 % → **négligeable → l'effondrement reste inévitable.**

C'est auto-équilibré early↔late sans toucher aux plafonds existants ni à la philosophie
« chute tardive = plus de Ruines ». Toute la refonte repose sur cette propriété.

---

## 3. La refonte — 3 leviers, un par système demandé

### Levier A — `foyerReform` : recul **permanent et plat** des foyers *(pièce maîtresse → foyers + trésor)*

**Idée.** Un 2ᵉ palier d'action par foyer : à côté d'**Apaiser** (l'actuel : pas cher, dip
temporaire), un **Réformer en profondeur** qui coûte **beaucoup** (grosse ponction de trésor /
savoir — *c'est la « réduction du trésor » demandée*) et dépose un recul **plat, permanent
jusqu'à l'effondrement** sur le foyer visé.

**Nouvel état.**
```js
// state.js — defaultState() + resetTemporaryRunState()
foyerReform: { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 }
```

**Application** dans `pressureBreakdown()` — soustraction plate *après* le relief multiplicatif
(à ajouter dans **les deux** chemins float ET Decimal) :
```js
const rf = state.foyerReform || {};
const scarcity   = Math.max(0, scarcityRaw*0.55 * (1 - (fr.scarcity||0))   - (rf.scarcity||0));
const inequality = Math.max(0, softCap(...) * (1 - (fr.inequality||0))     - (rf.inequality||0));
const complexity = Math.max(0, softCap(complexityRaw*0.34,0.75)*(1-(fr.complexity||0)) - (rf.complexity||0));
const dissent    = Math.max(0, (Math.min(0.55, dissentRaw*0.22) - dissentRelief)*(1-(fr.dissent||0)) - (rf.dissent||0));
```

**Constantes proposées** (`balance.js`, à affiner par `bench-rupture.js`) :
```js
export const FOYER_REFORM_ADD = {            // dépôt plat par « Réformer »
  scarcity: 0.018, inequality: 0.018, complexity: 0.015, dissent: 0.020
};
export const FOYER_REFORM_CAP = {            // plafond plat par foyer (anti-immortalité)
  scarcity: 0.06, inequality: 0.05, complexity: 0.06, dissent: 0.05
};
```
→ ~3-4 réformes profondes maxent un foyer. Early ça l'efface presque ; late ça l'érode à peine.

**Coût & contrepartie.** Sur le modèle de `crisisCosts()` mais **bien plus cher** (≈150-250 s de
prod, vs 25-45 s pour l'apaisement), payé surtout en **trésor/savoir**. Bonus thématique : la
réforme verse aussi un peu de **légitimité/infra** (canaux déjà auto-plafonnés) → le recul
visible *plus* un gain économique composé. Pas de demi-vie : le recul est acquis pour le run,
remis à zéro au collapse comme le reste (`resetTemporaryRunState`).

**Où coder.** [`runCrisisAction`](../src/game/core/actions/crisis.js:361) (brancher le palier
« reform »), [`pressureBreakdown`](../src/game/core/mechanics.js:512), [`crisisCosts`](../src/game/core/mechanics.js:1247),
[`state.js`](../src/game/core/state.js:120) (état + normalisation hydratation),
[`CrisisActionBar`](../src/components/ui/CrisisActionBar.jsx:101) (2ᵉ bouton par foyer).

---

### Levier B — L'infrastructure, **héros lisible** du recul *(→ achat d'infrastructure)*

L'infra recule **déjà** la cible par 3 canaux (`mitigation`, portage `structural`, absorption
`complexity` via `effCoverage`) — mais c'est invisible et ça s'efface late. Trois actions :

1. **Lisibilité (zéro risque d'équilibrage).** Dans la barre de crise, afficher « Ton
   infrastructure retient **−X %** de pression » (dérivé de `mitigation` + `effCoverage` de
   `pressureBreakdown`). Le joueur comprend enfin que **construire = reculer durablement**.
2. **Raccourci diégétique.** Un bouton de crise « Travaux publics » qui convertit du **trésor en
   infra/stabilisants** (réutilise l'effet infra déjà présent dans `reforms`,
   [`crisis.js:405`](../src/game/core/actions/crisis.js:405)) → relie « réduction du trésor » au
   canal anti-rupture le plus sain du moteur.
3. **Réactivité early (optionnel).** Si on veut que les *premiers* achats d'infra se voient plus,
   adoucir la demande de couverture early (`INFRA_COVERAGE_*` dans `balance.js`) — à valider que
   ça ne gèle pas la cible late (re-bench).

---

### Levier C — Politique **maintenue** qui ralentit la montée *(→ « ralentir la progression »)*

Pour agir sur la **vitesse** (et pas la valeur) : un **toggle** (ex. « Conseil permanent », « Loi
martiale douce ») qui, tant qu'il est actif, **réduit la dérive de montée** contre un **coût de
production continu**. C'est le modèle déjà prouvé de `ruptureSlow`/`orderSlow`
([`tick.js:104`](../src/game/core/actions/tick.js:104)), descendu de la crise terminale vers la
couche continue.

```js
// tick.js — généralise orderSlow à une politique continue
const policySlow = Math.min(0.6, state.activePolicies?.order || 0);
const orderSlow = instabilityDrift > 0
  ? 1 - Math.min(0.8, (state.terminalPreparations?.ruptureSlow || 0) + policySlow)
  : 1;
```
Coût : un malus de production **continu** (multiplicateur dédié dans `rates`, *récupérable* à
l'extinction — à ne PAS confondre avec `crisisProduction` qui, lui, ne se rétablit jamais). Borner
le nombre de politiques actives simultanées → décision de budget de stabilité, pas empilement.
*Plus gros chantier (état persistant + UI toggles + intégration `rates`) → à staquer en dernier.*

---

## 4. Détails d'implémentation transverses

- **Double chemin float ↔ Decimal.** Tout nouveau terme dans `pressureBreakdown`/`crisisCosts`
  doit être ajouté **dans les deux branches** (cf. `Number.isFinite(...)` l.488/494) — sinon les
  golden tests ([`economy.golden.test.js`](../src/game/core/__tests__/economy.golden.test.js))
  cassent. Mettre à jour les snapshots **volontairement** après re-mesure.
- **Persistance.** Ajouter `foyerReform` (et `activePolicies`) à `defaultState`, à la
  normalisation d'hydratation ([`state.js:713+`](../src/game/core/state.js:713)) et au reset de
  run ([`state.js:844`](../src/game/core/state.js:844)).
- **UI à 2 paliers.** [`CrisisActionBar`](../src/components/ui/CrisisActionBar.jsx) a déjà la
  structure `foyers[].actions[]` et un `RegulButton` partagé compact/full : ajouter une action
  « reform » par foyer suit le pattern existant. Afficher l'effet (« −X % foyer, permanent »),
  pas que le coût (correctif déjà recommandé par l'audit UI).
- **Automation.** `protocoles_urgence` ([`tick.js:166`](../src/game/core/actions/tick.js:166))
  ne clique que `census`/`rationing` (apaisement) : vérifier qu'il **n'enclenche pas** les
  réformes coûteuses tout seul (garder l'investissement durable = décision du joueur).
- **Re-mesure obligatoire.** Relancer `bench-rupture.js` et vérifier l'invariant : cible
  late-game max (4 foyers réformés + relief) **reste ≥ ~1.0** (sinon immortalité, cf. §2).

---

## 5. Autres améliorations / reworks à envisager

Au-delà de la demande, plusieurs chantiers augmenteraient nettement la profondeur :

1. **Indicateur « Ruines si effondrement maintenant ».** Le moteur récompense déjà la chute
   tardive (`ruinGain()`), mais ce pari est **invisible** → le joueur régule par réflexe sans
   savoir qu'il *renonce à des Ruines*. Afficher en continu « tomber maintenant : **X** ruines /
   tenir double ce gain » transforme chaque action en **vraie décision**. *Très fort, faible
   risque.* (déjà pointé dans le rapport précédent, §4.)
2. **Fantôme de la cible sur la jauge.** Dessiner sur la barre de Rupture un marqueur « cible »
   (`pressureBreakdown().total`) distinct de la valeur. Le joueur *voit* l'écart bille↔cible et
   comprend pourquoi ça remonte — pré-requis de lisibilité pour tout le reste.
3. **Modèle Apaiser / Réformer explicite.** Formaliser les 2 paliers (urgence temporaire vs
   investissement durable) sur **tous** les foyers, avec pictos clairs. Donne une grammaire
   cohérente à la couche continue.
4. **Choix ramifiés dans le foyer (style `CRISIS_POOL` en ligne).** 2-3 réponses mutuellement
   exclusives par foyer (prudent / brutal / pari RNG) au lieu d'un bouton unique → on choisit un
   *style* au lieu de matraquer. Réutilise le modèle des événements (Couche A) sur l'outil
   continu.
5. **Fatigue de régulation.** Méta-compteur global : interventions rapprochées → efficacité ↓ et
   coût ↑ de tous les foyers, redescend avec le temps. Généralisation lisible du
   `CRISIS_ACTION_DECAY` existant → le jeu optimal devient « intervenir au bon moment », pas
   « spammer ».
6. **Synergies/conflits inter-foyers explicites.** Rendre visible ce qui existe déjà en creux
   (Catastrophes ↑ Complexité ; compteurs partagés `census`/`festivals`). Sur-traiter un foyer en
   pousse un autre → puzzle d'assiettes chinoises.
7. **Clarté des 3 couches.** Garder distinctes : événements (A, ponctuel à pause), régulation
   (B, continue), préparations terminales (C, fin de vie). Enrichir B sans la confondre avec A/C.

---

## 6. Plan de mise en œuvre (par rapport valeur / risque)

| Phase | Contenu | Risque | Effet |
|---|---|---|---|
| **0** | Lisibilité : fantôme de cible (§5.2) + « infra retient −X % » (B.1) + effet sur les boutons | très faible | comprendre avant d'agir |
| **1** | **`foyerReform`** (Levier A) — recul plat permanent + palier « Réformer » | moyen (re-bench) | **le cœur de la demande** |
| **2** | Raccourci « Travaux publics » trésor→infra (B.2) + indicateur « Ruines maintenant » (§5.1) | faible | décision réelle |
| **3** | Politique maintenue ralentissant la montée (Levier C) | élevé (état + UI + rates) | « retenir la marée » |
| **V2** | Choix ramifiés (§5.4), fatigue (§5.5), synergies (§5.6) | variable | profondeur |

---

## 7. Garde-fous (ne pas casser)

- **Invariant d'immortalité** : cible late-game max ≥ ~1.0 après tous reculs → re-`bench-rupture.js`.
- **Recul = terme absolu/log, jamais multiplicatif non borné** (§2).
- **Double chemin float/Decimal** + snapshots golden mis à jour volontairement.
- **`ruinGain()` intact** : la chute tardive doit rester payante (ne pas neutraliser `pressure`,
  `patience`, `preparation`).
- **Automation** : l'intendant n'investit pas les réformes durables tout seul.
