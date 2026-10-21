import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync as read } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = resolve(ROOT, outIdx !== -1 ? args[outIdx + 1] : "dist");
const STRICT = args.includes("--strict");
const CLEAN_ONLY = args.includes("--clean");

const SKIP_DIRS = new Set([".git", ".netlify", "node_modules", "dist", "scripts", ".github"]);
const ASSET_DIRS = ["images", "css", "js", "fonts", "assets"];
const ROOT_FILE_EXTENSIONS = new Set([".xml", ".txt", ".json", ".webmanifest", ".ico", ".woff2"]);

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

const sourceFiles = walk(ROOT);
const htmlFiles = sourceFiles.filter((f) => f.toLowerCase().endsWith(".html"));
const cssFiles = sourceFiles.filter((f) => f.toLowerCase().endsWith(".css"));

/* ---------- reference scanning ---------- */

const HTML_ASSET_ATTR = /(?:src|poster|data-src|data-wf-src|data-bg)\s*=\s*["']([^"']+)["']/gi;
const HTML_HREF = /href\s*=\s*["']([^"']+)["']/gi;
const HTML_SRCSET = /srcset\s*=\s*["']([^"']+)["']/gi;
const META_IMAGE = /<meta[^>]+content=["']([^"']+)["'][^>]*>/gi;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

const referenced = new Set();
const missing = new Set();

function scanRef(raw, sourceFile) {
  const clean = raw.split("#")[0].split("?")[0].trim();
  if (!clean) return;
  if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(clean)) return;
  if (!/^[^\s"'<>]+$/.test(clean)) return;
  const abs = resolve(dirname(sourceFile), clean.replace(/\//g, sep));
  if (!abs.startsWith(ROOT)) return;
  if (existsSync(abs) && statSync(abs).isFile()) {
    referenced.add(rel(abs));
  } else if (/\.[a-z0-9]{2,5}$/i.test(clean)) {
    missing.add(`${clean}  (from ${rel(sourceFile)})`);
  }
}

for (const file of htmlFiles) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(HTML_ASSET_ATTR)) scanRef(m[1], file);
  for (const m of content.matchAll(HTML_HREF)) scanRef(m[1], file);
  for (const m of content.matchAll(HTML_SRCSET)) {
    for (const part of m[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) scanRef(url, file);
    }
  }
  for (const m of content.matchAll(META_IMAGE)) {
    if (/og:image|twitter:image/i.test(m[0])) scanRef(m[1], file);
  }
}
for (const file of cssFiles) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(CSS_URL)) scanRef(m[1], file);
}

/* ---------- build ---------- */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

if (CLEAN_ONLY) {
  console.log(`removed ${rel(OUT)}/`);
  process.exit(0);
}

const copied = [];
const skipped = [];

function copyTo(srcAbs, destRel) {
  const dest = join(OUT, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(srcAbs, dest);
  copied.push(destRel);
}

// 1. every HTML page keeps its path (root pages + all-work/*)
for (const file of htmlFiles) {
  copyTo(file, rel(file));
}

// 2. css / js are shipped whole (they are small and may pull in siblings at runtime)
for (const dir of ["css", "js"]) {
  for (const file of sourceFiles.filter((f) => rel(f).startsWith(dir + "/"))) {
    copyTo(file, rel(file));
  }
}

// 3. images / other assets: only what is actually referenced
for (const file of sourceFiles) {
  const r = rel(file);
  if (!r.startsWith("images/") && !r.startsWith("assets/") && !r.startsWith("fonts/")) continue;
  if (referenced.has(r)) {
    copyTo(file, r);
  } else {
    skipped.push(r);
  }
}

// 4. misc root files (sitemap, robots.txt, manifest, ...)
for (const file of sourceFiles) {
  const r = rel(file);
  if (r.includes("/")) continue;
  const ext = r.slice(r.lastIndexOf(".")).toLowerCase();
  if (ROOT_FILE_EXTENSIONS.has(ext)) copyTo(file, r);
}

/* ---------- verification ---------- */

const distFiles = walk(OUT);
const distRel = new Set(distFiles.map(rel));
const brokenInDist = [];
const suspectGlyphs = [];

for (const file of distFiles.filter((f) => f.toLowerCase().endsWith(".html"))) {
  const content = readFileSync(file, "utf8");
  const dir = dirname(file);

  // a lone "?" as element text means a glyph was mangled (e.g. "→" -> "?")
  for (const m of content.matchAll(/>\s*\?\s*</g)) {
    suspectGlyphs.push(`${rel(file)}  (element text is a single "?")`);
  }

  const refs = [];
  for (const m of content.matchAll(HTML_ASSET_ATTR)) refs.push(m[1]);
  for (const m of content.matchAll(HTML_HREF)) refs.push(m[1]);
  for (const m of content.matchAll(HTML_SRCSET)) {
    for (const part of m[1].split(",")) refs.push(part.trim().split(/\s+/)[0]);
  }
  for (const raw of refs) {
    const url = raw.split("#")[0].split("?")[0].trim();
    if (!url || /^(https?:|data:|mailto:|tel:|javascript:|\/\/|#)/i.test(url)) continue;
    const abs = resolve(dir, url.replace(/\//g, sep));
    if (abs.startsWith(OUT) && !existsSync(abs)) {
      brokenInDist.push(`${rel(file)} -> ${url}`);
    }
  }
}

/* ---------- report ---------- */

const size = (p) => {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
};
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";
const totalBytes = distFiles.reduce((s, f) => s + size(f), 0);

console.log(`\nbuild output: ${rel(OUT)}/`);
console.log(`  files copied : ${copied.length}`);
console.log(`  total size   : ${mb(totalBytes)}`);

if (skipped.length) {
  console.log(`\nskipped ${skipped.length} unreferenced asset(s):`);
  for (const s of skipped.sort()) console.log(`  ${s}  (${mb(size(join(ROOT, s)))})`);
}

if (missing.size) {
  console.log(`\n${missing.size} reference(s) point at files that do not exist:`);
  for (const m of [...missing].sort()) console.log(`  ${m}`);
}

if (brokenInDist.length) {
  console.log(`\n${brokenInDist.length} broken reference(s) inside the build output:`);
  for (const b of [...new Set(brokenInDist)].sort()) console.log(`  ${b}`);
}

if (suspectGlyphs.length) {
  console.log(`\n${suspectGlyphs.length} suspicious "?" glyph(s) in the build output:`);
  for (const g of [...new Set(suspectGlyphs)].sort()) console.log(`  ${g}`);
}

if (missing.size || brokenInDist.length || suspectGlyphs.length) {
  if (STRICT) {
    console.error("\nbuild failed (--strict)");
    process.exit(1);
  }
  console.log("\nbuild finished with warnings");
} else {
  console.log("\nbuild ok: every local reference resolves");
}
