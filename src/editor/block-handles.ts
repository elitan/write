import { EditorSelection } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  type Block,
  blockAtLine,
  blocksIn,
  type DropTarget,
  isNoop,
  moveBlock,
  targetAfter,
  targetBefore,
} from "./blocks";

/**
 * Notion-style ⋮⋮ handle in the left margin of the hovered block. Drag it to
 * move the block, click it to select the block.
 */

const GRIP =
  '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">' +
  [3, 8, 13]
    .map(
      (y) =>
        `<circle cx="2.5" cy="${y}" r="1.35"/><circle cx="7.5" cy="${y}" r="1.35"/>`,
    )
    .join("") +
  "</svg>";

const HANDLE_GUTTER = 26;
const EDGE = 56;

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}

interface Drag {
  block: Block;
  start: { x: number; y: number };
  active: boolean;
  target: DropTarget | null;
  /** Where inside the preview the pointer grabbed it. */
  grab: { x: number; y: number };
}

const GHOST_MAX_LINES = 14;

class BlockHandles {
  handle = document.createElement("div");
  indicator = document.createElement("div");
  shade = document.createElement("div");
  ghost: HTMLElement | null = null;
  hovered: Block | null = null;
  drag: Drag | null = null;
  pointer = { x: 0, y: 0 };
  frame = 0;

