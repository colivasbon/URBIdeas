/**
 * Generador de escalas OKLCH y verificador de contraste WCAG 2.2.
 * Herramienta de diseño: NO se importa desde la app.
 * Uso: node design-audit/verify-contrast.mjs
 */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((c) => {
        const v = Math.round(Math.min(1, Math.max(0, c)) * 255);
        return v.toString(16).padStart(2, "0");
      })
      .join("")
      .toUpperCase()
  );
}
function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return rgbToHex([r, g, bl].map(linearToSrgb));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const BASE = {
  musgo: "#3E665C",
  conifera: "#86B73D",
  carbon: "#3C403E",
  rupestre: "#643335",
  limo: "#B0BDB0",
  crisopa: "#C2E189",
  retama: "#FBE122",
  hueso: "#F1F1F1",
};

/**
 * Escala 50..900 anclada al color base en 500.
 * Interpolación en OKLab: hacia blanco en claros y hacia un "negro" tintado
 * (L=0.10) en oscuros, con croma ligeramente reducida en los extremos.
 */
const T_LIGHT = { 50: 0.94, 100: 0.86, 200: 0.7, 300: 0.5, 400: 0.27 };
const T_DARK = { 600: 0.16, 700: 0.3, 800: 0.48, 900: 0.66 };
const C_MULT = { 50: 0.4, 100: 0.55, 200: 0.7, 300: 0.85, 400: 0.97, 500: 1, 600: 0.97, 700: 0.94, 800: 0.9, 900: 0.84 };

function scale(hex) {
  const [L0, a0, b0] = hexToOklab(hex);
  const C = Math.hypot(a0, b0);
  const h = Math.atan2(b0, a0);
  const out = {};
  for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
    let L;
    if (step === 500) L = L0;
    else if (step < 500) L = L0 + (1 - L0) * T_LIGHT[step];
    else L = L0 + (0.1 - L0) * T_DARK[step];
    const c = C * C_MULT[step];
    out[step] = oklabToHex([L, Math.cos(h) * c, Math.sin(h) * c]);
  }
  return out;
}

const T_LIGHT_600 = { 50: 0.93, 100: 0.84, 200: 0.68, 300: 0.5, 400: 0.32, 500: 0.18 };
const T_DARK_600 = { 700: 0.2, 800: 0.42, 900: 0.62 };

function scaleAnchored(hex, anchor) {
  const [L0, a0, b0] = hexToOklab(hex);
  const C = Math.hypot(a0, b0);
  const h = Math.atan2(b0, a0);
  const out = {};
  for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
    let L;
    if (step === anchor) L = L0;
    else if (step < anchor) L = L0 + (1 - L0) * T_LIGHT_600[step];
    else L = L0 + (0.08 - L0) * T_DARK_600[step];
    const c = C * C_MULT[step];
    out[step] = oklabToHex([L, Math.cos(h) * c, Math.sin(h) * c]);
  }
  return out;
}

const scales = {};
for (const [name, hex] of Object.entries(BASE)) {
  if (["retama", "hueso"].includes(name)) continue;
  scales[name] = name === "carbon" ? scaleAnchored(hex, 600) : scale(hex);
}
scales.carbon[900] = "#1E2220"; // valor de referencia del brief IMA

const WHITE = "#FFFFFF";
const HUESO = BASE.hueso;

const checks = [];
const add = (label, fg, bg, min = 4.5, note = "") =>
  checks.push({ label, fg, bg, ratio: contrast(fg, bg), min, pass: contrast(fg, bg) >= min, note });

