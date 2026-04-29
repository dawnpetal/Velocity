use tauri::State;

use crate::app::AppContext;
use crate::models::{SearchOptions, SearchResultLine};

#[tauri::command]
pub fn search_with_highlights(
    query: String,
    work_dir: String,
    mut opts: SearchOptions,
    ctx: State<'_, AppContext>,
) -> Result<Vec<SearchResultLine>, String> {
    opts.with_highlights = true;
    ctx.Search
        .search(&query, &work_dir, &opts)
        .map_err(|e| e.to_string())
}
