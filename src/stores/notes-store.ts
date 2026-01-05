import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { create, type StoreApi } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface NoteEntry {
  name: string;
  path: string;
  modified: number;
  title: string;
}

export interface NoteContent {
  title: string;
  body: string;
  isDirty: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  shortcut: string | null;
}

interface WorkspaceConfig {
  workspaces: Workspace[];
  active_workspace_id: string;
}

export function parseContent(content: string): { title: string; body: string } {
  const lines = content.split("\n");
  const titleLineIndex = lines.findIndex((line) => line.startsWith("# "));
  if (titleLineIndex === -1) {
    return { title: "", body: content };
  }
  const title = lines[titleLineIndex].slice(2);
  const body = [
    ...lines.slice(0, titleLineIndex),
    ...lines.slice(titleLineIndex + 1),
  ].join("\n");
  return { title, body };
}

export function buildContent(title: string, body: string): string {
  return `# ${title}\n${body}`;
}

interface NotesState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspacesLoading: boolean;

  notes: NoteEntry[];
  notesLoading: boolean;

  selectedPath: string | null;
  noteContent: NoteContent | null;
}

type Invoker = typeof tauriInvoke;

interface NotesActions {
  loadWorkspaces: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, newName: string) => Promise<Workspace>;

  loadNotes: () => Promise<void>;
  selectNote: (path: string) => Promise<void>;
  deselectNote: () => void;
  createNote: () => Promise<void>;
  deleteNote: (path: string) => Promise<void>;
  reorderNote: (path: string, newIndex: number) => Promise<void>;

  setTitle: (title: string) => void;
  setBody: (body: string) => void;
  flush: () => Promise<void>;
}

export type NotesStore = NotesState &
  NotesActions & {
    isCreating: boolean;
    activeWorkspace: Workspace | null;
  };

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(store: StoreApi<NotesStore>) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    store.getState().flush();
  }, 800);
}

const initialState: NotesState = {
  workspaces: [],
  activeWorkspaceId: null,
  workspacesLoading: true,
  notes: [],
  notesLoading: true,
  selectedPath: null,
  noteContent: null,
};

