const DomHelpers = (() => {
  function el(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function btn(text, className, onClick) {
    const node = document.createElement("button");
    node.className = className;
    node.textContent = text;
    node.addEventListener("click", onClick);
    return node;
  }
  function sep() {
    const node = document.createElement("div");
    node.className = "ctx-sep";
    return node;
  }
  return {
    el,
    btn,
    sep,
  };
})();
