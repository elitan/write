import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  blockAtLine,
  blocksIn,
  moveBlock,
  moveBlockDown,
  moveBlockUp,
  targetAfter,
  targetBefore,
} from "./blocks";

const make = (doc: string, cursor = 0) =>
  EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: markdown({ base: markdownLanguage }),
  });

function move(
  doc: string,
  srcLine: number,
  target: (s: EditorState) => ReturnType<typeof targetBefore>,
) {
  const state = make(doc);
  const src = blockAtLine(state, srcLine)!;
  const result = moveBlock(state, src, target(state));
  return result ? state.update(result.spec).state.doc.toString() : doc;
}

const at = (line: number) => (s: EditorState) =>
  targetBefore(blockAtLine(s, line)!);
const after = (line: number) => (s: EditorState) =>
  targetAfter(blockAtLine(s, line)!);

describe("blocks", () => {
  it("finds top-level blocks and list items", () => {
    const state = make(
      "# H\n\npara\nmore\n\n- a\n  - b\n- c\n\n```\ncode\n```",
    );
    const blocks = blocksIn(state).map((b) => [
      b.fromLine,
      b.toLine,
      b.list,
      b.depth,
    ]);
    expect(blocks).toEqual([
      [1, 1, false, 0],
      [3, 4, false, 0],
      [6, 7, true, 0],
      [7, 7, true, 1],
      [8, 8, true, 0],
      [10, 12, false, 0],
    ]);
  });

  it("picks the innermost block for a line", () => {
    const state = make("- a\n  - b\n- c");
    expect(blockAtLine(state, 2)?.fromLine).toBe(2);
    expect(blockAtLine(state, 1)?.toLine).toBe(2);
  });

  it("moves a paragraph above another, keeping blank lines", () => {
    expect(move("one\n\ntwo\n\nthree", 5, at(1))).toBe("three\n\none\n\ntwo");
  });

  it("moves a paragraph to the end", () => {
    expect(move("one\n\ntwo\n\nthree\n", 1, after(5))).toBe(
      "two\n\nthree\n\none\n",
    );
  });

  it("reorders list items as a tight list", () => {
    expect(move("- a\n- b\n- c", 3, at(1))).toBe("- c\n- a\n- b");
  });

  it("carries nested items and re-indents into another level", () => {
    expect(move("- a\n  - a1\n- b\n  - b1", 1, at(4))).toBe(
      "- b\n  - a\n    - a1\n  - b1",
    );
  });

  it("separates a list item dropped among paragraphs", () => {
    expect(move("para\n\n- a\n- b", 4, at(1))).toBe("- b\n\npara\n\n- a");
  });

  it("is a no-op when dropped in place", () => {
    expect(move("one\n\ntwo", 1, at(1))).toBe("one\n\ntwo");
    expect(move("- a\n- b", 1, at(2))).toBe("- a\n- b");
  });

  it("moves blocks with the keyboard", () => {
    let state = make("- a\n- b\n- c", 8);
    moveBlockUp({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    expect(state.doc.toString()).toBe("- a\n- c\n- b");
    expect(state.doc.lineAt(state.selection.main.head).text).toBe("- c");
    moveBlockDown({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    expect(state.doc.toString()).toBe("- a\n- b\n- c");
  });
});
