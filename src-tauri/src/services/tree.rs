use crate::models::FileNode;
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub fn build_tree(dir_path: &str) -> Result<FileNode> {
    let path = PathBuf::from(dir_path);
    build_tree_recursive(&path)
}

fn build_tree_recursive(path: &Path) -> Result<FileNode> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .context("invalid path")?
        .to_string();

    let path_str = path.to_str().context("non-utf8 path")?.to_string();
    let id = generate_id();

    let entries = fs::read_dir(path).context("failed to read directory")?;
    let mut children = Vec::new();

    for entry in entries {
        let entry = entry.context("failed to read entry")?;
        let entry_name = entry.file_name();
        let entry_name_str = entry_name.to_str().context("non-utf8 filename")?;

        if entry_name_str.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        let entry_path_str = entry_path.to_str().context("non-utf8 path")?.to_string();
        let metadata = entry.metadata().context("failed to read metadata")?;

        if metadata.is_dir() {
            let mut child = build_tree_recursive(&entry_path)?;
            child.open = false;
            children.push(child);
        } else {
            children.push(FileNode::file(
                generate_id(),
                entry_name_str.to_string(),
                entry_path_str,
            ));
        }
    }

    children.sort_by(|a, b| {
        match (&a.node_type == "folder", &b.node_type == "folder") {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(FileNode::folder(id, name, path_str, children))
}

pub fn generate_unique_path(dir_path: &str, name: &str, is_folder: bool) -> Result<String> {
    let base_path = PathBuf::from(dir_path);

    let (base_name, ext) = if !is_folder {
        if let Some(dot_idx) = name.rfind('.') {
            (&name[..dot_idx], &name[dot_idx..])
        } else {
            (name, "")
        }
    } else {
        (name, "")
    };

    let mut candidate = name.to_string();
    for counter in 1..=9999 {
        let test_path = base_path.join(&candidate);
        if !test_path.exists() {
            return Ok(candidate);
        }
        candidate = format!("{}_{}{}", base_name, counter, ext);
    }

    let uuid_suffix = uuid::Uuid::new_v4().to_string();
    Ok(format!("{}_{}{}", base_name, &uuid_suffix[..8], ext))
}

pub fn copy_recursive<'a>(
    src: &'a str,
    dest: &'a str,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        let src_path = Path::new(src);
        let dest_path = Path::new(dest);

        if !src_path.exists() {
            anyhow::bail!("source path does not exist");
        }

        let metadata = fs::metadata(src_path).context("failed to read source metadata")?;

        if metadata.is_dir() {
            fs::create_dir_all(dest_path).context("failed to create destination directory")?;

            let entries = fs::read_dir(src_path).context("failed to read source directory")?;

            for entry in entries {
                let entry = entry.context("failed to read entry")?;
                let entry_name = entry.file_name();
                let entry_name_str = entry_name.to_str().context("non-utf8 filename")?;

                if entry_name_str == "." || entry_name_str == ".." {
                    continue;
                }

                let src_child = src_path.join(&entry_name);
                let dest_child = dest_path.join(&entry_name);

                let src_child_str = src_child.to_str().context("non-utf8 path")?.to_owned();
                let dest_child_str = dest_child.to_str().context("non-utf8 path")?.to_owned();

                copy_recursive(&src_child_str, &dest_child_str).await?;
            }
        } else {
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent).context("failed to create parent directory")?;
            }
            fs::copy(src_path, dest_path).context("failed to copy file")?;
        }

        Ok(())
    })
}

fn generate_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros();
    format!("{:x}{:x}", timestamp, count)
}
