// Recale la palette d'une flamme vers l'or des sprites du mausolée :
// - liseré saumon/rose (R haut, B proche de G) -> orange profond
// - or clair -> or plus saturé
// Usage: node regold-flame.cjs in.png out.png
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join("C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/node_modules/pngjs"));
const [, , inPath, outPath] = process.argv;
const png = PNG.sync.read(fs.readFileSync(inPath));
let salmon = 0, gold = 0;
for (let i = 0; i < png.data.length; i += 4) {
  if (png.data[i + 3] < 10) continue;
  const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  if (r >= 235 && g >= 110 && g <= 175 && b >= 85 && b >= g * 0.62) {
    // saumon -> orange profond
    png.data[i + 1] = Math.round(g * 0.82);
    png.data[i + 2] = Math.round(b * 0.35);
    salmon++;
  } else if (r >= 248 && g >= 178 && g <= 215 && b >= 55 && b <= 95) {
    // or clair -> or saturé
    png.data[i + 2] = Math.round(b * 0.5);
    gold++;
  }
}
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`${path.basename(inPath)}: ${salmon} px saumon->orange, ${gold} px or resaturés`);
