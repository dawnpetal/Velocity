const themeManager = (() => {
  const THEMES = [
    {
      id: "carbon",
      label: "Carbon",
      desc: "Pure black + blue",
      palette: ["#4d9eff", "#c084fc", "#86efac", "#141414"],
    },
    {
      id: "dracula",
      label: "Dracula",
      desc: "Purple & pink",
      palette: ["#bd93f9", "#ff79c6", "#50fa7b", "#21222c"],
    },
    {
      id: "nord",
      label: "Nord",
      desc: "Cool slate blue",
      palette: ["#88c0d0", "#81a1c1", "#a3be8c", "#1e2430"],
    },
    {
      id: "tokyo",
      label: "Tokyo Night",
      desc: "Deep blue purple",
      palette: ["#7c88fa", "#cba6f7", "#a6e3a1", "#13131f"],
    },
    {
      id: "monokai",
      label: "Monokai",
      desc: "Warm classic contrast",
      palette: ["#fd971f", "#f92672", "#a6e22e", "#1e1e20"],
    },
    {
      id: "gruvbox",
      label: "Gruvbox",
      desc: "Earthy warm tones",
      palette: ["#d79921", "#fb4934", "#b8bb26", "#282828"],
    },
    {
      id: "solarized",
      label: "Solarized",
      desc: "Timeless dark",
      palette: ["#268bd2", "#cb4b16", "#859900", "#001c25"],
    },
    {
      id: "abyss",
      label: "Abyss",
      desc: "Deep dark navy",
      palette: ["#6688dd", "#88aaf8", "#6dbf7e", "#060c1c"],
    },
    {
      id: "rose-pine",
      label: "Rosé Pine",
      desc: "Muted pastel dark",
      palette: ["#c4a7e7", "#eb6f92", "#9ccfd8", "#141018"],
    },
    {
      id: "slate",
      label: "Slate",
      desc: "GitHub-style grey",
      palette: ["#58a6ff", "#ff7b72", "#3fb950", "#1c2128"],
    },
    {
      id: "copper",
      label: "Copper",
      desc: "Warm bronze",
      palette: ["#d4845a", "#e89a6a", "#a8c880", "#15110d"],
    },
    {
      id: "cobalt",
      label: "Cobalt",
      desc: "Deep ocean blue",
      palette: ["#ffa040", "#60d0f8", "#70e090", "#0c1828"],
    },
    {
      id: "onyx",
      label: "Onyx",
      desc: "Pure minimal black",
      palette: ["#e0e0e0", "#cccccc", "#aaaaaa", "#0a0a0a"],
    },
    {
      id: "verdant",
      label: "Verdant",
      desc: "Forest green",
      palette: ["#6abf7a", "#88d890", "#c8e890", "#0e1a0e"],
    },
    {
      id: "crimson",
      label: "Crimson",
      desc: "Dark blood red",
      palette: ["#e05050", "#e07070", "#c8d880", "#180d0d"],
    },
  ];
  const KEY = "Velocity_theme";
  function apply(id) {
    const valid = THEMES.find((t) => t.id === id) ? id : "carbon";
    document.documentElement.setAttribute("data-theme", valid);
    try {
      localStorage.setItem(KEY, valid);
    } catch {}
    editor.applyTheme(valid);
  }
  function load() {
    let saved = "carbon";
    try {
      saved = localStorage.getItem(KEY) ?? "carbon";
    } catch {}
    document.documentElement.setAttribute("data-theme", saved);
  }
  function current() {
    return document.documentElement.getAttribute("data-theme") ?? "carbon";
  }
  function renderGrid() {
    const grid = document.getElementById("themeGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const cur = current();
    for (const theme of THEMES) {
      const card = document.createElement("div");
      card.className = "theme-card" + (theme.id === cur ? " active" : "");
      const dots = document.createElement("div");
      dots.className = "theme-dots";
      theme.palette.forEach((color, i) => {
        const dot = document.createElement("div");
        dot.className = "theme-dot";
        dot.style.background = color;
        if (i === 3) dot.style.border = "1px solid #555";
        dots.appendChild(dot);
      });
      const name = document.createElement("div");
      name.className = "theme-name";
      name.textContent = theme.label;
      const desc = document.createElement("div");
      desc.className = "theme-desc";
      desc.textContent = theme.desc;
      card.append(dots, name, desc);
      card.addEventListener("click", () => {
        apply(theme.id);
        renderGrid();
      });
      grid.appendChild(card);
    }
  }
  return {
    apply,
    load,
    current,
    renderGrid,
  };
})();
