// fetchFountainAnims.mjs — assemble les strips d'EAU ANIMÉE des fontaines de
// place iso : public/pixelart/iso/anim/plaza-fountain-<ère>.png (8 frames
// horizontales, dimensions du crop).
//
//   Chaîne : la fontaine de chaque scène plaza-<ère>.png a été RECADRÉE (rects
//   FOUNTAIN ci-dessous) puis animée par PixelLab (animate_object v3,
//   custom_start_frame = crop, keep_first_frame=false, display_name
//   fountain-<ère>, hôte HOST). Ici on télécharge le zip de l'hôte et on
//   VERROUILLE chaque frame : seuls les pixels d'EAU restent animés, tout le
//   minéral est recopié du crop ORIGINAL de la scène → le strip blitté
//   par-dessus la scène est indiscernable d'elle hors eau (zéro wobble, zéro
//   couture), cf. isoPlaza FOUNTAIN_ANIM.
//
//   Verrouillage, pixel par pixel (dans le CONFINEMENT par ère, qui exclut les
//   props de bord du crop — obélisques cosmic, jardinières modern) :
//     eau à l'original                         -> pixel de la frame animée
//     à ≤2px d'eau ET la frame y met une
//       couleur d'eau claire (éclaboussure)    -> pixel de la frame animée
//     sinon                                    -> pixel du crop original
//
//   Lancer : node scripts/fetchFountainAnims.mjs   (filtre : … medieval)
//   IDEMPOTENT par présence du strip (sauf --force).
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const HOST = '34bdff47-15d5-48b4-bdfa-940882b16e34';
const OUT = 'public/pixelart/iso/anim';
const SCENES = 'public/pixelart/iso';
const FRAMES = 8;
const FORCE = process.argv.includes('--force');
const FILTER = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Rect du crop DANS la scène source (px scène) — miroir exact de FOUNTAIN_ANIM
// (isoRenderer.js) : le strip se re-projette sur la scène via ces rects.
const FOUNTAIN = {
  antique: { x: 100, y: 4, w: 108, h: 116 },
  medieval: { x: 110, y: 8, w: 126, h: 128 },
  industrial: { x: 108, y: 26, w: 116, h: 104 },
  modern: { x: 116, y: 26, w: 124, h: 100 },
  cosmic: { x: 92, y: 0, w: 110, h: 128 },
};

// Pixel « eau » du crop ORIGINAL (référence du masque), par ère.
const WATER = {
  antique: (r, g, b) => b > r + 12 && b > 120 && g > r - 6,
  medieval: (r, g, b) => b > r + 20 && b > 110 && g > 90,
  industrial: (r, g, b) => b > r + 20 && b > 110 && g > 90,
  modern: (r, g, b) => (b > r + 14 && b > 130) || (r > 210 && g > 225 && b > 235),
  cosmic: (r, g, b) => b > 150 && g > 140 && r < g - 25,
};
// Couleur d'eau CLAIRE dans une frame animée (critère éclaboussure, plus strict).
const SPLASH = {
  antique: (r, g, b) => b > r + 20 && b > 150,
  medieval: (r, g, b) => b > r + 30 && b > 140,
  industrial: (r, g, b) => b > r + 30 && b > 140,
  modern: (r, g, b) => (b > r + 20 && b > 160) || (r > 215 && g > 230 && b > 240),
  cosmic: (r, g, b) => b > 170 && g > 160 && r < g - 20,
};
// Confinement : zone du crop où l'animation a le DROIT de vivre (exclut les
// props de bord, surtout ceux coupés par le rect → jamais de couture).
const CONFINE = {
  antique: (x, y) => ell(x, y, 54, 66, 48, 46),
  medieval: (x, y) => ell(x, y, 63, 72, 56, 52),
  industrial: (x, y) => ell(x, y, 58, 56, 52, 44),
  modern: (x, y) => ell(x, y, 62, 54, 56, 42),
  // bassin bas + colonne centrale (la flèche d'énergie pulse aussi)
  cosmic: (x, y) => ell(x, y, 55, 76, 48, 48) || (Math.abs(x - 55) < 22 && y > 2),
};
const ell = (x, y, cx, cy, rx, ry) => {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
};
// ZONE JET (optionnelle, px crop) : colonne où le JET D'EAU monte AU-DESSUS du
// bassin. Le masque couleur seul le figeait (retour Raph : « l'animation est
// derrière le sprite fixe ») : le jet original blanc/gris n'est pas « bleu »,
// donc chaque frame recopiait le jet STATIQUE par-dessus le jet animé v3. Dans
// cette zone on anime les pixels qui BOUGENT vraiment entre frames (masque
// mouvement, cf. hotMask) — pas de critère couleur. Zone étroite : la margelle
// claire wobble dans les frames v3, elle ne doit pas entrer.
const JET = {
  modern: { x0: 46, x1: 78, y0: 12, y1: 40 },
};

