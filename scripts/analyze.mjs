import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".netlify", "node_modules", "dist", "scripts", ".github"]);

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else out.push(join(dir, entry.name));
  }
  return out;
}

const files = walk(ROOT);
const htmlFiles = files.filter((f) => f.toLowerCase().endsWith(".html"));
const cssFiles = files.filter((f) => f.toLowerCase().endsWith(".css"));

const HTML_ASSET_ATTR = /(?:src|poster|data-src|data-wf-src|data-bg)\s*=\s*["']([^"']+)["']/gi;
const HTML_HREF = /href\s*=\s*["']([^"']+)["']/gi;
const HTML_SRCSET = /srcset\s*=\s*["']([^"']+)["']/gi;
const META_IMAGE = /<meta[^>]+content=["']([^"']+)["'][^>]*>/gi;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

const used = new Map();
const missing = new Map();
const routes = new Map();
const brokenRoutes = new Map();

const add = (map, key, src) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(src);
};

function scanAsset(raw, sourceFile) {
  const clean = raw.split("#")[0].split("?")[0].trim();
  if (!clean) return;
  if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(clean)) return;
  if (!/^[^\s"'<>]+$/.test(clean)) return;
  const abs = resolve(dirname(sourceFile), clean.replace(/\//g, sep));
  if (!abs.startsWith(ROOT)) return;
  if (existsSync(abs) && statSync(abs).isFile()) {
    add(used, rel(abs), rel(sourceFile));
  } else if (/\.[a-z0-9]{2,5}$/i.test(clean)) {
    add(missing, clean, rel(sourceFile));
  }
}

function scanRoute(raw, sourceFile) {
  const clean = raw.split("#")[0].split("?")[0].trim();
  if (!clean.startsWith("/") || clean.startsWith("//")) return;
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return;
  const base = clean.replace(/^\//, "").replace(/\/$/, "");
  const target = base === "" ? "index.html" : base + ".html";
  if (existsSync(join(ROOT, target)) || existsSync(join(ROOT, base, "index.html"))) {
    add(routes, clean, rel(sourceFile));
  } else {
    add(brokenRoutes, clean, rel(sourceFile));
  }
}

for (const file of htmlFiles) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(HTML_ASSET_ATTR)) scanAsset(m[1], file);
  for (const m of content.matchAll(HTML_SRCSET)) {
    for (const part of m[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) scanAsset(url, file);
    }
  }
  for (const m of content.matchAll(META_IMAGE)) {
    if (/og:image|twitter:image/i.test(m[0])) scanAsset(m[1], file);
  }
  for (const m of content.matchAll(HTML_HREF)) {
    scanRoute(m[1], file);
    scanAsset(m[1], file);
  }
}

for (const file of cssFiles) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(CSS_URL)) scanAsset(m[1], file);
}

const assetFiles = files
  .filter((f) => /^(images|fonts|assets)\//.test(rel(f)))
  .map(rel);
const unused = assetFiles.filter((a) => !used.has(a));

const sizeOf = (p) => {
  try {
    return statSync(join(ROOT, p)).size;
  } catch {
    return 0;
  }
};
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";

console.log("== MISSING ASSETS (referenced, file not on disk) ==");
if (missing.size === 0) console.log("  none");
for (const [r, s] of missing) console.log(`  ${r}  <- ${[...s].join(", ")}`);

console.log("\n== BROKEN INTERNAL ROUTES ==");
if (brokenRoutes.size === 0) console.log("  none");
for (const [r, s] of brokenRoutes) console.log(`  ${r}  <- ${[...s].join(", ")}`);

console.log("\n== UNUSED ASSETS ==");
if (unused.length === 0) console.log("  none");
for (const u of unused.sort()) console.log(`  ${u}  (${mb(sizeOf(u))})`);

console.log("\n== TOTALS ==");
console.log(`  html pages      : ${htmlFiles.length}`);
console.log(`  assets used     : ${used.size} (${mb([...used.keys()].reduce((s, u) => s + sizeOf(u), 0))})`);
console.log(`  assets unused   : ${unused.length} (${mb(unused.reduce((s, u) => s + sizeOf(u), 0))})`);
