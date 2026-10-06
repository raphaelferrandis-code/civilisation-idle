# Le Grand Œuvre — le pattern optimal pour finir le jeu

> Wiki stratégique tiré de la **simulation 10 profils** (`sim-10-profils.js`, run final du
> 2026-07-20 : budget 240 h virtuelles/profil, plafond temps réel ∞, moteur réel du jeu —
> aucune formule recopiée). Sources brutes : `course-gr1-profils.md` + `sim-10-profils-milestones.tsv`.
> Compagnon stratégique de l'`ATLAS-EFFONDREMENT.md` (qui décrit les systèmes ; ici, on décrit **la route**).

---

## TL;DR — le pattern en une phrase

**Enchaîne 10 effondrements (~10 h) → érige 3 merveilles (~7 h) → honore les 14 Mythes (~2 h) →
encaisse les sceaux bankés en rafale → laisse la cascade ×3.5ⁿ emporter le reste (~3 h).**
Total mesuré : **21 h 35 min à 22 h 34 min de jeu, quel que soit le style.**

---

## « Finir le jeu », c'est quoi ?

Pas d'écran de victoire : le sommet, c'est **réclamer les 11 sceaux du Grand Reset**, dont le
dernier — *Sous le Regard du Ragnarök* — exige les **14 Mythes** et grave un **×4 éternel**.
En chemin, on aura forcément complété l'**Arbre des Ruines 37/37** (sceau IX) et traversé les
**ères transcendantes** (sceau X).

Verdict de la sim : **les 10 profils bouclent 10 sceaux sur 11** (le VII, jackpot d'Icare, n'est
pas prouvé par le bot — voir plus bas), arbre 37/37, 14/14 Mythes ✓ Ragnarök. **Aucun softlock** :
l'ordre libre + le banking font le travail.

---

## Les quatre lois tirées de la sim

### Loi 1 — Le style ne change presque rien à la vitesse
Écart entre le meilleur (Chasseur de méta, **21 h 35**) et le pire (Prudent, **22 h 34**) : **1 h sur 22**.
Même l'AFK assumé qui ne gère jamais rien finit en 21 h 51. L'échelle est gatée par le **contenu**
(merveilles, Mythes, arbre), pas par l'exécution.

### Loi 2 — Le style change TOUT à la puissance
| Style | Cycles joués | Mult global final |
|---|---|---|
| Géré (Chasseur de méta) | 2 129 | **×6.26e76** |
| Spam (AFK / Casse-cou / Relanceur) | 3 757 | ×1.19e65 |

**Douze ordres de grandeur d'écart.** Tenir la Rupture (<0.8) et saboter avant la chute
(`collapsePreparation`, plafonné à 2.4) rapporte beaucoup plus de Ruines par cycle que le spam —
moins de cycles, mais chacun vaut infiniment plus.

### Loi 3 — Le chemin critique, ce sont les Mythes
4 sceaux sur 11 sont gatés par les Mythes (III = 1, VI = Acte I, VIII = Acte II, XI = 14/14).
Le gating est dur : **Acte II exige TOUT l'Acte I, Acte III tout l'Acte II, le Ragnarök les 13.**
Un pilote générique s'y casse les dents ; chaque Mythe demande sa micro-stratégie (antisèche plus bas).

### Loi 4 — Grave tôt, encaisse quand tu veux (le banking)
Un sceau dont la condition a été **atteinte une fois** reste réclamable **à vie**, même si le signal
retombe. Et chaque encaisse vaut la même chose (×3.5 prod, ×2 Ruines) quel que soit le sceau.
Corollaires :
- Les deux sceaux **relatifs** montent avec chaque sceau encaissé — **IV** (pop 1e6 × 10ⁿ) et
  **X** (ère 40 + 2n). **Frappe leur condition tôt**, quand la cible est basse : le IV se grave dès
  la première vie qui touche le million (mesuré : 9.11M au premier crépuscule).
- **Encaisse juste après un effondrement, jamais en pleine montée** — le Grand Reset efface tout.
  Le bot encaisse toujours depuis un Campement à 10 habitants.

