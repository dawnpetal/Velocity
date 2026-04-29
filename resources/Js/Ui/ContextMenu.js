const ctxMenu = (() => {
  const invoke = window.__TAURI__.core.invoke;
  const isMac = navigator.platform.includes('Mac');
  const REVEAL_LABEL = isMac ? 'Reveal in Finder' : 'Open in Explorer';
  let _token = 0;
  let _position = null;

  function _capture(e) {
    e.preventDefault();
    e.stopPropagation();
    _position = { x: e.clientX, y: e.clientY };
    _token += 1;
  }

  async function _menu(buildFn) {
    const { Menu, MenuItem, PredefinedMenuItem } = window.__TAURI__.menu;
    const sep = () => PredefinedMenuItem.new({ item: 'Separator' });
    const item = async (text, action) => MenuItem.new({ text, action });
    const items = [];
    const token = _token;
    await buildFn(items, item, sep);
    if (token !== _token) return;
    const menu = await Menu.new({ items });
    const at = _position
      ? new window.__TAURI__.dpi.LogicalPosition(_position.x, _position.y)
      : undefined;
    await menu.popup(at);
  }

  function show(e, node) {
    _capture(e);
    _menu(async (items, item, sep) => {
      if (node.type === 'folder') {
        items.push(await item('New File', () => ExplorerTree.startCreate(node, 'file')));
        items.push(await item('New Folder', () => ExplorerTree.startCreate(node, 'folder')));
        items.push(await sep());
      }
      if (node.type === 'file') {
        items.push(await item('Duplicate', () => ExplorerTree.duplicate(node)));
        if (editor.canPreview(node.name)) {
          items.push(
            await item('Open Preview', () => {
              const f = state.getFile(node.id);
              if (f) editor.openPreview(f);
            }),
          );
        }
        items.push(await item('Pin to Pinboard', () => pinboard.pinFile(node)));
        items.push(await sep());
      }
      items.push(await item('Rename', () => ExplorerTree.startRename(node)));
      items.push(await item('Copy Path', () => ExplorerTree.copyPath(node)));
      items.push(await item(REVEAL_LABEL, () => ExplorerTree.revealInFinder(node)));
      items.push(await sep());
      items.push(await item('Delete', () => ExplorerTree.confirmDelete(node)));
    });
  }

  function showForNodes(e, nodes) {
    if (!nodes.length) return;
    if (nodes.length === 1) {
      show(e, nodes[0]);
      return;
    }
    _capture(e);
    _menu(async (items, item, sep) => {
      if (nodes.every((n) => n.type === 'file')) {
        items.push(await item('Copy Paths', () => ExplorerTree.copyPaths(nodes)));
        items.push(await sep());
      }
      items.push(
        await item(`Delete ${nodes.length} Items`, () => ExplorerTree.confirmDeleteMulti(nodes)),
      );
    });
  }

  function showEmpty(e, rootNode) {
    _capture(e);
    _menu(async (items, item, sep) => {
      items.push(await item('New File', () => ExplorerTree.startCreate(rootNode, 'file')));
      items.push(await item('New Folder', () => ExplorerTree.startCreate(rootNode, 'folder')));
      items.push(await sep());
      items.push(
        await item('Add Folder to Workspace', () => workspaceController.openFolderDialog()),
      );
    });
  }

  function showForRoot(e, rootNode) {
    _capture(e);
    _menu(async (items, item, sep) => {
      items.push(await item('New File', () => ExplorerTree.startCreate(rootNode, 'file')));
      items.push(await item('New Folder', () => ExplorerTree.startCreate(rootNode, 'folder')));
      items.push(await sep());
      items.push(
        await item('Add Folder to Workspace', () => workspaceController.openFolderDialog()),
      );
      items.push(await item('Copy Path', () => ExplorerTree.copyPath(rootNode)));
      items.push(await item(REVEAL_LABEL, () => ExplorerTree.revealRootInFinder(rootNode)));
      items.push(await sep());
      items.push(
        await item('Remove from Workspace', () => ExplorerTree.removeFolderFromWorkspace(rootNode)),
      );
      items.push(await item('Delete from Disk', () => ExplorerTree.deleteFolderFromDisk(rootNode)));
    });
  }

  function showAddFolder(e) {
    _capture(e);
    _menu(async (items, item) => {
      items.push(
        await item('Add Folder to Workspace', () => workspaceController.openFolderDialog()),
      );
    });
  }

  function showForTab(e, fileId) {
    _capture(e);
    const file = state.getFile(fileId);
    if (!file) return;
    _menu(async (items, item, sep) => {
      items.push(await item('Close', () => tabs.closeTab(fileId)));
      items.push(
        await item('Close Others', () => {
          state.openTabIds.filter((id) => id !== fileId).forEach((id) => tabs.closeTab(id));
        }),
      );
      items.push(
        await item('Close All', () => {
          [...state.openTabIds].forEach((id) => tabs.closeTab(id));
        }),
      );
      items.push(await sep());
      items.push(await item('Reveal in Explorer', () => ExplorerTree.revealFile(fileId)));
      items.push(
        await item(REVEAL_LABEL, () => {
          const dir = file.path.substring(0, file.path.lastIndexOf('/'));
          invoke('open_external', { url: `file://${dir}` }).catch(() => {});
        }),
      );
      items.push(await sep());
      items.push(
        await item('Copy Path', () => {
          invoke('write_clipboard', { text: file.path }).catch(() => {});
        }),
      );
    });
  }

  function hide() {
    _token += 1;
  }

  window.addEventListener('blur', hide);
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 2) hide();
    },
    true,
  );

  return { show, showForNodes, showEmpty, showForRoot, showAddFolder, showForTab, hide };
})();
