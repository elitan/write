import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type {
  EditorState,
  StateCommand,
  TransactionSpec,
} from "@codemirror/state";

/**
 * Notion-style blocks on top of plain markdown. A block is a top-level
 * markdown node (paragraph, heading, code, quote, table, rule…) or a list
 * item, which carries its nested items with it.
 */
export interface Block {
  from: number;
  to: number;
  /** 1-based line numbers, inclusive. */
  fromLine: number;
  toLine: number;
  /** First non-space character, where the handle lines up. */
  textStart: number;
  list: boolean;
  indent: number;
  depth: number;
}

/** Insert before 0-based line `line` of the current doc. */
export interface DropTarget {
  line: number;
  /** Land inside a list (keeps it tight and adopts `indent`). */
  joinList: boolean;
  indent: number;
}

function makeBlock(
  state: EditorState,
  from: number,
  to: number,
  list: boolean,
  depth: number,
): Block {
  const first = state.doc.lineAt(from);
  let last = state.doc.lineAt(to);
  if (to > from && last.from === to) last = state.doc.line(last.number - 1);
  const indent = /^\s*/.exec(first.text)![0].length;
  return {
    from: first.from,
    to: last.to,
    fromLine: first.number,
    toLine: last.number,
    textStart: first.from + indent,
    list,
    indent,
    depth,
  };
}

/** Every block overlapping [from, to], in document order. */
export function blocksIn(
  state: EditorState,
  from = 0,
  to = state.doc.length,
): Block[] {
  const out: Block[] = [];
  const tree = ensureSyntaxTree(state, to, 50) ?? syntaxTree(state);
  tree.iterate({
    from,
    to,
    enter(node) {
      const name = node.name;
      if (name === "Document") return;
      if (name === "BulletList" || name === "OrderedList") return;
      if (name === "ListItem") {
        let depth = 0;
        for (let p = node.node.parent; p; p = p.parent) {
          if (p.name === "ListItem") depth++;
        }
        out.push(makeBlock(state, node.from, node.to, true, depth));
        return;
      }
      if (node.node.parent?.name === "Document") {
        out.push(makeBlock(state, node.from, node.to, false, 0));
      }
      return false;
    },
  });
  return out;
}

/** The innermost block containing line `lineNo`. */
export function blockAtLine(state: EditorState, lineNo: number): Block | null {
  const line = state.doc.line(lineNo);
  let best: Block | null = null;
  for (const b of blocksIn(state, line.from, line.to)) {
    if (
      b.fromLine <= lineNo &&
      b.toLine >= lineNo &&
      (!best || b.from >= best.from)
    ) {
      best = b;
    }
  }
  return best;
}

const blank = (s: string | undefined) => s !== undefined && s.trim() === "";

function reindent(lines: string[], delta: number) {
  if (delta === 0) return lines;
  return lines.map((l) => {
    if (delta > 0) return l ? " ".repeat(delta) + l : l;
    const strip = Math.min(-delta, /^ */.exec(l)![0].length);
    return l.slice(strip);
  });
}

/** Dropping here would leave the document unchanged. */
export function isNoop(src: Block, target: DropTarget) {
  const s = src.fromLine - 1;
  const e = src.toLine - 1;
  const newIndent = src.list && target.joinList ? target.indent : 0;
  if (target.line > s && target.line <= e) return true;
  return (
    (target.line === s || target.line === e + 1) && newIndent === src.indent
  );
}

export interface MoveResult {
  spec: TransactionSpec;
  /** Range of the moved block in the new document. */
  from: number;
  to: number;
}

/** Moves `src` to `target`, fixing indentation and blank-line spacing. */
export function moveBlock(
  state: EditorState,
  src: Block,
  target: DropTarget,
): MoveResult | null {
  if (isNoop(src, target)) return null;
  const lines = state.doc.toString().split("\n");
  const s = src.fromLine - 1;
  const e = src.toLine - 1;
  const joining = src.list && target.joinList;
  const newIndent = joining ? target.indent : 0;

  const block = reindent(lines.slice(s, e + 1), newIndent - src.indent);
  const rest = [...lines.slice(0, s), ...lines.slice(e + 1)];
  let at = target.line > e ? target.line - (e - s + 1) : target.line;

  // Don't leave a double blank line (or a leading one) where the block was.
  if ((s === 0 || blank(rest[s - 1])) && s < rest.length && blank(rest[s])) {
    rest.splice(s, 1);
    if (at > s) at--;
  } else if (s === rest.length && s > 0 && blank(rest[s - 1])) {
    // The block was the last line: drop the separator that preceded it.
    rest.splice(s - 1, 1);
    if (at > s - 1) at--;
  }

  let insert = block;
  if (!joining) {
    if (at >= rest.length) {
      at = rest.length;
      while (at > 0 && blank(rest[at - 1])) at--;
    }
    const before = at > 0 && !blank(rest[at - 1]) ? [""] : [];
    const after = at < rest.length && !blank(rest[at]) ? [""] : [];
    insert = [...before, ...block, ...after];
    at += before.length;
    rest.splice(at - before.length, 0, ...insert);
  } else {
    rest.splice(at, 0, ...insert);
  }

  const next = rest.join("\n");
  const old = state.doc.toString();
  let pre = 0;
  while (pre < old.length && pre < next.length && old[pre] === next[pre]) pre++;
  let suf = 0;
  while (
    suf < old.length - pre &&
    suf < next.length - pre &&
    old[old.length - 1 - suf] === next[next.length - 1 - suf]
  ) {
    suf++;
  }

  let from = 0;
  for (let i = 0; i < at; i++) from += rest[i].length + 1;
  const to = from + block.join("\n").length;
  return {
    spec: {
      changes: {
        from: pre,
        to: old.length - suf,
        insert: next.slice(pre, next.length - suf),
      },
      userEvent: "move.block",
      scrollIntoView: true,
    },
    from,
    to,
  };
}

export function targetBefore(b: Block): DropTarget {
  return { line: b.fromLine - 1, joinList: b.list, indent: b.indent };
}

export function targetAfter(b: Block): DropTarget {
  return { line: b.toLine, joinList: b.list, indent: b.indent };
}

function moveCursorBlock(dir: -1 | 1): StateCommand {
  return ({ state, dispatch }) => {
    const head = state.selection.main.head;
    const src = blockAtLine(state, state.doc.lineAt(head).number);
    if (!src) return false;
    const all = blocksIn(state);
    let target: DropTarget | null = null;
    if (dir < 0) {
      const prev = all
        .filter((b) => b.to < src.from && b.depth <= src.depth)
        .pop();
      if (prev) target = targetBefore(prev);
    } else {
      const next = all.find((b) => b.from > src.to && b.depth <= src.depth);
      if (next) target = targetAfter(next);
    }
    if (!target) return true;
    const moved = moveBlock(state, src, target);
    if (!moved) return true;
    const offset = Math.min(head - src.from, moved.to - moved.from);
    dispatch(
      state.update({
        ...moved.spec,
        selection: { anchor: moved.from + Math.max(0, offset) },
      }),
    );
    return true;
  };
}

export const moveBlockUp = moveCursorBlock(-1);
export const moveBlockDown = moveCursorBlock(1);
