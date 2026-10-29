//! Workspaces: named folders under `~/Documents/Notes`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::notes::{migrate_timestamp_names, slugify};

#[derive(Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub shortcut: Option<String>,
}

/// On-disk format, shared with earlier versions of the app.
#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceConfig {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: String,
}

pub struct AppState {
    pub config: Mutex<WorkspaceConfig>,
}

pub fn notes_root() -> PathBuf {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    ROOT.get_or_init(|| {
        let root = dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Notes");
        let _ = fs::create_dir_all(&root);
        // Canonical so paths compare equal however the folder was reached.
        root.canonicalize().unwrap_or(root)
    })
    .clone()
}

pub fn workspace_dir(workspace_id: &str) -> PathBuf {
    notes_root().join(workspace_id)
}

fn config_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.write.app")
        .join("workspaces.json")
}

fn save_config(config: &WorkspaceConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

fn default_config() -> WorkspaceConfig {
    WorkspaceConfig {
        workspaces: vec![Workspace {
            id: "Personal".into(),
            name: "Personal".into(),
            shortcut: Some("1".into()),
        }],
        active_workspace_id: "Personal".into(),
    }
}

/// First launch: move loose notes from the root into a "Personal" workspace.
fn migrate_loose_notes() -> Result<WorkspaceConfig, String> {
    let root = notes_root();
    let personal = root.join("Personal");
    fs::create_dir_all(&personal).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|e| e == "md") {
            fs::rename(&path, personal.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }
    let config = default_config();
    save_config(&config)?;
    Ok(config)
}

pub fn init() -> WorkspaceConfig {
    let mut config = fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str::<WorkspaceConfig>(&s).ok())
        .unwrap_or_else(|| migrate_loose_notes().unwrap_or_else(|_| default_config()));

    if config.workspaces.is_empty() {
        config = default_config();
    }
    if !config.workspaces.iter().any(|w| w.id == config.active_workspace_id) {
        config.active_workspace_id = config.workspaces[0].id.clone();
    }
    for workspace in &config.workspaces {
        let dir = workspace_dir(&workspace.id);
        let _ = fs::create_dir_all(&dir);
        migrate_timestamp_names(&dir);
    }
    config
}

fn snapshot(config: &WorkspaceConfig) -> WorkspaceState {
    WorkspaceState {
        workspaces: config.workspaces.clone(),
        active_workspace_id: config.active_workspace_id.clone(),
    }
}

#[tauri::command]
pub fn get_workspaces(state: tauri::State<AppState>) -> WorkspaceState {
    snapshot(&state.config.lock().unwrap())
}

#[tauri::command]
pub fn set_active_workspace(state: tauri::State<AppState>, workspace_id: String) -> Result<(), String> {
    let mut config = state.config.lock().unwrap();
    if !config.workspaces.iter().any(|w| w.id == workspace_id) {
        return Err("Workspace not found".into());
    }
    config.active_workspace_id = workspace_id;
    save_config(&config)
}

#[tauri::command]
pub fn create_workspace(state: tauri::State<AppState>, name: String) -> Result<Workspace, String> {
    let name = name.trim().to_string();
    let mut config = state.config.lock().unwrap();
    let id = slugify(&name);
    if id.is_empty() {
        return Err("Enter a name with at least one letter or number".into());
    }
    if config.workspaces.iter().any(|w| w.id.eq_ignore_ascii_case(&id)) {
        return Err(format!("A workspace named \u{201c}{name}\u{201d} already exists"));
    }
    fs::create_dir_all(workspace_dir(&id)).map_err(|e| e.to_string())?;
    let shortcut = (1..=9)
        .map(|n| n.to_string())
        .find(|s| !config.workspaces.iter().any(|w| w.shortcut.as_ref() == Some(s)));
    let workspace = Workspace { id, name, shortcut };
    config.workspaces.push(workspace.clone());
    save_config(&config)?;
    Ok(workspace)
}

#[tauri::command]
pub fn rename_workspace(
    state: tauri::State<AppState>,
    workspace_id: String,
    name: String,
) -> Result<Workspace, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Name can't be empty".into());
    }
    let mut config = state.config.lock().unwrap();
    let workspace = config
        .workspaces
        .iter_mut()
        .find(|w| w.id == workspace_id)
        .ok_or("Workspace not found")?;
    workspace.name = name;
    let updated = workspace.clone();
    save_config(&config)?;
    Ok(updated)
}

/// Removes the workspace from the app. Its folder and notes stay on disk.
#[tauri::command]
pub fn delete_workspace(state: tauri::State<AppState>, workspace_id: String) -> Result<WorkspaceState, String> {
    let mut config = state.config.lock().unwrap();
    if config.workspaces.len() <= 1 {
        return Err("You need at least one workspace".into());
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
    save_config(&config)?;
    Ok(snapshot(&config))
}
