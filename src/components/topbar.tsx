import {
  ArrowLeft,
  ArrowRight,
  Clipboard,
  FolderOpen,
  MoreHorizontal,
  PanelLeft,
  Search,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import * as session from "../editor/session";
import { hasTrafficLights } from "../lib/platform";
import * as actions from "../store/actions";
import { type SaveStatus, useNotes } from "../store/notes";
import { setSetting, useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { IconButton } from "./ui/controls";
import { Menu } from "./ui/menu";
import { WorkspaceBadge } from "./workspace-badge";

const statusLabel: Record<SaveStatus, string> = {
  saved: "Saved",
  unsaved: "Editing",
  saving: "Saving",
  error: "Not saved",
};

function SaveIndicator() {
  const status = useNotes((s) => s.saveStatus);
  const hasNote = useNotes((s) => s.selectedId !== null);
  if (!hasNote) return null;
  return (
    <span
      className={`flex items-center gap-1.5 text-[12px] transition-colors duration-300 ${
        status === "error" ? "text-danger" : "text-fg-subtle"
      }`}
      aria-live="polite"
    >
      <span
        className={`size-1.5 rounded-full transition-colors duration-300 ${
          status === "error"
            ? "bg-danger"
            : status === "saved"
              ? "bg-success/70"
              : "animate-pulse bg-fg-faint"
        }`}
      />
      {statusLabel[status]}
    </span>
  );
}

export function Topbar() {
  const sidebarOpen = useSettings((s) => s.sidebarOpen);
  const workspace = useNotes((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  );
  const title = useNotes((s) => (s.selectedId ? s.title || "Untitled" : null));
  const selectedId = useNotes((s) => s.selectedId);
  const titleAway = useUi((s) => s.titleScrolledAway);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  return (
    <header
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 items-center gap-1 px-3"
    >
      {!sidebarOpen && (
        <div
          className={`flex items-center gap-0.5 ${hasTrafficLights ? "pl-[68px]" : ""}`}
        >
          <IconButton
            label="Show sidebar"
            shortcut="mod+\"
            onClick={() => setSetting("sidebarOpen", true)}
          >
            <PanelLeft size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Go back" shortcut="mod+[" onClick={actions.goBack}>
            <ArrowLeft size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label="Go forward"
            shortcut="mod+]"
            onClick={actions.goForward}
          >
            <ArrowRight size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}

      <nav
        data-tauri-drag-region
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 text-[13px] pointer-events-none"
      >
        {!sidebarOpen && workspace && (
          <>
            <WorkspaceBadge name={workspace.name} size={16} />
            <span className="shrink-0 text-fg-subtle">{workspace.name}</span>
            {title && titleAway && <span className="text-fg-faint">/</span>}
          </>
        )}
        {title && (
          <span
            className={`truncate text-fg-muted transition-[opacity,transform] duration-200 ${
              titleAway ? "opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            {title}
          </span>
        )}
      </nav>

      <div className="flex items-center gap-1">
        <SaveIndicator />
        <span className="w-2" />
        {selectedId && (
          <IconButton
            label="Find in note"
            shortcut="mod+f"
            onClick={() => session.openFind()}
          >
            <Search size={15} strokeWidth={1.75} />
          </IconButton>
        )}
        {selectedId && (
          <IconButton
            ref={moreRef}
            label="More"
            active={!!menu}
            onClick={() => setMenu(moreRef.current!.getBoundingClientRect())}
          >
            <MoreHorizontal size={16} strokeWidth={1.75} />
          </IconButton>
        )}
      </div>

      {menu && selectedId && (
        <Menu
          anchor={menu}
          align="end"
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Copy as Markdown",
              icon: <Clipboard size={14} />,
              onSelect: () => void actions.copyMarkdown(selectedId),
            },
            {
              label: "Reveal in Finder",
              icon: <FolderOpen size={14} />,
              onSelect: () => void actions.revealInFinder(selectedId),
            },
            { separator: true },
            {
              label: "Delete note",
              icon: <Trash2 size={14} />,
              shortcut: "mod+backspace",
              danger: true,
              onSelect: () => void actions.deleteNote(selectedId),
            },
          ]}
        />
      )}
    </header>
  );
}
