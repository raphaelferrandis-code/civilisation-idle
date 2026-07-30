// Coloris du fleuve piloté par l'état de la partie (waterBandKey / stepWaterBand).
//
// Demande de Raph, 2026-07-30 : « r7 azur quand tout va bien, r16 turquoise quand
// rupture/usure haute, r1 bleu clair quand hiver, et l'actuel pour quand il pleut ».
// Deux choses se testent ici, et aucune n'est du dessin : la TABLE DE DÉCISION
// (qui gagne quand deux états sont vrais en même temps) et la CONTINUITÉ du fondu.
import { describe, it, expect } from "vitest";
// `waterBandKey` reçoit des BOOLÉENS, pas la saison brute : c'est le renderer qui
// traduit `CM.season === WINTER` (seasonMode.js : WINTER = 3). La table de décision
// n'a pas à connaître le codage des saisons pour être testable.
import { waterBandKey, stepWaterBand, waterTilesTune, WATER_SHEETS } from "../iso/isoRenderer.js";

describe("coloris du fleuve selon l'état", () => {
  it("azur au beau fixe", () => {
    expect(waterBandKey({})).toBe('beau');
    expect(waterBandKey({ rainF: 0.1 })).toBe('beau');       // bruine sous le seuil
  });

  it("ardoise dès qu'il pleut vraiment", () => {
    expect(waterBandKey({ rainF: 0.6 })).toBe('pluie');
  });

  it("bleu pâle en hiver — et la NEIGE ne compte pas comme une averse", () => {
    expect(waterBandKey({ winter: true })).toBe('hiver');
    // C'est le cas qui justifie l'ordre des branches : en hiver l'averse tombe en
    // neige (precipKind), donc `snow` doit rendre la branche pluie inatteignable,
    // sinon un hiver pluvieux repeindrait le fleuve en ardoise sur un sol blanc.
    expect(waterBandKey({ winter: true, rainF: 1, snow: true })).toBe('hiver');
  });

  it("turquoise quand l'usure est haute", () => {
    expect(waterBandKey({ ruined: true })).toBe('usure');
  });

  it("PRIORITÉS : averse > hiver > usure > beau", () => {
    expect(waterBandKey({ rainF: 1, winter: true, ruined: true })).toBe('pluie');
    expect(waterBandKey({ winter: true, ruined: true })).toBe('hiver');
    expect(waterBandKey({ ruined: true })).toBe('usure');
  });

  it("l'A/B `calm = false` court-circuite tout et rejoue la bande brute", () => {
    expect(waterBandKey({ calm: false, winter: true, ruined: true, rainF: 1 })).toBe('brute');
  });

  it("les quatre clés existent vraiment côté réglage", () => {
    // Une clé inventée retomberait silencieusement sur la pluie dans waterSheet :
    // on vérifie que la table de décision et la table des fichiers s'accordent.
    const cles = new Set(['beau', 'usure', 'hiver', 'pluie', 'brute']);
    for (const etat of [{}, { rainF: 1 }, { winter: true }, { ruined: true }, { calm: false }]) {
      expect(cles.has(waterBandKey(etat))).toBe(true);
    }
  });
});

