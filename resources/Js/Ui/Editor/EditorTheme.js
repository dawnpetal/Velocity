const EditorTheme = (() => {
  function _resolveVar(name, fallback) {
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  }
  function build(monaco) {
    const bg3 = _resolveVar('--bg3', '#1c1c1c');
    const bg4 = _resolveVar('--bg4', '#242424');
    const border = _resolveVar('--border', '#2a2a2a');
    monaco.editor.defineTheme('velocityui', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        {
          token: 'keyword',
          foreground: 'c084fc',
        },
        {
          token: 'string',
          foreground: '86efac',
        },
        {
          token: 'number',
          foreground: 'fb923c',
        },
        {
          token: 'comment',
          foreground: '6b7280',
          fontStyle: 'italic',
        },
        {
          token: 'type',
          foreground: '67e8f9',
        },
        {
          token: 'identifier.function',
          foreground: '60a5fa',
        },
        {
          token: 'delimiter',
          foreground: 'f1f5f9',
        },
      ],
      colors: {
        'editor.background': bg3,
        'editor.foreground': '#f0f0f0',
        'editor.lineHighlightBackground': '#ffffff06',
        'editor.selectionBackground': '#7c3aed28',
        'editor.inactiveSelectionBackground': bg4,
        'editorCursor.foreground': '#7c3aed',
        'editorLineNumber.foreground': '#525252',
        'editorLineNumber.activeForeground': '#f0f0f0',
        'editorIndentGuide.background': border,
        'editorIndentGuide.activeBackground': '#525252',
        'editorWhitespace.foreground': '#525252',
        'editorBracketMatch.background': '#7c3aed18',
        'editorBracketMatch.border': '#7c3aed',
        'editorWidget.background': bg4,
        'editorWidget.border': border,
        'editorSuggestWidget.background': bg4,
        'editorSuggestWidget.border': border,
        'editorSuggestWidget.selectedBackground': bg3,
        'editorSuggestWidget.highlightForeground': '#7c3aed',
        'editorGutter.background': bg3,
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#292929aa',
        'scrollbarSlider.hoverBackground': '#292929',
        'scrollbarSlider.activeBackground': '#525252',
        'minimap.background': bg3,
        'minimap.selectionHighlight': '#7c3aed28',
        'input.background': bg4,
        'input.border': border,
        'input.foreground': '#f0f0f0',
        'dropdown.background': bg4,
        'dropdown.border': border,
        'list.hoverBackground': bg4,
        'list.activeSelectionBackground': bg3,
        focusBorder: '#7c3aed',
        'textLink.foreground': '#7c3aed',
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
