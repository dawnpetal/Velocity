const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.vite',
  'coverage',
]);
const parserByExt = new Map([
  ['.js', 'babel'],
  ['.css', 'css'],
]);

function ensurePackage(name) {
  try {
    return requireFromRoot.resolve(name);
  } catch {
    execFileSync('npm', ['install', '--no-save', `${name}@latest`], {
      cwd: root,
      stdio: 'inherit',
    });
    return requireFromRoot.resolve(name);
  }
}

async function loadPrettier() {
  const entry = ensurePackage('prettier');
  const mod = await import(pathToFileURL(entry).href);
  return mod.format ? mod : mod.default;
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.nojekyll') {
      if (entry.isDirectory()) continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) collectFiles(fullPath, out);
      continue;
    }

    if (parserByExt.has(path.extname(entry.name))) out.push(fullPath);
  }

  return out;
}

function stripJsComments(source) {
  let output = '';
  let i = 0;
  let state = 'normal';
  let regexAllowed = true;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (state === 'normal') {
      if (char === '"' || char === "'" || char === '`') {
        state = char;
        output += char;
        i++;
        regexAllowed = false;
        continue;
      }

      if (char === '/' && next === '/') {
        i += 2;
        while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
        regexAllowed = true;
        continue;
      }

      if (char === '/' && next === '*') {
        i += 2;
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
        i = Math.min(source.length, i + 2);
        output += ' ';
        regexAllowed = false;
        continue;
      }

      if (char === '/' && regexAllowed) {
        state = 'regex';
        output += char;
        i++;
        continue;
      }

      output += char;
      regexAllowed =
        /[\(\{\[=,:;!&|?+\-*~^<>%]\s*$/.test(output) ||
        output.trimEnd().endsWith('return') ||
        output.trimEnd().endsWith('throw');
      i++;
      continue;
    }

    if (state === '"' || state === "'") {
      output += char;
      if (char === '\\') {
        output += source[i + 1] || '';
        i += 2;
        continue;
      }
      if (char === state) state = 'normal';
      i++;
      continue;
    }

    if (state === '`') {
      output += char;
      if (char === '\\') {
        output += source[i + 1] || '';
        i += 2;
        continue;
      }
      if (char === '`') state = 'normal';
      i++;
      continue;
    }

    if (state === 'regex') {
      output += char;
      if (char === '\\') {
        output += source[i + 1] || '';
        i += 2;
        continue;
      }
      if (char === '[') {
        state = 'regex-class';
        i++;
        continue;
      }
      if (char === '/') state = 'normal';
      i++;
      continue;
    }

    if (state === 'regex-class') {
      output += char;
      if (char === '\\') {
        output += source[i + 1] || '';
        i += 2;
        continue;
      }
      if (char === ']') state = 'regex';
      i++;
    }
  }

  return output;
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripComments(source, ext) {
  if (ext === '.js') return stripJsComments(source);
  if (ext === '.css') return stripCssComments(source);
  return source;
}

async function beautifyFile(prettier, file) {
  const ext = path.extname(file);
  const parser = parserByExt.get(ext);
  const original = fs.readFileSync(file, 'utf8');
  const stripped = stripComments(original, ext);
  const formatted = await prettier.format(stripped, {
    parser,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
  });

  if (formatted !== original) fs.writeFileSync(file, formatted);
  return formatted !== original;
}

async function main() {
  const prettier = await loadPrettier();
  const files = collectFiles(root);
  let changed = 0;
  let failed = 0;

  for (const file of files) {
    try {
      if (await beautifyFile(prettier, file)) changed++;
      console.log(`${path.relative(root, file)}`);
    } catch (error) {
      failed++;
      console.error(`Failed: ${path.relative(root, file)}`);
      console.error(error.message);
    }
  }

  if (failed > 0) {
    console.log(`Processed ${files.length} files, changed ${changed}, failed ${failed}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Beautified ${files.length} files, changed ${changed}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
