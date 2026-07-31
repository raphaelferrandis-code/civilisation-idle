// LUEUR DES FLAMMES. Trois choses se jouent ici, et aucune ne se voit sur une
// capture diurne :
//   1. le halo part-il du VRAI foyer du sprite (une bande régénérée déplace le
//      feu sans rien casser d'autre — la lumière resterait alors à côté) ;
//   2. la lueur monte-t-elle réellement avec la nuit, au lieu d'être un aplat ;
//   3. les bandes qui ne sont PAS des feux (eau d'aqueduc, égouts) restent-elles
//      noires — c'est la garde qui empêche « tout ce qui s'anime brille ».
//
// ⚠ Le point 1 ne compare pas la table à elle-même : il RE-MESURE les PNG du
// dépôt avec le même critère que la mesure d'origine (chaud ∧ mouvant) et
// confronte le résultat aux constantes. Reprendre `sig`/`fx` du module rendrait
// le test décoratif.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PNG } from 'pngjs';

import { CM } from '../layout.js';
import { ANIM_BANDS, ANIM_FIRE_CORES, blitAnim, animReady } from '../cityEngineSprites.js';
import {
  FLAME_GLOW, queueFlameGlow, paintFlameGlows, pendingFlameGlows,
  flameFlicker, flameAssetGlow, suspendFlameGlow,
} from '../flameGlow.js';

const BUILDINGS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/pixelart/agents/buildings');

// Mock de contexte 2D qui RETIENT ce qu'on lui demande : les opérations
// additives (une lueur est forcément en 'lighter'), l'alpha du cœur de chaque
// halo et son centre. Sous Node il n'y a pas de canvas hors écran, donc c'est le
// repli par dégradé qui s'exécute — d'où la lecture du premier arrêt de couleur.
function makeCtx() {
  const ctx = {
    fillStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    lit: 0,          // nombre de remplissages posés en composite additif
    alphas: [],      // alpha au centre de chaque halo
    spots: [],       // centre de chaque halo
    radii: [],       // rayon de chaque halo
  };
  ctx.drawImage = () => { if (ctx.globalCompositeOperation === 'lighter') { ctx.lit += 1; ctx.alphas.push(ctx.globalAlpha); } };
  ctx.createRadialGradient = (x, y, _r0, _x1, _y1, r) => {
    ctx._at = [x, y]; ctx._r = r;
    return {
      addColorStop: (stop, col) => {
        if (stop === 0) { const m = /rgba\([^,]+,[^,]+,[^,]+,([0-9.]+)\)/.exec(col); if (m) ctx._pending = +m[1]; }
      },
    };
  };
  ctx.fillRect = () => {
    if (ctx.globalCompositeOperation === 'lighter' && ctx._pending != null) {
      ctx.lit += 1; ctx.alphas.push(ctx._pending); ctx.spots.push(ctx._at); ctx.radii.push(ctx._r); ctx._pending = null;
    }
  };
  return ctx;
}

// Mesure du foyer d'une bande : centroïde des pixels CHAUDS (opaques, clairs,
// franchement plus rouges que bleus) ET MOUVANTS (qui changent d'une frame à
// l'autre — dans ces bandes le bâtiment est figé, seul le feu bouge). sigma =
// rayon quadratique moyen du nuage, rapporté à la largeur de frame.
function measureCore(key, meta) {
  const p = PNG.sync.read(readFileSync(path.join(BUILDINGS, `${key}.png`)));
  const { fw, fh, frames } = meta;
  const at = (f, x, y) => { const i = (y * p.width + f * fw + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]]; };
  let sx = 0, sy = 0, sw = 0;
  const pts = [];
  for (let y = 0; y < fh; y += 1) for (let x = 0; x < fw; x += 1) {
    let mv = 0;
    for (let f = 1; f < frames; f += 1) {
      const a = at(0, x, y), b = at(f, x, y);
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
      if (d > mv) mv = d;
    }
    if (mv <= 40) continue;
    let hot = 0;
    for (let f = 0; f < frames; f += 1) {
      const [r, , b, al] = at(f, x, y);
      // ⚠ Pas de clause sur la MOYENNE des canaux : elle disqualifiait le rouge
      // saturé. Depuis que les feux sont peints sur la rampe rouge feu, le corps
      // de la flamme est #ef2a0b — moyenne 97, donc « sombre » pour un critère de
      // clarté, alors que c'est le point le plus chaud du sprite. Ce qui écarte le
      // mur ocre, ce n'est pas la clarté, c'est le filtre MOUVANT au-dessus.
      if (al > 128 && r > 150 && r - b > 60) hot += (r - b);
    }
    const w = mv * hot;
    if (w > 0) { sx += (x + 0.5) * w; sy += (y + 0.5) * w; sw += w; pts.push([x + 0.5, y + 0.5, w]); }
  }
  if (!sw) return null;
  const cx = sx / sw, cy = sy / sw;
  let vr = 0;
  for (const [x, y, w] of pts) vr += w * ((x - cx) ** 2 + (y - cy) ** 2);
  return { fx: cx / fw, fy: cy / fh, sig: Math.sqrt(vr / sw) / fw };
}