  constructor(readonly view: EditorView) {
    this.handle.className = "cm-block-handle";
    this.handle.innerHTML = GRIP;
    this.handle.title = "Drag to move\nClick to select";
    this.indicator.className = "cm-block-drop";
    this.shade.className = "cm-block-shade";
    view.dom.append(this.shade, this.indicator, this.handle);

    window.addEventListener("pointermove", this.onWindowMove, {
      passive: true,
    });
    view.contentDOM.addEventListener("keydown", this.hide);
    this.handle.addEventListener("pointerdown", this.onDown);
    // Keep CodeMirror from starting a text selection under the handle.
    this.handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  update(u: ViewUpdate) {
    if (u.docChanged && !this.drag) this.hide();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointermove", this.onWindowMove);
    this.view.contentDOM.removeEventListener("keydown", this.hide);
    this.handle.remove();
    this.ghost?.remove();
    this.indicator.remove();
    this.shade.remove();
  }

  hide = () => {
    this.hovered = null;
    this.handle.classList.remove("is-visible");
  };

  onWindowMove = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
    if (this.drag) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.hover());
  };

  hover() {
    const { view } = this;
    const { x, y } = this.pointer;
    const dom = view.dom.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    if (
      y < dom.top ||
      y > dom.bottom ||
      x < content.left - 80 ||
      x > content.right + 16
    ) {
      this.hide();
      return;
    }
    const pos = view.posAtCoords({ x: content.left + 1, y }, false);
    const block = blockAtLine(view.state, view.state.doc.lineAt(pos).number);
    if (!block) {
      // Over the gap between blocks: keep the current handle if the pointer is on it.
      if (!this.handle.matches(":hover")) this.hide();
      return;
    }
    if (this.hovered?.from === block.from && this.hovered.to === block.to)
      return;
    const coords = view.coordsAtPos(block.textStart, 1);
    if (!coords) return this.hide();
    this.hovered = block;
    const left = coords.left - dom.left - HANDLE_GUTTER;
    const top = (coords.top + coords.bottom) / 2 - dom.top - 12;
    this.handle.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    this.handle.classList.add("is-visible");
  }

  onDown = (e: PointerEvent) => {
    if (!this.hovered || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      this.handle.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone; the drag still works while over the handle.
    }
    this.drag = {
      block: this.hovered,
      start: { x: e.clientX, y: e.clientY },
      active: false,
      target: null,
      grab: { x: 0, y: 0 },
    };
    this.handle.addEventListener("pointermove", this.onDrag);
    this.handle.addEventListener("pointerup", this.onUp);
    this.handle.addEventListener("pointercancel", this.onCancel);
  };

  onDrag = (e: PointerEvent) => {
    const drag = this.drag;
    if (!drag) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    if (!drag.active) {
      const moved = Math.hypot(
        e.clientX - drag.start.x,
        e.clientY - drag.start.y,
      );
      if (moved < 4) return;
      drag.active = true;
      this.view.dom.classList.add("cm-block-dragging");
      document.body.style.cursor = "grabbing";
      this.placeShade(drag.block);
      this.shade.classList.add("is-visible");
      this.ghost = this.makeGhost(drag);
      this.tick();
    }
    this.moveGhost();
    this.track();
  };

  /**
   * A translucent copy of the block's rendered lines that follows the
   * pointer, offset from where it was grabbed, like Notion.
   */
  makeGhost(drag: Drag) {
    const { view } = this;
    const lines: HTMLElement[] = [];
    for (
      let n = drag.block.fromLine;
      n <= drag.block.toLine && lines.length < GHOST_MAX_LINES;
      n++
    ) {
      const line = view.state.doc.line(n);
      if (line.from < view.viewport.from || line.from > view.viewport.to)
        continue;
      const { node } = view.domAtPos(line.from);
      const el = (
        node instanceof HTMLElement ? node : node.parentElement
      )?.closest(".cm-line");
      if (el instanceof HTMLElement && !lines.includes(el)) lines.push(el);
    }
    if (!lines.length) return null;

    const first = lines[0].getBoundingClientRect();
    const textLeft =
      view.coordsAtPos(drag.block.textStart, 1)?.left ?? first.left;
    const left = Math.max(first.left, textLeft - 8);
    drag.grab = { x: drag.start.x - left, y: drag.start.y - first.top };

    const ghost = document.createElement("div");
    ghost.className = "cm-block-ghost";
    ghost.style.width = `${Math.round(first.right - left)}px`;
    // Inner wrapper reuses the editor's classes so text renders identically.
    const editor = document.createElement("div");
    editor.className = view.dom.className.replace(
      /\b(cm-focused|cm-block-dragging)\b/g,
      "",
    );
    editor.style.marginLeft = `${Math.round(first.left - left)}px`;
    const content = document.createElement("div");
    content.className = "cm-content";
    for (const line of lines) content.append(line.cloneNode(true));
    if (drag.block.toLine - drag.block.fromLine + 1 > lines.length) {
      ghost.classList.add("is-clipped");
    }
    editor.append(content);
    ghost.append(editor);
    (view.dom.closest(".editor-root") ?? document.body).append(ghost);
    return ghost;
  }

  moveGhost() {
    const drag = this.drag;
    if (!this.ghost || !drag) return;
    const x = this.pointer.x - drag.grab.x;
    const y = this.pointer.y - drag.grab.y;
    this.ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** Keeps scrolling while the pointer rests near an edge. */
  tick = () => {
    if (!this.drag?.active) return;
    const scroller = scrollParent(this.view.dom);
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      const { y } = this.pointer;
      const speed =
        y < r.top + EDGE
          ? -Math.ceil((r.top + EDGE - y) / 4)
          : y > r.bottom - EDGE
            ? Math.ceil((y - (r.bottom - EDGE)) / 4)
            : 0;
      if (speed) {
        scroller.scrollTop += speed;
        this.placeShade(this.drag.block);
        this.track();
      }
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  track() {
    const drag = this.drag;
    if (!drag) return;
    const { view } = this;
    const { y } = this.pointer;
    const dom = view.dom.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const all = blocksIn(view.state, view.viewport.from, view.viewport.to);
    const candidates = all.filter(
      (b) => !(b.from >= drag.block.from && b.from <= drag.block.to),
    );

    let target: DropTarget | null = null;
    let lineY = 0;
    let lineX = content.left;
    for (const b of candidates) {
      const c = view.coordsAtPos(b.textStart, 1);
      if (!c) continue;
      if (y < (c.top + c.bottom) / 2) {
        target = targetBefore(b);
        lineY = view.lineBlockAt(b.from).top + view.documentTop;
        lineX = c.left;
        break;
      }
    }
    if (!target) {
      const last = all.filter((b) => b.depth === 0).pop();
      if (last) {
        target = targetAfter(last);
        lineY = view.lineBlockAt(last.to).bottom + view.documentTop;
        lineX = view.coordsAtPos(last.textStart, 1)?.left ?? content.left;
      }
    }

    if (!target || isNoop(drag.block, target)) {
      drag.target = null;
      this.indicator.classList.remove("is-visible");
      return;
    }
    drag.target = target;
    // A list item joining a list lines up with its new siblings.
    const x = drag.block.list && target.joinList ? lineX : content.left;
    this.indicator.style.transform = `translate(${Math.round(x - dom.left)}px, ${Math.round(lineY - dom.top - 1)}px)`;
    this.indicator.style.width = `${Math.max(40, content.right - x)}px`;
    this.indicator.classList.add("is-visible");
  }

  placeShade(block: Block) {
    const { view } = this;
    const dom = view.dom.getBoundingClientRect();
    const top = view.lineBlockAt(block.from).top + view.documentTop - dom.top;
    const bottom =
      view.lineBlockAt(block.to).bottom + view.documentTop - dom.top;
    const left =
      (view.coordsAtPos(block.textStart, 1)?.left ?? dom.left) - dom.left;
    this.shade.style.transform = `translate(${Math.round(left - 6)}px, ${Math.round(top)}px)`;
    this.shade.style.width = `${Math.round(view.contentDOM.getBoundingClientRect().right - dom.left - left + 12)}px`;
    this.shade.style.height = `${Math.round(bottom - top)}px`;
  }

  onUp = () => {
    const drag = this.drag;
    this.finish();
    if (!drag) return;
    const { view } = this;
    if (!drag.active) {
      view.dispatch({
        selection: EditorSelection.range(drag.block.from, drag.block.to),
      });
      view.focus();
      return;
    }
    if (!drag.target) return;
    const moved = moveBlock(view.state, drag.block, drag.target);
    if (!moved) return;
    view.dispatch(moved.spec);
    this.flash(moved.from, moved.to);
  };

  onCancel = () => this.finish();

  finish() {
    cancelAnimationFrame(this.frame);
    this.drag = null;
    this.ghost?.remove();
    this.ghost = null;
    this.view.dom.classList.remove("cm-block-dragging");
    document.body.style.cursor = "";
    this.indicator.classList.remove("is-visible");
    this.shade.classList.remove("is-visible");
    this.handle.removeEventListener("pointermove", this.onDrag);
    this.handle.removeEventListener("pointerup", this.onUp);
    this.handle.removeEventListener("pointercancel", this.onCancel);
    this.hide();
  }

  /** Briefly highlights the block where it landed. */
  flash(from: number, to: number) {
    this.view.requestMeasure({
      read: () => null,
      write: () => {
        const line = this.view.state.doc.lineAt(from);
        const block = blockAtLine(this.view.state, line.number);
        if (!block || block.to < to - 1) return;
        this.placeShade(block);
        this.shade.classList.remove("is-flash");
        void this.shade.offsetWidth;
        this.shade.classList.add("is-flash");
      },
    });
  }
}

export const blockHandles = ViewPlugin.fromClass(BlockHandles);
