const modal = (() => {
  function _el() {
    return document.getElementById("modal");
  }
  function _titleEl() {
    return document.getElementById("modalTitle");
  }
  function _bodyEl() {
    return document.getElementById("modalBody");
  }
  function _actionsEl() {
    return document.getElementById("modalActions");
  }
  function _open(title, body) {
    _titleEl().textContent = title;
    _bodyEl().innerHTML = body;
    _actionsEl().innerHTML = "";
    _el().classList.add("open");
  }
  function close() {
    _el().classList.remove("open");
  }
  document.addEventListener("click", (e) => {
    const el = _el();
    if (el && e.target === el) close();
  });
  document.addEventListener("keydown", (e) => {
    const el = _el();
    if (!el?.classList.contains("open")) return;
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "Enter") {
      const actions = _actionsEl();
      const primary =
        actions?.querySelector(".primary") ?? actions?.querySelector(".danger");
      if (primary) primary.click();
    }
  });
  function _btn(text, cls, onClick) {
    const btn = document.createElement("button");
    btn.className = `modal-btn ${cls}`;
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }
  function confirm(title, body) {
    return new Promise((resolve) => {
      _open(title, body);
      _actionsEl().append(
        _btn("Cancel", "secondary", () => {
          close();
          resolve(false);
        }),
        _btn("Delete", "danger", () => {
          close();
          resolve(true);
        }),
      );
    });
  }
  function ask(title, body, choices) {
    return new Promise((resolve) => {
      _open(title, body);
      choices.forEach((label, i) =>
        _actionsEl().appendChild(
          _btn(label, i === 0 ? "primary" : "secondary", () => {
            close();
            resolve(label);
          }),
        ),
      );
    });
  }
  function alert(title, body) {
    _open(title, body);
    _actionsEl().appendChild(_btn("OK", "secondary", close));
  }
  return {
    confirm,
    ask,
    alert,
    close,
  };
})();