const prevNight = CM.nightF;
const DEFAULTS = { ...FLAME_GLOW };
beforeEach(() => { Object.assign(FLAME_GLOW, DEFAULTS); suspendFlameGlow(false); paintFlameGlows(null); });
afterEach(() => { CM.nightF = prevNight; paintFlameGlows(null); });

// Pose une lueur et la peint dans la foulée : la file est un détail d'ordre de
// passes, pas le sujet des tests d'intensité.
function lightUp(ctx, ...args) {
  const queued = queueFlameGlow(...args);
  paintFlameGlows(ctx);
  return queued;
}

describe('foyers des bandes de feu — ancrés sur les PNG, pas sur eux-mêmes', () => {
  it('chaque foyer déclaré tombe sur les pixels chauds et mouvants de sa bande', () => {
    for (const [key, core] of Object.entries(ANIM_FIRE_CORES)) {
      const meta = ANIM_BANDS[key];
      expect(meta, `${key} absente d'ANIM_BANDS`).toBeTruthy();
      const m = measureCore(key, meta);
      expect(m, `${key} : aucun pixel chaud ET mouvant`).toBeTruthy();
      expect(Math.abs(m.fx - core.fx), `${key} fx mesuré ${m.fx.toFixed(3)} vs déclaré ${core.fx}`).toBeLessThan(0.02);
      expect(Math.abs(m.fy - core.fy), `${key} fy mesuré ${m.fy.toFixed(3)} vs déclaré ${core.fy}`).toBeLessThan(0.02);
      expect(Math.abs(m.sig - core.sig), `${key} sigma mesuré ${m.sig.toFixed(3)} vs déclaré ${core.sig}`).toBeLessThan(0.02);
    }
  });

  // Sans ceci la garde ci-dessus se viderait toute seule : une table vide passe.
  it('les quatre feux animés du jeu sont couverts', () => {
    expect(Object.keys(ANIM_FIRE_CORES).sort()).toEqual(
      ['ancestralcult-fire', 'mint-forge-fire', 'storyteller-fire', 'watch-fire']
    );
  });
});

