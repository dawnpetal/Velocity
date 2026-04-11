const PinboardCard = (() => {
  const PREVIEW_LINE_LIMIT = 5;
  const COPY_FLASH_DURATION = 700;
  const DRAG_INIT_DELAY = 0;
  const SVG = {
    run: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 4.5l12 7.5-12 7.5V4.5z" fill="currentColor"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    delete:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    drag: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="15" cy="5" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="19" r="1.2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/></svg>',
    duplicate:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  };
  function buildCard(snippet, context) {
    const {
      snippets,
      sortMode,
      activeEditorIds,
      findIdx,
      onRun,
      onOpenInEditor,
      onSave,
      onRender,
      onFilterByTag,
    } = context;
    const draggable = sortMode === "manual";
    const card = document.createElement("div");
    card.className = "pb-card";
    card.dataset.id = snippet.id;
    const header = document.createElement("div");
    header.className = "pb-card-header";
    const dragHandle = DomHelpers.el(
      "span",
      "pb-drag-handle" + (draggable ? "" : " pb-drag-disabled"),
    );
    dragHandle.innerHTML = SVG.drag;
    const labelWrap = DomHelpers.el("div", "pb-label-wrap");
    const labelEl = DomHelpers.el("span", "pb-card-label", snippet.label);
    labelEl.title = "Double-click to rename";
    labelEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startInlineRename(labelEl, snippet, context);
    });
    const tagsEl = DomHelpers.el("div", "pb-tags");
    (snippet.tags ?? []).forEach((tag) => {
      const tagEl = DomHelpers.el("span", "pb-tag", tag);
      tagEl.addEventListener("click", (e) => {
        e.stopPropagation();
        onFilterByTag(tag);
      });
      tagsEl.appendChild(tagEl);
    });
    labelWrap.append(labelEl, tagsEl);
    const cardRight = DomHelpers.el("div", "pb-card-right");
    const meta = DomHelpers.el("div", "pb-card-meta");
    if (snippet.runCount) {
      const runCountEl = DomHelpers.el(
        "span",
        "pb-meta-item",
        snippet.runCount + "x",
      );
      runCountEl.title = "Times executed";
      meta.appendChild(runCountEl);
    }
    if (snippet.lastRun) {
      const lastRunEl = DomHelpers.el(
        "span",
        "pb-meta-item",
        FormatHelpers.relTime(snippet.lastRun),
      );
      lastRunEl.title = "Last executed";
      meta.appendChild(lastRunEl);
    }
    if (activeEditorIds.has(snippet.id)) {
      meta.appendChild(DomHelpers.el("span", "pb-editing-badge", "editing"));
    }
    const actions = DomHelpers.el("div", "pb-card-actions");
    const runBtn = document.createElement("button");
    runBtn.className = "pb-btn pb-btn-run";
    runBtn.title = "Run  |  Shift+click to run and open output";
    runBtn.innerHTML = SVG.run;
    runBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRun(snippet, e.shiftKey);
    });
    const editBtn = document.createElement("button");
    editBtn.className = "pb-btn pb-btn-edit";
    editBtn.title = "Open in editor";
    editBtn.innerHTML = SVG.edit;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onOpenInEditor(snippet);
    });
    const copyBtn = document.createElement("button");
    copyBtn.className = "pb-btn pb-btn-copy";
    copyBtn.title = "Copy code";
    copyBtn.innerHTML = SVG.copy;
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await window.__TAURI__.core.invoke("write_clipboard", {
          text: snippet.code,
        });
        copyBtn.classList.add("pb-btn-flash");
        setTimeout(
          () => copyBtn.classList.remove("pb-btn-flash"),
          COPY_FLASH_DURATION,
        );
        toast.show("Copied", "ok", 1000);
      } catch {}
    });
    const moreBtn = document.createElement("button");
    moreBtn.className = "pb-btn pb-btn-more";
    moreBtn.title = "More";
    moreBtn.innerHTML = SVG.dots;
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showCardMenu(e, snippet, context);
    });
    actions.append(runBtn, editBtn, copyBtn, moreBtn);
    cardRight.append(meta, actions);
    header.append(dragHandle, labelWrap, cardRight);
    const preview = document.createElement("pre");
    preview.className = "pb-code-preview";
    _renderPreviewContent(preview, snippet.code);
    preview.addEventListener("click", () => onOpenInEditor(snippet));
    preview.title = "Click to edit";
    const statusBar = DomHelpers.el("div", "pb-status-bar");
    statusBar.id = "pb-status-" + snippet.id;
    card.append(header, preview, statusBar);
    if (draggable) {
      _attachDragHandlers(card, dragHandle, snippet, context);
    }
    return card;
  }
  function _renderPreviewContent(preview, code) {
    const lines = code.split("\n");
    preview.textContent = lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
    if (lines.length > PREVIEW_LINE_LIMIT) {
      const overflow = DomHelpers.el(
        "span",
        "pb-preview-more",
        " +" + (lines.length - PREVIEW_LINE_LIMIT) + " lines",
      );
      preview.appendChild(overflow);
    }
  }
  let _dragState = {
    idx: null,
    id: null,
  };
  function _attachDragHandlers(card, handle, snippet, context) {
    const { snippets, findIdx, onSave, onRender } = context;
    let ghost = null;
    let overCard = null;
    let overBefore = false;
    let startY = 0;
    let startX = 0;
    let origRect = null;
    function _cleanup() {
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      document
        .querySelectorAll(".pb-drop-before,.pb-drop-after")
        .forEach((c) => c.classList.remove("pb-drop-before", "pb-drop-after"));
      document
        .querySelectorAll(".pb-dragging")
        .forEach((c) => c.classList.remove("pb-dragging"));
      overCard = null;
      _dragState.idx = null;
      _dragState.id = null;
    }
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origRect = card.getBoundingClientRect();
      _dragState.idx = findIdx(snippet.id);
      _dragState.id = snippet.id;
      ghost = card.cloneNode(true);
      ghost.style.cssText = `
        position: fixed;
        left: ${origRect.left}px;
        top: ${origRect.top}px;
        width: ${origRect.width}px;
        z-index: 9999;
        pointer-events: none;
        opacity: 0.88;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
        transition: none;
        transform: scale(1.02);
      `;
      document.body.appendChild(ghost);
      card.classList.add("pb-dragging");
      function onMove(e) {
        if (_dragState.id !== snippet.id || !ghost) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        ghost.style.left = origRect.left + dx + "px";
        ghost.style.top = origRect.top + dy + "px";
        document
          .querySelectorAll(".pb-drop-before,.pb-drop-after")
          .forEach((c) =>
            c.classList.remove("pb-drop-before", "pb-drop-after"),
          );
        const list = document.querySelector(".pb-list");
        if (!list) return;
        let closestCard = null;
        let closestBefore = true;
        let closestDist = Infinity;
        list.querySelectorAll(".pb-card:not(.pb-dragging)").forEach((c) => {
          const r = c.getBoundingClientRect();
          const midY = r.top + r.height / 2;
          const dist = Math.abs(e.clientY - midY);
          if (dist < closestDist) {
            closestDist = dist;
            closestCard = c;
            closestBefore = e.clientY < midY;
          }
        });
        if (closestCard) {
          closestCard.classList.add(
            closestBefore ? "pb-drop-before" : "pb-drop-after",
          );
          overCard = closestCard;
          overBefore = closestBefore;
        }
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (_dragState.id !== snippet.id) return;
        if (overCard) {
          const targetId = overCard.dataset.id;
          const targetIdx = findIdx(targetId);
          const srcIdx = _dragState.idx;
          if (srcIdx !== null && srcIdx !== targetIdx) {
            const moved = snippets.splice(srcIdx, 1)[0];
            const destIdx = findIdx(targetId);
            snippets.splice(overBefore ? destIdx : destIdx + 1, 0, moved);
            onSave().catch(() => {});
            _cleanup();
            onRender();
            return;
          }
        }
        _cleanup();
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }
  function showCardMenu(e, snippet, context) {
    const {
      snippets,
      findIdx,
      onSave,
      onRender,
      onOpenInEditor,
      activeEditorIds,
    } = context;
    const menu = document.getElementById("ctxMenu");
    if (!menu) return;
    menu.innerHTML = "";
    const addItem = (label, icon, callback, isDanger) => {
      const btn = document.createElement("button");
      btn.className = "ctx-item" + (isDanger ? " danger" : "");
      btn.innerHTML = icon + "<span>" + label + "</span>";
      btn.addEventListener("click", () => {
        menu.classList.remove("open");
        callback();
      });
      menu.appendChild(btn);
    };
    addItem("Rename", SVG.edit, () => {
      const labelEl = document.querySelector(
        '.pb-card[data-id="' + snippet.id + '"] .pb-card-label',
      );
      if (labelEl) startInlineRename(labelEl, snippet, context);
    });
    addItem("Edit Tags", SVG.tag, () => editTags(snippet, context));
    addItem("Duplicate", SVG.duplicate, () => {
      const duplicated = Object.assign({}, snippet, {
        id: helpers.uid(),
        label: snippet.label + " copy",
        runCount: 0,
        lastRun: null,
        createdAt: Date.now(),
      });
      snippets.splice(findIdx(snippet.id) + 1, 0, duplicated);
      onSave().catch(() => {});
      onRender();
    });
    menu.appendChild(DomHelpers.sep());
    addItem("Copy Code", SVG.copy, async () => {
      try {
        await window.__TAURI__.core.invoke("write_clipboard", {
          text: snippet.code,
        });
        toast.show("Copied", "ok", 1200);
      } catch {}
    });
    menu.appendChild(DomHelpers.sep());
    addItem(
      "Delete",
      SVG.delete,
      () => {
        const idx = findIdx(snippet.id);
        if (idx !== -1) {
          activeEditorIds.delete(snippet.id);
          snippets.splice(idx, 1);
          onSave().catch(() => {});
          onRender();
        }
      },
      true,
    );
    menu.classList.add("open");
    menu.style.left = "0px";
    menu.style.top = "0px";
    requestAnimationFrame(() => {
      const { width, height } = menu.getBoundingClientRect();
      menu.style.left =
        Math.min(e.clientX, window.innerWidth - width - 4) + "px";
      menu.style.top =
        Math.min(e.clientY, window.innerHeight - height - 4) + "px";
    });
    const closeOnOutsideClick = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove("open");
        document.removeEventListener("click", closeOnOutsideClick, true);
      }
    };
    setTimeout(
      () => document.addEventListener("click", closeOnOutsideClick, true),
      0,
    );
  }
  function startInlineRename(labelEl, snippet, context) {
    const { snippets, findIdx, onSave, onRender } = context;
    const input = document.createElement("input");
    input.className = "pb-rename-input";
    input.value = snippet.label;
    labelEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const newLabel = input.value.trim();
      if (newLabel) {
        const idx = findIdx(snippet.id);
        if (idx !== -1) snippets[idx].label = newLabel;
        onSave().catch(() => {});
      }
      onRender();
    };
    input.addEventListener("blur", commit, {
      once: true,
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.removeEventListener("blur", commit);
        commit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        input.removeEventListener("blur", commit);
        onRender();
      }
    });
  }
  function editTags(snippet, context) {
    const { snippets, findIdx, onSave, onRender } = context;
    const box = document.getElementById("modal");
    const titleEl = document.getElementById("modalTitle");
    const bodyEl = document.getElementById("modalBody");
    const actionsEl = document.getElementById("modalActions");
    titleEl.textContent = "Edit Tags";
    bodyEl.innerHTML =
      '<p style="font-size:12px;color:var(--text2);margin:0 0 8px">Comma-separated tags (e.g. debug, movement)</p><input id="pbTagInput" class="pb-tag-input" value="' +
      helpers.escapeHtml((snippet.tags ?? []).join(", ")) +
      '" placeholder="debug, movement">';
    actionsEl.innerHTML = "";
    box.classList.add("open");
    const input = document.getElementById("pbTagInput");
    input.focus();
    input.select();
    const save = () => {
      const idx = findIdx(snippet.id);
      if (idx !== -1)
        snippets[idx].tags = input.value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      onSave().catch(() => {});
      box.classList.remove("open");
      onRender();
    };
    const cancel = () => box.classList.remove("open");
    const saveBtn = DomHelpers.btn("Save", "modal-btn primary", save);
    const cancelBtn = DomHelpers.btn("Cancel", "modal-btn secondary", cancel);
    actionsEl.append(cancelBtn, saveBtn);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") cancel();
    });
  }
  function buildEmpty(onAddNew) {
    const el = document.createElement("div");
    el.className = "pb-empty";
    el.innerHTML = [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
      '<line x1="12" y1="18" x2="12" y2="12"/>',
      '<line x1="9" y1="15" x2="15" y2="15"/>',
      "</svg>",
      "<span>No snippets yet</span>",
      "<small>Right-click any file in the explorer to pin it, or create one here.</small>",
      '<button class="pb-empty-btn">New Snippet</button>',
    ].join("");
    el.querySelector(".pb-empty-btn").addEventListener("click", onAddNew);
    return el;
  }
  function updatePreview(snippetId, newCode) {
    const card = document.querySelector(
      '.pb-card[data-id="' + snippetId + '"]',
    );
    if (!card) return;
    const preview = card.querySelector(".pb-code-preview");
    if (preview) _renderPreviewContent(preview, newCode);
    const badge = card.querySelector(".pb-editing-badge");
    if (badge) badge.remove();
  }
  return {
    buildCard,
    buildEmpty,
    showCardMenu,
    startInlineRename,
    editTags,
    updatePreview,
  };
})();
