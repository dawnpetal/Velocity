const console_ = (() => {
  const outputEl = () => document.getElementById("consoleOutput");
  const robloxOutputEl = () => document.getElementById("robloxOutput");
  const panelEl = () => document.getElementById("bottomPanel");
  const MAX_LINES = 500;
  function _trimOutput(output) {
    while (output.childElementCount > MAX_LINES) output.firstChild.remove();
  }
  function _showPanel() {
    const panel = panelEl();
    if (!panel) return;
    panel.classList.remove("hidden");
    panel.classList.add("visible");
  }
  let _monitoring = false;
  let _pollTimer = null;
  let _lastLogSize = 0;
  let _logPath = null;
  const LOG_RE = /\[(FLog::(Output|Warning|Error))\] (.+)$/;
  const TYPE_MAP = {
    Output: "rbx",
    Warning: "warn",
    Error: "fail",
  };
  function _parseRichText(raw) {
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "\x00LT\x00")
      .replace(/>/g, "\x00GT\x00")
      .replace(/\x00LT\x00(\/?( b|i|u|s))\x00GT\x00/gi, "<$1>")
      .replace(
        /\x00LT\x00font\s+color="(#[0-9a-fA-F]{3,8}|rgb\(\d+,\s*\d+,\s*\d+\)|[a-zA-Z]+)"(?:\s+size="\d+")?(?:\s*\/)?\x00GT\x00/gi,
        (_, c) => `<span style="color:${c}">`,
      )
      .replace(/\x00LT\x00\/font\x00GT\x00/gi, "</span>")
      .replace(/\x00LT\x00[^]*?\x00GT\x00/g, "")
      .replace(/\x00LT\x00/g, "&lt;")
      .replace(/\x00GT\x00/g, "&gt;");
  }
  function _parseLine(line) {
    const m = line.match(LOG_RE);
    if (!m) return null;
    const [, channel, level, message] = m;
    const time = line.slice(11, 19);
    let type = TYPE_MAP[level];
    if (type === "rbx" && message.startsWith("Info:")) type = "info";
    return { time, type, channel, message };
  }
  function _appendLine(output, text, type) {
    if (!output) return;
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    line.innerHTML = `<span class="log-ts">${helpers.timestamp()}</span><span class="log-text">${helpers.escapeHtml(String(text))}</span>`;
    output.appendChild(line);
    _trimOutput(output);
    output.scrollTop = output.scrollHeight;
  }
  function _appendRobloxLine({ time, type, channel, message }) {
    const output = robloxOutputEl();
    if (!output) return;
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    const ts = document.createElement("span");
    ts.className = "log-ts";
    ts.textContent = time;
    const tag = document.createElement("span");
    tag.className = "log-channel";
    tag.textContent = channel.replace("FLog::", "");
    const msg = document.createElement("span");
    msg.className = "log-text";
    msg.innerHTML = _parseRichText(message);
    line.append(ts, tag, msg);
    output.appendChild(line);
    _trimOutput(output);
    output.scrollTop = output.scrollHeight;
    _showPanel();
  }
  function _appendOutputError(type, headerText, stackLines) {
    const output = outputEl();
    if (!output) return;
    const header = document.createElement("div");
    header.className = `log-line ${type}`;
    header.innerHTML = `<span class="log-ts">${helpers.timestamp()}</span><span class="log-text">${helpers.escapeHtml(headerText)}</span>`;
    output.appendChild(header);
    for (const sl of stackLines) {
      const row = document.createElement("div");
      row.className = "log-line log-stack";
      row.innerHTML = `<span class="log-ts"></span><span class="log-text">${helpers.escapeHtml(sl)}</span>`;
      output.appendChild(row);
    }
    output.scrollTop = output.scrollHeight;
    _showPanel();
  }
  function log(text, type = "info") {
    _appendLine(outputEl(), text, type);
    _showPanel();
  }
  function robloxLog(text, type = "rbx") {
    _appendLine(robloxOutputEl(), text, type);
    _showPanel();
  }
  let _errorScanTimer = null;
  const _seenErrors = new Map();
  function _pruneSeenErrors() {
    const now = Date.now();
    for (const [key, ts] of _seenErrors) {
      if (now - ts > 10000) _seenErrors.delete(key);
    }
  }
  async function startErrorWatch() {
    clearTimeout(_errorScanTimer);
    _errorScanTimer = null;
    let watchPath = _logPath;
    if (!watchPath) {
      try { watchPath = await _findLatestLog(); } catch {}
    }
    if (!watchPath) return;
    let base = _lastLogSize;
    if (!base) {
      try {
        const initial = await window.__TAURI__.core.invoke("read_text_file", { path: watchPath });
        base = initial.length;
      } catch {}
    }
    const POLL_MS = 300;
    const deadline = Date.now() + 3000;
    async function poll() {
      try {
        const content = await window.__TAURI__.core.invoke("read_text_file", { path: watchPath });
        const newText = content.slice(base);
        if (newText) { base += newText.length; _scanForErrors(newText); }
      } catch {}
      if (Date.now() < deadline) _errorScanTimer = setTimeout(poll, POLL_MS);
    }
    _errorScanTimer = setTimeout(poll, POLL_MS);
  }
  function _scanForErrors(text) {
    _pruneSeenErrors();
    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(LOG_RE);
      if (m && m[2] === "Error") {
        const message = m[3];
        const stack = [];
        let j = i + 1;
        while (j < lines.length) {
          const next = lines[j];
          if (!next.trim() || /^\d{4}-\d{2}-\d{2}T/.test(next)) break;
          if (next.includes("Stack Begin") || next.includes("Stack End")) {
            j++;
            continue;
          }
          stack.push(next.trim());
          j++;
        }
        if (stack.length > 0) {
          const key = `fail:${message}`;
          if (!_seenErrors.has(key)) {
            _seenErrors.set(key, Date.now());
            _appendOutputError("fail", message, stack);
          }
        }
        i = j;
      } else {
        i++;
      }
    }
  }
  async function _findLatestLog() {
    const home = paths.home;
    const candidates = [
      `${home}/Library/Logs/Roblox`,
      `${home}/Library/Logs/Roblox Player`,
    ];
    for (const logDir of candidates) {
      try {
        const entries = await window.__TAURI__.core.invoke("read_dir", { path: logDir });
        const logs = entries
          .filter(
            (e) =>
              e.type === "FILE" &&
              (e.entry.endsWith(".log") || e.entry.includes("Log")),
          )
          .sort((a, b) => {
            const tsRe = /(\d{8}T\d{6}Z)/;
            const tsA = a.entry.match(tsRe)?.[1] ?? a.entry;
            const tsB = b.entry.match(tsRe)?.[1] ?? b.entry;
            return tsB.localeCompare(tsA);
          });
        if (logs.length) return `${logDir}/${logs[0].entry}`;
      } catch (err) {
        robloxLog(
          `[Velocity] Could not read directory "${logDir}": ${err.message ?? err}`,
          "warn",
        );
      }
    }
    return null;
  }
  function _updateControls() {
    const start = document.getElementById("btnRbxStart");
    const stop = document.getElementById("btnRbxStop");
    if (start) start.disabled = _monitoring;
    if (stop) stop.disabled = !_monitoring;
  }
  async function startMonitoring() {
    if (_monitoring) return;
    _monitoring = true;
    _lastLogSize = 0;
    _showPanel();
    const robloxTab = document.querySelector('.panel-tab[data-panel="roblox"]');
    if (robloxTab && !robloxTab.classList.contains("active")) robloxTab.click();
    robloxLog("[Velocity] Searching for Roblox log file...", "info");
    try {
      _logPath = await _findLatestLog();
    } catch (err) {
      robloxLog(
        `[Velocity] Unexpected error scanning logs: ${err.message ?? err}`,
        "fail",
      );
      toast.show("Failed to scan log directories", "fail", 4000);
      _monitoring = false;
      _updateControls();
      return;
    }
    if (!_logPath) {
      robloxLog(
        "[Velocity] No Roblox log found. Expected: ~/Library/Logs/Roblox/",
        "warn",
      );
      robloxLog(
        "[Velocity] Make sure Roblox is running and try again.",
        "warn",
      );
      toast.show("No Roblox log found", "warn", 4000);
      _monitoring = false;
      _updateControls();
      return;
    }
    try {
      const initial = await window.__TAURI__.core.invoke("read_text_file", { path: _logPath });
      _lastLogSize = initial.length;
    } catch {
      _lastLogSize = 0;
    }
    robloxLog(`[Velocity] Watching: ${_logPath.split("/").pop()}`, "info");
    toast.show("Monitoring started", "ok", 2000);
    _updateControls();
    _pollTimer = setInterval(async () => {
      try {
        const content = await window.__TAURI__.core.invoke("read_text_file", { path: _logPath });
        if (content.length <= _lastLogSize) return;
        const newContent = content.slice(_lastLogSize);
        _lastLogSize = content.length;
        newContent
          .split("\n")
          .filter((l) => l.trim())
          .forEach((line) => {
            const parsed = _parseLine(line);
            if (parsed) _appendRobloxLine(parsed);
          });
      } catch (err) {
        robloxLog(`[Velocity] Polling error: ${err.message ?? err}`, "fail");
        toast.show("Log monitoring stopped unexpectedly", "fail", 4000);
        stopMonitoring();
      }
    }, 500);
  }
  function stopMonitoring() {
    clearInterval(_pollTimer);
    _pollTimer = null;
    clearTimeout(_errorScanTimer);
    _errorScanTimer = null;
    _monitoring = false;
    _logPath = null;
    _lastLogSize = 0;
    _updateControls();
  }
  return {
    log,
    robloxLog,
    startMonitoring,
    stopMonitoring,
    startErrorWatch,
  };
})();
document.addEventListener("DOMContentLoaded", async () => {
  RobloxAPI.init();
  appController.init();
  eventBus.on("script:executed", () => console_.startErrorWatch());
});
