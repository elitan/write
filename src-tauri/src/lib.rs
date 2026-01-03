use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};

fn get_notes_dir() -> PathBuf {
    let home = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("Notes")
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

    migrate_old_notes(&notes_dir);

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
fn create_note() -> Result<String, String> {
    let notes_dir = get_notes_dir();
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
fn reorder_note(path: String, new_index: usize) -> Result<String, String> {
    let notes_dir = get_notes_dir();

    let mut entries: Vec<(PathBuf, u64, String)> = fs::read_dir(&notes_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let p = entry.path();
            if p.extension()?.to_str()? != "md" {
                return None;
            }
            let name = p.file_stem()?.to_string_lossy().to_string();
            let num = parse_file_number(&name)?;
            Some((p, num, name))
        })
        .collect();

    entries.sort_by(|a, b| b.1.cmp(&a.1));

    let source_path = PathBuf::from(&path);
    let source_idx = entries
        .iter()
        .position(|(p, _, _)| p == &source_path)
        .ok_or("Note not found")?;

    if source_idx == new_index || entries.len() <= 1 {
        return Ok(path);
    }

    let source_name = &entries[source_idx].2;
    let slug = source_name.splitn(2, '-').nth(1).unwrap_or("untitled");

    let adjusted_index = if new_index > source_idx {
        new_index.min(entries.len() - 1)
    } else {
        new_index
    };

    let new_number = if adjusted_index == 0 {
        entries.first().map(|(_, n, _)| n + 1).unwrap_or(1)
    } else if adjusted_index >= entries.len() {
        1
    } else {
        let above_idx = if adjusted_index <= source_idx {
            adjusted_index.saturating_sub(1)
        } else {
            adjusted_index
        };
        let below_idx = if adjusted_index <= source_idx {
            adjusted_index
        } else {
            adjusted_index
        };

        let above = entries.get(above_idx).map(|(_, n, _)| *n).unwrap_or(u64::MAX);
        let below = entries.get(below_idx).map(|(_, n, _)| *n).unwrap_or(0);

        if above > below + 1 {
            below + 1
        } else {
            let max_num = entries.iter().map(|(_, n, _)| *n).max().unwrap_or(0);
            for (i, (p, _, name)) in entries.iter().enumerate() {
                if i == source_idx {
                    continue;
                }
                let item_slug = name.splitn(2, '-').nth(1).unwrap_or("untitled");
                let new_num = max_num + 1 + (entries.len() - 1 - i) as u64;
                let new_p = notes_dir.join(format!("{}-{}.md", new_num, item_slug));
                if p != &new_p {
                    let _ = fs::rename(p, &new_p);
                }
            }
            let target_num = max_num + 1 + (entries.len() - 1 - adjusted_index) as u64;
            target_num
        }
    };

    let new_path = notes_dir.join(format!("{}-{}.md", new_number, slug));
    fs::rename(&source_path, &new_path).map_err(|e| e.to_string())?;

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
            rename_note,
            reveal_in_finder,
            reorder_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
