//! Full-text search over a workspace.

use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::notes::{parse_title, sorted_notes};
use crate::workspace::{workspace_dir, AppState};

const MAX_HITS: usize = 40;
const CONTEXT_BEFORE: usize = 32;
const SNIPPET_CHARS: usize = 120;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    pub snippet: String,
    /// UTF-16 offsets into `snippet`, ready for JS string slicing.
    pub match_start: usize,
    pub match_length: usize,
    /// Zero-based line in the file and UTF-16 column of the match.
    pub line: usize,
    pub column: usize,
}

fn fold(c: char) -> char {
    c.to_lowercase().next().unwrap_or(c)
}

fn utf16_len(chars: &[char]) -> usize {
    chars.iter().map(|c| c.len_utf16()).sum()
}

fn find_folded(haystack: &[char], needle: &[char]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    (0..=haystack.len() - needle.len())
        .find(|&i| needle.iter().enumerate().all(|(j, n)| fold(haystack[i + j]) == *n))
}

/// First body match in a note, skipping the title line (titles are matched
/// separately by the command palette).
pub fn search_content(path: &str, content: &str, query: &str) -> Option<SearchHit> {
    let needle: Vec<char> = query.chars().map(fold).collect();
    let mut seen_title = false;
    for (line_no, line) in content.lines().enumerate() {
        if !seen_title && line.starts_with("# ") {
            seen_title = true;
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let Some(at) = find_folded(&chars, &needle) else {
            continue;
        };
        let start = at.saturating_sub(CONTEXT_BEFORE);
        let end = (start + SNIPPET_CHARS).max(at + needle.len()).min(chars.len());
        let lead = chars[..start].iter().all(|c| c.is_whitespace());
        let prefix = if lead { "" } else { "\u{2026}" };
        let body: String = chars[start..end].iter().collect();
        let trimmed = body.trim_start();
        let trimmed_chars = body.chars().count() - trimmed.chars().count();
        return Some(SearchHit {
            path: path.to_string(),
            title: parse_title(content),
            snippet: format!("{prefix}{trimmed}"),
            match_start: prefix.encode_utf16().count() + utf16_len(&chars[start + trimmed_chars..at]),
            match_length: utf16_len(&chars[at..at + needle.len()]),
            line: line_no,
            column: utf16_len(&chars[..at]),
        });
    }
    None
}

pub fn search_dir(dir: &Path, query: &str) -> Vec<SearchHit> {
    let query = query.trim();
    if query.is_empty() {
        return vec![];
    }
    sorted_notes(dir)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|note| {
            let content = fs::read_to_string(&note.path).ok()?;
            search_content(&note.path, &content, query)
        })
        .take(MAX_HITS)
        .collect()
}

#[tauri::command]
pub async fn search_notes(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    query: String,
) -> Result<Vec<SearchHit>, String> {
    if !state.config.lock().unwrap().workspaces.iter().any(|w| w.id == workspace_id) {
        return Err("Workspace not found".into());
    }
    Ok(search_dir(&workspace_dir(&workspace_id), &query))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_case_insensitive_body_match() {
        let hit = search_content("p", "# Groceries\nBuy OAT milk today", "oat").unwrap();
        assert_eq!(hit.line, 1);
        assert_eq!(hit.column, 4);
        assert_eq!(hit.snippet, "Buy OAT milk today");
        assert_eq!(&hit.snippet[hit.match_start..hit.match_start + hit.match_length], "OAT");
    }

    #[test]
    fn skips_title_line() {
        assert!(search_content("p", "# Oat\nnothing here", "oat").is_none());
    }

    #[test]
    fn utf16_offsets_with_emoji() {
        let hit = search_content("p", "# T\n🎉 party time", "party").unwrap();
        // The emoji is two UTF-16 code units.
        assert_eq!(hit.column, 3);
        assert_eq!(hit.match_start, 3);
    }

    #[test]
    fn long_lines_get_ellipsis() {
        let line = format!("{}needle", "x".repeat(100));
        let hit = search_content("p", &format!("# T\n{line}"), "needle").unwrap();
        assert!(hit.snippet.starts_with('\u{2026}'));
        let utf16: Vec<u16> = hit.snippet.encode_utf16().collect();
        let matched = String::from_utf16(&utf16[hit.match_start..hit.match_start + hit.match_length]).unwrap();
        assert_eq!(matched, "needle");
    }
}
