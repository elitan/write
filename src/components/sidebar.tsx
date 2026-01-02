import { FileText, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import type { NoteEntry } from "../hooks/use-files";

interface SidebarProps {
  notes: NoteEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  isFocused: boolean;
  onFocusChange: (focused: boolean) => void;
}

export function Sidebar({
  notes,
  selectedPath,
  onSelect,
  onDelete,
  isFocused,
  onFocusChange,
}: SidebarProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

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

  return (
    <aside
      className={`flex flex-col h-full w-60 border-r bg-[var(--color-sidebar)] ${
        isFocused ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
      }`}
      style={{ paddingTop: 52 }}
    >
      <nav className="flex-1 overflow-y-auto px-2 pt-3">
        {notes.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">
            No notes yet
          </p>
        ) : (
          <ul className="space-y-0.5">
            {notes.map((note, index) => (
              <li
                key={note.path}
                onMouseEnter={() => setHoveredPath(note.path)}
                onMouseLeave={() => setHoveredPath(null)}
              >
                <button
                  onClick={() => onSelect(note.path)}
                  className={`group flex items-center gap-2 w-full px-3 py-2 text-sm rounded-[var(--radius-sm)]
                             transition-colors duration-[var(--transition-fast)] text-left
                             ${
                               (isFocused && index === focusedIndex) || selectedPath === note.path
                                 ? "bg-[var(--color-accent-light)] text-[var(--color-text)]"
                                 : "hover:bg-[var(--color-bg)] text-[var(--color-text)]"
                             }`}
                >
                  <FileText
                    size={16}
                    className="shrink-0 text-[var(--color-muted)]"
                  />
                  <span className="truncate flex-1">{note.title}</span>
                  {hoveredPath === note.path && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(note.path);
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
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
