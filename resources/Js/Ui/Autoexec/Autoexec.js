const autoexec = (() => {
  let _currentFile = null;
  let _enabled = false;
  let _inited = false;
  let _renaming = null;

  const SVG_NEW_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
  const SVG_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
  const SVG_RENAME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const SVG_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  const SVG_SELECT_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;

  function _internalDir() {
    return `${paths.internals}/autoexec_scripts`;
  }

  async function _getInternalDir() {
    const dir = _internalDir();
    try {
      await window.__TAURI__.core.invoke('create_dir', { path: dir });
    } catch {}
    return dir;
  }

  async function _getExecutorDir() {
    return window.__TAURI__.core.invoke('get_executor_autoexec_dir');
  }

  async function _loadMeta() {
    try {
      const raw = await window.__TAURI__.core.invoke('read_text_file', {
        path: `${paths.internals}/autoexec_meta.json`,
      });
      const meta = JSON.parse(raw);
      _enabled = !!meta.enabled;
      _currentFile = meta.file || null;
    } catch {
      _enabled = false;
      _currentFile = null;
    }
  }

  async function _saveMeta() {
    try {
      await window.__TAURI__.core.invoke('write_text_file', {
        path: `${paths.internals}/autoexec_meta.json`,
        content: JSON.stringify({ enabled: _enabled, file: _currentFile }),
      });
    } catch {}
  }

  async function _listInternalFiles() {
    const dir = await _getInternalDir();
    try {
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: dir });
      return entries
        .filter((e) => e.type === 'FILE' && !e.entry.startsWith('.') && e.entry.endsWith('.lua'))
        .sort((a, b) => a.entry.localeCompare(b.entry))
        .map((e) => ({ name: e.entry, path: `${dir}/${e.entry}` }));
    } catch {
      return [];
    }
  }

  async function _sync() {
    const internalDir = await _getInternalDir();
    const executorDir = await _getExecutorDir();

    let internalFiles;
    try {
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: internalDir });
      internalFiles = entries.filter(
        (e) => e.type === 'FILE' && !e.entry.startsWith('.') && e.entry.endsWith('.lua'),
      );
    } catch {
      internalFiles = [];
    }

    if (_enabled) {
      for (const f of internalFiles) {
        try {
          const content = await window.__TAURI__.core.invoke('read_text_file', {
            path: `${internalDir}/${f.entry}`,
          });
          await window.__TAURI__.core.invoke('write_text_file', {
            path: `${executorDir}/${f.entry}`,
            content,
          });
          await window.__TAURI__.core.invoke('remove_path', {
            path: `${internalDir}/${f.entry}`,
          });
        } catch {}
      }
      if (_currentFile) {
        const name = _currentFile.split('/').pop();
        _currentFile = `${executorDir}/${name}`;
        await _saveMeta();
      }
    } else {
      let executorFiles;
      try {
        const entries = await window.__TAURI__.core.invoke('read_dir', { path: executorDir });
        executorFiles = entries.filter(
          (e) => e.type === 'FILE' && !e.entry.startsWith('.') && e.entry.endsWith('.lua'),
        );
      } catch {
        executorFiles = [];
      }

      const internalNames = new Set(internalFiles.map((f) => f.entry));

      for (const f of executorFiles) {
        if (f.entry === 'VelocityUI_multiexec.lua') continue;
        if (internalNames.has(f.entry)) continue;
        try {
          const content = await window.__TAURI__.core.invoke('read_text_file', {
            path: `${executorDir}/${f.entry}`,
          });
          await window.__TAURI__.core.invoke('write_text_file', {
            path: `${internalDir}/${f.entry}`,
            content,
          });
          await window.__TAURI__.core.invoke('remove_path', {
            path: `${executorDir}/${f.entry}`,
          });
        } catch {}
      }
      if (_currentFile) {
        const name = _currentFile.split('/').pop();
        _currentFile = `${internalDir}/${name}`;
        await _saveMeta();
      }
    }
  }

  function _stripLua(name) {
    return name.endsWith('.lua') ? name.slice(0, -4) : name;
  }

  async function _activeDir() {
    return _enabled ? _getExecutorDir() : _getInternalDir();
  }

  async function _listFiles() {
    const dir = await _activeDir();
    try {
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: dir });
      return entries
        .filter(
          (e) =>
            e.type === 'FILE' &&
            !e.entry.startsWith('.') &&
            e.entry.endsWith('.lua') &&
            e.entry !== 'VelocityUI_multiexec.lua',
        )
        .sort((a, b) => a.entry.localeCompare(b.entry))
        .map((e) => ({ name: e.entry, path: `${dir}/${e.entry}` }));
    } catch {
      return [];
    }
  }

  async function _newFile() {
    const dir = await _activeDir();
    const name = await window.__TAURI__.core.invoke('generate_unique_filename', {
      dirPath: dir,
      name: 'Untitled.lua',
      isFolder: false,
    });
    const path = `${dir}/${name}`;
    await window.__TAURI__.core.invoke('write_text_file', { path, content: '' });
    await _selectFile(path);
    await _renderAll();
    toast.show('Created ' + name, 'ok', 1400);
  }

  async function _deleteFile(filePath) {
    const name = filePath.split('/').pop();
    const confirmed = await modal.ask(
      'Delete File',
      `Delete <strong>${helpers.escapeHtml(name)}</strong>? This cannot be undone.`,
      ['Delete', 'Cancel'],
    );
    if (confirmed !== 'Delete') return;
    try {
      await window.__TAURI__.core.invoke('remove_path', { path: filePath });
      if (_currentFile === filePath) {
        _currentFile = null;
        await _saveMeta();
      }
      await _renderAll();
    } catch {
      toast.show('Delete failed', 'fail', 2000);
    }
  }

  async function _startRename(filePath, nameEl) {
    if (_renaming) _renaming = null;
    _renaming = filePath;
    const baseName = _stripLua(filePath.split('/').pop());
    const input = document.createElement('input');
    input.type = 'text';
    input.value = baseName;
    input.style.cssText =
      'flex:1;background:var(--bg4);border:1px solid var(--accent);border-radius:3px;color:var(--text0);font-family:var(--font-mono);font-size:11.5px;padding:1px 4px;outline:none;min-width:0;';
    nameEl.replaceWith(input);
    input.select();
    const commit = async () => {
      if (!_renaming) return;
      _renaming = null;
      const raw = input.value.trim();
      if (!raw) {
        await _renderAll();
        return;
      }
      const newName = raw.replace(/\.lua$/i, '') + '.lua';
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      const newPath = `${dir}/${newName}`;
      if (newPath === filePath) {
        await _renderAll();
        return;
      }
      try {
        const content = await window.__TAURI__.core.invoke('read_text_file', { path: filePath });
        await window.__TAURI__.core.invoke('write_text_file', { path: newPath, content });
        await window.__TAURI__.core.invoke('remove_path', { path: filePath });
        if (_currentFile === filePath) {
          _currentFile = newPath;
          await _saveMeta();
        }
        await _renderAll();
        if (_currentFile === newPath) {
          await AutoexecEditor.loadFile(newPath);
          _renderEditorTitle();
        }
      } catch {
        toast.show('Rename failed', 'fail', 2000);
        await _renderAll();
      }
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        _renaming = null;
        _renderAll();
      }
    });
    input.focus();
  }

  async function _selectFile(filePath) {
    _currentFile = filePath;
    await _saveMeta();
    await AutoexecEditor.loadFile(filePath);
    _renderFileList();
    _renderEditorTitle();
    const editorWrap = document.getElementById('autoexecEditorWrap');
    const editorEmpty = document.getElementById('autoexecEditorEmpty');
    if (editorWrap) editorWrap.style.display = '';
    if (editorEmpty) editorEmpty.style.display = 'none';
  }

  function _renderFileList() {
    const list = document.getElementById('autoexecFileList');
    if (!list) return;
    list.innerHTML = '';
    const files = list._files ?? [];
    if (!files.length) {
      const emptyMsg = DomHelpers.el(
        'div',
        'autoexec-file-list-empty',
        'No scripts yet.\nClick + to create one.',
      );
      list.appendChild(emptyMsg);
      return;
    }
    files.forEach((f) => {
      const item = DomHelpers.el(
        'div',
        'autoexec-file-item' + (f.path === _currentFile ? ' active' : ''),
      );
      const nameEl = DomHelpers.el('span', 'autoexec-file-item-name', _stripLua(f.name));
      const actions = DomHelpers.el('span', 'autoexec-file-actions');
      const renameBtn = document.createElement('button');
      renameBtn.className = 'autoexec-file-action-btn';
      renameBtn.title = 'Rename';
      renameBtn.innerHTML = SVG_RENAME;
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _startRename(f.path, nameEl);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'autoexec-file-action-btn';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = SVG_DELETE;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _deleteFile(f.path);
      });
      actions.append(renameBtn, deleteBtn);
      item.append(nameEl, actions);
      item.addEventListener('click', () => {
        if (f.path !== _currentFile) _selectFile(f.path);
      });
      list.appendChild(item);
    });
  }

  function _renderEditorTitle() {
    const nameEl = document.getElementById('autoexecEditorTitleName');
    if (!nameEl) return;
    nameEl.textContent = _currentFile ? _stripLua(_currentFile.split('/').pop()) : '';
  }

  async function _renderAll() {
    const files = await _listFiles();
    const list = document.getElementById('autoexecFileList');
    if (list) list._files = files;
    _renderFileList();
    _renderEditorTitle();
    const editorWrap = document.getElementById('autoexecEditorWrap');
    const editorEmpty = document.getElementById('autoexecEditorEmpty');
    if (_currentFile) {
      const stillExists = files.some((f) => f.path === _currentFile);
      if (!stillExists) {
        _currentFile = null;
        await _saveMeta();
        if (editorWrap) editorWrap.style.display = 'none';
        if (editorEmpty) editorEmpty.style.display = 'flex';
        _renderFileList();
        _renderEditorTitle();
        return;
      }
      if (editorWrap) editorWrap.style.display = '';
      if (editorEmpty) editorEmpty.style.display = 'none';
    } else {
      if (editorWrap) editorWrap.style.display = 'none';
      if (editorEmpty) editorEmpty.style.display = 'flex';
    }
  }

  function _buildView() {
    const wrap = document.getElementById('autoexecView');
    if (!wrap) return;
    wrap.style.cssText =
      'display:flex;flex:1;flex-direction:column;overflow:hidden;background:var(--bg0);';
    wrap.innerHTML = '';
    const view = DomHelpers.el('div', 'autoexec-view');
    const header = DomHelpers.el('div', 'autoexec-header');
    const titleEl = DomHelpers.el('span', 'autoexec-title', 'Autoexecute');
    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'toggle-switch autoexec-toggle';
    const toggleLabel = DomHelpers.el('span', 'autoexec-toggle-label', _enabled ? 'ON' : 'OFF');
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = _enabled;
    toggleInput.id = 'autoexecToggleChk';
    const track = DomHelpers.el('span', 'toggle-track');
    track.appendChild(DomHelpers.el('span', 'toggle-thumb'));
    toggleWrap.append(toggleLabel, toggleInput, track);
    toggleInput.addEventListener('change', async () => {
      _enabled = toggleInput.checked;
      toggleLabel.textContent = _enabled ? 'ON' : 'OFF';
      await _saveMeta();
      await _sync();
      await _renderAll();
      _refreshStatus();
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn';
    addBtn.title = 'New file';
    addBtn.innerHTML = SVG_NEW_FILE;
    addBtn.addEventListener('click', _newFile);
    header.append(titleEl, toggleWrap, addBtn);
    view.appendChild(header);
    const body = DomHelpers.el('div', 'autoexec-body');
    const fileList = DomHelpers.el('div', 'autoexec-file-list');
    fileList.id = 'autoexecFileList';
    fileList._files = [];
    const editorCol = DomHelpers.el('div', 'autoexec-editor-col');
    const editorTitle = DomHelpers.el('div', 'autoexec-editor-title');
    const editorTitleName = DomHelpers.el(
      'span',
      'autoexec-editor-title-name',
      _currentFile ? _stripLua(_currentFile.split('/').pop()) : '',
    );
    editorTitleName.id = 'autoexecEditorTitleName';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'icon-btn';
    saveBtn.id = 'autoexecSaveBtn';
    saveBtn.title = 'Save (Ctrl+S)';
    saveBtn.style.opacity = '0';
    saveBtn.innerHTML = SVG_SAVE;
    saveBtn.addEventListener('click', () => AutoexecEditor.save(_currentFile));
    editorTitle.append(editorTitleName, saveBtn);
    const editorWrap = DomHelpers.el('div', 'autoexec-editor-wrap');
    editorWrap.id = 'autoexecEditorWrap';
    editorWrap.style.display = _currentFile ? '' : 'none';
    const editorEmpty = DomHelpers.el('div', 'autoexec-empty');
    editorEmpty.id = 'autoexecEditorEmpty';
    editorEmpty.style.display = _currentFile ? 'none' : 'flex';
    editorEmpty.innerHTML = SVG_SELECT_FILE + '<span>Select a file to edit</span>';
    editorCol.append(editorTitle, editorWrap, editorEmpty);
    body.append(fileList, editorCol);
    view.appendChild(body);
    const statusBar = DomHelpers.el('div', 'autoexec-status');
    const dot = DomHelpers.el('span', 'autoexec-status-dot' + (_enabled ? ' on' : ''));
    dot.id = 'autoexecStatusDot';
    const statusText = DomHelpers.el(
      'span',
      '',
      _enabled ? 'Autoexecute enabled' : 'Autoexecute disabled',
    );
    statusText.id = 'autoexecStatusText';
    statusBar.append(dot, statusText);
    view.appendChild(statusBar);
    wrap.appendChild(view);
  }

  function _refreshStatus() {
    const dot = document.getElementById('autoexecStatusDot');
    const text = document.getElementById('autoexecStatusText');
    if (dot) dot.className = 'autoexec-status-dot' + (_enabled ? ' on' : '');
    if (text) text.textContent = _enabled ? 'Autoexecute enabled' : 'Autoexecute disabled';
    const chk = document.getElementById('autoexecToggleChk');
    if (chk) chk.checked = _enabled;
  }

  async function show() {
    if (!_inited) {
      await _loadMeta();
      _inited = true;
    }
    const wrap = document.getElementById('autoexecView');
    if (!wrap) return;
    wrap.style.display = 'flex';
    if (document.getElementById('autoexecFileList')) {
      const files = await _listFiles();
      const list = document.getElementById('autoexecFileList');
      if (list) list._files = files;
      if (
        _currentFile &&
        files.some((f) => f.path === _currentFile) &&
        !AutoexecEditor.getEditor()
      ) {
        await AutoexecEditor.loadFile(_currentFile);
      }
      await _renderAll();
      return;
    }
    _buildView();
    const files = await _listFiles();
    const list = document.getElementById('autoexecFileList');
    if (list) list._files = files;
    _renderFileList();
    if (_currentFile && files.some((f) => f.path === _currentFile)) {
      await AutoexecEditor.loadFile(_currentFile);
    }
    await _renderAll();
  }

  function hide() {
    if (AutoexecEditor.isDirty() && _currentFile) {
      window.__TAURI__.core
        .invoke('write_text_file', {
          path: _currentFile,
          content: AutoexecEditor.getEditor()?.getValue() ?? '',
        })
        .catch(() => {});
    }
    const wrap = document.getElementById('autoexecView');
    if (wrap) wrap.style.display = 'none';
    AutoexecEditor.dispose();
  }

  async function onExecutorChanged() {
    if (!_inited) return;
    _currentFile = null;
    await _saveMeta();
    await _renderAll();
  }

  return { show, hide, onExecutorChanged };
})();
