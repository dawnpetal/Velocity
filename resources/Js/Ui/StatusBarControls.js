const StatusBarControls = (() => {
  let _panel = null;
  let _anchor = null;

  function init() {
    _bind('statusCursor', _showCursor);
    _bind('statusLang', _showLanguage);
    _bind('statusEncoding', _showEncoding);
    _bind('statusEol', _showEol);
    _bind('statusIndent', _showIndent);
    document.addEventListener('mousedown', (e) => {
      if (!_panel) return;
      if (_panel.contains(e.target) || e.target === _anchor) return;
      close();
    });
    window.addEventListener('blur', close);
  }

  function _bind(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(el);
    });
  }

  function close() {
    _panel?.remove();
    _panel = null;
    _anchor?.classList.remove('status-item--open');
    _anchor = null;
  }

  function _open(anchor, title, items) {
    if (_anchor === anchor) {
      close();
      return;
    }
    close();
    _anchor = anchor;
    anchor.classList.add('status-item--open');
    const panel = document.createElement('div');
    panel.className = 'status-popover';
    panel.setAttribute('role', 'menu');
    const head = document.createElement('div');
    head.className = 'status-popover-title';
    head.textContent = title;
    panel.appendChild(head);
    for (const item of items) {
      if (item.separator) {
        panel.appendChild(
          Object.assign(document.createElement('div'), { className: 'status-popover-sep' }),
        );
        continue;
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'status-popover-row' + (item.checked ? ' checked' : '');
      const label = document.createElement('span');
      label.className = 'status-popover-label';
      label.textContent = item.label;
      const detail = document.createElement('span');
      detail.className = 'status-popover-detail';
      detail.textContent = item.detail ?? '';
      row.append(label, detail);
      row.addEventListener('click', async () => {
        close();
        await item.run?.();
        refresh();
      });
      panel.appendChild(row);
    }
    document.body.appendChild(panel);
    const r = anchor.getBoundingClientRect();
    requestAnimationFrame(() => {
      const pr = panel.getBoundingClientRect();
      panel.style.left =
        Math.max(8, Math.min(r.right - pr.width, window.innerWidth - pr.width - 8)) + 'px';
      panel.style.top = Math.max(8, r.top - pr.height - 6) + 'px';
    });
    _panel = panel;
  }

  function _showCursor(anchor) {
    const info = editor.getInfo?.() ?? {};
    const pos = info.position ?? { lineNumber: 1, column: 1 };
    _open(anchor, 'Go To', [
      {
        label: 'Go to Line/Column...',
        detail: `Current ${pos.lineNumber}:${pos.column}`,
        run: () => {
          const raw = window.prompt('Line:Column', `${pos.lineNumber}:${pos.column}`);
          if (!raw) return;
          const [line, column] = raw.split(':');
          editor.goToLineColumn(Number(line), Number(column || 1));
        },
      },
      {
        label: 'Go to Top',
        detail: 'Line 1',
        run: () => editor.goToLineColumn(1, 1),
      },
      {
        label: 'Go to Bottom',
        detail: `${info.lineCount || 1} lines`,
        run: () => editor.goToLineColumn(info.lineCount || 1, 1),
      },
    ]);
  }

  function _showLanguage(anchor) {
    const current = editor.getInfo?.().file?.languageOverride ?? null;
    const activeName = state.getActive()?.name ?? '';
    const inferred = LangMap.monacoLang(activeName);
    const langs = [
      ['lua', 'Lua'],
      ['javascript', 'JavaScript'],
      ['typescript', 'TypeScript'],
      ['html', 'HTML'],
      ['css', 'CSS'],
      ['json', 'JSON'],
      ['markdown', 'Markdown'],
      ['plaintext', 'Plain Text'],
    ];
    _open(
      anchor,
      'Select Language Mode',
      langs.map(([id, label]) => ({
        label,
        detail: id === inferred ? 'Detected' : '',
        checked: (current ?? inferred) === id,
        run: () => editor.setLanguageMode(id, label),
      })),
    );
  }

  function _showEncoding(anchor) {
    const file = state.getActive();
    const current = file?.encoding ?? 'UTF-8';
    _open(
      anchor,
      'Select Encoding',
      ['UTF-8', 'UTF-16 LE', 'UTF-16 BE', 'ISO-8859-1'].map((enc) => ({
        label: enc,
        detail: enc === 'UTF-8' ? 'Default' : '',
        checked: current === enc,
        run: () => editor.setEncoding(enc),
      })),
    );
  }

  function _showEol(anchor) {
    const file = state.getActive();
    const current = file?.eol ?? 'LF';
    _open(
      anchor,
      'Select End of Line Sequence',
      ['LF', 'CRLF'].map((eol) => ({
        label: eol,
        detail: eol === 'LF' ? '\\n' : '\\r\\n',
        checked: current === eol,
        run: () => editor.setEol(eol),
      })),
    );
  }

  function _showIndent(anchor) {
    const file = state.getActive();
    const size = file?.indentSize ?? 2;
    const spaces = file?.insertSpaces !== false;
    _open(anchor, 'Select Indentation', [
      ...[2, 4, 8].map((n) => ({
        label: `Tab Size ${n}`,
        detail: spaces ? 'Spaces' : 'Tabs',
        checked: size === n,
        run: () => editor.setIndentation(n, spaces),
      })),
      { separator: true },
      {
        label: 'Indent Using Spaces',
        detail: `Size ${size}`,
        checked: spaces,
        run: () => editor.setIndentation(size, true),
      },
      {
        label: 'Indent Using Tabs',
        detail: `Size ${size}`,
        checked: !spaces,
        run: () => editor.setIndentation(size, false),
      },
    ]);
  }

  function refresh() {}

  return { init, refresh, close };
})();
