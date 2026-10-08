import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pngPath = join(root, "public", "images", "logo.png");
const b64 = readFileSync(join(root, "public", "images", "logo.b64"), "utf8").trim();
mkdirSync(dirname(pngPath), { recursive: true });
writeFileSync(pngPath, Buffer.from(b64, "base64"));
