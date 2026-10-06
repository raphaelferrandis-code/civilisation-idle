// TOUT CE QUI BOUGE EST SUR LA GRILLE DEVICE — la garde du 2026-09-14.
//
// Raph : « je n'ai plus besoin de voir de clipping » (le fourmillement des
// sprites qui avancent). Le mécanisme est connu depuis les habitants (2026-08-03)
// et les véhicules (G0, 2026-08-30) : un blit en plus proche voisin à position
// fractionnaire change sa coupe de lignes source à chaque image. La parade est
// UN arrondi, sur la grille DEVICE (blitSnap.js) — et la panne muette, c'est un
// site qui repasse à Math.round (grille CSS, fausse à dpr 1,25 et 1,5) ou qui
// oublie d'arrondir (les bateaux, jusqu'à ce jour). Ce test lit donc les SOURCES
// des familles vivantes et vérifie que leurs lignes drawImage passent par le
// rabattement, en plus du contrat numérique de snapDev.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CM } from '../layout.js';
import { snapDev } from '../blitSnap.js';
import { drawIsoRain } from '../iso/isoWeather.js';
import { SUMMER, WINTER } from '../seasonMode.js';

const MAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(MAP, f), 'utf8');
const savedDpr = CM.dpr;
afterEach(() => { CM.dpr = savedDpr; });

const surGrille = (v, dpr) => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-9;

describe('snapDev — le contrat numérique', () => {
  it('tombe sur la grille device et ne déplace jamais de plus d un demi-pixel device', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      CM.dpr = dpr;
      for (const v of [0.1, 10.3, 20.7, 123.456, -4.2, 999.5]) {
        const s = snapDev(v);
        expect(surGrille(s, dpr), `dpr ${dpr} ${v}→${s}`).toBe(true);
        expect(Math.abs(s - v)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
      }
    }
  });
  it('à dpr 1, c est Math.round — rien ne bouge sur un écran à 100 %', () => {
    CM.dpr = 1;
    for (const v of [0.1, 10.3, 20.7, 123.456, -4.2]) expect(snapDev(v)).toBe(Math.round(v));
  });
  it('sans dpr (contexte de test), se comporte comme à dpr 1', () => {
    CM.dpr = undefined;
    expect(snapDev(10.6)).toBe(11);
  });
});

// Les lignes drawImage d'une famille vivante, avec les 6 lignes qui les précèdent
// (là où left/top/dw sont calculés) : on y attend le rabattement, pas Math.round.
function blitsDe(file, filtre) {
  const lines = src(file).split('\n');
  const out = [];
  lines.forEach((l, i) => {
    if (l.includes('ctx.drawImage(') && filtre(l)) out.push({ line: i + 1, bloc: lines.slice(Math.max(0, i - 6), i + 1).join('\n') });
  });
  return out;
}

