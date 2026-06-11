// Sonde jetable : break_infinity.pow colle-t-il exactement à Math.pow sous 2^53 ?
import Decimal from "break_infinity.js";

const cases = [
  [1.07, 20], [1.07, 25], [1.15, 5], [1.15, 25], [1.1, 1], [1.15, 500], [1.07, 500],
  [1.12, 137], [2, 10], [1.5, 3]
];
for (const [s, n] of cases) {
  const flt = Math.pow(s, n);
  const dec = new Decimal(s).pow(n).toNumber();
  console.log(`${s}^${n}  float=${flt}  decimal=${dec}  egal=${flt === dec}`);
}

// geomSum du golden-master : foragers (base 10? check) — on teste la formule brute.
// markets x1 attendu : 25937.424600999995 (= base * s^count * ...)
const geomFloat = (B, s, n, k) => s === 1 ? B * k : B * Math.pow(s, n) * (Math.pow(s, k) - 1) / (s - 1);
const geomDec = (B, s, n, k) =>
  s === 1 ? new Decimal(B).mul(k) : new Decimal(s).pow(n).mul(B).mul(new Decimal(s).pow(k).sub(1)).div(s - 1);

for (const [B, s, n, k] of [[10, 1.07, 20, 1], [10, 1.07, 20, 25], [10, 1.07, 20, 500], [10000, 1.1, 5, 1], [10000, 1.1, 5, 25], [10000, 1.1, 5, 500]]) {
  const a = geomFloat(B, s, n, k);
  const b = geomDec(B, s, n, k).toNumber();
  console.log(`geom B=${B} s=${s} n=${n} k=${k}  float=${a}  dec=${b}  egal=${a === b}`);
}

// Sérialisation
const d = new Decimal("1.5e30");
console.log("toJSON:", JSON.stringify({ x: d }), "| roundtrip:", new Decimal(JSON.parse(JSON.stringify({ x: d })).x).toString());
console.log("toString 273.93034604205934:", new Decimal(273.93034604205934).toString());
console.log("toNumber(1e500):", new Decimal("1e500").toNumber());
console.log("valueOf:", `${new Decimal(42)}`);
