import { FileText, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { NoteEntry } from "../hooks/use-files";

interface SidebarProps {
  notes: NoteEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onReorder: (path: string, newIndex: number) => void;
  isFocused: boolean;
  onFocusChange: (focused: boolean) => void;
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
    })
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
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        e.stopPropagation();
        setFocusedIndex((i) => Math.min(i + 1, notes.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "l") {
        e.preventDefault();
        e.stopPropagation();
        if (notes[focusedIndex]) {
          onSelect(notes[focusedIndex].path);
          onFocusChange(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
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
      <nav className="flex-1 overflow-y-auto px-2 pt-3">
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