// animation_id RÉEL par ère (≠ animation_group_id — extrait de l'URL des frames
// donnée par get_object, même piège que fetchCaravanVehAnims) : les frames se
// téléchargent en DIRECT sur backblaze, le zip de l'hôte ne les expose pas.
const ANIM_ID = {
  antique: '753c90cf-39a0-4f4d-b934-1f4f412d82bd',
  medieval: '1b323576-2dbe-4829-8f2c-6b0ec424865f',
  industrial: '71d6072e-3684-4608-a2d2-f05f49953f78',
  modern: '45b7125f-0801-4240-8c4a-4b7eb149587e',
  cosmic: '5ba795e5-4fe9-4031-990c-be2ce7b9ac4b',
};
const OWNER = 'f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const frameUrl = (era, i) => `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${OWNER}/${HOST}/animations/${ANIM_ID[era]}/unknown/${i}.png`;

fs.mkdirSync(OUT, { recursive: true });

const want = Object.keys(FOUNTAIN).filter((e) => !FILTER || e === FILTER);
const missing = () => want.filter((e) => FORCE || !fs.existsSync(path.join(OUT, `plaza-fountain-${e}.png`)));
if (!missing().length) { console.log('strips déjà présents, rien à faire (--force pour refaire)'); process.exit(0); }

// ── 1. Télécharge les 8 frames de chaque ère (retente si pas prêtes) ────────
const byEra = {};
for (const era of missing()) {
  for (let t = 0; t < 8 && !byEra[era]; t += 1) {
    try {
      const frames = [];
      for (let i = 0; i < FRAMES; i += 1) {
        const r = await fetch(frameUrl(era, i));
        if (!r.ok) throw new Error(`frame ${i}: HTTP ${r.status}`);
        frames.push({ f: i, data: Buffer.from(await r.arrayBuffer()) });
      }
      byEra[era] = frames;
      console.log(`${era}: 8 frames téléchargées`);
    } catch (err) {
      console.log(`${era}: pas prêt (${err.message})`);
      await sleep(12000);
    }
  }
  if (!byEra[era]) { console.error(`${era} — frames indisponibles, relancer plus tard`); process.exit(1); }
}