---

## Où partent les 22 heures

```
0h ──────────────── 10h ─────────── 16h45 ── 18h50 ──── 21h35
│  Les dix crépuscules │  Les merveilles  │ Mythes │ Cascade │
│      (sceau I)       │  (sceaux II+III) │ VI/VIII│ IV·V·IX·X│
│        ~45 %         │      ~30 %       │ /XI ~10%│  ~13 %  │
```

Les deux vrais murs de temps sont **le sceau I** (10 effondrements, les premiers cycles sont lents)
et **les 3 merveilles** (~7 h). Les Mythes ne coûtent que ~2 h *avec les bonnes tactiques*.
Après la triple encaisse, le mult ×3.5⁶ ≈ ×1 838 écrase tout : les 4 derniers sceaux tombent en ~3 h.

---

## La frise du run optimal

Temps du **Chasseur de méta** (meilleur run) ; l'ordre d'encaisse est celui observé chez tous les profils.

| Heure | Événement | Sceau encaissé |
|---|---|---|
| ~1 h 15 | Premier effondrement, premier achat d'arbre (3 Ruines) | — |
| **9 h 55** | 10ᵉ effondrement traversé | **I — Le Premier Crépuscule** |
| **16 h 45** | 3ᵉ merveille érigée · 1ᵉʳ Mythe déjà honoré en route | **II — La Première Merveille** puis **III — Premier Pacte** |
| 17 h 16 | Acte I (Fondation) complet — 5 Mythes | *(gravé, pas encore encaissé)* |
| 18 h 22 | Acte II (Domination) complet — 8 Mythes | *(gravé)* |
| 18 h 29 | Acte III (Apocalypse) complet — 13 Mythes | *(gravé)* |
| 18 h 43 | **Ragnarök honoré — 14/14** | *(gravé)* |
| **18 h 49** | **Triple encaisse en rafale** | **VI + VIII + XI** |
| **19 h 03** | Pic de population au-dessus de la cible relative | **IV — La Colonne du Million** |
| **19 h 27** | Un culte consacré à l'Olympe (score dominant) | **V — L'Olympe se prononce** |
| **20 h 19** | Arbre des Ruines 37/37, les 4 capstones | **IX — Les Couronnes Jumelles** |
| **21 h 35** | Ère transcendante atteinte (cible 40 + 2n → ~ère 58, Noosphère) | **X — Au-delà de la Singularité** |
| *n'importe quand* | Jackpot ×10 au Vol d'Icare (~8 %/vol) | **VII — Le Jackpot d'Icare** |

---

## Phase par phase

### Phase 1 — Les dix crépuscules *(0 → ~10 h)*
Objectif : `cycles ≥ 10`. Cadence gagnante : **cycles de 10–14 min**, Rupture tenue **< 0.78–0.8**,
**sabotage palier 2** quand la crise s'ouvre. Le premier cycle est long (~1 h 15) : monte les âges
Campement → Maîtrise du bois, effondre, réinvestis les 3 premières Ruines dans l'arbre.
*(Le spam de cycles courts marche aussi pour CE sceau — mais tue ton mult à long terme, cf. Loi 2.)*

### Phase 2 — Les merveilles et le premier pacte *(10 h → ~16 h 45)*
Objectif : `3 merveilles`. C'est le plus long plateau du jeu (~7 h) : des cycles plus longs et plus
riches pour financer les chantiers. **Honore ton 1ᵉʳ Mythe pendant cette phase** — le sceau III
tombe dans la même minute que le II.

### Phase 3 — Le grind des Mythes *(~16 h 45 → 18 h 45, ~2 h)*
Le cœur technique du run. Chaque Mythe se joue en cycles **dédiés et courts** — on active, on
remplit l'objectif, on **effondre immédiatement pour verrouiller**. Voir l'antisèche ci-dessous.
Répartition mesurée : Acte I ~31 min · Acte II ~1 h 06 (le plus lent : Sisyphe et l'Âge d'Or se
paient en temps) · Acte III ~7 min · Ragnarök ~14 min.

