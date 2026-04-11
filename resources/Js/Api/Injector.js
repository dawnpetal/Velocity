const injector = (() => {
  async function execute(code) {
    const executor = window.__velocityExecutor ?? "hydrogen";
    await window.__TAURI__.core.invoke("inject_script", {
      code,
      executor,
    });
  }
  async function getPort() {
    return await window.__TAURI__.core.invoke("get_active_port");
  }
  function reset() {}
  async function discover() {}
  return {
    discover,
    execute,
    getPort,
    reset,
  };
})();
