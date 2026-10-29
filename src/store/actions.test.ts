import { beforeEach, describe, expect, it } from "vitest";
import * as session from "../editor/session";
import { setApi } from "../lib/api";
import { createMockApi } from "../lib/mock-api";
import * as actions from "./actions";
import { useNotes } from "./notes";

function files() {
  return JSON.parse(localStorage.getItem("write-mock-db-v1")!).files as Record<
    string,
    { content: string }
  >;
}

function personal() {
  return Object.keys(files())
    .filter((p) => p.startsWith("/Notes/Personal/"))
    .sort();
}

beforeEach(async () => {
  localStorage.clear();
  setApi(createMockApi());
  const host = document.createElement("div");
  const title = document.createElement("textarea");
  document.body.append(host, title);
  session.attach(session.createView(host), host, title);
  useNotes.setState({ ready: false, notes: [], selectedId: null });
  await actions.init();
});

describe("notes", () => {
  it("opens the top note on startup", () => {
    const { notes, selectedId } = useNotes.getState();
    expect(notes.length).toBe(4);
    expect(selectedId).toBe(notes[0].id);
  });

  it("only writes a new note once it has content", async () => {
    const before = personal().length;
    actions.createNote();
    await session.flushAll();
    expect(personal().length).toBe(before);

    session.setTitle("Groceries");
    await session.flushAll();
    expect(personal()).toContain("/Notes/Personal/5-groceries.md");
    expect(files()["/Notes/Personal/5-groceries.md"].content).toBe(
      "# Groceries\n",
    );
  });

  it("drops a blank new note when you leave it", async () => {
    const first = useNotes.getState().notes[0].id;
    actions.createNote();
    expect(useNotes.getState().notes.length).toBe(5);
    await actions.selectNote(first);
    expect(useNotes.getState().notes.length).toBe(4);
  });

  it("renames the file when the title changes, keeping the id", async () => {
    const note = useNotes.getState().notes[0];
    session.setTitle("Hello there");
    await session.flushAll();
    const updated = useNotes.getState().notes.find((n) => n.id === note.id)!;
    expect(updated.path).toBe("/Notes/Personal/4-hello-there.md");
    expect(personal()).not.toContain(note.path);
  });

  it("moves a deleted note to the trash", async () => {
    const note = useNotes.getState().notes[1];
    await actions.deleteNote(note.id);
    expect(personal()).not.toContain(note.path);
    expect(useNotes.getState().notes.some((n) => n.id === note.id)).toBe(false);
  });

  it("reorders by renumbering files", async () => {
    const [a, b] = useNotes.getState().notes;
    await actions.moveNote(b.id, 0);
    const notes = useNotes.getState().notes;
    expect(notes[0].id).toBe(b.id);
    expect(notes[0].path).toMatch(/\/4-/);
    expect(notes[1].id).toBe(a.id);
    expect(notes[1].path).toMatch(/\/3-/);
    expect(personal().length).toBe(4);
  });

  it("switches workspaces", async () => {
    await actions.switchWorkspace("Work");
    const { notes, activeWorkspaceId } = useNotes.getState();
    expect(activeWorkspaceId).toBe("Work");
    expect(notes.map((n) => n.title)).toEqual(["1:1 notes", "Q3 planning"]);
  });
});
