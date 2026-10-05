import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Les fins de manche des tables de la Maison (audit du 2026-10-05 : BUG-46, BUG-47,
// BUG-115, BUG-49). Garde STATIQUE, comme stakeSaveSoon.test.js : ces scènes (clics,
// canvas, rAF, écouteurs clavier) ne sont pas montables sous vitest, sans DOM. Le
// verrou anti double-clic lui-même est testé pour de vrai (plaisirs/__tests__/clickLock).

const here = dirname(fileURLToPath(import.meta.url));
const src = (file) => readFileSync(join(here, "..", file), "utf8");
// Le corps d'une fonction fléchée `const nom = (…) => {` jusqu'à son `};` de même retrait.
function body(text, decl) {
  const at = text.indexOf(decl);
  expect(at, decl).toBeGreaterThanOrEqual(0);
  const indent = text.lastIndexOf("\n", at);
  const pad = text.slice(indent + 1, at);
  const end = text.indexOf(`\n${pad}};`, at);
  return text.slice(at, end);
}

describe("vingt-et-un : double-clic et donne refusée (BUG-46, BUG-47)", () => {
  const bj = src("BlackjackStage.jsx");

  it("toutes les actions de la table passent par le verrou commun", () => {
    expect(bj).toMatch(/const onDeal = \(amount = stake\) => lock\.act\(/);
    for (const h of ["onHit", "onStand", "onDouble", "onSplit", "onNewHand"]) {
      expect(bj).toMatch(new RegExp(`const ${h} = \\(\\) => lock\\.act\\(`));
    }
    // Le menu neuf (fin de main, main refendue suivante) est verrouillé lui aussi.
    expect(bj).toMatch(/useEffect\(\(\) => \{ lock\.arm\(\); \}, \[[^\]]*phase[^\]]*hand\?\.active[^\]]*\]\)/);
    expect(bj).not.toMatch(/hittingRef/);
    // « Quitter la table » du menu de fin aussi (sous « Doubler » d'une main perdue).
    expect(bj).toMatch(/className="btn-close" onClick=\{\(\) => lock\.act\(onClose\)\}/);
  });

  it("« Même mise » et « Laisser courir » n'effacent plus le verdict avant la donne", () => {
    expect(bj).not.toMatch(/setOutcome\(null\);\s*onDeal\(/);
    // Le videur qui refuse la donne renvoie au pari (sa pancarte, « Distribuer » grisé).
    expect(bj).toMatch(/if \(!h\) \{ if \(videurBarre\(\)\) \{ setHand\(null\);[^}]*setPhase\('bet'\); \} return; \}/);
  });
});

describe("fins de manche cohérentes entre les tables (BUG-115)", () => {
  it("roulette : l'animation du tour est annulée au démontage", () => {
    const rl = src("RouletteStage.jsx");
    expect(rl).not.toMatch(/let raf\b/);
    expect(rl).toMatch(/useEffect\(\(\) => \(\) => \{[^}]*cancelAnimationFrame\(rafRef\.current\)/);
  });

  it("courses : le règlement tient à l'horloge, le rAF ne fait que dessiner", () => {
    const co = src("CoursesStage.jsx");
    const step = body(co, "const step = () => {");
    expect(step).not.toMatch(/flushPending|setPhase/);
    const course = body(co, "const onCourse = () => {");
    expect(course).toMatch(/timerRef\.current = setTimeout\(\(\) => \{[\s\S]*flushPending\(\);[\s\S]*setPhase\('result'\)/);
    expect(co).toMatch(/clearTimeout\(timerRef\.current\); \}, \[\]\);/); // et le démontage l'annule
  });

  it("roue : le tour suivant se rejoue depuis la roue posée", () => {
    const ro = src("RoueStage.jsx");
    expect(ro).toMatch(/disabled=\{phase === 'spin' \|\| !ready\}/);
    expect(ro).not.toMatch(/disabled=\{phase !== 'idle'/);
  });

  it("osselets : le quitte ou double n'est effacé qu'après un jet donné", () => {
    const au = src("AuguryStage.jsx");
    expect(au).not.toMatch(/setDoubleOutcome\(null\);\s*(setDoubleCran\(0\);\s*)?onCast\(/);
    // onCast l'efface lui-même, APRÈS un castAugury réussi.
    const cast = body(au, "const onCast = (amount = stake) => {");
    const ok = cast.indexOf("if (!res) return;");
    expect(ok).toBeGreaterThan(0);
    expect(cast.indexOf("setDoubleOutcome(null)")).toBeGreaterThan(ok);
  });
});

describe("Échap à une table : la table se ferme, les Options restent closes (BUG-49)", () => {
  it("écoute en capture, seulement table ouverte, et arrête l'événement", () => {
    const rs = src("RegulationStage.jsx");
    expect(rs).toMatch(/if \(!game\) return undefined;/);
    expect(rs).toMatch(/window\.addEventListener\('keydown', onKey, true\)/);
    expect(rs).toMatch(/window\.removeEventListener\('keydown', onKey, true\)/);
    expect(rs).toMatch(/e\.stopImmediatePropagation\(\);\s*closeTempleStage\(\);/);
    expect(rs).toMatch(/\}, \[game\]\);/);
  });
});
