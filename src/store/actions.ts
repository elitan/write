import * as session from "../editor/session";
import { serial } from "../editor/session";
import { getApi } from "../lib/api";
import {
  activeWorkspace,
  getNote,
  idForPath,
  type Note,
  newNoteId,
  renamePaths,
  useNotes,
} from "./notes";
import { closeDialog, errorMessage, toast } from "./ui";

const lastNoteKey = (ws: string) => `write-workspace-${ws}-selected`;

function remember(note: Note) {
  if (!note.path) return;
  try {
    localStorage.setItem(lastNoteKey(note.workspaceId), note.path);
  } catch {
    // Non-essential.
  }
}

function recall(ws: string) {
  try {
    return localStorage.getItem(lastNoteKey(ws));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- navigation

const back: string[] = [];
const forward: string[] = [];

/** Drops a note that was created and never written to. */
function leaveCurrent(nextId: string | null) {
  const { selectedId } = useNotes.getState();
  if (!selectedId || selectedId === nextId) return;
  if (session.isFreshAndBlank(selectedId)) {
    const note = getNote(selectedId);
    session.forget(selectedId);
    useNotes.setState((s) => ({
      notes: s.notes.filter((n) => n.id !== selectedId),
    }));
    // A blank note that already reached disk (typed, then erased) goes too.
    if (note?.path)
      void serial(() => getApi().trashNote(note.path)).catch(() => {});
  }
}

export interface SelectOptions extends session.ShowOptions {
  fromHistory?: boolean;
}

export function selectNote(id: string, opts: SelectOptions = {}) {
  const { selectedId } = useNotes.getState();
  if (selectedId !== id) {
    leaveCurrent(id);
    if (!opts.fromHistory && selectedId && getNote(selectedId)) {
      back.push(selectedId);
      if (back.length > 100) back.shift();
      forward.length = 0;
    }
    useNotes.setState({ selectedId: id });
  }
  const note = getNote(id);
  if (note) remember(note);
  return session.show(id, opts);
}

export function goBack() {
  const { selectedId } = useNotes.getState();
  while (back.length) {
    const id = back.pop()!;
    if (getNote(id) && id !== selectedId) {
      if (selectedId) forward.push(selectedId);
      selectNote(id, { fromHistory: true });
      return;
    }
  }
}

export function goForward() {
  const { selectedId } = useNotes.getState();
  while (forward.length) {
    const id = forward.pop()!;
    if (getNote(id) && id !== selectedId) {
      if (selectedId) back.push(selectedId);
      selectNote(id, { fromHistory: true });
      return;
    }
  }
}

// --------------------------------------------------------------------- notes

const listCache = new Map<string, Note[]>();

function toNotes(
  ws: string,
  metas: Awaited<ReturnType<ReturnType<typeof getApi>["listNotes"]>>,
) {
  return metas.map((m) => ({
    ...m,
    title: m.title === "Untitled" ? "" : m.title,
    id: idForPath(m.path),
    workspaceId: ws,
  }));
}

async function loadWorkspace(ws: string) {
  const cached = listCache.get(ws);
  if (cached) {
    useNotes.setState({ notes: cached });
    openInitial(ws);
  }
  const notes = toNotes(ws, await getApi().listNotes(ws));
  if (useNotes.getState().activeWorkspaceId !== ws) return;
  useNotes.setState({ notes });
  if (!cached) openInitial(ws);
}

function openInitial(ws: string) {
  const { notes } = useNotes.getState();
  const saved = recall(ws);
  const note = notes.find((n) => n.path === saved) ?? notes[0];
  if (note) selectNote(note.id, { fromHistory: true });
  else {
    useNotes.setState({ selectedId: null });
    session.clear();
  }
}

export async function init() {
  const api = getApi();
  const { workspaces, activeWorkspaceId } = await api.getWorkspaces();
  useNotes.setState({ workspaces, activeWorkspaceId });
  await loadWorkspace(activeWorkspaceId);
  useNotes.setState({ ready: true });
}

/** Re-reads the list from disk (e.g. on window focus) without disturbing the UI. */
export async function refresh() {
  const { activeWorkspaceId: ws, ready } = useNotes.getState();
  if (!ready) return;
  const metas = await getApi().listNotes(ws);
  const { notes: current, activeWorkspaceId } = useNotes.getState();
  if (activeWorkspaceId !== ws) return;
  const pending = current.filter((n) => !n.path);
  const byId = new Map(current.map((n) => [n.id, n]));
  const fresh = toNotes(ws, metas).map((n) => {
    // Unsaved local edits win over what's on disk.
    const local = byId.get(n.id);
    return local && session.isDirty(n.id) ? { ...n, title: local.title } : n;
  });
  useNotes.setState({ notes: [...pending, ...fresh] });
  for (const note of fresh) void session.syncFromDisk(note);
  const { selectedId } = useNotes.getState();
  if (selectedId && !getNote(selectedId)) {
    const next = useNotes.getState().notes[0];
    if (next) selectNote(next.id);
    else {
      useNotes.setState({ selectedId: null });
      session.clear();
    }
  }
}

export function createNote(title = "") {
  const { activeWorkspaceId, selectedId } = useNotes.getState();
  // ⌘N on an untouched new note just refocuses it.
  if (selectedId && !title && session.isFreshAndBlank(selectedId)) {
    session.focusTitle();
    return;
  }
  const id = newNoteId();
  const note: Note = {
    id,
    path: "",
    title,
    preview: "",
    modified: Date.now(),
    workspaceId: activeWorkspaceId,
  };
  useNotes.setState((s) => ({ notes: [note, ...s.notes] }));
  session.createDoc(id, title);
  selectNote(id, { focus: title ? "body" : "title" });
}

export async function deleteNote(id: string) {
  const index = useNotes.getState().notes.findIndex((n) => n.id === id);
  const note = getNote(id);
  if (!note) return;
  const content = session.contentOf(id);
  const blank = session.isFreshAndBlank(id);

  session.forget(id);
  // Select the neighbour right away so the editor never shows a dead note.
  if (useNotes.getState().selectedId === id) {
    const { notes } = useNotes.getState();
    const next = notes[index + 1] ?? notes[index - 1];
    if (next) selectNote(next.id, { fromHistory: true });
    else {
      useNotes.setState({ selectedId: null });
      session.clear();
    }
  }
  useNotes.setState((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));

  if (!note.path || blank) {
    if (note.path)
      void serial(() => getApi().trashNote(note.path)).catch(() => {});
    return;
  }

  try {
    const full = content ?? (await getApi().readNote(note.path)).content;
    await serial(() => getApi().trashNote(note.path));
    toast(`Moved “${note.title || "Untitled"}” to Trash`, {
      action: { label: "Undo", run: () => restoreNote(note, full, index) },
    });
  } catch (err) {
    toast(`Couldn't delete note: ${errorMessage(err)}`, { tone: "error" });
    await refresh();
  }
}

async function restoreNote(note: Note, content: string, index: number) {
  try {
    const meta = await serial(() => getApi().restoreNote(note.path, content));
    if (useNotes.getState().activeWorkspaceId !== note.workspaceId) return;
    const restored: Note = {
      ...note,
      ...meta,
      title: note.title,
      id: idForPath(meta.path),
    };
    useNotes.setState((s) => {
      const notes = [...s.notes];
      notes.splice(Math.min(index, notes.length), 0, restored);
      return { notes };
    });
    selectNote(restored.id);
  } catch (err) {
    toast(`Couldn't restore note: ${errorMessage(err)}`, { tone: "error" });
  }
}

export async function moveNote(id: string, toIndex: number) {
  const { notes, activeWorkspaceId } = useNotes.getState();
  const from = notes.findIndex((n) => n.id === id);
  if (from === -1 || from === toIndex) return;
  const next = [...notes];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved);
  useNotes.setState({ notes: next });

  // Unsaved notes have no file yet; make sure this one does before renumbering.
  if (!moved.path) await session.save(id);
  try {
    const renames = await serial(() =>
      getApi().reorderNotes(
        activeWorkspaceId,
        useNotes
          .getState()
          .notes.map((n) => n.path)
          .filter(Boolean),
      ),
    );
    renamePaths(renames);
  } catch (err) {
    toast(`Couldn't reorder: ${errorMessage(err)}`, { tone: "error" });
    await refresh();
  }
}

export async function revealInFinder(id: string) {
  const note = getNote(id);
  if (!note) return;
  if (!note.path) await session.save(id);
  const path = getNote(id)?.path;
  if (path) await getApi().revealInFinder(path);
}

export async function copyMarkdown(id: string) {
  const path = getNote(id)?.path;
  const content =
    session.contentOf(id) ??
    (path ? (await getApi().readNote(path)).content : null);
  if (content === null) return;
  await navigator.clipboard.writeText(content);
  toast("Copied as Markdown");
}

// ---------------------------------------------------------------- workspaces

export async function switchWorkspace(ws: string) {
  const { activeWorkspaceId } = useNotes.getState();
  if (ws === activeWorkspaceId) return;
  leaveCurrent(null);
  await session.flushAll();
  listCache.set(
    activeWorkspaceId,
    useNotes.getState().notes.filter((n) => n.path),
  );
  back.length = 0;
  forward.length = 0;
  useNotes.setState({ activeWorkspaceId: ws, selectedId: null });
  void getApi().setActiveWorkspace(ws);
  try {
    await loadWorkspace(ws);
  } catch (err) {
    toast(`Couldn't open workspace: ${errorMessage(err)}`, { tone: "error" });
  }
}

export function cycleWorkspace(step: 1 | -1) {
  const { workspaces, activeWorkspaceId } = useNotes.getState();
  const i = workspaces.findIndex((w) => w.id === activeWorkspaceId);
  const next = workspaces[(i + step + workspaces.length) % workspaces.length];
  if (next) void switchWorkspace(next.id);
}

export async function createWorkspace(name: string) {
  const ws = await getApi().createWorkspace(name);
  useNotes.setState((s) => ({ workspaces: [...s.workspaces, ws] }));
  closeDialog();
  await switchWorkspace(ws.id);
}

export async function renameWorkspace(id: string, name: string) {
  const ws = await getApi().renameWorkspace(id, name);
  useNotes.setState((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === id ? ws : w)),
  }));
  closeDialog();
}

export async function deleteWorkspace(id: string) {
  const wasActive = activeWorkspace()?.id === id;
  if (wasActive) await session.flushAll();
  const { workspaces, activeWorkspaceId } = await getApi().deleteWorkspace(id);
  listCache.delete(id);
  closeDialog();
  useNotes.setState({ workspaces });
  if (wasActive) {
    useNotes.setState({ activeWorkspaceId, selectedId: null });
    await loadWorkspace(activeWorkspaceId);
  }
}

// Module-level state can't be hot-swapped; reload instead of splitting it.
import.meta.hot?.accept(() => location.reload());
