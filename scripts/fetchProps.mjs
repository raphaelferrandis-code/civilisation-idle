// Télécharge les PROPS pixel-art des SCÈNES de moteur (PixelLab map-objects, mode
// basique, vue low top-down) → public/pixelart/agents/<name>.png (PNG transparent).
//   Un « prop » = l'élément STATIQUE d'une scène de bâtiment (étal, silo, sacs…) ;
//   le personnage qui marche reste un agent animé séparé (cf fetchAgents.mjs) et la
//   scène les compose dans cityEngineSprites.js (props + cueilleur RÉUTILISÉ).
//   C'est l'approche validée (cueilleurs/entrepôts/caravanes) — PAS un sprite-bâtiment
//   statique plat (couche pixelBuildings.js, abandonnée le 2026-06-29).
//
//   Endpoint /objects/{id}/download → PNG DIRECT sans auth (mode basique). Poll 15s.
//   ⚠ Les objets PixelLab s'AUTO-SUPPRIMENT après 8h → relancer dans la foulée de la
//   génération. Pour itérer/régénérer un prop : recréer via create_map_object (DA
//   verrouillée ci-dessous) puis remettre le nouvel id ici.
//   Lancer : node scripts/fetchProps.mjs   (filtre optionnel : node scripts/fetchProps.mjs market)
//
//   DA verrouillée (create_map_object) : view "low top-down", outline "lineless",
//   shading "medium shading", detail "medium detail", palette chaude terreuse, base
//   de terre, AUCUN humain cuit dans le sprite, lumière haut-gauche → ombres bas-droite.
//   ⚠ BÂTIMENTS = VUE DE DESSUS uniquement (jamais de face). Si un sujet « devanture »
//   (étal/halle) sort trop de face en "low top-down" → "high top-down" + prompt « seen
//   from a steep overhead top-down view looking straight down at its roof ». Véhicules
//   de profil = "side" (exception assumée).
import fs from 'node:fs';
import { PNG } from 'pngjs';

// Miroir horizontal (certaines fournées PixelLab ont la lumière du mauvais côté ;
// la convention carte = lumière HAUT-GAUCHE → ombres BAS-DROITE).
const flipH = (buf) => {
  const png = PNG.sync.read(buf); const { width: W, height: H, data } = png;
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4, di = (y * W + (W - 1 - x)) * 4;
    for (let c = 0; c < 4; c++) out[di + c] = data[si + c];
  }
  png.data = out; return PNG.sync.write(png);
};

