import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/sidebar";
import { Editor } from "./components/editor";
import { EmptyState } from "./components/empty-state";
import { CommandPalette } from "./components/command-palette";
import { UpdatePrompt } from "./components/update-prompt";
import { SettingsPopover } from "./components/settings-popover";
import { Modal } from "./components/modal";
import { useFiles } from "./hooks/use-files";
import { useUpdater } from "./hooks/use-updater";
import { useSettings } from "./hooks/use-settings";

function App() {
  const {
    notes,
    selectedPath,
    content,
    isLoading,
    isSaving,
    loadNotes,
    selectNote,
    deselectNote,
    onSaved,
    onPathChanged,
    createNote,
    deleteNote,
    reorderNote,
  } = useFiles();

  const { updateAvailable, readyToInstall, restartAndInstall, checkForUpdates } = useUpdater();
  const { settings, setSetting } = useSettings();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; title: string } | null>(null);
  const [sidebarFocused, setSidebarFocused] = useState(false);

  const handleCloseEditor = useCallback(() => {
    deselectNote();
    setSidebarFocused(true);
  }, [deselectNote]);

  const handleDeleteRequest = useCallback(
    async (path: string) => {
      const text = await invoke<string>("read_note", { path });
      const lines = text.split("\n");
      const titleLineIndex = lines.findIndex((line) => line.startsWith("# "));
      const body =
        titleLineIndex === -1
          ? text
          : [...lines.slice(0, titleLineIndex), ...lines.slice(titleLineIndex + 1)].join("\n");

      if (body.trim() === "") {
        deleteNote(path);
      } else {
        const note = notes.find((n) => n.path === path);
        setDeleteConfirm({ path, title: note?.title || "Untitled" });
      }
    },
    [deleteNote, notes]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if (e.metaKey && e.key === "n") {
        e.preventDefault();
        createNote();
      } else if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen(true);
      } else if (e.metaKey && e.key === "Backspace" && selectedPath) {
        e.preventDefault();
        handleDeleteRequest(selectedPath);
      } else if (e.metaKey && e.shiftKey && e.key === "e") {
        e.preventDefault();
        setSidebarFocused(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNote, selectedPath, handleDeleteRequest]);

  useEffect(() => {
    const unlisten = listen("tauri://focus", () => {
      loadNotes();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadNotes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-[var(--color-muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg)]">
      <div
        className="fixed top-0 left-0 right-0 h-[52px] z-50 bg-black/[0.001]"
        onMouseDown={(e) => {
          if (e.buttons === 1) {
            if (e.detail === 2) {
              getCurrentWindow().toggleMaximize();
            } else {
              getCurrentWindow().startDragging();
            }
          }
        }}
      />

      <Sidebar
        notes={notes}
        selectedPath={selectedPath}
        onSelect={selectNote}
        onDelete={handleDeleteRequest}
        onReorder={reorderNote}
        isFocused={sidebarFocused}
        onFocusChange={setSidebarFocused}
      />

      <main className="flex-1 relative">
        {selectedPath ? (
          <Editor
            key={`${selectedPath}-${settings.vimMode}`}
            content={content}
            filePath={selectedPath}
            isSaving={isSaving}
            vimMode={settings.vimMode}
            onSaved={onSaved}
            onPathChanged={onPathChanged}
            onClose={handleCloseEditor}
          />
        ) : (
          <EmptyState />
        )}
      </main>

      <CommandPalette
        notes={notes}
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelect={selectNote}
        onCheckForUpdates={checkForUpdates}
        onOpenSettings={() => setIsSettingsOpen(true)}
        selectedPath={selectedPath}
        onDeleteCurrent={() => selectedPath && handleDeleteRequest(selectedPath)}
      />

      {readyToInstall && updateAvailable && (
        <UpdatePrompt
          version={updateAvailable.version}
          onRestart={restartAndInstall}
        />
      )}

      <SettingsPopover
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        vimMode={settings.vimMode}
        onVimModeChange={(v) => setSetting("vimMode", v)}
      />

      <Modal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Delete page?"
      >
        <p className="text-sm text-[var(--color-muted)] mb-4">
          "{deleteConfirm?.title}" has content. Are you sure?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-sm)] hover:bg-[var(--color-sidebar)] transition-colors"
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={() => {
              if (deleteConfirm) {
                deleteNote(deleteConfirm.path);
                setDeleteConfirm(null);
              }
            }}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-sm)] bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default App;
