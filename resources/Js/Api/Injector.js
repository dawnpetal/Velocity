const injector = (() => {
  async function execute(code) {
    await window.__TAURI__.core.invoke('inject_script', { code });
  }
  async function executeWithClientBridge(code) {
    await window.__TAURI__.core.invoke('inject_script_with_client_bridge', { code });
  }
  async function getPort() {
    return await window.__TAURI__.core.invoke('get_active_port');
  }
  async function getClientBridgePort() {
    return await window.__TAURI__.core.invoke('get_client_bridge_port');
  }
  function reset() {}
  async function discover() {}
  return { discover, execute, executeWithClientBridge, getPort, getClientBridgePort, reset };
})();
