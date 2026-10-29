mod notes;
mod search;
mod workspace;

use std::sync::Mutex;
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};

/// Serializes every mutating file operation (writes, renames, trash).
pub(crate) static FS_LOCK: Mutex<()> = Mutex::new(());

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = workspace::init();

    tauri::Builder::default()
        .manage(workspace::AppState {
            config: Mutex::new(config),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;

                let version = app.package_info().version.to_string();
                let app_menu = SubmenuBuilder::new(app, "Write")
                    .about(Some(AboutMetadata {
                        name: Some("Write".into()),
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
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .maximize()
                    .separator()
                    .fullscreen()
                    .close_window()
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu])
                    .build()?;
                app.set_menu(menu)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::get_workspaces,
            workspace::set_active_workspace,
            workspace::create_workspace,
            workspace::rename_workspace,
            workspace::delete_workspace,
            notes::list_notes,
            notes::read_note,
            notes::write_note,
            notes::create_note,
            notes::trash_note,
            notes::restore_note,
            notes::reorder_notes,
            notes::reveal_in_finder,
            search::search_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
