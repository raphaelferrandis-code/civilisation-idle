# Jeux du temple en Faveur - rapport d'equilibrage (systeme cable)

> Genere par `bench-temple.js` (seed 20260716, 400 runs x 8 h par config). Valide le
> systeme CABLE (2026-07-16) - mises des osselets en **Faveur** (plus d'or), **tronc des
> offrandes** passif, gains **normalises sur un RTP cible < 1** (anti-imprimante),
> Clemence = **rabais de mise**. Tout vient du vrai code (`auguryPaytable`,
> `auguryBaseOdds`, `auguryTierOdds`, `clemencyCrans`) et des constantes de
> `balance.js` - a regenerer apres chaque retouche d'equilibrage (`node bench-temple.js`).

## Parametres cables (balance.js)

| Parametre | Avant (mise-or, 2026-07-15) | Cable |
|---|---|---|
| Mise osselets | 30 s de prod d'or x rite (0.6/1/2) | **Faveur : 4 / 6 / 12** (prudent/classique/grand) |
| Gains osselets | plats : Venus 20, Triple 8, Paire 3 (x costMult) | **normalises sur RTP cible** (cf. paytables) |
| Consolations Creux/Chien | 1 / 2 Faveur | **0** (le pot d'Icare reste nourri par une part des mises perdues) |
| RTP (edge maison) | - (mise en or : EV toujours positive en Faveur) | **paiements FIXES normalises a 99.0 % au win rate MAX** -> RTP effectif ~57.3 % a des 0, ~99.0 % a des 10 |
| Odds (win rate) | p 0.55 x scale 0.5 = 27.5 % (+2 pts / de) | inchange - LE levier de progression (les paiements ne bougent pas) |
| Clemence | +5 pts d'odds / cran (Chien double) | **echelle de mises ENTIERES** : classique 6/5/4/3/3/3 par cran (plancher = moitie, aucun cran no-op — A13) |
| NOUVEAU : tronc des offrandes | - | **+120 Faveur/h**, plafond 60, plein au deblocage, releve manuelle |
| Des pipes (prix) | 40 x 1.6 | **130 x 1.45** (niv. 10 : ~3683 ; total 10 niv. ~35893) |
| Ailes cirees (prix) | 60 x 1.7 | **90 x 1.8** |
| Benediction | 45 | **60** |
| Automatisations | osselets 200 (mise l'or, plancher d'or) | **tronc 520 (auto-releve) / osselets 700 (auto-jeu, plancher de Faveur)** ; Icare 350 inchange (or) |

## Garde-fous

- **PASS** - A1 anti-imprimante SOUS L'ANCRE (des <= 10) : RTP effectif < 1 jusqu'a l'ancre (des 10) et rtpRef < cap partout ; des 13 : la bascule imprime (voulu, cf. A14)
- **PASS** - A2 arrondi : pire deviation d'arrondi 1.70 pts sous le cap (classique, ivoire) - tolerance 3 pts (toujours SOUS)
- **PASS** - A3 gagner paie : chaque issue gagnante rend STRICTEMENT plus que la mise, partout
- **PASS** - A8 paiements FIXES vs des : les des pipes ne changent AUCUN paiement : seul le win rate monte (contrat Raph)
- **PASS** - A11 BLACKJACK_RTP_REF majore le meilleur jeu (refente comprise) : REF 1.01 >= meilleur mesure 100.23 % (marge 0.77 pt, viser >= 0.4 pt) ; REF >= 1 -> feedPot clampe a 0, la table ne nourrit plus le pot
- **PASS** - A12 graveur : paiements FIXES, masse conservee : payoutMult identiques et poids sommant a 1000 sur les 11 niveaux (contrat des des pipes)
- **PASS** - A13 Clemence entiere : echelle stricte, prorata EXACT : chaque cran descend jusqu'au plancher (moitie) sans no-op ; l'esperance du jet en Clemence = jet plein (payRound + vol au prorata), < 1 partout
- **PASS** - A9 anti-imprimante SOUS-BASCULE (cagnotte comprise, 4 jeux) : rtp_total < 1 pour les 875 configurations sous-bascule (des <= 10, ailes <= 6, planches <= 5, sans refente) ; 258 configs supra-bascule impriment VOLONTAIREMENT (cf. A14)
- **PASS** - A14 robinet de la bascule : debit positif, farm d'un rang dans [4 h, 24 h] : net/h x1 : osselets 2011, icare 540, gratteux 113 (21 manuel : marge 0.2 pt) ; rang de coffre ~8.0 h au meilleur debit (osselets)
- **PASS** - A10 recycle < 1 (le clamp qui prouve A9) : recycle 0.6 (nu) / 0.85 (noye, clampe depuis 1.20) ; cap 0.85 < 1
- **PASS** - A4 early peu rentable : net 1 h median : flambeur 5 vs epargnant 168 Faveur
- **PASS** - A5 bonus etales : epargne stricte : 1er de a 54 min, auto-releve a 4.1 h
- **PASS** - A6 progression sensible : perte mediane PAR JET du flambeur : 1.93 Faveur (des 0) -> 0.28 (des 10)
- **PASS** - A7 Clemence saine (mode rabais) : RTP realise du sniper : rabais 54.6 % (borne) ; statu quo odds 81.0 % -> sous 100 % ici mais non borne

## A9 : RTP total, cagnotte comprise (les 4 jeux)

> **La cagnotte n'est pas un puits.** En solo, tout ce qui y entre revient au MEME
> joueur (elle se rafle a Icare a x10) : c'est un **paiement differe**. Donc
> `rtp_total = rtp_base + part_versee`, et A1..A8 n'en voyaient rien (ils passent
> tous par `auguryPaytable`, donc un jeu sur quatre, cagnotte exclue).
>
> **Depuis le 2026-07-17, le pot est finance par l'EDGE et non par la mise :**
> `feed = mise x recycle x (1 - rtp_base)`, d'ou
> `rtp_total = rtp_base + recycle x (1 - rtp_base) < 1` pour tout `recycle < 1`.
> L'anti-imprimante est vrai par ALGEBRE, quels que soient le jeu, le niveau, la mise
> et les artefacts. Recycle cable : 0.6 (0.85 avec l'osselet du noye, clampe
> depuis 1.20). A10 verrouille ce clamp : c'est le point de defaillance UNIQUE.
>
> Avant, la part etait prelevee sur la MISE (0.25 a 0.5) alors que l'edge ne prend que
> 0.018 (vingt-et-un) a 0.18 (Icare) de cette meme mise : on rendait plus qu'on ne
> prenait, et **746 configurations sur 813 imprimaient** (Icare x10 a 118,7 % des le
> 1er jour, x50+plumes a 186 %).
>
> Hypothese assumee et conservatrice : le joueur finit par vider le pot. Elle MAJORE
> le RTP, ce qu'un anti-imprimante doit faire.

**Sous-bascule : 0 configuration sur 875 imprime** (des <= 10, ailes <= 6, planches <= 5, sans refente).
Les 258 configurations SUPRA-bascule impriment volontairement (cf. la section bascule). Pire cas sous-bascule par jeu :

| Jeu | Configuration | Mise | RTP base | Part versee | Consolations | **RTP total** |
|---|---|---|---|---|---|---|
| osselets | prudent, des 10, noye | 4 | 99.0 % | +0.9 % | +0.0 % | **99.8 %** |
| icare | plume, cible x1.4, ailes 6 | 4 | 98.2 % | +1.1 % | +0.0 % | **99.3 %** |
| gratteux | obole, graveur 5 | 4 | 93.3 % | +4.0 % | +0.0 % | **97.3 %** |
| vingt-et-un | legere, base + double | 4 | 99.6 % | +0.0 % | +0.0 % | **99.6 %** |

Les 12 configurations sous-bascule les plus proches du bord, tous jeux confondus :

| Jeu | Configuration | RTP base | Part versee | **RTP total** |
|---|---|---|---|---|
| osselets | prudent, des 10, noye | 99.0 % | +0.9 % | **99.8 %** |
| osselets | prudent, des 10, ivoire, noye | 99.0 % | +0.9 % | **99.8 %** |
| osselets | grand, des 10, ivoire, noye | 98.8 % | +1.0 % | **99.8 %** |
| osselets | classique, des 10, noye | 98.8 % | +1.1 % | **99.8 %** |
| osselets | interdit, des 10, ivoire, noye | 98.7 % | +1.1 % | **99.8 %** |
| osselets | interdit, des 10, noye | 98.7 % | +1.1 % | **99.8 %** |
| osselets | grand, des 10, noye | 98.7 % | +1.1 % | **99.8 %** |
| osselets | prudent, des 10 | 99.0 % | +0.6 % | **99.6 %** |
| osselets | classique, des 10, ivoire, noye | 97.3 % | +2.3 % | **99.6 %** |
| osselets | prudent, des 10, ivoire | 99.0 % | +0.6 % | **99.6 %** |
| vingt-et-un | legere, base + double | 99.6 % | +0.0 % | **99.6 %** |
| vingt-et-un | pleine, base + double | 99.6 % | +0.0 % | **99.6 %** |

## La bascule : l'imprimante volontaire (A14)

> Arbitrage Raphael (2026-07-17) : « au bout d'un moment le joueur gagne plus
> qu'il ne depense », « des chiffres absurdement gros », « temps de farm
> classique, gain exponentiel a vie ». Passe la bascule (des 11+, ailes 7+,
> planches 6+, la refente au 21), rtp > 1 est le PRODUIT VENDU. Le debit est
> borne par la cadence de l'auto (net/h = parties/h x mise x marge) et le COFFRE
> (mise x10^rang, prix x10/rang) rend le temps de farm d'un rang CONSTANT.

| Table au sommet | Marge (rtp - 1) | Net/h (coffre x1, fervent) |
|---|---|---|
| interdit, des 13, fervent | +11.2 % | ~2011 Faveur/h |
| hecatombe, ailes 8, fervent | +3.6 % | ~540 Faveur/h |
| talent, graveur 10, fervent | +0.8 % | ~113 Faveur/h |
| refente + double, royale | +0.2 % | manuel (l'auto joue la base, sous 1) |

- **Un rang de coffre** se farme en ~8.0 h au meilleur debit (osselets) — constant a chaque rang (prix x10, debit x10).
- **Les 8 rangs** : ~2.7 jours de farm cumules.
- **Les reliques** (au coffre max) : le Char ~moins d'une heure, la Corne ~0.0 h, l'Oeil d'or ~0.2 jours — apres les ~2.7 jours de coffres : les objets a « jours de farm » demandes.

> Lecture : plus `rtp_base` est haut, MOINS la table peut recycler — le vingt-et-un
> n'a que 1,8 point d'edge, donc il ne verse presque rien, et c'est correct. Les
> configurations du haut de ce tableau sont celles ou il reste le moins de marge : ce
> sont elles qu'il faut relire si `AUGURY_RTP_CAP` ou `WING_STEP` montent.
>
> Les **plumes de secours** n'apparaissent plus : elles PRELEVENT desormais sur la
> cella au lieu de minter `round(mise x 0.5)` a chaque crash. Ce qui sort du pot est
> deja compte dans la part versee, donc la consolation n'ajoute plus rien au RTP —
> c'etait le poste le plus lourd de l'imprimante (+51 pts a la cible x50).
> L'**osselet du noye** ne double plus une part de mise : il booste le recycle, et le
> clamp le tient sous 1 (A10).

## RTP analytique (hors Clemence)

> Paiements FIXES (normalises au win rate MAX sur le cap) : le RTP EFFECTIF suit le
> win rate courant (rtp = rtpRef x pEff/pRef) - il monte avec les des, jamais au-dela
> du cap. L'ivoire (artefact) redistribue la variance : la table est RECALCULEE a
> l'achat, le RTP reste sous le cap.

| Rite | Des | Win rate | RTP ref (des max) | RTP effectif | RTP eff (ivoire) | Perte moy./jet |
|---|---|---|---|---|---|---|
| prudent | 0 | 27.5 % | 99.0 % | 57.3 % | 57.3 % | 1.7 Faveur |
| prudent | 3 | 33.5 % | 99.0 % | 69.8 % | 69.8 % | 1.2 Faveur |
| prudent | 5 | 37.5 % | 99.0 % | 78.1 % | 78.1 % | 0.9 Faveur |
| prudent | 8 | 43.5 % | 99.0 % | 90.7 % | 90.6 % | 0.4 Faveur |
| prudent | 10 | 47.5 % | 99.0 % | 99.0 % | 99.0 % | 0 Faveur |
| prudent | 11 | 49.5 % | 99.0 % | 103.2 % | 103.1 % | -0.1 Faveur |
| prudent | 13 | 53.5 % | 99.0 % | 111.5 % | 111.5 % | -0.5 Faveur |
| classique | 0 | 27.5 % | 98.8 % | 57.2 % | 56.3 % | 2.6 Faveur |
| classique | 3 | 33.5 % | 98.8 % | 69.6 % | 68.6 % | 1.8 Faveur |
| classique | 5 | 37.5 % | 98.8 % | 78.0 % | 76.8 % | 1.3 Faveur |
| classique | 8 | 43.5 % | 98.8 % | 90.4 % | 89.1 % | 0.6 Faveur |
| classique | 10 | 47.5 % | 98.8 % | 98.8 % | 97.3 % | 0.1 Faveur |
| classique | 11 | 49.5 % | 98.8 % | 102.9 % | 101.4 % | -0.2 Faveur |
| classique | 13 | 53.5 % | 98.8 % | 111.2 % | 109.6 % | -0.7 Faveur |
| grand | 0 | 27.5 % | 98.7 % | 57.1 % | 57.2 % | 5.1 Faveur |
| grand | 3 | 33.5 % | 98.7 % | 69.6 % | 69.7 % | 3.6 Faveur |
| grand | 5 | 37.5 % | 98.7 % | 77.9 % | 78.0 % | 2.7 Faveur |
| grand | 8 | 43.5 % | 98.7 % | 90.4 % | 90.5 % | 1.2 Faveur |
| grand | 10 | 47.5 % | 98.7 % | 98.7 % | 98.8 % | 0.2 Faveur |
| grand | 11 | 49.5 % | 98.7 % | 102.8 % | 103.0 % | -0.3 Faveur |
| grand | 13 | 53.5 % | 98.7 % | 111.1 % | 111.3 % | -1.3 Faveur |
| interdit | 0 | 27.5 % | 98.7 % | 57.1 % | 57.2 % | 8.6 Faveur |
| interdit | 3 | 33.5 % | 98.7 % | 69.6 % | 69.6 % | 6.1 Faveur |
| interdit | 5 | 37.5 % | 98.7 % | 77.9 % | 78.0 % | 4.4 Faveur |
| interdit | 8 | 43.5 % | 98.7 % | 90.4 % | 90.4 % | 1.9 Faveur |
| interdit | 10 | 47.5 % | 98.7 % | 98.7 % | 98.7 % | 0.3 Faveur |
| interdit | 11 | 49.5 % | 98.7 % | 102.9 % | 102.9 % | -0.6 Faveur |
| interdit | 13 | 53.5 % | 98.7 % | 111.2 % | 111.2 % | -2.2 Faveur |

## Paytables affichees au joueur (FIXES a tous les niveaux de des)

| Rite | Mise | Venus | Triple | Paire |
|---|---|---|---|---|
| prudent | 4 | 15 | 11 | 6 |
| classique | 6 | 23 | 12 | 9 |
| grand | 12 | 39 | 24 | 16 |
| interdit | 20 | 55 | 37 | 27 |

> Contrat (arbitrage Raph 2026-07-16) : les des pipes montent le WIN RATE
> (+2 pts/niveau), les paiements ne bougent JAMAIS - verrouille par A8.

## Clemence : pourquoi le rabais de mise (et pas le bonus d'odds)

En monnaie fermee, l'ancienne Clemence (+5 pts d'odds par cran, Chien double,
jusqu'a +50 pts) rendait la table **exploitable** : les gains etant normalises hors
Clemence, chaque cran multipliait le RTP effectif (~lineaire en p, les pertes payant 0).
Strategie mesuree ("sniper" : charger les crans en prudent, degainer le grand rite a 3+ crans) :

| Mode Clemence | RTP realise (sniper) | Net median 8 h | Verdict |
|---|---|---|---|
| Odds (ancien systeme, contrefactuel) | 81.0 % | 8 Faveur | borderline |
| Rabais de mise (CABLE) | 54.6 % | 10 Faveur | borne par construction |

L'echelle ENTIERE (2026-07-17 : classique 6/5/4/3/3/3 par cran, gains au prorata
de la mise payee) descend a CHAQUE revers jusqu'au plancher (la moitie) — l'ancien
rabais en pourcentage laissait les crans 2 et 4 no-op par round(). La serie noire
brule moins vite ("le temple allege l'offrande des eprouves"), le prorata reste
borne < 1 (A13) et inexploitable (A7).

## Sessions simulees (Monte Carlo, 8 h actives, mode rabais)

> Tronc plein a l'arrivee (burst de ~10 jets classiques), releve manuelle au plafond,
> 1 jet / 12 s max (rythme d'animation). "A sec" = bankroll sous la mise classique.

| Politique | Des | Jets/h | RTP realise | Net 1 h (p10/p50/p90) | Net 8 h (p50) | A sec |
|---|---|---|---|---|---|---|
| epargnant | 0 | 0 | - | 168 / 168 / 168 | 979 | 0 % |
| modere | 0 | 63 | 54.1 % | 16 / 31 / 56 | 14 | 0 % |
| flambeur | 0 | 63 | 54.1 % | 3 / 5 / 28 | 5 | 80 % |
| hecatombe | 0 | 32 | 54.3 % | 5 / 8 / 11 | 9 | 10 % |
| sniper (rabais) | 0 | 59 | 54.6 % | 6 / 10 / 36 | 10 | 4 % |
| flambeur | 5 | 102 | 73.7 % | 3 / 22 / 58 | 5 | 67 % |
| flambeur | 10 | 278 | 94.3 % | 23 / 85 / 203 | 306 | 8 % |
| flambeur + ivoire | 10 | 207 | 89.3 % | 11 / 51 / 120 | 21 | 32 % |

## Temps d'acces aux achats (mediane, pure accumulation)

| Achat | Prix | Epargnant | Modere |
|---|---|---|---|
| de pipe 1 | 130 | 54 min | > 8 h |
| benediction | 60 | 0 min | 27 min |
| aile ciree 1 | 90 | 27 min | > 8 h |
| auto-releve du tronc | 520 | 4.1 h | > 8 h |
| auto-jeu | 700 | 5.4 h | > 8 h |

## Verdict

- **Jouer vite** : burst d'entree de ~10 jets classiques (tronc plein), puis le tronc (+120/h)
  finance ~47 jets classiques/h en regime permanent a des 0 (par vagues : un gain repaie ses jets).
- **Early peu rentable** : le flambeur finit l'heure a ~5 Faveur la ou l'epargnant
  en garde ~168 - jouer coute, comme voulu ; la marge de progression est le moteur.
- **Bonus etales** : 1er de a 54 min en epargne stricte (bien plus en jouant),
  automatisations a 4.1 h / 5.4 h, les 10 des ~35893 Faveur
  (~299 h de tronc) : progression long terme.
- **De mieux en mieux** : la perte de jeu du flambeur fond de 122 a 78 Faveur/h
  entre des 0 et des 10 (win rate 27.5 % -> 47.5 %, paiements INCHANGES : le RTP
  effectif grimpe de ~57.3 % a ~99.0 %).
- **Clemence** : passer au rabais de mise (l'actuelle est exploitable en monnaie fermee).

### Suites possibles (hors du cable actuel)
- **La bascule est un CONTRAT en deux moities** : sous l'ancre (des <= 10,
  ailes <= 6, planches <= 5, sans refente), l'anti-imprimante reste vrai par
  algebre (A9) ; au-dela, rtp > 1 est le produit vendu et son DEBIT est la seule
  chose a surveiller (A14 : cadence x mise x marge, coffres a prix x10).
- Le RTP effectif des osselets a des 0 est DUR (~56 %) : c'est le choix "early peu
  rentable" pousse au bout - chaque de pipe rend ~+4 pts de RTP effectif, la
  progression se SENT. A adoucir via AUGURY_RTP_CAP ou DICE_BOOST_STEP si trop rude.
- Les couts d'artefacts, des coffres et des reliques restent ajustables au ressenti ;
  la bande [4 h, 24 h] du farm d'un rang (A14) est le curseur central.
