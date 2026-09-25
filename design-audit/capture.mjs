/**
 * Capturas + auditoría axe-core (herramienta de verificación, no runtime).
 * Requiere: playwright-core (--no-save) y axe-core en node_modules.
 * Uso: node design-audit/capture.mjs <before|after> <baseUrl>
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const phase = process.argv[2] ?? "after";
const baseUrl = (process.argv[3] ?? "http://localhost:3100").replace(/\/$/, "");

const ROUTES = [
  { path: "/", slug: "home" },
  { path: "/urbideas", slug: "urbideas" },
  { path: "/urbideas/municipios", slug: "urbideas-municipios" },
  { path: "/urbideas/mapa", slug: "urbideas-mapa" },
  { path: "/urbideas/legislacion", slug: "urbideas-legislacion" },
  { path: "/socideas", slug: "socideas" },
  { path: "/socideas/como-funciona", slug: "socideas-como-funciona" },
];

const VIEWPORTS = [
  { width: 375, height: 812, label: "375" },
  { width: 768, height: 1024, label: "768" },
  { width: 1440, height: 900, label: "1440" },
];

const outDir = resolve("design-audit", phase);
mkdirSync(outDir, { recursive: true });
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const report = [];

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "es-ES",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const url = `${baseUrl}${route.path}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      // Recorrido de scroll para disparar IntersectionObserver (reveals) antes
      // de capturar la página completa.
      await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(700);
      await page.screenshot({
        path: resolve(outDir, `${route.slug}-${vp.label}.jpg`),
        type: "jpeg",
        quality: 72,
        fullPage: vp.width === 375,
      });
      if (vp.width === 1440) {
        await page.addScriptTag({ content: axeSource });
        const results = await page.evaluate(async () => {
          // @ts-expect-error axe inyectado en la página
          const r = await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
          });
          return {
            violations: r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.length,
              help: v.help,
              target: v.nodes[0]?.target,
            })),
            passes: r.passes.length,
          };
        });
        report.push({ route: route.path, ...results });
        console.log(`axe ${route.path}: ${results.violations.length} violaciones`);
      }
      console.log(`ok ${phase} ${route.path} ${vp.label}`);
    } catch (e) {
      console.log(`fail ${phase} ${route.path} ${vp.label}: ${e.message}`);
    }
    await context.close();
  }
}

writeFileSync(resolve(outDir, "axe.json"), JSON.stringify(report, null, 2), "utf8");
await browser.close();
console.log(`\nInforme axe: design-audit/${phase}/axe.json`);
