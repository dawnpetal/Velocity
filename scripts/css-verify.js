#!/usr/bin/env node

const fs = require('fs');

const src = fs.readFileSync(process.argv[2], 'utf8');
const seen = new Map();
const selectorRe = /^([^{@\/][^{]*?)\s*\{/gm;
let match;
while ((match = selectorRe.exec(src)) !== null) {
  const sel = match[1].replace(/\s+/g, ' ').trim();
  seen.set(sel, (seen.get(sel) || 0) + 1);
}
const dupes = [...seen.entries()].filter(([, n]) => n > 1);
if (!dupes.length) {
  console.log('✓ No duplicates found.');
} else {
  console.log(`✗ ${dupes.length} selectors still appear more than once:\n`);
  dupes.forEach(([sel, n]) => console.log(`  ×${n}  ${sel}`));
}
