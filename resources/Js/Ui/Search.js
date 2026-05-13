const search = (() => {
  const resultsEl = () => document.getElementById('searchResults');
  const inputEl = () => document.getElementById('searchInput');
  const includeEl = () => document.getElementById('includeInput');
  const excludeEl = () => document.getElementById('excludeInput');
  const _searchOpts = {
    matchCase: false,
    wholeWord: false,
    regex: false,
  };
  const MAX_RESULTS_PER_FILE = 500;
  const MAX_TOTAL_FILES = 200;
  const FRAME_BUDGET = 8;
  const ARROW = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M2 2.5L5 5.5L2 8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  let searchToken = 0;

  function _renderFileGroup(container, fileId, fileName, hits, truncated) {
    const header = document.createElement('div');
    header.className = 'search-result-file';
    const arrow = document.createElement('span');
    arrow.className = 'result-file-arrow';
    arrow.innerHTML = ARROW;
    const lbl = document.createElement('span');
    lbl.className = 'result-file-label';
    lbl.textContent = fileName;
    const badge = document.createElement('span');
    badge.className = 'result-file-badge';
    badge.textContent = hits.length + (truncated ? '+' : '');
    header.append(arrow, lbl, badge);
    container.appendChild(header);
    const group = document.createElement('div');
    group.className = 'search-result-group';
    const frag = document.createDocumentFragment();
    for (const hit of hits) {
      const row = document.createElement('div');
      row.className = 'search-result-line';
      const lineNum = document.createElement('span');
      lineNum.className = 'result-line-num';
      lineNum.textContent = hit.lineNum;
      const text = document.createElement('span');
      text.className = 'result-text';
      text.innerHTML = hit.highlighted
        ? hit.highlighted.trim()
        : helpers.escapeHtml(String(hit.text ?? '').trim());
      row.append(lineNum, text);
      row.onclick = () => {
        const fid = fileId ?? _pathToId(hit.path);
        if (fid) {
          editor.jumpToLine(fid, hit.lineNum);
        } else {
          _openByPath(hit.path, hit.lineNum);
        }
      };
      frag.appendChild(row);
    }
    group.appendChild(frag);
    header.onclick = () => {
      const collapsed = group.classList.toggle('collapsed');
      arrow.classList.toggle('collapsed', collapsed);
    };
    container.appendChild(group);
  }

  function _pathToId(path) {
    if (!path) return null;
    const f = state.findByPath(path);
    return f ? f.id : null;
  }

  async function _openByPath(path, lineNum) {
    if (!path) return;
    let file = state.findByPath(path);
    if (!file) {
      const id = helpers.uid();
      const name = helpers.basename(path);
      state.addFile(id, name, path, null);
      file = state.getFile(id);
    }
    await fileManager.ensureContent(file.id);
    editor.jumpToLine(file.id, lineNum);
  }

  async function _runBackend(token, query, workDir) {
    const results = resultsEl();
    const incRaw = includeEl()?.value ?? '';
    const excRaw = excludeEl()?.value ?? '';
    const opts = {
      match_case: _searchOpts.matchCase,
      whole_word: _searchOpts.wholeWord,
      is_regex: _searchOpts.regex,
      include_globs: incRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      exclude_globs: excRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const rawMatches = await window.__TAURI__.core.invoke('search_with_highlights', {
        query,
        workDir,
        opts,
      });
      if (token !== searchToken) return;
      const matches = rawMatches.map((m) => ({
        ...m,
        lineNum: m.line_num,
      }));
      _renderMatches(token, matches);
    } catch (e) {
      if (token !== searchToken || !results) return;
      results.innerHTML = `<div class="search-empty">Search error<span>${helpers.escapeHtml(String(e))}</span></div>`;
    }
  }

  function _renderMatches(token, matches) {
    const results = resultsEl();
    if (!results || token !== searchToken) return;
    results.innerHTML = '';
    if (!matches.length) {
      results.innerHTML = `<div class="search-empty">No results<span>No matches found.</span></div>`;
      return;
    }
    const byFile = new Map();
    let totalFiles = 0;
    for (const match of matches) {
      if (!byFile.has(match.path)) {
        if (totalFiles >= MAX_TOTAL_FILES) continue;
        byFile.set(match.path, {
          hits: [],
          truncated: false,
        });
        totalFiles++;
      }
      const entry = byFile.get(match.path);
      if (entry.hits.length < MAX_RESULTS_PER_FILE) {
        entry.hits.push(match);
      } else {
        entry.truncated = true;
      }
    }
    const entries = [...byFile.entries()];
    let i = 0;
    function renderChunk() {
      if (token !== searchToken) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(i + FRAME_BUDGET, entries.length);
      while (i < end) {
        const [path, { hits, truncated }] = entries[i++];
        _renderFileGroup(frag, _pathToId(path), helpers.basename(path), hits, truncated);
      }
      results.appendChild(frag);
      if (i < entries.length) {
        requestAnimationFrame(renderChunk);
      } else if (totalFiles >= MAX_TOTAL_FILES) {
        const note = document.createElement('div');
        note.className = 'search-empty';
        note.innerHTML = `<span>Showing first ${MAX_TOTAL_FILES} files. Narrow your query.</span>`;
        results.appendChild(note);
      }
    }
    requestAnimationFrame(renderChunk);
  }

  async function _run() {
    const token = ++searchToken;
    const query = inputEl()?.value.trim();
    const results = resultsEl();
    if (!results) return;
    results.innerHTML = '';
    if (!query) return;
    const workDir = state.workDir;
    if (!workDir) {
      results.innerHTML = `<div class="search-empty">Open a folder to search<span>Search runs through the active workspace.</span></div>`;
      return;
    }
    const loadingTimer = setTimeout(() => {
      if (token !== searchToken) return;
      results.innerHTML = `<div class="search-empty"><span>Searching\u2026</span></div>`;
    }, 150);
    try {
      await _runBackend(token, query, workDir);
    } finally {
      clearTimeout(loadingTimer);
    }
  }

  const run = helpers.debounce(_run, 200);

  function _toggle(id, key) {
    document.getElementById(id)?.addEventListener('click', function () {
      _searchOpts[key] = !_searchOpts[key];
      this.classList.toggle('active', _searchOpts[key]);
      _run();
    });
  }

  function init() {
    inputEl()?.addEventListener('input', run);
    includeEl()?.addEventListener('input', run);
    excludeEl()?.addEventListener('input', run);
    _toggle('toggleCase', 'matchCase');
    _toggle('toggleWord', 'wholeWord');
    _toggle('toggleRegex', 'regex');
    document.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      const map = {
        c: 'toggleCase',
        w: 'toggleWord',
        r: 'toggleRegex',
      };
      const id = map[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        document.getElementById(id)?.click();
      }
    });
  }

  return {
    init,
    run: _run,
  };
})();
