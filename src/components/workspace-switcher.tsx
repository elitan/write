import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../hooks/use-workspaces";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string) => void;
  onDelete: (workspaceId: string) => void;
  onRename: (workspaceId: string, newName: string) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  isOpen,
  onClose,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: WorkspaceSwitcherProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const items = [
    ...workspaces,
    { id: "__create__", name: "New workspace...", shortcut: null },
  ];

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setIsCreating(false);
      setRenamingId(null);
      setNewName("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isCreating || renamingId) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isCreating, renamingId]);

  function handleSelect(
    item: Workspace | { id: string; name: string; shortcut: null },
  ) {
    if (item.id === "__create__") {
      setIsCreating(true);
    } else {
      onSelect(item.id);
      onClose();
    }
  }

  function handleCreate() {
    const trimmed = newName.trim();
    if (trimmed) {
      onCreate(trimmed);
      setIsCreating(false);
      setNewName("");
      onClose();
    }
  }

  function handleRename() {
    const trimmed = newName.trim();
    if (trimmed && renamingId) {
      onRename(renamingId, trimmed);
      setRenamingId(null);
      setNewName("");
    }
  }

  function startRenaming(workspaceId: string, currentName: string) {
    setRenamingId(workspaceId);
    setNewName(currentName);
  }

  function handleDelete(e: React.MouseEvent, workspaceId: string) {
    e.stopPropagation();
    if (workspaces.length > 1) {
      onDelete(workspaceId);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isCreating) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleCreate();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setIsCreating(false);
          setNewName("");
        }
        return;
      }

      if (renamingId) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setRenamingId(null);
          setNewName("");
        }
        return;
      }

      const numKey = parseInt(e.key, 10);
      if (numKey >= 1 && numKey <= 9) {
        const workspace = workspaces.find((w) => w.shortcut === e.key);
        if (workspace) {
          e.preventDefault();
          onSelect(workspace.id);
          onClose();
          return;
        }
      }

      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
        case "l":
          e.preventDefault();
          if (items[selectedIndex]) {
            handleSelect(items[selectedIndex]);
          }
          break;
        case "n":
          e.preventDefault();
          setIsCreating(true);
          break;
        case "r": {
          e.preventDefault();
          const item = items[selectedIndex];
          if (item && item.id !== "__create__") {
            startRenaming(item.id, item.name);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    items,
    selectedIndex,
    onClose,
    isCreating,
    renamingId,
    workspaces,
  ]);

  if (!isOpen) return null;

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
        className="relative w-full max-w-[360px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "paletteSlideIn 100ms ease" }}
      >
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm text-[var(--color-muted)]">
            Switch Workspace
          </span>
        </div>

        {isCreating || renamingId ? (
          <div className="p-4">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name..."
              className="w-full px-3 py-2 bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded-lg text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setRenamingId(null);
                  setNewName("");
                }}
                className="px-3 py-1.5 text-sm rounded-[var(--radius-sm)] hover:bg-[var(--color-sidebar)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={renamingId ? handleRename : handleCreate}
                disabled={!newName.trim()}
                className="px-3 py-1.5 text-sm rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {renamingId ? "Rename" : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto py-2">
            {items.map((item, index) => {
              const isActive = item.id === activeWorkspaceId;
              const isCreateItem = item.id === "__create__";

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`group flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                    index === selectedIndex
                      ? "bg-[var(--color-accent-light)]"
                      : "hover:bg-[var(--color-sidebar)]"
                  }`}
                >
                  {isCreateItem ? (
                    <Plus
                      size={16}
                      className="shrink-0 text-[var(--color-muted)]"
                    />
                  ) : item.shortcut ? (
                    <kbd className="w-5 h-5 flex items-center justify-center text-[11px] text-[var(--color-muted)] bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
                      {item.shortcut}
                    </kbd>
                  ) : (
                    <span className="w-5" />
                  )}

                  <span className="flex-1 truncate text-[14px]">
                    {item.name}
                  </span>

                  {!isCreateItem && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRenaming(item.id, item.name);
                        }}
                        className="p-1 rounded hover:bg-[var(--color-border)]"
                      >
                        <Pencil
                          size={14}
                          className="text-[var(--color-muted)]"
                        />
                      </button>
                      {!isActive && workspaces.length > 1 && (
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          className="p-1 rounded hover:bg-[var(--color-border)]"
                        >
                          <Trash2
                            size={14}
                            className="text-[var(--color-muted)]"
                          />
                        </button>
                      )}
                    </div>
                  )}

                  {index === selectedIndex && (
                    <kbd className="ml-auto px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
                      ↵
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
