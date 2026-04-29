use std::path::PathBuf;

pub fn home_dir() -> anyhow::Result<PathBuf> {
    dirs::home_dir().ok_or_else(|| anyhow::anyhow!("home directory not found"))
}

pub fn velocityui_dir() -> anyhow::Result<PathBuf> {
    Ok(home_dir()?.join("VelocityUI"))
}

pub fn internals_dir() -> anyhow::Result<PathBuf> {
    Ok(velocityui_dir()?.join("internals"))
}

pub fn default_workspace_dir() -> anyhow::Result<PathBuf> {
    Ok(velocityui_dir()?.join("Default"))
}

pub fn cache_path() -> anyhow::Result<PathBuf> {
    Ok(internals_dir()?.join("key-cache.json"))
}

pub fn scripts_path() -> anyhow::Result<PathBuf> {
    Ok(internals_dir()?.join("menu-scripts.json"))
}

pub fn key_file_path() -> anyhow::Result<PathBuf> {
    Ok(home_dir()?
        .join("Library")
        .join("Application Support")
        .join("Hydrogen")
        .join("key.txt"))
}
