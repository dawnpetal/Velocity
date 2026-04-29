const menuScriptsPanel = (() => {
  let _scripts = [];
  let _editingIdx = null;
  const _el = (id) => document.getElementById(id);
  function _render() {
    const list = _el('msp-list');
    if (!list) return;
    list.innerHTML = '';
    _scripts.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'msp-row';
      row.innerHTML = `
        <div class="msp-row-left">
          <span class="msp-row-name">${helpers.escapeHtml(s.name)}</span>
        </div>
        <div class="msp-row-actions">
          <button class="msp-row-btn" data-a="edit" data-i="${i}" title="Edit">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-9 9H2.5v-2l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          </button>
          <button class="msp-row-btn danger" data-a="del" data-i="${i}" title="Delete">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4H5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          </button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.msp-row-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(b.dataset.i);
        b.dataset.a === 'edit' ? _openEditor(i) : _delete(i);
      });
    });
  }
  function _showEditor(visible) {
    const ed = _el('msp-editor');
    const add = _el('msp-topbar-add');
    if (ed) ed.style.display = visible ? 'flex' : 'none';
    if (add) add.style.display = visible ? 'none' : '';
  }
  function _openEditor(idx = null) {
    _editingIdx = idx;
    _el('msp-editor-title').textContent = idx !== null ? 'Edit script' : 'New script';
    const s = idx !== null ? _scripts[idx] : null;
    _el('msp-name-input').value = s?.name ?? '';
    _el('msp-content-input').value = s?.content ?? '';
    _showEditor(true);
    _el('msp-name-input').focus();
  }
  function _closeEditor() {
    _editingIdx = null;
    _recording = false;
    _showEditor(false);
  }
  async function _save() {
    const name = _el('msp-name-input').value.trim();
    const content = _el('msp-content-input').value.trim();
    if (!name) return toast.show('Script needs a name', 'warn', 2000);
    if (!content) return toast.show('Content is empty', 'warn', 2000);
    const entry = {
      name,
      content,
    };
    _editingIdx !== null ? (_scripts[_editingIdx] = entry) : _scripts.push(entry);
    _closeEditor();
    _render();
    await menuBar.saveScripts(_scripts);
    toast.show('Saved', 'ok', 1200);
  }
  async function _delete(idx) {
    const ok = await modal.confirm('Delete script', `Remove "${_scripts[idx]?.name}"?`);
    if (!ok) return;
    _scripts.splice(idx, 1);
    _render();
    await menuBar.saveScripts(_scripts);
    toast.show('Deleted', 'ok', 1200);
  }
  async function show() {
    const list = _el('msp-list');
    _scripts = await menuBar.loadScripts();
    _render();
    _showEditor(false);
  }
  function mount() {
    _el('msp-topbar-add')?.addEventListener('click', () => _openEditor(null));
    _el('msp-editor-save')?.addEventListener('click', _save);
    _el('msp-editor-close')?.addEventListener('click', _closeEditor);
    _el('msp-editor-close-btn')?.addEventListener('click', _closeEditor);
  }
  return {
    show,
    mount,
  };
})();
