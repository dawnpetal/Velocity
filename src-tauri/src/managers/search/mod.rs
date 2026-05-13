use regex::Regex;
use std::io::BufRead;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{SearchOptions, SearchResultLine};

const MAX_PER_FILE: usize = 500;
const MAX_FILES: usize = 200;
const MAX_FILE_BYTES: u64 = 12 * 1024 * 1024;
const MAX_LINE_CHARS: usize = 1400;

pub struct SearchManager;

impl SearchManager {
    pub fn new() -> Self {
        Self
    }

    pub fn search(
        &self,
        query: &str,
        work_dir: &str,
        opts: &SearchOptions,
    ) -> VelocityUIResult<Vec<SearchResultLine>> {
        let re = Self::build_regex(query, opts)?;
        let walker = Self::build_walker(work_dir, opts)?;

        let mut results: Vec<SearchResultLine> = Vec::new();
        let mut file_count: usize = 0;

        'outer: for entry in walker {
            let Ok(entry) = entry else { continue };
            if entry.file_type().map(|t| !t.is_file()).unwrap_or(true) {
                continue;
            }

            let path = entry.path().to_string_lossy().to_string();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
            let Ok(file) = std::fs::File::open(entry.path()) else {
                continue;
            };
            let mut reader = std::io::BufReader::new(file);
            let mut line = String::new();
            let mut line_num: u32 = 0;
            let mut hit_count: usize = 0;

            loop {
                line.clear();
                let Ok(bytes) = reader.read_line(&mut line) else {
                    break;
                };
                if bytes == 0 {
                    break;
                }
                line_num += 1;
                if line.as_bytes().contains(&0) || !re.is_match(&line) {
                    continue;
                }

                let display = Self::clip_line(line.trim_end_matches(|c| c == '\r' || c == '\n'));
                let highlighted = if opts.with_highlights {
                    Some(Self::highlight(&display, &re))
                } else {
                    None
                };

                results.push(SearchResultLine {
                    path: path.clone(),
                    line_num,
                    text: display,
                    highlighted,
                });

                hit_count += 1;
                if hit_count >= MAX_PER_FILE {
                    break;
                }
            }

            if hit_count > 0 {
                file_count += 1;
                if file_count >= MAX_FILES {
                    break 'outer;
                }
            }
        }

        Ok(results)
    }

    fn build_regex(query: &str, opts: &SearchOptions) -> VelocityUIResult<Regex> {
        let mut pattern = if opts.is_regex {
            query.to_string()
        } else {
            regex::escape(query)
        };

        if opts.whole_word {
            pattern = format!(r"\b{}\b", pattern);
        }

        regex::RegexBuilder::new(&pattern)
            .case_insensitive(!opts.match_case)
            .build()
            .map_err(|e| VelocityUIError::InvalidData(e.to_string()))
    }

    fn build_walker(work_dir: &str, opts: &SearchOptions) -> VelocityUIResult<ignore::Walk> {
        let mut ob = ignore::overrides::OverrideBuilder::new(work_dir);

        for g in opts
            .include_globs
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            ob.add(g)
                .map_err(|e| VelocityUIError::Other(e.to_string()))?;
        }
        for g in opts
            .exclude_globs
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            ob.add(&format!("!{}", g))
                .map_err(|e| VelocityUIError::Other(e.to_string()))?;
        }

        let overrides = ob
            .build()
            .map_err(|e| VelocityUIError::Other(e.to_string()))?;

        Ok(ignore::WalkBuilder::new(work_dir)
            .overrides(overrides)
            .build())
    }

    fn clip_line(line: &str) -> String {
        if line.chars().count() <= MAX_LINE_CHARS {
            return line.to_string();
        }
        let mut out: String = line.chars().take(MAX_LINE_CHARS).collect();
        out.push('…');
        out
    }

    fn highlight(line: &str, re: &Regex) -> String {
        let mut out = String::with_capacity(line.len() + 32);
        let mut last = 0;

        for m in re.find_iter(line) {
            out.push_str(&Self::escape_html(&line[last..m.start()]));
            out.push_str("<mark>");
            out.push_str(&Self::escape_html(m.as_str()));
            out.push_str("</mark>");
            last = m.end();
        }

        out.push_str(&Self::escape_html(&line[last..]));
        out
    }

    fn escape_html(s: &str) -> String {
        let mut out = String::with_capacity(s.len());
        for c in s.chars() {
            match c {
                '<' => out.push_str("&lt;"),
                '>' => out.push_str("&gt;"),
                '&' => out.push_str("&amp;"),
                '"' => out.push_str("&quot;"),
                '\'' => out.push_str("&#39;"),
                _ => out.push(c),
            }
        }
        out
    }
}
