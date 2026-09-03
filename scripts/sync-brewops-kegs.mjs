#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceFile = process.env.BREWOPS_KEG_EXPORT_FILE || "/home/skynet/mdd/exports/kegs-for-sale.json";
const targetFile = process.env.KEG_PUBLIC_SNAPSHOT_FILE || path.join(repoRoot, "public", "data", "kegs-for-sale.json");

function fail(message) {
  console.error("brewops-kegs.sync_failed");
  console.error(message);
  process.exit(1);
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) fail("BrewOps export must be a JSON object.");
  if (!Array.isArray(snapshot.items)) fail("BrewOps export must include a top-level items array.");
  if (typeof snapshot.exportType === "string" && snapshot.exportType !== "kegs-for-sale") {
    fail("Expected exportType kegs-for-sale, received " + snapshot.exportType + ".");
  }
  if (snapshot.items.length > 250) fail("Refusing to publish more than 250 keg sale items.");

  const names = new Set();
  for (const [index, item] of snapshot.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("Item " + (index + 1) + " must be a JSON object.");
    const beerName = String(item.beerName || item.name || "").trim();
    if (!beerName) fail("Item " + (index + 1) + " is missing beerName.");
    const key = beerName.toLowerCase();
    if (names.has(key)) fail("Duplicate beerName in BrewOps export: " + beerName + ".");
    names.add(key);
    if (item.has12ozFourPack === true && item.has12ozSixPack === true) {
      fail(beerName + " has both 12 oz 4-pack and 12 oz 6-pack enabled. Configure only one.");
    }
  }
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw error;
  }
}

const raw = await readText(sourceFile);
if (!raw) fail("BrewOps export not found: " + sourceFile);

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch {
  fail("BrewOps export is not valid JSON: " + sourceFile);
}

validateSnapshot(snapshot);

const next = JSON.stringify(snapshot, null, 2) + "\n";
const current = await readText(targetFile);

if (current === next) {
  console.log("brewops-kegs.no_change");
  console.log(JSON.stringify({ sourceFile, targetFile, items: snapshot.items.length, exportedAt: snapshot.exportedAt || null, updatedAt: snapshot.updatedAt || null }));
  process.exit(0);
}

await mkdir(path.dirname(targetFile), { recursive: true });
const temporaryFile = targetFile + ".tmp";
await writeFile(temporaryFile, next, "utf8");
await rename(temporaryFile, targetFile);

console.log("brewops-kegs.updated");
console.log(JSON.stringify({ sourceFile, targetFile, items: snapshot.items.length, exportedAt: snapshot.exportedAt || null, updatedAt: snapshot.updatedAt || null }));
