import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface NoteEntry {
  name: string;
  path: string;
  modified: number;
  title: string;
}

export function useFiles() {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, _setIsSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      await invoke("ensure_notes_dir");
      const entries = await invoke<NoteEntry[]>("list_notes");
      setNotes(entries);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const selectNote = useCallback(async (path: string) => {
    try {
      const noteId = `${Date.now()}`;
      setSelectedNoteId(noteId);
      const text = await invoke<string>("read_note", { path });
      setSelectedPath(path);
      setContent(text);
    } catch (err) {
      console.error("Failed to read note:", err);
    }
  }, []);

  const deselectNote = useCallback(() => {
    setSelectedPath(null);
    setContent("");
  }, []);

  const onSaved = useCallback(() => {}, []);

  const onPathChanged = useCallback((oldPath: string, newPath: string) => {
    setSelectedPath(newPath);
    setNotes((prev) =>
      prev.map((n) =>
        n.path === oldPath
          ? { ...n, path: newPath, name: newPath.split("/").pop()! }
          : n
      )
    );
  }, []);

  const updateNoteTitle = useCallback((path: string, title: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.path === path ? { ...n, title: title || "New Page" } : n
      )
    );
  }, []);

  const createNote = useCallback(async () => {
    const noteId = `${Date.now()}`;
    const tempPath = `temp-${noteId}`;
    const tempNote: NoteEntry = {
      name: tempPath,
      path: tempPath,
      modified: Date.now(),
      title: "New Page",
    };
    setNotes((prev) => [tempNote, ...prev]);
    setSelectedNoteId(noteId);
    setSelectedPath(tempPath);
    setContent("\n");

    try {
      const path = await invoke<string>("create_note");
      setNotes((prev) =>
        prev.map((n) =>
          n.path === tempPath
            ? { ...n, path, name: path.split("/").pop()! }
            : n
        )
      );
      setSelectedPath(path);
    } catch (err) {
      console.error("Failed to create note:", err);
      setNotes((prev) => prev.filter((n) => n.path !== tempPath));
    }
  }, []);

  const deleteNote = useCallback(
    async (path: string) => {
      try {
        await invoke("delete_note", { path });
        if (selectedPath === path) {
          setSelectedPath(null);
          setContent("");
        }
        await loadNotes();
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
    },
    [selectedPath, loadNotes]
  );

  const reorderNote = useCallback(
    async (path: string, newIndex: number) => {
      try {
        const newPath = await invoke<string>("reorder_note", {
          path,
          newIndex,
        });
        if (selectedPath === path) {
          setSelectedPath(newPath);
        }
        await loadNotes();
      } catch (err) {
        console.error("Failed to reorder note:", err);
      }
    },
    [selectedPath, loadNotes]
  );

  return {
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
  };
}
