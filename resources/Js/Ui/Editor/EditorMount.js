const EditorMount = (() => {
  const MONACO_CDN =
    "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs";
  const EDITOR_OPTIONS = (settings) => ({
    value: "",
    language: "lua",
    fontSize: settings.fontSize,
    fontFamily:
      "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
    fontLigatures: true,
    lineNumbers: settings.lineNumbers ? "on" : "off",
    minimap: {
      enabled: settings.minimap,
    },
    wordWrap: settings.wordWrap ? "on" : "off",
    renderWhitespace: "none",
    smoothScrolling: false,
    cursorSmoothCaretAnimation: "off",
    cursorBlinking: "blink",
    bracketPairColorization: {
      enabled: false,
    },
    guides: {
      indentation: true,
      bracketPairs: false,
    },
    wordBasedSuggestions: "currentDocument",
    suggest: {
      showKeywords: true,
      showSnippets: true,
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    scrollBeyondLastLine: false,
    padding: {
      top: 12,
      bottom: 12,
    },
    automaticLayout: true,
    renderLineHighlight: "line",
    occurrencesHighlight: "off",
    codeLens: false,
    colorDecorators: false,
    folding: true,
    foldingHighlight: false,
    showFoldingControls: "mouseover",
    contextmenu: true,
    stickyScroll: {
      enabled: false,
    },
    hover: {
      delay: 600,
    },
    parameterHints: {
      enabled: true,
    },
    lightbulb: {
      enabled: "off",
    },
    inlayHints: {
      enabled: "off",
    },
    inlineSuggest: {
      enabled: false,
    },
  });
  function _loadScript() {
    return new Promise((resolve, reject) => {
      if (window.monaco) {
        resolve(window.monaco);
        return;
      }
      window.MonacoEnvironment = {
        getWorkerUrl: function (_moduleId, label) {
          return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: '${MONACO_CDN}/../' };
            importScripts('${MONACO_CDN}/base/worker/workerMain.js');
          `)}`;
        },
      };
      const script = document.createElement("script");
      script.src = `${MONACO_CDN}/loader.js`;
      script.onload = () => {
        window.require.config({
          paths: {
            vs: MONACO_CDN,
          },
        });
        window.require(["vs/editor/editor.main"], () => {
          resolve(window.monaco);
        });
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  async function create(containerEl, settings) {
    const monaco = await _loadScript();
    const luaProvider = LuaLanguage.register(monaco);
    const webProviders = WebLanguages.registerAll(monaco);
    const symbolProviders = new Map([["lua", luaProvider], ...webProviders]);
    EditorTheme.build(monaco);
    const editorInstance = monaco.editor.create(containerEl, {
      ...EDITOR_OPTIONS(settings),
      theme: "velocity",
    });
    return {
      monaco,
      editorInstance,
      symbolProviders,
    };
  }
  return {
    create,
  };
})();
