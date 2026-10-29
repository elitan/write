import {
  ArrowUpCircle,
  ChevronsUpDown,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { restartToUpdate, useUpdater } from "../hooks/use-updater";
import { hasTrafficLights } from "../lib/platform";
import * as actions from "../store/actions";
import { useNotes } from "../store/notes";
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  setSetting,
  useSettings,
} from "../store/settings";
import { openDialog, openPalette } from "../store/ui";
import { NoteList } from "./note-list";
import { IconButton, Tooltip } from "./ui/controls";
import { Shortcut } from "./ui/kbd";
import { Menu } from "./ui/menu";
import { WorkspaceBadge } from "./workspace-badge";

function WorkspaceButton() {
  const workspaces = useNotes((s) => s.workspaces);
  const activeId = useNotes((s) => s.activeWorkspaceId);
  const active = workspaces.find((w) => w.id === activeId);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setAnchor(button.current!.getBoundingClientRect())}
        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-100 hover:bg-hover ${anchor ? "bg-hover" : ""}`}
      >
        <WorkspaceBadge name={active?.name ?? "W"} />
        <span className="truncate font-medium text-fg">
          {active?.name ?? "Workspace"}
        </span>
        <ChevronsUpDown size={13} className="ml-auto shrink-0 text-fg-subtle" />
      </button>
      {anchor && (
        <Menu
          anchor={anchor}
          width={240}
          onClose={() => setAnchor(null)}
          items={[
            { heading: "Workspaces" },
            ...workspaces.map((w) => ({
              label: w.name,
              icon: <WorkspaceBadge name={w.name} size={16} />,
              shortcut: w.shortcut ? `mod+${w.shortcut}` : undefined,
              checked: w.id === activeId,
              onSelect: () => void actions.switchWorkspace(w.id),
            })),
            { separator: true },
            {
              label: "New workspace…",
              icon: <Plus size={14} />,
              onSelect: () => openDialog({ type: "workspace-create" }),
            },
            {
              label: "Rename…",
              icon: <Pencil size={14} />,
              onSelect: () =>
                openDialog({ type: "workspace-rename", workspaceId: activeId }),
            },
            {
              label: "Remove…",
              icon: <Trash2 size={14} />,
              danger: true,
              disabled: workspaces.length <= 1,
              onSelect: () =>
                openDialog({ type: "workspace-delete", workspaceId: activeId }),
            },
          ]}
        />
      )}
    </>
  );
}

function ResizeHandle() {
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = useSettings.getState().sidebarWidth;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) => {
      const w = Math.round(
        Math.min(
          SIDEBAR_MAX,
          Math.max(SIDEBAR_MIN, startW + ev.clientX - startX),
        ),
      );
      setSetting("sidebarWidth", w);
    };
    const up = () => {
      document.body.style.cursor = "";
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={useSettings.getState().sidebarWidth}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={-1}
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setSetting("sidebarWidth", 260)}
      className="group absolute top-0 -right-[3px] bottom-0 z-10 w-[6px] cursor-col-resize"
    >
      <div className="mx-auto h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-line-strong group-active:bg-accent" />
    </div>
  );
}

function UpdatePill() {
  const status = useUpdater((s) => s.status);
  const version = useUpdater((s) => s.version);
  if (status !== "ready") return null;
  return (
    <button
      type="button"
      onClick={restartToUpdate}
      className="anim-pop flex h-7 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent-text transition-opacity hover:opacity-80"
    >
      <ArrowUpCircle size={13} />
      Restart to update{version ? ` to ${version}` : ""}
    </button>
  );
}

export function Sidebar() {
  const open = useSettings((s) => s.sidebarOpen);
  const width = useSettings((s) => s.sidebarWidth);
  const count = useNotes((s) => s.notes.length);

  return (
    <aside
      aria-label="Sidebar"
      inert={!open}
      style={{ width: open ? width : 0 }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-line border-r bg-sidebar transition-[width] duration-200 ease-[var(--ease-out)] data-[closed]:border-r-0"
      data-closed={open ? undefined : ""}
    >
      <div className="flex h-full flex-col" style={{ width }}>
        <div
          data-tauri-drag-region
          className="flex h-[52px] shrink-0 items-center justify-end px-2"
        >
          {!hasTrafficLights && (
            <span className="mr-auto pl-2 text-[12px] font-semibold tracking-tight text-fg-subtle">
              Write
            </span>
          )}
          <IconButton
            label="Hide sidebar"
            shortcut="mod+\"
            onClick={() => setSetting("sidebarOpen", false)}
          >
            <PanelLeft size={15} strokeWidth={1.75} />
          </IconButton>
        </div>

        <div className="flex items-center gap-1 px-2">
          <WorkspaceButton />
          <IconButton
            label="New note"
            shortcut="mod+n"
            onClick={() => actions.createNote()}
          >
            <SquarePen size={15} strokeWidth={1.75} />
          </IconButton>
        </div>

        <div className="px-2 pt-2 pb-3">
          <button
            type="button"
            onClick={() => openPalette()}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg px-2 text-fg-subtle shadow-[0_1px_1px_rgb(0_0_0/0.03)] transition-colors duration-100 hover:border-line-strong hover:text-fg-muted"
          >
            <Search size={14} strokeWidth={1.75} />
            <span className="flex-1 text-left">Search</span>
            <Shortcut keys="mod+k" />
          </button>
        </div>

        <div className="flex h-7 items-center justify-between px-4 text-[11px] font-medium text-fg-subtle">
          <span>Notes</span>
          <span className="tabular">{count || ""}</span>
        </div>

        <NoteList />

        <div className="flex h-11 shrink-0 items-center gap-1 border-line border-t px-2">
          <Tooltip label="Settings" shortcut="mod+," side="top">
            <button
              type="button"
              onClick={() => openDialog({ type: "settings", tab: "general" })}
              className="flex h-7 items-center gap-2 rounded-md px-2 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            >
              <Settings size={14} strokeWidth={1.75} />
              Settings
            </button>
          </Tooltip>
          <span className="ml-auto" />
          <UpdatePill />
        </div>
      </div>
      {open && <ResizeHandle />}
    </aside>
  );
}
