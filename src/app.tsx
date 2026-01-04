import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/sidebar";
import { Editor } from "./components/editor";
import { EmptyState } from "./components/empty-state";
import { CommandPalette } from "./components/command-palette";
import { UpdatePrompt } from "./components/update-prompt";
import { SettingsPopover } from "./components/settings-popover";
import { WorkspaceSwitcher } from "./components/workspace-switcher";
import { Modal } from "./components/modal";
import { useFiles, type NoteEntry } from "./hooks/use-files";
import { useUpdater } from "./hooks/use-updater";
import { useSettings } from "./hooks/use-settings";
import { useWorkspaces } from "./hooks/use-workspaces";

function App() {
  const {
    notes,
    selectedPath,
    selectedNoteId,
    content,
    isLoading,
    isSaving,
    loadNotes,
    selectNote,
    deselectNote,
    onSaved,
    onPathChanged,
    updateNoteTitle,
    createNote,
    deleteNote,
    reorderNote,
  } = useFiles();

  const { updateAvailable, readyToInstall, restartAndInstall, checkForUpdates } = useUpdater();
  const { settings, setSetting } = useSettings();
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLoading: isWorkspacesLoading,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
  } = useWorkspaces();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkspaceSwitcherOpen, setIsWorkspaceSwitcherOpen] = useState(false);
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
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        setIsWorkspaceSwitcherOpen(true);
      } else if (e.metaKey && /^[1-9]$/.test(e.key)) {
        const workspace = workspaces.find((w) => w.shortcut === e.key);
        if (workspace && workspace.id !== activeWorkspaceId) {
          e.preventDefault();
          switchWorkspace(workspace.id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNote, selectedPath, handleDeleteRequest, workspaces, activeWorkspaceId, switchWorkspace]);

  useEffect(() => {
    const unlisten = listen("tauri://focus", () => {
      loadNotes();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadNotes]);

  const prevWorkspaceRef = useRef(activeWorkspaceId);

  useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      prevWorkspaceRef.current = activeWorkspaceId;
      return;
    }
    if (selectedPath && activeWorkspaceId) {
      const key = `write-workspace-${activeWorkspaceId}-selected`;
      localStorage.setItem(key, selectedPath);
    }
  }, [selectedPath, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;

    async function loadWorkspaceNotes() {
      deselectNote();
      await loadNotes();

      const key = `write-workspace-${activeWorkspaceId}-selected`;
      const savedPath = localStorage.getItem(key);
      const entries = await invoke<NoteEntry[]>("list_notes");

      if (savedPath && entries.some((n) => n.path === savedPath)) {
        selectNote(savedPath);
      } else if (entries.length > 0) {
        selectNote(entries[0].path);
      }
    }

    loadWorkspaceNotes();
  }, [activeWorkspaceId]);

  if (isLoading || isWorkspacesLoading) {
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
        activeWorkspace={activeWorkspace}
        onOpenWorkspaceSwitcher={() => setIsWorkspaceSwitcherOpen(true)}
      />

      <main className="flex-1 relative">
        {selectedPath ? (
          <Editor
            key={`${selectedNoteId}-${settings.vimMode}`}
            content={content}
            filePath={selectedPath}
            isSaving={isSaving}
            vimMode={settings.vimMode}
            onSaved={onSaved}
            onPathChanged={onPathChanged}
            onTitleChange={updateNoteTitle}
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

      <WorkspaceSwitcher
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        isOpen={isWorkspaceSwitcherOpen}
        onClose={() => setIsWorkspaceSwitcherOpen(false)}
        onSelect={(id) => {
          switchWorkspace(id);
          setIsWorkspaceSwitcherOpen(false);
        }}
        onCreate={(name) => {
          createWorkspace(name).then((w) => {
            switchWorkspace(w.id);
          });
        }}
        onDelete={deleteWorkspace}
        onRename={renameWorkspace}
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
