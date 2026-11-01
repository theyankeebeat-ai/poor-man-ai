import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const out = path.join(web, "out");

const required = ["index.html", "app.js", "styles.css"];
for (const name of required) {
  const file = path.join(web, name);
  if (!fs.existsSync(file)) {
    console.error(`missing ${name}`);
    process.exit(1);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of required) {
  fs.copyFileSync(path.join(web, name), path.join(out, name));
}
console.log(`wrote ${out}`);
