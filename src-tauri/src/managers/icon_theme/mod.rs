use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::{VelocityUIError, VelocityUIResult};

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

    pub fn load(&self) -> VelocityUIResult<()> {
        let path = self.state_path();
        if !path.exists() {
            return Ok(());
        }
        let content = std::fs::read_to_string(&path).map_err(VelocityUIError::Io)?;
        let state: StateFile = serde_json::from_str(&content).map_err(VelocityUIError::Json)?;
        *self
            .active
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)? = state.active;
        *self
            .installed
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)? = state.installed.into_iter().collect();
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

    pub fn activate(&self, id: String) -> VelocityUIResult<bool> {
        if !self.is_installed(&id) {
            return Ok(false);
        }
        *self
            .active
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)? = id;
        self.save()?;
        Ok(true)
    }

    pub async fn install(&self, pack_id: &str, client: &reqwest::Client) -> VelocityUIResult<()> {
        let pack = self
            .registry
            .iter()
            .find(|p| p.id == pack_id)
            .cloned()
            .ok_or_else(|| VelocityUIError::NotFound(format!("theme '{}' not found", pack_id)))?;

        if pack.builtin {
            self.installed
                .lock()
                .map_err(|_| VelocityUIError::LockPoisoned)?
                .insert(pack.id.clone());
            return self.save();
        }

        let urls = pack
            .zip_urls
            .as_ref()
            .ok_or_else(|| VelocityUIError::InvalidData("no download URLs".into()))?
            .clone();

        let icon_dir = pack
            .icon_dir
            .as_ref()
            .ok_or_else(|| VelocityUIError::InvalidData("no icon_dir".into()))?
            .clone();

        let dest_zip = self.internals_dir.join(format!("{}.vsix", pack.id));
        let dest_dir = self.internals_dir.join(&icon_dir);
        let tmp_dir = self.internals_dir.join(format!("{}_tmp", pack.id));

        let mut last_err = String::from("all mirrors failed");
        for url in &urls {
            match self.download_async(url, &dest_zip, client).await {
                Ok(_) => {
                    last_err.clear();
                    break;
                }
                Err(e) => last_err = format!("[{}] {}", url, e),
            }
        }
        if !last_err.is_empty() {
            return Err(VelocityUIError::Other(last_err));
        }

        let internals = self.internals_dir.clone();
        let pack_clone = pack.clone();
        let dest_zip_clone = dest_zip.clone();
        let tmp_dir_clone = tmp_dir.clone();
        let dest_dir_clone = dest_dir.clone();

        tauri::async_runtime::spawn_blocking(move || {
            let _ = std::fs::remove_dir_all(&tmp_dir_clone);
            Self::unzip_sync(&dest_zip_clone, &tmp_dir_clone)?;

            let icons_json = if pack_clone.seti_format.unwrap_or(false) {
                Self::build_seti_icons_json_sync(&pack_clone, &tmp_dir_clone)?
            } else {
                Self::build_vscode_icons_json_sync(&pack_clone, &tmp_dir_clone, &internals)?
            };

            let _ = std::fs::remove_dir_all(&dest_dir_clone);
            std::fs::create_dir_all(&dest_dir_clone).map_err(VelocityUIError::Io)?;

            if let Some(svg_root) = &pack_clone.svg_root {
                let svg_dir = tmp_dir_clone.join(svg_root);
                if let Ok(entries) = std::fs::read_dir(&svg_dir) {
                    for entry in entries.flatten() {
                        if entry.file_name().to_string_lossy().ends_with(".svg") {
                            let _ =
                                std::fs::copy(entry.path(), dest_dir_clone.join(entry.file_name()));
                        }
                    }
                }
            }

            let icons_path = dest_dir_clone.join("icons.json");
            let content = serde_json::to_string(&icons_json).map_err(VelocityUIError::Json)?;
            std::fs::write(&icons_path, content).map_err(VelocityUIError::Io)?;

            let _ = std::fs::remove_dir_all(&tmp_dir_clone);
            let _ = std::fs::remove_file(&dest_zip_clone);

            Ok::<(), VelocityUIError>(())
        })
        .await
        .map_err(|e| VelocityUIError::Other(format!("install task join error: {e}")))?
        .map_err(|e| e)?;

        self.installed
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?
            .insert(pack.id.clone());
        self.save()
    }

    pub fn uninstall(&self, id: &str) -> VelocityUIResult<bool> {
        if id == BUILTIN_ID {
            return Ok(false);
        }
        self.installed
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?
            .remove(id);
        if self.is_active(id) {
            *self
                .active
                .lock()
                .map_err(|_| VelocityUIError::LockPoisoned)? = BUILTIN_ID.to_string();
        }
        self.save()?;
        if let Some(pack) = self.registry.iter().find(|p| p.id == id) {
            if let Some(icon_dir) = &pack.icon_dir {
                let _ = std::fs::remove_dir_all(self.internals_dir.join(icon_dir));
            }
        }
        Ok(true)
    }

    pub fn load_installed_icons(
        &self,
        theme_id: &str,
    ) -> VelocityUIResult<Option<(serde_json::Value, String)>> {
        if theme_id.is_empty() || theme_id == BUILTIN_ID {
            return Ok(None);
        }
        let pack = self
            .registry
            .iter()
            .find(|p| p.id == theme_id)
            .ok_or_else(|| VelocityUIError::NotFound(format!("theme '{}' not found", theme_id)))?;

        let icon_dir = pack
            .icon_dir
            .as_ref()
            .ok_or_else(|| VelocityUIError::InvalidData("no icon_dir".into()))?;
        let dir = self.internals_dir.join(icon_dir);
        let content =
            std::fs::read_to_string(dir.join("icons.json")).map_err(VelocityUIError::Io)?;
        let json: serde_json::Value =
            serde_json::from_str(&content).map_err(VelocityUIError::Json)?;
        Ok(Some((json, dir.to_string_lossy().to_string())))
    }

    fn state_path(&self) -> PathBuf {
        self.internals_dir.join("icon_themes.json")
    }

    fn save(&self) -> VelocityUIResult<()> {
        std::fs::create_dir_all(&self.internals_dir).map_err(VelocityUIError::Io)?;
        let state = StateFile {
            active: self.active.lock().unwrap().clone(),
            installed: self.installed.lock().unwrap().iter().cloned().collect(),
        };
        let content = serde_json::to_string(&state).map_err(VelocityUIError::Json)?;
        std::fs::write(self.state_path(), content).map_err(VelocityUIError::Io)
    }

    async fn download_async(
        &self,
        url: &str,
        dest: &Path,
        client: &reqwest::Client,
    ) -> VelocityUIResult<()> {
        let resp = client
            .get(url)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(VelocityUIError::Other(format!("HTTP {}", resp.status())));
        }

        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(VelocityUIError::Io)?;
        }

        use tokio::io::AsyncWriteExt;
        let mut file = tokio::fs::File::create(dest)
            .await
            .map_err(VelocityUIError::Io)?;
        let mut stream = resp;
        while let Some(chunk) = stream.chunk().await? {
            file.write_all(&chunk).await.map_err(VelocityUIError::Io)?;
        }
        file.flush().await.map_err(VelocityUIError::Io)
    }

    fn unzip_sync(vsix_path: &Path, dest: &Path) -> VelocityUIResult<()> {
        let file = std::fs::File::open(vsix_path).map_err(VelocityUIError::Io)?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| VelocityUIError::Other(e.to_string()))?;
        std::fs::create_dir_all(dest).map_err(VelocityUIError::Io)?;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| VelocityUIError::Other(e.to_string()))?;
            let out_path = dest.join(entry.mangled_name());
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(VelocityUIError::Io)?;
            } else {
                if let Some(p) = out_path.parent() {
                    std::fs::create_dir_all(p).map_err(VelocityUIError::Io)?;
                }
                let mut f = std::fs::File::create(&out_path).map_err(VelocityUIError::Io)?;
                std::io::copy(&mut entry, &mut f).map_err(VelocityUIError::Io)?;
            }
        }
        Ok(())
    }

    fn parse_jsonc_sync(content: &str) -> VelocityUIResult<serde_json::Value> {
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
        serde_json::from_str(&out).map_err(VelocityUIError::Json)
    }

    fn build_vscode_icons_json_sync(
        pack: &ThemePack,
        tmp_dir: &Path,
        internals_dir: &Path,
    ) -> VelocityUIResult<IconsJson> {
        let manifest_path = match &pack.manifest_path {
            Some(mp) => tmp_dir.join(mp),
            None => Self::resolve_vsix_manifest_sync(tmp_dir, internals_dir)?,
        };
        let content = std::fs::read_to_string(&manifest_path).map_err(VelocityUIError::Io)?;
        let manifest = Self::parse_jsonc_sync(&content)?;

        let defs = manifest.get("iconDefinitions").and_then(|v| v.as_object());

        let stem = |def_id: &str| -> Option<String> {
            defs?
                .get(def_id)
                .and_then(|v| v.get("iconPath"))
                .and_then(|v| v.as_str())
                .and_then(|path| {
                    path.replace('\\', "/").split('/').last().map(|f| {
                        f.trim_end_matches(&['.', 's', 'v', 'g', 'p', 'n', 'j', 'e'][..])
                            .to_string()
                    })
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
                if let (Some(id_str), Some(s)) = (id.as_str(), stem(id.as_str().unwrap_or(""))) {
                    let _ = id_str;
                    let k_lower = k.to_lowercase();
                    if let Some(mapped) = lang_map.get(k_lower.as_str()) {
                        for ext in mapped {
                            out.file_extensions
                                .entry(ext.to_string())
                                .or_insert_with(|| s.clone());
                        }
                    } else {
                        out.file_extensions.insert(k_lower, s);
                    }
                }
            }
        }

        if let Some(names) = manifest.get("fileNames").and_then(|v| v.as_object()) {
            for (k, id) in names {
                if let Some(s) = id.as_str().and_then(|id| stem(id)) {
                    out.file_names.insert(k.to_lowercase(), s);
                }
            }
        }

        if let Some(folders) = manifest.get("folderNames").and_then(|v| v.as_object()) {
            for (k, id) in folders {
                if let Some(s) = id.as_str().and_then(|id| stem(id)) {
                    out.folder_names.insert(k.to_lowercase(), s);
                }
            }
        }

        if let Some(langs) = manifest.get("languageIds").and_then(|v| v.as_object()) {
            for (k, id) in langs {
                if let Some(s) = id.as_str().and_then(|id| stem(id)) {
                    let k_lower = k.to_lowercase();
                    let fallback = [k_lower.as_str()];
                    let exts = lang_map
                        .get(k_lower.as_str())
                        .map(|v| v.as_slice())
                        .unwrap_or(&fallback);
                    for ext in exts {
                        out.file_extensions
                            .entry(ext.to_string())
                            .or_insert_with(|| s.clone());
                    }
                }
            }
        }

        Ok(out)
    }

    fn build_seti_icons_json_sync(pack: &ThemePack, tmp_dir: &Path) -> VelocityUIResult<IconsJson> {
        let mut out = IconsJson {
            folder_names: HashMap::new(),
            file_names: HashMap::new(),
            file_extensions: HashMap::new(),
            file_compound: HashMap::new(),
        };

        if let Some(mp) = &pack.manifest_path {
            if let Ok(less) = std::fs::read_to_string(tmp_dir.join(mp)) {
                if let Ok(re) = regex::Regex::new(r"'([^']+)'\s*:\s*'\\\S+'") {
                    for cap in re.captures_iter(&less) {
                        if let Some(m) = cap.get(1) {
                            let ext = m
                                .as_str()
                                .to_lowercase()
                                .trim_start_matches('.')
                                .to_string();
                            out.file_extensions.insert(ext.clone(), ext);
                        }
                    }
                }
            }
        }

        if let Some(sr) = &pack.svg_root {
            if let Ok(entries) = std::fs::read_dir(tmp_dir.join(sr)) {
                for entry in entries.flatten() {
                    if let Ok(name) = entry.file_name().into_string() {
                        if let Some(stem) = name.strip_suffix(".svg") {
                            out.file_extensions
                                .entry(stem.to_string())
                                .or_insert_with(|| stem.to_string());
                        }
                    }
                }
            }
        }

        Ok(out)
    }

    fn resolve_vsix_manifest_sync(
        tmp_dir: &Path,
        _internals_dir: &Path,
    ) -> VelocityUIResult<PathBuf> {
        let vsix_manifest = tmp_dir.join("extension.vsixmanifest");
        let content = std::fs::read_to_string(&vsix_manifest).map_err(VelocityUIError::Io)?;

        let re = regex::Regex::new(
            r#"Type="Microsoft\.VisualStudio\.Code\.Manifest"[^>]*Path="([^"]+)""#,
        )
        .map_err(|e| VelocityUIError::Other(e.to_string()))?;

        let pkg_rel = re
            .captures(&content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .unwrap_or("extension/package.json");

        let pkg_path = tmp_dir.join(pkg_rel);
        let pkg_content = std::fs::read_to_string(&pkg_path).map_err(VelocityUIError::Io)?;
        let pkg_json = Self::parse_jsonc_sync(&pkg_content)?;

        let themes = pkg_json
            .get("contributes")
            .and_then(|v| v.get("iconThemes"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| VelocityUIError::InvalidData("no iconThemes in manifest".into()))?;

        let theme_path = themes
            .first()
            .and_then(|t| t.get("path"))
            .and_then(|p| p.as_str())
            .ok_or_else(|| VelocityUIError::InvalidData("no path in iconTheme".into()))?;

        let pkg_dir = pkg_rel.rsplitn(2, '/').nth(1).unwrap_or("");
        Ok(tmp_dir
            .join(pkg_dir)
            .join(theme_path.trim_start_matches("./")))
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

    fn build_registry() -> Vec<ThemePack> {
        vec![
            ThemePack {
                id: "material".into(),
                name: "Material Icon Theme".into(),
                author: "PKief".into(),
                description: "The original material design file icons".into(),
                builtin: true,
                zip_urls: None, icon_dir: None, manifest_path: None, svg_root: None, seti_format: None,
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
}