### Phase 4 — La triple encaisse *(~18 h 50)*
Les sceaux VI, VIII et XI sont gravés : encaisse-les **coup sur coup** depuis le Campement.
Trois Grands Resets en rafale → le mult global bondit (×3.5 par encaisse, cumulatif).

### Phase 5 — La cascade finale *(18 h 50 → ~21 h 35)*
Portée par le mult, chaque objectif restant tombe en un ou deux cycles :
- **IV** : dépasse la cible de pop relative (~15 min post-rafale) ;
- **V** : consacre un culte à l'Olympe (jouer assez pour qu'un profil domine) ;
- **IX** : re-bâtis l'arbre entier, 37/37 avec les **4 capstones** (~50 min) ;
- **X** : pousse les ères transcendantes jusqu'à la cible 40 + 2n (~1 h 15, le dernier vrai effort).

---

## Antisèche des 14 Mythes

Objectifs (cf. `data/myths.js`) et **tactique gagnante mesurée** (celle du bot, `MYTH_TACTICS`).

### Acte I — La Fondation *(déverrouille le sceau VI)*
| Mythe | Objectif | La ligne gagnante |
|---|---|---|
| **du Chaos** | 12 Ruines **brutes** ce cycle (bonus coupés) | Bâtir ET tenir longtemps (pop + patience + sédiment font le gain), Rupture < 0.8 |
| **de Prométhée** | Pop ×100 **avant** Rupture 80 % | Le food ×3 du Mythe aide ; bâtir en gérant < 0.7 — chaque moteur ajoute de la Rupture |
| **d'Énée** | ≥ 3 migrations (terre dégradée / 6 min) | Infra minimale seulement ; **migrer dès que le territoire se dégrade** ; cycle ~28 min |
| **de Cadmos** | Nommer 3 âges | Trivial : jouer normalement, répondre aux prompts |
| **d'Héphaïstos** | Infra ≥ 1× pic de pop **+** pop déclinée de 20 % | Bâtir **2 min 30 puis plus rien** : sans nouvelles sources, la pop étouffée décline seule (~25 min), tenir < 0.6 |

