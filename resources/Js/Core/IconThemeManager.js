const iconThemeManager = (() => {
  const invoke = window.__TAURI__.core.invoke;
  const BUILTIN_ID = "material";
  let _registry = [];
  async function load() {
    await invoke("icon_theme_load");
    _registry = await invoke("icon_theme_get_registry");
  }
  async function getActive() {
    return await invoke("icon_theme_get_active");
  }
  async function getInstalled() {
    return new Set(await invoke("icon_theme_get_installed"));
  }
  function getRegistry() {
    return _registry;
  }
  async function isInstalled(id) {
    return await invoke("icon_theme_is_installed", {
      id,
    });
  }
  async function isActive(id) {
    return await invoke("icon_theme_is_active", {
      id,
    });
  }
  function resolveIconDir(id) {
    return id && id !== BUILTIN_ID ? `__installed__:${id}` : "icons/files/";
  }
  async function activate(id) {
    const ok = await invoke("icon_theme_activate", {
      id,
    });
    if (ok) {
      await helpers.reloadIcons();
      ExplorerTree.render();
      tabs.render();
    }
    return ok;
  }
  async function loadInstalledIcons(themeId) {
    if (!themeId || themeId === BUILTIN_ID) return null;
    const result = await invoke("icon_theme_load_installed_icons", {
      themeId,
    });
    if (!result) return null;
    const [iconsJson, iconDir] = result;
    return {
      iconsJson,
      iconDir,
    };
  }
  async function install(pack, onProgress) {
    if (pack.builtin) {
      await invoke("icon_theme_activate", {
        id: pack.id,
      });
      return true;
    }
    onProgress?.("Downloading and installing…");
    try {
      await invoke("icon_theme_install", {
        id: pack.id,
      });
      onProgress?.("Done!");
      return true;
    } catch (e) {
      toast.show(`Installation failed: ${e}`, "warn", 8000);
      return false;
    }
  }
  async function uninstall(id) {
    if (id === BUILTIN_ID) return false;
    const ok = await invoke("icon_theme_uninstall", {
      id,
    });
    if (ok) {
      const active = await getActive();
      if (active === BUILTIN_ID) {
        await helpers.reloadIcons();
        ExplorerTree.render();
        tabs.render();
      }
    }
    return ok;
  }
  function renderList() {
    const el = document.getElementById("iconThemeList");
    if (!el) return;
    el.innerHTML = "";
    Promise.all([getActive(), getInstalled()]).then(
      ([activeId, installedSet]) => {
        for (const pack of _registry) {
          const row = document.createElement("div");
          row.className =
            "icon-theme-row" + (pack.id === activeId ? " active" : "");
          const info = document.createElement("div");
          info.className = "icon-theme-info";
          const name = document.createElement("span");
          name.className = "icon-theme-name";
          name.textContent = pack.name;
          const meta = document.createElement("span");
          meta.className = "icon-theme-meta";
          meta.textContent = pack.author + (pack.builtin ? " · built-in" : "");
          const desc = document.createElement("span");
          desc.className = "icon-theme-desc";
          desc.textContent = pack.description;
          info.append(name, meta, desc);
          const actions = document.createElement("div");
          actions.className = "icon-theme-actions";
          if (pack.id === activeId) {
            const badge = document.createElement("span");
            badge.className = "icon-theme-active-badge";
            badge.textContent = "Active";
            actions.appendChild(badge);
          } else if (installedSet.has(pack.id)) {
            const setBtn = document.createElement("button");
            setBtn.className = "settings-action-btn";
            setBtn.textContent = "Set Active";
            setBtn.addEventListener("click", async () => {
              await activate(pack.id);
              renderList();
              toast.show(`Icon theme: ${pack.name}`, "ok", 1800);
            });
            const unBtn = document.createElement("button");
            unBtn.className = "settings-action-btn settings-action-btn--danger";
            unBtn.textContent = "Remove";
            unBtn.addEventListener("click", async () => {
              await uninstall(pack.id);
              renderList();
            });
            actions.append(setBtn, unBtn);
          } else {
            const installBtn = document.createElement("button");
            installBtn.className = "settings-action-btn";
            installBtn.textContent = "Install";
            const errorLabel = document.createElement("span");
            errorLabel.className = "icon-theme-error";
            errorLabel.style.cssText =
              "color:var(--red,#e06c75);font-size:0.78em;margin-top:4px;display:none;word-break:break-word;max-width:260px;";
            installBtn.addEventListener("click", async () => {
              installBtn.disabled = true;
              installBtn.textContent = "Downloading…";
              errorLabel.style.display = "none";
              errorLabel.textContent = "";
              let lastError = "Installation failed.";
              const _origShow = toast.show.bind(toast);
              toast.show = (msg, type, dur) => {
                if (type === "warn" || type === "error") lastError = msg;
                _origShow(msg, type, dur);
              };
              const ok = await install(pack, (msg) => {
                installBtn.textContent = msg;
              });
              toast.show = _origShow;
              if (ok) {
                renderList();
                toast.show(`Installed: ${pack.name}`, "ok", 2000);
              } else {
                installBtn.disabled = false;
                installBtn.textContent = "Retry";
                errorLabel.textContent = lastError;
                errorLabel.style.display = "block";
              }
            });
            actions.appendChild(installBtn);
            actions.appendChild(errorLabel);
          }
          row.append(info, actions);
          el.appendChild(row);
        }
      },
    );
  }
  return {
    load,
    activate,
    install,
    uninstall,
    getActive,
    getInstalled,
    getRegistry,
    isInstalled,
    isActive,
    resolveIconDir,
    loadInstalledIcons,
    renderList,
  };
})();
