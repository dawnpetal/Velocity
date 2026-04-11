const fileManager = (() => {
  async function loadFolder(dirPath) {
    const tree = await buildTree(dirPath);
    state.addRoot(tree);
    return tree;
  }
  async function openFolder(dirPath) {
    state.clear();
    state.workDir = dirPath;
    return loadFolder(dirPath);
  }
  async function buildTree(dirPath) {
    const entries = await window.__TAURI__.core.invoke("read_dir", {
      path: dirPath,
    });
    const node = {
      id: helpers.uid(),
      name: helpers.basename(dirPath),
      path: dirPath,
      type: "folder",
      open: true,
      children: [],
    };
    await Promise.all(
      entries
        .filter((e) => !e.entry.startsWith("."))
        .map(async (e) => {
          const fullPath = `${dirPath}/${e.entry}`;
          if (e.type === "DIRECTORY") {
            const sub = await buildTree(fullPath);
            sub.open = false;
            node.children.push(sub);
          } else {
            const id = helpers.uid();
            node.children.push({
              id,
              name: e.entry,
              path: fullPath,
              type: "file",
            });
            state.addFile(id, e.entry, fullPath, null);
          }
        }),
    );
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
    });
    return node;
  }
  async function ensureContent(id) {
    const file = state.getFile(id);
    if (!file || file.content !== null) return;
    try {
      state.setContent(
        id,
        await window.__TAURI__.core.invoke("read_text_file", {
          path: file.path,
        }),
      );
    } catch {
      state.setContent(id, "");
    }
  }
  async function save(id) {
    const file = state.getFile(id);
    if (!file) return false;
    await window.__TAURI__.core.invoke("write_text_file", {
      path: file.path,
      content: file.content,
    });
    state.markSaved(id);
    eventBus.emit("file:saved", {
      id,
      file,
    });
    return true;
  }
  async function _pathExists(p) {
    const stat = await window.__TAURI__.core.invoke("stat_path", {
      path: p,
    });
    return stat.exists;
  }
  async function _uniqueFilePath(dirPath, name) {
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
    let candidate = name;
    for (let counter = 1; counter <= 9999; counter++) {
      if (!(await _pathExists(`${dirPath}/${candidate}`))) return candidate;
      candidate = `${base}_${counter}${ext}`;
    }
    return `${base}_${crypto.randomUUID().slice(0, 8)}${ext}`;
  }
  async function _uniqueFolderPath(dirPath, name) {
    let candidate = name;
    for (let counter = 1; counter <= 9999; counter++) {
      if (!(await _pathExists(`${dirPath}/${candidate}`))) return candidate;
      candidate = `${name}_${counter}`;
    }
    return `${name}_${crypto.randomUUID().slice(0, 8)}`;
  }
  async function createFile(dirPath, name) {
    const safeName = await _uniqueFilePath(dirPath, name);
    const path = `${dirPath}/${safeName}`;
    await window.__TAURI__.core.invoke("write_text_file", {
      path,
      content: "",
    });
    const id = helpers.uid();
    state.addFile(id, safeName, path, "");
    return {
      id,
      path,
    };
  }
  async function createFolder(dirPath, name) {
    const safeName = await _uniqueFolderPath(dirPath, name);
    const path = `${dirPath}/${safeName}`;
    await window.__TAURI__.core.invoke("create_dir", {
      path,
    });
    return path;
  }
  async function rename(oldPath, newPath) {
    await window.__TAURI__.core.invoke("rename_path", {
      src: oldPath,
      dest: newPath,
    });
  }
  async function remove(path) {
    await window.__TAURI__.core.invoke("remove_path", {
      path,
    });
  }
  async function copyRecursive(src, dest) {
    await window.__TAURI__.core
      .invoke("create_dir", {
        path: dest,
      })
      .catch(() => {});
    const entries = await window.__TAURI__.core.invoke("read_dir", {
      path: src,
    });
    for (const entry of entries) {
      if (entry.entry === "." || entry.entry === "..") continue;
      const srcPath = `${src}/${entry.entry}`;
      const destPath = `${dest}/${entry.entry}`;
      if (entry.type === "DIRECTORY") {
        await copyRecursive(srcPath, destPath);
      } else {
        try {
          const data = await window.__TAURI__.core.invoke("read_binary_file", {
            path: srcPath,
          });
          await window.__TAURI__.core.invoke("write_binary_file", {
            path: destPath,
            data,
          });
        } catch {
          const content = await window.__TAURI__.core.invoke("read_text_file", {
            path: srcPath,
          });
          await window.__TAURI__.core.invoke("write_text_file", {
            path: destPath,
            content,
          });
        }
      }
    }
  }
  return {
    loadFolder,
    openFolder,
    buildTree,
    ensureContent,
    save,
    createFile,
    createFolder,
    rename,
    remove,
    copyRecursive,
  };
})();
