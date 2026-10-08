"use strict";
// PORTE STATIQUE i18n (audit du 05/10, I18N-8). La porte de couverture
// (i18n.coverage.test.js) ne voit que les unités { fr, en } : une chaîne
// française NUE — chronicle("…"), label: "Les osselets", <p>Bientôt</p> — n'en
// est pas une, elle passait toujours. C'est ainsi que ~400 lignes de français se
// sont glissées dans la version anglaise entre juin et octobre sans qu'aucun test
// ne rougisse. Ici on relit le CODE : tout littéral (chaîne, gabarit, texte JSX)
// d'allure française hors d'une unité { fr, en } fait échouer le test.
//
// « Allure française » : un accent (ou des guillemets « »), une élision (l', d',
// qu'…), un mot-outil français dans un texte de deux mots ou plus, ou un mot du
// LEXIQUE (mots du jeu sans homonyme anglais). Ne comptent pas : les clés
// d'objet, les comparaisons et les `case` (des identifiants), les imports,
// console/Error, les attributs techniques (className, id…), un mot seul en
// minuscules hors JSX (un id : « bétail », « croupière »), les crochets de dev
// `window.__x = …`. Comptent comme traduits : la valeur d'une clé fr/en (à toute
// profondeur : `fr: n > 1 ? "…" : "…"`), un objet qui porte une clé en
// ({ m, f, en }), une variable ou un tableau « côté français » (fr, partsFr)
// dont le jumeau anglais est bâti à côté, le 1er argument de say(fr, en).
//
// Ce qui reste hors { fr, en } À DESSEIN est nommé, avec sa raison : FICHIERS_DEV
// (texte de développeur), LISTE_BLANCHE (noms propres assumés, clés, libellés
// internes). GEL : le reliquat toléré, par fichier — il ne peut que DÉCROÎTRE.
// Vide au 05/10 : le lot 3 de l'audit a tout traduit.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
// @babel/parser arrive avec l'outillage (eslint-plugin-react-hooks → @babel/core),
// pas de dépendance à ajouter ; s'il disparaît, l'ajouter aux devDependencies.
const { parse } = createRequire(path.join(ROOT, "package.json"))("@babel/parser");