describe('les familles vivantes passent par le rabattement device', () => {
  it('habitants, porteurs, émeutiers (agents.js) — les deux dessinateurs nommés', () => {
    const b = blitsDe('agents.js', (l) => l.includes('frame * fh'));
    expect(b.length).toBe(2);
    for (const { bloc, line } of b) {
      expect(bloc, `agents.js:${line}`).toMatch(/snapDev\(sx - drawW \/ 2\)/);
      expect(bloc, `agents.js:${line}`).not.toMatch(/Math\.round\(sx/);
    }
    expect(src('agents.js')).toMatch(/drawH = Math\.max\(1, snapDev\(/);
  });
  // (Les coques PixelLab de la flotte et de l'amarre — isoBoat.img — sont parties avec
  // leurs sprites, audit du 05/10, MORT-6 : la garde porte sur la coque du kit.)
  it('bateaux (boatKit.js) — la coque du kit, et la pose de la flotte qui tangue', () => {
    expect(blitsDe('iso/boatKit.js', (l) => l.includes('ctx.drawImage(e.cv, bx, by, dw, dh)')).length).toBe(1);
    expect(src('iso/boatKit.js')).toMatch(/const bx = snapDev\(x \+ e\.ox \* z\), by = snapDev\(y \+ e\.oy \* z\)/);
    // Et la taille : sans elle, la position seule laisse la coupe dépendre du sous-pixel.
    expect(src('iso/boatKit.js')).toMatch(/const dw = snapDev\(side \* z\)/);
    expect(src('iso/isoPort.js')).toMatch(/y: snapDev\(p\.y \+ bob\)/);
    expect(src('iso/isoPort.js')).not.toMatch(/isoBoat\.img/);
  });
  it('bétail (critters.js) — sans import, l arrondi device est réécrit et reçoit dpr', () => {
    const s = src('critters.js');
    expect(s).not.toMatch(/^import /m);                       // le module reste sans import
    expect(s).toMatch(/export function drawCritterIso\([^)]*dpr = 1\)/);
    const b = blitsDe('critters.js', () => true);
    expect(b.length).toBe(1);
    expect(b[0].bloc).toMatch(/snap\(x - w \/ 2\), snap\(yFeet/);
    expect(b[0].bloc).not.toMatch(/Math\.round\(x/);
    // L'appelant passe bien le dpr — sinon le défaut 1 rend l'arrondi CSS.
    expect(src('iso/isoLivePaint.js')).toMatch(/drawCritterIso\(ctx, p\.x, p\.y, T \* z, cr, AGENT_SCALE, CM\.dpr\)/);
  });
  it('véhicules et bêtes de trait (isoUnits.js) — le même arrondi, importé', () => {
    expect(src('iso/isoUnits.js')).toMatch(/import \{ snapDev as snapU \} from '\.\.\/blitSnap\.js'/);
    expect(src('iso/isoUnits.js')).not.toMatch(/const snapU =/);
  });
  // Audit du 2026-10-05, BUG-98 : la clôture était posée à l'entier CSS
  // (Math.round(x0)…) quand arbres et réverbères, à côté, se calent sur le device.
  it('clôtures (isoLivePaint.js) — la bande se pose sur la grille device', () => {
    const b = blitsDe('iso/isoLivePaint.js', (l) => l.includes('st.canvas'));
    expect(b.length).toBe(1);
    expect(b[0].bloc).toMatch(/fsn = \(v\) => Math\.round\(v \* fdp\) \/ fdp/);
    expect(b[0].bloc).toMatch(/drawImage\(st\.canvas, fsn\(x0\), fsn\(y0\), fsn\(st\.cw \* s\), fsn\(st\.ch \* s\)\)/);
    expect(b[0].bloc).not.toMatch(/Math\.round\(x0\)/);
  });
});

// LA MÉTÉO À DPR 1,5 (audit du 2026-10-05, BUG-98) — rejouée pour de vrai, pas
// lue dans les sources : flocons, éclats au sol, étampes de la nappe de pluie et
// pose de la nappe étaient à l'entier CSS, donc sur un demi-pixel device à
// dpr 1,5 (Windows à 150 %) — flocons flous, pixels inégaux, nappe rééchantillonnée
// à chaque image. Pas de canvas sous Node : un faux document et de faux contextes
// qui notent chaque fillRect / drawImage.
describe('météo — flocons, éclats et gouttes sur la grille device', () => {
  const KEYS = ['ctx', 'cw', 'ch', 'rainF', 'season', 'gustF', 'ambianceK', 'walkRoadSet', 'buildingInfo', 'layout', 'lodActive', 'windX', 'layoutRecomputeAt'];
  let saved, savedCam, savedDoc;
  const fauxCtx = (log) => ({
    globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '',
    setTransform() {}, putImageData() {},
    clearRect: (...a) => effaces.push(a),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    fillRect: (...a) => log.push(a),
    drawImage: (cv, ...a) => log.push(a),
  });
  let principal, nappes, effaces;
  function monter(dpr, season) {
    saved = Object.fromEntries(KEYS.map((k) => [k, CM[k]]));
    savedCam = { ...CM.cam }; savedDoc = globalThis.document;
    principal = []; nappes = []; effaces = [];
    globalThis.document = {
      createElement: () => { const c = { width: 0, height: 0 }; const g = fauxCtx(nappes); c.getContext = () => g; return c; },
    };
    // Une voirie qui couvre tout l'écran : chaque tirage d'éclat touche du pavé.
    const road = new Set();
    for (let gx = -40; gx <= 40; gx += 1) for (let gy = -40; gy <= 40; gy += 1) road.add(gx * 10000 + gy);
    Object.assign(CM, {
      ctx: fauxCtx(principal), cw: 601, ch: 403, dpr, rainF: 1, season, gustF: 0, ambianceK: 1,
      walkRoadSet: road, buildingInfo: null, layout: null, lodActive: false, windX: 0.4, layoutRecomputeAt: 1,
    });
    Object.assign(CM.cam, { x: 0, y: 0, zoom: 1 });
  }
  afterEach(() => {
    if (!saved) return;
    for (const k of KEYS) CM[k] = saved[k];
    Object.assign(CM.cam, savedCam);
    if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
    saved = null;
  });
  const horsGrille = (log, dpr) => log.filter((a) => a.some((v) => typeof v === 'number' && !surGrille(v, dpr)));

  it('neige à dpr 1,5 : chaque flocon (coin et côté) tombe sur la grille device', () => {
    monter(1.5, WINTER);
    drawIsoRain(4321);
    const flocons = principal.slice(1);              // [0] = le voile plein écran (0, 0, cw, ch)
    expect(flocons.length).toBeGreaterThan(50);
    expect(horsGrille(flocons, 1.5)).toEqual([]);
  });
  it('neige à dpr 1 : l arrondi d avant, des entiers', () => {
    monter(1, WINTER);
    drawIsoRain(4321);
    const flocons = principal.slice(1);
    expect(flocons.length).toBeGreaterThan(50);
    expect(flocons.every((a) => a.every((v) => Number.isInteger(v)))).toBe(true);
  });
  it('pluie à dpr 1,5 : éclats, étampes dans la nappe et pose de la nappe sur la grille device', () => {
    monter(1.5, SUMMER);
    drawIsoRain(4321);
    const poses = principal.filter((a) => a.length === 4);   // drawImage(cv, x, y, w, h) ; fillRect du voile exclu ci-dessous
    const voile = principal.filter((a) => a[0] === 0 && a[1] === 0 && a[2] === CM.cw);
    expect(poses.length - voile.length).toBeGreaterThan(8);  // 8 poses de nappe + au moins un éclat
    expect(horsGrille(poses.filter((a) => !voile.includes(a)), 1.5)).toEqual([]);
    expect(nappes.length).toBeGreaterThan(20);
    expect(horsGrille(nappes, 1.5)).toEqual([]);
    // Chaque nappe s'efface en ENTIER, jusqu'à son dernier pixel device (pas à un
    // quart de pixel du bord, qui laissait une rangée de gouttes de la forge d'avant).
    expect(effaces.length).toBeGreaterThan(0);
    expect(horsGrille(effaces, 1.5)).toEqual([]);
  });
});
