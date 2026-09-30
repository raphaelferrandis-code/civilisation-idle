// L'OMBRE PORTÉE DES HABITATIONS QUI N'EN ONT PAS — « une seule main » (2026-09-29).
//
// Chantier « cohérence de l'univers », étendu à toutes les ères sur la demande de
// Raph. Presque toutes les habitations ont une ombre CUITE dans leur sprite : une
// tache opaque très sombre (33,26,29), au sol, du côté droit de la base — la lumière
// vient du haut-gauche (cf. la fiche lumière). Quatre n'en ont aucune : `crafthouse`
// (bandes 2-3), `manor` (2-4), `insula` (4) et `terrace` (5). Dans une rue où leurs
// voisines portent chacune leur ombre, elles flottent sur le pavé : le défaut même que
// Raph avait nommé pour les buissons de terre-plein (« le buisson vole »).
//
// On la calcule depuis la SILHOUETTE du sprite, sur SA grille de pixels (le rendu la
// pose avec la même échelle et la même origine que le sprite) : la BASE du bâtiment
// (les derniers pixels de chaque colonne, du coin sud vers la droite) balayée vers le
// bas-droite, sur une courte longueur ; seuls les pixels VIDES du sprite la reçoivent ;
// un bouchage d'une passe arrondit la tache comme les ombres dessinées. Le sprite
// n'est pas touché sur le disque. (1er jet : décaler toute la moitié basse de
// l'encre — murs compris — posait une DALLE sombre verticale à droite des bâtiments
// hauts, insula et manoir : une ombre au sol reste une bande basse.)
//
// PUR : aucun import, aucun Canvas — testable hors navigateur.

// Variantes sans ombre cuite (vérifié sur planche, 2026-09-29 : les douze autres en
// ont une ; `hut` et `longhouse` gardent leur petite ombre bleutée d'origine).
export const HOUSE_CAST_SHADOW = new Set(["crafthouse", "manor", "insula", "terrace"]);
// Couleur des ombres cuites, relevée sur townhouse, stonehouse et courtyard.
export const HOUSE_SHADOW_RGB = [33, 26, 29];

/**
 * Pixels d'ombre d'un sprite, en coordonnées du PNG (x, y entiers, pouvant sortir à
 * droite et en bas de l'encre). `alpha(x, y)` rend l'alpha du PNG (0 hors image) ;
 * `bb` = boîte d'encre { x0, y0, w, h }.
 * Renvoie { px: [[x, y], …], x0, y0, x1, y1 } (boîte des pixels d'ombre), ou null.
 */
export function houseCastShadow(alpha, bb, opts = {}) {
  const band = opts.band ?? 0.09;          // épaisseur de la base qui projette, en part de hauteur
  const kx = opts.kx ?? 0.13;              // longueur de l'ombre, en part de largeur
  const solid = (x, y) => alpha(x, y) > 16;
  const x1b = bb.x0 + bb.w - 1, y1b = bb.y0 + bb.h - 1;
  // Coin SUD : la colonne la plus basse de l'encre (médiane si plusieurs).
  let maxB = -1;
  const bottom = new Map();
  for (let x = bb.x0; x <= x1b; x += 1) {
    for (let y = y1b; y >= bb.y0; y -= 1) {
      if (solid(x, y)) { bottom.set(x, y); if (y > maxB) maxB = y; break; }
    }
  }
  if (maxB < 0) return null;
  const southCols = [...bottom].filter(([, y]) => y === maxB).map(([x]) => x);
  const xs = southCols[southCols.length >> 1];
  const sx = Math.max(2, Math.round(bb.w * kx));
  const bh = Math.max(2, Math.round(bb.h * band));
  const set = new Set();
  const key = (x, y) => x + "," + y;
  // Balayage de la base : chaque pixel des `bh` derniers de sa colonne (à droite du
  // coin sud) glisse de 1 à sx pixels vers la droite, d'un demi-pixel vers le bas
  // par pas — la pente du sol isométrique.
  // Seules les colonnes qui TOUCHENT LE SOL projettent : la base de la face droite
  // monte du coin sud avec la pente du losange (un demi-pixel par colonne). Une
  // colonne dont le bas reste au-dessus de cette ligne ne porte qu'un débord — un
  // bout de toit, une corniche — et projetait une fine ligne sombre en l'air.
  const groundY = (x) => maxB - (x - xs) * 0.5;
  let yTop = Infinity;
  for (const [x, b] of bottom) {
    if (x < xs - 1) continue;
    if (b < groundY(x) - 2) continue;
    for (let y = b - bh + 1; y <= b; y += 1) {
      if (!solid(x, y)) continue;
      for (let d = 1; d <= sx; d += 1) {
        const tx = x + d, ty = y + Math.round(d * 0.5);
        if (!solid(tx, ty)) { set.add(key(tx, ty)); if (ty < yTop) yTop = ty; }
      }
    }
  }
  // Bouchage d'une passe : un pixel vide entouré d'ombre sur 3 côtés en devient —
  // la tache s'arrondit au lieu de garder les dents de la silhouette.
  const add = [];
  for (const k of set) {
    const c = k.indexOf(",");
    const x = +k.slice(0, c), y = +k.slice(c + 1);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = key(nx, ny);
      if (set.has(nk) || solid(nx, ny) || ny < yTop) continue;
      let n = 0;
      for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (set.has(key(nx + ex, ny + ey))) n += 1;
      if (n >= 3) add.push(nk);
    }
  }
  for (const k of add) set.add(k);
  if (!set.size) return null;
  const px = [];
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const k of set) {
    const c = k.indexOf(",");
    const x = +k.slice(0, c), y = +k.slice(c + 1);
    px.push([x, y]);
    if (x < X0) X0 = x; if (x > X1) X1 = x;
    if (y < Y0) Y0 = y; if (y > Y1) Y1 = y;
  }
  return { px, x0: X0, y0: Y0, x1: X1, y1: Y1 };
}
