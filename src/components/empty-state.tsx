import * as actions from "../store/actions";
import { useNotes } from "../store/notes";
import { openPalette } from "../store/ui";
import { Shortcut } from "./ui/kbd";

export function EmptyState() {
  const hasNotes = useNotes((s) => s.notes.length > 0);
  const rows: [string, string, () => void][] = [
    ["New note", "mod+n", () => actions.createNote()],
    ["Search", "mod+k", () => openPalette()],
    ["Switch workspace", "ctrl+tab", () => openPalette("workspaces")],
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pb-[8vh]">
      <svg
        width="40"
        height="40"
        viewBox="0 0 512 512"
        aria-hidden
        className="mb-6 text-fg-faint"
      >
        <rect
          width="512"
          height="512"
          rx="112"
          fill="currentColor"
          opacity="0.35"
        />
        <rect
          x="140"
          y="146"
          width="192"
          height="24"
          rx="12"
          fill="var(--bg)"
        />
        <rect
          x="140"
          y="206"
          width="152"
          height="24"
          rx="12"
          fill="var(--bg)"
          opacity="0.7"
        />
        <rect
          x="140"
          y="266"
          width="112"
          height="24"
          rx="12"
          fill="var(--bg)"
          opacity="0.5"
        />
        <rect
          x="140"
          y="326"
          width="72"
          height="24"
          rx="12"
          fill="var(--bg)"
          opacity="0.3"
        />
      </svg>
      <p className="mb-5 text-[13px] text-fg-subtle">
        {hasNotes ? "No note selected" : "This workspace is empty"}
      </p>
      <div className="flex w-[240px] flex-col gap-0.5">
        {rows.map(([label, keys, run]) => (
          <button
            key={label}
            type="button"
            onClick={run}
            className="flex h-8 items-center justify-between rounded-md px-2.5 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            {label}
            <Shortcut keys={keys} />
          </button>
        ))}
      </div>
    </div>
  );
}
