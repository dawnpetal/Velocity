const guide = (() => {
  const BAR_H = 150;
  let _characterPool = [];
  let _boundListeners = {};
  const CHARACTER_LINES = {
    "Walter White": {
      welcome: `I insist you complete this tutorial. Not because you need it, but because I need it. I'm Walter White, and this is my guide to Velocity. Let's get started.`,
      Execute: {
        text: `This is where it happens. Open Roblox, press Execute, and the script runs. No theatrics—just results. If it fails, the script is the problem, not you.`,
        image: "Walter_White.png",
      },
    },
    Obama: {
      welcome: `Hey. Barack Obama here. Yes, that one. Look, I've dealt with Congress, two terms, a Nobel Prize. Walking you through a script executor? Honestly one of my easier days.`,
      Settings: {
        text: `Let me be clear. You will pick a theme. You will pick one that represents your values, your vision, and frankly the kind of person you want to be. This is not a decision to take lightly. Choose wisely. I believe in you.`,
      },
    },
    "Quandale Dingle": {
      welcome: `Aight, it's Quandale Dingle. I'm not gonna waste your time—let’s just get through this.`,
      Output: {
        text: `Green? You're good. Red? Something broke—and yeah, that's on the script. Just check it and try again.`,
      },
    },
    "Chuck Norris": {
      welcome: `Chuck Norris doesn't use script executors. He stares at Roblox until it does what he wants. But I'll walk you through this anyway, because not everyone is Chuck Norris.`,
      Done: {
        text: `Chuck Norris never finishes tutorials. The tutorial finishes itself out of respect. You're done. The basic flow is open a script, click Execute, it runs in Roblox. Now go. The question mark brings this back if you forget anything.`,
      },
    },
  };
  function _getCharacterLine(charName, checkpoint) {
    const entry = CHARACTER_LINES[charName];
    if (!entry || !checkpoint) return null;
    return entry[checkpoint] || null;
  }
  function _getCharacterWelcome(charName) {
    const entry = CHARACTER_LINES[charName];
    if (!entry) return null;
    return entry.welcome || null;
  }
  async function _loadCharacters() {
    const CHAR_FILES = {
      "Walter White": "Assets/Characters/Walter_White.png",
      Obama: "Assets/Characters/Obama.png",
      "Quandale Dingle": "Assets/Characters/Quandale_Dingle.png",
      "Chuck Norris": "Assets/Characters/Chuck_Norris.png",
    };
    _characterPool = Object.entries(CHAR_FILES).map(([name, url]) => ({
      name,
      url,
    }));
  }
  function _pickCharacter() {
    if (_characterPool.length === 0)
      return {
        url: "",
        name: "",
      };
    return _characterPool[Math.floor(Math.random() * _characterPool.length)];
  }
  const STEPS = [
    {
      checkpoint: "Welcome",
      view: "explorer",
      label: "Welcome",
      selector: null,
      padding: 0,
      text: () => {
        const welcome = _getCharacterWelcome(_currentChar.name);
        if (welcome) return welcome;
        return `Hey, I'm ${_currentChar.name}. This is Velocity, a script editor made for Roblox. I'll walk you through every part of the app. Use the arrows to move around, click any dot to jump to a step, or press Space and Enter to go forward. Esc exits.`;
      },
    },
    {
      checkpoint: "Workspace",
      view: "explorer",
      label: "The Workspace",
      selector: ".workspace",
      padding: 0,
      text: "This is the whole app. Far left is the activity bar with your navigation icons. Next to it is the sidebar, which changes depending on what view you're in. The big area in the center is the editor. Down at the bottom is the output panel.",
    },
    {
      view: "explorer",
      label: "Activity Bar",
      selector: "#activityBar",
      padding: 3,
      text: "Each icon here puts the app in a different mode. Folder is Explorer. Magnifier is Search. Arrow-lines is Autoexecute. Star is Pinboard. Scroll is Cloud Scripts. Gear is Settings. The question mark reopens this tour.",
    },
    {
      view: "explorer",
      label: "Sidebar",
      selector: "#sidebar",
      padding: 3,
      text: "This panel shows whatever the current view needs. In Explorer it's your file tree. In Search it becomes a search panel. You can drag the thin divider on the right edge to resize it.",
    },
    {
      view: "explorer",
      label: "File Tree",
      selector: "#fileTree",
      padding: 3,
      text: "Your saved scripts show up here once you open a folder. Click a file to open it, right-click for rename, delete, and so on. The icons at the top of the sidebar let you create new files or folders. No folder open? Just paste straight into the editor, you don't need one.",
    },
    {
      checkpoint: "Editor",
      view: "explorer",
      label: "Editor Area",
      selector: ".editor-area",
      padding: 3,
      text: "This is where you write or paste scripts. It runs on Monaco, the same engine VS Code uses, so you get full Lua and Luau syntax highlighting, autocomplete, and error markers. Paste with Cmd+V. The colors are just for readability.",
    },
    {
      view: "explorer",
      label: "Tab Strip",
      selector: "#tabStrip",
      padding: 2,
      text: "Open files show up as tabs here. You can have as many as you want and switch between them freely. Cmd+W closes the active one. Cmd+N opens a fresh blank file.",
    },
    {
      view: "explorer",
      label: "Tabs — Italic = Preview",
      selector: "#tabStrip",
      padding: 2,
      text: "A tab name in italics is a preview tab. It's not locked open, so opening another file will replace it instead of adding a new tab. This keeps things clean when you're just browsing. Edit the file or press Cmd+S to lock it.",
    },
    {
      view: "explorer",
      label: "Tabs — The Dot",
      selector: "#tabStrip",
      padding: 2,
      text: "Once you make changes to a file, a dot appears on its tab. The dot means there are unsaved changes. Cmd+S saves it and clears the dot. If you try to close a dotted tab, it'll ask you to save first.",
    },
    {
      view: "explorer",
      label: "Breadcrumb",
      selector: "#breadcrumbBar",
      padding: 2,
      text: "The breadcrumb bar shows the path of whatever file is open right now, workspace folder, any subfolders, then the filename. It's read-only, just there to help you know where you are.",
    },
    {
      checkpoint: "Execute",
      view: "explorer",
      label: "Execute Button",
      selector: "#fabWrap",
      padding: 10,
      text: () => {
        const line = _getCharacterLine(_currentChar.name, "Execute");
        if (line) return line.text;
        return "The button in the bottom right runs whatever script you have open and sends it into Roblox. Roblox needs to be open first with your executor's server running. Cmd+Enter does the same thing. The chevron on the left opens a small extra menu.";
      },
    },
    {
      view: "explorer",
      label: "Execute — How It Works",
      selector: "#fabWrap",
      padding: 10,
      text: "When you hit Execute, Velocity scans ports 6969 through 7069 looking for your executor's local HTTP server. Once it finds one, it sends the script over. That's why Roblox has to be running first, the executor starts that server when it attaches.",
    },
    {
      view: "explorer",
      label: "Execute — The Chevron",
      selector: "#fabWrap",
      padding: 10,
      text: "The chevron opens a small pill menu. Open Roblox launches the Roblox app directly. History pulls up the execution history panel where you can re-run, copy, or look over anything you've run before.",
    },
    {
      checkpoint: "Output",
      view: "explorer",
      label: "Output Panel",
      selector: "#bottomPanel",
      padding: 2,
      text: () => {
        const line = _getCharacterLine(_currentChar.name, "Output");
        if (line) return line.text;
        return "After you execute something, results show up here. The Output tab shows what Velocity got back, success messages, print output, or errors. The Console tab watches Roblox's own output log. Cmd+` toggles the panel open and closed. The trash icon clears it.";
      },
    },
    {
      view: "explorer",
      label: "Output — Reading Errors",
      selector: "#bottomPanel",
      padding: 2,
      text: "Red output means the script threw a Lua error. Usually something like 'attempt to index nil value', which is the script's fault, not Velocity's. The message and line number tell you what went wrong. Green means it ran fine.",
    },
    {
      view: "explorer",
      label: "Status Bar",
      selector: ".status-bar",
      padding: 0,
      text: "The thin bar at the very bottom. The left side shows connection status. 'No server' means no executor found yet, a port number means you're connected. The right side shows cursor position, language mode, and file encoding.",
    },
    {
      checkpoint: "Search",
      view: "search",
      label: "Search — Overview",
      selector: "#sidebar",
      padding: 3,
      text: "The Search view searches across every file in your workspace at once. Type in the box and results come back grouped by file. Click any result to jump straight to that line in the editor.",
    },
    {
      view: "search",
      label: "Search — Options",
      selector: "#searchView",
      padding: 4,
      text: "The three buttons next to the search box add filters. Aa matches case exactly. Underlined ab matches whole words only. .* switches to regex mode. Alt+C, Alt+W, and Alt+R toggle each one from the keyboard.",
    },
    {
      view: "search",
      label: "Search — Include / Exclude",
      selector: "#searchView",
      padding: 4,
      text: "The include and exclude fields let you narrow which files get searched. Include takes globs like *.lua to only hit Lua files. Exclude takes patterns like dist/** to skip certain folders. Separate multiple patterns with commas.",
    },
    {
      checkpoint: "Autoexecute",
      view: "autoexec",
      label: "Autoexecute — Overview",
      selector: "#autoexecView",
      padding: 0,
      text: () => {
        const line = _getCharacterLine(_currentChar.name, "Autoexecute");
        if (line) return line.text;
        return "Autoexecute runs scripts automatically every time Roblox launches. The scripts live in ~/Hydrogen/autoexecute on your machine. The left panel is your list of scripts, the right panel is an editor for whichever one you've got selected.";
      },
    },
    {
      view: "autoexec",
      label: "Autoexecute — Enable Toggle",
      selector: "#autoexecView",
      padding: 0,
      text: "The toggle at the top turns the whole feature on or off. When it's off, nothing runs on startup. Individual scripts have their own toggles too, so you can disable one without deleting it.",
    },
    {
      view: "autoexec",
      label: "Autoexecute — Managing Scripts",
      selector: "#autoexecView",
      padding: 0,
      text: "Click the plus to create a new script. Click any script in the list to open it in the editor. Hover a script to see rename and delete buttons. These are plain .lua files, you can also drop them directly into ~/Hydrogen/autoexecute in Finder.",
    },
    {
      checkpoint: "Pinboard",
      view: "pinboard",
      label: "Pinboard — Overview",
      selector: "#pinboardView",
      padding: 0,
      text: "The Pinboard is a flat collection of saved script cards. No folders, no file tree, just cards you can fire off instantly. Each card holds a name, optional tags, the code, and a counter of how many times you've run it.",
    },
    {
      view: "pinboard",
      label: "Pinboard — Running Scripts",
      selector: "#pinboardView",
      padding: 0,
      text: "Each card has a Run button. Click it to execute that script right away. There's also an Open in Editor button if you want to read or tweak it in the main editor before running.",
    },
    {
      view: "pinboard",
      label: "Pinboard — Adding Scripts",
      selector: "#pinboardView",
      padding: 0,
      text: "The plus button creates a blank card. The pin icon takes whatever you have open in the main editor and saves it as a new card right away. You can drag cards around to reorder them.",
    },
    {
      view: "pinboard",
      label: "Pinboard — Sorting & Search",
      selector: "#pinboardView",
      padding: 0,
      text: "The sort icon cycles through four modes: manual which keeps your drag order, name for alphabetical, runs for most executed first, and recent for last run first. The search bar filters cards by name, code, or tag as you type.",
    },
    {
      view: "pinboard",
      label: "Pinboard — Tags",
      selector: "#pinboardView",
      padding: 0,
      text: "Cards can have freeform tags like 'movement' or 'blox-fruits'. Click a tag to filter the whole board by it. Handy once you've got a lot of scripts and need to find things fast.",
    },
    {
      checkpoint: "Cloud Scripts",
      view: "cloud",
      label: "Cloud Scripts — Overview",
      selector: "#cloudView",
      padding: 0,
      text: "Cloud Scripts pulls scripts from public hubs and shows them as cards. Browse without leaving the app, then load a script into the editor or run it right away. Everything is fetched live.",
    },
    {
      view: "cloud",
      label: "Cloud Scripts — Browsing",
      selector: "#cloudView",
      padding: 0,
      text: "Recent shows newly uploaded scripts. Trending shows what's popular right now. The search bar finds scripts by name or game. Results are paginated, use the arrows at the bottom to go through pages.",
    },
    {
      view: "cloud",
      label: "Cloud Scripts — Badges",
      selector: "#cloudView",
      padding: 0,
      text: "Verified means it's been reviewed and confirmed working. Universal means it works in any game. Key means you have to get through a key system before it runs. Patched means Roblox has blocked it. Check badges before running anything.",
    },
    {
      view: "cloud",
      label: "Cloud Scripts — Filters",
      selector: "#cloudView",
      padding: 0,
      text: "The filter icon opens a tag bar. You can filter to only Verified scripts, only Universal scripts, only scripts without a key system, or only unpatched ones. Filters stack, so combine them however you want.",
    },
    {
      view: "cloud",
      label: "Cloud Scripts — Using a Script",
      selector: "#cloudView",
      padding: 0,
      text: "Each card has two buttons. The copy icon opens the script in your editor as a new file, good for reading or editing it first. The play icon executes it immediately without touching the editor. You need a workspace folder open to use the copy button.",
    },
    {
      checkpoint: "Settings",
      view: "settings",
      label: "Settings — Appearance",
      selector: "#sp-appearance",
      padding: 8,
      text: () => {
        const line = _getCharacterLine(_currentChar.name, "Settings");
        if (line) return line.text;
        return "The theme grid shows every available color theme. Click one to apply it instantly. Themes change the whole interface, backgrounds, syntax colors, accents, all of it. Saves automatically.";
      },
    },
    {
      view: "settings",
      label: "Settings — Editor",
      selector: "#sp-editor",
      padding: 8,
      text: "Font Size changes the editor text size. Word Wrap toggles line wrapping. Minimap toggles the small code overview on the right edge. Line Numbers toggles the gutter on the left. Everything saves automatically.",
    },
    {
      view: "settings",
      label: "Settings — Folder",
      selector: "#sp-folder",
      padding: 8,
      text: "Shows your current workspace folder path. Open Folder lets you switch to a different one. Velocity remembers the last folder you had open and brings it back on next launch.",
    },
    {
      view: "settings",
      label: "Settings — Icon Themes",
      selector: "#sp-icons",
      padding: 8,
      text: "Icon themes change the file icons in the Explorer tree. Different packs have different styles. Click one to apply. Purely cosmetic.",
    },
    {
      view: "settings",
      label: "Settings — Shortcuts",
      selector: "#sp-shortcuts",
      padding: 8,
      text: "A reference card for every keyboard shortcut. Cmd+S saves. Cmd+N opens a new file. Cmd+W closes the tab. Cmd+Enter executes. Cmd+` toggles the output panel. Cmd+Shift+F opens search. Cmd+Shift+E goes to explorer. Cmd+Shift+O opens a folder. Cmd+Shift+R refreshes the tree.",
    },
    {
      checkpoint: "Done",
      view: "explorer",
      label: "Done",
      selector: null,
      padding: 0,
      text: () => {
        const line = _getCharacterLine(_currentChar.name, "Done");
        if (line) return line.text;
        return "That's the whole app. The basic flow is: open or paste a script, click Execute, it runs in Roblox. Everything else builds on top of that. Hit the question mark in the activity bar any time to run through this again.";
      },
    },
  ];
  const CHECKPOINTS = STEPS.reduce((acc, step, i) => {
    if (step.checkpoint)
      acc.push({
        index: i,
        label: step.checkpoint,
      });
    return acc;
  }, []);
  let _overlay = null;
  let _dimTop = null,
    _dimBottom = null,
    _dimLeft = null,
    _dimRight = null;
  let _spotlight = null;
  let _textEl = null,
    _labelEl = null,
    _dotStrip = null;
  let _charImg = null,
    _appEl = null,
    _fabWrap = null,
    _barEl = null;
  let _currentStep = 0;
  let _currentChar = {
    url: "",
    name: "",
  };
  let _typing = false,
    _typeTimeout = null;
  let _active = false;
  let _prevSize = null,
    _prevView = null,
    _panelWasVisible = false;
  let _barDrag = {
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  };
  let _spotCur = {
    t: 0,
    l: 0,
    w: 0,
    h: 0,
    on: false,
  };
  let _spotTgt = {
    t: 0,
    l: 0,
    w: 0,
    h: 0,
    on: false,
  };
  let _rafId = null;
  function _lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function _applyDims(t, l, w, h, on) {
    const W = window.innerWidth;
    const H = window.innerHeight - BAR_H;
    if (!on) {
      _dimTop.style.cssText = `top:0;left:0;right:0;height:${H}px`;
      _dimBottom.style.cssText = `top:${H}px;left:0;right:0;height:0`;
      _dimLeft.style.cssText = `top:0;left:0;width:0;height:${H}px`;
      _dimRight.style.cssText = `top:0;right:0;width:0;height:${H}px`;
      return;
    }
    _dimTop.style.cssText = `top:0;left:0;right:0;height:${t}px`;
    _dimBottom.style.cssText = `top:${t + h}px;left:0;right:0;bottom:0`;
    _dimLeft.style.cssText = `top:${t}px;left:0;width:${l}px;height:${h}px`;
    _dimRight.style.cssText = `top:${t}px;left:${l + w}px;right:0;height:${h}px`;
    _spotlight.style.top = t + "px";
    _spotlight.style.left = l + "px";
    _spotlight.style.width = w + "px";
    _spotlight.style.height = h + "px";
  }
  function _animateSpot() {
    const S = 0.18;
    _spotCur.t = _lerp(_spotCur.t, _spotTgt.t, S);
    _spotCur.l = _lerp(_spotCur.l, _spotTgt.l, S);
    _spotCur.w = _lerp(_spotCur.w, _spotTgt.w, S);
    _spotCur.h = _lerp(_spotCur.h, _spotTgt.h, S);
    if (
      Math.abs(_spotCur.t - _spotTgt.t) < 0.3 &&
      Math.abs(_spotCur.l - _spotTgt.l) < 0.3 &&
      Math.abs(_spotCur.w - _spotTgt.w) < 0.3 &&
      Math.abs(_spotCur.h - _spotTgt.h) < 0.3
    ) {
      _spotCur.t = _spotTgt.t;
      _spotCur.l = _spotTgt.l;
      _spotCur.w = _spotTgt.w;
      _spotCur.h = _spotTgt.h;
    }
    _applyDims(_spotCur.t, _spotCur.l, _spotCur.w, _spotCur.h, _spotTgt.on);
    _rafId = requestAnimationFrame(_animateSpot);
  }
  function _getRect(selector, padding) {
    if (!selector) return null;
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = padding || 0;
    return {
      top: r.top - p,
      left: r.left - p,
      width: r.width + p * 2,
      height: r.height + p * 2,
    };
  }
  function _setTarget(rect) {
    if (!rect) {
      _spotTgt.on = false;
      _spotlight.classList.remove("visible");
      return;
    }
    _spotTgt.on = true;
    _spotTgt.t = rect.top;
    _spotTgt.l = rect.left;
    _spotTgt.w = rect.width;
    _spotTgt.h = rect.height;
    _spotlight.classList.add("visible");
  }
  function _switchView(view) {
    const btn = document.querySelector(`.activity-btn[data-view="${view}"]`);
    if (btn) btn.click();
  }
  function _ensurePanelVisible(selector) {
    if (!selector || selector.startsWith(".")) return;
    const el = document.querySelector(selector);
    if (!el) return;
    if (!el.classList.contains("visible")) {
      el.classList.add("visible");
      el.classList.remove("hidden");
    }
  }
  function _typeText(text) {
    clearTimeout(_typeTimeout);
    _typing = true;
    _textEl.textContent = "";
    const cursor = document.createElement("span");
    cursor.className = "guide-cursor";
    _textEl.appendChild(cursor);
    let i = 0;
    function tick() {
      if (i < text.length) {
        cursor.insertAdjacentText("beforebegin", text[i++]);
        _typeTimeout = setTimeout(tick, 13);
      } else {
        _typing = false;
      }
    }
    tick();
  }
  function _skipTyping() {
    if (!_typing) return false;
    clearTimeout(_typeTimeout);
    _typing = false;
    const step = STEPS[_currentStep];
    _textEl.textContent =
      typeof step.text === "function" ? step.text() : step.text;
    const cursor = document.createElement("span");
    cursor.className = "guide-cursor";
    _textEl.appendChild(cursor);
    return true;
  }
  function _updateDotStrip() {
    if (!_dotStrip) return;
    _dotStrip.querySelectorAll(".guide-dot").forEach((dot) => {
      const idx = parseInt(dot.dataset.index);
      dot.classList.toggle("guide-dot--active", idx === _currentStep);
      dot.classList.toggle("guide-dot--past", idx < _currentStep);
    });
  }
  function _buildDotStrip() {
    const strip = document.createElement("div");
    strip.className = "guide-dot-strip";
    _dotStrip = strip;
    let _dotDrag = false;
    const _dotFromX = (clientX) => {
      const dots = Array.from(strip.querySelectorAll(".guide-dot"));
      let closest = 0,
        closestDist = Infinity;
      dots.forEach((dot, i) => {
        const r = dot.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const dist = Math.abs(clientX - cx);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      return closest;
    };
    const _dotMouseDown = (e) => {
      if (e.button !== 0) return;
      _dotDrag = true;
      _goToStep(_dotFromX(e.clientX));
      e.preventDefault();
    };
    const _dotMouseMove = (e) => {
      if (!_dotDrag) return;
      _goToStep(_dotFromX(e.clientX));
    };
    const _dotMouseUp = () => {
      _dotDrag = false;
    };
    strip.addEventListener("mousedown", _dotMouseDown);
    document.addEventListener("mousemove", _dotMouseMove);
    document.addEventListener("mouseup", _dotMouseUp);
    _boundListeners.dotMouseMove = _dotMouseMove;
    _boundListeners.dotMouseUp = _dotMouseUp;
    STEPS.forEach((step, i) => {
      const dot = document.createElement("button");
      dot.className =
        "guide-dot" + (step.checkpoint ? " guide-dot--checkpoint" : "");
      dot.dataset.index = i;
      dot.title = step.label;
      dot.addEventListener("click", () => _goToStep(i));
      strip.appendChild(dot);
    });
    return strip;
  }
  function _onBarDragStart(e) {
    if (e.button !== 0) return;
    if (e.target.closest("button, input, select")) return;
    const rect = _barEl.getBoundingClientRect();
    if (!_barEl.classList.contains("guide-bar--floating")) {
      _barEl.classList.add("guide-bar--floating");
      _barEl.style.left = rect.left + "px";
      _barEl.style.top = rect.top + "px";
      _barEl.style.width = rect.width + "px";
      _barEl.style.bottom = "";
      _barEl.style.right = "";
    }
    _barDrag.active = true;
    _barDrag.startX = e.clientX;
    _barDrag.startY = e.clientY;
    _barDrag.startLeft = rect.left;
    _barDrag.startTop = rect.top;
    _barEl.classList.add("guide-bar--dragging");
    e.preventDefault();
  }
  function _onBarDragMove(e) {
    if (!_barDrag.active || !_barEl) return;
    const dx = e.clientX - _barDrag.startX;
    const dy = e.clientY - _barDrag.startY;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const bw = _barEl.offsetWidth;
    const bh = _barEl.offsetHeight;
    const left = Math.max(0, Math.min(W - bw, _barDrag.startLeft + dx));
    const top = Math.max(0, Math.min(H - bh, _barDrag.startTop + dy));
    _barEl.style.left = left + "px";
    _barEl.style.top = top + "px";
  }
  function _onBarDragEnd() {
    if (!_barDrag.active) return;
    _barDrag.active = false;
    _barEl && _barEl.classList.remove("guide-bar--dragging");
  }
  function _applyCharacterImage(step) {
    if (!_charImg) return;
    const checkpointLine =
      step && step.checkpoint
        ? _getCharacterLine(_currentChar.name, step.checkpoint)
        : null;
    if (checkpointLine && checkpointLine.image) {
      const match = _characterPool.find((c) => c.name === _currentChar.name);
      _charImg.src = match ? match.url : _currentChar.url;
    } else {
      _charImg.src = _currentChar.url;
    }
  }
  function _goToStep(index) {
    clearTimeout(_typeTimeout);
    _typing = false;
    _currentStep = Math.max(0, Math.min(STEPS.length - 1, index));
    const step = STEPS[_currentStep];
    _applyCharacterImage(step);
    if (step.view) _switchView(step.view);
    _ensurePanelVisible(step.selector);
    requestAnimationFrame(() => {
      _labelEl.textContent = `${_currentStep + 1} / ${STEPS.length}  —  ${step.label}`;
      _updateDotStrip();
      _setTarget(_getRect(step.selector, step.padding));
      _charImg.classList.remove("bounce");
      void _charImg.offsetWidth;
      _charImg.classList.add("bounce");
      _textEl.textContent = "";
      const text = typeof step.text === "function" ? step.text() : step.text;
      _typeText(text);
    });
  }
  function _prevStep() {
    if (_currentStep > 0) _goToStep(_currentStep - 1);
  }
  function _nextStep() {
    if (_currentStep < STEPS.length - 1) _goToStep(_currentStep + 1);
    else stop();
  }
  function _onKey(e) {
    if (!_active) return;
    if (e.key === "Escape") {
      stop();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      _prevStep();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      _nextStep();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (_skipTyping()) return;
      _nextStep();
    }
  }
  function _onResize() {
    if (!_active) return;
    const step = STEPS[_currentStep];
    const rect = _getRect(step.selector, step.padding);
    if (rect) {
      _spotTgt.t = rect.top;
      _spotTgt.l = rect.left;
      _spotTgt.w = rect.width;
      _spotTgt.h = rect.height;
      _spotCur.t = rect.top;
      _spotCur.l = rect.left;
      _spotCur.w = rect.width;
      _spotCur.h = rect.height;
      _applyDims(_spotCur.t, _spotCur.l, _spotCur.w, _spotCur.h, _spotTgt.on);
    }
  }
  async function start() {
    if (_active) return;
    _active = true;
    _boundListeners = {};
    keyboardManager.pause();
    _prevView =
      document.querySelector(".activity-btn.active")?.dataset.view ??
      "explorer";
    const panel = document.getElementById("bottomPanel");
    _panelWasVisible = panel ? panel.classList.contains("visible") : false;
    await _loadCharacters();
    try {
      const win = window.__TAURI__.window.getCurrentWindow();
      await win.setFocus();
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
    _appEl = document.querySelector(".app");
    if (_appEl) _appEl.classList.add("guide-active");
    _fabWrap = document.getElementById("fabWrap");
    if (_fabWrap) _fabWrap.classList.add("guide-active");
    _overlay = document.createElement("div");
    _overlay.className = "guide-overlay guide-entering";
    _overlay.tabIndex = -1;
    const mask = document.createElement("div");
    mask.className = "guide-mask";
    _dimTop = document.createElement("div");
    _dimTop.className = "guide-dim";
    _dimBottom = document.createElement("div");
    _dimBottom.className = "guide-dim";
    _dimLeft = document.createElement("div");
    _dimLeft.className = "guide-dim";
    _dimRight = document.createElement("div");
    _dimRight.className = "guide-dim";
    mask.appendChild(_dimTop);
    mask.appendChild(_dimBottom);
    mask.appendChild(_dimLeft);
    mask.appendChild(_dimRight);
    _overlay.appendChild(mask);
    _spotlight = document.createElement("div");
    _spotlight.className = "guide-spotlight";
    _overlay.appendChild(_spotlight);
    const bar = document.createElement("div");
    bar.className = "guide-bar";
    _barEl = bar;
    const charWrap = document.createElement("div");
    charWrap.className = "guide-character";
    charWrap.addEventListener("mousedown", _onBarDragStart);
    _currentChar = _pickCharacter();
    _charImg = document.createElement("img");
    _charImg.src = _currentChar.url;
    _charImg.alt = _currentChar.name;
    _charImg.draggable = false;
    charWrap.appendChild(_charImg);
    bar.appendChild(charWrap);
    const sep = document.createElement("div");
    sep.className = "guide-sep";
    bar.appendChild(sep);
    const dialogue = document.createElement("div");
    dialogue.className = "guide-dialogue";
    _labelEl = document.createElement("div");
    _labelEl.className = "guide-step-label";
    dialogue.appendChild(_labelEl);
    _textEl = document.createElement("div");
    _textEl.className = "guide-text";
    dialogue.appendChild(_textEl);
    const footer = document.createElement("div");
    footer.className = "guide-footer";
    const navLeft = document.createElement("button");
    navLeft.className = "guide-nav-btn";
    navLeft.innerHTML = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5,1.5 3,5 6.5,8.5"/></svg>`;
    navLeft.title = "Previous (←)";
    navLeft.addEventListener("click", _prevStep);
    const dotStrip = _buildDotStrip();
    const navRight = document.createElement("button");
    navRight.className = "guide-nav-btn";
    navRight.innerHTML = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5,1.5 7,5 3.5,8.5"/></svg>`;
    navRight.title = "Next (→)";
    navRight.addEventListener("click", () => {
      if (_skipTyping()) return;
      _nextStep();
    });
    footer.appendChild(navLeft);
    footer.appendChild(dotStrip);
    footer.appendChild(navRight);
    dialogue.appendChild(footer);
    bar.appendChild(dialogue);
    const closeBtn = document.createElement("button");
    closeBtn.className = "guide-close";
    closeBtn.innerHTML = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5"/></svg>Exit`;
    closeBtn.addEventListener("click", stop);
    bar.appendChild(closeBtn);
    _overlay.appendChild(bar);
    document.body.appendChild(_overlay);
    _overlay.focus({
      preventScroll: true,
    });
    const W = window.innerWidth,
      H = window.innerHeight - BAR_H;
    _spotCur = {
      t: H / 2,
      l: W / 2,
      w: 0,
      h: 0,
      on: false,
    };
    _spotTgt = {
      t: H / 2,
      l: W / 2,
      w: 0,
      h: 0,
      on: false,
    };
    _applyDims(H / 2, W / 2, 0, 0, false);
    _rafId = requestAnimationFrame(_animateSpot);
    setTimeout(
      () => _overlay && _overlay.classList.remove("guide-entering"),
      300,
    );
    _boundListeners.onKey = _onKey.bind(null);
    _boundListeners.onBarDragMove = _onBarDragMove.bind(null);
    _boundListeners.onBarDragEnd = _onBarDragEnd.bind(null);
    _boundListeners.onResize = _onResize.bind(null);
    document.addEventListener("keydown", _boundListeners.onKey);
    document.addEventListener("mousemove", _boundListeners.onBarDragMove);
    document.addEventListener("mouseup", _boundListeners.onBarDragEnd);
    window.addEventListener("resize", _boundListeners.onResize);
    _goToStep(0);
  }
  async function stop() {
    if (!_active) return;
    _active = false;
    clearTimeout(_typeTimeout);
    _typing = false;
    cancelAnimationFrame(_rafId);
    keyboardManager.resume();
    document.removeEventListener("keydown", _boundListeners.onKey);
    document.removeEventListener("mousemove", _boundListeners.onBarDragMove);
    document.removeEventListener("mouseup", _boundListeners.onBarDragEnd);
    window.removeEventListener("resize", _boundListeners.onResize);
    if (_boundListeners.dotMouseMove) {
      document.removeEventListener("mousemove", _boundListeners.dotMouseMove);
    }
    if (_boundListeners.dotMouseUp) {
      document.removeEventListener("mouseup", _boundListeners.dotMouseUp);
    }
    if (_appEl) {
      _appEl.classList.remove("guide-active");
      _appEl = null;
    }
    if (_fabWrap) {
      _fabWrap.classList.remove("guide-active");
      _fabWrap = null;
    }
    _barEl = null;
    _dotStrip = null;
    _boundListeners = {};
    if (_prevView) _switchView(_prevView);
    const panel = document.getElementById("bottomPanel");
    if (panel && !_panelWasVisible) {
      panel.classList.remove("visible");
      panel.classList.add("hidden");
    }
    if (_overlay) {
      _overlay.classList.add("guide-leaving");
      setTimeout(() => {
        _overlay && _overlay.remove();
        _overlay = null;
      }, 260);
    }
    try {
      const win = window.__TAURI__.window.getCurrentWindow();
      await win.setFocus();
    } catch {}
    _prevSize = null;
  }
  return {
    start,
    stop,
  };
})();
