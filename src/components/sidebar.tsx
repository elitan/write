import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, FileText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { NoteEntry, Workspace } from "../stores/notes-store";
import { debugLog } from "./debug-panel";

interface SidebarProps {
  notes: NoteEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onReorder: (path: string, newIndex: number) => void;
  isFocused: boolean;
  onFocusChange: (focused: boolean) => void;
  activeWorkspace: Workspace | null;
  onOpenWorkspaceSwitcher: () => void;
}

interface SortableItemProps {
  note: NoteEntry;
  isSelected: boolean;
  isFocusHighlighted: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function SortableItem({
  note,
  isSelected,
  isFocusHighlighted,
  isHovered,
  onSelect,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.path });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        onClick={onSelect}
        className={`group flex items-center gap-2 w-full px-3 py-2 text-sm rounded-[var(--radius-sm)]
                   transition-colors duration-[var(--transition-fast)] text-left cursor-grab active:cursor-grabbing
                   ${
                     isDragging
                       ? "bg-[var(--color-accent-light)] shadow-lg"
                       : isFocusHighlighted || isSelected
                         ? "bg-[var(--color-accent-light)] text-[var(--color-text)]"
                         : "hover:bg-[var(--color-bg)] text-[var(--color-text)]"
                   }`}
      >
        <FileText size={16} className="shrink-0 text-[var(--color-muted)]" />
        <span className="truncate flex-1">{note.title}</span>
        {isHovered && !isDragging && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 -m-1 rounded hover:bg-[var(--color-border)] transition-colors"
          >
            <Trash2
              size={14}
              className="text-[var(--color-muted)] hover:text-red-500"
            />
          </button>
        )}
      </button>
    </li>
  );
}

export function Sidebar({
  notes,
  selectedPath,
  onSelect,
  onDelete,
  onReorder,
  isFocused,
  onFocusChange,
  activeWorkspace,
  onOpenWorkspaceSwitcher,
}: SidebarProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (isFocused) {
      const currentIndex = notes.findIndex((n) => n.path === selectedPath);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isFocused, notes, selectedPath]);

  useEffect(() => {
    if (!isFocused) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        debugLog("sidebar:skip", {
          reason: "input focused",
          target: target.tagName,
        });
        return;
      }

      debugLog("sidebar:keydown", {
        key: e.key,
        target: target.tagName,
        isFocused,
        focusedIndex,
        notesCount: notes.length,
        selectedPath,
        notePaths: notes.map((n) => n.path.split("/").pop()),
      });

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        e.stopPropagation();
        const newIndex = Math.min(focusedIndex + 1, notes.length - 1);
        debugLog("sidebar:nav", {
          action: "down",
          from: focusedIndex,
          to: newIndex,
        });
        setFocusedIndex(newIndex);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        const newIndex = Math.max(focusedIndex - 1, 0);
        debugLog("sidebar:nav", {
          action: "up",
          from: focusedIndex,
          to: newIndex,
        });
        setFocusedIndex(newIndex);
      } else if (e.key === "Enter" || e.key === "l") {
        e.preventDefault();
        e.stopPropagation();
        debugLog("sidebar:select", {
          focusedIndex,
          selectingNote: notes[focusedIndex]?.path,
          currentSelectedPath: selectedPath,
          allNotes: notes.map((n) => n.path.split("/").pop()),
        });
        if (notes[focusedIndex]) {
          onSelect(notes[focusedIndex].path);
          onFocusChange(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        debugLog("sidebar:escape", {});
        onFocusChange(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isFocused, notes, focusedIndex, onSelect, onFocusChange]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = notes.findIndex((n) => n.path === active.id);
      const newIndex = notes.findIndex((n) => n.path === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(active.id as string, newIndex);
      }
    }
  }

  return (
    <aside
      className={`flex flex-col h-full w-60 border-r bg-[var(--color-sidebar)] ${
        isFocused
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-border)]"
      }`}
      style={{ paddingTop: 52 }}
    >
      <button
        onClick={onOpenWorkspaceSwitcher}
        className="flex items-center justify-between mx-2 mt-3 px-3 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] rounded-[var(--radius-sm)] transition-colors"
      >
        <span className="truncate">{activeWorkspace?.name || "Workspace"}</span>
        <ChevronDown size={14} className="shrink-0" />
      </button>

      <nav className="flex-1 overflow-y-auto px-2 pt-2">
        {notes.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">
            No notes yet
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={notes.map((n) => n.path)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-0.5">
                {notes.map((note, index) => (
                  <SortableItem
                    key={note.path}
                    note={note}
                    isSelected={selectedPath === note.path}
                    isFocusHighlighted={isFocused && index === focusedIndex}
                    isHovered={hoveredPath === note.path}
                    onSelect={() => onSelect(note.path)}
                    onDelete={() => onDelete(note.path)}
                    onMouseEnter={() => setHoveredPath(note.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </nav>
    </aside>
  );
}
