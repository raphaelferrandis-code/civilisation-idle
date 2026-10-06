// Règle des molettes de dev (audit 2026-10-05, DEV-3 ; la règle : devKnobs.js).
// Toute molette `window.__x` / `globalThis.__x` de src/ — définition comme
// lecture — doit être gardée par `import.meta.env?.DEV`, pour que le build de
// production l'élimine ; seuls les profileurs de la sonde de perf (PROD_KNOBS)
// restent dans l'.exe. Avant ce garde-fou, la frontière se décidait molette par
// molette : ~230 réglages livrés dans dist/, dont une douzaine qui appelaient
// `window.__cityRecompute`, défini seulement en dev.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";
import { PROD_KNOBS } from "../devKnobs.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SRC = path.join(ROOT, "src");
const KNOB_RE = /(window|globalThis)\.__[A-Za-z]/;

function sourceFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules" && p !== path.join(SRC, "test")) sourceFiles(p, out);
    } else if (/\.(m?js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const isKnob = (n) => n && n.type === "MemberExpression" && !n.computed
  && n.property && n.property.type === "Identifier" && /^__[A-Za-z]/.test(n.property.name)
  && n.object.type === "Identifier" && (n.object.name === "window" || n.object.name === "globalThis");

// `import.meta.env.DEV`, `import.meta.env?.DEV`, ou une conjonction qui en contient un.
function isDev(n) {
  if (!n) return false;
  if (n.type === "ChainExpression") return isDev(n.expression);
  if (n.type === "LogicalExpression") return n.operator === "&&" && (isDev(n.left) || isDev(n.right));
  if (n.type === "MemberExpression" && !n.computed && n.property.name === "DEV") {
    const o = n.object;
    return o.type === "MemberExpression" && !o.computed && o.property.name === "env" && o.object.type === "MetaProperty";
  }
  return false;
}

// `window.__x`, `window.__x.k`, `window.__x?.k` : la valeur lue d'une molette.
const knobRead = (n) => {
  if (!n) return false;
  if (n.type === "ChainExpression") return knobRead(n.expression);
  return isKnob(n) || (n.type === "MemberExpression" && knobRead(n.object));
};
const LOOSE = { "===": (a, b) => a === b, "!==": (a, b) => a !== b, "==": (a, b) => a == b, "!=": (a, b) => a != b };
const literal = (n) => n.type === "Literal" || (n.type === "Identifier" && n.name === "undefined");
// Lecture VRAIE quand la molette n'est pas posée (`!window.__x`, `window.__x !== false`,
// `window.__x == null`…) : sous `DEV && …`, le build de prod la rendrait fausse.
function trueByDefault(n) {
  if (n.type === "UnaryExpression" && n.operator === "!") return knobRead(n.argument);
  if (n.type !== "BinaryExpression" || !LOOSE[n.operator]) return false;
  const [k, v] = knobRead(n.left) ? [n.left, n.right] : [n.right, n.left];
  return knobRead(k) && literal(v) && LOOSE[n.operator](undefined, v.type === "Literal" ? v.value : undefined);
}
// La partie gauche d'une garde ne fait que garder (DEV, `typeof window !== 'undefined'`) :
// sans elle, la lecture de droite décide seule de la valeur par défaut. Un `window.__x &&`
// plus tôt dans la chaîne la rend déjà fausse quand la molette n'est pas posée.
function onlyGuards(n) {
  if (n.type === "LogicalExpression" && n.operator === "&&") return onlyGuards(n.left) && onlyGuards(n.right);
  if (isDev(n)) return true;
  return n.type === "BinaryExpression" && (n.operator === "!==" || n.operator === "!=")
    && n.left.type === "UnaryExpression" && n.left.operator === "typeof" && n.right.value === "undefined";
}

// Analyse un module : `bad` = accès non gardés, `traps` = gardes qui changent la
// valeur par défaut en prod (le piège `false ?? défaut` de devKnobs.js).
function scanModule(code, rel, out) {
  const ast = parseAst(code, { lang: rel.endsWith("x") ? "jsx" : "js" });
  const at = (node) => `${rel}:${code.slice(0, node.start).split("\n").length}`;
  const visit = (node, anc) => {
    if (!node || typeof node.type !== "string") return;
    if (isKnob(node)) {
      const name = node.property.name;
      out.used.add(name);
      let guarded = PROD_KNOBS.includes(name);
      for (let i = anc.length - 1; i >= 0 && !guarded; i--) {
        const a = anc[i], child = anc[i + 1] || node;
        if ((a.type === "IfStatement" || a.type === "ConditionalExpression") && a.consequent === child && isDev(a.test)) guarded = true;
        else if (a.type === "LogicalExpression" && a.operator === "&&" && a.right === child && isDev(a.left)) guarded = true;
      }
      if (!guarded) out.bad.push(`${at(node)} ${name}`);
      return;
    }
    if (node.type === "LogicalExpression" && node.operator === "&&" && isDev(node.left) && KNOB_RE.test(code.slice(node.right.start, node.right.end))) {
      const parent = anc[anc.length - 1];
      const src = code.slice(node.start, node.end).replace(/\s+/g, " ");
      if (parent && parent.type === "LogicalExpression" && parent.operator === "??" && parent.left === node) out.traps.push(`${at(node)} ?? après la garde : ${src}`);
      else if (parent && parent.type === "BinaryExpression") out.traps.push(`${at(node)} garde comparée : ${src}`);
      else if (onlyGuards(node.left) && trueByDefault(node.right)) out.traps.push(`${at(node)} vraie par défaut, fausse en prod : ${src}`);
    }
    anc.push(node);
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") visit(c, anc); }
      else if (v && typeof v.type === "string") visit(v, anc);
    }
    anc.pop();
  };
  visit(ast, []);
  return out;
}

// Tout src/ : [fichier:ligne nom] pour chaque accès non gardé, et les gardes piégées.
function unguardedKnobs() {
  const out = { bad: [], traps: [], used: new Set() };
  for (const file of sourceFiles(SRC)) {
    const code = fs.readFileSync(file, "utf8");
    if (!KNOB_RE.test(code)) continue;
    scanModule(code, path.relative(ROOT, file).split(path.sep).join("/"), out);
  }
  return out;
}

describe("molettes de dev (DEV-3)", () => {
  const { bad, traps, used } = unguardedKnobs();

  it("toute molette window.__ / globalThis.__ est gardée par import.meta.env?.DEV, hors profileurs de la sonde", () => {
    expect(bad).toEqual([]);
  });

  it("aucune garde ne change la valeur par défaut que le build de prod verra", () => {
    expect(traps).toEqual([]);
  });

  it("le détecteur de gardes piégées reconnaît le piège et laisse passer les bonnes formes", () => {
    const scan = (code) => scanModule(code, "fixture.js", { bad: [], traps: [], used: new Set() }).traps.length;
    // Pièges : en prod, false ?? 0.72 vaut false ; un défaut VRAI devient faux.
    expect(scan("const k = (import.meta.env?.DEV && window.__k) ?? 0.72;")).toBe(1);
    expect(scan("if (import.meta.env?.DEV && typeof window !== 'undefined' && window.__on !== false) f();")).toBe(1);
    expect(scan("const off = import.meta.env?.DEV && !globalThis.__cull;")).toBe(1);
    // Bonnes formes (devKnobs.js) : ternaire complet, négation de la garde entière,
    // lecture fausse par défaut, défaut déjà faux plus tôt dans la chaîne.
    expect(scan("const k = import.meta.env?.DEV && window.__k != null ? window.__k : 0.72;")).toBe(0);
    expect(scan("if (!(import.meta.env?.DEV && globalThis.__cull === false)) f();")).toBe(0);
    expect(scan("if (import.meta.env?.DEV && window.__probe) f();")).toBe(0);
    expect(scan("if (import.meta.env?.DEV && window.__t && window.__t.k !== false) f();")).toBe(0);
  });

  it("la liste des exceptions de prod ne garde que des molettes qui existent", () => {
    expect(PROD_KNOBS.filter((k) => !used.has(k))).toEqual([]);
  });

  it("la sonde de perf trouve dans le build de prod chaque molette du jeu qu'elle lit", () => {
    const sonde = fs.readFileSync(path.join(ROOT, "scripts/sondeGeste.js"), "utf8");
    const lues = [...new Set([...sonde.matchAll(/globalThis\.(__[A-Za-z]\w*)/g)].map((m) => m[1]))];
    expect(lues.length).toBeGreaterThan(0);
    // Une molette que le jeu ne définit plus (la sonde s'en passe) n'a pas à y être.
    expect(lues.filter((k) => used.has(k) && !PROD_KNOBS.includes(k))).toEqual([]);
  });
});
