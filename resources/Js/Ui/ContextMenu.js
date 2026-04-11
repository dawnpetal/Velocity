const ctxMenu = (() => {
  const el = document.getElementById("ctxMenu");
  let _skipNextHide = false;
  function hide() {
    if (_skipNextHide) {
      _skipNextHide = false;
      return;
    }
    el.classList.remove("open");
  }
  document.addEventListener("click", hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      _skipNextHide = false;
      el.classList.remove("open");
    }
  });
  document.addEventListener("contextmenu", (e) => {
    if (!el.contains(e.target)) {
      _skipNextHide = false;
      el.classList.remove("open");
    }
  });
  function _position(clientX, clientY) {
    _skipNextHide = true;
    el.classList.add("open");
    el.style.left = "0px";
    el.style.top = "0px";
    requestAnimationFrame(() => {
      const { width, height } = el.getBoundingClientRect();
      el.style.left = Math.min(clientX, window.innerWidth - width - 4) + "px";
      el.style.top = Math.min(clientY, window.innerHeight - height - 4) + "px";
    });
  }
  function _item(label, icon, onClick, danger = false) {
    const btn = document.createElement("button");
    btn.className = "ctx-item" + (danger ? " danger" : "");
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener("click", () => {
      _skipNextHide = false;
      el.classList.remove("open");
      onClick();
    });
    el.appendChild(btn);
  }
  function _sep() {
    el.appendChild(DomHelpers.sep());
  }
  function _build(e, buildFn) {
    e.preventDefault();
    el.innerHTML = "";
    buildFn(ExplorerTree.getSvgs());
    _position(e.clientX, e.clientY);
  }
  const REVEAL_LABEL =
    "Reveal in " + (navigator.platform.includes("Mac") ? "Finder" : "Explorer");
  function show(e, node) {
    _build(e, (SVG) => {
      if (node.type === "folder") {
        _item("New File", SVG.newFile, () =>
          ExplorerTree.startCreate(node, "file"),
        );
        _item("New Folder", SVG.newFolder, () =>
          ExplorerTree.startCreate(node, "folder"),
        );
        _sep();
      }
      if (node.type === "file") {
        _item("Duplicate", SVG.duplicate, () => ExplorerTree.duplicate(node));
        if (editor.canPreview(node.name)) {
          _item("Open Preview", SVG.preview, () => {
            const f = state.getFile(node.id);
            if (f) editor.openPreview(f);
          });
        }
        _item("Pin to Pinboard", SVG.pin, () => pinboard.pinFile(node));
        _sep();
      }
      _item("Rename", SVG.rename, () => ExplorerTree.startRename(node));
      _item("Copy Path", SVG.copyPath, () => ExplorerTree.copyPath(node));
      _item(REVEAL_LABEL, SVG.reveal, () => ExplorerTree.revealInFinder(node));
      _sep();
      _item("Delete", SVG.delete, () => ExplorerTree.confirmDelete(node), true);
    });
  }
  function showForNodes(e, nodes) {
    if (!nodes.length) return;
    if (nodes.length === 1) {
      show(e, nodes[0]);
      return;
    }
    _build(e, (SVG) => {
      const header = DomHelpers.el(
        "div",
        "ctx-header",
        `${nodes.length} items selected`,
      );
      el.appendChild(header);
      _sep();
      if (nodes.every((n) => n.type === "file")) {
        _item("Copy Paths", SVG.copyPath, () => ExplorerTree.copyPaths(nodes));
        _sep();
      }
      _item(
        "Delete All",
        SVG.delete,
        () => ExplorerTree.confirmDeleteMulti(nodes),
        true,
      );
    });
  }
  function showEmpty(e, rootNode) {
    _build(e, (SVG) => {
      _item("New File", SVG.newFile, () =>
        ExplorerTree.startCreate(rootNode, "file"),
      );
      _item("New Folder", SVG.newFolder, () =>
        ExplorerTree.startCreate(rootNode, "folder"),
      );
      _sep();
      _item("Add Folder", SVG.addFolder, () =>
        workspaceController.openFolderDialog(),
      );
    });
  }
  function showForRoot(e, rootNode) {
    _build(e, (SVG) => {
      _item("New File", SVG.newFile, () =>
        ExplorerTree.startCreate(rootNode, "file"),
      );
      _item("New Folder", SVG.newFolder, () =>
        ExplorerTree.startCreate(rootNode, "folder"),
      );
      _sep();
      _item("Add Folder", SVG.addFolder, () =>
        workspaceController.openFolderDialog(),
      );
      _item("Copy Path", SVG.copyPath, () => ExplorerTree.copyPath(rootNode));
      _item(REVEAL_LABEL, SVG.reveal, () =>
        ExplorerTree.revealRootInFinder(rootNode),
      );
      _sep();
      _item("Remove Folder", SVG.remove, () =>
        ExplorerTree.removeFolderFromWorkspace(rootNode),
      );
      _item(
        "Delete from Disk",
        SVG.delete,
        () => ExplorerTree.deleteFolderFromDisk(rootNode),
        true,
      );
    });
  }
  function showAddFolder(e) {
    _build(e, (SVG) => {
      _item("Add Folder", SVG.addFolder, () =>
        workspaceController.openFolderDialog(),
      );
    });
  }
  return {
    show,
    showForNodes,
    showEmpty,
    showForRoot,
    showAddFolder,
    hide,
  };
})();
