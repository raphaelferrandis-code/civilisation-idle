// FILET D'EXCEPTION DE LA CARTE (frameGuard.js, audit du 2026-10-05, BUG-32).
// Sans lui, une passe qui levait se rejouait 30 à 60 fois par seconde dans la
// console, et une levée entre save() et restore() laissait la pile du contexte
// grossir d'une frame à l'autre (clip, transformation ou multiply restés posés).
//
// Pas de canvas sous Node : un FAUX contexte qui tient une vraie pile d'états.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reportMapError, resetMapCtx, recoverMapFrame, MAP_ERROR_LOG_MS } from '../frameGuard.js';

function makeCtx() {
  const keys = ['globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled', 'filter', 'm', 'clip'];
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, filter: 'none',
    m: [1, 0, 0, 1, 0, 0], clip: false,
    _st: [],
    save() { this._st.push(keys.map((k) => (k === 'm' ? [...this.m] : this[k]))); },
    restore() { const s = this._st.pop(); if (s) keys.forEach((k, i) => { this[k] = s[i]; }); },
    setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; },
    translate(x, y) { this.m[4] += x; this.m[5] += y; },
    scale(sx, sy) { this.m[0] *= sx; this.m[3] *= sy; },
  };
}

// Une frame qui lève au milieu de ses paires save/restore (le halo d'émeute, le
// clip du fleuve, les nuages en multiply remis « à la main »).
function brokenFrame(ctx) {
  ctx.save();
  ctx.translate(120, 40); ctx.scale(1, 0.5);
  ctx.save();
  ctx.clip = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.3;
  throw new Error('kind fautif');
}

describe('filet de la boucle de la carte', () => {
  it('une frame qui lève entre save() et restore() ne fait plus grossir la pile', () => {
    const ctx = makeCtx();
    const logs = [];
    for (let f = 0; f < 300; f += 1) {
      try { brokenFrame(ctx); } catch (e) { recoverMapFrame(e, ctx, 2, (...a) => logs.push(a)); }
      expect(ctx._st.length).toBe(0);
    }
    expect(ctx.m).toEqual([2, 0, 0, 2, 0, 0]);
    expect(ctx.clip).toBe(false);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.globalAlpha).toBe(1);
    // L'état d'un canvas neuf, celui de chaque frame normale (cf. resetMapCtx).
    expect(ctx.imageSmoothingEnabled).toBe(true);
    // 300 frames en bien moins de 5 s : UN message, et c'est l'Error elle-même
    // (la console en affiche la pile).
    expect(logs.length).toBe(1);
    expect(logs[0][1]).toBeInstanceOf(Error);
    expect(logs[0][1].message).toBe('kind fautif');
  });

  it('un mode de composition posé HORS de toute paire save/restore est relevé', () => {
    const ctx = makeCtx();
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(2px)';
    // Le drone d'isoSky mémorise et coupe le lissage AVANT son save() : une levée
    // au milieu le laissait coupé pour toutes les frames suivantes.
    ctx.imageSmoothingEnabled = false;
    resetMapCtx(ctx, 1.5);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.filter).toBe('none');
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.m).toEqual([1.5, 0, 0, 1.5, 0, 0]);
  });

  it('un contexte absent ou perdu ne fait pas tomber le filet', () => {
    expect(() => resetMapCtx(null, 1)).not.toThrow();
    const lost = { restore() { throw new Error('contexte perdu'); } };
    expect(() => recoverMapFrame(new Error('x'), lost, 1, () => {})).not.toThrow();
  });
});

describe('journal limité', () => {
  it('au plus un message par poste et par fenêtre, les tus comptés au suivant', () => {
    const logs = [];
    const log = (...a) => logs.push(a);
    const t0 = 1e6;
    expect(reportMapError('essai-a', new Error('1'), t0, log)).toBe(true);
    for (let i = 1; i <= 40; i += 1) expect(reportMapError('essai-a', new Error('n'), t0 + i * 16, log)).toBe(false);
    // Un AUTRE poste n'est pas tu par le premier.
    expect(reportMapError('essai-b', new Error('b'), t0 + 100, log)).toBe(true);
    expect(logs.length).toBe(2);
    // La fenêtre passée : nouveau message, qui compte les 40 tus.
    expect(reportMapError('essai-a', new Error('2'), t0 + MAP_ERROR_LOG_MS + 1, log)).toBe(true);
    expect(logs.length).toBe(3);
    expect(logs[2][0]).toContain('+40');
    expect(logs[2][1].message).toBe('2');
  });
});

// CÂBLAGE dans cityMapRuntime. Monter la vraie carte sous vitest coûte ~4 s
// (vérifié une fois à la main : plan relancé une fois par fenêtre, pile à 0,
// boucle ré-armée) ; on garde ici le garde-fou bon marché : personne ne doit
// appeler le corps NU de la frame ou du plan, sans quoi le filet saute en silence.
describe('câblage du filet dans cityMapRuntime', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'cityMapRuntime.js'), 'utf8');
  const count = (re) => (src.match(re) || []).length;

  it('rAF, forceFrame et captureFrame passent par la frame enveloppée', () => {
    expect(src).toMatch(/function frame\(now\) \{\s*try \{\s*frameBody\(now\);\s*\} catch \(e\) \{\s*recoverMapFrame\(/);
    // La définition + l'unique appel, dans l'enveloppe.
    expect(count(/\bframeBody\(/g)).toBe(2);
  });

  it('le plan passe par sa garde d\'échec', () => {
    expect(src).toMatch(/function cityMapEnsureLayout\(now, deps\) \{\s*if \(now - \(CM\.layoutFailAt \?\? -Infinity\) < LAYOUT_RETRY_MS\) return;/);
    expect(count(/\bcityMapEnsureLayoutInner\(/g)).toBe(2);
  });
});