export function createNotesStore(invoker: Invoker = tauriInvoke) {
  const store = create<NotesStore>()(
    immer((set, get) => ({
      ...initialState,

      get isCreating() {
        return get().selectedPath?.startsWith("temp-") ?? false;
      },

      get activeWorkspace() {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
      },

      loadWorkspaces: async () => {
        try {
          const config = await invoker<WorkspaceConfig>("get_workspaces");
          set((state) => {
            state.workspaces = config.workspaces;
            state.activeWorkspaceId = config.active_workspace_id;
            state.workspacesLoading = false;
          });
        } catch (err) {
          console.error("Failed to load workspaces:", err);
          set((state) => {
            state.workspacesLoading = false;
          });
        }
      },

      switchWorkspace: async (workspaceId: string) => {
        await get().flush();
        await invoker("set_active_workspace", { workspaceId });
        set((state) => {
          state.activeWorkspaceId = workspaceId;
          state.selectedPath = null;
          state.noteContent = null;
        });
      },

      createWorkspace: async (name: string) => {
        const workspace = await invoker<Workspace>("create_workspace", {
          name,
        });
        set((state) => {
          state.workspaces.push(workspace);
        });
        return workspace;
      },

      deleteWorkspace: async (workspaceId: string) => {
        await invoker("delete_workspace", { workspaceId });
        set((state) => {
          state.workspaces = state.workspaces.filter(
            (w) => w.id !== workspaceId,
          );
          if (state.activeWorkspaceId === workspaceId) {
            state.activeWorkspaceId = state.workspaces[0]?.id ?? null;
          }
        });
      },

      renameWorkspace: async (workspaceId: string, newName: string) => {
        const updated = await invoker<Workspace>("rename_workspace", {
          workspaceId,
          newName,
        });
        set((state) => {
          const idx = state.workspaces.findIndex((w) => w.id === workspaceId);
          if (idx !== -1) state.workspaces[idx] = updated;
        });
        return updated;
      },

      loadNotes: async () => {
        try {
          await invoker("ensure_notes_dir");
          const entries = await invoker<NoteEntry[]>("list_notes");
          set((state) => {
            state.notes = entries;
            state.notesLoading = false;
          });
        } catch (err) {
          console.error("Failed to load notes:", err);
          set((state) => {
            state.notesLoading = false;
          });
        }
      },

      selectNote: async (path: string) => {
        await get().flush();
        try {
          const text = await invoker<string>("read_note", { path });
          const { title, body } = parseContent(text);
          set((state) => {
            state.selectedPath = path;
            state.noteContent = { title, body, isDirty: false };
          });
        } catch (err) {
          console.error("Failed to read note:", err);
        }
      },

      deselectNote: () => {
        set((state) => {
          state.selectedPath = null;
          state.noteContent = null;
        });
      },

      createNote: async () => {
        await get().flush();
        const tempPath = `temp-${Date.now()}`;
        const tempNote: NoteEntry = {
          name: tempPath,
          path: tempPath,
          modified: Date.now(),
          title: "New Page",
        };
        set((state) => {
          state.notes.unshift(tempNote);
          state.selectedPath = tempPath;
          state.noteContent = { title: "", body: "", isDirty: false };
        });

        try {
          const realPath = await invoker<string>("create_note");
          set((state) => {
            const idx = state.notes.findIndex((n) => n.path === tempPath);
            if (idx !== -1) {
              state.notes[idx].path = realPath;
              state.notes[idx].name = realPath.split("/").pop()!;
            }
            state.selectedPath = realPath;
          });
        } catch (err) {
          console.error("Failed to create note:", err);
          set((state) => {
            state.notes = state.notes.filter((n) => n.path !== tempPath);
            state.selectedPath = null;
            state.noteContent = null;
          });
        }
      },

      deleteNote: async (path: string) => {
        try {
          await invoker("delete_note", { path });
          set((state) => {
            state.notes = state.notes.filter((n) => n.path !== path);
            if (state.selectedPath === path) {
              state.selectedPath = null;
              state.noteContent = null;
            }
          });
        } catch (err) {
          console.error("Failed to delete note:", err);
        }
      },

      reorderNote: async (path: string, newIndex: number) => {
        try {
          const newPath = await invoker<string>("reorder_note", {
            path,
            newIndex,
          });
          set((state) => {
            if (state.selectedPath === path) {
              state.selectedPath = newPath;
            }
          });
          await get().loadNotes();
        } catch (err) {
          console.error("Failed to reorder note:", err);
        }
      },

      setTitle: (title: string) => {
        set((state) => {
          if (state.noteContent) {
            state.noteContent.title = title;
            state.noteContent.isDirty = true;
          }
          const note = state.notes.find((n) => n.path === state.selectedPath);
          if (note) note.title = title || "New Page";
        });
        if (!get().isCreating) {
          schedulePersist(store);
        }
      },

      setBody: (body: string) => {
        set((state) => {
          if (state.noteContent) {
            state.noteContent.body = body;
            state.noteContent.isDirty = true;
          }
        });
        if (!get().isCreating) {
          schedulePersist(store);
        }
      },

      flush: async () => {
        const { noteContent, selectedPath, isCreating } = get();
        if (
          !noteContent ||
          !selectedPath ||
          !noteContent.isDirty ||
          isCreating
        ) {
          return;
        }

        const content = buildContent(noteContent.title, noteContent.body);
        try {
          const newPath = await invoker<string>("write_note", {
            path: selectedPath,
            content,
          });
          set((state) => {
            if (state.noteContent) state.noteContent.isDirty = false;
            if (newPath !== selectedPath) {
              state.selectedPath = newPath;
              const note = state.notes.find((n) => n.path === selectedPath);
              if (note) {
                note.path = newPath;
                note.name = newPath.split("/").pop()!;
              }
            }
          });
        } catch (err) {
          console.error("Failed to save note:", err);
        }
      },
    })),
  );

  return store;
}

export const useNotesStore = createNotesStore();
