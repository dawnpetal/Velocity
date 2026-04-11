const eventBus = (() => {
  const _listeners = new Map();
  function on(event, handler) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(handler);
    return () => _listeners.get(event)?.delete(handler);
  }
  function off(event, handler) {
    _listeners.get(event)?.delete(handler);
  }
  function emit(event, data = {}) {
    const handlers = _listeners.get(event);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[eventBus] "${event}" handler threw:`, err);
      }
    }
  }
  function once(event, handler) {
    const unsub = on(event, (data) => {
      unsub();
      handler(data);
    });
    return unsub;
  }
  return {
    on,
    off,
    emit,
    once,
  };
})();
