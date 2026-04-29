const fileManager = (() => {
  async function loadFolder(dirPath) {
    const tree = await window.__TAURI__.core.invoke('build_file_tree', { dirPath });
    _registerTree(tree);
    state.addRoot(tree);
    return tree;
  }

  async function openFolder(dirPath) {
    state.clear();
    state.workDir = dirPath;
    return loadFolder(dirPath);
  }

  function _registerTree(node) {
    if (node.type === 'file') {
      state.addFile(node.id, node.name, node.path, null);
    } else {
      for (const child of node.children ?? []) {
        _registerTree(child);
      }
    }
  }

  async function ensureContent(id) {
    const file = state.getFile(id);
    if (!file || file.content !== null) return;
    try {
      state.setContent(
        id,
        await window.__TAURI__.core.invoke('read_text_file', { path: file.path }),
      );
    } catch {
      state.setContent(id, '');
    }
  }

  async function save(id) {
    const file = state.getFile(id);
    if (!file) return false;
    await window.__TAURI__.core.invoke('write_text_file', {
      path: file.path,
      content: file.content,
    });
    state.markSaved(id);
    eventBus.emit('file:saved', { id, file });
    return true;
  }

  async function _pathExists(p) {
    const stat = await window.__TAURI__.core.invoke('stat_path', { path: p });
    return stat.exists;
  }

  async function createFile(dirPath, name) {
    const safeName = await window.__TAURI__.core.invoke('generate_unique_filename', {
      dirPath,
      name,
      isFolder: false,
    });
    const path = `${dirPath}/${safeName}`;
    await window.__TAURI__.core.invoke('write_text_file', { path, content: '' });
    const id = helpers.uid();
    state.addFile(id, safeName, path, '');
    return { id, path };
  }

  async function createFolder(dirPath, name) {
    const safeName = await window.__TAURI__.core.invoke('generate_unique_filename', {
      dirPath,
      name,
      isFolder: true,
    });
    const path = `${dirPath}/${safeName}`;
    await window.__TAURI__.core.invoke('create_dir', { path });
    return path;
  }

  async function rename(oldPath, newPath) {
    await window.__TAURI__.core.invoke('rename_path', { src: oldPath, dest: newPath });
  }

  async function remove(path) {
    await window.__TAURI__.core.invoke('remove_path', { path });
  }

  async function copyRecursive(src, dest) {
    await window.__TAURI__.core.invoke('copy_path_recursive', { src, dest });
  }

  return {
    loadFolder,
    openFolder,
    ensureContent,
    save,
    createFile,
    createFolder,
    rename,
    remove,
    copyRecursive,
  };
})();
