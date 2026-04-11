use crate::models::FileNode;
use crate::services;

#[tauri::command]
pub fn build_file_tree(dir_path: String) -> Result<FileNode, String> {
    services::build_tree(&dir_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_unique_filename(
    dir_path: String,
    name: String,
    is_folder: bool,
) -> Result<String, String> {
    services::generate_unique_path(&dir_path, &name, is_folder).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_path_recursive(src: String, dest: String) -> Result<(), String> {
    services::copy_recursive(&src, &dest)
        .await
        .map_err(|e| e.to_string())
}
