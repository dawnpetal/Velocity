const helpers = (() => {
  let _folderNames = null;
  let _fileNames = null;
  let _fileExts = null;
  let _fileCompound = null;
  let _iconBase = "icons/files/";
  let _dataCache = null;
  let _loaded = false;
  let _builtinExts = null;
  let _builtinNames = null;
  let _builtinFolders = null;
  let _builtinCompound = null;
  async function loadIcons() {
    if (_loaded) return;
    _loaded = true;
    if (!_builtinExts) {
      try {
        const res = await fetch("icons/icons.json");
        const json = await res.json();
        _builtinExts = json.fileExtensions;
        _builtinNames = json.fileNames;
        _builtinFolders = json.folderNames;
        _builtinCompound = json.fileCompound;
      } catch {}
    }
    if (typeof iconThemeManager !== "undefined") {
      const activeId = await iconThemeManager.getActive();
      if (activeId && activeId !== "material") {
        const installed = await iconThemeManager.loadInstalledIcons(activeId);
        if (installed) {
          _folderNames = installed.iconsJson.folderNames;
          _fileNames = installed.iconsJson.fileNames;
          _fileExts = installed.iconsJson.fileExtensions;
          _fileCompound = installed.iconsJson.fileCompound;
          _iconBase = null;
          _dataCache = await _buildDataCache(installed.iconDir);
          return;
        }
      }
    }
    _iconBase = "icons/files/";
    _dataCache = null;
    _folderNames = _builtinFolders;
    _fileNames = _builtinNames;
    _fileExts = _builtinExts;
    _fileCompound = _builtinCompound;
  }
  async function reloadIcons() {
    _loaded = false;
    _folderNames = _fileNames = _fileExts = _fileCompound = null;
    _builtinExts = _builtinNames = _builtinFolders = _builtinCompound = null;
    _iconBase = "icons/files/";
    _dataCache = null;
    await loadIcons();
  }
  function _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }
  async function _buildDataCache(iconDir) {
    const cache = new Map();
    const ICON_TYPES = {
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    };
    try {
      const entries = await window.__TAURI__.core.invoke("read_dir", {
        path: iconDir,
      });
      await Promise.all(
        entries
          .filter((e) =>
            Object.keys(ICON_TYPES).some((x) => e.entry.endsWith(x)),
          )
          .map(async (e) => {
            const extMatch = Object.keys(ICON_TYPES).find((x) =>
              e.entry.endsWith(x),
            );
            const mime = ICON_TYPES[extMatch];
            const stem = e.entry.slice(0, e.entry.length - extMatch.length);
            try {
              if (mime === "image/svg+xml") {
                const raw = await window.__TAURI__.core.invoke(
                  "read_text_file",
                  {
                    path: `${iconDir}/${e.entry}`,
                  },
                );
                cache.set(
                  stem,
                  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`,
                );
              } else {
                const raw = await window.__TAURI__.core.invoke(
                  "read_binary_file",
                  {
                    path: `${iconDir}/${e.entry}`,
                  },
                );
                cache.set(
                  stem,
                  `data:${mime};base64,${_arrayBufferToBase64(raw)}`,
                );
              }
            } catch {}
          }),
      );
    } catch {}
    const needFolder = !cache.has("folder") && !cache.has("folder_closed");
    const needFolderOpen =
      !cache.has("folder-open") && !cache.has("folder_open");
    const needFile = !cache.has("file");
    const defaultsNeeded = [];
    if (needFolder) defaultsNeeded.push("folder");
    if (needFolderOpen) defaultsNeeded.push("folder-open");
    if (needFile) defaultsNeeded.push("file");
    await Promise.all(
      defaultsNeeded.map(async (stem) => {
        try {
          const res = await fetch(`icons/default_icons/${stem}.svg`);
          if (!res.ok) return;
          const raw = await res.text();
          cache.set(
            stem,
            `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`,
          );
        } catch {}
      }),
    );
    return cache;
  }
  function _folderIcon(name, isOpen) {
    const lower = name.toLowerCase();
    const slug = _folderNames?.[lower] ?? _builtinFolders?.[lower] ?? lower;
    return `folder-${slug}${isOpen ? "-open" : ""}`;
  }
  function _fileIcon(filename) {
    const lower = filename.toLowerCase();
    const byName = _fileNames?.[lower] ?? _builtinNames?.[lower];
    if (byName) return byName;
    const firstDot = lower.indexOf(".");
    if (firstDot > 0) {
      const compound = lower.slice(firstDot + 1);
      const byCompound =
        _fileCompound?.[compound] ?? _builtinCompound?.[compound];
      if (byCompound) return byCompound;
    }
    const e = ext(lower);
    return _fileExts?.[e] ?? _builtinExts?.[e] ?? "file";
  }
  function _resolveUrl(stem, fallbackStem) {
    if (_dataCache) {
      return (
        _dataCache.get(stem) ??
        _dataCache.get(fallbackStem) ??
        _dataCache.get("file") ??
        ""
      );
    }
    return (_iconBase ?? "icons/files/") + stem + ".svg";
  }
  function fileIconImg(filename, isFolder = false, isOpen = false, size = 14) {
    const stem = isFolder ? _folderIcon(filename, isOpen) : _fileIcon(filename);
    const fallback = isFolder ? (isOpen ? "folder-open" : "folder") : "file";
    const img = document.createElement("img");
    img.width = size;
    img.height = size;
    img.style.cssText = "object-fit:contain;flex-shrink:0;display:block";
    img.src = _resolveUrl(stem, fallback);
    if (!_dataCache) {
      img.addEventListener(
        "error",
        () => {
          img.src = (_iconBase ?? "icons/files/") + fallback + ".svg";
        },
        {
          once: true,
        },
      );
    }
    return img;
  }
  function uid() {
    return crypto.randomUUID();
  }
  function ext(filename) {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
  }
  function basename(path) {
    return path.replace(/\\/g, "/").split("/").pop();
  }
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function timestamp() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
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
    uid,
    ext,
    basename,
    escapeHtml,
    timestamp,
    debounce,
    throttle,
    fileIconImg,
  };
})();