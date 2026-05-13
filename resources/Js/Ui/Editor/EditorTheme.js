const EditorTheme = (() => {
  function _resolveVar(name, fallback) {
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  }
  function build(monaco) {
    const bg3 = _resolveVar('--bg3', '#1c1c1c');
    const bg4 = _resolveVar('--bg4', '#242424');
    const border = _resolveVar('--border', '#2a2a2a');
    const text0 = _resolveVar('--text0', '#f0f0f0');
    const text1 = _resolveVar('--text1', '#b0b0b0');
    const text2 = _resolveVar('--text2', '#777777');
    const text3 = _resolveVar('--text3', '#525252');
    const accent = _resolveVar('--accent', '#3b8eea').replace('#', '');
    const warn = _resolveVar('--warn', '#e5a827').replace('#', '');
    const synKw = _resolveVar('--syn-kw', '#79b8ff').replace('#', '');
    const synStr = _resolveVar('--syn-str', '#9ecbff').replace('#', '');
    const synNum = _resolveVar('--syn-num', '#79b8ff').replace('#', '');
    const synCmt = _resolveVar('--syn-cmt', '#444444').replace('#', '');
    const synBi = _resolveVar('--syn-bi', '#b392f0').replace('#', '');
    const synFn = _resolveVar('--syn-fn', '#b392f0').replace('#', '');
    const lightThemes = new Set(['light', 'pink', 'purple']);
    const base = lightThemes.has(document.documentElement.getAttribute('data-theme'))
      ? 'vs'
      : 'vs-dark';
    const widgetBg = base === 'vs' ? _resolveVar('--surface-0', bg3) : bg4;
    const widgetStatusBg = base === 'vs' ? _resolveVar('--surface-3', bg4) : bg3;
    const lineHighlight = '#ffffff04';
    const lineNumber = base === 'vs' ? text2 : text3;
    const activeLineNumber = base === 'vs' ? text1 : text0;
    monaco.editor.defineTheme('velocityui', {
      base,
      inherit: true,
      rules: [
        {
          token: 'keyword',
          foreground: synKw,
        },
        {
          token: 'string',
          foreground: synStr,
        },
        {
          token: 'number',
          foreground: synNum,
        },
        {
          token: 'comment',
          foreground: synCmt,
          fontStyle: 'italic',
        },
        {
          token: 'type',
          foreground: synBi,
        },
        {
          token: 'identifier.function',
          foreground: synFn,
        },
        {
          token: 'delimiter',
          foreground: text0.replace('#', ''),
        },
      ],
      colors: {
        'editor.background': bg3,
        'editor.foreground': text0,
        'editor.lineHighlightBackground': lineHighlight,
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': `#${accent}28`,
        'editor.inactiveSelectionBackground': bg4,
        'editorCursor.foreground': `#${accent}`,
        'editorLineNumber.foreground': lineNumber,
        'editorLineNumber.activeForeground': activeLineNumber,
        'editorIndentGuide.background': border,
        'editorIndentGuide.activeBackground': '#525252',
        'editorWhitespace.foreground': text3,
        'editorBracketMatch.background': `#${accent}18`,
        'editorBracketMatch.border': `#${accent}`,
        'editorWarning.foreground': `#${warn}`,
        'editorOverviewRuler.warningForeground': `#${warn}`,
        'editorWidget.background': widgetBg,
        'editorWidget.border': border,
        'editorHoverWidget.background': widgetBg,
        'editorHoverWidget.foreground': text0,
        'editorHoverWidget.border': border,
        'editorHoverWidget.statusBarBackground': widgetStatusBg,
        'editorSuggestWidget.background': bg4,
        'editorSuggestWidget.border': border,
        'editorSuggestWidget.selectedBackground': bg3,
        'editorSuggestWidget.highlightForeground': `#${accent}`,
        'editorGutter.background': bg3,
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#292929aa',
        'scrollbarSlider.hoverBackground': '#292929',
        'scrollbarSlider.activeBackground': '#525252',
        'minimap.background': bg3,
        'minimap.selectionHighlight': `#${accent}28`,
        'input.background': bg4,
        'input.border': border,
        'input.foreground': text0,
        'dropdown.background': bg4,
        'dropdown.border': border,
        'list.hoverBackground': bg4,
        'list.activeSelectionBackground': bg3,
        focusBorder: `#${accent}`,
        'textLink.foreground': `#${accent}`,
      },
    });
    monaco.editor.setTheme('velocityui');
  }
  function apply(monaco) {
    build(monaco);
    monaco.editor.setTheme('velocityui');
  }
  function currentThemeId() {
    return 'velocityui';
  }
  return {
    build,
    apply,
    currentThemeId,
  };
})();
