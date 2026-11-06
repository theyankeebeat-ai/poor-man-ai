import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brain = path.join(root, "apps", "brain");
const webApp = path.join(root, "web", "app.js");

const appJs = fs.readFileSync(webApp, "utf8");
if (appJs.includes("eval(") || appJs.includes("Function(")) {
  console.error("web/app.js must not use eval or Function");
  process.exit(1);
}
if (/\bvar\s+password\b/i.test(appJs) || /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i.test(appJs)) {
  console.error("web/app.js looks like it embeds a secret");
  process.exit(1);
}

const eslintBin = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
if (fs.existsSync(eslintBin)) {
  const es = spawnSync(process.execPath, [eslintBin, webApp, "--no-ignore"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  process.stdout.write(es.stdout || "");
  process.stderr.write(es.stderr || "");
  if (es.status !== 0) process.exit(es.status || 1);
} else {
  console.log("eslint not installed yet; skipped JS lint (yarn first)");
}

const go = spawnSync("go", ["fmt", "./..."], { cwd: brain, encoding: "utf8", shell: true });
if (go.status !== 0) {
  process.stderr.write(go.stdout || "");
  process.stderr.write(go.stderr || "");
  process.exit(go.status || 1);
}

console.log("lint ok");
