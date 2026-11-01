import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brain = path.join(root, "apps", "brain");
const web = path.join(root, "web");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

for (const name of ["index.html", "app.js", "styles.css"]) {
  if (!fs.existsSync(path.join(web, name))) fail(`missing web/${name}`);
}

const appJs = fs.readFileSync(path.join(web, "app.js"), "utf8");
for (const needle of ["HOSTED_BRAINS", "streamChat", "/chat", "/health"]) {
  if (!appJs.includes(needle)) fail(`web/app.js missing ${needle}`);
}

const go = spawnSync("go", ["vet", "./..."], { cwd: brain, encoding: "utf8", shell: true });
if (go.status !== 0) {
  process.stderr.write(go.stdout || "");
  process.stderr.write(go.stderr || "");
  process.exit(go.status || 1);
}

console.log("typecheck ok");
