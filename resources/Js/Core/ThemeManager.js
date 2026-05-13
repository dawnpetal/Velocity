const themeManager = (() => {
  const THEMES = [
    {
      id: 'carbon',
      label: 'Carbon',
      desc: 'Pure black + blue',
      palette: ['#4d9eff', '#c084fc', '#86efac', '#141414'],
    },
    {
      id: 'nord',
      label: 'Nord',
      desc: 'Cool slate blue',
      palette: ['#88c0d0', '#81a1c1', '#a3be8c', '#1e2430'],
    },
    {
      id: 'tokyo',
      label: 'Tokyo Night',
      desc: 'Deep blue purple',
      palette: ['#7c88fa', '#cba6f7', '#a6e3a1', '#13131f'],
    },
    {
      id: 'monokai',
      label: 'Monokai',
      desc: 'Warm classic contrast',
      palette: ['#fd971f', '#f92672', '#a6e22e', '#1e1e20'],
    },
    {
      id: 'gruvbox',
      label: 'Gruvbox',
      desc: 'Earthy warm tones',
      palette: ['#d79921', '#fb4934', '#b8bb26', '#282828'],
    },
    {
      id: 'rose-pine',
      label: 'Rosé Pine',
      desc: 'Muted pastel dark',
      palette: ['#c4a7e7', '#eb6f92', '#9ccfd8', '#141018'],
    },
    {
      id: 'slate',
      label: 'Slate',
      desc: 'GitHub-style grey',
      palette: ['#58a6ff', '#ff7b72', '#3fb950', '#1c2128'],
    },
    {
      id: 'onyx',
      label: 'Onyx',
      desc: 'Pure minimal black',
      palette: ['#c8c8c8', '#888888', '#242424', '#000000'],
    },
    {
      id: 'pink',
      label: 'Pink',
      desc: 'Strawberry milk UI',
      palette: ['#f06aa9', '#ffe4f2', '#a989ff', '#fffaff'],
    },
    {
      id: 'purple',
      label: 'Purple',
      desc: 'Lavender soft UI',
      palette: ['#9f7cff', '#eadfff', '#f18ac7', '#f8f3ff'],
    },
    {
      id: 'light',
      label: 'Light',
      desc: 'Clean warm daylight',
      palette: ['#b2768e', '#6f93c2', '#cd9651', '#fff7e8'],
    },
  ];
  const KEY = 'VelocityUI_theme';
  const CUSTOM_KEY = 'VelocityUI_customTheme';
  const CUSTOM_DEFAULTS = {
    '--bg0': '#0a0a0a',
    '--bg1': '#111111',
    '--bg2': '#161616',
    '--bg3': '#1c1c1c',
    '--bg4': '#242424',
    '--bg5': '#2e2e2e',
    '--border': '#1e1e1e',
    '--border-strong': '#333333',
    '--text0': '#f2f2f2',
    '--text1': '#b0b0b0',
    '--text2': '#606060',
    '--text3': '#383838',
    '--accent': '#3b8eea',
    '--ok': '#3dba6f',
    '--warn': '#e5a827',
    '--fail': '#e5534b',
    '--syn-kw': '#79b8ff',
    '--syn-str': '#9ecbff',
    '--syn-num': '#79b8ff',
    '--syn-cmt': '#444444',
    '--syn-bi': '#b392f0',
    '--syn-fn': '#b392f0',
  };
  let _customBound = false;

  function _readCustom() {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}');
      return { ...CUSTOM_DEFAULTS, ...saved };
    } catch {
      return { ...CUSTOM_DEFAULTS };
    }
  }

  function _writeCustom(values) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(values));
  }

  function _clearCustomVars() {
    for (const key of Object.keys(CUSTOM_DEFAULTS))
      document.documentElement.style.removeProperty(key);
    ['--accent-dim', '--accent-hover', '--accent-active'].forEach((key) =>
      document.documentElement.style.removeProperty(key),
    );
  }

  function _withAlpha(hex, alpha) {
    const clean = String(hex).replace('#', '');
    if (clean.length !== 6) return `rgba(59, 142, 234, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function _applyCustom(values = _readCustom()) {
    for (const [key, value] of Object.entries(values))
      document.documentElement.style.setProperty(key, value);
    document.documentElement.style.setProperty(
      '--accent-dim',
      _withAlpha(values['--accent'], 0.08),
    );
    document.documentElement.style.setProperty(
      '--accent-hover',
      _withAlpha(values['--accent'], 0.14),
    );
    document.documentElement.style.setProperty(
      '--accent-active',
      _withAlpha(values['--accent'], 0.22),
    );
  }

  function apply(id) {
    if (id === 'custom') {
      document.documentElement.setAttribute('data-theme', 'custom');
      _applyCustom();
      try {
        localStorage.setItem(KEY, 'custom');
      } catch {}
      editor.applyTheme('custom');
      return;
    }
    const valid = THEMES.find((t) => t.id === id) ? id : 'carbon';
    _clearCustomVars();
    document.documentElement.setAttribute('data-theme', valid);
    try {
      localStorage.setItem(KEY, valid);
    } catch {}
    editor.applyTheme(valid);
  }

  function _validTheme(id) {
    return id === 'custom' || THEMES.some((theme) => theme.id === id) ? id : 'carbon';
  }

  function load() {
    let saved = 'carbon';
    try {
      saved = localStorage.getItem(KEY) ?? 'carbon';
    } catch {}
    const valid = _validTheme(saved);
    if (valid === 'custom') _applyCustom();
    else _clearCustomVars();
    document.documentElement.setAttribute('data-theme', valid);
    if (valid !== saved) {
      try {
        localStorage.setItem(KEY, valid);
      } catch {}
    }
  }

  function current() {
    return _validTheme(document.documentElement.getAttribute('data-theme') ?? 'carbon');
  }

  function _themeCard(theme, cur) {
    const card = document.createElement('div');
    card.className = 'theme-card' + (theme.id === cur ? ' active' : '');
    card.dataset.themeCard = theme.id;
    card.style.setProperty('--theme-card-a', theme.palette[0] || '#8f5cff');
    card.style.setProperty('--theme-card-b', theme.palette[1] || theme.palette[0] || '#e8dcff');
    card.style.setProperty('--theme-card-c', theme.palette[2] || theme.palette[0] || '#ff78c4');
    card.style.setProperty('--theme-card-d', theme.palette[3] || '#fffefe');
    const dots = document.createElement('div');
    dots.className = 'theme-dots';
    theme.palette.forEach((color, i) => {
      const dot = document.createElement('div');
      dot.className = 'theme-dot';
      dot.style.background = color;
      if (i === 3) dot.style.border = '1px solid #555';
      dots.appendChild(dot);
    });
    const name = document.createElement('div');
    name.className = 'theme-name';
    name.textContent = theme.label;
    const desc = document.createElement('div');
    desc.className = 'theme-desc';
    desc.textContent = theme.desc;
    card.append(dots, name, desc);
    card.addEventListener('click', () => {
      if (theme.id === 'custom') {
        openCustomOverlay();
        return;
      }
      apply(theme.id);
      renderGrid();
    });
    return card;
  }

  function renderGrid() {
    const grid = document.getElementById('themeGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const cur = current();
    for (const theme of THEMES) grid.appendChild(_themeCard(theme, cur));
    const custom = _readCustom();
    grid.appendChild(
      _themeCard(
        {
          id: 'custom',
          label: 'Custom',
          desc: 'Your local theme',
          palette: [custom['--accent'], custom['--text0'], custom['--bg3'], custom['--bg0']],
        },
        cur,
      ),
    );
    renderCustomEditor();
  }

  function openCustomOverlay() {
    renderCustomEditor();
    document.getElementById('customThemePanel')?.classList.add('open');
    document.getElementById('customThemePanel')?.setAttribute('aria-hidden', 'false');
    apply('custom');
    renderGrid();
  }

  function closeCustomOverlay() {
    document.getElementById('customThemePanel')?.classList.remove('open');
    document.getElementById('customThemePanel')?.setAttribute('aria-hidden', 'true');
  }

  function renderCustomEditor() {
    const form = document.getElementById('customThemeFields');
    if (!form) return;
    const values = _readCustom();
    form.innerHTML = '';
    for (const [key, value] of Object.entries(values)) {
      const field = document.createElement('label');
      field.className = 'custom-theme-field';
      const name = document.createElement('span');
      name.textContent = key.replace('--', '');
      const input = document.createElement('input');
      input.type = 'color';
      input.value = value;
      input.dataset.themeVar = key;
      input.addEventListener('input', () => {
        const values = _collectCustomFields();
        _applyCustom(values);
        document.documentElement.setAttribute('data-theme', 'custom');
        editor.applyTheme('custom');
      });
      field.append(name, input);
      form.appendChild(field);
    }
    _bindCustomControls();
  }

  function _collectCustomFields() {
    const values = { ...CUSTOM_DEFAULTS };
    document.querySelectorAll('#customThemeFields input[data-theme-var]').forEach((input) => {
      values[input.dataset.themeVar] = input.value;
    });
    return values;
  }

  function _bindCustomControls() {
    if (_customBound) return;
    _customBound = true;
    document.getElementById('customThemeSave')?.addEventListener('click', () => {
      _writeCustom(_collectCustomFields());
      apply('custom');
      renderGrid();
      closeCustomOverlay();
      toast.show('Custom theme saved', 'ok');
    });
    document.getElementById('customThemeReset')?.addEventListener('click', () => {
      _writeCustom({ ...CUSTOM_DEFAULTS });
      apply('custom');
      renderGrid();
      toast.show('Custom theme reset', 'ok');
    });
    document.getElementById('customThemeClose')?.addEventListener('click', closeCustomOverlay);
    document.getElementById('customThemeExport')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(_readCustom(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'VelocityUI-custom-theme.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById('customThemeImport')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const values = JSON.parse(await file.text());
        _writeCustom({ ...CUSTOM_DEFAULTS, ...values });
        apply('custom');
        renderGrid();
        toast.show('Custom theme imported', 'ok');
      } catch {
        toast.show('Invalid theme file', 'fail');
      } finally {
        e.target.value = '';
      }
    });
    document.getElementById('customThemeImportBtn')?.addEventListener('click', () => {
      document.getElementById('customThemeImport')?.click();
    });
  }

  return {
    apply,
    load,
    current,
    renderGrid,
    renderCustomEditor,
    openCustomOverlay,
  };
})();