// Texto principal
for (const bg of [WHITE, HUESO]) {
  add(`carbon sobre ${bg === WHITE ? "blanco" : "hueso"}`, "#3C403E", bg);
  add(`carbon-900 sobre ${bg === WHITE ? "blanco" : "hueso"}`, scales.carbon[900], bg);
  add(`musgo sobre ${bg === WHITE ? "blanco" : "hueso"}`, BASE.musgo, bg);
  add(`musgo-700 sobre ${bg === WHITE ? "blanco" : "hueso"}`, scales.musgo[700], bg);
  add(`musgo-600 sobre ${bg === WHITE ? "blanco" : "hueso"}`, scales.musgo[600], bg);
  add(`text-secondary (carbon 72%) sobre ${bg === WHITE ? "blanco" : "hueso"}`, "#5B605D", bg);
  add(`text-muted sobre ${bg === WHITE ? "blanco" : "hueso"}`, "#6E736F", bg, 3);
}
// Inversos
add("hueso sobre musgo", HUESO, BASE.musgo);
add("hueso sobre musgo-700", HUESO, scales.musgo[700]);
add("hueso sobre carbon", HUESO, BASE.carbon);
add("hueso sobre carbon-900", HUESO, scales.carbon[900]);
add("hueso sobre rupestre", HUESO, BASE.rupestre);
add("retama sobre musgo", BASE.retama, BASE.musgo);
add("retama sobre carbon", BASE.retama, BASE.carbon);
add("retama sobre carbon-900", BASE.retama, scales.carbon[900]);
add("hueso sobre rupestre-600", HUESO, scales.rupestre[600]);
// CTA conifera — decisión final: fondo conifera en todos los estados, texto carbon-900.
add("carbon-900 sobre conifera (CTA)", scales.carbon[900], BASE.conifera, 4.5, "CTA default");
add("carbon-900 sobre conifera-600 (CTA hover)", scales.carbon[900], scales.conifera[600], 4.5, "CTA hover");
add("carbon-900 sobre conifera-400 (CTA alt)", scales.carbon[900], scales.conifera[400], 4.5, "paso más claro si hiciera falta");
add("carbon-900 sobre crisopa", scales.carbon[900], BASE.crisopa);
add("carbon sobre crisopa", BASE.carbon, BASE.crisopa);
// Estados
add("musgo-700 sobre musgo-50 (badge info)", scales.musgo[700], scales.musgo[50], 4.5);
add("carbon sobre limo-200 (beta)", BASE.carbon, scales.limo[200], 4.5);
add("rupestre sobre rupestre-50 (error)", BASE.rupestre, scales.rupestre[50], 4.5);
add("hueso sobre rupestre-700 (danger btn)", HUESO, scales.rupestre[700], 4.5);
// Oscuro
add("hueso sobre musgo-900 (dark inverse)", HUESO, scales.musgo[900]);
add("crisopa sobre musgo-900 (dark accent)", BASE.crisopa, scales.musgo[900]);
add("retama sobre musgo-900 (dark accent)", BASE.retama, scales.musgo[900]);
add("carbon-900 sobre conifera-500 (dark CTA)", scales.carbon[900], scales.conifera[500], 4.5, "mismo CTA en oscuro");
add("carbon-900 sobre crisopa-300 (dark CTA alt)", scales.carbon[900], scales.crisopa[300], 4.5);
// Tokens finales de texto / borde
add("text-secondary #4F5451 sobre hueso", "#4F5451", HUESO);
add("text-muted #666B67 sobre hueso", "#666B67", HUESO);
add("text-muted #666B67 sobre blanco", "#666B67", WHITE);
add("border-input limo-600 sobre blanco (3:1 UI)", scales.limo[600], WHITE, 3);
add("border-input limo-600 sobre hueso (3:1 UI)", scales.limo[600], HUESO, 3);
add("focus conifera-600 sobre hueso (3:1 UI)", scales.conifera[600], HUESO, 3);
add("focus conifera-600 sobre blanco (3:1 UI)", scales.conifera[600], WHITE, 3);
// Prohibiciones (deben fallar, se comprueba documentalmente)
add("[prohibido] hueso sobre conifera", HUESO, BASE.conifera, 4.5, "debe fallar");
add("[prohibido] conifera sobre hueso", BASE.conifera, HUESO, 4.5, "debe fallar");
add("[prohibido] carbon sobre conifera", BASE.carbon, BASE.conifera, 4.5, "falla: solo >=18.66px 600/700");
add("[prohibido] limo sobre hueso", BASE.limo, HUESO, 4.5, "debe fallar");

const fmt = (n) => n.toFixed(2).replace(".", ",");
console.log("=== ESCALAS ===");
for (const [name, s] of Object.entries(scales)) {
  console.log(name.padEnd(9), [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => `${k}:${s[k]}`).join(" "));
}
console.log("\n=== CONTRASTES ===");
for (const c of checks) {
  console.log(
    `${c.pass ? "OK " : "XX "} ${fmt(c.ratio)}:1  ${c.label}  (${c.fg} sobre ${c.bg}, min ${c.min})${c.note ? " — " + c.note : ""}`
  );
}
const failing = checks.filter((c) => !c.pass && !c.note?.includes("debe fallar") && !c.note?.includes("falla:"));
console.log(`\nFallos inesperados: ${failing.length}`);
process.exitCode = failing.length ? 1 : 0;
