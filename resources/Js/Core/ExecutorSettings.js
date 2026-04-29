const executorSettings = (() => {
  let _statusTimer = null;

  function getActive() {
    return uiState.executor;
  }

  function setActive(value) {
    uiState.setExecutor(value);
    const sel = document.getElementById('executorSelect');
    if (sel && sel.value !== value) sel.value = value;
  }

  async function _refreshStatus() {
    const row = document.getElementById('executorStatusRow');
    const dot = document.getElementById('executorStatusDot');
    const label = document.getElementById('executorStatusLabel');
    if (!row || !dot || !label) return;
    try {
      const status = await window.__TAURI__.core.invoke('get_executor_status');
      row.style.display = 'flex';
      dot.className = `status-dot ${status.isAlive ? 'alive' : 'dead'}`;
      label.textContent = status.isAlive
        ? `${status.displayName} connected`
        : `${status.displayName} not detected`;
    } catch {
      row.style.display = 'none';
    }
  }

  function _startStatusPoll() {
    if (_statusTimer) clearInterval(_statusTimer);
    _refreshStatus();
    _statusTimer = setInterval(_refreshStatus, 5000);
  }

  function init(savedExecutor) {
    uiState.setExecutor(savedExecutor ?? 'opium');
    const sel = document.getElementById('executorSelect');
    if (!sel) return;
    sel.value = uiState.executor;
    _startStatusPoll();
    sel.addEventListener('change', () => {
      const kind = sel.value;
      setActive(kind);
      window.__TAURI__.core.invoke('switch_executor', { kind }).catch(() => {});
      window.__TAURI__.core.invoke('clear_port_cache').catch(() => {});
      window.__TAURI__.event.emit('executor:changed', {}).catch(() => {});
      _refreshStatus();
      if (typeof autoexec !== 'undefined') {
        autoexec.onExecutorChanged().catch(() => {});
      }
    });
  }

  return { init, getActive, setActive };
})();
