const menuBar = (() => {
  async function killAgent() {}
  async function loadScripts() {
    try {
      return await window.__TAURI__.core.invoke("get_scripts");
    } catch {
      return [];
    }
  }
  async function saveScripts(scripts) {
    await window.__TAURI__.core.invoke("save_scripts", { scripts });
    await window.__TAURI__.core.invoke("reload_tray_scripts", { scripts });
    menuScriptsPanel.show();
  }
  async function init() {}
  return { init, killAgent, loadScripts, saveScripts };
})();
