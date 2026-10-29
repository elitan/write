//! Note files on disk.
//!
//! Each workspace is a folder of markdown files named `<number>-<slug>.md`.
//! The number gives the manual sort order (highest first) and the slug mirrors
//! the note's `# Title`, so files stay readable in Finder.

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::workspace::{notes_root, workspace_dir, AppState};

const PREVIEW_CHARS: usize = 160;
const META_READ_BYTES: u64 = 4096;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub path: String,
    pub title: String,
    pub preview: String,
    /// Milliseconds since the Unix epoch.
    pub modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub content: String,
    pub modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Renamed {
    pub from: String,
    pub to: String,
}

pub fn parse_title(content: &str) -> String {
    content
        .lines()
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Plain-text excerpt of the body (everything except the title line).
pub fn parse_preview(content: &str) -> String {
    let mut out = String::new();
    let mut skipped_title = false;
    for line in content.lines() {
        if !skipped_title && line.starts_with("# ") {
            skipped_title = true;
            continue;
        }
        let text = line
            .trim()
            .trim_start_matches(['#', '>', '-', '*', '+', ' '])
            .trim_start_matches("[ ] ")
            .trim_start_matches("[x] ");
        if text.is_empty() || text.starts_with("```") {
            continue;
        }
        for c in text.chars().filter(|c| !matches!(c, '*' | '_' | '`' | '~')) {
            out.push(c);
        }
        out.push(' ');
        if out.chars().count() >= PREVIEW_CHARS {
            break;
        }
    }
    out.trim().chars().take(PREVIEW_CHARS).collect()
}

pub fn slugify(text: &str) -> String {
    let mut result = String::new();
    let mut prev_dash = false;
    for c in text.to_lowercase().chars() {
        if c.is_alphanumeric() {
            result.push(c);
            prev_dash = false;
        } else if !prev_dash && !result.is_empty() {
            result.push('-');
            prev_dash = true;
        }
    }
    result.trim_end_matches('-').to_string()
}

pub fn title_slug(content: &str) -> String {
    let slug = slugify(&parse_title(content));
    if slug.is_empty() || slug == "untitled" {
        "untitled".to_string()
    } else {
        // Keep file names comfortably below filesystem limits.
        slug.chars().take(80).collect::<String>().trim_end_matches('-').to_string()
    }
}

pub fn parse_file_number(name: &str) -> Option<u64> {
    let dash = name.find('-')?;
    name[..dash].parse().ok()
}

fn slug_part(stem: &str) -> &str {
    stem.split_once('-').map(|(_, s)| s).unwrap_or(stem)
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_note_file(path: &Path) -> bool {
    path.extension().is_some_and(|e| e == "md")
        && !path
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with('.'))
}

fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Rejects any path that is not a markdown file inside the notes root.
pub fn checked_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.extension().is_none_or(|e| e != "md") {
        return Err("Not a markdown file".into());
    }
    let parent = path.parent().ok_or("Invalid path")?;
    let parent = parent.canonicalize().map_err(|e| e.to_string())?;
    let root = notes_root().canonicalize().map_err(|e| e.to_string())?;
    if !parent.starts_with(&root) {
        return Err("Path is outside the notes folder".into());
    }
    Ok(parent.join(path.file_name().ok_or("Invalid path")?))
}

fn note_meta(path: &Path) -> Option<NoteMeta> {
    let meta = fs::metadata(path).ok()?;
    let mut head = String::new();
    fs::File::open(path)
        .ok()?
        .take(META_READ_BYTES)
        .read_to_string(&mut head)
        .ok()
        .or_else(|| {
            // The cut may split a UTF-8 sequence; fall back to a lossy read.
            let bytes = fs::read(path).ok()?;
            let n = bytes.len().min(META_READ_BYTES as usize);
            head = String::from_utf8_lossy(&bytes[..n]).to_string();
            Some(n)
        })?;
    Some(NoteMeta {
        path: path.to_string_lossy().to_string(),
        title: parse_title(&head),
        preview: parse_preview(&head),
        modified: modified_ms(&meta),
    })
}

fn note_paths(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    Ok(fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| is_note_file(p))
        .collect())
}

pub fn sorted_notes(dir: &Path) -> Result<Vec<NoteMeta>, String> {
    let mut notes: Vec<NoteMeta> = note_paths(dir)?.iter().filter_map(|p| note_meta(p)).collect();
    notes.sort_by(|a, b| {
        let na = parse_file_number(&stem(Path::new(&a.path)));
        let nb = parse_file_number(&stem(Path::new(&b.path)));
        match (na, nb) {
            (Some(a), Some(b)) => b.cmp(&a),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => b.modified.cmp(&a.modified),
        }
    });
    Ok(notes)
}