describe("accord de chaque coloris", () => {
  // Le liseré du ruban, le bas-fond du MUR DE QUAI et les reflets nocturnes lisent
  // tous leur teinte dans cette table. Un coloris ajouté sans son accord retombe
  // silencieusement sur l'ardoise : rien ne planterait, le fleuve serait juste
  // azur avec une lisière grise. D'où ces gardes sur la table elle-même.
  const lum = (s) => { const c = s.split(',').map(Number); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

  it("chaque clé du sélecteur a une entrée complète", () => {
    const cles = new Set([
      waterBandKey({}), waterBandKey({ rainF: 1 }), waterBandKey({ winter: true }),
      waterBandKey({ ruined: true }), waterBandKey({ calm: false }),
    ]);
    expect(cles.size).toBe(5);                       // les cinq états mènent à cinq bandes
    for (const k of cles) {
      const e = WATER_SHEETS[k];
      expect(e, `coloris « ${k} » absent de la table`).toBeTruthy();
      expect(e.src).toMatch(/^\/pixelart\/water\/.+\.png$/);
      expect(e.pale).toMatch(/^\d+,\d+,\d+$/);
      expect(e.wash).toMatch(/^\d+,\d+,\d+$/);
      expect(typeof e.dim).toBe('number');
      expect(e.shore).toHaveLength(3);
      expect(e.quay).toHaveLength(2);
    }
  });

  it("les 3 bandes du bas-fond vont du halo doux au liseré VIF", () => {
    // L'ordre porte le sens : « l'eau est moins profonde au bord », donc plus
    // claire. Inversé, le liseré assombrirait la rive au lieu de l'éclaircir.
    for (const [k, e] of Object.entries(WATER_SHEETS)) {
      expect(lum(e.shore[0]), `${k} : c1 doit être plus sombre que c2`).toBeLessThan(lum(e.shore[1]));
      expect(lum(e.shore[1]), `${k} : c2 doit être plus sombre que c3`).toBeLessThan(lum(e.shore[2]));
    }
  });

  it("l'ardoise garde EXACTEMENT ses valeurs historiques", () => {
    // Le coloris de pluie est l'existant validé le 2026-07-16 (liseré) et
    // d'origine (bas-fond de quai) : faire suivre les autres ne doit rien y changer.
    expect(WATER_SHEETS.pluie.shore).toEqual(['120,160,175', '150,192,205', '190,224,232']);
    expect(WATER_SHEETS.pluie.quay).toEqual(['rgba(150,184,180,0.50)', 'rgba(202,224,214,0.62)']);
    expect(WATER_SHEETS.pluie.dim).toBe(0);
    // …et la bande brute de l'A/B non plus, sinon comparer ne voudrait rien dire.
    expect(WATER_SHEETS.brute.shore).toEqual(WATER_SHEETS.pluie.shore);
    expect(WATER_SHEETS.brute.dim).toBe(0);
  });

  it("seul l'état normal est assombri (demande de Raph)", () => {
    expect(WATER_SHEETS.beau.dim).toBeGreaterThan(0);
    for (const k of ['usure', 'hiver', 'pluie', 'brute']) expect(WATER_SHEETS[k].dim).toBe(0);
    // Et l'assombrissement doit rester LÉGER : il s'ajoute au tint, au-delà de
    // ~0,3 le ruban vire à l'ardoise et on perd le coloris qu'on venait de cuire.
    expect(WATER_SHEETS.beau.dim).toBeLessThan(0.3);
  });
});

describe("fondu entre coloris", () => {
  const FADE = waterTilesTune.fade;
  const neuf = () => ({ key: null, from: null, mix: 1, at: -1 });

  it("la première frame ne fond pas depuis rien", () => {
    const st = stepWaterBand(neuf(), 10, 'beau', FADE);
    expect(st).toMatchObject({ key: 'beau', from: 'beau', mix: 1 });
  });

  it("un changement d'état ouvre un fondu qui se termine, et ne recule jamais", () => {
    let st = stepWaterBand(neuf(), 0, 'beau', FADE);
    st = stepWaterBand(st, 1, 'pluie', FADE);
    expect(st.from).toBe('beau');
    expect(st.mix).toBe(0);
    let prev = -1;
    for (let t = 1; t <= 1 + FADE * 2; t += 1 / 60) {
      st = stepWaterBand(st, t, 'pluie', FADE);
      expect(st.mix).toBeGreaterThanOrEqual(prev);
      prev = st.mix;
    }
    expect(st.mix).toBe(1);
  });

  it("un second changement EN PLEIN fondu repart de la bande dominante", () => {
    let st = stepWaterBand(neuf(), 0, 'beau', FADE);
    st = stepWaterBand(st, 1, 'pluie', FADE);
    // à peine entamé : c'est encore l'azur qu'on voit, on doit repartir de lui
    st = stepWaterBand(st, 1.1, 'pluie', FADE);
    st = stepWaterBand(st, 1.1, 'hiver', FADE);
    expect(st.from).toBe('beau');
    // largement avancé : c'est la pluie qu'on voit, on repart d'elle
    let st2 = stepWaterBand(neuf(), 0, 'beau', FADE);
    st2 = stepWaterBand(st2, 1, 'pluie', FADE);
    for (let t = 1; t <= 1 + FADE; t += 1 / 60) st2 = stepWaterBand(st2, t, 'pluie', FADE);
    st2 = stepWaterBand(st2, 1 + FADE + 1, 'hiver', FADE);
    expect(st2.from).toBe('pluie');
  });

  it("borne un retour d'onglet : un trou de 30 s ne téléporte pas le fondu", () => {
    let st = stepWaterBand(neuf(), 0, 'beau', FADE);
    st = stepWaterBand(st, 1, 'pluie', FADE);
    st = stepWaterBand(st, 31, 'pluie', FADE);
    // dt plafonné à 0,25 s comme pour la phase : au plus 0,25/FADE de mélange.
    expect(st.mix).toBeLessThanOrEqual(0.25 / FADE + 1e-9);
  });

  it("TÉMOIN : un fondu calculé sur le temps ABSOLU sauterait au changement d'état", () => {
    // Sans ce témoin, les assertions ci-dessus passeraient sur n'importe quelle
    // implémentation. La forme naïve — `mix = (t - debut) / FADE` avec un `debut`
    // recalculé — perd la marche quand deux changements s'enchaînent : le mélange
    // repart de 0 alors que l'écran montre déjà l'état intermédiaire.
    const naif = (debut, t) => Math.min(1, (t - debut) / FADE);
    // deux bascules à 0,1 s d'intervalle : le naïf rejoue deux fondus complets
    // depuis 0, l'intégré ne perd que ce qu'il avait accumulé.
    expect(naif(1.0, 1.1)).toBeCloseTo(0.1 / FADE, 6);
    expect(naif(1.1, 1.1)).toBe(0);                    // repart de zéro : la marche
    let st = stepWaterBand(neuf(), 0, 'beau', FADE);
    st = stepWaterBand(st, 1, 'pluie', FADE);
    st = stepWaterBand(st, 1.1, 'pluie', FADE);
    const avant = st.mix;
    expect(avant).toBeGreaterThan(0);                  // l'intégré a bien avancé
  });
});
