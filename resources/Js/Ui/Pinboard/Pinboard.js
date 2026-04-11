const pinboard = (() => {
  let _snippets = [];
  let _filter = "";
  let _sortMode = "manual";
  const _activeEditorIds = new Map();
  const SORT_MODES = ["manual", "name", "runs", "recent"];
  const SEARCH_DEBOUNCE_MS = 100;
  const NEW_SNIPPET_PIN_TOAST_DURATION = 1800;
  const SVG = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };
  function _context() {
    return {
      snippets: _snippets,
      sortMode: _sortMode,
      activeEditorIds: _activeEditorIds,
      findIdx: _findIdx,
      onRun: (snippet, showOutput) =>
        PinboardOps.run(snippet, showOutput, _context()),
      onOpenInEditor: (snippet) =>
        PinboardOps.openInEditor(snippet, _context()),
      onSave: _save,
      onRender: render,
      onFilterByTag: (tag) => {
        _filter = tag;
        render();
      },
    };
  }
  function _dir() {
    return paths.internals;
  }
  async function _save() {
    try {
      const dir = await _dir();
      await window.__TAURI__.core.invoke("write_text_file", {
        path: `${dir}/pinboard.json`,
        content: JSON.stringify({
          snippets: _snippets,
          sortMode: _sortMode,
        }),
      });
    } catch {}
  }
  async function _load() {
    try {
      const dir = await _dir();
      const raw = await window.__TAURI__.core.invoke("read_text_file", {
        path: `${dir}/pinboard.json`,
      });
      const data = JSON.parse(raw);
      _snippets = Array.isArray(data) ? data : (data.snippets ?? []);
      _sortMode = data.sortMode ?? "manual";
    } catch {
      _snippets = [
        {
          id: helpers.uid(),
          label: "Infinite Jump",
          tags: ["movement"],
          code: [
            "local player = game.Players.LocalPlayer",
            'local uis = game:GetService("UserInputService")',
            "local char = player.Character or player.CharacterAdded:Wait()",
            'local hum = char:WaitForChild("Humanoid")',
            "local jumping = false",
            "uis.InputBegan:Connect(function(i, gpe)",
            "  if gpe then return end",
            "  if i.KeyCode == Enum.KeyCode.Space then",
            "    jumping = true",
            "    task.spawn(function()",
            "      while jumping do",
            "        hum:ChangeState(Enum.HumanoidStateType.Jumping)",
            "        task.wait(0.1)",
            "      end",
            "    end)",
            "  end",
            "end)",
            "uis.InputEnded:Connect(function(i)",
            "  if i.KeyCode == Enum.KeyCode.Space then jumping = false end",
            "end)",
          ].join("\n"),
          runCount: 0,
          lastRun: null,
          createdAt: Date.now(),
        },
        {
          id: helpers.uid(),
          label: "Print All Players",
          tags: ["debug"],
          code: "for _, p in ipairs(game.Players:GetPlayers()) do\n  print(p.Name, p.UserId, p.Team)\nend",
          runCount: 0,
          lastRun: null,
          createdAt: Date.now(),
        },
        {
          id: helpers.uid(),
          label: "Speed Boost",
          tags: ["movement"],
          code: [
            "local player = game.Players.LocalPlayer",
            "local char = player.Character or player.CharacterAdded:Wait()",
            'local hum = char:WaitForChild("Humanoid")',
            "hum.WalkSpeed = 100",
          ].join("\n"),
          runCount: 0,
          lastRun: null,
          createdAt: Date.now(),
        },
      ];
    }
  }
  function _container() {
    return document.getElementById("pinboardView");
  }
  function _findIdx(id) {
    return _snippets.findIndex((s) => s.id === id);
  }
  function _visibleSnippets() {
    let list = _snippets.slice();
    if (_filter) {
      const query = _filter.toLowerCase();
      list = list.filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.code.toLowerCase().includes(query) ||
          (s.tags ?? []).some((t) => t.toLowerCase().includes(query)),
      );
    }
    if (_sortMode === "name")
      list.sort((a, b) => a.label.localeCompare(b.label));
    else if (_sortMode === "runs")
      list.sort((a, b) => (b.runCount ?? 0) - (a.runCount ?? 0));
    else if (_sortMode === "recent")
      list.sort((a, b) => (b.lastRun ?? 0) - (a.lastRun ?? 0));
    return list;
  }
  function _buildToolbar() {
    const bar = DomHelpers.el("div", "pb-toolbar");
    const top = DomHelpers.el("div", "pb-toolbar-top");
    const left = DomHelpers.el("div", "pb-toolbar-left");
    const titleEl = DomHelpers.el("span", "pb-toolbar-title", "Pinboard");
    const countEl = DomHelpers.el(
      "span",
      "pb-toolbar-count",
      String(_snippets.length),
    );
    left.append(titleEl, countEl);
    const right = DomHelpers.el("div", "pb-toolbar-right");
    const sortBtn = document.createElement("button");
    sortBtn.className = "icon-btn pb-sort-btn";
    sortBtn.title = "Sort: " + _sortMode + " \u2014 click to cycle";
    sortBtn.innerHTML = SVG.sort;
    sortBtn.setAttribute("data-sort", _sortMode);
    sortBtn.addEventListener("click", () => {
      _sortMode =
        SORT_MODES[(SORT_MODES.indexOf(_sortMode) + 1) % SORT_MODES.length];
      sortBtn.title = "Sort: " + _sortMode + " \u2014 click to cycle";
      sortBtn.setAttribute("data-sort", _sortMode);
      _save().catch(() => {});
      render();
    });
    const pinBtn = document.createElement("button");
    pinBtn.className = "icon-btn";
    pinBtn.title = "Pin active editor content";
    pinBtn.innerHTML = SVG.pin;
    pinBtn.addEventListener("click", () => {
      const active = state.getActive();
      if (!active) {
        toast.show("No file open", "warn", 1500);
        return;
      }
      if (PinboardOps.isSnippetFile(active.id, _context())) {
        toast.show("Already a pinboard snippet", "warn", 1500);
        return;
      }
      const snippet = {
        id: helpers.uid(),
        label: active.name.replace(/\.[^.]+$/, ""),
        tags: [],
        code: active.content,
        runCount: 0,
        lastRun: null,
        createdAt: Date.now(),
      };
      _snippets.unshift(snippet);
      _save().catch(() => {});
      render();
      toast.show(
        'Pinned "' + snippet.label + '"',
        "ok",
        NEW_SNIPPET_PIN_TOAST_DURATION,
      );
    });
    const addBtn = document.createElement("button");
    addBtn.className = "icon-btn";
    addBtn.title = "New snippet";
    addBtn.innerHTML = SVG.add;
    addBtn.addEventListener("click", _addNew);
    right.append(sortBtn, pinBtn, addBtn);
    top.append(left, right);
    const searchRow = DomHelpers.el("div", "pb-search-row");
    const searchIcon = DomHelpers.el("span", "pb-search-icon");
    searchIcon.innerHTML = SVG.search;
    const searchInput = document.createElement("input");
    searchInput.className = "pb-search-input";
    searchInput.placeholder = "Filter by name, code, tag\u2026";
    searchInput.value = _filter;
    searchInput.addEventListener(
      "input",
      helpers.debounce(() => {
        _filter = searchInput.value;
        _rerenderList();
      }, SEARCH_DEBOUNCE_MS),
    );
    searchRow.append(searchIcon, searchInput);
    if (_filter) {
      const clearBtn = document.createElement("button");
      clearBtn.className = "pb-search-clear";
      clearBtn.innerHTML = SVG.close;
      clearBtn.addEventListener("click", () => {
        _filter = "";
        render();
      });
      searchRow.appendChild(clearBtn);
    }
    bar.append(top, searchRow);
    return bar;
  }
  function _rerenderList() {
    const container = _container();
    if (!container) return;
    container.querySelector(".pb-list")?.remove();
    container.querySelector(".pb-empty")?.remove();
    const visible = _visibleSnippets();
    if (!_snippets.length) {
      container.appendChild(PinboardCard.buildEmpty(_addNew));
      return;
    }
    if (!visible.length) {
      const noMatches = DomHelpers.el("div", "pb-empty");
      noMatches.innerHTML = SVG.search + "<span>No matches</span>";
      container.appendChild(noMatches);
      return;
    }
    const list = DomHelpers.el("div", "pb-list");
    visible.forEach((snippet) =>
      list.appendChild(PinboardCard.buildCard(snippet, _context())),
    );
    container.appendChild(list);
  }
  function render() {
    const container = _container();
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(_buildToolbar());
    const visible = _visibleSnippets();
    if (!_snippets.length) {
      container.appendChild(PinboardCard.buildEmpty(_addNew));
      return;
    }
    if (_filter && !visible.length) {
      const noMatches = DomHelpers.el("div", "pb-empty");
      noMatches.innerHTML =
        SVG.search +
        '<span>No matches for "' +
        helpers.escapeHtml(_filter) +
        '"</span>';
      container.appendChild(noMatches);
      return;
    }
    const list = DomHelpers.el("div", "pb-list");
    visible.forEach((snippet) =>
      list.appendChild(PinboardCard.buildCard(snippet, _context())),
    );
    container.appendChild(list);
  }
  function _addNew() {
    const snippet = {
      id: helpers.uid(),
      label: "New Snippet",
      tags: [],
      code: "",
      runCount: 0,
      lastRun: null,
      createdAt: Date.now(),
    };
    _snippets.unshift(snippet);
    _save().catch(() => {});
    render();
    requestAnimationFrame(() => {
      const container = _container();
      const labelEl = container
        ? container.querySelector(".pb-card-label")
        : null;
      if (labelEl) PinboardCard.startInlineRename(labelEl, snippet, _context());
    });
  }
  async function init() {
    await _load();
    document.addEventListener("keydown", (e) => {
      const container = _container();
      if (!container || container.style.display === "none") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.key === "n" || e.key === "N") _addNew();
    });
  }
  function show() {
    render();
    const container = _container();
    if (container) container.scrollTop = 0;
  }
  function pinFile(node) {
    PinboardOps.pinFile(node, _context());
  }
  function handleEditorSave(fileId) {
    return PinboardOps.handleEditorSave(fileId, _context());
  }
  function handleTabClose(fileId) {
    PinboardOps.handleTabClose(fileId, _context());
  }
  function isSnippetFile(fileId) {
    return PinboardOps.isSnippetFile(fileId, _context());
  }
  return {
    init,
    show,
    render,
    pinFile,
    handleEditorSave,
    handleTabClose,
    isSnippetFile,
  };
})();
