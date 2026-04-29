const helpers = (() => {
  let _folderNames = null;
  let _fileNames = null;
  let _fileExts = null;
  let _fileCompound = null;
  let _builtinExts = null;
  let _builtinNames = null;
  let _builtinFolders = null;
  let _builtinCompound = null;
  let _loadPromise = null;
  let _styleEl = null;
  let _availableFolderSlugs = null;

  function _getOrCreateStyleEl() {
    if (!_styleEl) {
      _styleEl = document.createElement('style');
      _styleEl.id = 'velocityui-icon-theme';
      document.head.appendChild(_styleEl);
    }
    return _styleEl;
  }

  function _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function _svgToDataUrl(raw) {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`;
  }

  function _cssClass(stem) {
    return 'vico-' + stem.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async function _buildIconStylesheet(iconDir) {
    const ICON_TYPES = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };

    const rules = new Map();

    const addRule = (stem, dataUrl) => {
      const cls = _cssClass(stem);
      rules.set(cls, `background-image:url('${dataUrl}')`);
    };

    let entries = [];
    try {
      entries = await window.__TAURI__.core.invoke('read_dir', { path: iconDir });
    } catch {}

    const iconFiles = entries.filter((e) =>
      Object.keys(ICON_TYPES).some((x) => e.entry.endsWith(x)),
    );

    for (const e of iconFiles) {
      const extMatch = Object.keys(ICON_TYPES).find((x) => e.entry.endsWith(x));
      const mime = ICON_TYPES[extMatch];
      const stem = e.entry.slice(0, e.entry.length - extMatch.length);
      try {
        if (mime === 'image/svg+xml') {
          const raw = await window.__TAURI__.core.invoke('read_text_file', {
            path: `${iconDir}/${e.entry}`,
          });
          addRule(stem, _svgToDataUrl(raw));
        } else {
          const raw = await window.__TAURI__.core.invoke('read_binary_file', {
            path: `${iconDir}/${e.entry}`,
          });
          addRule(stem, `data:${mime};base64,${_arrayBufferToBase64(raw)}`);
        }
      } catch {}
    }

    for (const stem of ['folder', 'folder-open', 'file']) {
      const cls = _cssClass(stem);
      if (!rules.has(cls)) {
        try {
          const res = await fetch(`icons/default_icons/${stem}.svg`);
          if (res.ok) addRule(stem, _svgToDataUrl(await res.text()));
        } catch {}
      }
    }

    _availableFolderSlugs = new Set();
    for (const [cls] of rules.entries()) {
      const m = cls.match(/^vico-folder-(.+?)(?:-open)?$/);
      if (m) _availableFolderSlugs.add(m[1]);
    }

    console.debug('[icons] _buildIconStylesheet done (installed theme)');
    console.debug('[icons] availableFolderSlugs (installed):', [..._availableFolderSlugs].sort());
    console.debug('[icons] total CSS rules:', rules.size);

    console.debug('[icons] _buildBuiltinStylesheet done');
    console.debug(
      '[icons] folderCandidates tried:',
      [...allStems].filter((s) => s.startsWith('folder-')).sort(),
    );
    console.debug('[icons] availableFolderSlugs (builtin):', [..._availableFolderSlugs].sort());
    console.debug('[icons] total CSS rules:', rules.size);
    console.debug(
      '[icons] stylesheet preview (first 500 chars):',
      [...rules.keys()].slice(0, 20).join(', '),
    );

    const css = Array.from(rules.entries())
      .map(
        ([cls, decl]) =>
          `.${cls}{display:inline-block;width:15px;height:15px;background-size:contain;background-repeat:no-repeat;background-position:center;${decl}}`,
      )
      .join('\n');

    _getOrCreateStyleEl().textContent = css;
  }

  async function _buildBuiltinStylesheet() {
    let json = {};
    try {
      const res = await fetch('icons/icons.json');
      json = await res.json();
    } catch {}

    _builtinExts = json.fileExtensions ?? {};
    _builtinNames = json.fileNames ?? {};
    _builtinFolders = json.folderNames ?? {};
    _builtinCompound = json.fileCompound ?? {};

    const allStems = new Set([
      ...Object.values(_builtinExts),
      ...Object.values(_builtinNames),
      ...Object.values(_builtinCompound),
      'file',
      'folder',
      'folder-open',
    ]);

    try {
      const resourceDir = await window.__TAURI__.path.resourceDir();
      const iconFilesDir = await window.__TAURI__.path.join(resourceDir, 'icons', 'files');
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: iconFilesDir });
      for (const e of entries) {
        if (!e.entry.endsWith('.svg')) continue;
        allStems.add(e.entry.slice(0, -4));
      }
      console.debug('[icons] disk enumeration found', entries.length, 'files');
    } catch (err) {
      console.debug('[icons] disk enumeration failed, using alias map fallback:', err);
      for (const slug of Object.values(_builtinFolders)) {
        allStems.add(`folder-${slug}`);
        allStems.add(`folder-${slug}-open`);
      }
    }

    const rules = new Map();
    for (const stem of allStems) {
      const cls = _cssClass(stem);
      try {
        const res = await fetch(`icons/files/${stem}.svg`);
        if (res.ok) {
          const raw = await res.text();
          rules.set(cls, `background-image:url('${_svgToDataUrl(raw)}')`);
        }
      } catch {}
    }

    _availableFolderSlugs = new Set();
    for (const [cls] of rules.entries()) {
      const m = cls.match(/^vico-folder-(.+?)(?:-open)?$/);
      if (m) _availableFolderSlugs.add(m[1]);
    }

    console.debug(
      '[icons] _buildBuiltinStylesheet done, slugs:',
      [..._availableFolderSlugs].sort(),
      'rules:',
      rules.size,
    );

    const css = Array.from(rules.entries())
      .map(
        ([cls, decl]) =>
          `.${cls}{display:inline-block;width:15px;height:15px;background-size:contain;background-repeat:no-repeat;background-position:center;${decl}}`,
      )
      .join('\n');

    _getOrCreateStyleEl().textContent = css;
  }

  async function loadIcons() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = _doLoad();
    try {
      await _loadPromise;
    } finally {
      _loadPromise = null;
    }

    if (typeof ExplorerTree !== 'undefined') ExplorerTree.render();
  }

  async function _doLoad() {
    if (!_builtinExts) {
      try {
        const res = await fetch('icons/icons.json');
        const json = await res.json();
        _builtinExts = json.fileExtensions ?? {};
        _builtinNames = json.fileNames ?? {};
        _builtinFolders = json.folderNames ?? {};
        _builtinCompound = json.fileCompound ?? {};
      } catch {
        _builtinExts = {};
        _builtinNames = {};
        _builtinFolders = {};
        _builtinCompound = {};
      }
    }

    if (typeof iconThemeManager !== 'undefined') {
      const activeId = await iconThemeManager.getActive();
      console.debug('[icons] _doLoad: activeThemeId =', activeId);
      if (activeId && activeId !== 'material') {
        const installed = await iconThemeManager.loadInstalledIcons(activeId);
        if (installed) {
          _folderNames = installed.iconsJson.folderNames ?? {};
          _fileNames = installed.iconsJson.fileNames ?? {};
          _fileExts = installed.iconsJson.fileExtensions ?? {};
          _fileCompound = installed.iconsJson.fileCompound ?? {};
          await _buildIconStylesheet(installed.iconDir);
          return;
        }
      }
    }

    _folderNames = _builtinFolders;
    _fileNames = _builtinNames;
    _fileExts = _builtinExts;
    _fileCompound = _builtinCompound;
    await _buildBuiltinStylesheet();
  }

  async function reloadIcons() {
    _folderNames = _fileNames = _fileExts = _fileCompound = null;
    _builtinExts = _builtinNames = _builtinFolders = _builtinCompound = null;
    await loadIcons();
  }

  function _folderStem(name, isOpen) {
    const lower = name.toLowerCase();
    const aliasedSlug = _folderNames?.[lower] ?? _builtinFolders?.[lower] ?? null;
    if (aliasedSlug) {
      const stem = `folder-${aliasedSlug}${isOpen ? '-open' : ''}`;
      if (['admin', 'src', 'resources', 'api', 'components', 'utils', 'scripts'].includes(lower))
        console.debug(`[icons] _folderStem("${name}") -> alias -> ${stem}`);
      return stem;
    }
    if (_availableFolderSlugs?.has(lower)) {
      const stem = `folder-${lower}${isOpen ? '-open' : ''}`;
      if (['admin', 'src', 'resources', 'api', 'components', 'utils', 'scripts'].includes(lower))
        console.debug(`[icons] _folderStem("${name}") -> direct slug -> ${stem}`);
      return stem;
    }
    if (['admin', 'src', 'resources', 'api', 'components', 'utils', 'scripts'].includes(lower))
      console.debug(
        `[icons] _folderStem("${name}") -> FALLBACK (generic folder). availableFolderSlugs:`,
        [...(_availableFolderSlugs ?? [])].sort(),
      );
    return isOpen ? 'folder-open' : 'folder';
  }

  function _fileStem(filename) {
    const lower = filename.toLowerCase();
    const byName = _fileNames?.[lower] ?? _builtinNames?.[lower];
    if (byName) return byName;
    const firstDot = lower.indexOf('.');
    if (firstDot > 0) {
      const compound = lower.slice(firstDot + 1);
      const byCompound = _fileCompound?.[compound] ?? _builtinCompound?.[compound];
      if (byCompound) return byCompound;
    }
    const e = ext(lower);
    return _fileExts?.[e] ?? _builtinExts?.[e] ?? 'file';
  }

  function fileIconClass(filename, isFolder = false, isOpen = false) {
    const stem = isFolder ? _folderStem(filename, isOpen) : _fileStem(filename);
    return _cssClass(stem);
  }

  function fileIconFallbackClass(isFolder, isOpen) {
    return _cssClass(isFolder ? (isOpen ? 'folder-open' : 'folder') : 'file');
  }

  function fileIconEl(filename, isFolder = false, isOpen = false) {
    const el = document.createElement('span');
    el.className = fileIconClass(filename, isFolder, isOpen);
    return el;
  }

  function updateIconEl(el, filename, isFolder = false, isOpen = false) {
    el.className = fileIconClass(filename, isFolder, isOpen);
  }

  function uid() {
    return crypto.randomUUID();
  }

  function ext(filename) {
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  }

  function basename(path) {
    return path.replace(/\\/g, '/').split('/').pop();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timestamp() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function throttle(fn, ms) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last < ms) return;
      last = now;
      return fn.apply(this, args);
    };
  }

  return {
    loadIcons,
    reloadIcons,
    fileIconEl,
    fileIconClass,
    fileIconFallbackClass,
    updateIconEl,
    uid,
    ext,
    basename,
    escapeHtml,
    timestamp,
    debounce,
    throttle,
  };
})();
