const EditorTheme = (() => {
  let _built = false;
  function build(monaco) {
    if (_built) return;
    _built = true;
    monaco.editor.defineTheme("velocity", {
      base: "vs-dark",
      inherit: true,
      rules: [
        {
          token: "keyword",
          foreground: "c084fc",
        },
        {
          token: "string",
          foreground: "86efac",
        },
        {
          token: "number",
          foreground: "fb923c",
        },
        {
          token: "comment",
          foreground: "6b7280",
          fontStyle: "italic",
        },
        {
          token: "type",
          foreground: "67e8f9",
        },
        {
          token: "identifier.function",
          foreground: "60a5fa",
        },
        {
          token: "delimiter",
          foreground: "f1f5f9",
        },
      ],
      colors: {
        "editor.background": "#1a1a1a",
        "editor.foreground": "#f0f0f0",
        "editor.lineHighlightBackground": "#202020",
        "editor.selectionBackground": "#7c3aed28",
        "editor.inactiveSelectionBackground": "#292929",
        "editorCursor.foreground": "#7c3aed",
        "editorLineNumber.foreground": "#525252",
        "editorLineNumber.activeForeground": "#f0f0f0",
        "editorIndentGuide.background": "#2a2a2a",
        "editorIndentGuide.activeBackground": "#525252",
        "editorWhitespace.foreground": "#525252",
        "editorBracketMatch.background": "#7c3aed18",
        "editorBracketMatch.border": "#7c3aed",
        "editorWidget.background": "#202020",
        "editorWidget.border": "#2a2a2a",
        "editorSuggestWidget.background": "#202020",
        "editorSuggestWidget.border": "#2a2a2a",
        "editorSuggestWidget.selectedBackground": "#292929",
        "editorSuggestWidget.highlightForeground": "#7c3aed",
        "editorGutter.background": "#1a1a1a",
        "scrollbar.shadow": "#00000000",
        "scrollbarSlider.background": "#292929aa",
        "scrollbarSlider.hoverBackground": "#292929",
        "scrollbarSlider.activeBackground": "#525252",
        "minimap.background": "#1a1a1a",
        "minimap.selectionHighlight": "#7c3aed28",
        "input.background": "#202020",
        "input.border": "#2a2a2a",
        "input.foreground": "#f0f0f0",
        "dropdown.background": "#202020",
        "dropdown.border": "#2a2a2a",
        "list.hoverBackground": "#202020",
        "list.activeSelectionBackground": "#292929",
        focusBorder: "#7c3aed",
        "textLink.foreground": "#7c3aed",
      },
    });
    monaco.editor.setTheme("velocity");
  }
  function apply(monaco) {
    build(monaco);
  }
  function currentThemeId() {
    return "velocity";
  }
  return {
    build,
    apply,
    currentThemeId,
  };
})();
