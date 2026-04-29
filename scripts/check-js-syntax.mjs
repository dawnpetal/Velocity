import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const resourcesDir = join(root, "resources");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (path.endsWith(".js")) out.push(path);
  }
  return out;
}

for (const file of walk(resourcesDir)) {
  try {
    new vm.Script(readFileSync(file, "utf8"), { filename: file });
  } catch (err) {
    console.error(`JS syntax error in ${relative(root, file)}`);
    console.error(err.message);
    process.exit(1);
  }
}

console.log(`JS syntax OK: ${walk(resourcesDir).length} files.`);
