#!/usr/bin/env node
// Sync Cargo.toml version from package.json
// Used by CI after changeset version

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const cargoTomlPath = path.join(root, 'src-tauri/Cargo.toml');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const oldVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];

if (oldVersion === version) {
  console.log(`Cargo.toml already at ${version}`);
  process.exit(0);
}

cargoToml = cargoToml.replace(/^version = "[^"]+"$/m, `version = "${version}"`);
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log(`✓ Cargo.toml: ${oldVersion} → ${version}`);
