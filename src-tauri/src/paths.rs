use std::path::PathBuf;

pub fn home_dir() -> anyhow::Result<PathBuf> {
    dirs::home_dir().ok_or_else(|| anyhow::anyhow!("home dir not found"))
}

pub fn internals_dir() -> anyhow::Result<PathBuf> {
    Ok(home_dir()?.join("Velocity").join("internals"))
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

pub fn autoexec_scripts_dir() -> anyhow::Result<PathBuf> {
    Ok(internals_dir()?.join("autoexec_scripts"))
}

pub fn velocity_dir() -> anyhow::Result<PathBuf> {
    Ok(home_dir()?.join("Velocity"))
}

pub fn default_workspace_dir() -> anyhow::Result<PathBuf> {
    Ok(velocity_dir()?.join("Default"))
}
