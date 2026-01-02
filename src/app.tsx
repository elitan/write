import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/sidebar";
import { Editor } from "./components/editor";
import { EmptyState } from "./components/empty-state";
import { CommandPalette } from "./components/command-palette";
import { UpdatePrompt } from "./components/update-prompt";
import { SettingsPopover } from "./components/settings-popover";
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
    selectNote,
    onSaved,
    createNote,
    deleteNote,
  } = useFiles();

  const { updateAvailable, readyToInstall, restartAndInstall } = useUpdater();
  const { settings, setSetting } = useSettings();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNote]);

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
        onCreate={createNote}
        onDelete={deleteNote}
        onSettingsClick={() => setIsSettingsOpen(true)}
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
          />
        ) : (
          <EmptyState onCreate={createNote} />
        )}
      </main>

      <CommandPalette
        notes={notes}
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelect={selectNote}
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
    </div>
  );
}

export default App;