// ── 2. Verrouille et assemble chaque strip ───────────────────────────────────
for (const era of missing()) {
  const rect = FOUNTAIN[era];
  const scene = PNG.sync.read(fs.readFileSync(path.join(SCENES, `plaza-${era}.png`)));
  // crop original re-extrait de la scène (référence EXACTE du rendu)
  const orig = new PNG({ width: rect.w, height: rect.h });
  PNG.bitblt(scene, orig, rect.x, rect.y, rect.w, rect.h, 0, 0);

  // masque eau + carte de distance ≤2px (dilatation en 2 passes)
  const isWater = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const i = (y * rect.w + x) * 4;
      if (orig.data[i + 3] > 60 && WATER[era](orig.data[i], orig.data[i + 1], orig.data[i + 2])) isWater[y * rect.w + x] = 1;
    }
  }
  const nearWater = new Uint8Array(isWater);
  for (let pass = 0; pass < 2; pass += 1) {
    const src = Uint8Array.from(nearWater);
    for (let y = 0; y < rect.h; y += 1) {
      for (let x = 0; x < rect.w; x += 1) {
        if (src[y * rect.w + x]) continue;
        if ((x > 0 && src[y * rect.w + x - 1]) || (x < rect.w - 1 && src[y * rect.w + x + 1])
          || (y > 0 && src[(y - 1) * rect.w + x]) || (y < rect.h - 1 && src[(y + 1) * rect.w + x])) {
          nearWater[y * rect.w + x] = 1;
        }
      }
    }
  }

  const frames = byEra[era].sort((a, b) => a.f - b.f).slice(0, FRAMES).map((e) => PNG.sync.read(e.data));
  if (frames[0].width !== rect.w || frames[0].height !== rect.h) {
    console.warn(`${era} — frames ${frames[0].width}x${frames[0].height} ≠ crop ${rect.w}x${rect.h}, skip`);
    continue;
  }

  // Masque MOUVEMENT (zone jet) : pixel qui diffère nettement de l'original
  // (d>30) dans ≥2 frames = vraie eau en mouvement (jet qui monte/retombe).
  // STATIQUE pour tout le strip → pas de scintillement de sélection.
  const jet = JET[era];
  const hotMask = new Uint8Array(rect.w * rect.h);
  if (jet) {
    const hits = new Uint8Array(rect.w * rect.h);
    for (const fr of frames) {
      for (let y = jet.y0; y <= jet.y1; y += 1) {
        for (let x = jet.x0; x <= jet.x1; x += 1) {
          const k = y * rect.w + x, i = k * 4;
          const d = Math.abs(orig.data[i] - fr.data[i])
            + Math.abs(orig.data[i + 1] - fr.data[i + 1])
            + Math.abs(orig.data[i + 2] - fr.data[i + 2]);
          if (d > 30) hits[k] += 1;
        }
      }
    }
    for (let k = 0; k < hits.length; k += 1) if (hits[k] >= 2) hotMask[k] = 1;
  }

  // Verrouille les 8 frames (aucun ping-pong : retour Raph, les ondulations
  // « rembobinaient » à l'aller-retour — cercles qui se contractent).
  const locked = frames.map((fr) => {
    const img = new PNG({ width: rect.w, height: rect.h });
    for (let y = 0; y < rect.h; y += 1) {
      for (let x = 0; x < rect.w; x += 1) {
        const k = y * rect.w + x, i = k * 4;
        let useAnim = false;
        if (CONFINE[era](x, y)) {
          if (isWater[k] || hotMask[k]) useAnim = true;
          else if (nearWater[k] && fr.data[i + 3] > 60
            && SPLASH[era](fr.data[i], fr.data[i + 1], fr.data[i + 2])) useAnim = true;
        }
        const src = useAnim ? fr.data : orig.data;
        img.data[i] = src[i]; img.data[i + 1] = src[i + 1];
        img.data[i + 2] = src[i + 2]; img.data[i + 3] = src[i + 3];
      }
    }
    return img;
  });

  // BOUCLE AVANT + fenêtre anti-pop : les anims v3 dérivent → la couture
  // dernière→première peut sauter. On garde la fenêtre (début s, longueur L)
  // dont la couture est la plus proche d'un pas d'animation normal :
  // cost = diff(première, dernière) / diff moyenne entre frames adjacentes.
  const pxDiff = (A, B) => {
    let d = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const dd = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
      if (dd > 20) d += 1;
    }
    return d;
  };
  let bestWin = null;
  for (const L of [8, 7, 6]) {
    for (let s = 0; s + L <= locked.length; s += 1) {
      let adj = 0;
      for (let f = 0; f < L - 1; f += 1) adj += pxDiff(locked[s + f], locked[s + f + 1]);
      adj /= (L - 1);
      const seam = pxDiff(locked[s], locked[s + L - 1]);
      const cost = seam / Math.max(1, adj);
      // léger bonus aux fenêtres longues (plus de matière animée)
      const score = cost - L * 0.02;
      if (!bestWin || score < bestWin.score) bestWin = { s, L, cost, adj: adj | 0, seam, score };
    }
  }
  const win = locked.slice(bestWin.s, bestWin.s + bestWin.L);
  console.log(`${era} — fenêtre f${bestWin.s}..f${bestWin.s + bestWin.L - 1} (couture ${bestWin.seam}px vs pas moyen ${bestWin.adj}px)`);

  const strip = new PNG({ width: rect.w * win.length, height: rect.h });
  let animPx = 0;
  for (let f = 0; f < win.length; f += 1) {
    PNG.bitblt(win[f], strip, 0, 0, rect.w, rect.h, f * rect.w, 0);
    animPx += pxDiff(win[f], orig);
  }
  const outPath = path.join(OUT, `plaza-fountain-${era}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(strip, { deflateLevel: 9 }));
  console.log(`${era} → ${outPath} (${rect.w}×${rect.h} ×${win.length}, ~${(animPx / win.length) | 0} px animés/frame)`);
}
console.log('OK — strips fontaines dans', OUT);
