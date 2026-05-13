const scheduler = (() => {
  function frame(fn) {
    let raf = 0;
    let lastArgs = [];
    const run = (...args) => {
      lastArgs = args;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const queuedArgs = lastArgs;
        lastArgs = [];
        fn(...queuedArgs);
      });
    };
    run.cancel = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastArgs = [];
    };
    return run;
  }

  function delay(fn, ms = 0) {
    let timer = 0;
    let lastArgs = [];
    const run = (...args) => {
      lastArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = 0;
        const queuedArgs = lastArgs;
        lastArgs = [];
        fn(...queuedArgs);
      }, ms);
    };
    run.cancel = () => {
      clearTimeout(timer);
      timer = 0;
      lastArgs = [];
    };
    run.flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      const queuedArgs = lastArgs;
      lastArgs = [];
      fn(...queuedArgs);
    };
    return run;
  }

  function idle(fn, timeout = 500) {
    const request = window.requestIdleCallback
      ? (cb) => window.requestIdleCallback(cb, { timeout })
      : (cb) => setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 1);
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = request(fn);
    return () => cancel(handle);
  }

  return { frame, delay, idle };
})();
