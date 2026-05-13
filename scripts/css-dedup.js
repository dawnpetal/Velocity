#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node css-dedup.js <input.css>');
  process.exit(1);
}
if (!fs.existsSync(inputFile)) {
  console.error('Not found: ' + inputFile);
  process.exit(1);
}

const src = fs.readFileSync(inputFile, 'utf8');

function tokenise(css) {
  const tokens = [];
  let i = 0;

  const skipWS = () => {
    while (i < css.length && /\s/.test(css[i])) i++;
  };
  const readComment = () => {
    const s = i;
    i += 2;
    const e = css.indexOf('*/', i);
    i = e === -1 ? css.length : e + 2;
    return css.slice(s, i);
  };
  const readSelector = () => {
    let sel = '';
    while (i < css.length && css[i] !== '{' && css[i] !== '}') {
      if (css.startsWith('/*', i)) readComment();
      else sel += css[i++];
    }
    return sel.trim();
  };
  const readBlock = () => {
    let depth = 0,
      s = i;
    while (i < css.length) {
      if (css.startsWith('/*', i)) {
        readComment();
        continue;
      }
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }
    return css.slice(s, i);
  };

  while (i < css.length) {
    skipWS();
    if (i >= css.length) break;
    if (css.startsWith('/*', i)) {
      tokens.push({ kind: 'comment', raw: readComment() });
      continue;
    }
    const selector = readSelector();
    if (!selector) {
      i++;
      continue;
    }
    if (i >= css.length || css[i] !== '{') continue;
    const blockRaw = readBlock();
    const body = blockRaw.slice(1, -1);
    const isAtBlock = /^@(media|keyframes|-webkit-keyframes|supports|layer|container)\b/.test(
      selector,
    );
    tokens.push({ kind: isAtBlock ? 'atrule_block' : 'rule', selector, body });
  }
  return tokens;
}

function parseDecls(body) {
  const ordered = [],
    index = new Map();
  let current = '',
    parenDepth = 0;
  const flush = () => {
    const part = current.trim();
    current = '';
    if (!part) return;
    const colon = part.indexOf(':');
    if (colon === -1) return;
    const prop = part.slice(0, colon).trim(),
      value = part.slice(colon + 1).trim();
    if (!prop) return;
    if (index.has(prop)) {
      ordered[index.get(prop)].value = value;
    } else {
      index.set(prop, ordered.length);
      ordered.push({ prop, value });
    }
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') {
      parenDepth++;
      current += c;
    } else if (c === ')') {
      parenDepth--;
      current += c;
    } else if (c === ';' && !parenDepth) flush();
    else current += c;
  }
  flush();
  return ordered;
}

function normalise(sel) {
  return sel.replace(/\s+/g, ' ').trim();
}

function dedupe(tokens) {
  const output = [],
    indexMap = new Map();
  for (const tok of tokens) {
    if (tok.kind !== 'rule') {
      output.push({ ...tok });
      continue;
    }
    const norm = normalise(tok.selector);
    const incoming = parseDecls(tok.body);
    if (indexMap.has(norm)) {
      const existing = output[indexMap.get(norm)];
      const existingIdx = new Map(existing.decls.map((d, i) => [d.prop, i]));
      for (const { prop, value } of incoming) {
        if (existingIdx.has(prop)) existing.decls[existingIdx.get(prop)].value = value;
        else {
          existingIdx.set(prop, existing.decls.length);
          existing.decls.push({ prop, value });
        }
      }
    } else {
      indexMap.set(norm, output.length);
      output.push({ kind: 'rule', selector: tok.selector, decls: incoming });
    }
  }
  return output;
}

function serialise(output) {
  return output
    .map((tok) => {
      if (tok.kind === 'comment') return tok.raw;
      if (tok.kind === 'atrule_block') return `${tok.selector} {${tok.body}}`;
      if (tok.kind === 'rule' && tok.decls.length)
        return `${tok.selector} {\n${tok.decls.map(({ prop, value }) => `  ${prop}: ${value};`).join('\n')}\n}`;
      return null;
    })
    .filter(Boolean)
    .join('\n\n');
}

const tokens = tokenise(src);
const merged = dedupe(tokens);
const result = serialise(merged);
fs.writeFileSync(inputFile, result, 'utf8');

const rb = tokens.filter((t) => t.kind === 'rule').length;
const ra = merged.filter((t) => t.kind === 'rule').length;
console.log(`Rules  : ${rb} → ${ra}  (removed ${rb - ra} duplicates)`);
console.log(
  `Size   : ${(src.length / 1024).toFixed(1)}KB → ${(result.length / 1024).toFixed(1)}KB`,
);
console.log(`Done   : ${path.resolve(inputFile)}`);
