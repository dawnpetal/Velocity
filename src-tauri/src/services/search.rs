use crate::models::{SearchOptions, SearchResultLine};
use anyhow::Result;
use regex::Regex;
use std::fs;

const MAX_RESULTS_PER_FILE: usize = 500;
const MAX_TOTAL_FILES: usize = 200;

pub fn search_with_highlighting(
    query: String,
    work_dir: String,
    opts: SearchOptions,
) -> Result<Vec<SearchResultLine>> {
    let mut pattern = if opts.is_regex {
        query.clone()
    } else {
        regex::escape(&query)
    };

    if opts.whole_word {
        pattern = format!(r"\b{}\b", pattern);
    }

    let re = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!opts.match_case)
        .build()?;

    let mut override_builder = ignore::overrides::OverrideBuilder::new(&work_dir);
    for glob in opts.include_globs.iter().filter(|s| !s.trim().is_empty()) {
        override_builder.add(glob)?;
    }
    for glob in opts.exclude_globs.iter().filter(|s| !s.trim().is_empty()) {
        override_builder.add(&format!("!{}", glob))?;
    }
    let overrides = override_builder.build()?;

    let walker = ignore::WalkBuilder::new(&work_dir)
        .overrides(overrides)
        .build();

    let mut results = Vec::new();
    let mut file_count = 0;

    for entry in walker {
        let Ok(entry) = entry else { continue };
        if entry.file_type().map(|t| !t.is_file()).unwrap_or(true) {
            continue;
        }

        let path = entry.path().to_string_lossy().to_string();
        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };

        let mut hit_count = 0;
        for (i, line) in content.lines().enumerate() {
            if re.is_match(line) {
                let highlighted = if opts.with_highlights {
                    Some(highlight_line(line, &re))
                } else {
                    None
                };

                results.push(SearchResultLine {
                    path: path.clone(),
                    line_num: (i + 1) as u32,
                    text: line.to_string(),
                    highlighted,
                });

                hit_count += 1;
                if hit_count >= MAX_RESULTS_PER_FILE {
                    break;
                }
            }
        }

        if hit_count > 0 {
            file_count += 1;
            if file_count >= MAX_TOTAL_FILES {
                break;
            }
        }
    }

    Ok(results)
}

fn highlight_line(line: &str, re: &Regex) -> String {
    let mut result = String::new();
    let mut last_end = 0;

    for mat in re.find_iter(line) {
        result.push_str(&html_escape(&line[last_end..mat.start()]));
        result.push_str("<mark>");
        result.push_str(&html_escape(mat.as_str()));
        result.push_str("</mark>");
        last_end = mat.end();
    }

    result.push_str(&html_escape(&line[last_end..]));
    result
}

fn html_escape(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '<' => "&lt;".to_string(),
            '>' => "&gt;".to_string(),
            '&' => "&amp;".to_string(),
            '"' => "&quot;".to_string(),
            '\'' => "&#39;".to_string(),
            _ => c.to_string(),
        })
        .collect()
}
