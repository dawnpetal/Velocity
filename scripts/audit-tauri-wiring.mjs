import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const resourcesDir = join(root, "resources");
const mainPath = join(root, "src-tauri", "src", "main.rs");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (path.endsWith(".js")) out.push(path);
  }
  return out;
}

function extractInvokes() {
  const calls = new Map();
  const patterns = [
    /(?:window\.__TAURI__\.core\.)?invoke\(\s*["']([^"']+)["']/g,
    /__TAURI__\.core\.invoke\(\s*["']([^"']+)["']/g,
  ];
  for (const file of walk(resourcesDir)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        const name = match[1];
        if (!calls.has(name)) calls.set(name, new Set());
        calls.get(name).add(relative(root, file));
      }
    }
  }
  return calls;
}

function extractRegisteredCommands() {
  const main = readFileSync(mainPath, "utf8");
  const block = main.match(/tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1] ?? "";
  return new Set([...block.matchAll(/commands::[a-z_]+::([A-Za-z0-9_]+)/g)].map((m) => m[1]));
}

const invokes = extractInvokes();
const registered = extractRegisteredCommands();
const missing = [...invokes.keys()].filter((cmd) => !registered.has(cmd)).sort();
const unused = [...registered].filter((cmd) => !invokes.has(cmd)).sort();

if (missing.length) {
  console.error("Missing Tauri command registrations:");
  for (const cmd of missing) {
    console.error(`- ${cmd}: ${[...invokes.get(cmd)].join(", ")}`);
  }
  process.exit(1);
}

console.log(`Tauri wiring OK: ${invokes.size} JS invokes, ${registered.size} registered commands.`);
if (unused.length) {
  console.log(`Registered but unused by JS: ${unused.join(", ")}`);
}
