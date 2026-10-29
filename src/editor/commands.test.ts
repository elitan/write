import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { autoTask } from "./commands";

function typeAt(doc: string, text: string) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: autoTask,
    }),
  });
  const pos = view.state.selection.main.head;
  const handled = view.state
    .facet(EditorView.inputHandler)
    .some((h) => h(view, pos, pos, text, () => view.state.update({})));
  if (!handled) {
    view.dispatch({
      changes: { from: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
  }
  return {
    doc: view.state.doc.toString(),
    cursor: view.state.selection.main.head,
  };
}

describe("autoTask", () => {
  it("turns [] at line start into a task", () => {
    expect(typeAt("[", "]")).toEqual({ doc: "- [ ] ", cursor: 6 });
    expect(typeAt("[ ", "]")).toEqual({ doc: "- [ ] ", cursor: 6 });
    expect(typeAt("", "[]")).toEqual({ doc: "- [ ] ", cursor: 6 });
  });

  it("keeps the bullet and indentation of a list item", () => {
    expect(typeAt("  * [", "]")).toEqual({ doc: "  * [ ] ", cursor: 8 });
  });

  it("leaves brackets elsewhere alone", () => {
    expect(typeAt("see [", "]").doc).toBe("see []");
    expect(typeAt("[link", "]").doc).toBe("[link]");
  });
});
