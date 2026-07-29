import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

function copyDirectory(source, destination) {
  if (!existsSync(source)) return;
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

if (!existsSync(standalone)) {
  throw new Error("Next standalone output was not found. Run next build with output: 'standalone'.");
}

copyDirectory(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDirectory(path.join(root, "public"), path.join(standalone, "public"));

console.info("standalone.prepared");
