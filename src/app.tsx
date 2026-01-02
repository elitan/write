import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/sidebar";
import { Editor } from "./components/editor";
import { EmptyState } from "./components/empty-state";
import { CommandPalette } from "./components/command-palette";
import { useFiles } from "./hooks/use-files";

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

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if (e.metaKey && e.key === "n") {
        e.preventDefault();
        createNote();
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
      />

      <main className="flex-1 relative">
        {selectedPath ? (
          <Editor
            key={selectedPath}
            content={content}
            filePath={selectedPath}
            isSaving={isSaving}
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
    </div>
  );
}

export default App;
