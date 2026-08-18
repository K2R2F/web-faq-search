import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"]
]);

function resolveRequestPath(url) {
  const requested = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const clean = requested === "/" ? "/index.html" : requested;
  const filePath = path.resolve(root, `.${clean}`);
  if (!filePath.startsWith(root)) return path.join(root, "404.html");
  return filePath;
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = resolveRequestPath(req.url ?? "/");
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream" });
    res.end(body);
  } catch {
    const body = await readFile(path.join(root, "404.html"));
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  }
});

server.listen(port, () => {
  console.log(`Serving http://localhost:${port}/`);
});
