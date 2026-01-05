import { invoke } from "@tauri-apps/api/core";
import Fuse from "fuse.js";
import {
  Bug,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteEntry } from "../stores/notes-store";

type CommandItem = {
  type: "command";
  id: string;
  title: string;
  icon: "settings" | "update" | "delete" | "finder" | "debug";
  action: () => void;
};

type NoteItem = {
  type: "note";
  path: string;
  title: string;
};

type PaletteItem = CommandItem | NoteItem;

interface CommandPaletteProps {
  notes: NoteEntry[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  onCheckForUpdates: () => void;
  onOpenSettings: () => void;
  onToggleDebug: () => void;
  selectedPath: string | null;
  onDeleteCurrent: () => void;
}

export function CommandPalette({
  notes,
  isOpen,
  onClose,
  onSelect,
  onCheckForUpdates,
  onOpenSettings,
  onToggleDebug,
  selectedPath,
  onDeleteCurrent,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      type: "command",
      id: "settings",
      title: "Settings",
      icon: "settings",
      action: onOpenSettings,
    },
    {
      type: "command",
      id: "update",
      title: "Check for updates",
      icon: "update",
      action: onCheckForUpdates,
    },
    {
      type: "command",
      id: "debug",
      title: "Toggle Debug Panel",
      icon: "debug",
      action: onToggleDebug,
    },
    ...(selectedPath
      ? [
          {
            type: "command" as const,
            id: "finder",
            title: "Reveal in Finder",
            icon: "finder" as const,
            action: () => invoke("reveal_in_finder", { path: selectedPath }),
          },
          {
            type: "command" as const,
            id: "delete",
            title: "Delete current page",
            icon: "delete" as const,
            action: onDeleteCurrent,
          },
        ]
      : []),
  ];

  const noteItems: NoteItem[] = notes.map((n) => ({
    type: "note",
    path: n.path,
    title: n.title,
  }));
  const allItems: PaletteItem[] = [...commands, ...noteItems];

  const fuse = useMemo(
    () =>
      new Fuse(allItems, {
        keys: ["title"],
        threshold: 0.4,
        includeScore: true,
      }),
    [allItems],
  );

  const results = useMemo(() => {
    if (!query.trim()) return allItems;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse, allItems]);

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

  function handleSelect(item: PaletteItem) {
    if (item.type === "command") {
      item.action();
    } else {
      onSelect(item.path);
    }
    onClose();
  }

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
            handleSelect(results[selectedIndex]);
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
  }, [isOpen, results, selectedIndex, onClose]);

  if (!isOpen) return null;

  function getIcon(item: PaletteItem) {
    if (item.type === "note") {
      return (
        <FileText size={16} className="shrink-0 text-[var(--color-muted)]" />
      );
    }
    if (item.icon === "settings") {
      return (
        <Settings size={16} className="shrink-0 text-[var(--color-muted)]" />
      );
    }
    if (item.icon === "delete") {
      return (
        <Trash2 size={16} className="shrink-0 text-[var(--color-muted)]" />
      );
    }
    if (item.icon === "finder") {
      return (
        <FolderOpen size={16} className="shrink-0 text-[var(--color-muted)]" />
      );
    }
    if (item.icon === "debug") {
      return <Bug size={16} className="shrink-0 text-[var(--color-muted)]" />;
    }
    return (
      <RefreshCw size={16} className="shrink-0 text-[var(--color-muted)]" />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ animation: "modalFadeIn 100ms ease" }}
      />
      <div
        className="relative w-full max-w-[520px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "paletteSlideIn 100ms ease" }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <Search size={18} className="text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--color-muted)]"
          />
          <kbd className="px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
            esc
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
              No results found
            </div>
          ) : (
            <ul className="py-2">
              {results.map((item, index) => (
                <li key={item.type === "note" ? item.path : item.id}>
                  <button
                    onClick={() => handleSelect(item)}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                      index === selectedIndex
                        ? "bg-[var(--color-accent-light)]"
                        : "hover:bg-[var(--color-sidebar)]"
                    }`}
                  >
                    {getIcon(item)}
                    <span className="truncate text-[14px]">{item.title}</span>
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
    </div>
  );
}
