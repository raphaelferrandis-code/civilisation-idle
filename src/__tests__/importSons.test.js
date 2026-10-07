// LA CHAÎNE DE PRÉPARATION DES SONS ENREGISTRÉS (scripts/importSons.mjs) : ses lectures des
// sorties de ffmpeg et ses arguments, sans lancer ffmpeg. Le piège gardé : ebur128 écrit
// une ligne par tranche de 100 ms avant son résumé, et la première dit toujours −70 LUFS.
import { describe, it, expect } from 'vitest';
import { lireDuree, lireFlux, lireCrete, lireSonie, argsEncodage, defautsEntree, SR } from '../../scripts/importSons.mjs';

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
  });
});
