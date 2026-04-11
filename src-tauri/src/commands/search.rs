use crate::models::SearchResultLine;
use crate::services;
use crate::types::{SearchMatch, SearchOpts};

#[tauri::command]
pub fn ripgrep_search(
    query: String,
    work_dir: String,
    opts: SearchOpts,
) -> Result<Vec<SearchMatch>, String> {
    let mut pat = if opts.is_regex {
        query.clone()
    } else {
        regex::escape(&query)
    };
    if opts.whole_word {
        pat = format!(r"\b{}\b", pat);
    }
    let re = regex::RegexBuilder::new(&pat)
        .case_insensitive(!opts.match_case)
        .build()
        .map_err(|e| e.to_string())?;

    let mut override_builder = ignore::overrides::OverrideBuilder::new(&work_dir);
    for g in opts.include_globs.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        override_builder.add(g).map_err(|e| e.to_string())?;
    }
    for g in opts.exclude_globs.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        override_builder.add(&format!("!{}", g)).map_err(|e| e.to_string())?;
    }
    let overrides = override_builder.build().map_err(|e| e.to_string())?;

    let walker = ignore::WalkBuilder::new(&work_dir).overrides(overrides).build();

    let mut results: Vec<SearchMatch> = Vec::new();
    let mut file_count: usize = 0;

    'outer: for entry in walker {
        let Ok(entry) = entry else { continue };
        if entry.file_type().map(|t| !t.is_file()).unwrap_or(true) {
            continue;
        }
        let path = entry.path().to_string_lossy().to_string();
        let Ok(content) = std::fs::read_to_string(entry.path()) else {
            continue;
        };

        let mut hit_count: usize = 0;
        for (i, line) in content.lines().enumerate() {
            if re.is_match(line) {
                results.push(SearchMatch {
                    path: path.clone(),
                    line_num: (i + 1) as u32,
                    text: line.to_string(),
                });
                hit_count += 1;
                if hit_count >= 500 { break; }
            }
        }
        if hit_count > 0 {
            file_count += 1;
            if file_count >= 200 { break 'outer; }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn search_with_highlights(
    query: String,
    work_dir: String,
    opts: crate::models::SearchOptions,
) -> Result<Vec<SearchResultLine>, String> {
    services::search_with_highlighting(query, work_dir, opts).map_err(|e| e.to_string())
}

