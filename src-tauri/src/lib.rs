use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};

fn get_notes_dir() -> PathBuf {
    let home = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("Notes")
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

#[tauri::command]
fn ensure_notes_dir() -> Result<String, String> {
    let notes_dir = get_notes_dir();
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir).map_err(|e| e.to_string())?;
    }
    Ok(notes_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_notes() -> Result<Vec<NoteEntry>, String> {
    let notes_dir = get_notes_dir();
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
                let content = fs::read_to_string(&path).unwrap_or_default();
                let title = parse_title(&content);
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

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

#[tauri::command]
fn read_note(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_note(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_note() -> Result<String, String> {
    let notes_dir = get_notes_dir();
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let path = notes_dir.join(format!("{}.md", timestamp));

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            rename_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
