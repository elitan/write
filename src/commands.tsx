import {
  ArrowLeft,
  ArrowRight,
  CaseSensitive,
  Clipboard,
  Code2,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Keyboard,
  ListTree,
  Monitor,
  Moon,
  PanelLeft,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Terminal,
  Trash2,
  Unplug,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as session from "./editor/session";
import { checkForUpdates } from "./hooks/use-updater";
import { isMod } from "./lib/platform";
import * as actions from "./store/actions";
import { useNotes } from "./store/notes";
import {
  setSetting,
  stepTextSize,
  toggleSetting,
  useSettings,
} from "./store/settings";
import { dismissToast, openDialog, openPalette, toast } from "./store/ui";

export interface Command {
  id: string;
  title: string;
  group: "Note" | "Navigate" | "Workspace" | "Preferences";
  icon: React.ReactNode;
  /** e.g. "mod+shift+e"; matched against keydown events. */
  shortcut?: string;
  keywords?: string;
  when?: () => boolean;
  run: () => void;
}

const icon = (Icon: typeof Search) => <Icon size={15} strokeWidth={1.75} />;
let sizeToast = 0;
function textSize(delta: number) {
  const size = stepTextSize(delta);
  // One toast that updates instead of a stack while you hold the key.
  dismissToast(sizeToast);
  sizeToast = toast(`Text size ${size}px`, { duration: 1200 });
}

const hasNote = () => useNotes.getState().selectedId !== null;
const selected = () => useNotes.getState().selectedId!;

export const commands: Command[] = [
  {
    id: "new-note",
    title: "New note",
    group: "Note",
    icon: icon(FilePlus2),
    shortcut: "mod+n",
    keywords: "create add",
    run: () => actions.createNote(),
  },
  {
    id: "find",
    title: "Find in note",
    group: "Note",
    icon: icon(Search),
    shortcut: "mod+f",
    keywords: "search replace",
    when: hasNote,
    run: () => session.openFind(),
  },
  {
    id: "copy-md",
    title: "Copy note as Markdown",
    group: "Note",
    icon: icon(Clipboard),
    when: hasNote,
    run: () => void actions.copyMarkdown(selected()),
  },
  {
    id: "reveal",
    title: "Reveal in Finder",
    group: "Note",
    icon: icon(FolderOpen),
    keywords: "show file",
    when: hasNote,
    run: () => void actions.revealInFinder(selected()),
  },
  {
    id: "delete-note",
    title: "Delete note",
    group: "Note",
    icon: icon(Trash2),
    shortcut: "mod+backspace",
    keywords: "remove trash",
    when: hasNote,
    run: () => void actions.deleteNote(selected()),
  },

  {
    id: "palette",
    title: "Search notes",
    group: "Navigate",
    icon: icon(Search),
    shortcut: "mod+k",
    keywords: "jump open go",
    run: () => openPalette(),
  },
  {
    id: "focus-list",
    title: "Focus note list",
    group: "Navigate",
    icon: icon(ListTree),
    shortcut: "mod+shift+e",
    run: () => document.getElementById("note-list")?.focus(),
  },
  {
    id: "toggle-sidebar",
    title: "Toggle sidebar",
    group: "Navigate",
    icon: icon(PanelLeft),
    shortcut: "mod+\\",
    keywords: "hide show focus zen",
    run: () => toggleSetting("sidebarOpen"),
  },
  {
    id: "back",
    title: "Go back",
    group: "Navigate",
    icon: icon(ArrowLeft),
    shortcut: "mod+[",
    keywords: "history previous",
    run: actions.goBack,
  },
  {
    id: "forward",
    title: "Go forward",
    group: "Navigate",
    icon: icon(ArrowRight),
    shortcut: "mod+]",
    keywords: "history next",
    run: actions.goForward,
  },

  {
    id: "switch-workspace",
    title: "Switch workspace…",
    group: "Workspace",
    icon: icon(Unplug),
    shortcut: "ctrl+tab",
    run: () => openPalette("workspaces"),
  },
  {
    id: "new-workspace",
    title: "New workspace…",
    group: "Workspace",
    icon: icon(FolderPlus),
    keywords: "create",
    run: () => openDialog({ type: "workspace-create" }),
  },
  {
    id: "rename-workspace",
    title: "Rename workspace…",
    group: "Workspace",
    icon: icon(Pencil),
    run: () =>
      openDialog({
        type: "workspace-rename",
        workspaceId: useNotes.getState().activeWorkspaceId,
      }),
  },
  {
    id: "remove-workspace",
    title: "Remove workspace…",
    group: "Workspace",
    icon: icon(Trash2),
    keywords: "delete",
    when: () => useNotes.getState().workspaces.length > 1,
    run: () =>
      openDialog({
        type: "workspace-delete",
        workspaceId: useNotes.getState().activeWorkspaceId,
      }),
  },

  {
    id: "settings",
    title: "Settings",
    group: "Preferences",
    icon: icon(Settings),
    shortcut: "mod+,",
    keywords: "preferences options",
    run: () => openDialog({ type: "settings", tab: "general" }),
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    group: "Preferences",
    icon: icon(Keyboard),
    shortcut: "mod+/",
    keywords: "help keys",
    run: () => openDialog({ type: "settings", tab: "shortcuts" }),
  },
  {
    id: "theme-light",
    title: "Use light theme",
    group: "Preferences",
    icon: icon(Sun),
    keywords: "appearance",
    when: () => useSettings.getState().theme !== "light",
    run: () => setSetting("theme", "light"),
  },
  {
    id: "theme-dark",
    title: "Use dark theme",
    group: "Preferences",
    icon: icon(Moon),
    keywords: "appearance",
    when: () => useSettings.getState().theme !== "dark",
    run: () => setSetting("theme", "dark"),
  },
  {
    id: "theme-system",
    title: "Use system theme",
    group: "Preferences",
    icon: icon(Monitor),
    keywords: "appearance auto",
    when: () => useSettings.getState().theme !== "system",
    run: () => setSetting("theme", "system"),
  },
  {
    id: "text-larger",
    title: "Larger text",
    group: "Preferences",
    icon: icon(ZoomIn),
    shortcut: "mod+plus",
    keywords: "font size zoom in bigger increase",
    run: () => textSize(1),
  },
  {
    id: "text-smaller",
    title: "Smaller text",
    group: "Preferences",
    icon: icon(ZoomOut),
    shortcut: "mod+minus",
    keywords: "font size zoom out decrease",
    run: () => textSize(-1),
  },
  {
    id: "text-reset",
    title: "Default text size",
    group: "Preferences",
    icon: icon(CaseSensitive),
    shortcut: "mod+0",
    keywords: "font size zoom reset actual",
    run: () => textSize(0),
  },
  {
    id: "vim",
    title: "Toggle vim mode",
    group: "Preferences",
    icon: icon(Terminal),
    run: () => {
      toggleSetting("vimMode");
      toast(useSettings.getState().vimMode ? "Vim mode on" : "Vim mode off");
    },
  },
  {
    id: "markdown",
    title: "Toggle markdown syntax",
    group: "Preferences",
    icon: icon(Code2),
    keywords: "live preview raw source",
    run: () => {
      toggleSetting("hideMarkdown");
      toast(
        useSettings.getState().hideMarkdown
          ? "Markdown syntax hidden"
          : "Showing markdown syntax",
      );
    },
  },
  {
    id: "updates",
    title: "Check for updates",
    group: "Preferences",
    icon: icon(RefreshCw),
    keywords: "upgrade version",
    run: () => void checkForUpdates(true),
  },
];

export const commandById = (id: string) => commands.find((c) => c.id === id)!;

/** Matches a keydown against "mod+shift+k"-style shortcuts. */
export function matches(e: KeyboardEvent, shortcut: string) {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1];
  const want = new Set(parts.slice(0, -1));
  if (want.has("mod") !== isMod(e)) return false;
  const loose = key === "plus" || key === "minus";
  if (!loose && want.has("shift") !== e.shiftKey) return false;
  if (want.has("alt") !== e.altKey) return false;
  // "ctrl" is only distinct from "mod" off macOS... and on macOS it is its own key.
  if (want.has("ctrl") && !e.ctrlKey) return false;
  const pressed = e.key.toLowerCase();
  // Layouts disagree on whether + and − need shift (US: ⇧= ; Swedish: its own key).
  if (key === "plus") return pressed === "+" || pressed === "=";
  if (key === "minus") return pressed === "-" || pressed === "_";
  if (key === "backspace") return pressed === "backspace";
  if (key === "tab") return pressed === "tab";
  // Shifted keys report the shifted char; fall back to the physical key.
  return pressed === key || e.code === `Key${key.toUpperCase()}`;
}