### Acte II — La Domination *(sceau VIII)*
| Mythe | Objectif | La ligne gagnante |
|---|---|---|
| **de Sisyphe** | Hisser le rocher 2× (6 crans payés) | **Zéro achat** (bâtir lâche le rocher) ; la prod existante paie ; alterner les matières **2-2-2** (la moins employée d'abord) |
| **de Babel** | 70 bâtiments de la catégorie choisie | Choisir **Cité**, n'acheter que ça |
| **de l'Âge d'Or** | Conclure 8 marchés avec les caravanes | Bâtir 2 min 30 **puis thésauriser** ; négocier Trésor plein avec 25 % de marge ; Rupture plafonnée à 5 % par le Mythe |

### Acte III — L'Apocalypse *(nourrit le XI)*
| Mythe | Objectif | La ligne gagnante |
|---|---|---|
| **d'Atlas** | Épauler 12× en **zone rouge** (Fardeau ≥ 70) | Épauler dès l'entrée en zone rouge : le Fardeau oscille 45–90 sans jamais écraser (100 = perdu) |
| **d'Icare** | Atteindre l'altitude 5 | Enchaîner les MONTER tant que la jauge garde ~8 % de marge, puis **effondrer dès l'altitude 5** (la hâte ×3.5 consume tout) |
| **du Phénix** | 3 renaissances : pop ×60 en < 3 min, d'affilée | Rush **pur bâtiments à pop**, effondrer dès la cible ; cycles ~3 min, plusieurs essais sont normaux |
| **des Atrides** | 150 s de prod d'Or **net** malgré la dette | Bâtir 2 min puis thésauriser — le net monte lentement, ne plus rien acheter |
| **d'Antée** | ≥ 4 fardeaux simultanés + pop ×50 sous ce poids | **Charger 4 Héritages actifs AVANT de croître** (design : `ANTEE_MIN_ACTIVE_RUINS = 4`) |

### La Finale — le Ragnarök *(sceau XI, ×4 éternel)*
| Objectif | La ligne gagnante |
|---|---|
| L'Hiver Fimbul : achever l'**Arche (8 offrandes)** avant la Fin (24 min) | **Le boss exige les outils.** À mains nues on plafonne à **7/8** (l'Hiver /2 + le Loup rendent la 8ᵉ impayable). Jouer la **Langue commune de Babel** (+20 % Cité). ⚠ L'**Aile d'Icare est un piège mesuré** : sa hâte de Rupture ×1.5 tue le run (3/8) |

---

## Le sceau VII — le Jackpot d'Icare

Le seul que la sim **ne prouve pas** — et c'est un bug du **harnais**, pas du jeu : le bot mise
encore en or alors que les mises sont passées en **Faveur** (refonte temple), donc il ne décolle
jamais. Pour un humain : **P(×10) ≈ 8 % par vol** — quelques sessions au temple suffisent.
Grâce au banking, il se tente **n'importe quand** dès que le Vol d'Icare est ouvert ; il ne bloque
rien d'autre (c'était tout l'objet de l'ordre libre).

---

## Les 10 profils à l'arrivée

| Profil | Réglages | Échelle bouclée | Cycles | Mult global |
|---|---|---|---|---|
| **9. Chasseur de méta** | 14 min · Rupture < 0.78 · sabotage 2 | **21 h 35** | 2 129 | **×6.26e76** |
| 2. Optimiseur de timing | 10 min · < 0.8 · sans sabotage | 21 h 37 | 2 150 | ×6.28e74 |
| 3. Architecte des Mythes | 12 min · < 0.8 · sabotage 1 | 21 h 39 | 2 155 | ×8.70e74 |
| 6. Complétionniste | 12 min · < 0.8 · sabotage 1 | 21 h 39 | 2 155 | ×8.70e74 |
| 8. Lecteur | 30 min · < 0.85 · sans | 21 h 49 | 2 259 | ×1.08e75 |
| 7. Théoricien | 15 min · < 0.75 · sabotage 2 | 21 h 50 | 2 080 | ×1.92e75 |
| 1. AFK assumé | 0 min · aucune gestion | 21 h 51 | 3 757 | ×1.19e65 |
| 4. Casse-cou | 2 min · aucune gestion | 21 h 51 | 3 757 | ×1.19e65 |
| 10. Relanceur compulsif | 3 min · aucune gestion | 21 h 51 | 3 757 | ×1.19e65 |
| 5. Prudent | 20 min · < 0.7 · sabotage 1 | 22 h 34 | 2 017 | ×3.12e75 |

Leçons :
- **Le réglage gagnant** : cycles de **10–14 min**, Rupture tenue autour de **0.78–0.8**,
  **sabotage maximal** une fois la crise ouverte.
- Les trois profils « sans gestion » convergent vers exactement le même run (la crise dicte tout).
- Le **Prudent** (cycles de 20 min, gestion < 0.7) est le seul à décrocher : trop de prudence
  gaspille l'Usure — la deadline punit les cycles trop longs, surtout en début d'échelle.

---

## Limites honnêtes

- Temps **virtuels bot**, pas de 5 s : les valeurs absolues sont approximatives (±1 tick par
  transition), le **classement** et les **proportions** sont robustes. Un humain qui n'encaisse pas
  instantanément visera plutôt **25–30 h de jeu réel**.
- Le sceau **VII** n'est pas prouvé par la sim (bug harnais, cf. section dédiée) ; à corriger dans
  `sim-10-profils.js` (~l. 905) pour une preuve complète.
- ⚠ Dans `course-gr1-profils.md`, la colonne « GR XI · Mythes : — » est un **artefact du
  générateur** (il compte les *n-ièmes resets*, pas les sceaux) : le sceau manquant est le **VII**,
  pas le XI. Le tableau « partie canonique » fait foi.
- Le pilote de Mythes joue bien mais n'égale pas un humain : les ~2 h de grind mythique sont un
  **plafond**, pas un plancher.
