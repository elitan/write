import { useState, useEffect, useRef, useMemo } from "react";
import { Search, FileText } from "lucide-react";
import Fuse from "fuse.js";
import type { NoteEntry } from "../hooks/use-files";

interface CommandPaletteProps {
  notes: NoteEntry[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function CommandPalette({
  notes,
  isOpen,
  onClose,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(notes, {
        keys: ["title"],
        threshold: 0.4,
        includeScore: true,
      }),
    [notes]
  );

  const results = useMemo(() => {
    if (!query.trim()) return notes;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse, notes]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex].path);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ animation: "fadeIn 100ms ease" }}
      />
      <div
        className="relative w-full max-w-[520px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideIn 100ms ease" }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <Search size={18} className="text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--color-muted)]"
          />
          <kbd className="px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
            esc
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
              No notes found
            </div>
          ) : (
            <ul className="py-2">
              {results.map((note, index) => (
                <li key={note.path}>
                  <button
                    onClick={() => {
                      onSelect(note.path);
                      onClose();
                    }}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                      index === selectedIndex
                        ? "bg-[var(--color-accent-light)]"
                        : "hover:bg-[var(--color-sidebar)]"
                    }`}
                  >
                    <FileText
                      size={16}
                      className="shrink-0 text-[var(--color-muted)]"
                    />
                    <span className="truncate text-[14px]">{note.title}</span>
                    {index === selectedIndex && (
                      <kbd className="ml-auto px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
                        ↵
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.96) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
