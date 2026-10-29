import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

/**
 * Typora-style live preview: block elements get line styling, and markdown
 * punctuation is hidden except where the cursor is, so you edit raw text
 * but read formatted text.
 */

/** Fixed-width slot for a list marker, so item text lines up and wraps with a hanging indent. */
function marker() {
  const el = document.createElement("span");
  el.className = "cm-md-marker";
  return el;
}

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }
  eq(other: BulletWidget) {
    return other.depth === this.depth;
  }
  toDOM() {
    const el = marker();
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.dataset.depth = String(this.depth % 3);
    el.append(dot);
    return el;
  }
}

class OrderedWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: OrderedWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const el = marker();
    el.classList.add("cm-md-ol");
    el.textContent = this.label;
    return el;
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const el = marker();
    const box = document.createElement("span");
    box.className = `cm-md-task${this.checked ? " is-checked" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    el.append(box);
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(el);
      const line = view.state.doc.lineAt(pos);
      const match = /\[( |x|X)\]/.exec(line.text.slice(pos - line.from));
      if (!match) return;
      const at = pos + match.index + 1;
      view.dispatch({
        changes: { from: at, to: at + 1, insert: this.checked ? " " : "x" },
        userEvent: "input.toggle",
      });
    });
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-hr";
    return el;
  }
}

const hidden = Decoration.replace({});
const lineClass = (cls: string) => Decoration.line({ class: cls });
const mark = (cls: string) => Decoration.mark({ class: cls });
const linkMark = Decoration.mark({
  class: "cm-md-link",
  attributes: { title: "⌘-click to open" },
});
const rule = Decoration.replace({ widget: new RuleWidget() });
const bullets = [0, 1, 2].map((d) =>
  Decoration.replace({ widget: new BulletWidget(d) }),
);
const tasks = [false, true].map((c) =>
  Decoration.replace({ widget: new TaskWidget(c) }),
);
const listLines: Decoration[] = [];
const listLine = (depth: number) => {
  listLines[depth] ??= Decoration.line({
    class: "cm-md-li",
    attributes: { style: `--li-depth: ${depth}` },
  });
  return listLines[depth];
};

function listDepth(node: SyntaxNodeRef) {
  let depth = -1;
  for (let p = node.node.parent; p; p = p.parent) {
    if (p.name === "BulletList" || p.name === "OrderedList") depth++;
  }
  return Math.max(depth, 0);
}

function build(view: EditorView, hideMarks: boolean) {
  const { state } = view;
  const out: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const styledLines = new Set<string>();
  const sel = state.selection.ranges;

  const touches = (from: number, to: number) =>
    sel.some((r) => r.from <= to && r.to >= from);
  const lineActive = (pos: number) => {
    const line = state.doc.lineAt(pos);
    return touches(line.from, line.to);
  };
  const styleLines = (from: number, to: number, cls: string) => {
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      const key = `${line.from}:${cls}`;
      if (styledLines.has(key)) continue;
      styledLines.add(key);
      let c = cls;
      if (cls === "cm-md-codeblock") {
        if (n === first) c += " cm-md-codeblock-start";
        if (n === last) c += " cm-md-codeblock-end";
      }
      out.push(lineClass(c).range(line.from));
    }
  };
  const hideChildren = (node: SyntaxNodeRef, names: string[]) => {
    const cursor = node.node.cursor();
    if (!cursor.firstChild()) return;
    do {
      if (names.includes(cursor.name) && cursor.to > cursor.from) {
        out.push(hidden.range(cursor.from, cursor.to));
      }
    } while (cursor.nextSibling());
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const name = node.name;
        if (name.startsWith("ATXHeading")) {
          styleLines(node.from, node.from, `cm-md-h${name.slice(-1)}`);
          return;
        }
        if (name === "SetextHeading1" || name === "SetextHeading2") {
          styleLines(node.from, node.from, `cm-md-h${name.slice(-1)}`);
          return;
        }
        switch (name) {
          case "HeaderMark": {
            const line = state.doc.lineAt(node.from);
            if (
              hideMarks &&
              node.from === line.from &&
              !lineActive(node.from)
            ) {
              const end =
                state.doc.sliceString(node.to, node.to + 1) === " "
                  ? node.to + 1
                  : node.to;
              out.push(hidden.range(node.from, end));
            }
            return;
          }
          case "Emphasis":
          case "StrongEmphasis":
          case "Strikethrough":
            if (hideMarks && !touches(node.from, node.to)) {
              hideChildren(node, ["EmphasisMark", "StrikethroughMark"]);
            }
            return;
          case "InlineCode":
            out.push(mark("cm-md-code").range(node.from, node.to));
            if (hideMarks && !touches(node.from, node.to)) {
              hideChildren(node, ["CodeMark"]);
            }
            return false;
          case "Link": {
            const marks = node.node.getChildren("LinkMark");
            if (marks.length >= 2) {
              const labelFrom = marks[0].to;
              const labelTo = marks[1].from;
              if (labelTo > labelFrom) {
                out.push(linkMark.range(labelFrom, labelTo));
              }
              if (
                hideMarks &&
                !touches(node.from, node.to) &&
                labelTo > labelFrom
              ) {
                out.push(hidden.range(node.from, labelFrom));
                out.push(hidden.range(labelTo, node.to));
              }
            }
            return false;
          }
          case "URL":
            if (node.node.parent?.name !== "Link") {
              out.push(linkMark.range(node.from, node.to));
            }
            return;
          case "Blockquote":
            styleLines(node.from, node.to, "cm-md-quote");
            return;
          case "QuoteMark":
            if (hideMarks && !lineActive(node.from)) {
              const end =
                state.doc.sliceString(node.to, node.to + 1) === " "
                  ? node.to + 1
                  : node.to;
              out.push(hidden.range(node.from, end));
            }
            return;
          case "FencedCode":
            styleLines(node.from, node.to, "cm-md-codeblock");
            return;
          case "CodeMark":
          case "CodeInfo":
            out.push(mark("cm-md-fence").range(node.from, node.to));
            return;
          case "HorizontalRule":
            if (lineActive(node.from)) {
              out.push(mark("cm-md-fence").range(node.from, node.to));
            } else {
              out.push(rule.range(node.from, node.to));
            }
            return;
          case "ListMark": {
            const item = node.node.parent;
            const line = state.doc.lineAt(node.from);
            // Only the marker that starts the line (not a lazy continuation).
            if (state.doc.sliceString(line.from, node.from).trim()) return;
            const depth = listDepth(node);
            out.push(listLine(depth).range(line.from));
            // Indentation becomes padding, so levels are wide and even.
            if (node.from > line.from)
              out.push(hidden.range(line.from, node.from));
            const withSpace = (to: number) =>
              state.doc.sliceString(to, to + 1) === " " ? to + 1 : to;

            const task = item?.getChild("Task")?.getChild("TaskMarker");
            if (task) {
              const checked = /x/i.test(
                state.doc.sliceString(task.from, task.to),
              );
              out.push(
                tasks[checked ? 1 : 0].range(node.from, withSpace(task.to)),
              );
              if (checked) styleLines(node.from, node.from, "cm-md-task-done");
              return;
            }
            // An empty "- [ ] " has no Task node yet; show the box anyway.
            const rest = state.doc.sliceString(node.to, line.to);
            const empty = /^ \[( |x|X)\] ?$/.exec(rest);
            if (empty && item?.parent?.name === "BulletList") {
              const checked = empty[1] !== " ";
              out.push(
                tasks[checked ? 1 : 0].range(node.from, withSpace(node.to + 4)),
              );
              return;
            }
            if (item?.parent?.name === "BulletList") {
              out.push(bullets[depth % 3].range(node.from, withSpace(node.to)));
            } else {
              const label = state.doc.sliceString(node.from, node.to);
              out.push(
                Decoration.replace({ widget: new OrderedWidget(label) }).range(
                  node.from,
                  withSpace(node.to),
                ),
              );
            }
            return;
          }
        }
      },
    });
  }
  for (const r of out)
    if (r.value.spec.widget || r.value === hidden) atomic.push(r);
  return {
    all: Decoration.set(out, true),
    atomic: Decoration.set(atomic, true),
  };
}

export function livePreview(hideMarks: boolean) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;
      constructor(view: EditorView) {
        ({ all: this.decorations, atomic: this.atomic } = build(
          view,
          hideMarks,
        ));
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          ({ all: this.decorations, atomic: this.atomic } = build(
            u.view,
            hideMarks,
          ));
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [
    plugin,
    // Widgets replace their source text as one unit for cursor motion and deletion.
    EditorView.atomicRanges.of(
      (view) => view.plugin(plugin)?.atomic ?? Decoration.none,
    ),
  ];
}

/** URL under a document position, for ⌘-click. */
export function urlAt(state: EditorState, pos: number): string | null {
  let node = syntaxTree(state).resolveInner(pos, 1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    if (n.name === "URL") return state.sliceDoc(n.from, n.to);
    if (n.name === "Link") {
      const url = n.getChild("URL");
      return url ? state.sliceDoc(url.from, url.to) : null;
    }
  }
  node = syntaxTree(state).resolveInner(pos, -1);
  return node.name === "URL" ? state.sliceDoc(node.from, node.to) : null;
}
