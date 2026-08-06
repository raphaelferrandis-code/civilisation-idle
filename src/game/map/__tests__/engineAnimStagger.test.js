// Décalage des animations de bâtiments-moteur (engineAnim.js).
// Demande Raph 2026-08-05 : « toutes les animations d'un bâtiment ont le même
// timing, c'est possible d'avoir des animations en décalés ? ». Toutes les scènes
// lisaient le `now` de la frame : quarante ateliers du même type jouaient la même
// image au même millième de seconde.
//
// ⚠ CE QUE CE FICHIER MESURE, et pourquoi ce n'est pas le calcul comparé à
// lui-même : on ne vérifie pas que `engineAnimNow` rend bien `now × rate + phase`
// (ce serait décoratif), on reconstitue LE QUARTIER — une grille d'ateliers — et on
// regarde ce que l'œil verrait : sur quelle image de la bande de feu chacun tombe,
// et où en est chacun de son cycle long. Un décalage qui « existe » mais laisse
// tout le monde sur la même image ne servirait à rien, et ce test le dirait.
import { describe, it, expect, afterEach } from "vitest";
import { engineAnimNow, ENGINE_ANIM_STAGGER } from "../engineAnim.js";

// Bande de feu des scènes (ANIM_BANDS, cityEngineSprites) : 7 images à 130 ms.
// C'est l'animation la plus visible et la plus rapide — celle où l'unisson saute
// aux yeux. Frame = floor(now / ms) % frames, exactement comme blitAnim.
const FIRE_MS = 130, FIRE_FRAMES = 7;
const fireFrame = (n) => Math.floor(n / FIRE_MS) % FIRE_FRAMES;

// Le plus long cycle des scènes (la navette du chaland, cityEngineSprites) : c'est
// LUI qui contraint l'étalement des déphasages, pas le feu.
const LONG_MS = 5200;

// Une tuile, réduite à ce que le décalage lit : sa cellule.
const tile = (gx, gy) => ({ gx, gy });
// Un quartier d'ateliers alignés — la situation qui a motivé la demande.
const quartier = (n = 48) => Array.from({ length: n }, (_, i) => tile(10 + (i % 8), 20 + ((i / 8) | 0)));

const defaults = { ...ENGINE_ANIM_STAGGER };
afterEach(() => Object.assign(ENGINE_ANIM_STAGGER, defaults));

