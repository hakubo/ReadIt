// Copies package.json's version into public/manifest.json, so the Store
// version always matches the package (run by `npm run bump`).
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const manifestPath = "public/manifest.json";
const manifest = readFileSync(manifestPath, "utf8");
writeFileSync(manifestPath, manifest.replace(/"version": "[^"]+"/, `"version": "${version}"`));
console.log(`manifest.json version: ${version}`);