// Bouche la PORTE/arche sombre qu'un sprite de tour garde malgré la consigne :
// repère le blob sombre dans la bande CENTRALE basse (hors bord droit à l'ombre) et
// le recouvre en miroir vertical de la bande de mur juste au-dessus (texture pierre
// continue). Sert pour la tour-moulin de profil (« pas de porte »).
const coverDoor = (buf) => {
  const png = PNG.sync.read(buf); const { width: W, height: H, data } = png;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  const lum = (x, y) => { const i = (y * W + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const x0 = Math.round(minX + cw * 0.18), x1 = Math.round(minX + cw * 0.82);
  const y0 = Math.round(maxY - ch * 0.42);
  let dminX = W, dmaxX = 0, dminY = H, dmaxY = 0, found = false;
  for (let y = y0; y <= maxY; y++) for (let x = x0; x <= x1; x++) {
    if (A(x, y) > 40 && lum(x, y) < 72) { found = true; if (x < dminX) dminX = x; if (x > dmaxX) dmaxX = x; if (y < dminY) dminY = y; if (y > dmaxY) dmaxY = y; }
  }
  if (!found) return buf;
  dminX = Math.max(minX, dminX - 1); dmaxX = Math.min(maxX, dmaxX + 1);
  dminY = Math.max(minY, dminY - 1); dmaxY = Math.min(maxY, dmaxY + 1);
  // Remplissage HORIZONTAL : chaque pixel de porte prend la pierre du mur le plus
  // proche (gauche ou droite) sur la même ligne → texture continue, pas d'artefact.
  for (let y = dminY; y <= dmaxY; y++) {
    let lx = dminX - 1; while (lx > minX && (A(lx, y) <= 40 || lum(lx, y) < 72)) lx--;
    let rx = dmaxX + 1; while (rx < maxX && (A(rx, y) <= 40 || lum(rx, y) < 72)) rx++;
    const lOk = lx >= minX && A(lx, y) > 40, rOk = rx <= maxX && A(rx, y) > 40;
    for (let x = dminX; x <= dmaxX; x++) {
      if (A(x, y) <= 40) continue;
      let si;
      if (lOk && rOk) si = ((x - lx) <= (rx - x) ? (y * W + lx) : (y * W + rx)) * 4;
      else if (lOk) si = (y * W + lx) * 4; else if (rOk) si = (y * W + rx) * 4; else continue;
      const di = (y * W + x) * 4;
      data[di] = data[si]; data[di + 1] = data[si + 1]; data[di + 2] = data[si + 2]; data[di + 3] = 255;
    }
  }
  return PNG.sync.write(png);
};

const OUT = 'public/pixelart/agents/buildings';
const PROPS = [
  // clé = nom de fichier (sans .png) ; id = objet PixelLab ; prompt = description de génération.
  {
    key: 'market-prop-stall',
    id: '441f8b21-8e47-48fc-955b-41ee5f03315c', // marché stade 0 — étal de troc à auvent (96×72) — validé 2026-06-29
    prompt: 'a small Neolithic barter market stall on bare packed earth, completely deserted and unoccupied, no people, no merchants, no human figures: a hide awning stretched over two wooden poles shading a woven reed mat, the mat and ground neatly covered with small clay pots, woven wicker baskets and small piles of colorful fruit, berries and grain, warm earthy ochre palette, soft light from the upper-left casting shadows to the lower-right, small patch of dirt ground',
  },
  {
    key: 'guild-prop-lodge',
    id: 'ed7ade38-dec8-475e-b6a6-bbee6a1450a2', // guildes stade 0 — lodge d'artisans clos (96×96)
    flip: 'h',                                  // fournée à lumière inversée → miroir H (validé en jeu)
    prompt: 'a small Stone Age craftsmen\'s guild lodge, completely deserted and empty, no people, no figures, no person: a single sturdy closed hut with timber and wattle-and-daub walls and a steep thatched roof, a dark low doorway, a carved wooden totem pole and crossed stone-axe tools mounted on the wall beside the door, a small hide pennant on a wooden pole on the roof, warm earthy ochre and brown palette, soft light from the upper-left casting shadows to the lower-right, small patch of bare dirt ground',
  },
  {
    key: 'field-prop-crop-green',
    id: '794aec1d-6f3e-4e45-bb9a-d988107b9a83', // champs stade 0 — parcelle cultures vertes (64×64)
    prompt: 'a small square top-down patch of cultivated farmland, neat parallel rows of young green crop sprouts growing on furrowed dark brown tilled soil, completely deserted, no people, no figures, warm earthy palette, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'field-prop-crop-gold',
    id: '33334d2d-028d-422b-9087-9edb9a1909fd', // champs stade 0 — parcelle blé mûr doré (64×64)
    prompt: 'a small square top-down patch of farmland with neat rows of tall ripe golden wheat on furrowed brown soil, completely deserted, no people, no figures, warm earthy golden palette, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'field-prop-fallow',
    id: '9aa08992-edcd-4f74-9e12-763b79de6d50', // champs stade 0 — parcelle terre labourée (64×64)
    prompt: 'a small square top-down patch of freshly tilled empty farmland, neat parallel furrows in dark brown soil with only a few sparse green sprouts, completely deserted, no people, no figures, earthy brown palette, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'port-prop-pontoon',
    id: 'ba197416-24e5-4b0a-9349-6dba800724aa', // port stade 0 — ANCIEN ponton plat (56×56), récupéré (préféré au variant à rambardes 8c7d7d8e) — relie le bâtiment de quai au bateau
    prompt: 'a wooden plank jetty pier extending straight forward over water, top-down view, completely deserted, no people, no figures, transparent background no water: parallel weathered wooden deck planks with a row of mooring posts and pilings along both edges, sturdy timber, warm brown wood, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'mill-prop-house',
    // moulin stade 0 — CABANE-MOULIN EN BOIS (vue 3/4, 64×64) posée sur la berge ;
    // roue à aubes montée sur le flanc GAUCHE (cadrage moteur : boîte ~carrée 1.5×1.5,
    // cf. cityEngineSprites.js, branche `if (stage === 0 && propReady('mill-prop-house'))`).
    id: '18515690-7517-4c3d-aead-91541a9be8e0', // cabane bois VALIDÉE (2026-06-30). NB : objet né d'un prompt « tour » — PixelLab a rendu cette cabane, qu'on a adoptée. Variante plus LARGE dispo : 2e2d2b83-eb67-4857-9736-a7670a354d5c (72×64, prompt = celui ci-dessous).
    // ⚠ POST-TRAITEMENT obligatoire : verrou palette d'âge « bois » via
    //   `node scripts/remapPalette.mjs <fichier> --epoch bois` (~19 teintes). Pas de
    //   coverDoor (la cabane a une porte assumée). Piste abandonnée : tour de PIERRE
    //   df5b54c1 recolorée bois (silhouette tour trop étroite — l'utilisateur a préféré
    //   la cabane). Le prompt ci-dessous est la consigne de RÉGÉN cabane (≠ prompt tour
    //   d'origine de 18515690) ; régénérer → remap bois.
    prompt: 'a small cozy wooden riverside watermill house, three-quarter side view, completely deserted, no people, no figures, NO water wheel and no circular shapes: a compact log cabin mill building with brown timber plank walls, exposed corner beams and a steep wooden shingle gabled roof, a low stone foundation along the bottom, a small wooden door and one small window on the right-hand front, the LEFT side wall kept flat and bare ready to mount a water wheel, built of warm weathered brown timber and wood planks, soft light from the upper-left casting shadows to the lower-right, transparent background',
  },
  {
    key: 'mill-prop-wheel',
    id: '70692c85-6180-4a41-a382-ba28c75ff34a', // moulin stade 0 — roue à aubes SYMÉTRIQUE & centrée (96×96, side), tournée via blitPropRot autour du centroïde (now/900) ; v1 e6bd2451 = roue de char asymétrique → wobble (rejeté)
    prompt: 'a watermill paddle water wheel seen edge-on in flat front view, perfectly circular and centered in the frame, a small round central hub with twelve straight wooden spokes radiating evenly to a thick round outer rim, the rim lined all the way around with many evenly spaced flat rectangular paddle boards sticking outward, weathered brown timber, completely empty, no people, no figures, radially symmetric like a gear, soft even light, transparent background',
  },
  // ── CUEILLEUR (foragers) stades 1-3 — passage pixel-art (2026-07-05) ──────────
  {
    key: 'forager-orchard-tree',
    id: 'b8145459-1f84-4c41-9c36-c987e62657bf', // stade 1 — verger : arbre taillé + échelle + clôture (96×96)
    prompt: 'a single well-pruned domesticated orchard fruit tree, completely deserted, no people, no figures, no person: one straight sturdy brown trunk with a dense tidy rounded canopy of green leaves heavy with ripe red apples, a simple wooden picking ladder leaning against the trunk, a low short wooden orchard fence rail at its base, standing on a small patch of tended dark earth, warm earthy palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'forager-orchard-crates',
    id: '446c3d48-f5aa-4da4-bc1d-3e3a0ca98f74', // stade 1 — verger : cagettes de fruits empilées (64×64)
    prompt: 'a small stack of wooden harvest crates filled with ripe red apples and fruit, completely deserted, no people, no figures, no person: three sturdy slatted wooden fruit crates stacked and piled high with colorful round fruit, on a small patch of bare earth, warm earthy brown palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'forager-greenhouse',
    id: '449bae28-7e62-419b-bf81-aec7e861a093', // stade 2 — serre vitrée industrielle (128×96)
    prompt: 'a small industrial-era glass greenhouse for growing fruit, completely deserted, no people, no figures, no person: a low glass house with a black cast-iron and metal frame, many glass panes with pale reflections, a gabled glazed roof, neat rows of leafy green plants bearing red fruit visible through the glass walls, standing on worked dark soil, cool teal glass tones over a warm earthy base, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'forager-handcart',
    id: '0c704e60-811b-4a71-9e67-ff33ac06adcb', // stade 2 — brouette chargée de cagettes (72×64)
    prompt: 'a wooden handcart loaded with fruit crates, completely deserted, no people, no figures, no person: a single-axle wooden wheelbarrow with a spoked wheel and long handles, its bed stacked with slatted crates full of ripe red fruit, weathered brown timber and dark metal fittings, on a small patch of bare earth, warm earthy palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'forager-hydro-rack',
    id: '2ad1b1b8-7573-418c-842d-768413a0ecad', // stade 3 — rack hydroponique néon (96×128)
    prompt: 'a futuristic vertical hydroponic growing rack, completely deserted, no people, no figures, no person: a tall dark metal shelving frame with several stacked horizontal grow trays, each tray dense with small leafy green plants and glowing cyan fruit, strips of magenta and cyan neon grow-lights lining every shelf casting an emissive glow, sleek clean sci-fi machinery, dark slab base, cool neon palette on near-black, soft glow lighting',
  },
  // ── CUEILLEUR cosmique (bands 7/8/9, ères 35+) — teintes COSMIC_PAL par band ──
  {
    key: 'forager-cosmic-7',
    id: 'd28a4440-3d38-4dfb-b317-1341b075708a', // band 7 (Noosphère) — jardin bioluminescent émeraude (96×96)
    prompt: 'a small alien bioluminescent garden, completely deserted, no people, no figures, no person: a cluster of glowing organic bulb-pods on curved translucent stems growing from a dark mound, the round pods emitting soft emerald and mint-green light, glowing teal veins and floating spores, wet organic membrane textures, dark near-black base, vivid emerald green bioluminescence, soft glow lighting',
  },
  {
    key: 'forager-cosmic-8',
    id: 'f92e5a59-4a77-4e7c-85b1-be35fff30fe7', // band 8 (Stellaire) — serre orbitale dorée (96×96)
    prompt: 'a small futuristic golden orbital greenhouse dome, completely deserted, no people, no figures, no person: a sleek domed glass greenhouse of golden metal ribs and glowing amber glass panels, rows of luminous golden crops glowing inside, a thin orbital ring arcing around it, polished gold and warm amber, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'forager-cosmic-9',
    id: '3f17a421-d24a-4ead-9e02-6954ccdb1d29', // band 9 (Démiurge) — jardin cristallin violet (96×96)
    prompt: 'a small levitating crystalline garden, completely deserted, no people, no figures, no person: a cluster of faceted floating amethyst crystals of various sizes growing bright glowing violet fruit-lights, sharp translucent purple gem facets catching light, glowing violet energy wisps, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── ENTREPÔTS (granaries_city) stades 1-3 + cosmique — passage pixel-art (2026-07-05) ──
  {
    key: 'granary-hall',
    id: 'beab33f5-8d9c-4bbf-8c33-980e7d7ca586', // stade 1 — halle de pierre (arcade + toit tuiles + fanion) (112×96)
    prompt: 'a small medieval stone granary storehouse hall, completely deserted, no people, no figures, no person: a sturdy rectangular building of pale dressed-stone blocks with a rounded arched wooden doorway, a steep red clay tile gabled roof, a small heraldic pennant on a pole at the roof peak, standing on a small patch of cobbled ground, warm earthy stone and terracotta palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'granary-jars',
    id: '3f6d73fd-34d5-437f-9778-fad8c4d54274', // stade 1 — grappe d'amphores à grain (72×56)
    prompt: 'a small cluster of ceramic grain storage jars and amphorae, completely deserted, no people, no figures, no person: several rounded terracotta clay amphorae of different sizes grouped together, some with golden grain spilling out, warm ochre and terracotta pottery, on a small patch of bare earth, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'granary-warehouse',
    // stade 2 — entrepôt de brique (palan + cheminée) (112×96). v3 = REFONTE 3/4 top-down
    // (v2 e60e8894 « flat corniced roof » sortait DE FACE — cf. règle DA en tête). Post-DL :
    // re-cadré (hauteur du contenu alignée sur l'ancien sprite, bas ancré, centré X) pour garder l'échelle.
    id: '47979657-a629-4d82-92c9-7c4733579597',
    prompt: 'a small industrial-era brick warehouse storehouse building seen from above at a top-down angle, completely deserted, no people, no figures, no person: a tall dark red brick storehouse with an iron-framed structure, a raised loading door with an overhead hoist beam and pulley on the front, tall arched windows, a brick chimney, a pitched gabled roof clearly visible from above showing one sloping roof plane and one side wall, standing on worked dark ground, dark brick and iron palette with warm earthy tones, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'granary-crates',
    id: '462566d8-e68d-4583-acf8-0aafa92ef9e2', // stade 2 — caisses palettisées cerclées (72×64)
    prompt: 'a small stack of palletized wooden shipping crates, completely deserted, no people, no figures, no person: several sturdy banded wooden cargo crates stacked on a wooden pallet, weathered brown timber with dark metal strapping, on a small patch of bare ground, warm earthy brown palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'granary-hub',
    id: '7f8c1b76-0019-498e-aaa0-07442a7e5b1f', // stade 3 — hub logistique automatisé (conteneurs + portique) (128×96)
    prompt: 'a small futuristic automated logistics hub, completely deserted, no people, no figures, no person: neat rows of stacked colorful shipping containers beside a sleek automated gantry crane on rails, clean metal and concrete, subtle blue status lights, a dark slab base, cool industrial sci-fi palette with cyan accents, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'granary-cosmic-7',
    id: 'befdc719-f872-41e7-af79-7b8420f72adc', // band 7 — coffre à graines bioluminescent émeraude (96×96)
    prompt: 'a small alien bioluminescent seed vault, completely deserted, no people, no figures, no person: a cluster of glowing organic pod-silos with translucent membrane shells storing luminous emerald seeds, glowing teal veins, dark near-black base, vivid emerald green bioluminescence, soft glow lighting',
  },
  {
    key: 'granary-cosmic-8',
    id: 'cacef0e4-bb04-4c8c-976e-d47c834f901c', // band 8 — coffre orbital doré (96×96)
    prompt: 'a small futuristic golden orbital storage vault, completely deserted, no people, no figures, no person: sleek golden metallic storage silos with glowing amber panels and a thin orbital ring arcing around them, polished gold and warm amber, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'granary-cosmic-9',
    id: '8b55a61b-8c4f-4a7a-9afc-9e71e09200a4', // band 9 — monolithe de stockage cristallin violet (96×96)
    prompt: 'a small levitating crystalline storage monolith cluster, completely deserted, no people, no figures, no person: tall faceted floating amethyst crystal vaults glowing with stored violet energy, sharp translucent purple gem facets, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── CARAVANES (caravans) stades 1-3 + cosmique — passage pixel-art (2026-07-05) ──
  // Véhicules de PROFIL (view side) qui font la navette (blitPropH, miroir selon le sens) ;
  // portails cosmiques (low top-down). Dépôts réutilisés : caravan-prop-sacks / granary-crates.
  {
    key: 'caravan-wagon',
    id: '21b1d1dc-2ff3-48ba-a49e-0a1e9794a7c0', // stade 1 — chariot bâché tiré par un cheval, profil (112×64)
    prompt: 'a covered merchant caravan wagon pulled by a draft horse, side view profile facing right, completely deserted, no people, no figures, no driver, no rider: a wooden cart with large spoked wheels and an arched canvas cover loaded with cargo bales, harnessed to a walking brown horse in front, weathered wood and cream canvas, warm earthy palette, soft light from the upper-left, transparent background',
  },
  {
    key: 'caravan-truck',
    id: '5d3f6a75-6add-4618-a878-5f023604ef5b', // stade 2 — camion de fret à vapeur, profil (112×64)
    prompt: 'a vintage steam-powered freight truck, side view profile facing right, completely deserted, no people, no figures, no driver: an early industrial motor lorry with a front boiler and smokestack, a flatbed stacked with wooden crates and barrels, riveted metal and dark wood, spoked wheels, industrial palette with brass and iron over warm earthy tones, soft light from the upper-left, transparent background',
  },
  {
    key: 'caravan-pod',
    id: 'c70e2ce3-0fba-4c36-9780-e5a2d4239f20', // stade 3 — pod cargo autonome à sustentation néon, profil (112×64)
    prompt: 'a futuristic autonomous hover cargo pod, side view profile facing right, completely deserted, no people, no figures, no driver: a sleek levitating self-driving freight capsule with a container body and glowing cyan underlights, floating above the ground with no wheels, clean white and dark metal with cyan neon accents, cool sci-fi palette, soft glow lighting, transparent background',
  },
  {
    key: 'caravan-cosmic-7',
    id: '67f59e15-4d99-42ee-b250-fe12e486bde1', // band 7 — portail de transit organique émeraude (96×96)
    prompt: 'a small alien organic transit gate archway, completely deserted, no people, no figures, no person: two curved living organic pillars forming a glowing arch with a luminous emerald energy membrane between them, glowing teal veins, dark near-black base, vivid emerald green glow, soft glow lighting',
  },
  {
    key: 'caravan-cosmic-8',
    id: '8d25b51c-12bb-403c-b71c-0646729d0d46', // band 8 — portail-anneau orbital doré (96×96)
    prompt: 'a small futuristic golden orbital transit ring portal, completely deserted, no people, no figures, no person: two golden pillars supporting a glowing amber energy ring gateway, polished gold and warm amber, a thin orbital arc, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'caravan-cosmic-9',
    id: '18e9d553-f633-4d9f-a32d-c903206df402', // band 9 — portail cristallin violet (96×96)
    prompt: 'a small levitating crystalline transit archway, completely deserted, no people, no figures, no person: two faceted amethyst crystal pylons flanking a glowing violet energy portal with a floating keystone crystal above, sharp translucent purple facets, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── MARCHÉS (markets) stades 1-3 + cosmique — passage pixel-art (2026-07-05) ──
  // Scène d'ACTIVITÉ : hero (halle/kiosque) + chaland `basket-man` réutilisé en navette.
  {
    key: 'market-hall-tent',
    // ⚠ v1 (a8611b6e, view low top-down) sortait TROP DE FACE (élévation) — rejeté par Raph
    // « QUE des vues de dessus ». v2 = view HIGH top-down + prompt « seen from above / roof ».
    id: '879588c1-aa7d-4c1f-85a9-9859559bd310', // stade 1 — halle à toile rayée, TOP-DOWN (112×96)
    prompt: 'a small medieval market stall seen from a steep overhead top-down view looking straight down at it, completely deserted, no people, no figures, no person: the striped red-and-cream rectangular cloth awning canopy roof seen from above supported on four corner posts, wooden counter tables laid with colorful goods (fruit, pottery, cloth bolts, baskets) arranged around the canopy, cobbled ground around it, warm earthy medieval palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'market-hall-glass',
    // ⚠ v1 (d03232b1, view low top-down) trop de face — v2 = HIGH top-down (toit vu d'en haut).
    id: '835284ab-455f-42b7-a7bb-9f2d2dcd8819', // stade 2 — halles de fonte vitrées (Baltard), TOP-DOWN (112×96)
    prompt: 'a small Victorian cast-iron and glass market pavilion seen from a steep overhead top-down view looking straight down at its roof, completely deserted, no people, no figures, no person: the glazed gable roof with black cast-iron ribs and teal glass panels seen from above, the rectangular building footprint, a cobbled square around it, dark iron and teal glass over warm stone, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'market-plaza-neon',
    id: '1cd6531b-4252-4e40-a027-b182b6aae68e', // stade 3 — place de commerce néon (kiosques auto) (112×96)
    prompt: 'a small futuristic neon commerce plaza kiosk cluster, completely deserted, no people, no figures, no person: two or three sleek dark automated vending kiosks with glowing cyan trim and holographic price panels, on a dark reflective slab with glowing seams, cool sci-fi palette with cyan and magenta neon, soft glow lighting',
  },
  {
    key: 'market-cosmic-7',
    id: '895ce5e2-67ba-4ad3-be1b-ce14ae40ddbe', // band 7 — nexus d'échange organique émeraude (96×96)
    prompt: 'a small alien organic exchange nexus, completely deserted, no people, no figures, no person: a glowing central emerald node connected by living tendrils to several smaller pod-nodes around it, pulsing teal energy, glowing veins, dark near-black base, vivid emerald green glow, soft glow lighting',
  },
  {
    key: 'market-cosmic-8',
    id: 'b533d5f3-9dc7-4a1a-82eb-cf64dd8a12c9', // band 8 — hub d'échange orbital doré (96×96)
    prompt: 'a small futuristic golden orbital exchange hub, completely deserted, no people, no figures, no person: a central golden hub with radiating spoke-arms linking glowing amber nodes, a thin orbital ring, polished gold and warm amber, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'market-cosmic-9',
    id: '9e1ffa32-3a78-4a40-96e4-6bcd7417b164', // band 9 — nexus d'échange cristallin violet (96×96)
    prompt: 'a small levitating crystalline exchange nexus, completely deserted, no people, no figures, no person: a central floating amethyst crystal core linked by glowing violet energy threads to several smaller faceted crystals, sharp translucent purple facets, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── GUILDES (guilds) stades 1-3 + cosmique — passage pixel-art (2026-07-05) ──
  // Bâtiment CLOS (comme le lodge stade 0), SANS perso ; vie = forge/fumée/bannière proc.
  // Emblème doré roue/marteaux comme marqueur d'identité. Cosmique = assembleur à bras.
  {
    key: 'guild-house',
    id: 'ba58c768-a420-4a1d-91c3-be33da24d709', // stade 1 — maison de guilde à pans de bois + emblème (96×96)
    prompt: "a small medieval half-timbered craftsmen's guild house seen from above at a top-down angle, completely deserted, no people, no figures, no person: a two-storey timber-framed building with dark exposed wooden beams and pale plaster infill, a steep tiled roof visible from above, a carved wooden guild sign with a golden gear-and-hammers craft emblem over the arched door, a small chimney, on cobbled ground, warm earthy medieval palette, soft light from the upper-left casting shadows to the lower-right",
  },
  {
    key: 'guild-chamber',
    id: 'f8ce0f0a-1446-4aaf-9603-3fd08be99c25', // stade 2 — chambre des corporations néoclassique (96×96)
    prompt: 'a small neoclassical stone guild corporation hall seen from above at a top-down angle, completely deserted, no people, no figures, no person: a dignified pale-stone building with a columned portico and a triangular pediment carved with a golden gear-and-hammers craft emblem, a low tiled roof visible from above, stone steps, on a cobbled square, warm stone and marble palette, soft light from the upper-left casting shadows to the lower-right',
  },
  {
    key: 'guild-consortium',
    id: '303ad8a5-8f73-406b-804e-af14291031e0', // stade 3 — consortium verre/néon + emblème holographique (96×96)
    prompt: 'a small futuristic glass corporate consortium block seen from above at a top-down angle, completely deserted, no people, no figures, no person: a sleek dark glass-and-steel building with glowing cyan window strips, a flat roof visible from above, a holographic golden gear craft emblem above the entrance, on a dark reflective slab, cool sci-fi palette with cyan neon and gold accents, soft glow lighting',
  },
  {
    key: 'guild-cosmic-7',
    id: 'e8a0ed79-6ebc-44a4-994e-c6026c42e6a9', // band 7 — bio-forge assembleur émeraude (96×96)
    prompt: 'a small alien organic bio-forge assembler, completely deserted, no people, no figures, no person: a glowing central emerald forge-pod with two curved living tendril-arms poised to work, a pulsing teal energy core, glowing veins, dark near-black base, vivid emerald green glow, soft glow lighting',
  },
  {
    key: 'guild-cosmic-8',
    id: 'bd9fda42-a647-479e-ac24-794212e13991', // band 8 — forge d'assemblage dorée (96×96)
    prompt: 'a small futuristic golden assembly forge, completely deserted, no people, no figures, no person: a golden metallic assembler block with two articulated forging arms and a glowing amber energy core, polished gold and warm amber, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'guild-cosmic-9',
    id: '0d196db8-4e48-496e-889e-6eb556a7228f', // band 9 — assembleur cristallin violet (96×96)
    prompt: 'a small levitating crystalline assembler, completely deserted, no people, no figures, no person: a faceted amethyst crystal core with two crystal forging arms and a glowing violet prismatic heart, sharp translucent purple facets, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── CHAMPS (irrigated_fields) — parcelle hydroponique néon du stade 3 (2026-07-05) ──
  // Les parcelles vert/doré/jachère (stades 0-2) sont réutilisées ; SEUL le stade 3
  // reçoit cette parcelle néon. Tileable comme les autres (64×64, pavée en clusters).
  {
    key: 'field-crop-neon',
    id: '29fc50ec-9b3a-48e4-aa0b-78169fe497c7', // stade 3 — parcelle hydroponique néon (64×64)
    prompt: 'a small square top-down patch of futuristic hydroponic farmland, completely deserted, no people, no figures, no person: neat parallel rows of glowing cyan and teal neon-lit crops growing in sleek dark hydroponic channels, emissive neon glow, dark near-black soil base, cool sci-fi neon palette, soft glow lighting',
  },
  // ── PORT (river_ports) stades 1-3 — bâtiments de quai évolutifs (2026-07-05) ──
  // ⚠ RIVERAIN : sprites transparents SEULEMENT sur berge+fleuve naturels (fond
  // transparent, PAS de sol) ; le ponton (port-prop-pontoon) et le bateau de l'ère
  // (blitEraBoat) sont réutilisés. Vue de-face-de-haut (le bâtiment fait face au fleuve).
  {
    key: 'port-house-medieval',
    id: 'a827061b-8eee-446c-aff8-0426fdf19f2a', // stade 1 — entrepôt de quai médiéval pierre+bois (96×96)
    prompt: 'a small medieval riverside port warehouse and customs house seen from a low top-down front angle facing the water, completely deserted, no people, no figures, no person: a sturdy stone-and-timber building with a steep tiled gabled roof, an arched loading door facing the water, a small wooden crane arm, warm earthy stone and timber palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'port-house-industrial',
    id: '65190ad4-db78-4d7e-999f-5210ff6865fc', // stade 2 — dock industriel brique + cheminée (96×96)
    prompt: 'a small industrial-era riverside dock warehouse seen from a low top-down front angle facing the water, completely deserted, no people, no figures, no person: a dark red brick building with an iron frame, tall windows, a large loading door facing the water, a brick chimney, a flat corniced roof, dark brick and iron palette with warm tones, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'port-house-modern',
    id: '91c4e384-f8ca-4ca9-9943-0ec008ce9ce6', // stade 3 — terminal à conteneurs verre/métal + néon (96×96)
    prompt: 'a small futuristic riverside container terminal building seen from a low top-down front angle facing the water, completely deserted, no people, no figures, no person: a sleek metal-and-glass terminal with glowing cyan window strips, a flat roof, a gantry crane arm, a couple of stacked shipping containers beside it, cool sci-fi metal palette with cyan neon accents, soft glow lighting, transparent background no ground',
  },
  // ── PORT — docks/pontons évolutifs (2026-07-05, coh. avec bateaux qui grossissent) ──
  {
    key: 'port-dock-stone',
    id: 'a27cde90-75da-4f50-bda1-4cffa9809a89', // stade 2 — dock de pierre industriel + bollards (80×112)
    prompt: 'a stone and timber industrial dock pier extending straight forward over water, top-down view, completely deserted, no people, no figures, no person, transparent background no water: a wide masonry stone quay deck with a row of iron mooring bollards and wooden plank sections, sturdy stone pilings along both edges, weathered grey stone and dark iron, soft light from the upper-left, shadows to the lower-right',
  },
  {
    key: 'port-dock-modern',
    id: '62f77f33-37c0-468d-b112-c444cf200daa', // stade 3 — dock béton/métal + liseré cyan (80×112)
    prompt: 'a modern concrete and metal dock pier extending straight forward over water, top-down view, completely deserted, no people, no figures, no person, transparent background no water: a wide flat concrete deck with metal edge rails and glowing cyan guidance strip lights along both sides, sturdy metal pilings, sleek grey concrete and dark metal with cyan neon accents, soft glow lighting',
  },
  // ── MOULIN (water_mills) stades 1-3 — RIVERAIN comme le port (2026-07-05) ──
  // Bâtiments face-au-fleuve (flanc gauche plat pour la roue) + roues SYMÉTRIQUES (side,
  // tournées via blitPropRot). Bâtiment + roue GRANDISSENT par ère (leçon port).
  {
    key: 'mill-house-stone',
    // ⚠ v1 = maison 3/4 (8e8e705d) — Raph a préféré une TOUR ; v2 = tour de pierre haute (80×128).
    id: '7a1b119b-a48f-4f1b-906f-837cf588e239', // stade 1 — TOUR de moulin médiévale pierre (80×128)
    prompt: 'a tall medieval stone watermill tower building seen from a low top-down front angle facing the water, completely deserted, no people, no figures, no person: a tall narrow multi-storey round stone tower with small windows up its height, a conical pointed wooden shingle roof on top, the left side wall kept flat and bare ready to mount a water wheel, warm earthy stone palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'mill-house-industrial',
    id: '15c90e4a-f6e6-49a0-bb5c-ddc48db2e5b8', // stade 2 — TOUR minoterie brique haute (80×128)
    prompt: 'a tall industrial brick watermill tower building seen from a low top-down front angle facing the water, completely deserted, no people, no figures, no person: a tall narrow multi-storey dark red brick tower with stone corner quoins, arched windows on each floor, a pointed slate roof, the left side wall kept flat and bare ready to mount a water wheel, dark brick and slate palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'mill-house-hydro',
    id: '897a65ea-2aae-4383-9aa9-ebf25e9e26e7', // stade 3 — TOUR hydro béton/verre haute (80×128)
    prompt: 'a tall futuristic hydroelectric tower building seen from a low top-down front angle facing the water, completely deserted, no people, no figures, no person: a tall narrow sleek concrete-and-glass tower with glowing cyan window strips up its height, a flat roof, a metal penstock pipe running down the left side ready to mount a turbine, cool grey concrete and dark metal with cyan neon accents, soft glow lighting, transparent background no ground',
  },
  {
    key: 'mill-wheel-metal',
    id: '9950e90d-ce12-4e93-8661-3c2bb04c9e46', // stade 2 — roue à aubes FER industrielle, symétrique (96×96, side)
    prompt: 'an industrial iron watermill paddle wheel seen edge-on in flat front view, perfectly circular and centered in the frame, a small round central hub with twelve straight riveted iron spokes radiating evenly to a thick round outer rim, the rim lined all the way around with many evenly spaced flat metal paddle boards sticking outward, dark riveted iron and steel, completely empty, no people, no figures, radially symmetric like a gear, soft even light, transparent background',
  },
  {
    key: 'mill-turbine',
    id: '0e02f150-c216-443b-86ed-c79a293a9973', // stade 3 — turbine hydro néon, symétrique (96×96, side)
    prompt: 'a futuristic hydro turbine rotor seen edge-on in flat front view, perfectly circular and centered in the frame, a small round central hub with many evenly spaced curved metal turbine blades radiating symmetrically to a round outer ring, glowing cyan energy accents along the blades, sleek dark metal, completely empty, no people, no figures, radially symmetric like a gear, soft glow lighting, transparent background',
  },
  // ── MONNAIES (mint_houses) stades 2-3 + cosmique — bâtiment CLOS (2026-07-05) ──
  // Stades 0 (atelier+feu animé) et 1 (mint-prop-house) déjà pixel. Emblème pièce doré = identité.
  {
    key: 'mint-house-steam',
    id: 'a098d3c7-2e68-4c0c-a7cc-7ed2b291d2c0', // stade 2 — manufacture à vapeur brique + cheminée (96×96)
    prompt: 'a small industrial-era steam coin mint manufactory building seen from above at a top-down angle, completely deserted, no people, no figures, no person: a dark red brick factory with a sawtooth shed glass roof, tall arched windows, a tall brick chimney, a golden coin emblem over the entrance, dark brick and iron palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'mint-house-digital',
    id: 'e450fbaf-64b6-465e-a800-cd6ee302c5b9', // stade 3 — monolithe de frappe numérique néon (96×96)
    prompt: 'a small futuristic digital mint monolith building seen from above at a top-down angle, completely deserted, no people, no figures, no person: a sleek dark monolithic block with glowing cyan and gold neon data strips, a holographic golden coin emblem above the entrance, a flat roof, cool sci-fi palette with cyan and gold neon, soft glow lighting, transparent background no ground',
  },
  {
    key: 'mint-cosmic-7',
    id: '8fadd80d-8c92-4e43-92a9-5e7f42e946ec', // band 7 — bio-coffre à pièces émeraude (96×96)
    prompt: 'a small alien organic bio-vault mint, completely deserted, no people, no figures, no person: a glowing emerald organic pod-vault storing luminous stacks of coins, pulsing teal energy, glowing veins, dark near-black base, vivid emerald green glow, soft glow lighting',
  },
  {
    key: 'mint-cosmic-8',
    id: 'e46433af-ceae-4138-8b73-b23851834a70', // band 8 — coffre orbital doré (96×96)
    prompt: 'a small futuristic golden orbital mint vault, completely deserted, no people, no figures, no person: a golden domed vault with glowing amber panels minting stacks of luminous gold coins, a thin orbital ring, polished gold and warm amber, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'mint-cosmic-9',
    id: '5156a2c5-7cf7-45c5-8bae-3b55cdc71d65', // band 9 — coffre cristallin violet (96×96)
    prompt: 'a small levitating crystalline mint vault, completely deserted, no people, no figures, no person: a faceted amethyst crystal vault with glowing violet energy coins floating around it, sharp translucent purple facets, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── BANQUES (imperial_exchanges) stades 1-3 + cosmique — bâtiment CLOS (2026-07-05) ──
  // Stade 0 (comptoir de change `exchange-prop-stall`) déjà pixel. Emblème or/balance = identité.
  {
    key: 'bank-house-renaissance',
    id: '9bcc8ad1-f89a-4b36-84fd-5043e7da702b', // stade 1 — banco Renaissance (palazzo pierre) (96×96)
    prompt: 'a small Renaissance merchant bank palazzo seen from above at a top-down angle, completely deserted, no people, no figures, no person: an elegant stone palazzo with arched windows, a rusticated ground floor, a tiled roof with a cornice, a golden coin-and-scales emblem over the arched door, warm stone and terracotta palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'bank-house-neoclassical',
    id: '9dcd39dc-8dd3-4f90-b0e3-27d91dc913dc', // stade 2 — grande banque néoclassique (colonnes+fronton) (96×96)
    prompt: 'a small grand neoclassical bank building seen from above at a top-down angle, completely deserted, no people, no figures, no person: a dignified pale marble bank with a columned portico and triangular pediment, stone steps, a golden scales-and-coins emblem on the pediment, a low dome, warm marble and stone palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground',
  },
  {
    key: 'bank-house-glass',
    id: '1a58ad86-29a3-4abe-955a-b075a5e87115', // stade 3 — bourse de verre (tour + ticker néon) (96×96)
    prompt: 'a small futuristic glass stock exchange tower seen from above at a top-down angle, completely deserted, no people, no figures, no person: a sleek glass-and-steel tower with a scrolling ticker band of glowing green and red numbers, glowing cyan window strips, a golden holographic market emblem on top, a flat roof, cool sci-fi palette with cyan neon and gold accents, soft glow lighting, transparent background no ground',
  },
  {
    key: 'bank-cosmic-7',
    id: 'aee27dc9-8ec5-4d97-8da3-0ccec1d31ab9', // band 7 — flèche d'échange organique émeraude (88×112)
    prompt: 'a small alien organic monumental exchange spire, completely deserted, no people, no figures, no person: a tall glowing emerald organic spire with pulsing teal energy rings around it, glowing veins, dark near-black base, vivid emerald green glow, soft glow lighting',
  },
  {
    key: 'bank-cosmic-8',
    id: '2ecce985-fa5d-44e2-94aa-d4de9ad4caa3', // band 8 — flèche orbitale dorée (88×112)
    prompt: 'a small futuristic golden monumental exchange spire, completely deserted, no people, no figures, no person: a tall polished gold spire with glowing amber orbital rings and a radiant glowing apex, dark near-black base, radiant warm gold glow, soft glow lighting',
  },
  {
    key: 'bank-cosmic-9',
    id: 'ca1116a3-0542-498d-bead-7109c56105ae', // band 9 — flèche cristalline violette (88×112)
    prompt: 'a small levitating crystalline monumental exchange spire, completely deserted, no people, no figures, no person: a tall faceted amethyst crystal spire with glowing violet energy rings, sharp translucent purple facets, dark near-black base, vivid amethyst violet glow, soft glow lighting',
  },
  // ── CONTEURS (storytellers, engineSprites.js) — ÉVOLUTION 4 STADES ajoutée (2026-07-05) ──
  // 1er bâtiment SAVOIR à recevoir un vrai dispatch d'ère (les savoir étaient mono-scène).
  // Décor par ère ; la lectrice `storyteller-reader` est réutilisée par-dessus + auditeurs proc.
  {
    key: 'storyteller-hall',
    id: '43ffbef2-fe8f-40b8-9456-f5c0eb6d3f01', // stade 1 — veillée médiévale (pavillon + foyer + bancs) (112×88)
    prompt: 'a small medieval storytelling gathering scene seen from above at a top-down angle, completely deserted, no people, no figures, no person: a cozy covered wooden pavilion with a glowing warm stone hearth, log benches arranged in a semicircle around it, an open storybook on a small lectern, warm torch-lit medieval palette, soft light from the upper-left casting shadows to the lower-right, small patch of dirt ground',
  },
  {
    key: 'storyteller-theater',
    id: '78970346-1edc-42b4-96f0-1b77d308662e', // stade 2 — BÂTIMENT CLOS opéra/théâtre (v2 : la scène ouverte v1 591875b7 refusée par Raph « il faut un bâtiment fermé ») (112×88)
    prompt: 'a grand closed 19th-century theater and public reading house building seen from a low top-down angle, completely deserted, no people, no figures, no person: an ornate opera house with a decorated triangular pediment and a pitched roof, a grand arched marquee entrance with a small canopy over the double doors, tall warm-glowing arched windows along the facade, ornate stone cornices and half-columns, a pair of gas lamps flanking the entrance, warm gas-lit golden stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved stone ground',
  },
  {
    key: 'storyteller-media',
    id: 'd5306e6e-f0ac-4a29-b0de-f448ae0180cb', // stade 3 — média néon (podium broadcast + hologrammes) (112×88)
    prompt: 'a small futuristic media broadcast storytelling scene seen from above at a top-down angle, completely deserted, no people, no figures, no person: a sleek neon broadcast podium with floating holographic story panels above it, glowing cyan and magenta light strips, curved seating, a sleek dark reflective floor with glowing seams, cool sci-fi neon palette, soft glow lighting',
  },
  // ── SCRIBES (scribes, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 2e bâtiment SAVOIR (après conteurs). Leçon appliquée : stades 1-3 = BÂTIMENTS CLOS
  // (institutions), aucun perso réutilisé. Thème écriture/archives. Stade 0 = abri primitif
  // (scribes-prop-hall) inchangé. Cosmique gardé procédural (cosmicSavoir).
  {
    key: 'scribes-scriptorium',
    id: '6b30b150-9f40-4306-9bf5-a5d37d61981b', // stade 1 — scriptorium médiéval clos (pierre + fenêtres cintrées bougies) (112×88)
    prompt: 'a closed medieval monastery scriptorium building seen from a low top-down angle, completely deserted, no people, no figures, no person: a stone building with a steep tiled roof, tall narrow arched windows glowing with warm candlelight, a small bell gable on top, an open-book carving above the arched wooden door, ivy climbing the stone walls, warm parchment and stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of stone ground',
  },
  {
    key: 'scribes-archive',
    id: 'cf561c26-6e09-4071-8679-6af19ccdcb2a', // stade 2 — hall d'archives néoclassique clos (portique + coupole + fenêtres chaudes) (112×88)
    prompt: 'a closed 19th-century hall of public records and archives building seen from a low top-down angle, completely deserted, no people, no figures, no person: a formal neoclassical registry with a columned portico, a flat roof with a small central cupola, tall rectangular warm-lit windows in a row, a carved scroll-and-quill emblem above the door, austere grey stone bureaucratic palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved stone ground',
  },
  {
    key: 'scribes-data',
    id: '9b98691d-0aca-4119-b1b0-e96473e1212c', // stade 3 — data hall futuriste clos (racks serveurs cyan + LED) (112×88)
    prompt: 'a closed futuristic data archive and knowledge server hall building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek low dark building with a flat roof, rows of glowing cyan server-rack vents along the sides, thin blue LED light strips framing the walls, a small holographic data emblem hovering over the sleek entrance, cool dark sci-fi palette with cyan glow, soft glow lighting, small patch of dark reflective ground',
  },
  // ── ÉCOLES (schools, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 3e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Thème éducation. Stade 0 = coin de leçon
  // primitif (schools-prop-yard) inchangé. Cosmique gardé procédural (cosmicSavoir).
  {
    key: 'schools-schoolhouse',
    id: 'e18a73d4-5205-4b04-a71a-bb6ce8b47023', // stade 1 — école médiévale (colombage + beffroi cloche + ardoise) (112×88)
    prompt: 'a closed medieval village schoolhouse building seen from a low top-down angle, completely deserted, no people, no figures, no person: a modest timber-framed one-room schoolhouse with white plaster walls and dark wooden beams, a thatched gabled roof, a small open bell-cote with a bell on the roof ridge, small windows glowing with warm light, a wooden door with a hanging chalk-slate sign, a low wooden fence around a tiny dirt yard, warm humble palette, soft light from the upper-left casting shadows to the lower-right, small patch of dirt ground',
  },
  {
    key: 'schools-victorian',
    id: '1dfcc027-abd8-4193-bd2b-eceaa5d0a6b1', // stade 2 — école victorienne (brique + tour horloge/cloche) (112×88)
    prompt: 'a closed Victorian-era red-brick schoolhouse building seen from a low top-down angle, completely deserted, no people, no figures, no person: a red-brick school with a steep grey slate roof, a tall central bell-and-clock tower, two rows of tall warm-lit sash windows, a stone arched entrance with steps, a small paved schoolyard with a low iron fence, warm red-brick and stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'schools-campus',
    id: '74e80cb5-3bdb-4ab4-9623-d826c1a60acf', // stade 3 — campus moderne (verre + toit végétal + écrans) (112×88)
    prompt: 'a closed modern learning center building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek glass-and-white school with a flat green planted roof, solar panels, large bright windows revealing glowing screens inside, a small holographic knowledge emblem hovering over the bright entrance, clean friendly modern palette with soft cyan-white glow, soft glow lighting, small patch of tidy ground with a young tree',
  },
  // ── ACADÉMIES (academies, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 4e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = marbre classique + coupole +
  // emblème lauriers (différencie des scribes gris/écoles bois). Stade 0 = cercle de débat
  // primitif (academies-prop-yard) inchangé. Cosmique gardé procédural (cosmicSavoir).
  {
    key: 'academies-renaissance',
    id: '16abe7ce-a8c6-4a94-abee-9f5677f8d5a7', // stade 1 — académie Renaissance (loggia arquée + coupole + lauriers) (112×88)
    prompt: 'a closed Renaissance academy of arts and sciences building seen from a low top-down angle, completely deserted, no people, no figures, no person: an elegant warm sandstone building with an arched ground-floor loggia, tall arched windows glowing with warm light, a decorated cornice and a small central cupola, a carved laurel-wreath emblem above the arched entrance, warm marble and terracotta palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'academies-institute',
    id: 'd6cad507-a394-4aec-a466-a91595d5a43b', // stade 2 — académie néoclassique (grande coupole/rotonde + portique + emblème doré) (112×88)
    prompt: 'a closed grand neoclassical academy of sciences building seen from a low top-down angle, completely deserted, no people, no figures, no person: a monumental white marble hall with a large central domed rotunda, a columned portico with a triangular pediment, tall warm-lit windows in a row, a golden laurel-and-star emblem on the pediment, prestigious pale marble palette with warm light, soft light from the upper-left casting shadows to the lower-right, small patch of paved stone ground',
  },
  {
    key: 'academies-modern',
    id: '17ccbab4-b6a6-48cd-9a6c-1e4fc3cfc728', // stade 3 — institut moderne circulaire (dôme verre + emblème armillaire holo) (112×88) — v2 (v1 2445b892 hung à 95% PixelLab, régénéré)
    prompt: 'a closed modern institute of advanced study building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek circular research institute with a glowing frosted-glass dome, curved white and glass walls, a floating holographic armillary-sphere emblem of thin orbiting rings hovering above the dome, warm interior light through the glass, cool white palette with soft cyan-gold glow, soft glow lighting, small patch of tidy paved ground',
  },
  // ── OBSERVATOIRES (observatories, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 5e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = dômes + télescopes (différencie
  // du marbre des académies). Stade 0 = gnomon/cadran primitif (observatories-prop-dial) inchangé.
  {
    key: 'observatories-tower',
    id: '098ea325-0097-48df-96c9-00ec7e10c859', // stade 1 — tour d'observation médiévale (sphère armillaire + quadrant) (112×88)
    prompt: 'a closed medieval astronomical observatory tower building seen from a low top-down angle, completely deserted, no people, no figures, no person: a tall round stone tower with a crenellated top platform, a large brass armillary sphere and a mounted quadrant instrument on the platform, small arched windows glowing with warm light, hanging star-chart banners, weathered stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of stone ground',
  },
  {
    key: 'observatories-dome',
    id: 'f832defd-a7d5-4ae4-b07d-01b7b1a5380b', // stade 2 — observatoire à coupole 19e (dôme métal + fente + télescope) (112×88)
    prompt: 'a closed 19th-century domed astronomical observatory building seen from a low top-down angle, completely deserted, no people, no figures, no person: a round white building topped with a large hemispherical metal observatory dome with an open slit revealing a brass telescope pointing at the sky, tall warm-lit windows, a stone base with steps, classical observatory palette of white and copper-green, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'observatories-array',
    id: '1efb55c5-a6fc-4e61-8d2f-3b9dc0b6fd7a', // stade 3 — observatoire moderne (antenne radio + dôme géodésique + cyan) (112×88)
    prompt: 'a closed futuristic observatory building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek dark research observatory with a large white radio-telescope dish tilted upward on the roof and a glass geodesic dome beside it, glowing cyan instrument panels and small antenna lights, cool dark sci-fi palette with cyan glow, soft glow lighting, small patch of dark ground',
  },
  // ── BIBLIOTHÈQUES (libraries, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 6e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = grands halls de LIVRES
  // (rayonnages + emblème livre ouvert), différencie scribes (écriture) et académies (lauriers).
  // Stade 0 = archive primitive à rouleaux (libraries-prop-archive) inchangé.
  {
    key: 'libraries-monastic',
    id: '56cb64e3-217c-49b8-9863-80147d62167f', // stade 1 — bibliothèque monastique (hall pierre + rosace + rayonnages) (112×88)
    prompt: 'a closed medieval monastic library hall building seen from a low top-down angle, completely deserted, no people, no figures, no person: a long stone hall with a steep tiled roof and stone buttresses, tall arched windows glowing warm and revealing rows of tall bookshelves inside, a round rose window with a carved open-book emblem above the door, warm stone and dark wood palette, soft light from the upper-left casting shadows to the lower-right, small patch of stone ground',
  },
  {
    key: 'libraries-grand',
    id: '45d180ad-bd00-4d95-8e79-3c24bef12f17', // stade 2 — grande bibliothèque nationale (coupole verre-fer + emblème livre) (112×88)
    prompt: 'a closed grand 19th-century national library building seen from a low top-down angle, completely deserted, no people, no figures, no person: a stately honey-stone building with a large glass-and-iron reading-room dome in the center, a columned stone facade, an open-book-and-torch emblem on the triangular pediment, tall warm-lit windows in a row, warm honey-stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved stone ground',
  },
  {
    key: 'libraries-modern',
    id: '85e38791-bb4a-4cd7-a085-04adf65f0bd2', // stade 3 — médiathèque moderne (bois/verre + rayonnages illuminés + écrans) (112×88)
    prompt: 'a closed modern media library building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek warm wood-and-glass library with a curved planted green roof, large bright windows revealing colorful illuminated bookshelves and glowing screens inside, a soft glowing open-book emblem over the entrance, warm and friendly modern palette with soft warm-and-cyan glow, soft glow lighting, small patch of tidy ground with a bench',
  },
  // ── UNIVERSITÉS (universities, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 7e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = GOTHIQUE/collégial (arcs brisés,
  // flèches, tours) — distincte du néoclassique des académies + du village des écoles.
  // Stade 0 = halle du savoir primitive (universities-prop-hall) inchangé.
  {
    key: 'universities-gothic',
    id: '10dfd8cb-f30c-4c48-a8ae-cd455ecbb6f7', // stade 1 — collège gothique médiéval (arcs brisés + flèches + vitraux) (112×88)
    prompt: 'a closed medieval gothic university college building seen from a low top-down angle, completely deserted, no people, no figures, no person: a grand stone college with pointed gothic arches, a steep slate roof with small spires and pinnacles, a great arched hall with tall stained-glass windows glowing warm, a gatehouse tower, ivy on the walls, warm grey-stone gothic palette, soft light from the upper-left casting shadows to the lower-right, small patch of stone ground',
  },
  {
    key: 'universities-collegiate',
    id: '7c02b5b5-b35d-47ae-98d8-bc4b38281703', // stade 2 — université collégiale (tour horloge + cloître + quad) (112×88)
    prompt: 'a closed grand collegiate university building seen from a low top-down angle, completely deserted, no people, no figures, no person: a large gothic-revival university with a tall central clock-and-bell tower, pointed-arch cloisters around a small courtyard quad, tall warm-lit windows, ornate pinnacles and spires, ivy-covered honey stone, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'universities-modern',
    id: '0be50a9e-105e-4d85-9ffe-f13d8e2c8019', // stade 3 — campus moderne (tour verre + halle courbe + blason) (112×88)
    prompt: 'a closed modern university building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek tall glass academic tower joined to a curved concrete-and-glass lecture hall, glowing blue windows, a large university crest emblem lit over the entrance, rooftop greenery, clean modern palette with soft blue glow, soft glow lighting, small patch of tidy ground with trees',
  },
  // ── IMPRIMERIES (printing_houses, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 8e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = presse/reproduction (distinct
  // des scribes qui écrivent à la main). Stade 0 = atelier de reproduction primitif (printing-prop-workshop).
  {
    key: 'printing-press-shop',
    id: 'fb1ee3e2-f6c8-4474-8799-2b0e518c9386', // stade 1 — imprimerie Renaissance (colombage Tudor 2 étages) (112×88) — v2 (v1 89122f0f = porte/enseigne flottante ratée, régénérée en vrai bâtiment)
    prompt: "a closed Renaissance printing workshop building seen from a low top-down angle, completely deserted, no people, no figures, no person: a timber-and-plaster print shop with a tiled roof, a hanging carved printer's sign shaped like an open book, warm-lit windows revealing a wooden printing press inside, stacks of drying paper sheets on lines, warm wood palette, soft light from the upper-left casting shadows to the lower-right, small patch of ground",
  },
  {
    key: 'printing-factory',
    id: 'a014c551-0b06-45e7-b9be-5a0ba666b4b0', // stade 2 — imprimerie industrielle (brique + cheminée + rouleaux de papier) (112×88)
    prompt: "a closed 19th-century industrial printing house building seen from a low top-down angle, completely deserted, no people, no figures, no person: a red-brick printing factory with a tall smoking chimney, large arched windows glowing warm, big rolls of newsprint paper stacked outside on a loading dock, a metal printing-press sign, iron-and-brick industrial palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground",
  },
  {
    key: 'printing-media',
    id: 'a8d50366-fa89-4629-875a-865b8c90db5a', // stade 3 — maison de médias moderne (verre + bandeaux d'actu écrans) (112×88)
    prompt: "a closed modern media and publishing house building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek dark glass office building with glowing news-ticker screens wrapping the facade showing scrolling headlines, a lit press emblem over the entrance, cool palette with warm-white and cyan glow, soft glow lighting, small patch of tidy ground",
  },
  // ── THINK-TANKS (think_tanks, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 9e bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = stratégie/modélisation (globe/
  // carte/données + antennes), distinct académie=débat/université=apprentissage. Stade 0 =
  // halle de conseil stratégique primitive (think-prop-council) inchangé.
  {
    key: 'think-chancellery',
    id: '24df979e-1378-41ce-9f65-367cf6c6a5a9', // stade 1 — chancellerie Renaissance (tour + coupole + emblème globe) (112×88)
    prompt: 'a closed Renaissance strategic council house building seen from a low top-down angle, completely deserted, no people, no figures, no person: a fortified stone chancellery with a squat corner tower and a domed cap, tall shuttered windows glowing warm, hanging map banners and a carved globe emblem above the arched wooden door, warm ochre-stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'think-institute',
    id: 'd14e8300-03e6-4074-94f7-ac062418a562', // stade 2 — institut stratégique 19e (globe de bronze sur le toit) (112×88)
    prompt: 'a closed 19th-century strategic institute building seen from a low top-down angle, completely deserted, no people, no figures, no person: a stern stone institute with a flat roof crowned by a large bronze globe on a pedestal, tall warm-lit windows, a columned entrance, brass flag poles, austere grey-and-bronze palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'think-modern',
    id: '5ceb9e26-c477-4b05-971f-67a92dc140b6', // stade 3 — think-tank moderne (verre + flèche/antennes + globe holo + données) (112×88)
    prompt: 'a closed modern think tank institute building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek dark glass building with a slender rooftop spire and antennas, a glowing holographic globe and floating data-graph displays hovering above the roof, thin cyan light strips along the walls, cool dark palette with cyan glow, soft glow lighting, small patch of tidy ground',
  },
  // ── CULTE ANCESTRAL (ancestral_cult, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 10e et DERNIER bâtiment SAVOIR. Bâtiments CLOS, aucun perso. Identité = spirituel/mémoriel,
  // fil de la FLAMME ÉTERNELLE (écho du feu rituel animé du S0). Stade 0 = mégalithes + feu
  // animé (ancestralcult-back+ancestralcult-fire) inchangé. Cosmique gardé procédural.
  {
    key: 'cult-shrine',
    id: 'c2c9ddf0-f56e-4f6b-a8c9-25875998000a', // stade 1 — sanctuaire tribal (totems + toit conique + brasier flamme) (112×88)
    prompt: 'a closed ancient ancestral shrine temple building seen from a low top-down angle, completely deserted, no people, no figures, no person: a solid stone tribal temple with carved totem pillars flanking the entrance, a thatched conical roof, a glowing eternal flame in a stone brazier at the doorway, hanging bone-and-feather charms, ancestral face carvings on the walls, warm earthy stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of earth ground',
  },
  {
    key: 'cult-mausoleum',
    id: 'e1f52c3a-ac96-4b33-92cc-62488e357fbe', // stade 2 — mausolée à coupole (marbre + urne flamme + statues d'ancêtres) (112×88)
    prompt: 'a closed grand ancestral mausoleum building seen from a low top-down angle, completely deserted, no people, no figures, no person: a solemn domed pale-marble memorial with a columned portico, a large glowing eternal flame urn on the front steps, carved ancestor statues in wall niches, an engraved memorial pediment, solemn pale-stone palette with warm flame glow, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'cult-memorial',
    id: 'bb43befd-8287-4967-810e-9418ebbb1ee5', // stade 3 — hall du souvenir moderne (flamme + hologramme ancêtres violet) (112×88)
    prompt: 'a closed modern hall of remembrance building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek dark solemn memorial building with a bright glowing eternal flame at the entrance, a softly glowing violet holographic ancestral memory display floating above the flat roof, thin warm-gold and violet light lines along the walls, solemn dark palette with warm-and-violet glow, soft glow lighting, small patch of tidy ground',
  },
  // ── COSMIQUE SAVOIR PIXEL (2026-07-05) — props cristallins flottants PAR FAMILLE × band ──
  // Remplace la silhouette procédurale de cosmicSavoir (fond sombre posé par cosmicBase, prop
  // par-dessus, emblème médaillon conservé). PILOTE = famille DÔME (observatoires/écoles/universités/
  // ministères). Couleur bakée par band : 7 émeraude, 8 or, 9 violet. Transparent, structure seule.
  {
    key: 'cosmic-dome-7',
    id: 'c86bb940-df86-4303-9abb-9a676a7638d4', // dôme cristallin émeraude (band 7) (96×88)
    prompt: 'a floating transcendent crystalline dome temple of knowledge, cosmic energy structure seen from a low top-down angle, completely deserted, no people, no figures, no person: a radiant emerald-green crystal dome with faceted translucent glowing panels, bright glowing edges and a luminous core, small crystal shards floating around it, ethereal emerald energy, transparent background, no ground',
  },
  {
    key: 'cosmic-dome-8',
    id: '17861470-2219-47ee-93e8-d7ce94167adf', // dôme cristallin or (band 8) (96×88)
    prompt: 'a floating transcendent crystalline dome temple of knowledge, cosmic energy structure seen from a low top-down angle, completely deserted, no people, no figures, no person: a radiant golden crystal dome with faceted translucent glowing panels, bright glowing edges and a luminous core, small crystal shards floating around it, ethereal golden energy, transparent background, no ground',
  },
  {
    key: 'cosmic-dome-9',
    id: 'e7351874-ed3d-4349-b26b-7a04dbf6a03f', // dôme cristallin violet (band 9) (96×88)
    prompt: 'a floating transcendent crystalline dome temple of knowledge, cosmic energy structure seen from a low top-down angle, completely deserted, no people, no figures, no person: a radiant violet crystal dome with faceted translucent glowing panels, bright glowing edges and a luminous core, small crystal shards floating around it, ethereal violet energy, transparent background, no ground',
  },
  // ── COSMIQUE : famille FLÈCHE (spire = ancestral_cult/watch/think_tanks) ──
  { key: 'cosmic-spire-7', id: '11669846-2480-48a1-bb73-cfb7f81d9415', prompt: 'floating crystalline emerald spire, cosmic (band 7) (96x88)' },
  { key: 'cosmic-spire-8', id: 'b81b3478-d5f3-401f-9006-082a30602e02', prompt: 'floating crystalline golden spire, cosmic (band 8) (96x88)' },
  { key: 'cosmic-spire-9', id: '008ef983-7a08-477e-a3e4-e08fd6be1f04', prompt: 'floating crystalline violet spire, cosmic (band 9) (96x88)' },
  // ── COSMIQUE : famille HALLE (hall = libraries/scribes/printing/storytellers/archives/bureau) ──
  { key: 'cosmic-hall-7', id: '979f2372-955d-4994-8ac0-1909a8547215', prompt: 'floating crystalline emerald grand hall, cosmic (band 7) (112x88)' },
  { key: 'cosmic-hall-8', id: 'f08ae400-a82b-4d1e-8dd0-acd50b79bede', prompt: 'floating crystalline golden grand hall, cosmic (band 8) (112x88)' },
  { key: 'cosmic-hall-9', id: 'b5d42f5c-7c13-417d-bf08-788dbd598d3d', prompt: 'floating crystalline violet grand hall, cosmic (band 9) (112x88)' },
  // ── COSMIQUE : famille TEMPLE (temple = academies/courthouses) ──
  { key: 'cosmic-temple-7', id: '45c4de1d-bd5d-4aa3-a108-e2c05f12feca', prompt: 'floating crystalline emerald stepped temple, cosmic (band 7) (112x88)' },
  { key: 'cosmic-temple-8', id: '0b54fc7f-da60-4904-a33d-e99765ddf63b', prompt: 'floating crystalline golden stepped temple, cosmic (band 8) (112x88)' },
  { key: 'cosmic-temple-9', id: 'b4b02bbc-8d2f-45a5-92fb-d0506f72c7b6', prompt: 'floating crystalline violet stepped temple, cosmic (band 9) (112x88)' },
  // ── COSMIQUE : famille ARCHES (arch = aqueducts/sewers) ──
  { key: 'cosmic-arch-7', id: '794747d7-0892-4c2a-89a5-2b5acc6e8396', prompt: 'floating crystalline emerald aqueduct arches, cosmic (band 7) (112x80)' },
  { key: 'cosmic-arch-8', id: 'bf283535-67cb-4710-9249-b06b2dc4223e', prompt: 'floating crystalline golden aqueduct arches, cosmic (band 8) (112x80)' },
  { key: 'cosmic-arch-9', id: '8773e6a5-094a-40c2-9892-702309df4c9e', prompt: 'floating crystalline violet aqueduct arches, cosmic (band 9) (112x80)' },
  // ── COSMIQUE : famille OSSATURE (frame = public_works/ruin_architects) ──
  { key: 'cosmic-frame-7', id: '7599e7d5-e334-4f7b-ba5a-1257a8696f9d', prompt: 'floating crystalline emerald lattice cube frame, cosmic (band 7) (96x96)' },
  { key: 'cosmic-frame-8', id: '0b47747a-ebac-4a1d-af12-4abda5bf2f69', prompt: 'floating crystalline golden lattice cube frame, cosmic (band 8) (96x96)' },
  { key: 'cosmic-frame-9', id: '3eac188a-1bd9-4477-acb3-5f6f89745d92', prompt: 'floating crystalline violet lattice cube frame, cosmic (band 9) (96x96)' },
  // ── INFRA ── VEILLEURS (watch, engineSprites.js) — ÉVOLUTION 4 STADES (2026-07-05) ──
  // 1er bâtiment INFRA. TOUR (blit 0.78×0.94). Stade 0 = tour bois + feu animé (watch-back+watch-fire)
  // inchangé. Stades 1-3 = tours closes qui évoluent. Cosmique déjà fait (famille spire).
  {
    key: 'watch-stone',
    id: '7f331ce9-5038-4064-b2ba-c30218b837f2', // stade 1 — tour de guet médiévale (pierre crénelée + brasier + drapeau) (88×112)
    prompt: 'a closed medieval stone watchtower building seen from a low top-down angle, completely deserted, no people, no figures, no person: a tall round crenellated stone tower with narrow arrow-slit windows, a glowing brazier beacon on the battlement top, a hanging guard flag, a wooden door at the base, weathered grey-stone palette, soft light from the upper-left casting shadows to the lower-right, small patch of stone ground',
  },
  {
    key: 'watch-industrial',
    id: '182c1aaf-d317-4f32-9b83-91bd4824ebd4', // stade 2 — tour d'observation industrielle (brique/fer + lanterne + cloche) (88×112)
    prompt: 'a closed 19th-century industrial lookout tower building seen from a low top-down angle, completely deserted, no people, no figures, no person: a tall brick-and-iron watchtower with a railed observation deck near the top, a bright signal lantern and a bell at the summit, tall warm-lit windows, a riveted iron frame, warm brick-and-iron palette, soft light from the upper-left casting shadows to the lower-right, small patch of paved ground',
  },
  {
    key: 'watch-modern',
    id: '104fa190-13b9-408e-b964-fb406638497d', // stade 3 — tour de surveillance moderne (radar + caméras + antennes cyan) (88×112)
    prompt: 'a closed modern surveillance tower building seen from a low top-down angle, completely deserted, no people, no figures, no person: a sleek tall concrete-and-glass observation tower with a rotating radar dish and security cameras at the top, glowing cyan antenna lights, a glass control cabin near the summit, cool grey palette with cyan glow, soft glow lighting, small patch of tidy ground',
  },
  // ── INFRA ── MINISTÈRES (ministries, dome) — stades 1-3 (stade 0 procédural conservé) ──
  { key: 'ministries-palace', id: 'd226b621-2309-496c-b93f-f620b9e5427c', prompt: 'closed medieval government palace, banners, official crest (112x88)' },
  { key: 'ministries-capitol', id: '4d0c3776-5b87-418a-8cc1-87e57b04d27b', prompt: 'closed neoclassical government capitol, rotunda dome, flags (112x88)' },
  { key: 'ministries-tower', id: '27ce8808-e248-4abf-b7d5-3e139f5e8e57', prompt: 'closed modern government administration glass tower, flags (112x88)' },
  // ── INFRA ── TRIBUNAUX (courthouses, temple) — stades 1-3 (stade 0 procédural conservé) ──
  { key: 'courthouses-tribunal', id: 'f1fdf289-9851-473e-8ff8-abdfc8b986db', prompt: 'closed medieval courthouse tribunal, scales-of-justice emblem (112x88)' },
  { key: 'courthouses-neoclassical', id: '344d4e01-5f31-4f82-9f21-41c91617fc28', prompt: 'closed neoclassical courthouse, columns, scales pediment (112x88)' },
  { key: 'courthouses-modern', id: '2dac0205-a710-4f20-bc27-bf4ea08a4930', prompt: 'closed modern courthouse, glowing scales-of-justice emblem (112x88)' },
  // ── INFRA ── BUREAUCRATIE (bureaucracy, hall) — stades 1-3 (stade 0 procédural conservé) ──
  { key: 'bureau-chancery', id: '172d6b99-23a4-487d-a0ad-83f9e5103e81', prompt: 'closed medieval administrative chancery, ledgers, wax seal (112x88)' },
  // v3 = REFONTE 3/4 top-down (v2 1b8b208f sortait DE FACE). Re-cadré post-DL (cf. granary-warehouse).
  { key: 'bureau-office', id: '2f8d9cc7-a797-4ea5-8133-d78c33b2ff50', prompt: 'a small closed 19th-century civic bureau office building seen from above at a top-down angle, completely deserted, no people, no figures, no person: a wide three-storey dark red brick administrative building with regular rows of tall rectangular windows, a stone-framed central doorway with a small cornice, a low pitched roof clearly visible from above showing the roof plane and one side wall, a couple of brick chimneys, austere bureaucratic brick and stone palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground (112x88)' },
  { key: 'bureau-tower', id: 'd2ab18f4-e802-4815-b409-06006d8f7b21', prompt: 'closed modern glass office tower, grid of windows (112x88)' },
  // ── INFRA ── GRANDS TRAVAUX (public_works, frame) — stades 1-3 (stade 0 procédural conservé) ──
  { key: 'works-yard', id: '96e184b6-fe20-456e-a644-4d2d56850e7b', prompt: 'closed medieval masons stoneyard workshop + treadwheel crane (112x88)' },
  { key: 'works-industrial', id: '6e7f1879-4dcc-4f61-aef1-dcb39e8b6835', prompt: 'closed 19th-century engineering workshop, chimney, steam crane (112x88)' },
  { key: 'works-depot', id: '766c8459-2ef9-4941-8ae2-e8dbf3846c79', prompt: 'closed modern public works depot, yellow tower crane, containers (112x88)' },
  // ── INFRA ── ARCHIVES (archive_grids, hall) — stades 1-3 (stade 0 procédural conservé) ──
  { key: 'archive-vault', id: '5b2fd155-652d-4ecb-bf86-99c5e3e2770d', prompt: 'closed medieval archive vault, barrel roof, scroll shelves (112x88)' },
  // v3 = REFONTE 3/4 top-down (v2 94f42abd sortait DE FACE). Re-cadré post-DL (cf. granary-warehouse).
  { key: 'archive-records', id: '6b199330-dc04-4281-a24a-620554e424c6', prompt: 'a small closed 19th-century hall of public records archive building seen from above at a top-down angle, completely deserted, no people, no figures, no person: a formal grey-stone-and-brick records repository with tall rectangular windows, a stone-framed door with a carved scroll-and-quill emblem above it, a low pitched roof clearly visible from above showing the roof plane and one side wall, a small central skylight lantern on the roof, austere grey stone and brick bureaucratic palette, soft light from the upper-left casting shadows to the lower-right, transparent background no ground (112x88)' },
  { key: 'archive-grid', id: '42f61218-51ae-461e-a232-67b948418578', prompt: 'closed modern data archive grid, cyan server lights, antennas (112x88)' },
  // ── INFRA ── ÉGOUTS (sewers, arch) — stades 1-3 (stade 0 pixel+eau animée conservé) ──
  { key: 'sewers-medieval', id: '3d50d082-b279-4ba1-8bf0-ba1a0717c8a6', prompt: 'closed medieval stone sewer outfall station, grated arch, water (112x88)' },
  { key: 'sewers-works', id: 'b695a378-3253-4b4a-bd88-2566b41c4b1c', prompt: 'closed Victorian brick sewer pumping works, chimney, outfall (112x88)' },
  { key: 'sewers-plant', id: 'c2716f6d-6167-47ff-9099-5873cf80cb97', prompt: 'closed modern water treatment plant, settling tanks, cyan (112x88)' },
  // ── INFRA ── ARCHITECTES DES RUINES (ruin_architects, frame) — stades 1-3 (stade 0 procédural conservé) ──
  { key: 'ruins-lodge', id: 'b6c1dbc9-2cd6-4b7b-b654-e7490d75d82c', prompt: 'closed medieval restoration masons lodge + scaffolded broken arch (112x88)' },
  { key: 'ruins-institute', id: '48f07ccb-2796-490a-b68e-ee3ef9f1d029', prompt: 'closed 19th-century archaeology museum, columned portico, restored column (112x88) — v2 (v1 20cb1952 = scène pas bâtiment)' },
  { key: 'ruins-lab', id: '950e74f1-77a5-4597-80cf-6e761aad947f', prompt: 'closed modern heritage reconstruction lab + holographic ruin (112x88)' },
  // ── INFRA ── AQUEDUCS (aqueducts, arch) — MODULAIRE COMPLET, méthode stade 0 (2026-07-06) ──
  // UNE scène d'aqueduc large & cohérente PAR ÈRE (192×96 : canal d'eau CONTINU bord-à-bord + arches/
  // piliers réguliers + source à gauche + livraison à droite), TÉLÉCHARGÉE ici, puis DÉCOUPÉE en
  // outlet/seg/intake (3× 64×96) via `node scripts/sliceAqueduct.mjs <era>`. Le canal continu = ce qui
  // fait tuiler le seg (≠ modules générés séparément = trous, essayés puis abandonnés). ⚠ Les modules
  // `aqueduct-<era>-outlet/-seg/-intake` sont PRODUITS PAR LE SLICE, PAS par fetchProps.
  { key: 'aqueduct-roman-scene', id: '304d9723-8064-4a7c-a64f-6cc79fe98d51', prompt: 'FULL Roman stone aqueduct 192x96 — a slicer (roman)' },
  { key: 'aqueduct-iron-scene', id: 'aeed3e36-0977-4462-9676-b61dc2b1cd43', prompt: 'FULL industrial iron aqueduct viaduct 192x96, TALL truss pylons — a slicer (iron) — v2 (v1 b8fdbeb2 trop maigre/plat)' },
  { key: 'aqueduct-modern-scene', id: 'da406c9c-44b3-493d-8464-ee8ef510d6a2', prompt: 'FULL modern concrete viaduct 192x96 — a slicer (modern)' },
  // ── INFRA ── STADES 0 PIXEL des 6 infra procéduraux (2026-07-06, oubli corrigé) ──
  // Bâtiments PRIMITIFS/anciens (ei<10) qui remplacent le repli procédural du stade 0.
  { key: 'ministries-council', id: 'ba119da9-3bbc-4bfa-a269-9742777ab2b7', prompt: 'primitive tribal council longhouse + totem (112x88)' },
  { key: 'courthouses-lodge', id: 'e814a076-b298-421c-abd3-c9dc1b496509', prompt: 'primitive dry-stone tribunal lodge + scales charm (112x88)' },
  { key: 'bureau-hut', id: '25c29c23-2da0-4466-9d7e-c33b008bd894', prompt: 'primitive record-keeper mud-brick hut + clay tablets (112x88)' },
  { key: 'works-camp', id: 'cb34421e-2858-41ef-9984-4c6716acb1ed', prompt: 'primitive builders work shed + stone blocks + lever hoist (112x88)' },
  { key: 'archive-hut', id: '063a1825-ccae-47d8-adf3-816e0e8c40a7', prompt: 'primitive archive hut + clay tablet/scroll shelves (112x88)' },
  { key: 'ruins-camp', id: 'a3d6533c-28fd-49d6-95c4-1d1c58ce93e5', prompt: 'primitive surveyors camp hut beside an ancient ruin (112x88)' },
  // NB : les props du trio (forager-prop-tree/-basket, granary-prop-silo, caravan-prop-sacks)
  // ont été récupérés avant ce script — déjà sur disque, ids non consignés.
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FILTER = process.argv[2] || '';

fs.mkdirSync(OUT, { recursive: true });
for (const p of PROPS) {
  if (FILTER && !p.key.includes(FILTER)) continue;
  if (!p.id) { console.log(p.key, '— pas d\'id, skip'); continue; }
  let png = null;
  for (let i = 0; i < 80 && !png; i += 1) {
    try {
      const r = await fetch(`https://api.pixellab.ai/mcp/objects/${p.id}/download`);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 500 && buf.subarray(0, 4).equals(PNG_SIG)) png = buf;
      }
    } catch { /* pas prêt */ }
    if (!png) await sleep(15000);
  }
  if (!png) { console.warn(p.key, '— pas prêt (timeout, objet expiré ?), skip'); continue; }
  if (p.flip === 'h') png = flipH(png);
  if (p.patch === 'door') png = coverDoor(png);
  fs.writeFileSync(`${OUT}/${p.key}.png`, png);
  console.log(p.key, '— écrit →', p.key + '.png', (p.flip ? '(flip ' + p.flip + ') ' : '') + `(${png.length} o)`);
}
console.log('OK — props dans', OUT);
