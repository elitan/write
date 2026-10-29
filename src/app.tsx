import { lazy, Suspense, useEffect } from "react";
import { commands, matches } from "./commands";
import { CommandPalette } from "./components/command-palette";
import { Editor } from "./components/editor";
import { EmptyState } from "./components/empty-state";
import { Sidebar } from "./components/sidebar";
import { Toaster } from "./components/toaster";
import { Topbar } from "./components/topbar";
import { WorkspaceDialogs } from "./components/workspace-dialogs";
import * as session from "./editor/session";
import { startUpdateChecks } from "./hooks/use-updater";
import { initApi } from "./lib/api";
import { isMod, isTauri } from "./lib/platform";
import * as actions from "./store/actions";
import { useNotes } from "./store/notes";
import { useSettings } from "./store/settings";
import { closePalette, openPalette, toast, useUi } from "./store/ui";

const SettingsDialog = lazy(() =>
  import("./components/settings-dialog").then((m) => ({
    default: m.SettingsDialog,
  })),
);

function useTheme() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    if (isTauri) {
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().setTheme(theme === "system" ? null : theme),
        )
        .catch(() => {});
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable)
  );
}

// Text-editing meanings of these keys win while typing.
const yieldToText = new Set(["mod+backspace", "mod+[", "mod+]", "mod+f"]);

function useShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      const ui = useUi.getState();
      if (ui.palette.open || ui.dialog) {
        if (ui.palette.open && isMod(e) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          closePalette();
        }
        return;
      }

      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        openPalette("workspaces");
        return;
      }
      if (isMod(e) && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const ws = useNotes
          .getState()
          .workspaces.find((w) => w.shortcut === e.key);
        if (ws) {
          e.preventDefault();
          void actions.switchWorkspace(ws.id);
        }
        return;
      }
      if (isMod(e) && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        openPalette();
        return;
      }
      if (isMod(e) && e.shiftKey && e.key === "Backspace") {
        const { selectedId } = useNotes.getState();
        if (selectedId) {
          e.preventDefault();
          void actions.deleteNote(selectedId);
        }
        return;
      }

      for (const command of commands) {
        if (!command.shortcut || !matches(e, command.shortcut)) continue;
        if (yieldToText.has(command.shortcut) && isEditable(e.target)) return;
        if (command.when && !command.when()) return;
        e.preventDefault();
        e.stopPropagation();
        command.run();
        return;
      }
    }
    // Capture phase so app shortcuts beat CodeMirror's defaults.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

let started = false;

function useLifecycle() {
  useEffect(() => {
    // Runs after the editor view has mounted, once (StrictMode re-runs effects).
    if (!started) {
      started = true;
      initApi()
        .then(actions.init)
        .catch((err) => {
          console.error(err);
          toast(`Couldn't load notes: ${String(err)}`, {
            tone: "error",
            duration: 10_000,
          });
        });
    }

    const onFocus = () => void actions.refresh();
    const onBlur = () => void session.flushAll();
    const onHide = () => {
      if (document.visibilityState === "hidden") void session.flushAll();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBlur);
    document.addEventListener("visibilitychange", onHide);
    const stopUpdates = startUpdateChecks();
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBlur);
      document.removeEventListener("visibilitychange", onHide);
      stopUpdates();
    };
  }, []);
}

export function App() {
  useTheme();
  useShortcuts();
  useLifecycle();
  const ready = useNotes((s) => s.ready);
  const hasNote = useNotes((s) => s.selectedId !== null);
  const paletteOpen = useUi((s) => s.palette.open);
  const dialog = useUi((s) => s.dialog);

  return (
    <div
      className={`flex h-full bg-bg transition-opacity duration-150 ${ready ? "opacity-100" : "opacity-0"}`}
    >
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="relative min-h-0 flex-1">
          <Editor hidden={!hasNote} />
          {ready && !hasNote && <EmptyState />}
        </div>
      </main>
      {paletteOpen && <CommandPalette />}
      {dialog?.type === "settings" && (
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      )}
      <WorkspaceDialogs />
      <Toaster />
    </div>
  );
}
