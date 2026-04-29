const toast = (() => {
  function show(text, type = 'info', duration = 2500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = text;
    const dismiss = document.createElement('button');
    dismiss.className = 'toast-dismiss';
    dismiss.innerHTML = '&#x2715;';
    dismiss.addEventListener('click', () => _remove(el));
    el.appendChild(msg);
    el.appendChild(dismiss);
    container.appendChild(el);
    el._toastTimer = setTimeout(() => _remove(el), duration);
  }
  function _remove(el) {
    if (el._removed) return;
    el._removed = true;
    clearTimeout(el._toastTimer);
    el.style.animation = 'toastOut 0.16s ease forwards';
    const cleanup = () => el.remove();
    el.addEventListener('animationend', cleanup, {
      once: true,
    });
    setTimeout(cleanup, 300);
  }
  return {
    show,
  };
})();