// ── Le détecteur ─────────────────────────────────────────────────────────────
const ACCENT = /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ«»]/;
const ELISION = /(^|[^\p{L}])(?:l|d|qu|n|s|c|j|m|t)['’]\p{L}/iu;
// Mots-outils sans homonyme anglais courant (« on », « son », « par », « encore »,
// « pendant » en sont exclus : ils feraient sonner l'anglais).
const MOTS_OUTILS = new Set(("le la les de des du un une et ou si ni ne pas en au aux ce cet cette ces se sa ses "
  + "ta tes ma mes nos notre vos votre leur leurs il ils elle elles nous vous lui eux moi toi qui que quoi dont "
  + "sur sous dans pour avec sans chez entre avant depuis contre comme quand puis donc mais plus tout tous toute "
  + "toutes rien jamais toujours chaque aucun aucune est sont ont fait peut doit").split(" "));
// Mots du jeu, français seulement (ni « grand », ni « rang », ni « boutique » :
// l'anglais les emploie aussi). Sans accent : l'accent suffit déjà.
const LEXIQUE = new Set(("acheter vendre voir jouer miser tirer rester ouvrir fermer annuler valider retour "
  + "suivant suivante choisir ville nourriture savoir habitant habitants moteurs usure ruine ruines chronique "
  + "effondrement effondrements mythe mythes relancer encaisser doubler partager abandonner continuer reprendre "
  + "sauvegarder sauvegarde supprimer confirmer plein pleine vide vides fini perdu perdue mise mises cagnotte "
  + "salle nuit jour jours matin soir ressource ressources faveur entrer parier gratter voler jeter niveau "
  + "logement logis rue rues quartier quartiers maison bientot apres debut gratuit gratuits sceau sceaux "
  + "rayonnement famille familles achat achats accompli accomplis jardin grande grands voie travaux banques "
  + "immeuble bateau passeur automatique vernis heures secondes crise feu jeu jeux monde temps partie deux trois "
  + "quatre cinq dix vingt mille seul seule prochain prochaine dernier nouveau nouvelle ciel eau dieu dieux prix "
  + "carte cartes arbre gagne gagner perdre palier copie dette titre jalon comptoir caisse veille roue pacte voix "
  + "chemin pierre marchand marchands enfant enfants peuple murs fleuve tombe sommet territoire recettes moisson "
  + "offrande offrandes jeton jetons osselets flamme braise cendres merveille merveilles bois").split(" "));
const NON_TEXTE = /^(?:https?:|data:|blob:|\.{0,2}\/)|\.(?:png|jpe?g|gif|webp|svg|jsx?|mjs|css|json|mp3|ogg|wav|txt|md)(?:\?.*)?$/i;
const CSS_OU_GLSL = /^#version|(?:^|\s)\d+(?:\.\d+)?(?:px|em|rem)(?:\s|$)|sans-serif|monospace|system-ui|Pixelify Sans/;

function allureFrancaise(texte, sorte) {
  const t = texte.trim();
  if (!t || NON_TEXTE.test(t) || CSS_OU_GLSL.test(t)) return false;
  const jetons = t.split(/\s+/);
  // Un mot seul en minuscules, accents compris, hors texte JSX : un identifiant.
  if (sorte !== "jsx" && jetons.length === 1 && /^[\p{Ll}\d_\-.:/]+$/u.test(t)) return false;
  if (ACCENT.test(t) || ELISION.test(t)) return true;
  const mots = [];
  for (const j of jetons) {
    const m = j.match(/^[("«'¡¿]*(\p{L}+)[)"».,!?:;…]*$/u);
    if (m) mots.push(m[1].toLowerCase());
  }
  const phrase = jetons.length >= 2;
  if (phrase && mots.some((m) => MOTS_OUTILS.has(m))) return true;
  return mots.some((m) => LEXIQUE.has(m)) && (phrase || sorte === "jsx" || /^\p{Lu}/u.test(t));
}

// ── Les contextes ────────────────────────────────────────────────────────────
const ATTRS_TECHNIQUES = new Set(["className", "key", "id", "style", "src", "href", "type", "role", "name", "htmlFor",
  "rel", "target", "viewBox", "d", "fill", "stroke", "points", "transform", "lang", "dir", "value", "defaultValue",
  "method", "action", "autoComplete", "inputMode", "pattern", "form", "accept", "download"]);
const CLES_TECHNIQUES = /^(?:id|key|type|className|cls|class|src|href|url|path|file|slug|ref|storageKey|lang|err|erreur|error)$|(?:Id|Key|Class|Src|Url)$/;
// Appels dont les arguments ne s'affichent jamais au joueur : console, erreurs,
// journal de debug du fleuve (dbg), sonde G0 (recPx), journal fichier de main.cjs.
const APPELS_HORS_JEU = /^(?:console|Error|TypeError|RangeError|SyntaxError|require|assert|dbg|reportMapError|recPx|journal)$/;
// Méthodes « logiques » : leurs arguments sont des clés ou des motifs.
const METHODES_LOGIQUES = new Set(["includes", "startsWith", "endsWith", "test", "match", "matchAll", "replace",
  "replaceAll", "split", "indexOf", "lastIndexOf", "querySelector", "querySelectorAll", "getElementById", "closest",
  "matches", "addEventListener", "removeEventListener", "getItem", "removeItem", "localeCompare"]);
const CLE_EN_PREMIER = new Set(["has", "get", "delete", "set", "setItem", "setAttribute", "getAttribute",
  "removeAttribute", "setProperty", "getPropertyValue"]);
const COTE_FRANCAIS = /^(?:fr|\w*Fr|fr[A-Z]\w*)$/;
const IGNORES = new Set(["loc", "start", "end", "extra", "range", "leadingComments", "trailingComments", "innerComments"]);

const nomCle = (k) => k && (k.name ?? k.value);
function appele(n) {
  if (!n) return [];
  if (n.type === "Identifier") return [n.name];
  if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") return [...appele(n.object), nomCle(n.property) || "?"];
  if (n.type === "CallExpression" || n.type === "OptionalCallExpression") return appele(n.callee);
  return ["?"];
}
const crochetDev = (n) => n && n.type === "MemberExpression" && n.object.type === "Identifier"
  && /^(?:window|globalThis|self)$/.test(n.object.name) && /^__/.test(nomCle(n.property) || "");
const attrTechnique = (a) => a && a.type === "JSXAttribute"
  && (ATTRS_TECHNIQUES.has(a.name.name) || /^data-/.test(String(a.name.name)));

// Relit une source ; rend les chaînes françaises nues (ligne, texte), les
// déclarations et textes de liste blanche rencontrés, et dit si elle appelle
// localizeData.
function scanSource(code, fichier, blanche = {}) {
  const decl = new Set(blanche.decl || []), textes = new Set(blanche.textes || []);
  const vus = { decl: new Set(), textes: new Set() };
  let localize = false;
  const ast = parse(code, {
    sourceType: fichier.endsWith(".cjs") ? "script" : "module",
    plugins: ["jsx"], attachComment: false,
  });
  const hits = [];
  const pile = []; // [{ n, cle }] : le nœud et la clé qui y mène depuis son parent
  const verifier = (n) => {
    let texte, sorte = "str";
    if (n.type === "TemplateLiteral") {
      texte = n.quasis.map((q) => q.value.cooked ?? q.value.raw).join(" ${} ");
      if (n.expressions.length) sorte = "tpl";
    } else {
      texte = n.value;
      if (n.type === "JSXText") sorte = "jsx";
    }
    const i = pile.length - 1;
    const parent = pile[i - 1] && pile[i - 1].n, cle = pile[i].cle;
    // La valeur d'une clé fr est du français, quelle que soit son allure.
    const valeurFr = !!parent && parent.type === "ObjectProperty" && cle === "value" && nomCle(parent.key) === "fr";
    if (!valeurFr && !allureFrancaise(texte, sorte)) return;
    const propre = texte.replace(/\s+/g, " ").trim();
    if (textes.has(propre)) { vus.textes.add(propre); return; }
    let statut = "nu", plusProche = true;
    for (let j = i - 1; j >= 0; j--) {
      const a = pile[j].n, sous = pile[j + 1].cle;
      if (a.type === "ObjectProperty" && sous === "value") {
        const k = nomCle(a.key), obj = pile[j - 1] && pile[j - 1].n;
        const aEn = !!obj && obj.properties.some((q) => nomCle(q.key) === "en");
        if (k === "en") return;
        if (k === "fr") {
          if (aEn || obj.properties.some((q) => q.type === "SpreadElement")) return;
          statut = "fr sans en"; break;
        }
        if (plusProche && aEn) return; // { m, f, en }
        plusProche = false;
      }
      // getLang() === "en" ? "…" : "…"
      if (a.type === "ConditionalExpression" && sous !== "test" && a.test.type === "BinaryExpression"
        && [a.test.left, a.test.right].some((x) => x.type === "StringLiteral" && (x.value === "en" || x.value === "fr"))) return;
      if (a.type === "VariableDeclarator" && sous === "init" && a.id.type === "Identifier" && COTE_FRANCAIS.test(a.id.name)) return;
      if (a.type === "AssignmentExpression" && sous === "right" && a.left.type === "Identifier" && COTE_FRANCAIS.test(a.left.name)) return;
      if (a.type === "CallExpression" && sous === "arguments") {
        const p = appele(a.callee);
        if (p.length === 2 && p[1] === "push" && COTE_FRANCAIS.test(p[0])) return;
        if (p.length === 1 && p[0] === "say" && a.arguments.length === 2 && a.arguments[0] === pile[j + 1].n) return;
      }
    }
    if (statut === "nu") {
      if (!parent) return;
      if (parent.type === "ObjectProperty" && cle === "key") return;
      if (parent.type === "ObjectProperty" && cle === "value" && CLES_TECHNIQUES.test(nomCle(parent.key) || "")) return;
      if (/^(?:Import|Export)/.test(parent.type)) return;
      if (parent.type === "BinaryExpression" && /^(?:===|!==|==|!=|in)$/.test(parent.operator)) return;
      if (parent.type === "SwitchCase" && cle === "test") return;
      if (attrTechnique(parent)) return;
      if (parent.type === "JSXExpressionContainer" && attrTechnique(pile[i - 2] && pile[i - 2].n)) return;
      if ((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && cle === "property") return;
      for (let j = i - 1; j >= 0; j--) {
        const a = pile[j].n;
        if (/Function|^Program$/.test(a.type)) break;
        if (a.type === "ThrowStatement") return;
        if ((a.type === "CallExpression" || a.type === "NewExpression" || a.type === "OptionalCallExpression") && pile[j + 1].cle !== "callee") {
          const p = appele(a.callee), dernier = p[p.length - 1];
          if (APPELS_HORS_JEU.test(p[0])) return;
          if (j >= i - 2 && METHODES_LOGIQUES.has(dernier)) return;
          if (j >= i - 2 && CLE_EN_PREMIER.has(dernier) && a.arguments[0] === pile[j + 1].n) return;
          if (j === i - 1 && dernier === "tr" && a.arguments[0] === n) statut = "tr(chaîne)";
        }
      }
    }
    hits.push({ ligne: n.loc.start.line, statut, texte: propre.slice(0, 100) });
  };
  const visiter = (n, cle) => {
    if ((n.type === "VariableDeclarator" || n.type === "FunctionDeclaration") && n.id && n.id.type === "Identifier" && decl.has(n.id.name)) {
      vus.decl.add(n.id.name);
      return;
    }
    if (n.type === "AssignmentExpression" && crochetDev(n.left)) return;
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "localizeData") localize = true;
    pile.push({ n, cle });
    if (n.type === "StringLiteral" || n.type === "TemplateLiteral" || n.type === "JSXText") verifier(n);
    for (const k of Object.keys(n)) {
      if (IGNORES.has(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") visiter(c, k); }
      else if (v && typeof v.type === "string") visiter(v, k);
    }
    pile.pop();
  };
  visiter(ast.program, "program");
  return { hits, vus, localize };
}

// ── Ce qui reste hors { fr, en } à dessein ───────────────────────────────────
// Fichiers de développeur : leur texte ne s'adresse jamais au joueur.
const FICHIERS_DEV = {
  "src/components/dialogs/DebugDialog.jsx": "panneau de debug",
  "src/game/core/debugTools.js": "outils de debug",
  "src/game/map/fpsProbe.js": "sonde de fluidité (?fps), affichage de dev",
  "src/game/map/tissuMetrics.js": "mesure du tissu urbain, rapport console",
  "src/game/map/pixelGrid.js": "sonde G0 de la grille de pixels",
  "src/game/map/frameGuard.js": "messages console des exceptions de la carte",
  "src/game/audio/paysage/banc.js": "banc d'écoute du paysage sonore (Ctrl+Alt+B), outil de réglage",
};
// Par fichier : `decl` = déclarations (const X = … ou function X) ignorées en
// entier, `textes` = textes exacts tolérés. Les noms PROPRES de la carte
// (prénoms, épithètes, lieux-dits, maisons, rues, résidences) sont une couleur
// française assumée dans les deux langues (cityNaming.js, en tête ; audit
// I18N-4) : si Raph en décide autrement, retirer ces entrées et les traduire.
const LISTE_BLANCHE = {
  "src/game/map/cityNaming.js": { decl: ["CM_GIVEN", "CM_EPITHETS", "CM_TRADES", "CM_HOUSES", "CM_GIVEN_M", "CM_GIVEN_F",
    "CM_EPITHETS_M", "CM_EPITHETS_F", "CM_STREET_OF", "CM_RESIDENCES", "CM_LIEUX"] },
  // Noms de scène de la troupe, par TEXTE et non `decl: ["TROUPE"]` : la
  // déclaration porte aussi les rôles { fr, en } (Danseuse, workLabel…), qu'un
  // `decl` masquerait — un `en` retiré n'y serait plus vu.
  "src/game/map/iso/isoPlaisirs.js": { textes: ["Ysoria la Rousse", "Soraya la Nomade", "Linnea la Vive", "Talia la Patiente"] },
  "src/game/core/actions/steward.js": { decl: ["MAGISTRATE_NAMES"] },     // prénoms des magistrats
  "src/game/core/actions/courses.js": { decl: ["NOMS"] },                 // CLÉS sauvegardées ; l'écran lit nomCheval()
  "src/game/data/myths.js": { decl: ["RAGNAROK_FINAL_TITLE"] },           // drapeau sauvegardé ; l'écran lit RAGNAROK_FINAL_TITLE_TEXT
  "src/game/map/citizenFocus.js": { decl: ["CARGO"] },                    // paires [fr, en]
  "src/game/map/citizenIdentity.js": { decl: ["NAME_PARTS"] },            // « Frère Garin » : nom propre, comme les lieux-dits
  "src/game/map/housePalette.js": { decl: ["COULEURS_PROTEGEES"] },       // notes d'outillage, jamais affichées
  "src/components/ui/plaisirsMaterial.js": { decl: ["TABLES"] },          // `name` interne des tapis
  "src/components/dialogs/OptionsDialog.jsx": { textes: ["Français"] },   // le nom d'une langue s'écrit dans cette langue
  "src/components/views/ChronicleView.jsx": { textes: ["Ragnarök"] },     // nom propre, le même en anglais
  "src/game/data/parolesFigures.js": { textes: ["Raphaël"] },             // la figure de la Chronique : son prénom, le même en anglais
  // journal() écrit le fichier de log ; dist/ absent n'arrive qu'à un développeur.
  "main.cjs": { decl: ["journal"], textes: ["dist/index.html est introuvable. Lancer `npm run build` d'abord, puis relancer le jeu."] },
};
// Reliquat GELÉ : fichier → nombre de chaînes françaises nues tolérées. Il ne
// peut que DÉCROÎTRE (le test exige de baisser le compte quand on traduit).
const GEL = {};

function listerSources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") listerSources(f, out); }
    else if (/\.(?:js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(f);
  }
  return out;
}

let _scan = null;
function scanDepot() {
  if (_scan) return _scan;
  const fichiers = [...listerSources(path.join(ROOT, "src")), ...["main.cjs", "preload.cjs", "desktopFiles.cjs"].map((f) => path.join(ROOT, f))];
  const parFichier = {}, vus = {}, localize = [];
  for (const abs of fichiers) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (FICHIERS_DEV[rel] || !fs.existsSync(abs)) continue;
    let r;
    try { r = scanSource(fs.readFileSync(abs, "utf8"), rel, LISTE_BLANCHE[rel]); }
    catch (e) { throw new Error(`${rel} : illisible pour la porte i18n (${e.message})`, { cause: e }); }
    if (r.hits.length) parFichier[rel] = r.hits;
    vus[rel] = r.vus;
    if (r.localize && rel !== "src/game/core/i18n.js") localize.push(rel);
  }
  _scan = { n: fichiers.length, parFichier, vus, localize };
  return _scan;
}

describe("i18n — porte statique : pas de français nu dans le code", () => {
  it("le détecteur voit le français hors { fr, en }, et seulement lui", () => {
    const trouves = (code) => scanSource(code, "temoin.jsx").hits.map((h) => h.texte);
    expect(trouves(`
      chronicle("La cité s'effondre.");
      const spot = { label: "Les osselets" };
      const el = <p title="Bientôt">Revenez demain pour jouer</p>;
      tr("Fermer");
      const u = { fr: "Bonjour" };
      pushOutcomeFloat({ label: \`🎰 \${n} tours gratuits\` });
    `)).toEqual(["La cité s'effondre.", "Les osselets", "Bientôt", "Revenez demain pour jouer", "Fermer", "Bonjour", "🎰 ${} tours gratuits"]);
    expect(trouves(`
      import "./données.js";
      tr({ fr: "Bientôt", en: "Soon" });
      tr({ fr: n > 1 ? "Les osselets" : "L'osselet", en: n > 1 ? "Knucklebones" : "Knucklebone" });
      if (kind === "Émeute") go();
      switch (k) { case "Émeute": break; }
      console.log("échec du rendu");
      throw new Error("sauvegarde illisible");
      const o = { id: "café", "clé": 1 }, v = obj["clé"], b = "bétail";
      const trait = { m: "Rêveur", f: "Rêveuse", en: "Dreamy" };
      const fr = ["à la Maison"]; partsFr.push(\`elle t'offre \${x}\`);
      const el = <div className="pièce montée" />;
      window.__carte = () => "carte pas construite";
      say("Le jeu ne répond plus.", "The game is not responding.");
      const lbl = getLang() === "en" ? "Grand Reset" : "Le Grand Reset";
    `)).toEqual([]);
  });

  it("aucune chaîne française hors { fr, en } au-delà du gel", () => {
    const { n, parFichier } = scanDepot();
    expect(n, "la porte ne relit presque rien : chemin des sources ?").toBeGreaterThan(300);
    const fautes = [];
    for (const [f, hits] of Object.entries(parFichier)) {
      const permis = GEL[f] || 0;
      if (hits.length <= permis) continue;
      fautes.push(`${f} : ${hits.length} chaîne(s) française(s) hors { fr, en } (gel : ${permis})\n`
        + hits.slice(0, 12).map((h) => `    l.${h.ligne}  [${h.statut}]  « ${h.texte} »`).join("\n"));
    }
    expect(fautes, fautes.length ? `\n${fautes.join("\n")}\n\nTexte vu par le joueur → tr({ fr, en }) (ou une unité { fr, en } dans les données).\n`
      + "Identifiant, nom propre assumé ou texte de dev → LISTE_BLANCHE / FICHIERS_DEV de ce test, avec sa raison.\n" : "").toEqual([]);
  });

  it("le gel et la liste blanche ne gardent pas d'entrée périmée", () => {
    const { parFichier, vus } = scanDepot();
    const perimees = [];
    for (const [f, permis] of Object.entries(GEL)) {
      const reste = (parFichier[f] || []).length;
      if (reste < permis) perimees.push(`GEL["${f}"] : ${permis} → baisser à ${reste}`);
    }
    for (const [f, w] of Object.entries(LISTE_BLANCHE)) {
      if (!vus[f]) { perimees.push(`LISTE_BLANCHE : ${f} n'existe plus`); continue; }
      for (const d of w.decl || []) if (!vus[f].decl.has(d)) perimees.push(`LISTE_BLANCHE ${f} : déclaration ${d} introuvable`);
      for (const t of w.textes || []) if (!vus[f].textes.has(t)) perimees.push(`LISTE_BLANCHE ${f} : texte « ${t} » introuvable`);
    }
    for (const f of Object.keys(FICHIERS_DEV)) if (!fs.existsSync(path.join(ROOT, f))) perimees.push(`FICHIERS_DEV : ${f} n'existe plus`);
    expect(perimees).toEqual([]);
  });

  it("tout module qui appelle localizeData est importé par la porte de couverture", () => {
    // La porte de couverture ne voit une unité { fr } sans { en } que si le
    // module qui l'aplatit est chargé : sa liste d'imports est tenue à la main
    // (cityPersonality.js y a manqué jusqu'au 05/10).
    const porte = fs.readFileSync(path.join(HERE, "i18n.coverage.test.js"), "utf8");
    const importes = new Set([...porte.matchAll(/^import\s+"(\.[^"]+)";/gm)]
      .map((m) => path.relative(ROOT, path.resolve(HERE, m[1])).split(path.sep).join("/")));
    const manquants = scanDepot().localize.filter((f) => !importes.has(f));
    expect(manquants, "à ajouter aux imports de i18n.coverage.test.js").toEqual([]);
  });
});
