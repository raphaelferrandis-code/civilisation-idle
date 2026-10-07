// LA CHAÎNE DE PRÉPARATION DES SONS ENREGISTRÉS (scripts/importSons.mjs) : ses lectures des
// sorties de ffmpeg et ses arguments, sans lancer ffmpeg. Le piège gardé : ebur128 écrit
// une ligne par tranche de 100 ms avant son résumé, et la première dit toujours −70 LUFS.
import { describe, it, expect } from 'vitest';
import { lireDuree, lireFlux, lireCrete, lireSonie, argsEncodage, defautsEntree, filtresForme, brouiller, bouclerPrise, SR } from '../../scripts/importSons.mjs';

describe('importSons — les lectures de ffmpeg', () => {
  it('la durée, le flux, la crête', () => {
    const info = '  Duration: 00:01:02.50, start: 0.000000, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 44100 Hz, stereo, s16, 1411 kb/s';
    expect(lireDuree(info)).toBeCloseTo(62.5, 9);
    expect(lireFlux(info)).toEqual({ codec: 'pcm_s16le ([1][0][0][0] / 0x0001)', hz: 44100, canaux: 'stereo' });
    expect(lireCrete('[Parsed_volumedetect_0] mean_volume: -27.4 dB\n[Parsed_volumedetect_0] max_volume: -6.2 dB')).toBe(-6.2);
    expect(lireDuree('rien')).toBeNull();
  });

  it('la sonie se lit dans le résumé, pas dans les tranches de 100 ms', () => {
    const texte = '[Parsed_ebur128_0] t: 0.1  TARGET:-23 LUFS  M:-120.7 S:-120.7  I: -70.0 LUFS  LRA: 0.0 LU\n'
      + '[Parsed_ebur128_0] Summary:\n\n  Integrated loudness:\n    I:         -21.8 LUFS\n    Threshold: -32.2 LUFS\n\n  True peak:\n    Peak:       -2.7 dBFS';
    expect(lireSonie(texte)).toEqual({ lufs: -21.8, crete: -2.7 });
  });
});

describe('importSons — les arguments', () => {
  it('mono, 32 kHz, Ogg ; la coupe ; le passe-haut ; la crête ramenée à −1 dBFS plus le gain', () => {
    const e = { id: 'oiseau-merle-1', source: 'a.wav', debut: 0.4, fin: 5.2, gain: -3, passeHaut: 120 };
    const a = argsEncodage(e, { source: 'S', sortie: 'O.ogg', crete: -12, duree: 4.8 });
    const af = a[a.indexOf('-af') + 1];
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2)).toEqual(['-ss', '0.4']);
    expect(a[a.indexOf('-t') + 1]).toBe('4.800');
    expect(af).toContain('aformat=channel_layouts=mono');
    expect(af).toContain(`aresample=${SR}`);
    expect(af).toContain('highpass=f=120');
    expect(af).toContain('volume=8.00dB');            // −1 − (−12) − 3
    expect(af).toMatch(/afade=t=out:st=4\.740:d=0\.06/);
    expect(a.slice(-3)).toEqual(['-q:a', '4', 'O.ogg']);
    expect(a).toContain('libvorbis');
  });

  it('une entrée fautive est refusée, avec sa raison', () => {
    expect(defautsEntree({ id: 'oiseau-merle-1', source: 'a.wav' })).toEqual([]);
    expect(defautsEntree({ id: 'Mauvais id', source: 'a.wav' }).length).toBe(1);
    expect(defautsEntree({ id: 'oiseau-merle-1' })).toEqual(['source manquante']);
    expect(defautsEntree({ id: 'oiseau-merle-1', source: 'a', debut: 3, fin: 2 })).toEqual(['fin invalide']);
    expect(defautsEntree({ id: 'brouhaha-rue-1', source: 'a', brouiller: { grain: 0.2, duree: 30 } })).toEqual([]);
    expect(defautsEntree({ id: 'brouhaha-rue-1', source: 'a', brouiller: { grain: 3, duree: 30 } }).length).toBe(1);
    expect(defautsEntree({ id: 'brouhaha-rue-1', source: 'a', brouiller: { grain: 0.2, duree: 900 } }).length).toBe(1);
    expect(defautsEntree({ id: 'sabots-pas-1', source: 'a', boucler: { fondu: 0.5 } })).toEqual([]);
    expect(defautsEntree({ id: 'sabots-pas-1', source: 'a', boucler: { fondu: 0 } }).length).toBe(1);
    expect(defautsEntree({ id: 'sabots-pas-1', source: 'a', boucler: { fondu: 0.5 }, brouiller: { grain: 0.2, duree: 30 } }).length).toBe(1);
  });

  it('une foule entendue de loin passe aussi par un passe-bas', () => {
    expect(filtresForme({ passeHaut: 120, passeBas: 5000 })).toContain('lowpass=f=5000');
    expect(filtresForme({}).join(',')).not.toContain('lowpass');
  });
});