describe("décalage des animations moteur", () => {
  it("coupé, rend le temps de la frame INTACT", () => {
    ENGINE_ANIM_STAGGER.on = false;
    const t = tile(3, 7);
    expect(engineAnimNow(t, 123456)).toBe(123456);
  });

  it("laisse passer une tuile sans cellule (aucun plantage, aucun décalage)", () => {
    expect(engineAnimNow(null, 1000)).toBe(1000);
    expect(engineAnimNow({}, 1000)).toBe(1000);
  });

  it("est déterministe : deux appels sur la même tuile rendent le même temps", () => {
    // Les captures (__cityShot, harnais de scènes) en dépendent : un décalage tiré
    // au hasard rendrait toute comparaison de captures impossible.
    const a = tile(12, 34), b = tile(12, 34);
    expect(engineAnimNow(a, 9000)).toBe(engineAnimNow(a, 9000));
    // …et il ne dépend QUE de la cellule, pas de l'objet : deux tuiles fraîches
    // sur la même case doivent tomber sur la même horloge (recompute de layout).
    expect(engineAnimNow(b, 9000)).toBe(engineAnimNow(a, 9000));
  });

  it("étale les déphasages sur AU MOINS le plus long cycle des scènes", () => {
    // Un étalement plus court que 5 200 ms laisserait les cycles longs groupés :
    // les feux sembleraient décalés, mais les porteurs partiraient ensemble.
    expect(ENGINE_ANIM_STAGGER.spread).toBeGreaterThanOrEqual(LONG_MS);
  });

  it("casse l'unisson : les images de feu du quartier se répartissent", () => {
    const q = quartier(48);
    const now = 60_000;
    const counts = new Array(FIRE_FRAMES).fill(0);
    for (const t of q) counts[fireFrame(engineAnimNow(t, now))] += 1;
    // Avant : les 48 tombaient sur UNE image (counts = [0,…,48,…,0]).
    const vues = counts.filter((c) => c > 0).length;
    expect(vues, `images de feu représentées : ${counts}`).toBeGreaterThanOrEqual(6);
    // …et aucune image ne rassemble le quartier : la répartition idéale est 48/7
    // ≈ 6,9 par image ; on refuse qu'une seule en attire plus du tiers.
    expect(Math.max(...counts) / q.length).toBeLessThan(0.34);
  });

  it("casse l'unisson AUSSI sur le cycle long (le porteur, pas que la flamme)", () => {
    // Le cycle long est celui qu'on remarque : quarante porteurs qui posent leur
    // panier ensemble. On découpe [0..1[ en 8 secteurs et on exige qu'ils soient
    // tous occupés — un étalement trop court se verrait ici, pas sur le feu.
    const q = quartier(48);
    const secteurs = new Set();
    for (const t of q) secteurs.add(Math.floor(((engineAnimNow(t, 60_000) / LONG_MS) % 1) * 8));
    expect(secteurs.size, "secteurs du cycle long occupés").toBeGreaterThanOrEqual(7);
  });

  it("ne fabrique PAS de damier entre tuiles voisines", () => {
    // ⚠ LE PIÈGE À ÉVITER, déjà tombé sur les teintes de maisons : cmHash est un
    // FNV-1a dont les bits de poids faible ne valent rien (le bit 0 n'est que la
    // parité de l'entrée). Un déphasage tiré des bits bruts alignerait une tuile
    // sur deux — un damier d'animations, c'est-à-dire l'unisson en pire.
    // Deux déphasages indépendants et uniformes ont un écart absolu moyen de 1/3
    // de l'étalement. On mesure ce voisinage, pas la distribution globale : celle
    // d'un damier parfait est irréprochable.
    ENGINE_ANIM_STAGGER.rate = 0;                 // déphasage seul : la phase EST le temps
    const N = 60;
    let somme = 0, paires = 0;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N - 1; x += 1) {
        somme += Math.abs(engineAnimNow(tile(x, y), 0) - engineAnimNow(tile(x + 1, y), 0));
        paires += 1;
      }
    }
    const moyen = somme / paires / ENGINE_ANIM_STAGGER.spread;
    expect(moyen, "écart moyen entre voisins, en parts d'étalement").toBeGreaterThan(0.29);
    expect(moyen).toBeLessThan(0.38);
  });

  it("désynchronise DURABLEMENT : deux ateliers ne gardent pas un écart figé", () => {
    // Le déphasage seul fige les écarts pour toujours ; la variation de cadence
    // (±6 %) fait que le quartier ne se retrouve jamais en pelotons.
    const a = tile(4, 4), b = tile(5, 4);
    const ecart = (n) => engineAnimNow(a, n) - engineAnimNow(b, n);
    expect(Math.abs(ecart(600_000) - ecart(0))).toBeGreaterThan(LONG_MS);
  });

  it("garde la cadence sous le seuil de perception", () => {
    // Une cadence qui dérive de plus de ~10 % ne se lit plus comme « cet atelier
    // travaille à son rythme » mais comme une animation au mauvais tempo.
    const q = quartier(200);
    for (const t of q) {
      const k = (engineAnimNow(t, 1_000_000) - engineAnimNow(t, 0)) / 1_000_000;
      expect(k).toBeGreaterThan(1 - ENGINE_ANIM_STAGGER.rate - 1e-9);
      expect(k).toBeLessThan(1 + ENGINE_ANIM_STAGGER.rate + 1e-9);
    }
  });
});
