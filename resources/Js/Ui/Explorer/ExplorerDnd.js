const ExplorerDnd = (() => {
  let _handlingDrop = false;
  function attachFileDrag(row, node) {
    row.addEventListener("dragstart", (e) => {
      ExplorerTree.setDragSrc(node.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.id);
      setTimeout(() => row.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      ExplorerTree.setDragSrc(null);
      document
        .querySelectorAll(".drag-over")
        .forEach((r) => r.classList.remove("drag-over"));
    });
  }
  function attachFolderDrop(row, node) {
    let enterCount = 0;
    row.addEventListener("dragenter", (e) => {
      e.preventDefault();
      enterCount++;
      row.classList.add("drag-over");
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files")
        ? "copy"
        : "move";
    });
    row.addEventListener("dragleave", () => {
      enterCount--;
      if (enterCount <= 0) {
        enterCount = 0;
        row.classList.remove("drag-over");
      }
    });
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      enterCount = 0;
      row.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) {
        if (_handlingDrop) return;
        _handlingDrop = true;
        try {
          await handleExternalDrop(e.dataTransfer, node);
        } finally {
          _handlingDrop = false;
        }
        return;
      }
      const dragSrcId = ExplorerTree.getDragSrc();
      if (!dragSrcId) return;
      const srcFile = state.getFile(dragSrcId);
      if (!srcFile) return;
      const newPath = `${node.path}/${srcFile.name}`;
      if (newPath === srcFile.path) return;
      await fileManager.rename(srcFile.path, newPath).catch(console.error);
      srcFile.path = newPath;
      eventBus.emit("ui:refresh-tree");
    });
  }
  async function handleExternalDrop(dt, targetNode) {
    const items = Array.from(dt.items ?? []);
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return;
    const destDir =
      targetNode?.path ?? state.roots[state.roots.length - 1]?.path;
    if (!destDir) {
      toast.show("Open a folder first", "warn");
      return;
    }
    let copied = 0;
    toast.show(
      `Copying ${entries.length} item${entries.length > 1 ? "s" : ""}…`,
      "info",
      2000,
    );
    for (const entry of entries) {
      try {
        await _copyEntryToPath(entry, `${destDir}/${entry.name}`);
        copied++;
      } catch (err) {
        console.error("Drop failed for", entry.name, err);
      }
    }
    eventBus.emit("ui:refresh-tree");
    toast.show(
      `Copied ${copied} of ${entries.length}`,
      copied === entries.length ? "ok" : "warn",
      2500,
    );
  }
  async function _copyEntryToPath(entry, destPath) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      await window.__TAURI__.core.invoke("write_binary_file", {
        path: destPath,
        data: base64,
      });
    } else if (entry.isDirectory) {
      await window.__TAURI__.core
        .invoke("create_dir", { path: destPath })
        .catch(() => {});
      const reader = entry.createReader();
      const children = await new Promise((res, rej) => {
        const all = [];
        const read = () =>
          reader.readEntries((batch) => {
            if (!batch.length) return res(all);
            all.push(...batch);
            read();
          }, rej);
        read();
      });
      for (const child of children)
        await _copyEntryToPath(child, `${destPath}/${child.name}`);
    }
  }
  function attachRootDrop(rootEl) {
    rootEl.addEventListener("dragenter", (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        rootEl.classList.add("tree-drop-target");
      }
    });
    rootEl.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });
    rootEl.addEventListener("dragleave", (e) => {
      if (!rootEl.contains(e.relatedTarget))
        rootEl.classList.remove("tree-drop-target");
    });
    rootEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      rootEl.classList.remove("tree-drop-target");
      if (!e.dataTransfer.files.length || _handlingDrop) return;
      _handlingDrop = true;
      try {
        const target = state.roots.length
          ? state.roots[state.roots.length - 1]
          : null;
        await handleExternalDrop(e.dataTransfer, target);
      } finally {
        _handlingDrop = false;
      }
    });
  }
  return {
    attachFileDrag,
    attachFolderDrop,
    handleExternalDrop,
    attachRootDrop,
  };
})();
