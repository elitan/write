import { EditorSelection, type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Wraps each selection in `marker`, or unwraps it when already wrapped. */
export function toggleWrap(marker: string): StateCommand {
  return ({ state, dispatch }) => {
    const len = marker.length;
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - len, range.from);
      const after = state.sliceDoc(range.to, range.to + len);
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - len, to: range.from },
            { from: range.to, to: range.to + len },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        };
      }
      const text = state.sliceDoc(range.from, range.to);
      if (
        text.length >= len * 2 &&
        text.startsWith(marker) &&
        text.endsWith(marker)
      ) {
        return {
          changes: {
            from: range.from,
            to: range.to,
            insert: text.slice(len, -len),
          },
          range: EditorSelection.range(range.from, range.to - len * 2),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + len, range.to + len),
      };
    });
    dispatch(
      state.update(tr, { scrollIntoView: true, userEvent: "input.format" }),
    );
    return true;
  };
}

const TASK = /^(\s*)([-*+]) \[( |x|X)\] /;
const BULLET = /^(\s*)([-*+]) /;

/** Cycles the current lines: text → task → done → text. */
export const toggleTask: StateCommand = ({ state, dispatch }) => {
  const changes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (seen.has(line.from)) continue;
      seen.add(line.from);
      const task = TASK.exec(line.text);
      if (task) {
        const at = line.from + task[1].length + 3;
        changes.push({
          from: at,
          to: at + 1,
          insert: task[3] === " " ? "x" : " ",
        });
        continue;
      }
      const bullet = BULLET.exec(line.text);
      if (bullet) {
        const at = line.from + bullet[0].length;
        changes.push({ from: at, to: at, insert: "[ ] " });
        continue;
      }
      const indent = /^\s*/.exec(line.text)![0].length;
      changes.push({
        from: line.from + indent,
        to: line.from + indent,
        insert: "- [ ] ",
      });
    }
  }
  dispatch(state.update({ changes, userEvent: "input.format" }));
  return true;
};

const URL_RE = /^https?:\/\/\S+$/;

/** Pasting a URL over selected text makes a markdown link. */
export function pasteLink(event: ClipboardEvent, view: EditorView) {
  const text = event.clipboardData?.getData("text/plain")?.trim();
  const { main } = view.state.selection;
  if (!text || main.empty || !URL_RE.test(text)) return false;
  const label = view.state.sliceDoc(main.from, main.to);
  if (label.includes("\n")) return false;
  event.preventDefault();
  view.dispatch({
    changes: { from: main.from, to: main.to, insert: `[${label}](${text})` },
    selection: { anchor: main.from + label.length + text.length + 4 },
    userEvent: "input.paste",
  });
  return true;
}

/** Typing "[]" (or "[ ]") at the start of a line or list item makes a task. */
export const autoTask = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || !text.endsWith("]")) return false;
  const line = view.state.doc.lineAt(from);
  const typed = line.text.slice(0, from - line.from) + text;
  const match = /^(\s*)(?:([-*+]) )?\[ ?\]$/.exec(typed);
  if (!match) return false;
  const marker = `${match[1]}${match[2] ?? "-"} [ ] `;
  const after = line.text.slice(from - line.from);
  view.dispatch({
    changes: {
      from: line.from,
      to: from + (after.startsWith(" ") ? 1 : 0),
      insert: marker,
    },
    selection: { anchor: line.from + marker.length },
    userEvent: "input.type",
  });
  return true;
});
