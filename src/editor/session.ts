import { openSearchPanel } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getApi } from "../lib/api";
import {
  buildContent,
  countWords,
  isBlank,
  parseContent,
} from "../lib/markdown";
import { getNote, type Note, patchNote, useNotes } from "../store/notes";
import { errorMessage, toast } from "../store/ui";
import { createExtensions, type EditorConfig, reconfigure } from "./extensions";

/**
 * One EditorView lives for the whole app. Each note keeps its own
 * EditorState (undo history, selection, scroll) in a small cache, so
 * switching notes is a synchronous `setState` instead of a remount.
 */

interface Doc {
  id: string;
  title: string;
  state: EditorState;
  /** Line of the `# Title` in the file as last read, for search jumps. */
  titleLine: number;
  diskModified: number;
  dirty: boolean;
  /** Created in this session; quietly discarded if left blank. */
  fresh: boolean;
  scrollTop: number;
  configVersion: number;
}

export interface ShowOptions {
  focus?: "title" | "body" | "none";
  /** Select a search hit, in file coordinates. */
  jump?: { line: number; column: number; length: number };
}

const SAVE_DELAY = 450;
const CACHE_SIZE = 40;

const docs = new Map<string, Doc>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let view: EditorView | null = null;
let scroller: HTMLElement | null = null;
let titleInput: HTMLTextAreaElement | null = null;
let currentId: string | null = null;
let config: EditorConfig = {
  vimMode: false,
  spellcheck: false,
  hideMarkdown: true,
};
let configVersion = 0;
let wordTimer: ReturnType<typeof setTimeout> | null = null;

// Every disk mutation goes through one queue, so writes, renames and
// reorders never interleave.
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const extensions = () =>
  createExtensions(config, {
    onChange: handleChange,
    onExitTop: () => {
      if (!titleInput) return false;
      titleInput.focus();
      const end = titleInput.value.length;
      titleInput.setSelectionRange(end, end);
      return true;
    },
  });

function newState(doc: string, selection?: EditorSelection) {
  return EditorState.create({ doc, selection, extensions: extensions() });
}

export function attach(
  v: EditorView,
  scrollEl: HTMLElement,
  title: HTMLTextAreaElement,
) {
  view = v;
  scroller = scrollEl;
  titleInput = title;
}

export function detach() {
  stash();
  view = null;
  scroller = null;
  titleInput = null;
  currentId = null;
}

export function createView(parent: HTMLElement) {
  return new EditorView({ parent, state: newState("") });
}

export function setConfig(next: EditorConfig) {
  config = next;
  configVersion++;
  if (view) {
    view.dispatch({ effects: reconfigure(config) });
    const doc = currentId ? docs.get(currentId) : undefined;
    if (doc) doc.configVersion = configVersion;
  }
}

function stash() {
  if (!currentId || !view) return;
  const doc = docs.get(currentId);
  if (!doc) return;
  doc.state = view.state;
  doc.scrollTop = scroller?.scrollTop ?? 0;
}

function evict() {
  if (docs.size <= CACHE_SIZE) return;
  for (const [id, doc] of docs) {
    if (id !== currentId && !doc.dirty && !saveTimers.has(id)) {
      docs.delete(id);
      if (docs.size <= CACHE_SIZE) return;
    }
  }
}

function makeDoc(
  id: string,
  content: string,
  modified: number,
  fresh = false,
): Doc {
  const { title, body, titleLine } = parseContent(content);
  return {
    id,
    title,
    state: newState(body),
    titleLine,
    diskModified: modified,
    dirty: false,
    fresh,
    scrollTop: 0,
    configVersion,
  };
}

/** A note that exists only in memory until it gets content. */
export function createDoc(id: string, title = "") {
  const doc = makeDoc(id, buildContent(title, ""), 0, true);
  docs.set(id, doc);
  if (title) markDirty(id);
}

async function loadDoc(note: Note): Promise<Doc> {
  const cached = docs.get(note.id);
  if (cached) return cached;
  const { content, modified } = await getApi().readNote(note.path);
  // Another caller may have loaded it while we waited.
  const raced = docs.get(note.id);
  if (raced) return raced;
  const doc = makeDoc(note.id, content, modified);
  docs.set(note.id, doc);
  evict();
  return doc;
}

/** Shows a note in the editor. Resolves false if another note won the race. */
export async function show(
  id: string,
  opts: ShowOptions = {},
): Promise<boolean> {
  const note = getNote(id);
  if (!note || !view) return false;
  let doc: Doc;
  try {
    doc = await loadDoc(note);
  } catch (err) {
    toast(`Couldn't open note: ${errorMessage(err)}`, { tone: "error" });
    return false;
  }
  if (useNotes.getState().selectedId !== id || !view) return false;

  if (currentId !== id) {
    stash();
    currentId = id;
    view.setState(doc.state);
    if (doc.configVersion !== configVersion) {
      view.dispatch({ effects: reconfigure(config) });
      doc.configVersion = configVersion;
    }
    useNotes.setState({
      title: doc.title,
      wordCount: countWords(doc.title) + countWords(view.state.doc.toString()),
      saveStatus: doc.dirty ? "unsaved" : "saved",
    });
    if (scroller) scroller.scrollTop = doc.scrollTop;
  }

  if (opts.jump) {
    selectHit(doc, opts.jump);
  } else if (opts.focus === "title") {
    titleInput?.focus();
  } else if (opts.focus === "body") {
    view.focus();
  }
  return true;
}

