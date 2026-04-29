const updateChecker = (() => {
  const invoke = window.__TAURI__.core.invoke;

  function _setStatus(msg, type) {
    const el = document.getElementById('aboutUpdateStatus');
    if (!el) return;
    el.textContent = msg;
    el.dataset.statusType = type || '';
  }

  function _applyInfo(info, showToast = false) {
    if (info.update_available) {
      _setStatus(`v${info.latest} available`, 'update');
      if (showToast && typeof toast !== 'undefined') {
        toast.show(`Update available: v${info.latest}`, 'update', 10000, {
          label: 'View release',
        });
      }
    } else {
      _setStatus(`Up to date (v${info.current})`, 'ok');
    }
  }

  async function _populateVersion() {
    try {
      const v = await invoke('get_app_version');
      const el = document.getElementById('aboutVersion');
      if (el) el.textContent = `v${v}`;
    } catch {}
  }

  async function _run(showFeedback = false) {
    if (showFeedback) _setStatus('Checking...', 'loading');
    try {
      const info = await invoke('check_for_update');
      _applyInfo(info, true);
    } catch {
      if (showFeedback) _setStatus('Could not reach update server', 'error');
    }
  }

  async function check() {
    await _populateVersion();
    const cached = await invoke('get_last_update_result').catch(() => null);
    if (cached) {
      _applyInfo(cached, false);
      return;
    }
    await _run(false);
  }

  async function checkManual() {
    await _run(true);
  }

  const DISCORD_URL = 'https://discord.gg/opiumware';

  eventBus.on('settings:opened', () => {
    _populateVersion();
    invoke('get_last_update_result')
      .then((cached) => {
        if (cached) _applyInfo(cached);
      })
      .catch(() => {});
    const btn = document.getElementById('btnCheckUpdate');
    if (btn && !btn._ucBound) {
      btn._ucBound = true;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await checkManual();
        btn.disabled = false;
      });
    }
    const discordBtn = document.getElementById('btnDiscord');
    if (discordBtn && !discordBtn._ucBound) {
      discordBtn._ucBound = true;
      discordBtn.addEventListener('click', () => {
        invoke('open_external', { url: DISCORD_URL }).catch(() => {});
      });
    }
  });

  return { check, checkManual };
})();
