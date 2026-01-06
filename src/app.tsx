import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommandPalette } from "./components/command-palette";
import { DebugPanel, debugLog } from "./components/debug-panel";
import { Editor } from "./components/editor";
import { EmptyState } from "./components/empty-state";
import { Modal } from "./components/modal";
import { SettingsPopover } from "./components/settings-popover";
import { Sidebar } from "./components/sidebar";
import { UpdatePrompt } from "./components/update-prompt";
import { WorkspaceSwitcher } from "./components/workspace-switcher";
import { useSettings } from "./hooks/use-settings";
import { useUpdater } from "./hooks/use-updater";
import { useNotesStore } from "./stores/notes-store";

function App() {
  const notes = useNotesStore((s) => s.notes);
  const selectedPath = useNotesStore((s) => s.selectedPath);
  const notesLoading = useNotesStore((s) => s.notesLoading);
  const workspacesLoading = useNotesStore((s) => s.workspacesLoading);
  const workspaces = useNotesStore((s) => s.workspaces);
  const activeWorkspaceId = useNotesStore((s) => s.activeWorkspaceId);
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const loadWorkspaces = useNotesStore((s) => s.loadWorkspaces);
  const loadNotes = useNotesStore((s) => s.loadNotes);
  const selectNote = useNotesStore((s) => s.selectNote);
  const deselectNote = useNotesStore((s) => s.deselectNote);
  const createNote = useNotesStore((s) => s.createNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const reorderNote = useNotesStore((s) => s.reorderNote);
  const switchWorkspace = useNotesStore((s) => s.switchWorkspace);
  const createWorkspace = useNotesStore((s) => s.createWorkspace);
  const deleteWorkspace = useNotesStore((s) => s.deleteWorkspace);
  const renameWorkspace = useNotesStore((s) => s.renameWorkspace);

  const {
    updateAvailable,
    readyToInstall,
    restartAndInstall,
    checkForUpdates,
  } = useUpdater();
  const { settings, setSetting } = useSettings();

  type ModalType = "palette" | "settings" | "workspace" | "debug" | null;
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    path: string;
    title: string;
  } | null>(null);
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
          : [
              ...lines.slice(0, titleLineIndex),
              ...lines.slice(titleLineIndex + 1),
            ].join("\n");

      if (body.trim() === "") {
        deleteNote(path);
      } else {
        const note = notes.find((n) => n.path === path);
        setDeleteConfirm({ path, title: note?.title || "Untitled" });
      }
    },
    [deleteNote, notes],
  );

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      debugLog("app:keydown", {
        key: e.key,
        code: e.code,
        meta: e.metaKey,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        target: target.tagName,
        sidebarFocused,
      });

      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        debugLog("app:action", { action: "openCommandPalette" });
        setOpenModal("palette");
      } else if (e.metaKey && e.key === "n") {
        e.preventDefault();
        debugLog("app:action", { action: "createNote" });
        createNote();
      } else if (e.metaKey && e.key === ",") {
        e.preventDefault();
        debugLog("app:action", { action: "openSettings" });
        setOpenModal("settings");
      } else if (e.metaKey && e.key === "Backspace" && selectedPath) {
        e.preventDefault();
        debugLog("app:action", { action: "deleteNote", selectedPath });
        handleDeleteRequest(selectedPath);
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        debugLog("app:action", {
          action: "focusSidebar",
          before: sidebarFocused,
        });
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setSidebarFocused(true);
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        debugLog("app:action", { action: "openWorkspaceSwitcher" });
        setOpenModal("workspace");
      } else if (e.metaKey && /^[1-9]$/.test(e.key)) {
        const workspace = workspaces.find((w) => w.shortcut === e.key);
        if (workspace && workspace.id !== activeWorkspaceId) {
          e.preventDefault();
          debugLog("app:action", {
            action: "switchWorkspace",
            workspace: workspace.name,
          });
          switchWorkspace(workspace.id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    createNote,
    selectedPath,
    handleDeleteRequest,
    workspaces,
    activeWorkspaceId,
    switchWorkspace,
    sidebarFocused,
  ]);

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
      await loadNotes();

      const key = `write-workspace-${activeWorkspaceId}-selected`;
      const savedPath = localStorage.getItem(key);
      const storeNotes = useNotesStore.getState().notes;

      if (savedPath && storeNotes.some((n) => n.path === savedPath)) {
        selectNote(savedPath);
      } else if (storeNotes.length > 0) {
        selectNote(storeNotes[0].path);
      }
    }

    loadWorkspaceNotes();
  }, [activeWorkspaceId]);

  if (notesLoading || workspacesLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-[var(--color-muted)]">
          Loading...
        </div>
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
        onOpenWorkspaceSwitcher={() => setOpenModal("workspace")}
      />

      <main className="flex-1 relative">
        {selectedPath ? (
          <Editor
            key={`${selectedPath}-${settings.vimMode}`}
            vimMode={settings.vimMode}
            onClose={handleCloseEditor}
          />
        ) : (
          <EmptyState />
        )}
      </main>

      <CommandPalette
        notes={notes}
        isOpen={openModal === "palette"}
        onClose={() => setOpenModal(null)}
        onSelect={selectNote}
        onCheckForUpdates={checkForUpdates}
        onOpenSettings={() => setOpenModal("settings")}
        onToggleDebug={() =>
          setOpenModal((m) => (m === "debug" ? null : "debug"))
        }
        selectedPath={selectedPath}
        onDeleteCurrent={() =>
          selectedPath && handleDeleteRequest(selectedPath)
        }
      />

      {readyToInstall && updateAvailable && (
        <UpdatePrompt
          version={updateAvailable.version}
          onRestart={restartAndInstall}
        />
      )}

      <SettingsPopover
        isOpen={openModal === "settings"}
        onClose={() => setOpenModal(null)}
        vimMode={settings.vimMode}
        onVimModeChange={(v) => setSetting("vimMode", v)}
      />

      <WorkspaceSwitcher
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        isOpen={openModal === "workspace"}
        onClose={() => setOpenModal(null)}
        onSelect={(id) => {
          switchWorkspace(id);
          setOpenModal(null);
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

      <DebugPanel
        isOpen={openModal === "debug"}
        onClose={() => setOpenModal(null)}
        state={{
          sidebarFocused,
          selectedPath,
          notesCount: notes.length,
          openModal,
        }}
      />
    </div>
  );
}

export default App;