function selectHit(
  doc: Doc,
  { line, column, length }: NonNullable<ShowOptions["jump"]>,
) {
  if (!view) return;
  if (line === doc.titleLine) {
    titleInput?.focus();
    return;
  }
  const bodyLine =
    doc.titleLine !== -1 && line > doc.titleLine ? line - 1 : line;
  const { doc: text } = view.state;
  if (bodyLine + 1 > text.lines) return;
  const from = Math.min(text.line(bodyLine + 1).from + column, text.length);
  const to = Math.min(from + length, text.length);
  view.dispatch({
    selection: EditorSelection.range(from, to),
    effects: EditorView.scrollIntoView(from, { y: "center" }),
  });
  view.focus();
}

/** Leaves the editor empty (no note selected). */
export function clear() {
  stash();
  currentId = null;
  view?.setState(newState(""));
}

function handleChange() {
  if (!currentId) return;
  markDirty(currentId);
  if (wordTimer) clearTimeout(wordTimer);
  wordTimer = setTimeout(() => {
    if (!view) return;
    const { title } = useNotes.getState();
    useNotes.setState({
      wordCount: countWords(title) + countWords(view.state.doc.toString()),
    });
  }, 250);
}

function markDirty(id: string) {
  const doc = docs.get(id);
  if (!doc) return;
  doc.dirty = true;
  if (id === currentId) useNotes.setState({ saveStatus: "unsaved" });
  clearTimeout(saveTimers.get(id));
  saveTimers.set(
    id,
    setTimeout(() => save(id), SAVE_DELAY),
  );
}

export function setTitle(title: string) {
  if (!currentId) return;
  const doc = docs.get(currentId);
  if (!doc) return;
  doc.title = title;
  patchNote(currentId, { title });
  useNotes.setState({ title });
  markDirty(currentId);
}

function bodyOf(doc: Doc) {
  return doc.id === currentId && view
    ? view.state.doc.toString()
    : doc.state.doc.toString();
}

export function contentOf(id: string) {
  const doc = docs.get(id);
  return doc ? buildContent(doc.title, bodyOf(doc)) : null;
}

export function isFreshAndBlank(id: string) {
  const doc = docs.get(id);
  return !!doc && doc.fresh && isBlank(doc.title, bodyOf(doc));
}

export function save(id: string): Promise<void> {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  return serial(async () => {
    const doc = docs.get(id);
    const note = getNote(id);
    if (!doc || !doc.dirty || !note) return;
    const body = bodyOf(doc);
    if (!note.path && isBlank(doc.title, body)) {
      doc.dirty = false;
      return;
    }
    const content = buildContent(doc.title, body);
    doc.dirty = false;
    if (id === currentId) useNotes.setState({ saveStatus: "saving" });
    try {
      const api = getApi();
      const meta = note.path
        ? await api.writeNote(note.path, content)
        : await api.createNote(note.workspaceId, content);
      doc.diskModified = meta.modified;
      doc.titleLine = 0;
      // Keep the live title: the user may have typed more while we saved.
      patchNote(id, {
        path: meta.path,
        preview: meta.preview,
        modified: meta.modified,
      });
      if (id === currentId && !doc.dirty)
        useNotes.setState({ saveStatus: "saved" });
    } catch (err) {
      doc.dirty = true;
      if (id === currentId) useNotes.setState({ saveStatus: "error" });
      toast(
        `Couldn't save “${doc.title || "Untitled"}”: ${errorMessage(err)}`,
        {
          tone: "error",
          action: { label: "Retry", run: () => save(id) },
        },
      );
    }
  });
}

/** Writes every pending change and waits for the disk queue to drain. */
export async function flushAll() {
  const pending = [...saveTimers.keys()];
  for (const [id, doc] of docs)
    if (doc.dirty && !pending.includes(id)) pending.push(id);
  await Promise.all(pending.map(save));
  await serial(async () => {});
}

export function forget(id: string) {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  docs.delete(id);
  if (currentId === id) clear();
}

export function isDirty(id: string) {
  return !!docs.get(id)?.dirty;
}

/** Picks up edits made outside the app, unless we have unsaved changes. */
export async function syncFromDisk(note: Note) {
  const doc = docs.get(note.id);
  if (
    !doc ||
    doc.dirty ||
    saveTimers.has(note.id) ||
    note.modified <= doc.diskModified
  )
    return;
  try {
    const { content, modified } = await getApi().readNote(note.path);
    if (doc.dirty) return;
    const { title, body, titleLine } = parseContent(content);
    doc.title = title;
    doc.titleLine = titleLine;
    doc.diskModified = modified;
    if (note.id === currentId && view) {
      const head = Math.min(view.state.selection.main.head, body.length);
      doc.state = newState(body, EditorSelection.single(head));
      doc.configVersion = configVersion;
      view.setState(doc.state);
      useNotes.setState({ title });
    } else {
      doc.state = newState(body);
    }
  } catch {
    // Deleted or unreadable; the list refresh will drop it.
  }
}

export function focusEditor(where: "start" | "end" | "keep" = "keep") {
  if (!view) return;
  if (where !== "keep") {
    const pos = where === "start" ? 0 : view.state.doc.length;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  }
  view.focus();
}

export function focusTitle() {
  titleInput?.focus();
}

export function openFind() {
  if (!view) return;
  view.focus();
  openSearchPanel(view);
}

export function currentDocId() {
  return currentId;
}

// This module owns the one EditorView. A hot update would create a second,
// detached copy, so save pending edits and reload the page instead.
import.meta.hot?.accept(() => {
  void flushAll().finally(() => location.reload());
});
