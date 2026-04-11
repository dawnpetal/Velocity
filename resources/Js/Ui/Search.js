const search = (() => {
  const resultsEl = () => document.getElementById("searchResults");
  const inputEl = () => document.getElementById("searchInput");
  const includeEl = () => document.getElementById("includeInput");
  const excludeEl = () => document.getElementById("excludeInput");
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
  function _globToRe(p) {
    const x = p
      .trim()
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(x, "i");
  }
  function _parsePatterns(raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(_globToRe);
  }
  function _buildTestRe(query) {
    try {
      let pat = _searchOpts.regex
        ? query
        : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (_searchOpts.wholeWord) pat = `\\b${pat}\\b`;
      return new RegExp(pat, _searchOpts.matchCase ? "" : "i");
    } catch {
      return null;
    }
  }
  function _buildHlRe(query) {
    try {
      let pat = _searchOpts.regex
        ? query
        : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (_searchOpts.wholeWord) pat = `\\b${pat}\\b`;
      return new RegExp(pat, _searchOpts.matchCase ? "g" : "gi");
    } catch {
      return null;
    }
  }
  function _highlight(trimmed, fastMode, query, qLow, hlRe) {
    if (fastMode) {
      const src = _searchOpts.matchCase ? trimmed : trimmed.toLowerCase();
      let out = "",
        last = 0,
        idx;
      while ((idx = src.indexOf(qLow, last)) !== -1) {
        out += helpers.escapeHtml(trimmed.slice(last, idx));
        out += `<mark>${helpers.escapeHtml(trimmed.slice(idx, idx + query.length))}</mark>`;
        last = idx + query.length;
      }
      return out + helpers.escapeHtml(trimmed.slice(last));
    }
    return helpers
      .escapeHtml(trimmed)
      .replace(hlRe, (m) => `<mark>${m}</mark>`);
  }
  function _renderFileGroup(
    container,
    fileId,
    fileName,
    hits,
    truncated,
    fastMode,
    query,
    qLow,
    hlRe,
  ) {
    const header = document.createElement("div");
    header.className = "search-result-file";
    const arrow = document.createElement("span");
    arrow.className = "result-file-arrow";
    arrow.innerHTML = ARROW;
    const lbl = document.createElement("span");
    lbl.className = "result-file-label";
    lbl.textContent = fileName;
    const badge = document.createElement("span");
    badge.className = "result-file-badge";
    badge.textContent = hits.length + (truncated ? "+" : "");
    header.append(arrow, lbl, badge);
    container.appendChild(header);
    const group = document.createElement("div");
    group.className = "search-result-group";
    const frag = document.createDocumentFragment();
    for (const hit of hits) {
      const row = document.createElement("div");
      row.className = "search-result-line";
      const lineNum = document.createElement("span");
      lineNum.className = "result-line-num";
      lineNum.textContent = hit.lineNum;
      const text = document.createElement("span");
      text.className = "result-text";
      text.innerHTML = _highlight(hit.text.trim(), fastMode, query, qLow, hlRe);
      row.append(lineNum, text);
      row.onclick = () => {
        const fid = fileId ?? _pathToId(hit.path);
        if (fid) { editor.jumpToLine(fid, hit.lineNum); }
        else { _openByPath(hit.path, hit.lineNum); }
      };
      frag.appendChild(row);
    }
    group.appendChild(frag);
    header.onclick = () => {
      const collapsed = group.classList.toggle("collapsed");
      arrow.classList.toggle("collapsed", collapsed);
    };
    container.appendChild(group);
  }
  function _pathToId(path) {
    if (!path) return null;
    const f = state.files.find((f) => f.path === path);
    return f ? f.id : null;
  }

  async function _openByPath(path, lineNum) {
    if (!path) return;
    let file = state.files.find((f) => f.path === path);
    if (!file) {
      const id = helpers.uid();
      const name = helpers.basename(path);
      state.addFile(id, name, path, null);
      file = state.getFile(id);
    }
    await fileManager.ensureContent(file.id);
    editor.jumpToLine(file.id, lineNum);
  }
  async function _runTauri(token, query, workDir) {
    const results = resultsEl();
    const incRaw = includeEl()?.value ?? "";
    const excRaw = excludeEl()?.value ?? "";
    const opts = {
      match_case: _searchOpts.matchCase,
      whole_word: _searchOpts.wholeWord,
      is_regex: _searchOpts.regex,
      include_globs: incRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      exclude_globs: excRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const rawMatches = await window.__TAURI__.core.invoke("ripgrep_search", {
        query,
        workDir,
        opts,
      });
      if (token !== searchToken) return;
      const matches = rawMatches.map((m) => ({
        ...m,
        lineNum: m.line_num,
      }));
      _renderMatches(token, query, matches);
    } catch (e) {
      if (token !== searchToken) return;
      results.innerHTML = `<div class="search-empty">Search error<span>${helpers.escapeHtml(String(e))}</span></div>`;
    }
  }
  function _renderMatches(token, query, matches) {
    const results = resultsEl();
    if (!matches.length) {
      results.innerHTML = `<div class="search-empty">No results<span>No matches found.</span></div>`;
      return;
    }
    const byFile = new Map();
    let totalFiles = 0;
    for (const match of matches) {
      if (!byFile.has(match.path)) {
        if (totalFiles >= MAX_TOTAL_FILES) continue;
        byFile.set(match.path, { hits: [], truncated: false });
        totalFiles++;
      }
      const entry = byFile.get(match.path);
      if (entry.hits.length < MAX_RESULTS_PER_FILE) {
        entry.hits.push(match);
      } else {
        entry.truncated = true;
      }
    }
    if (token !== searchToken) return;
    const fastMode = !_searchOpts.regex && !_searchOpts.wholeWord;
    const hlRe = _buildHlRe(query);
    const qLow = _searchOpts.matchCase ? query : query.toLowerCase();
    const entries = [...byFile.entries()];
    let i = 0;
    function renderChunk() {
      if (token !== searchToken) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(i + FRAME_BUDGET, entries.length);
      while (i < end) {
        const [path, { hits, truncated }] = entries[i++];
        _renderFileGroup(
          frag,
          _pathToId(path),
          helpers.basename(path),
          hits,
          truncated,
          fastMode,
          query,
          qLow,
          hlRe,
        );
      }
      results.appendChild(frag);
      if (i < entries.length) {
        requestAnimationFrame(renderChunk);
      } else if (totalFiles >= MAX_TOTAL_FILES) {
        const note = document.createElement("div");
        note.className = "search-empty";
        note.innerHTML = `<span>Showing first ${MAX_TOTAL_FILES} files. Narrow your query.</span>`;
        results.appendChild(note);
      }
    }
    requestAnimationFrame(renderChunk);
  }
  function _runJs(token, query) {
    const results = resultsEl();
    const incPats = _parsePatterns(includeEl()?.value ?? "");
    const excPats = _parsePatterns(excludeEl()?.value ?? "");
    const fastMode = !_searchOpts.regex && !_searchOpts.wholeWord;
    const testRe = fastMode ? null : _buildTestRe(query);
    const hlRe = _buildHlRe(query);
    const qLow = _searchOpts.matchCase ? query : query.toLowerCase();
    if (!fastMode && !testRe) {
      results.innerHTML = `<div class="search-empty">Invalid regex<span>Check your pattern syntax.</span></div>`;
      return;
    }
    const files = state.files.slice();
    let fileIndex = 0;
    let fileCount = 0;
    function frame() {
      if (token !== searchToken) return;
      const start = performance.now();
      while (fileIndex < files.length) {
        if (performance.now() - start > FRAME_BUDGET) break;
        if (fileCount >= MAX_TOTAL_FILES) break;
        const file = files[fileIndex++];
        if (incPats.length && !incPats.some((re) => re.test(file.name)))
          continue;
        if (excPats.length && excPats.some((re) => re.test(file.name)))
          continue;
        if (file.content === null) continue;
        const lines = state.getLines(file.id);
        const hits = [];
        for (
          let i = 0;
          i < lines.length && hits.length < MAX_RESULTS_PER_FILE;
          i++
        ) {
          const line = lines[i];
          let match;
          if (fastMode) {
            match = (
              _searchOpts.matchCase ? line : line.toLowerCase()
            ).includes(qLow);
          } else {
            testRe.lastIndex = 0;
            match = testRe.test(line);
          }
          if (match)
            hits.push({
              lineNum: i + 1,
              text: line,
            });
        }
        if (hits.length) {
          const frag = document.createDocumentFragment();
          _renderFileGroup(
            frag,
            file.id,
            file.name,
            hits,
            hits.length >= MAX_RESULTS_PER_FILE,
            fastMode,
            query,
            qLow,
            hlRe,
          );
          results.appendChild(frag);
          fileCount++;
        }
      }
      if (fileIndex < files.length && fileCount < MAX_TOTAL_FILES) {
        requestAnimationFrame(frame);
      } else if (fileCount >= MAX_TOTAL_FILES) {
        const note = document.createElement("div");
        note.className = "search-empty";
        note.innerHTML = `<span>Showing first ${MAX_TOTAL_FILES} files. Narrow your query.</span>`;
        results.appendChild(note);
      }
    }
    requestAnimationFrame(frame);
  }
  async function _run() {
    const token = ++searchToken;
    const query = inputEl()?.value.trim();
    const results = resultsEl();
    if (!results) return;
    results.innerHTML = "";
    if (!query) return;
    const loadingTimer = setTimeout(() => {
      if (token !== searchToken) return;
      results.innerHTML = `<div class="search-empty"><span>Searching\u2026</span></div>`;
    }, 150);
    const workDir = state.workDir;
    clearTimeout(loadingTimer);
    if (token !== searchToken) return;
    results.innerHTML = "";
    if (workDir) {
      await _runTauri(token, query, workDir);
    } else {
      _runJs(token, query);
    }
  }
  const run = helpers.debounce(_run, 200);
  function _toggle(id, key) {
    document.getElementById(id)?.addEventListener("click", function () {
      _searchOpts[key] = !_searchOpts[key];
      this.classList.toggle("active", _searchOpts[key]);
      _run();
    });
  }
  function init() {
    inputEl()?.addEventListener("input", run);
    includeEl()?.addEventListener("input", run);
    excludeEl()?.addEventListener("input", run);
    _toggle("toggleCase", "matchCase");
    _toggle("toggleWord", "wholeWord");
    _toggle("toggleRegex", "regex");
    document.addEventListener("keydown", (e) => {
      if (!e.altKey) return;
      const map = {
        c: "toggleCase",
        w: "toggleWord",
        r: "toggleRegex",
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