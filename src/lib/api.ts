import { isTauri } from "./platform";

export interface Workspace {
  id: string;
  name: string;
  shortcut: string | null;
}

export interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export interface NoteMeta {
  path: string;
  title: string;
  preview: string;
  /** Milliseconds since the Unix epoch. */
  modified: number;
}

export interface NoteContent {
  content: string;
  modified: number;
}

export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  matchStart: number;
  matchLength: number;
  line: number;
  column: number;
}

export interface Api {
  getWorkspaces(): Promise<WorkspaceState>;
  setActiveWorkspace(workspaceId: string): Promise<void>;
  createWorkspace(name: string): Promise<Workspace>;
  renameWorkspace(workspaceId: string, name: string): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<WorkspaceState>;

  listNotes(workspaceId: string): Promise<NoteMeta[]>;
  readNote(path: string): Promise<NoteContent>;
  writeNote(path: string, content: string): Promise<NoteMeta>;
  createNote(workspaceId: string, content: string): Promise<NoteMeta>;
  trashNote(path: string): Promise<void>;
  restoreNote(path: string, content: string): Promise<NoteMeta>;
  reorderNotes(
    workspaceId: string,
    order: string[],
  ): Promise<{ from: string; to: string }[]>;
  searchNotes(workspaceId: string, query: string): Promise<SearchHit[]>;
  revealInFinder(path: string): Promise<void>;
  openUrl(url: string): Promise<void>;
}

async function createTauriApi(): Promise<Api> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  return {
    getWorkspaces: () => invoke("get_workspaces"),
    setActiveWorkspace: (workspaceId) =>
      invoke("set_active_workspace", { workspaceId }),
    createWorkspace: (name) => invoke("create_workspace", { name }),
    renameWorkspace: (workspaceId, name) =>
      invoke("rename_workspace", { workspaceId, name }),
    deleteWorkspace: (workspaceId) =>
      invoke("delete_workspace", { workspaceId }),
    listNotes: (workspaceId) => invoke("list_notes", { workspaceId }),
    readNote: (path) => invoke("read_note", { path }),
    writeNote: (path, content) => invoke("write_note", { path, content }),
    createNote: (workspaceId, content) =>
      invoke("create_note", { workspaceId, content }),
    trashNote: (path) => invoke("trash_note", { path }),
    restoreNote: (path, content) => invoke("restore_note", { path, content }),
    reorderNotes: (workspaceId, order) =>
      invoke("reorder_notes", { workspaceId, order }),
    searchNotes: (workspaceId, query) =>
      invoke("search_notes", { workspaceId, query }),
    revealInFinder: (path) => invoke("reveal_in_finder", { path }),
    openUrl: (url) => openUrl(url),
  };
}

let api: Api;

/** Resolves the backend once at startup: Tauri in the app, a local mock in a plain browser. */
export async function initApi(): Promise<Api> {
  if (!api) {
    api = isTauri
      ? await createTauriApi()
      : (await import("./mock-api")).createMockApi();
  }
  return api;
}

export function getApi(): Api {
  if (!api) throw new Error("initApi() must run before getApi()");
  return api;
}

export function setApi(next: Api) {
  api = next;
}
