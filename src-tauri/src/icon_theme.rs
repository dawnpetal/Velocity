use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const BUILTIN_ID: &str = "material";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemePack {
    pub id: String,
    pub name: String,
    pub author: String,
    pub description: String,
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zip_urls: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub svg_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seti_format: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct IconsJson {
    folder_names: HashMap<String, String>,
    file_names: HashMap<String, String>,
    file_extensions: HashMap<String, String>,
    file_compound: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct StateFile {
    active: String,
    installed: Vec<String>,
}

pub struct IconThemeManager {
    internals_dir: PathBuf,
    active: Mutex<String>,
    installed: Mutex<HashSet<String>>,
    registry: Vec<ThemePack>,
}

impl IconThemeManager {
    pub fn new(internals_dir: PathBuf) -> Self {
        Self {
            internals_dir,
            active: Mutex::new(BUILTIN_ID.to_string()),
            installed: Mutex::new([BUILTIN_ID.to_string()].into_iter().collect()),
            registry: Self::build_registry(),
        }
    }

    fn build_registry() -> Vec<ThemePack> {
        vec![
            ThemePack {
                id: "material".into(),
                name: "Material Icon Theme".into(),
                author: "PKief".into(),
                description: "The original material design file icons".into(),
                builtin: true,
                zip_urls: None,
                icon_dir: None,
                manifest_path: None,
                svg_root: None,
                seti_format: None,
            },
            ThemePack {
                id: "ayu".into(),
                name: "Ayu Icons".into(),
                author: "teabyii".into(),
                description: "A simple theme with bright colors".into(),
                builtin: false,
                zip_urls: Some(vec![
                    "https://openvsx.eclipsecontent.org/teabyii/ayu/1.1.11/teabyii.ayu-1.1.11.vsix".into(),
                    "https://open-vsx.org/api/teabyii/ayu/1.1.11/file/teabyii.ayu-1.1.11.vsix".into(),
                ]),
                icon_dir: Some("icons_ayu".into()),
                manifest_path: Some("extension/ayu-icons.json".into()),
                svg_root: Some("extension/icons/".into()),
                seti_format: None,
            },
            ThemePack {
                id: "seti".into(),
                name: "Seti File Icons".into(),
                author: "jesseweed".into(),
                description: "Minimal, colorful icons based on Seti UI".into(),
                builtin: false,
                zip_urls: Some(vec!["https://github.com/jesseweed/seti-ui/archive/refs/heads/master.zip".into()]),
                icon_dir: Some("icons_seti".into()),
                manifest_path: Some("seti-ui-master/styles/components/_icons.less".into()),
                svg_root: Some("seti-ui-master/icons/".into()),
                seti_format: Some(true),
            },
            ThemePack {
                id: "bearded".into(),
                name: "Bearded Icons".into(),
                author: "BeardedBear".into(),
                description: "Vibrant icons for Bearded Theme lovers".into(),
                builtin: false,
                zip_urls: Some(vec!["https://openvsx.eclipsecontent.org/BeardedBear/beardedicons/1.22.0/BeardedBear.beardedicons-1.22.0.vsix".into()]),
                icon_dir: Some("icons_bearded".into()),
                manifest_path: Some("extension/icons.json".into()),
                svg_root: Some("extension/icons/".into()),
                seti_format: None,
            },
            ThemePack {
                id: "vscode-icons".into(),
                name: "VSCode Icons".into(),
                author: "vscode-icons-team".into(),
                description: "Comprehensive icons for every file and folder type".into(),
                builtin: false,
                zip_urls: Some(vec![
                    "https://openvsx.eclipsecontent.org/vscode-icons-team/vscode-icons/12.17.0/vscode-icons-team.vscode-icons-12.17.0.vsix".into(),
                    "https://open-vsx.org/api/vscode-icons-team/vscode-icons/12.17.0/file/vscode-icons-team.vscode-icons-12.17.0.vsix".into(),
                ]),
                icon_dir: Some("icons_vscode_icons".into()),
                manifest_path: Some("extension/dist/src/vsicons-icon-theme.json".into()),
                svg_root: Some("extension/icons/".into()),
                seti_format: None,
            },
        ]
    }

    fn state_path(&self) -> PathBuf {
        self.internals_dir.join("icon_themes.json")
    }

    pub fn load(&self) -> Result<()> {
        let path = self.state_path();
        if !path.exists() {
            return Ok(());
        }
        let content = std::fs::read_to_string(path)?;
        let state: StateFile = serde_json::from_str(&content)?;
        *self.active.lock().unwrap() = state.active;
        *self.installed.lock().unwrap() = state.installed.into_iter().collect();
        Ok(())
    }

    fn save(&self) -> Result<()> {
        std::fs::create_dir_all(&self.internals_dir)?;
        let state = StateFile {
            active: self.active.lock().unwrap().clone(),
            installed: self.installed.lock().unwrap().iter().cloned().collect(),
        };
        let content = serde_json::to_string(&state)?;
        std::fs::write(self.state_path(), content)?;
        Ok(())
    }

    pub fn get_active(&self) -> String {
        self.active.lock().unwrap().clone()
    }

    pub fn get_installed(&self) -> Vec<String> {
        self.installed.lock().unwrap().iter().cloned().collect()
    }

    pub fn get_registry(&self) -> Vec<ThemePack> {
        self.registry.clone()
    }

    pub fn is_installed(&self, id: &str) -> bool {
        self.installed.lock().unwrap().contains(id)
    }

    pub fn is_active(&self, id: &str) -> bool {
        &*self.active.lock().unwrap() == id
    }

    pub fn activate(&self, id: String) -> Result<bool> {
        if !self.is_installed(&id) {
            return Ok(false);
        }
        *self.active.lock().unwrap() = id;
        self.save()?;
        Ok(true)
    }

    pub fn install(&self, pack_id: &str) -> Result<()> {
        let pack = self
            .registry
            .iter()
            .find(|p| p.id == pack_id)
            .ok_or_else(|| anyhow!("theme not found"))?;

        if pack.builtin {
            self.installed.lock().unwrap().insert(pack.id.clone());
            self.save()?;
            return Ok(());
        }

        let urls = pack.zip_urls.as_ref().ok_or_else(|| anyhow!("no urls"))?;
        let icon_dir = pack.icon_dir.as_ref().ok_or_else(|| anyhow!("no icon_dir"))?;

        let dest_zip = self.internals_dir.join(format!("{}.vsix", pack.id));
        let dest_dir = self.internals_dir.join(icon_dir);
        let tmp_dir = self.internals_dir.join(format!("{}_tmp", pack.id));

        let mut last_err = String::from("all mirrors failed");
        for url in urls {
            match self.download(url, &dest_zip) {
                Ok(_) => {
                    last_err.clear();
                    break;
                }
                Err(e) => last_err = format!("[{}] {}", url, e),
            }
        }
        if !last_err.is_empty() {
            return Err(anyhow!(last_err));
        }

        let _ = std::fs::remove_dir_all(&tmp_dir);
        self.unzip(&dest_zip, &tmp_dir)?;

        let icons_json = if pack.seti_format.unwrap_or(false) {
            self.build_seti_icons_json(pack, &tmp_dir)?
        } else {
            self.build_vscode_icons_json(pack, &tmp_dir)?
        };

        let _ = std::fs::remove_dir_all(&dest_dir);
        std::fs::create_dir_all(&dest_dir)?;

        let svg_dir = tmp_dir.join(pack.svg_root.as_ref().unwrap());
        if let Ok(entries) = std::fs::read_dir(&svg_dir) {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if name.ends_with(".svg") {
                        let _ = std::fs::copy(entry.path(), dest_dir.join(&name));
                    }
                }
            }
        }

        let icons_json_path = dest_dir.join("icons.json");
        std::fs::write(icons_json_path, serde_json::to_string(&icons_json)?)?;

        self.installed.lock().unwrap().insert(pack.id.clone());
        self.save()?;

        let _ = std::fs::remove_dir_all(&tmp_dir);
        let _ = std::fs::remove_file(&dest_zip);

        Ok(())
    }

    pub fn uninstall(&self, id: &str) -> Result<bool> {
        if id == BUILTIN_ID {
            return Ok(false);
        }

        self.installed.lock().unwrap().remove(id);

        if self.is_active(id) {
            *self.active.lock().unwrap() = BUILTIN_ID.to_string();
        }

        self.save()?;

        if let Some(pack) = self.registry.iter().find(|p| p.id == id) {
            if let Some(icon_dir) = &pack.icon_dir {
                let _ = std::fs::remove_dir_all(self.internals_dir.join(icon_dir));
            }
        }

        Ok(true)
    }

    pub fn load_installed_icons(&self, theme_id: &str) -> Result<Option<(serde_json::Value, String)>> {
        if theme_id.is_empty() || theme_id == BUILTIN_ID {
            return Ok(None);
        }

        let pack = self
            .registry
            .iter()
            .find(|p| p.id == theme_id)
            .ok_or_else(|| anyhow!("theme not found"))?;

        let icon_dir = pack.icon_dir.as_ref().ok_or_else(|| anyhow!("no icon_dir"))?;
        let icon_dir_path = self.internals_dir.join(icon_dir);
        let icons_json_path = icon_dir_path.join("icons.json");

        let content = std::fs::read_to_string(icons_json_path)?;
        let json: serde_json::Value = serde_json::from_str(&content)?;

        Ok(Some((json, icon_dir_path.to_string_lossy().to_string())))
    }

    fn download(&self, url: &str, dest: &Path) -> Result<()> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .user_agent("Mozilla/5.0")
            .build()?;

        let resp = client.get(url).send()?;
        if !resp.status().is_success() {
            return Err(anyhow!("HTTP {}", resp.status()));
        }

        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut file = std::fs::File::create(dest)?;
        std::io::copy(&mut resp.bytes()?.as_ref(), &mut file)?;
        Ok(())
    }

    fn unzip(&self, vsix_path: &Path, dest: &Path) -> Result<()> {
        let file = std::fs::File::open(vsix_path)?;
        let mut archive = zip::ZipArchive::new(file)?;
        std::fs::create_dir_all(dest)?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let out_path = dest.join(entry.mangled_name());

            if entry.is_dir() {
                std::fs::create_dir_all(&out_path)?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut out_file = std::fs::File::create(&out_path)?;
                std::io::copy(&mut entry, &mut out_file)?;
            }
        }
        Ok(())
    }

    fn parse_jsonc(&self, content: &str) -> Result<serde_json::Value> {
        let mut out = String::new();
        let chars: Vec<char> = content.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            if i + 1 < chars.len() && chars[i] == '/' && chars[i + 1] == '/' {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            } else if i + 1 < chars.len() && chars[i] == '/' && chars[i + 1] == '*' {
                i += 2;
                while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                    i += 1;
                }
                i += 2;
            } else {
                out.push(chars[i]);
                i += 1;
            }
        }

        Ok(serde_json::from_str(&out)?)
    }

    fn build_vscode_icons_json(&self, pack: &ThemePack, tmp_dir: &Path) -> Result<IconsJson> {
        let manifest_path = pack.manifest_path.as_ref().ok_or_else(|| anyhow!("no manifest"))?;
        let full_path = tmp_dir.join(manifest_path);

        let raw = if full_path.exists() {
            std::fs::read_to_string(full_path)?
        } else {
            let resolved = self.resolve_vsix_manifest(tmp_dir)?;
            std::fs::read_to_string(resolved)?
        };

        let manifest = self.parse_jsonc(&raw)?;
        let defs = manifest
            .get("iconDefinitions")
            .and_then(|v| v.as_object())
            .ok_or_else(|| anyhow!("no iconDefinitions"))?;

        let stem = |def_id: &str| -> Option<String> {
            defs.get(def_id)
                .and_then(|v| v.get("iconPath"))
                .and_then(|v| v.as_str())
                .and_then(|path| {
                    path.replace('\\', "/")
                        .split('/')
                        .last()
                        .map(|f| f.trim_end_matches(&['.', 's', 'v', 'g', 'p', 'n', 'j', 'e'][..]).to_string())
                })
        };

        let mut out = IconsJson {
            folder_names: HashMap::new(),
            file_names: HashMap::new(),
            file_extensions: HashMap::new(),
            file_compound: HashMap::new(),
        };

        let lang_map = Self::build_lang_map();

        if let Some(exts) = manifest.get("fileExtensions").and_then(|v| v.as_object()) {
            for (k, id) in exts {
                if let Some(id_str) = id.as_str() {
                    if let Some(s) = stem(id_str) {
                        let k_lower = k.to_lowercase();
                        if let Some(mapped_exts) = lang_map.get(k_lower.as_str()) {
                            for ext in mapped_exts {
                                out.file_extensions.entry(ext.to_string()).or_insert_with(|| s.clone());
                            }
                        } else {
                            out.file_extensions.insert(k_lower, s);
                        }
                    }
                }
            }
        }

        if let Some(names) = manifest.get("fileNames").and_then(|v| v.as_object()) {
            for (k, id) in names {
                if let Some(id_str) = id.as_str() {
                    if let Some(s) = stem(id_str) {
                        out.file_names.insert(k.to_lowercase(), s);
                    }
                }
            }
        }

        if let Some(folders) = manifest.get("folderNames").and_then(|v| v.as_object()) {
            for (k, id) in folders {
                if let Some(id_str) = id.as_str() {
                    if let Some(s) = stem(id_str) {
                        out.folder_names.insert(k.to_lowercase(), s);
                    }
                }
            }
        }

        if let Some(langs) = manifest.get("languageIds").and_then(|v| v.as_object()) {
            for (k, id) in langs {
                if let Some(id_str) = id.as_str() {
                    if let Some(s) = stem(id_str) {
                        let k_lower = k.to_lowercase();
                        let k_lower_ref = k_lower.as_str();
                        let fallback = [k_lower_ref];
                        let exts = lang_map.get(k_lower_ref).map(|v| v.as_slice()).unwrap_or(&fallback);
                        for ext in exts {
                            out.file_extensions.entry(ext.to_string()).or_insert_with(|| s.clone());
                        }
                    }
                }
            }
        }

        Ok(out)
    }

    fn build_seti_icons_json(&self, pack: &ThemePack, tmp_dir: &Path) -> Result<IconsJson> {
        let mut out = IconsJson {
            folder_names: HashMap::new(),
            file_names: HashMap::new(),
            file_extensions: HashMap::new(),
            file_compound: HashMap::new(),
        };

        if let Some(manifest_path) = &pack.manifest_path {
            let full_path = tmp_dir.join(manifest_path);
            if let Ok(less) = std::fs::read_to_string(full_path) {
                let re = regex::Regex::new(r"'([^']+)'\s*:\s*'\\S+'")?;
                for cap in re.captures_iter(&less) {
                    if let Some(m) = cap.get(1) {
                        let ext = m.as_str().to_lowercase().trim_start_matches('.').to_string();
                        out.file_extensions.insert(ext.clone(), ext);
                    }
                }
            }
        }

        if let Some(svg_root) = &pack.svg_root {
            let svg_dir = tmp_dir.join(svg_root);
            if let Ok(entries) = std::fs::read_dir(svg_dir) {
                for entry in entries.flatten() {
                    if let Ok(name) = entry.file_name().into_string() {
                        if let Some(stem) = name.strip_suffix(".svg") {
                            out.file_extensions.entry(stem.to_string()).or_insert_with(|| stem.to_string());
                        }
                    }
                }
            }
        }

        Ok(out)
    }

    fn resolve_vsix_manifest(&self, tmp_dir: &Path) -> Result<PathBuf> {
        let vsix_manifest = tmp_dir.join("extension.vsixmanifest");
        let content = std::fs::read_to_string(vsix_manifest)?;

        let re = regex::Regex::new(r#"Type="Microsoft\.VisualStudio\.Code\.Manifest"[^>]*Path="([^"]+)""#)?;
        let pkg_json_rel = re
            .captures(&content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .unwrap_or("extension/package.json");

        let pkg_json_path = tmp_dir.join(pkg_json_rel);
        let pkg_content = std::fs::read_to_string(pkg_json_path)?;
        let pkg_json = self.parse_jsonc(&pkg_content)?;

        let themes = pkg_json
            .get("contributes")
            .and_then(|v| v.get("iconThemes"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("no iconThemes"))?;

        let theme_path = themes
            .first()
            .and_then(|t| t.get("path"))
            .and_then(|p| p.as_str())
            .ok_or_else(|| anyhow!("no path"))?;

        let pkg_dir = pkg_json_rel.rsplitn(2, '/').nth(1).unwrap_or("");
        let final_path = tmp_dir.join(pkg_dir).join(theme_path.trim_start_matches("./"));

        Ok(final_path)
    }

    fn build_lang_map() -> HashMap<&'static str, Vec<&'static str>> {
        [
            ("javascript", vec!["js", "mjs", "cjs"]),
            ("javascriptreact", vec!["jsx"]),
            ("typescript", vec!["ts", "mts", "cts"]),
            ("typescriptreact", vec!["tsx"]),
            ("python", vec!["py", "pyw"]),
            ("ruby", vec!["rb"]),
            ("rust", vec!["rs"]),
            ("go", vec!["go"]),
            ("java", vec!["java"]),
            ("kotlin", vec!["kt", "kts"]),
            ("swift", vec!["swift"]),
            ("c", vec!["c"]),
            ("cpp", vec!["cpp", "cc", "cxx", "c++"]),
            ("csharp", vec!["cs"]),
            ("fsharp", vec!["fs", "fsi", "fsx"]),
            ("php", vec!["php"]),
            ("html", vec!["html", "htm"]),
            ("css", vec!["css"]),
            ("scss", vec!["scss"]),
            ("sass", vec!["sass"]),
            ("less", vec!["less"]),
            ("json", vec!["json"]),
            ("jsonc", vec!["jsonc"]),
            ("yaml", vec!["yaml", "yml"]),
            ("toml", vec!["toml"]),
            ("xml", vec!["xml"]),
            ("markdown", vec!["md", "markdown"]),
            ("shellscript", vec!["sh", "bash", "zsh"]),
            ("powershell", vec!["ps1", "psm1"]),
            ("dockerfile", vec!["dockerfile"]),
            ("lua", vec!["lua"]),
            ("perl", vec!["pl", "pm"]),
            ("r", vec!["r"]),
            ("dart", vec!["dart"]),
            ("elixir", vec!["ex", "exs"]),
            ("erlang", vec!["erl"]),
            ("haskell", vec!["hs"]),
            ("ocaml", vec!["ml", "mli"]),
            ("scala", vec!["scala"]),
            ("clojure", vec!["clj", "cljs", "cljc"]),
            ("groovy", vec!["groovy"]),
            ("vue", vec!["vue"]),
            ("svelte", vec!["svelte"]),
            ("graphql", vec!["graphql", "gql"]),
            ("sql", vec!["sql"]),
            ("objective-c", vec!["m"]),
            ("objective-cpp", vec!["mm"]),
        ]
        .into_iter()
        .collect()
    }
}