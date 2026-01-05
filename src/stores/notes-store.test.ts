import { beforeEach, describe, expect, it } from "vitest";
import {
  buildContent,
  createNotesStore,
  type NoteEntry,
  parseContent,
  type Workspace,
} from "./notes-store";

interface WorkspaceConfig {
  workspaces: Workspace[];
  active_workspace_id: string;
}

function createFakeInvoker(
  initialNotes: NoteEntry[] = [],
  initialFiles: Map<string, string> = new Map(),
  initialWorkspaces: Workspace[] = [
    { id: "default", name: "Notes", shortcut: "1" },
  ],
) {
  const notes: NoteEntry[] = initialNotes.map((n) => ({ ...n }));
  const files = new Map(initialFiles);
  const workspaces: Workspace[] = initialWorkspaces.map((w) => ({ ...w }));
  let activeWorkspaceId = workspaces[0]?.id ?? "default";
  let noteCounter = notes.length;

  return async (
    cmd: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> => {
    switch (cmd) {
      case "ensure_notes_dir":
        return;
      case "list_notes":
        return notes.map((n) => ({ ...n }));
      case "read_note":
        return files.get(args?.path as string) ?? "";
      case "write_note": {
        const path = args?.path as string;
        const content = args?.content as string;
        files.set(path, content);
        return path;
      }
      case "create_note": {
        noteCounter++;
        const newPath = `/notes/${String(noteCounter).padStart(3, "0")}-new.md`;
        files.set(newPath, "");
        notes.unshift({
          name: `${String(noteCounter).padStart(3, "0")}-new.md`,
          path: newPath,
          modified: Date.now(),
          title: "New Page",
        });
        return newPath;
      }
      case "delete_note": {
        const path = args?.path as string;
        const idx = notes.findIndex((n) => n.path === path);
        if (idx !== -1) notes.splice(idx, 1);
        files.delete(path);
        return;
      }
      case "reorder_note": {
        return args?.path;
      }
      case "get_workspaces":
        return {
          workspaces: workspaces.map((w) => ({ ...w })),
          active_workspace_id: activeWorkspaceId,
        } as WorkspaceConfig;
      case "set_active_workspace":
        activeWorkspaceId = args?.workspaceId as string;
        return;
      case "create_workspace": {
        const name = args?.name as string;
        const ws: Workspace = {
          id: name.toLowerCase().replace(/\s+/g, "-"),
          name,
          shortcut: null,
        };
        workspaces.push(ws);
        return ws;
      }
      case "delete_workspace": {
        const id = args?.workspaceId as string;
        const idx = workspaces.findIndex((w) => w.id === id);
        if (idx !== -1) workspaces.splice(idx, 1);
        return;
      }
      case "rename_workspace": {
        const id = args?.workspaceId as string;
        const newName = args?.newName as string;
        const ws = workspaces.find((w) => w.id === id);
        if (ws) ws.name = newName;
        return ws;
      }
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  };
}

describe("parseContent", () => {
  it("extracts title from markdown h1", () => {
    const result = parseContent("# Hello World\nBody text");
    expect(result.title).toBe("Hello World");
    expect(result.body).toBe("Body text");
  });

  it("handles content before h1", () => {
    const result = parseContent("Some intro\n# Title\nBody");
    expect(result.title).toBe("Title");
    expect(result.body).toBe("Some intro\nBody");
  });

  it("returns empty title when no h1", () => {
    const result = parseContent("No heading here");
    expect(result.title).toBe("");
    expect(result.body).toBe("No heading here");
  });
});

describe("buildContent", () => {
  it("creates markdown with h1 title", () => {
    const result = buildContent("My Title", "Body text");
    expect(result).toBe("# My Title\nBody text");
  });
});

describe("notes store", () => {
  let store: ReturnType<typeof createNotesStore>;

  beforeEach(() => {
    const notes: NoteEntry[] = [
      {
        name: "001-hello.md",
        path: "/notes/001-hello.md",
        modified: 1000,
        title: "Hello",
      },
      {
        name: "002-world.md",
        path: "/notes/002-world.md",
        modified: 900,
        title: "World",
      },
    ];
    const files = new Map([
      ["/notes/001-hello.md", "# Hello\nHello body"],
      ["/notes/002-world.md", "# World\nWorld body"],
    ]);
    store = createNotesStore(
      createFakeInvoker(notes, files) as Parameters<typeof createNotesStore>[0],
    );
  });

  describe("loadNotes", () => {
    it("populates notes array", async () => {
      await store.getState().loadNotes();
      expect(store.getState().notes).toHaveLength(2);
      expect(store.getState().notesLoading).toBe(false);
    });
  });

  describe("selectNote", () => {
    it("loads content into store", async () => {
      await store.getState().loadNotes();
      await store.getState().selectNote("/notes/001-hello.md");

      expect(store.getState().selectedPath).toBe("/notes/001-hello.md");
      expect(store.getState().noteContent).toEqual({
        title: "Hello",
        body: "Hello body",
        isDirty: false,
      });
    });
  });

  describe("setTitle", () => {
    it("marks content as dirty", async () => {
      await store.getState().loadNotes();
      await store.getState().selectNote("/notes/001-hello.md");

      store.getState().setTitle("New Title");

      expect(store.getState().noteContent?.title).toBe("New Title");
      expect(store.getState().noteContent?.isDirty).toBe(true);
    });

    it("updates sidebar entry title", async () => {
      await store.getState().loadNotes();
      await store.getState().selectNote("/notes/001-hello.md");

      store.getState().setTitle("Updated Title");

      const note = store
        .getState()
        .notes.find((n) => n.path === "/notes/001-hello.md");
      expect(note?.title).toBe("Updated Title");
    });
  });

  describe("setBody", () => {
    it("marks content as dirty", async () => {
      await store.getState().loadNotes();
      await store.getState().selectNote("/notes/001-hello.md");

      store.getState().setBody("New body content");

      expect(store.getState().noteContent?.body).toBe("New body content");
      expect(store.getState().noteContent?.isDirty).toBe(true);
    });
  });

  describe("createNote", () => {
    it("adds temp note then transitions to real path", async () => {
      await store.getState().loadNotes();
      await store.getState().createNote();

      expect(store.getState().selectedPath).toBe("/notes/003-new.md");
      expect(store.getState().notes[0].path).toBe("/notes/003-new.md");
    });
  });

  describe("deleteNote", () => {
    it("removes note from array", async () => {
      await store.getState().loadNotes();
      await store.getState().deleteNote("/notes/001-hello.md");

      expect(store.getState().notes).toHaveLength(1);
      expect(store.getState().notes[0].path).toBe("/notes/002-world.md");
    });

    it("clears selection if deleted note was selected", async () => {
      await store.getState().loadNotes();
      await store.getState().selectNote("/notes/001-hello.md");
      await store.getState().deleteNote("/notes/001-hello.md");

      expect(store.getState().selectedPath).toBeNull();
      expect(store.getState().noteContent).toBeNull();
    });
  });

  describe("workspaces", () => {
    it("loads workspaces", async () => {
      await store.getState().loadWorkspaces();

      expect(store.getState().workspaces).toHaveLength(1);
      expect(store.getState().workspaces[0].name).toBe("Notes");
      expect(store.getState().workspacesLoading).toBe(false);
    });

    it("creates workspace", async () => {
      await store.getState().loadWorkspaces();
      const ws = await store.getState().createWorkspace("Work");

      expect(ws.name).toBe("Work");
      expect(store.getState().workspaces).toHaveLength(2);
    });

    it("switches workspace and clears selection", async () => {
      await store.getState().loadWorkspaces();
      await store.getState().loadNotes();
      await store.getState().selectNote("/notes/001-hello.md");

      const ws = await store.getState().createWorkspace("Work");
      await store.getState().switchWorkspace(ws.id);

      expect(store.getState().activeWorkspaceId).toBe("work");
      expect(store.getState().selectedPath).toBeNull();
    });
  });
});
