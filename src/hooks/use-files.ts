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

  const onSaved = useCallback(() => {
    loadNotes();
  }, [loadNotes]);

  const createNote = useCallback(async () => {
    try {
      const path = await invoke<string>("create_note");
      await loadNotes();
      await selectNote(path);
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }, [loadNotes, selectNote]);

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

  return {
    notes,
    selectedPath,
    content,
    isLoading,
    isSaving,
    loadNotes,
    selectNote,
    deselectNote,
    onSaved,
    createNote,
    deleteNote,
  };
}
