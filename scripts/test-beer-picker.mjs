import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const temporary = mkdtempSync(path.join(tmpdir(), "aviator-beer-picker-"));
try {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "src/lib/beer-picker.ts", "--outDir", temporary, "--module", "commonjs", "--target", "es2020", "--esModuleInterop", "--skipLibCheck"], { stdio: "inherit" });
  const require = createRequire(import.meta.url);
  const { getBeerMatches, findBeerProfile, defaultPreferences } = require(path.join(temporary, "lib/beer-picker.js"));
  const { beerProfiles, beerMenuSources } = require(path.join(temporary, "data/beer-picker.js"));
  const item = (beerName, fields = {}) => ({ beerName, category: "Beer", packaging: "Keg", sixthBblKegs: 3, fiftyLKegs: 0, totalBbl: .5, sixthBblPriceCents: 10000, ...fields });
  const filter = (items, preferences = {}) => getBeerMatches(items, { ...defaultPreferences, ...preferences });

  assert.equal(findBeerProfile("JetStream").abv, 6.4);
  assert.equal(findBeerProfile("Devils Tripel").abv, 9.2);
  assert.equal(findBeerProfile("Airlift Pils").name, "Airlift Pilsner");
  assert.equal(findBeerProfile("Blueberry Warhead Sour").abv, 5.1);
  assert.equal(findBeerProfile("MadBeach Special Edition"), undefined, "Do not infer notes for unknown variants");
  assert.equal(findBeerProfile("THC Soda Orange Dream"), undefined);
  assert.equal(findBeerProfile("Aviator Apple Seltzer"), undefined, "Do not confuse seltzer and Apple Lite");

  const aliases = new Set();
  for (const profile of beerProfiles) {
    for (const name of [profile.name, ...profile.aliases]) {
      const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      assert(!aliases.has(key), `Duplicate beer alias: ${name}`);
      aliases.add(key);
    }
    const source = beerMenuSources[profile.source];
    assert(existsSync(path.join("public/media/menus", source.url.replace("/api/menu-files/", ""))), `Missing menu: ${source.url}`);
  }
  assert.equal(filter([item("Lite", {sixthBblKegs: 0})]).length, 0, "Sold-out beers must not be recommended");
  assert.equal(filter([item("Lite", {sixthBblPriceCents: 0})]).length, 0, "Unpriced packages must not be offered");
  assert.equal(filter([item("Lite", {forSale: false})]).length, 0);
  assert.equal(filter([item("Unknown Beer"), item("THC Soda Orange Dream")]).length, 0);

  const beers = [item("Lite"), item("Airlift Pils"), item("JetStream"), item("Jet Juice"), item("BlackMamba"), item("Devils Tripel"), item("Bee-17 Honey Ale"), item("Blueberry Warhead Sour")];
  assert.deepEqual(filter(beers, {strength: "lower"}).map(x => x.item.beerName).sort(), ["Airlift Pils", "Blueberry Warhead Sour", "Lite"]);
  assert.deepEqual(filter(beers, {strength: "middle"}).map(x => x.item.beerName).sort(), ["Bee-17 Honey Ale", "BlackMamba", "JetStream"]);
  assert.deepEqual(filter(beers, {strength: "higher"}).map(x => x.item.beerName).sort(), ["Devils Tripel", "Jet Juice"]);
  assert.deepEqual(filter(beers, {flavor: "tart"}).map(x => x.item.beerName), ["Blueberry Warhead Sour"]);
  assert.equal(filter(beers, {flavor: "tart", strength: "higher"}).length, 0, "Do not relax filters silently");

  const mixed = item("Lite", {has12ozSixPack: true, case12SixPackCount: 4, case12SixPackPriceCents: 1200});
  assert.deepEqual(filter([mixed], {format: "packs"})[0].packages.map(x => x.value), ["12 oz 6-packs"]);
  assert.deepEqual(filter([mixed], {format: "kegs"})[0].packages.map(x => x.value), ["1/6 bbl"]);
  assert.equal(filter([item("Lite")], {format: "packs"}).length, 0);
  assert.equal(filter([item("Lite", {sixthBblKegs: 0, has12ozSixPack: false, case12SixPackCount: 4, case12SixPackPriceCents: 1200})]).length, 0, "A disabled package is not available");
  assert.equal(filter([item("Lite", {sixthBblKegs: 0, case12Count: 2, caseSize: "12 oz", casePriceCents: 4800})], {format: "packs"}).length, 1, "Keep legacy case price support");
  console.log("Beer picker: menu sources, aliases, ABVs, flavor combinations, and package availability passed.");
} finally { rmSync(temporary, { recursive: true, force: true }); }
