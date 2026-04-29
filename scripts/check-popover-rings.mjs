import fs from 'node:fs';
import vm from 'node:vm';

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(name) {
    this.values.add(name);
  }
  remove(name) {
    this.values.delete(name);
  }
  contains(name) {
    return this.values.has(name);
  }
  toggle(name, force) {
    const on = force ?? !this.values.has(name);
    if (on) this.values.add(name);
    else this.values.delete(name);
    return on;
  }
}

class Element {
  constructor(id = '') {
    this.id = id;
    this.style = new Map();
    this.classList = new ClassList();
    this.dataset = {};
    this.children = [];
    this.attributes = new Map(id === 'ring-h' || id === 'ring-d' ? [['r', '20']] : []);
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.onclick = null;
    this.oninput = null;
    this.value = '';
    this.style.setProperty = (key, value) => this.style.set(key, value);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  querySelector() {
    return new Element();
  }
  querySelectorAll() {
    return [];
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

const ids = [
  'key-section',
  'exp-val',
  'exp-sub',
  'key-display',
  'btn-copy',
  'btn-refresh',
  'ring-h',
  'ring-d',
  'ring-h-n',
  'ring-d-n',
  'list',
  'list-loader',
  'recents',
  'empty',
  'count',
  'search-input',
  'status',
  'status-dot',
];
const elements = Object.fromEntries(ids.map((id) => [id, new Element(id)]));
const now = new Date();
const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
let clipboardText = '';

const context = {
  console,
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  Date,
  localStorage: {
    getItem: (key) => (key === 'v_p' || key === 'v_r' ? '{bad json' : null),
    setItem: () => {},
  },
  document: {
    getElementById: (id) => elements[id] ?? new Element(id),
    createElement: () => new Element(),
  },
  window: {
    __TAURI__: {
      core: {
        invoke: async (cmd, args) => {
          if (cmd === 'load_ui_state_cmd') return { settings: { executor: 'hydrogen' } };
          if (cmd === 'get_key_cache') {
            return {
              valid: true,
              key: 'abc',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              hourly_counts: { [hourKey]: 2 },
              daily_counts: { [dayKey]: 4 },
            };
          }
          if (cmd === 'get_scripts') return [];
          if (cmd === 'write_clipboard') {
            clipboardText = args.text;
            return null;
          }
          return null;
        },
      },
      event: { listen: () => {} },
      window: { getCurrentWindow: () => ({ listen: () => {}, hide: () => {} }) },
    },
  },
};
context.window.document = context.document;
context.window.localStorage = context.localStorage;

vm.createContext(context);
vm.runInContext(fs.readFileSync('resources/popover/popover.js', 'utf8'), context);
await new Promise((resolve) => setTimeout(resolve, 0));

const hOffset = Number(elements['ring-h'].attributes.get('stroke-dashoffset'));
const dOffset = Number(elements['ring-d'].attributes.get('stroke-dashoffset'));
if (!(hOffset > 0 && hOffset < 2 * Math.PI * 20)) throw new Error('Hourly ring did not move');
if (!(dOffset > 0 && dOffset < 2 * Math.PI * 20)) throw new Error('Daily ring did not move');
if (elements['ring-h-n'].textContent !== '2') throw new Error('Hourly count label did not update');
if (elements['ring-d-n'].textContent !== '4') throw new Error('Daily count label did not update');
await elements['btn-copy'].onclick();
if (clipboardText !== 'abc') throw new Error('Clipboard command was not used');
console.log('Popover rings OK: startup, SVG offsets, labels, and copy command are healthy.');
