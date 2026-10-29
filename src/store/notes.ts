import { create } from "zustand";
import type { NoteMeta, Workspace } from "../lib/api";

export interface Note extends NoteMeta {
  /** Stable for the app session, unlike `path` which follows the title. */
  id: string;
  workspaceId: string;
}

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

interface NotesState {
  ready: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  notes: Note[];
  selectedId: string | null;
  /** Live title of the open note (the textarea's value). */
  title: string;
  wordCount: number;
  saveStatus: SaveStatus;
}

export const useNotes = create<NotesState>(() => ({
  ready: false,
  workspaces: [],
  activeWorkspaceId: "",
  notes: [],
  selectedId: null,
  title: "",
  wordCount: 0,
  saveStatus: "saved",
}));

const idsByPath = new Map<string, string>();
let nextId = 0;

export function newNoteId() {
  return `n${++nextId}`;
}

export function idForPath(path: string) {
  let id = idsByPath.get(path);
  if (!id) {
    id = newNoteId();
    idsByPath.set(path, id);
  }
  return id;
}

export function getNote(id: string | null) {
  if (!id) return undefined;
  return useNotes.getState().notes.find((n) => n.id === id);
}

export function selectedNote() {
  return getNote(useNotes.getState().selectedId);
}

export function activeWorkspace() {
  const { workspaces, activeWorkspaceId } = useNotes.getState();
  return workspaces.find((w) => w.id === activeWorkspaceId);
}

export function patchNote(id: string, patch: Partial<Note>) {
  if (patch.path) idsByPath.set(patch.path, id);
  useNotes.setState((s) => ({
    notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  }));
}

export function renamePaths(renames: { from: string; to: string }[]) {
  if (!renames.length) return;
  const map = new Map(renames.map((r) => [r.from, r.to]));
  // Paths can swap (A→B while B→C), so read every id before writing any.
  const ids = renames.map((r) => idsByPath.get(r.from));
  for (const { from } of renames) idsByPath.delete(from);
  renames.forEach(({ to }, i) => {
    const id = ids[i];
    if (id) idsByPath.set(to, id);
  });
  useNotes.setState((s) => ({
    notes: s.notes.map((n) =>
      map.has(n.path) ? { ...n, path: map.get(n.path)! } : n,
    ),
  }));
}

// Module-level state can't be hot-swapped; reload instead of splitting it.
import.meta.hot?.accept(() => location.reload());
