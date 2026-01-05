use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};

#[derive(Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub shortcut: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceConfig {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: String,
}

pub struct AppState {
    pub config: Mutex<WorkspaceConfig>,
}

fn get_notes_root() -> PathBuf {
    let home = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("Notes")
}

fn get_config_path() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    data_dir.join("com.write.app").join("workspaces.json")
}

fn load_config() -> WorkspaceConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }
    WorkspaceConfig {
        workspaces: vec![],
        active_workspace_id: String::new(),
    }
}

fn save_config(config: &WorkspaceConfig) -> Result<(), String> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

fn get_workspace_dir(workspace_id: &str) -> PathBuf {
    get_notes_root().join(workspace_id)
}

fn migrate_existing_notes() -> Result<WorkspaceConfig, String> {
    let notes_root = get_notes_root();
    let personal_dir = notes_root.join("Personal");

    if !notes_root.exists() {
        fs::create_dir_all(&personal_dir).map_err(|e| e.to_string())?;
    } else {
        fs::create_dir_all(&personal_dir).map_err(|e| e.to_string())?;

        let entries: Vec<_> = fs::read_dir(&notes_root)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| {
                let path = e.path();
                path.is_file() && path.extension().is_some_and(|ext| ext == "md")
            })
            .collect();

        for entry in entries {
            let old_path = entry.path();
            let file_name = old_path.file_name().unwrap();
            let new_path = personal_dir.join(file_name);
            fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
        }
    }

    let config = WorkspaceConfig {
        workspaces: vec![Workspace {
            id: "Personal".to_string(),
            name: "Personal".to_string(),
            shortcut: Some("1".to_string()),
        }],
        active_workspace_id: "Personal".to_string(),
    };

    save_config(&config)?;
    Ok(config)
}

fn init_workspaces() -> WorkspaceConfig {
    let config_path = get_config_path();
    let config = if config_path.exists() {
        load_config()
    } else {
        migrate_existing_notes().unwrap_or_else(|_| WorkspaceConfig {
            workspaces: vec![Workspace {
                id: "Personal".to_string(),
                name: "Personal".to_string(),
                shortcut: Some("1".to_string()),
            }],
            active_workspace_id: "Personal".to_string(),
        })
    };

    for workspace in &config.workspaces {
        let notes_dir = get_workspace_dir(&workspace.id);
        if notes_dir.exists() {
            migrate_old_notes(&notes_dir);
        }
    }

    config
}

fn slugify(text: &str) -> String {
    let slug: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let mut result = String::new();
    let mut prev_dash = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash && !result.is_empty() {
                result.push(c);
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    result.trim_end_matches('-').to_string()
}

fn parse_file_number(name: &str) -> Option<u64> {
    let dash_pos = name.find('-')?;
    name[..dash_pos].parse().ok()
}

fn get_next_number(notes_dir: &std::path::Path) -> u64 {
    let max = fs::read_dir(notes_dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let name = e.path().file_stem()?.to_string_lossy().to_string();
                    parse_file_number(&name)
                })
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0);
    max + 1
}

fn is_old_timestamp_format(name: &str) -> bool {
    name.len() >= 10 && name.chars().all(|c| c.is_ascii_digit())
}

fn migrate_old_notes(notes_dir: &std::path::Path) {
    let Ok(entries) = fs::read_dir(notes_dir) else {
        return;
    };

    let mut old_files: Vec<_> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let path = e.path();
            path.extension().is_some_and(|ext| ext == "md")
                && path
                    .file_stem()
                    .is_some_and(|s| is_old_timestamp_format(&s.to_string_lossy()))
        })
        .collect();

    old_files.sort_by_key(|e| {
        e.path()
            .file_stem()
            .and_then(|s| s.to_string_lossy().parse::<u64>().ok())
            .unwrap_or(0)
    });

    for entry in old_files {
        let path = entry.path();
        let number = get_next_number(notes_dir);
        let content = fs::read_to_string(&path).unwrap_or_default();
        let title = parse_title(&content);
        let slug = if title == "Untitled" || title.is_empty() {
            "untitled".to_string()
        } else {
            slugify(&title)
        };
        let new_path = notes_dir.join(format!("{}-{}.md", number, slug));
        let _ = fs::rename(&path, &new_path);
    }
}

#[derive(Serialize, Deserialize)]
pub struct NoteEntry {
    pub name: String,
    pub path: String,
    pub modified: u64,
    pub title: String,
}

fn parse_title(content: &str) -> String {
    content
        .lines()
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").to_string())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn read_title_from_file(path: &std::path::Path) -> String {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return "Untitled".to_string(),
    };
    let mut reader = BufReader::new(file);
    let mut buf = [0u8; 200];
    let n = reader.read(&mut buf).unwrap_or(0);
    let content = String::from_utf8_lossy(&buf[..n]);
    parse_title(&content)
}

