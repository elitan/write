import { FileText, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center px-8"
      style={{ paddingTop: 52 }}
    >
      <div className="w-16 h-16 mb-6 rounded-full bg-[var(--color-sidebar)] border border-[var(--color-border)] flex items-center justify-center">
        <FileText size={28} className="text-[var(--color-muted)]" />
      </div>
      <h2 className="text-lg font-medium mb-2">No note selected</h2>
      <p className="text-sm text-[var(--color-muted)] mb-6 max-w-[280px]">
        Select a note from the sidebar or create a new one to get started.
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)]
                   bg-[var(--color-text)] text-[var(--color-bg)]
                   hover:opacity-90 transition-opacity duration-[var(--transition-normal)]
                   focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
      >
        <Plus size={16} />
        Create Note
      </button>
      <div className="mt-8 flex flex-col gap-2 text-xs text-[var(--color-muted)]">
        <p>
          <kbd className="px-1.5 py-0.5 bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
            ⌘
          </kbd>
          {" "}
          <kbd className="px-1.5 py-0.5 bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
            N
          </kbd>
          {" "}
          new note
        </p>
        <p>
          <kbd className="px-1.5 py-0.5 bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
            ⌘
          </kbd>
          {" "}
          <kbd className="px-1.5 py-0.5 bg-[var(--color-sidebar)] border border-[var(--color-border)] rounded">
            K
          </kbd>
          {" "}
          search notes
        </p>
      </div>
    </div>
  );
}