describe('importSons — la foule sans langue (brouiller)', () => {
  // Un bruit blanc d'une minute, à graine (le hasard des tests ne varie pas).
  function bruit(s, n) {
    let a = s >>> 0;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) { a = (a * 1664525 + 1013904223) >>> 0; out[i] = a / 4294967296 * 2 - 1; }
    return out;
  }
  const src = bruit(7, 60 * SR);

  it('rend une boucle de la durée voulue, au grain près, et toujours la même', () => {
    const b = brouiller(src, SR, { grain: 0.2, duree: 30, graine: 3 });
    const H = 0.1 * SR;
    expect(b.length % H).toBe(0);
    expect(Math.abs(b.length / SR - 30)).toBeLessThan(0.1);
    expect(brouiller(src, SR, { grain: 0.2, duree: 30, graine: 3 })).toEqual(b);
    expect(brouiller(src, SR, { grain: 0.2, duree: 30, graine: 4 })).not.toEqual(b);
  });

  it('la boucle se referme sans saut : la fin rejoint le début comme deux voisins', () => {
    const b = brouiller(src, SR, { grain: 0.25, duree: 20, graine: 1 });
    const sauts = [];
    for (let i = 1; i < b.length; i += 1) sauts.push(Math.abs(b[i] - b[i - 1]));
    sauts.sort((x, y) => x - y);
    expect(Math.abs(b[0] - b[b.length - 1])).toBeLessThanOrEqual(sauts[Math.floor(sauts.length * 0.999)]);
  });

  it('la puissance reste constante : deux grains sans lien ne creusent ni ne gonflent', () => {
    const b = brouiller(src, SR, { grain: 0.2, duree: 30, graine: 5 });
    const fen = Math.round(0.05 * SR), e = [];
    for (let i = 0; i + fen <= b.length; i += fen) {
      let s = 0;
      for (let j = 0; j < fen; j += 1) s += b[i + j] * b[i + j];
      e.push(Math.sqrt(s / fen));
    }
    const moy = e.reduce((s, v) => s + v, 0) / e.length;
    let srcE = 0;
    for (let i = 0; i < SR; i += 1) srcE += src[i] * src[i];
    expect(moy).toBeCloseTo(Math.sqrt(srcE / SR), 1);
    for (const v of e) expect(Math.abs(v - moy) / moy).toBeLessThan(0.2);
  });

  it('refuse une prise plus courte qu’un grain', () => {
    expect(() => brouiller(new Float32Array(100), SR, { grain: 0.2, duree: 10 })).toThrow();
  });
});

describe('importSons — la boucle en fondu (boucler)', () => {
  it('la prise perd la longueur du fondu, et sa fin rejoint son début sans saut', () => {
    const n = 10 * SR, src = new Float32Array(n);
    for (let i = 0; i < n; i += 1) src[i] = Math.sin((2 * Math.PI * 3.3 * i) / SR) * 0.5 + Math.sin(i * 0.37) * 0.1;
    const b = bouclerPrise(src, SR, 0.5);
    expect(b.length).toBe(n - 0.5 * SR);
    const sauts = [];
    for (let i = 1; i < b.length; i += 1) sauts.push(Math.abs(b[i] - b[i - 1]));
    sauts.sort((x, y) => x - y);
    expect(Math.abs(b[0] - b[b.length - 1])).toBeLessThanOrEqual(sauts[Math.floor(sauts.length * 0.999)]);
    // Hors du fondu, la prise est intacte.
    expect(b[SR]).toBe(src[SR]);
    expect(() => bouclerPrise(new Float32Array(100), SR, 0.5)).toThrow();
  });
});