#[tauri::command]
fn ensure_notes_dir(state: tauri::State<AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap();
    let notes_dir = get_workspace_dir(&config.active_workspace_id);
    drop(config);
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir).map_err(|e| e.to_string())?;
    }
    Ok(notes_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_workspaces(state: tauri::State<AppState>) -> Result<WorkspaceConfig, String> {
    let config = state.config.lock().unwrap();
    Ok(config.clone())
}

#[tauri::command]
fn set_active_workspace(state: tauri::State<AppState>, workspace_id: String) -> Result<(), String> {
    let mut config = state.config.lock().unwrap();
    if !config.workspaces.iter().any(|w| w.id == workspace_id) {
        return Err("Workspace not found".to_string());
    }
    config.active_workspace_id = workspace_id;
    save_config(&config)
}

#[tauri::command]
fn create_workspace(state: tauri::State<AppState>, name: String) -> Result<Workspace, String> {
    let mut config = state.config.lock().unwrap();

    let id = slugify(&name);
    if id.is_empty() {
        return Err("Invalid workspace name".to_string());
    }
    if config.workspaces.iter().any(|w| w.id == id) {
        return Err("Workspace already exists".to_string());
    }

    let workspace_dir = get_workspace_dir(&id);
    fs::create_dir_all(&workspace_dir).map_err(|e| e.to_string())?;

    let next_shortcut = (1..=9)
        .map(|n| n.to_string())
        .find(|s| !config.workspaces.iter().any(|w| w.shortcut.as_ref() == Some(s)));

    let workspace = Workspace {
        id: id.clone(),
        name,
        shortcut: next_shortcut,
    };

    config.workspaces.push(workspace.clone());
    save_config(&config)?;

    Ok(workspace)
}

#[tauri::command]
fn delete_workspace(state: tauri::State<AppState>, workspace_id: String) -> Result<(), String> {
    let mut config = state.config.lock().unwrap();

    if config.workspaces.len() <= 1 {
        return Err("Cannot delete the last workspace".to_string());
    }

    let idx = config
        .workspaces
        .iter()
        .position(|w| w.id == workspace_id)
        .ok_or("Workspace not found")?;

    config.workspaces.remove(idx);

    if config.active_workspace_id == workspace_id {
        config.active_workspace_id = config.workspaces[0].id.clone();
    }

    save_config(&config)
}

#[tauri::command]
fn rename_workspace(state: tauri::State<AppState>, workspace_id: String, new_name: String) -> Result<Workspace, String> {
    let mut config = state.config.lock().unwrap();

    let workspace = config
        .workspaces
        .iter_mut()
        .find(|w| w.id == workspace_id)
        .ok_or("Workspace not found")?;

    workspace.name = new_name;
    let updated = workspace.clone();

    save_config(&config)?;
    Ok(updated)
}

#[tauri::command]
fn list_notes(state: tauri::State<AppState>) -> Result<Vec<NoteEntry>, String> {
    let config = state.config.lock().unwrap();
    let notes_dir = get_workspace_dir(&config.active_workspace_id);
    drop(config);

    if !notes_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<NoteEntry> = fs::read_dir(&notes_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "md" {
                let metadata = entry.metadata().ok()?;
                let modified = metadata
                    .modified()
                    .ok()?
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()?
                    .as_secs();
                let name = path.file_stem()?.to_string_lossy().to_string();
                let title = read_title_from_file(&path);
                Some(NoteEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    modified,
                    title,
                })
            } else {
                None
            }
        })
        .collect();

    entries.sort_by(|a, b| {
        let num_a = parse_file_number(&a.name);
        let num_b = parse_file_number(&b.name);
        match (num_a, num_b) {
            (Some(a), Some(b)) => b.cmp(&a),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => b.modified.cmp(&a.modified),
        }
    });
    Ok(entries)
}

