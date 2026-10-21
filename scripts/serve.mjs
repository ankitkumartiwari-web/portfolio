import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(process.argv[2] || "dist");
const PORT = Number(process.env.PORT || 8888);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

if (!existsSync(ROOT)) {
  console.error(`nothing to serve: ${ROOT} does not exist. run "npm run build" first.`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = join(ROOT, url);

  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) {
    const found = [file + ".html", join(file, "index.html")].find(
      (c) => existsSync(c) && statSync(c).isFile()
    );
    if (found) file = found;
    else {
      const notFound = join(ROOT, "404.html");
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(existsSync(notFound) ? readFileSync(notFound) : "Not found");
      return;
    }
  }

  res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT}`);
  console.log(`http://localhost:${PORT}`);
});
