const ExplorerTree = (() => {
  const rootEl = () => document.getElementById("fileTree");
  let _selection = new Set();
  let _lastClickedId = null;
  let _dragSrcId = null;
  let _dragNodes = [];
  let _flatOrder = [];
  let _structureKey = "";
  const SVG = {
    arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    newFile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    newFolder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    rename: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    copyPath: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    reveal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    duplicate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    addFolder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    remove: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  };
  function _findNode(id, node) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const found = _findNode(id, child);
      if (found) return found;
    }
    return null;
  }
  function findNodeInRoots(id) {
    for (const root of state.roots) {
      const found = _findNode(id, root);
      if (found) return found;
    }
    return null;
  }
  function setDragSrc(id) {
    _dragSrcId = id;
  }
  function getDragSrc() {
    return _dragSrcId;
  }
  function setDragNodes(nodes) {
    _dragNodes = nodes ?? [];
  }
  function getDragNodes() {
    return _dragNodes;
  }
  function clearSelection() {
    _setSelection([]);
  }
  function _getFileCount(node) {
    if (node.type === "file") return 1;
    return (node.children ?? []).reduce((n, c) => n + _getFileCount(c), 0);
  }
  function _setSelection(ids) {
    _selection = new Set(ids);
    rootEl()
      ?.querySelectorAll(".tree-row")
      .forEach((row) => {
        row.classList.toggle("selected", _selection.has(row.dataset.id));
      });
  }
  function _getSelectionNodes() {
    return [..._selection].map((id) => findNodeInRoots(id)).filter(Boolean);
  }
  function _buildStructureKey() {
    const parts = [];
    function walk(node) {
      parts.push(
        node.id + (node.type === "folder" ? (node.open ? "O" : "C") : "F"),
      );
      if (node.type === "folder" && node.open) {
        for (const c of node.children) walk(c);
      }
    }
    for (const root of state.roots) {
      parts.push("R" + root.id + (root.open ? "O" : "C"));
      if (root.open) for (const c of root.children) walk(c);
    }
    return parts.join("|");
  }
  function _patchSelection() {
    const root = rootEl();
    if (!root) return;
    root.querySelectorAll(".tree-row").forEach((row) => {
      row.classList.toggle("selected", _selection.has(row.dataset.id));
    });
  }
  function _patchUnsaved() {
    const root = rootEl();
    if (!root) return;
    root.querySelectorAll(".tree-row[data-type='file']").forEach((row) => {
      const id = row.dataset.id;
      const meta = row.querySelector(".tree-meta");
      if (!meta) return;
      const existingDot = meta.querySelector(".tree-unsaved-dot");
      const shouldHave = state.isUnsaved(id);
      if (shouldHave && !existingDot) {
        const dot = document.createElement("span");
        dot.className = "tree-unsaved-dot";
        meta.insertBefore(dot, meta.firstChild);
      } else if (!shouldHave && existingDot) {
        existingDot.remove();
      }
    });
  }
  function render() {
    const root = rootEl();
    if (!root) return;
    if (!state.roots.length) {
      _structureKey = "";
      root.innerHTML = `
        <div class="empty-explorer">
          <div class="empty-explorer-icon">${SVG.folder}</div>
          <p class="empty-explorer-title">No folder open</p>
          <p class="empty-explorer-sub">Open a folder to start editing</p>
          <button class="open-folder-btn" id="explorerOpenFolderBtn">Open Folder…</button>
          <button class="open-folder-btn open-folder-btn--secondary" id="explorerResetDefaultBtn">Restore Default Workspace</button>
          <div class="empty-drop-hint">${SVG.upload}<span>or drag a folder here</span></div>
        </div>`;
      document
        .getElementById("explorerOpenFolderBtn")
        ?.addEventListener("click", () =>
          workspaceController.openFolderDialog(),
        );
      document
        .getElementById("explorerResetDefaultBtn")
        ?.addEventListener("click", () => workspaceController.resetDefault());
      return;
    }
    const newKey = _buildStructureKey();
    if (newKey === _structureKey) {
      _patchSelection();
      _patchUnsaved();
      return;
    }
    _structureKey = newKey;
    root.innerHTML = "";
    _flatOrder = [];
    const frag = document.createDocumentFragment();
    for (const rootNode of state.roots) _renderRootNode(rootNode, frag);
    root.appendChild(frag);
    for (const rootNode of state.roots) {
      if (rootNode.open) _buildFlatOrder(rootNode, _flatOrder);
    }
    _selection.forEach((id) => {
      root
        .querySelector(`.tree-row[data-id="${id}"]`)
        ?.classList.add("selected");
    });
  }
  function _buildFlatOrder(rootNode, out) {
    if (!rootNode.open) return;
    for (const child of rootNode.children) _buildFlatOrderNode(child, out);
  }
  function _buildFlatOrderNode(node, out) {
    out.push(node.id);
    if (node.type === "folder" && node.open) {
      for (const child of node.children) _buildFlatOrderNode(child, out);
    }
  }
  function _renderRootNode(rootNode, container) {
    const isPrimary = state.roots.indexOf(rootNode) === 0;
    const header = document.createElement("div");
    header.className =
      "tree-root-header" + (isPrimary ? "" : " tree-root-header--secondary");
    const left = document.createElement("div");
    left.className = "tree-root-left";
    const arrow = document.createElement("span");
    arrow.className = "tree-root-arrow" + (rootNode.open ? " open" : "");
    arrow.innerHTML = SVG.arrow;
    const name = document.createElement("span");
    name.className = "tree-root-name";
    name.textContent = rootNode.name.toUpperCase();
    left.append(arrow, name);
    if (!isPrimary) {
      const badge = document.createElement("span");
      badge.className = "tree-root-badge";
      badge.textContent = "folder";
      left.appendChild(badge);
    }
    const right = document.createElement("div");
    right.className = "tree-root-right";
    const count = document.createElement("span");
    count.className = "tree-root-count";
    count.textContent = _getFileCount(rootNode);
    const menuBtn = document.createElement("button");
    menuBtn.className = "tree-root-menu-btn";
    menuBtn.innerHTML = SVG.dots;
    menuBtn.title = "Folder options";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ctxMenu.showForRoot(e, rootNode);
    });
    right.append(count, menuBtn);
    header.append(left, right);
    header.addEventListener("click", () => {
      rootNode.open = !rootNode.open;
      render();
    });
    ExplorerDnd.attachRootHeaderDrop(header, rootNode);
    container.appendChild(header);
    if (rootNode.open) {
      rootNode.children.forEach((c) => _renderNode(c, 0, container));
    }
  }
  function _renderNode(node, depth, container) {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.id = node.id;
    row.dataset.type = node.type;
    const indent = document.createElement("div");
    indent.className = "tree-indent";
    for (let i = 0; i < depth; i++) {
      const guide = document.createElement("span");
      guide.className = "tree-guide";
      guide.style.left = i * 14 + 13 + "px";
      row.appendChild(guide);
    }
    indent.style.paddingLeft = depth * 14 + 6 + "px";
    const arrowEl = document.createElement("span");
    arrowEl.className =
      "tree-arrow" +
      (node.type === "folder" ? (node.open ? " open" : "") : " leaf");
    arrowEl.innerHTML = SVG.arrow;
    const iconEl = document.createElement("span");
    iconEl.className = "tree-icon";
    iconEl.appendChild(
      helpers.fileIconImg(node.name, node.type === "folder", node.open, 15),
    );
    const labelEl = document.createElement("span");
    labelEl.className = "tree-label";
    labelEl.textContent = node.name;
    const metaEl = document.createElement("span");
    metaEl.className = "tree-meta";
    if (state.isUnsaved(node.id)) {
      const dot = document.createElement("span");
      dot.className = "tree-unsaved-dot";
      metaEl.appendChild(dot);
    }
    if (node.type === "folder" && node.children?.length > 0) {
      const badge = document.createElement("span");
      badge.className = "tree-folder-count";
      badge.textContent = node.children.length;
      metaEl.appendChild(badge);
    }
    indent.append(arrowEl, iconEl, labelEl, metaEl);
    row.appendChild(indent);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        if (_selection.has(node.id)) {
          _selection.delete(node.id);
          row.classList.remove("selected");
        } else {
          _selection.add(node.id);
          row.classList.add("selected");
        }
        _lastClickedId = node.id;
        return;
      }
      if (e.shiftKey && _lastClickedId && _lastClickedId !== node.id) {
        const a = _flatOrder.indexOf(_lastClickedId);
        const b = _flatOrder.indexOf(node.id);
        if (a !== -1 && b !== -1) {
          const lo = Math.min(a, b),
            hi = Math.max(a, b);
          _setSelection(_flatOrder.slice(lo, hi + 1));
          return;
        }
      }
      _setSelection([node.id]);
      _lastClickedId = node.id;
      if (node.type === "folder") {
        node.open = !node.open;
        render();
      } else {
        eventBus.emit("ui:open-file", {
          id: node.id,
        });
      }
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!_selection.has(node.id)) {
        _setSelection([node.id]);
        _lastClickedId = node.id;
      }
      ctxMenu.showForNodes(e, _getSelectionNodes());
    });
    ExplorerDnd.attachRowDrop(row, node);
    if (node.type === "file") ExplorerDnd.attachFileDrag(row, node);
    if (node.type === "folder") ExplorerDnd.attachFolderDrag(row, node);
    container.appendChild(row);
    if (node.type === "folder" && node.open) {
      node.children.forEach((c) => _renderNode(c, depth + 1, container));
    }
  }
  function init() {
    const root = rootEl();
    root?.addEventListener("click", (e) => {
      if (
        !e.target.closest(".tree-row") &&
        !e.target.closest(".tree-root-header")
      ) {
        _setSelection([]);
        _lastClickedId = null;
      }
    });
    ExplorerDnd.attachRootDrop(root);
  }
  return {
    render,
    init,
    setDragSrc,
    getDragSrc,
    setDragNodes,
    getDragNodes,
    clearSelection,
    findNode: findNodeInRoots,
    getSelection: _getSelectionNodes,
    getSvgs: () => SVG,
    startRename: ExplorerOps.startRename,
    startCreate: ExplorerOps.startCreate,
    duplicate: ExplorerOps.duplicate,
    confirmDelete: ExplorerOps.confirmDelete,
    confirmDeleteMulti: ExplorerOps.confirmDeleteMulti,
    removeFolderFromWorkspace: ExplorerOps.removeFolderFromWorkspace,
    deleteFolderFromDisk: ExplorerOps.deleteFolderFromDisk,
    copyPath: ExplorerOps.copyPath,
    copyPaths: ExplorerOps.copyPaths,
    revealInFinder: ExplorerOps.revealInFinder,
    revealRootInFinder: ExplorerOps.revealRootInFinder,
  };
})();