#[tauri::command]
fn read_note(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_note(path: String, content: String) -> Result<String, String> {
    fs::write(&path, &content).map_err(|e| e.to_string())?;

    let old_path = PathBuf::from(&path);
    let parent = old_path.parent().ok_or("Invalid path")?;
    let old_name = old_path
        .file_stem()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .to_string();

    let number = parse_file_number(&old_name);
    if number.is_none() {
        return Ok(path);
    }
    let number = number.unwrap();

    let title = parse_title(&content);
    let slug = if title == "Untitled" || title.is_empty() {
        "untitled".to_string()
    } else {
        slugify(&title)
    };

    let new_name = format!("{}-{}", number, slug);
    if new_name == old_name {
        return Ok(path);
    }

    let new_path = parent.join(format!("{}.md", new_name));
    if new_path.exists() && new_path != old_path {
        return Ok(path);
    }

    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_note(state: tauri::State<AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap();
    let notes_dir = get_workspace_dir(&config.active_workspace_id);
    drop(config);

    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir).map_err(|e| e.to_string())?;
    }

    let number = get_next_number(&notes_dir);
    let path = notes_dir.join(format!("{}-untitled.md", number));

    fs::write(&path, "\n").map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_note(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_note(old_path: String, new_name: String) -> Result<String, String> {
    let old_path = PathBuf::from(&old_path);
    let parent = old_path.parent().ok_or("Invalid path")?;
    let new_path = parent.join(format!("{}.md", new_name));

    if new_path.exists() {
        return Err("A note with this name already exists".to_string());
    }

    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reorder_note(state: tauri::State<AppState>, path: String, new_index: usize) -> Result<String, String> {
    let config = state.config.lock().unwrap();
    let notes_dir = get_workspace_dir(&config.active_workspace_id);
    drop(config);

    let mut entries: Vec<(PathBuf, String)> = fs::read_dir(&notes_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let p = entry.path();
            if p.extension()?.to_str()? != "md" {
                return None;
            }
            let name = p.file_stem()?.to_string_lossy().to_string();
            parse_file_number(&name)?;
            Some((p, name))
        })
        .collect();

    entries.sort_by(|a, b| {
        let num_a = parse_file_number(&a.1).unwrap_or(0);
        let num_b = parse_file_number(&b.1).unwrap_or(0);
        num_b.cmp(&num_a)
    });

    let source_path = PathBuf::from(&path);
    let source_idx = entries.iter().position(|(p, _)| p == &source_path).ok_or("Note not found")?;

    if source_idx == new_index || entries.len() <= 1 {
        return Ok(path);
    }

    let item = entries.remove(source_idx);
    let insert_idx = new_index.min(entries.len());
    entries.insert(insert_idx, item);

    let mut new_path_result = path.clone();
    for (i, (old_path, name)) in entries.iter().enumerate() {
        let slug = name.splitn(2, '-').nth(1).unwrap_or("untitled");
        let new_num = (entries.len() - i) as u64;
        let new_p = notes_dir.join(format!("{}-{}.md", new_num, slug));
        if old_path != &new_p {
            fs::rename(old_path, &new_p).map_err(|e| e.to_string())?;
            if *old_path == source_path {
                new_path_result = new_p.to_string_lossy().to_string();
            }
        }
    }

    Ok(new_path_result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = init_workspaces();

    tauri::Builder::default()
        .manage(AppState {
            config: Mutex::new(config),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let handle = app.handle();
                handle.plugin(tauri_plugin_updater::Builder::new().build())?;

                let version = app.package_info().version.to_string();

                let app_submenu = SubmenuBuilder::new(app, "Write")
                    .about(Some(AboutMetadata {
                        name: Some("Write".to_string()),
                        version: Some(version),
                        ..Default::default()
                    }))
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;

                let edit_submenu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                let window_submenu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .separator()
                    .close_window()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .items(&[&app_submenu, &edit_submenu, &window_submenu])
                    .build()?;

                app.set_menu(menu)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ensure_notes_dir,
            list_notes,
            read_note,
            write_note,
            create_note,
            delete_note,
            rename_note,
            reveal_in_finder,
            reorder_note,
            get_workspaces,
            set_active_workspace,
            create_workspace,
            delete_workspace,
            rename_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_title_with_h1() {
        assert_eq!(parse_title("# Hello World\nBody text"), "Hello World");
        assert_eq!(parse_title("# My Note"), "My Note");
    }

    #[test]
    fn test_parse_title_with_content_before_h1() {
        assert_eq!(parse_title("Some intro\n# Title Here\nBody"), "Title Here");
    }

    #[test]
    fn test_parse_title_no_h1() {
        assert_eq!(parse_title("No heading here"), "Untitled");
        assert_eq!(parse_title(""), "Untitled");
    }

    #[test]
    fn test_parse_title_h2_not_matched() {
        assert_eq!(parse_title("## Not a title"), "Untitled");
    }

    #[test]
    fn test_slugify_basic() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("My Note"), "my-note");
    }

    #[test]
    fn test_slugify_special_chars() {
        assert_eq!(slugify("Hello! World?"), "hello-world");
        assert_eq!(slugify("Test@#$%Name"), "test-name");
    }

    #[test]
    fn test_slugify_consecutive_dashes() {
        assert_eq!(slugify("Hello   World"), "hello-world");
        assert_eq!(slugify("A--B--C"), "a-b-c");
    }

    #[test]
    fn test_slugify_leading_trailing() {
        assert_eq!(slugify("  Hello  "), "hello");
        assert_eq!(slugify("---test---"), "test");
    }

    #[test]
    fn test_slugify_unicode() {
        assert_eq!(slugify("Café"), "café");
        assert_eq!(slugify("日本語"), "日本語");
    }

    #[test]
    fn test_parse_file_number_valid() {
        assert_eq!(parse_file_number("1-hello"), Some(1));
        assert_eq!(parse_file_number("42-my-note"), Some(42));
        assert_eq!(parse_file_number("100-test"), Some(100));
    }

    #[test]
    fn test_parse_file_number_invalid() {
        assert_eq!(parse_file_number("hello"), None);
        assert_eq!(parse_file_number("abc-123"), None);
        assert_eq!(parse_file_number("-test"), None);
    }

    #[test]
    fn test_is_old_timestamp_format_valid() {
        assert!(is_old_timestamp_format("1704067200000"));
        assert!(is_old_timestamp_format("1234567890"));
    }

    #[test]
    fn test_is_old_timestamp_format_invalid() {
        assert!(!is_old_timestamp_format("123"));
        assert!(!is_old_timestamp_format("abc1234567"));
        assert!(!is_old_timestamp_format("12-hello"));
    }
}
