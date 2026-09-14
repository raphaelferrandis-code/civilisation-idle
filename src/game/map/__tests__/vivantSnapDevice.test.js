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
  it('bateaux (isoPort.js) — la flotte et l amarre, coque PixelLab', () => {
    const b = blitsDe('iso/isoPort.js', (l) => l.includes('isoBoat.img'));
    expect(b.length).toBe(2);
    for (const { bloc, line } of b) {
      expect(bloc, `isoPort.js:${line}`).toMatch(/snapDev\(p\.x - dw \/ 2\)/);
      expect(bloc, `isoPort.js:${line}`).toMatch(/snapDev\(p\.y - dw \* [\w.]+ \+ bob\)/);
    }
    // Et la taille : sans elle, la position seule laisse la coupe dépendre du sous-pixel.
    expect((src('iso/isoPort.js').match(/const dw = Math\.max\(1, snapDev\(/g) || []).length).toBe(2);
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
});
