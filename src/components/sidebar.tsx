import { FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import type { NoteEntry } from "../hooks/use-files";

interface SidebarProps {
  notes: NoteEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}

export function Sidebar({
  notes,
  selectedPath,
  onSelect,
  onDelete,
}: SidebarProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  return (
    <aside
      className="flex flex-col h-full w-60 border-r border-[var(--color-border)] bg-[var(--color-sidebar)]"
      style={{ paddingTop: 52 }}
    >
      <nav className="flex-1 overflow-y-auto px-2 pt-3">
        {notes.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">
            No notes yet
          </p>
        ) : (
          <ul className="space-y-0.5">
            {notes.map((note) => (
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
                               selectedPath === note.path
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