fn next_number(dir: &Path) -> u64 {
    note_paths(dir)
        .unwrap_or_default()
        .iter()
        .filter_map(|p| parse_file_number(&stem(p)))
        .max()
        .unwrap_or(0)
        + 1
}

/// Writes through a temp file so a crash never leaves a half-written note.
fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let name = path.file_name().ok_or("Invalid path")?.to_string_lossy();
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Renames `<n>-<old-slug>.md` to match the note's current title.
fn sync_file_name(path: &Path, content: &str) -> PathBuf {
    let old = stem(path);
    let Some(number) = parse_file_number(&old) else {
        return path.to_path_buf();
    };
    let new = format!("{number}-{}", title_slug(content));
    if new == old {
        return path.to_path_buf();
    }
    let target = path.with_file_name(format!("{new}.md"));
    if target.exists() || fs::rename(path, &target).is_err() {
        return path.to_path_buf();
    }
    target
}

fn meta_after_write(path: &Path, content: &str) -> NoteMeta {
    NoteMeta {
        path: path.to_string_lossy().to_string(),
        title: parse_title(content),
        preview: parse_preview(content),
        modified: fs::metadata(path).map(|m| modified_ms(&m)).unwrap_or(0),
    }
}

fn workspace_path(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let config = state.config.lock().unwrap();
    if !config.workspaces.iter().any(|w| w.id == workspace_id) {
        return Err("Workspace not found".into());
    }
    let dir = workspace_dir(workspace_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub async fn list_notes(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<NoteMeta>, String> {
    let dir = workspace_path(&state, &workspace_id)?;
    sorted_notes(&dir)
}

#[tauri::command]
pub async fn read_note(path: String) -> Result<NoteContent, String> {
    let path = checked_path(&path)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let modified = fs::metadata(&path).map(|m| modified_ms(&m)).unwrap_or(0);
    Ok(NoteContent { content, modified })
}

#[tauri::command]
pub async fn write_note(path: String, content: String) -> Result<NoteMeta, String> {
    let path = checked_path(&path)?;
    let _guard = crate::FS_LOCK.lock().unwrap();
    write_atomic(&path, &content)?;
    let path = sync_file_name(&path, &content);
    Ok(meta_after_write(&path, &content))
}

#[tauri::command]
pub async fn create_note(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    content: String,
) -> Result<NoteMeta, String> {
    let dir = workspace_path(&state, &workspace_id)?;
    let _guard = crate::FS_LOCK.lock().unwrap();
    let path = dir.join(format!("{}-{}.md", next_number(&dir), title_slug(&content)));
    write_atomic(&path, &content)?;
    Ok(meta_after_write(&path, &content))
}

/// Moves a note to the macOS Trash so deletes are always recoverable.
#[tauri::command]
pub async fn trash_note(path: String) -> Result<(), String> {
    let path = checked_path(&path)?;
    let _guard = crate::FS_LOCK.lock().unwrap();
    trash::delete(&path).map_err(|e| e.to_string())
}

/// Puts a trashed note back, at its old file name when that is still free.
#[tauri::command]
pub async fn restore_note(path: String, content: String) -> Result<NoteMeta, String> {
    let path = checked_path(&path)?;
    let _guard = crate::FS_LOCK.lock().unwrap();
    let dir = path.parent().ok_or("Invalid path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let target = if path.exists() {
        dir.join(format!("{}-{}.md", next_number(dir), title_slug(&content)))
    } else {
        path.clone()
    };
    write_atomic(&target, &content)?;
    Ok(meta_after_write(&target, &content))
}

/// Renumbers notes so they sort in `order` (first = top). Only files whose
/// number changes are touched, via a temp name so no rename can clobber
/// another note that shares the same slug.
#[tauri::command]
pub async fn reorder_notes(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    order: Vec<String>,
) -> Result<Vec<Renamed>, String> {
    let dir = workspace_path(&state, &workspace_id)?;
    let _guard = crate::FS_LOCK.lock().unwrap();
    reorder_in_dir(&dir, &order)
}

pub fn reorder_in_dir(dir: &Path, order: &[String]) -> Result<Vec<Renamed>, String> {
    let existing = note_paths(dir)?;
    let mut ordered: Vec<PathBuf> = order
        .iter()
        .map(PathBuf::from)
        .filter(|p| existing.contains(p))
        .collect();
    // Notes the caller didn't know about keep their place after the given ones.
    let mut rest: Vec<PathBuf> = sorted_notes(dir)?
        .into_iter()
        .map(|n| PathBuf::from(n.path))
        .filter(|p| !ordered.contains(p))
        .collect();
    ordered.append(&mut rest);

    let total = ordered.len() as u64;
    let moves: Vec<(PathBuf, PathBuf)> = ordered
        .iter()
        .enumerate()
        .filter_map(|(i, p)| {
            let s = stem(p);
            let number = total - i as u64;
            if parse_file_number(&s) == Some(number) {
                return None;
            }
            let target = dir.join(format!("{number}-{}.md", slug_part(&s)));
            Some((p.clone(), target))
        })
        .collect();

    let staged: Vec<(PathBuf, PathBuf, PathBuf)> = moves
        .into_iter()
        .enumerate()
        .map(|(i, (from, to))| {
            let tmp = dir.join(format!("~reorder-{i}-{}", from.file_name().unwrap().to_string_lossy()));
            (from, tmp, to)
        })
        .collect();
    for (from, tmp, _) in &staged {
        fs::rename(from, tmp).map_err(|e| e.to_string())?;
    }
    let mut renamed = Vec::with_capacity(staged.len());
    for (from, tmp, to) in staged {
        fs::rename(&tmp, &to).map_err(|e| e.to_string())?;
        renamed.push(Renamed {
            from: from.to_string_lossy().to_string(),
            to: to.to_string_lossy().to_string(),
        });
    }
    Ok(renamed)
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let path = checked_path(&path)?;
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// One-time migration from the old `<unix-timestamp>.md` naming scheme.
pub fn migrate_timestamp_names(dir: &Path) {
    let mut old: Vec<PathBuf> = note_paths(dir)
        .unwrap_or_default()
        .into_iter()
        .filter(|p| {
            let s = stem(p);
            s.len() >= 10 && s.chars().all(|c| c.is_ascii_digit())
        })
        .collect();
    old.sort_by_key(|p| stem(p).parse::<u64>().unwrap_or(0));
    for path in old {
        let content = fs::read_to_string(&path).unwrap_or_default();
        let target = dir.join(format!("{}-{}.md", next_number(dir), title_slug(&content)));
        let _ = fs::rename(&path, target);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("write-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn title_from_first_h1() {
        assert_eq!(parse_title("# Hello World\nBody"), "Hello World");
        assert_eq!(parse_title("intro\n# Title Here\nBody"), "Title Here");
        assert_eq!(parse_title("## Not a title"), "Untitled");
        assert_eq!(parse_title("# \nbody"), "Untitled");
        assert_eq!(parse_title(""), "Untitled");
    }

    #[test]
    fn preview_skips_title_and_markup() {
        let content = "# Title\n\n- [ ] **buy** milk\n```js\ncode\n```\n> quoted _text_";
        assert_eq!(parse_preview(content), "buy milk code quoted text");
    }

    #[test]
    fn slugify_cases() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("Hello! World?"), "hello-world");
        assert_eq!(slugify("A--B--C"), "a-b-c");
        assert_eq!(slugify("  Hello  "), "hello");
        assert_eq!(slugify("Café"), "café");
        assert_eq!(slugify("日本語"), "日本語");
    }

    #[test]
    fn file_numbers() {
        assert_eq!(parse_file_number("42-my-note"), Some(42));
        assert_eq!(parse_file_number("hello"), None);
        assert_eq!(parse_file_number("-test"), None);
    }

    #[test]
    fn reorder_never_clobbers_same_slug() {
        let dir = temp_dir("reorder");
        for (n, body) in [(1, "one"), (2, "two"), (3, "three")] {
            fs::write(dir.join(format!("{n}-untitled.md")), body).unwrap();
        }
        let p = |n: u64| dir.join(format!("{n}-untitled.md")).to_string_lossy().to_string();
        // Move the bottom note to the top.
        reorder_in_dir(&dir, &[p(1), p(3), p(2)]).unwrap();
        assert_eq!(fs::read_to_string(dir.join("3-untitled.md")).unwrap(), "one");
        assert_eq!(fs::read_to_string(dir.join("2-untitled.md")).unwrap(), "three");
        assert_eq!(fs::read_to_string(dir.join("1-untitled.md")).unwrap(), "two");
        assert_eq!(note_paths(&dir).unwrap().len(), 3);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn file_name_follows_title() {
        let dir = temp_dir("rename");
        let path = dir.join("4-untitled.md");
        fs::write(&path, "").unwrap();
        let renamed = sync_file_name(&path, "# Grocery List\n");
        assert_eq!(renamed, dir.join("4-grocery-list.md"));
        assert!(renamed.exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
