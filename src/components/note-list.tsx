import { Clipboard, FileText, FolderOpen, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import * as session from "../editor/session";
import { shortTime } from "../lib/format";
import * as actions from "../store/actions";
import { type Note, useNotes } from "../store/notes";
import { Menu, type MenuAnchor } from "./ui/menu";

function useMinuteTick() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const Row = memo(function Row({
  note,
  selected,
  dragging,
  now,
  onPointerDown,
  onContextMenu,
}: {
  note: Note;
  selected: boolean;
  dragging: boolean;
  now: number;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <div
      id={`note-${note.id}`}
      data-row={note.id}
      role="option"
      aria-selected={selected}
      onPointerDown={(e) => onPointerDown(e, note.id)}
      onContextMenu={(e) => onContextMenu(e, note.id)}
      className={`group/row flex h-[30px] items-center gap-2 rounded-md px-2 transition-[background-color,opacity] duration-75 ${
        selected
          ? "bg-active text-fg group-focus/list:shadow-[inset_0_0_0_1px_var(--line-strong)]"
          : "text-fg-muted hover:bg-hover hover:text-fg"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <span
        className={`min-w-0 flex-1 truncate ${note.title ? "" : "text-fg-subtle"}`}
      >
        {note.title || "Untitled"}
      </span>
      <span className="tabular shrink-0 text-[11px] text-fg-faint group-hover/row:text-fg-subtle">
        {shortTime(note.modified, now)}
      </span>
    </div>
  );
});

export function NoteList() {
  const notes = useNotes((s) => s.notes);
  const selectedId = useNotes((s) => s.selectedId);
  const now = useMinuteTick();
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startY: number; active: boolean } | null>(
    null,
  );
  const [dragging, setDragging] = useState<{
    id: string;
    index: number;
    top: number;
  } | null>(null);
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; id: string } | null>(
    null,
  );

  // Keep the selection visible as it moves (keyboard, search, new note).
  useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(`note-${selectedId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function onRowPointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    drag.current = { id, startY: e.clientY, active: false };
    if (id !== useNotes.getState().selectedId)
      actions.selectNote(id, { focus: "none" });
  }

  function dropTarget(clientY: number) {
    const list = listRef.current!;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-row]")];
    const listTop = list.getBoundingClientRect().top - list.scrollTop;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2)
        return { index: i, top: r.top - listTop - 1 };
    }
    const last = rows[rows.length - 1]?.getBoundingClientRect();
    return { index: rows.length, top: last ? last.bottom - listTop - 1 : 0 };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !(e.buttons & 1)) return;
    const list = listRef.current!;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 5) return;
      d.active = true;
      list.setPointerCapture(e.pointerId);
    }
    const bounds = list.getBoundingClientRect();
    if (e.clientY < bounds.top + 24) list.scrollTop -= 8;
    else if (e.clientY > bounds.bottom - 24) list.scrollTop += 8;
    setDragging({ id: d.id, ...dropTarget(e.clientY) });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.active || !dragging) {
      setDragging(null);
      return;
    }
    const from = notes.findIndex((n) => n.id === d.id);
    const to = dragging.index > from ? dragging.index - 1 : dragging.index;
    setDragging(null);
    if (from !== -1 && to !== from) void actions.moveNote(d.id, to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        void actions.deleteNote(selectedId);
      }
      return;
    }
    const i = notes.findIndex((n) => n.id === selectedId);
    const go = (index: number) => {
      const note = notes[Math.max(0, Math.min(index, notes.length - 1))];
      if (note) actions.selectNote(note.id, { focus: "none" });
    };
    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        go(i + 1);
        break;
      case "ArrowUp":
      case "k":
        e.preventDefault();
        go(i - 1);
        break;
      case "Home":
      case "g":
        e.preventDefault();
        go(0);
        break;
      case "End":
      case "G":
        e.preventDefault();
        go(notes.length - 1);
        break;
      case "Enter":
      case "l":
      case "ArrowRight":
      case "Escape":
        e.preventDefault();
        session.focusEditor();
        break;
      case "Backspace":
      case "Delete":
        e.preventDefault();
        if (selectedId) void actions.deleteNote(selectedId);
        break;
    }
  }

  function onContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setMenu({ anchor: { x: e.clientX, y: e.clientY }, id });
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 pb-16 text-center">
        <FileText size={18} strokeWidth={1.5} className="mb-1 text-fg-faint" />
        <p className="text-fg-muted">No notes yet</p>
        <p className="text-[12px] text-fg-subtle">
          Press ⌘N to write your first one.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        id="note-list"
        ref={listRef}
        role="listbox"
        aria-label="Notes"
        tabIndex={0}
        aria-activedescendant={selectedId ? `note-${selectedId}` : undefined}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(null);
        }}
        className="group/list scroll relative flex-1 px-2 pb-3 outline-none [content-visibility:auto]"
      >
        {notes.map((note) => (
          <Row
            key={note.id}
            note={note}
            selected={note.id === selectedId}
            dragging={dragging?.id === note.id}
            now={now}
            onPointerDown={onRowPointerDown}
            onContextMenu={onContextMenu}
          />
        ))}
        {dragging && (
          <div
            className="pointer-events-none absolute right-3 left-3 h-[2px] rounded-full bg-accent"
            style={{ top: dragging.top }}
          />
        )}
      </div>
      {menu && (
        <Menu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Copy as Markdown",
              icon: <Clipboard size={14} />,
              onSelect: () => void actions.copyMarkdown(menu.id),
            },
            {
              label: "Reveal in Finder",
              icon: <FolderOpen size={14} />,
              onSelect: () => void actions.revealInFinder(menu.id),
            },
            { separator: true },
            {
              label: "Delete",
              icon: <Trash2 size={14} />,
              shortcut: "mod+backspace",
              danger: true,
              onSelect: () => void actions.deleteNote(menu.id),
            },
          ]}
        />
      )}
    </>
  );
}
