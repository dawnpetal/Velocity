use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResultLine {
    pub path: String,
    pub line_num: u32,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlighted: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchOptions {
    pub match_case: bool,
    pub whole_word: bool,
    pub is_regex: bool,
    pub include_globs: Vec<String>,
    pub exclude_globs: Vec<String>,
    #[serde(default)]
    pub with_highlights: bool,
}
