const ExplorerDnd = (() => {
  let _handlingDrop = false;
  let _autoExpandTimer = null;
  let _autoExpandTargetId = null;
  let _ghostEl = null;
  let _currentDragOverEl = null;
  function _getIndicator() {
    const tree = document.getElementById("fileTree");
    if (!tree) return null;
    let ind = tree.querySelector(".tree-drop-line");
    if (!ind) {
      ind = document.createElement("div");
      ind.className = "tree-drop-line";
      ind.style.display = "none";
      tree.appendChild(ind);
    }
    return ind;
  }
  function _showDropLine(row, edge) {
    const ind = _getIndicator();
    const tree = document.getElementById("fileTree");
    if (!ind || !tree || !row) return;
    const treeRect = tree.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const indentPx =
      parseInt(
        row.querySelector(".tree-indent")?.style.paddingLeft || "6",
        10,
      ) || 6;
    ind.style.left = indentPx + "px";
    ind.style.right = "4px";
    ind.style.top =
      (edge === "before" ? rowRect.top : rowRect.bottom) -
      treeRect.top +
      tree.scrollTop +
      "px";
    ind.style.display = "block";
  }
  function _hideDropLine() {
    const ind = document
      .getElementById("fileTree")
      ?.querySelector(".tree-drop-line");
    if (ind) ind.style.display = "none";
  }
  function _clearDragOver() {
    if (_currentDragOverEl) {
      _currentDragOverEl.classList.remove("drag-over");
      _currentDragOverEl = null;
    }
    document
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
  }
  function _setDragOver(el) {
    if (_currentDragOverEl === el) return;
    _clearDragOver();
    _currentDragOverEl = el;
    el?.classList.add("drag-over");
  }
  function _clearAll() {
    _hideDropLine();
    _clearDragOver();
  }
  function _clearAutoExpand() {
    clearTimeout(_autoExpandTimer);
    _autoExpandTimer = null;
    _autoExpandTargetId = null;
  }
  function _scheduleAutoExpand(node) {
    if (_autoExpandTargetId === node.id) return;
    _clearAutoExpand();
    _autoExpandTargetId = node.id;
    _autoExpandTimer = setTimeout(() => {
      if (!node.open) {
        node.open = true;
        ExplorerTree.render();
      }
    }, 700);
  }
  function _createGhost(nodes) {
    const el = document.createElement("div");
    el.className = "tree-drag-ghost";
    el.textContent =
      nodes.length === 1 ? nodes[0].name : `${nodes.length} items`;
    el.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;pointer-events:none;z-index:9999;";
    document.body.appendChild(el);
    return el;
  }
  function _findParent(targetId, node, candidate) {
    if (node.id === targetId) return candidate;
    for (const c of node.children ?? []) {
      const r = _findParent(targetId, c, node);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  function _getParent(node) {
    for (const root of state.roots) {
      const r = _findParent(node.id, root, null);
      if (r !== undefined) return r;
    }
    return null;
  }
  function _isAncestorOf(ancestor, targetId) {
    if (ancestor.id === targetId) return true;
    for (const c of ancestor.children ?? []) {
      if (_isAncestorOf(c, targetId)) return true;
    }
    return false;
  }
  function _getContainingRoot(node) {
    for (const root of state.roots) {
      if (_isAncestorOf(root, node.id)) return root;
    }
    return null;
  }
  function _resolveZone(e, row, node) {
    const rect = row.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    if (node.type === "folder") {
      if (ratio < 0.25) return "before";
      if (ratio > 0.75) return "after";
      return "into";
    }
    return ratio < 0.5 ? "before" : "after";
  }
  function _applyFeedback(zone, row, node) {
    if (zone === "into") {
      _hideDropLine();
      _setDragOver(row);
      _scheduleAutoExpand(node);
    } else {
      _clearDragOver();
      _clearAutoExpand();
      _showDropLine(row, zone);
    }
  }
  function _attachNodeDrag(row, node) {
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      const sel = ExplorerTree.getSelection();
      const dragNodes =
        sel.length > 0 && sel.some((n) => n.id === node.id) ? sel : [node];
      ExplorerTree.setDragSrc(node.id);
      ExplorerTree.setDragNodes(dragNodes);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "text/plain",
        dragNodes.map((n) => n.id).join(","),
      );
      _ghostEl = _createGhost(dragNodes);
      e.dataTransfer.setDragImage(_ghostEl, 14, 14);
      setTimeout(() => {
        dragNodes.forEach((n) => {
          document
            .querySelector(`.tree-row[data-id="${n.id}"]`)
            ?.classList.add("dragging");
        });
      }, 0);
    });
    row.addEventListener("dragend", () => {
      _clearAll();
      _clearAutoExpand();
      if (_ghostEl) {
        _ghostEl.remove();
        _ghostEl = null;
      }
      ExplorerTree.setDragSrc(null);
      ExplorerTree.setDragNodes([]);
      document
        .querySelectorAll(".dragging")
        .forEach((el) => el.classList.remove("dragging"));
    });
  }
  function attachFileDrag(row, node) {
    _attachNodeDrag(row, node);
  }
  function attachFolderDrag(row, node) {
    _attachNodeDrag(row, node);
  }
  function attachRowDrop(row, node) {
    row.addEventListener("dragenter", (e) => {
      e.preventDefault();
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const isExternal = e.dataTransfer.types.includes("Files");
      e.dataTransfer.dropEffect = isExternal ? "copy" : "move";
      const dragNodes = ExplorerTree.getDragNodes();
      const isSelf = dragNodes.length === 1 && dragNodes[0].id === node.id;
      const isAncestor = dragNodes.some(
        (dn) => _isAncestorOf(dn, node.id) && dn.id !== node.id,
      );
      if (isSelf || isAncestor) {
        e.dataTransfer.dropEffect = "none";
        _clearAll();
        return;
      }
      const zone = _resolveZone(e, row, node);
      _applyFeedback(zone, row, node);
    });
    row.addEventListener("dragleave", (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove("drag-over");
        if (_currentDragOverEl === row) _currentDragOverEl = null;
      }
    });
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      _clearAll();
      _clearAutoExpand();
      if (e.dataTransfer.files.length > 0) {
        if (_handlingDrop) return;
        _handlingDrop = true;
        try {
          const zone = _resolveZone(e, row, node);
          let destDir;
          if (zone === "into" && node.type === "folder") {
            destDir = node.path;
          } else {
            const parent = _getParent(node);
            destDir = parent
              ? parent.path
              : (_getContainingRoot(node)?.path ?? null);
          }
          await _externalDrop(e.dataTransfer, destDir);
        } finally {
          _handlingDrop = false;
        }
        return;
      }
      const dragNodes = ExplorerTree.getDragNodes();
      if (!dragNodes.length) return;
      const zone = _resolveZone(e, row, node);
      await _internalDrop(dragNodes, node, zone);
    });
  }
  function attachRootHeaderDrop(headerEl, rootNode) {
    headerEl.addEventListener("dragenter", (e) => {
      e.preventDefault();
      _setDragOver(headerEl);
      _hideDropLine();
    });
    headerEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files")
        ? "copy"
        : "move";
      _setDragOver(headerEl);
      _hideDropLine();
      _clearAutoExpand();
    });
    headerEl.addEventListener("dragleave", (e) => {
      if (!headerEl.contains(e.relatedTarget)) {
        headerEl.classList.remove("drag-over");
        if (_currentDragOverEl === headerEl) _currentDragOverEl = null;
      }
    });
    headerEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      _clearAll();
      _clearAutoExpand();
      if (e.dataTransfer.files.length > 0) {
        if (_handlingDrop) return;
        _handlingDrop = true;
        try {
          await _externalDrop(e.dataTransfer, rootNode.path);
        } finally {
          _handlingDrop = false;
        }
        return;
      }
      const dragNodes = ExplorerTree.getDragNodes();
      if (!dragNodes.length) return;
      await _internalDrop(dragNodes, rootNode, "into");
    });
  }
  async function _internalDrop(dragNodes, targetNode, zone) {
    let moved = 0;
    for (const dragNode of dragNodes) {
      if (dragNode.id === targetNode.id) continue;
      if (_isAncestorOf(dragNode, targetNode.id)) continue;
      let destDir;
      if (zone === "into") {
        if (targetNode.type !== "folder") continue;
        destDir = targetNode.path;
      } else {
        const parent = _getParent(targetNode);
        if (parent) {
          destDir = parent.path;
        } else {
          const root = _getContainingRoot(targetNode);
          destDir = root
            ? root.path
            : targetNode.path.substring(0, targetNode.path.lastIndexOf("/"));
        }
      }
      const newPath = `${destDir}/${dragNode.name}`;
      if (newPath === dragNode.path) continue;
      let destExists = false;
      try {
        const stat = await window.__TAURI__.core.invoke("stat_path", {
          path: newPath,
        });
        destExists = !!stat.exists;
      } catch {}
      if (destExists) {
        const ok = await modal.confirm(
          "Replace?",
          `<strong>${helpers.escapeHtml(dragNode.name)}</strong> already exists here. Replace it?`,
        );
        if (!ok) continue;
      }
      try {
        await fileManager.rename(dragNode.path, newPath);
        dragNode.path = newPath;
        if (dragNode.type === "file") {
          const f = state.getFile(dragNode.id);
          if (f) f.path = newPath;
        }
        moved++;
      } catch (err) {
        toast.show(`Could not move ${dragNode.name}`, "warn", 3000);
        console.error(err);
      }
    }
    if (moved > 0) eventBus.emit("ui:refresh-tree");
  }
  async function _externalDrop(dt, destDir) {
    if (!destDir) {
      toast.show("Open a folder first", "warn");
      return;
    }
    const items = Array.from(dt.items ?? []);
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return;
    toast.show(
      `Copying ${entries.length} item${entries.length > 1 ? "s" : ""}…`,
      "info",
      2000,
    );
    let copied = 0;
    for (const entry of entries) {
      try {
        await _copyEntry(entry, `${destDir}/${entry.name}`);
        copied++;
      } catch (err) {
        console.error("External drop failed:", entry.name, err);
        toast.show(`Failed to copy ${entry.name}`, "warn", 3000);
      }
    }
    eventBus.emit("ui:refresh-tree");
    toast.show(
      `Copied ${copied}${copied < entries.length ? ` of ${entries.length}` : ""} item${copied !== 1 ? "s" : ""}`,
      copied === entries.length ? "ok" : "warn",
      2500,
    );
  }
  async function _copyEntry(entry, destPath) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.byteLength; i++)
        bin += String.fromCharCode(bytes[i]);
      await window.__TAURI__.core.invoke("write_binary_file", {
        path: destPath,
        data: btoa(bin),
      });
    } else if (entry.isDirectory) {
      await window.__TAURI__.core
        .invoke("create_dir", {
          path: destPath,
        })
        .catch(() => {});
      const reader = entry.createReader();
      const all = [];
      await new Promise((res, rej) => {
        const read = () =>
          reader.readEntries((batch) => {
            if (!batch.length) return res();
            all.push(...batch);
            read();
          }, rej);
        read();
      });
      for (const child of all)
        await _copyEntry(child, `${destPath}/${child.name}`);
    }
  }
  function attachRootDrop(rootEl) {
    rootEl.addEventListener("dragenter", (e) => {
      e.preventDefault();
    });
    rootEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      const isExternal = e.dataTransfer.types.includes("Files");
      e.dataTransfer.dropEffect = isExternal ? "copy" : "move";
      if (
        !e.target.closest(".tree-row") &&
        !e.target.closest(".tree-root-header")
      ) {
        if (isExternal) rootEl.classList.add("tree-drop-target");
      }
    });
    rootEl.addEventListener("dragleave", (e) => {
      if (!rootEl.contains(e.relatedTarget)) {
        rootEl.classList.remove("tree-drop-target");
        _clearAll();
      }
    });
    rootEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      rootEl.classList.remove("tree-drop-target");
      _clearAll();
      _clearAutoExpand();
      if (
        e.target.closest(".tree-row") ||
        e.target.closest(".tree-root-header")
      )
        return;
      if (!e.dataTransfer.files.length || _handlingDrop) return;
      _handlingDrop = true;
      try {
        const last = state.roots[state.roots.length - 1];
        await _externalDrop(e.dataTransfer, last?.path ?? null);
      } finally {
        _handlingDrop = false;
      }
    });
  }
  return {
    attachFileDrag,
    attachFolderDrag,
    attachRowDrop,
    attachRootHeaderDrop,
    attachRootDrop,
    handleExternalDrop: _externalDrop,
  };
})();