describe('lueur des feux — de la lumière, et seulement quand il en faut', () => {
  it('un feu éclaire de jour et éclaire DAVANTAGE la nuit', () => {
    CM.nightF = 0;
    const day = makeCtx();
    expect(lightUp(day, 100, 100, 20, '255,170,70', 0, 0, 1)).toBe(true);
    CM.nightF = 1;
    const night = makeCtx();
    expect(lightUp(night, 100, 100, 20, '255,170,70', 0, 0, 1)).toBe(true);
    // De jour, le cœur SEUL (le soleil mange la nappe ambiante) ; la nuit, les deux.
    expect(day.lit).toBe(1);
    expect(night.lit).toBe(2);
    // Valeurs ABSOLUES tenues à la main : un halo trop discret ne se verrait pas,
    // un halo trop fort brûlerait le sprite (0.16 le jour, 0.46 la nuit, avant
    // scintillement — ici phase 0 et now 0, soit un scintillement de 0.72).
    const dayCore = day.alphas[0], nightCore = night.alphas[1];
    expect(dayCore).toBeGreaterThan(0.07);
    expect(dayCore).toBeLessThan(0.25);
    expect(nightCore).toBeGreaterThan(dayCore * 1.8);
    expect(nightCore).toBeLessThan(0.6);
  });

  // La nappe est ce qui fait qu'un feu ÉCLAIRE AUTOUR de lui au lieu d'éclairer sa
  // seule flamme (un lampadaire pose les deux). Elle doit rester sous le cœur en
  // intensité et le déborder largement, sinon on obtient une tache plate.
  it('la nappe ambiante nocturne est plus large et plus faible que le cœur', () => {
    CM.nightF = 1;
    const ctx = makeCtx();
    lightUp(ctx, 50, 60, 20, null, 0, 0, 1);
    expect(ctx.lit).toBe(2);
    const [haloA, coreA] = ctx.alphas, [haloR, coreR] = ctx.radii;
    expect(haloA).toBeLessThan(coreA * 0.6);
    expect(haloR).toBeGreaterThan(coreR * 2);
    expect(ctx.spots[0]).toEqual(ctx.spots[1]);   // même foyer, pas un halo qui dérive
  });

  it('interrupteur, suspension et rayon nul coupent vraiment la lumière', () => {
    CM.nightF = 1;
    const ctx = makeCtx();
    FLAME_GLOW.on = false;
    expect(lightUp(ctx, 10, 10, 20, null, 0, 0, 1)).toBe(false);
    FLAME_GLOW.on = true;
    suspendFlameGlow(true);
    expect(lightUp(ctx, 10, 10, 20, null, 0, 0, 1)).toBe(false);
    suspendFlameGlow(false);
    expect(lightUp(ctx, 10, 10, 0.2, null, 0, 0, 1)).toBe(false);   // sous-pixel
    expect(lightUp(ctx, 10, 10, 20, null, 0, 0, 0)).toBe(false);    // poids nul
    expect(ctx.lit).toBe(0);
    expect(lightUp(ctx, 10, 10, 20, null, 0, 0, 1)).toBe(true);     // et ça remarche
  });

  // Le point le plus fragile du montage : la lumière est POSÉE PLUS TARD que la
  // flamme (par-dessus le voile de nuit). Si une passe oubliait de vider la file,
  // les feux de la frame précédente se rallumeraient à la suivante — au mauvais
  // endroit, la caméra ayant bougé.
  it('la file se vide entièrement à chaque passe', () => {
    CM.nightF = 0;                                  // plein jour : un feu = une entrée
    for (let i = 0; i < 5; i += 1) queueFlameGlow(i * 10, 10, 12, null, 0, i, 1);
    expect(pendingFlameGlows()).toBe(5);
    const ctx = makeCtx();
    expect(paintFlameGlows(ctx)).toBe(5);
    expect(pendingFlameGlows()).toBe(0);
    expect(ctx.lit).toBe(5);
    expect(paintFlameGlows(ctx)).toBe(0);   // repasser ne rallume rien
    expect(ctx.lit).toBe(5);
  });

  it('le scintillement respire sans jamais s\'éteindre ni doubler', () => {
    let lo = 9, hi = -9;
    for (let t = 0; t < 20000; t += 37) { const v = flameFlicker(t, 1.3); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(lo).toBeGreaterThan(0.4);
    expect(hi).toBeLessThanOrEqual(1.0001);
    expect(hi - lo).toBeGreaterThan(0.3);          // une constante passerait les bornes
    expect(flameFlicker(1234, 1.3)).toBe(flameFlicker(1234, 1.3));  // déterministe (captures)
  });
});

describe('flameAssetGlow — seuls les FEUX éclairent', () => {
  it('un overlay peint avec une flamme éclaire ; un éclat de gemme, non', () => {
    expect(flameAssetGlow({ file: 'flame-small.png' })).toBeTruthy();
    expect(flameAssetGlow({ file: 'flame-large.png' })).toBeTruthy();
    expect(flameAssetGlow({ file: 'gem-glint.png' })).toBe(null);
    expect(flameAssetGlow({ file: 'needle-beam.png' })).toBe(null);
    expect(flameAssetGlow({ file: 'arc-glow.png' })).toBe(null);
    expect(flameAssetGlow(null)).toBe(null);
  });

  it('le JSON garde le dernier mot', () => {
    expect(flameAssetGlow({ file: 'flame-large.png', glow: false })).toBe(null);
    expect(flameAssetGlow({ file: 'gem-glint.png', glow: '10,20,30' })).toBe('10,20,30');
  });
});

describe('blitAnim — la lueur suit le feu, et rien que le feu', () => {
  // Les bandes ne se chargent que si `Image` existe : sous Node on en pose une
  // coquille, ce qui suffit à remplir le registre (le blit lui-même est un no-op
  // du mock). Sans ça blitAnim sort avant même de regarder le foyer.
  const prevImage = globalThis.Image;
  beforeEach(() => {
    globalThis.Image = class { set src(_v) { /* pas de réseau sous Node */ } };
    animReady('watch-fire');                        // amorce ensureAnim()
    CM.nightF = 0;                                  // un feu = une entrée (pas de nappe)
  });
  afterEach(() => { globalThis.Image = prevImage; });

  it('une bande de feu annonce sa lumière au foyer mesuré', () => {
    const ctx = makeCtx();
    // Boîte 100×100 posée en (0,0), bande dessinée pleine boîte : le foyer tombe
    // donc directement sur les fractions de la table.
    blitAnim(ctx, 0, 0, 100, 100, 'watch-fire', 0, 0.5, 0.5, 1, 1);
    expect(pendingFlameGlows()).toBe(1);
    expect(paintFlameGlows(ctx)).toBe(1);
    expect(ctx.lit).toBe(1);
    const core = ANIM_FIRE_CORES['watch-fire'];
    expect(ctx.spots[0][0]).toBeCloseTo(core.fx * 100, 6);
    expect(ctx.spots[0][1]).toBeCloseTo(core.fy * 100, 6);
  });

  it('l\'eau qui coule ne brille pas', () => {
    for (const key of ['aqueduct-water-seg', 'aqueduct-water-outlet', 'sewers-water']) {
      const ctx = makeCtx();
      blitAnim(ctx, 0, 0, 100, 100, key, 0, 0.5, 0.5, 1, 1);
      expect(pendingFlameGlows(), `${key} ne devrait pas éclairer`).toBe(0);
      paintFlameGlows(ctx);
      expect(ctx.lit, `${key} ne devrait pas éclairer`).toBe(0);
    }
  });
});

// UN FEU NE SE REMBOBINE PAS. Le lecteur d'overlays de merveille (renderBuildings)
// joue par défaut la bande en ALLER-RETOUR : 0..n-1 puis n-2..1. C'est le bon
// réglage pour ce qui respire (éclat de gemme, pulsation), et le mauvais pour une
// flamme — les bandes PixelLab bouclent déjà bord à bord, l'aller-retour se voit
// comme un hoquet régulier. La règle se lit sur la DONNÉE (le nom du fichier),
// donc un futur `flame-spiral.png` est couvert sans toucher au test.
describe('bandes de flamme des merveilles — jouées en avant, jamais en boucle', () => {
  const WONDERS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/pixelart/wonders');

  it('tout overlay peint avec un asset de flamme déclare loop:"forward"', () => {
    const files = readdirSync(WONDERS).filter((f) => f.endsWith('-flames.json'));
    expect(files.length).toBeGreaterThan(0);
    const fautifs = [];
    let vus = 0;
    for (const f of files) {
      const cfg = JSON.parse(readFileSync(path.join(WONDERS, f), 'utf8'));
      for (const [key, a] of Object.entries(cfg.asset || {})) {
        if (!/flame/i.test(a.file || '')) continue;   // même critère que flameAssetGlow
        vus += 1;
        if (a.loop !== 'forward') fautifs.push(`${f}:${key}`);
      }
    }
    expect(vus, 'aucun asset de flamme trouvé — la garde se viderait toute seule').toBeGreaterThanOrEqual(3);
    expect(fautifs, `bandes de flamme en aller-retour : ${fautifs.join(', ')}`).toEqual([]);
  });
});
