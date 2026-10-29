import { create } from "zustand";

export type PaletteMode = "all" | "workspaces";
export type SettingsTab = "general" | "editor" | "shortcuts" | "about";

export type Dialog =
  | { type: "settings"; tab: SettingsTab }
  | { type: "workspace-create" }
  | { type: "workspace-rename"; workspaceId: string }
  | { type: "workspace-delete"; workspaceId: string };

export interface Toast {
  id: number;
  message: string;
  tone?: "default" | "error";
  action?: { label: string; run: () => void };
}

interface UiState {
  palette: { open: boolean; mode: PaletteMode };
  dialog: Dialog | null;
  toasts: Toast[];
  /** The editor's title has scrolled out of view (shown in the top bar instead). */
  titleScrolledAway: boolean;
}

export const useUi = create<UiState>(() => ({
  palette: { open: false, mode: "all" },
  dialog: null,
  toasts: [],
  titleScrolledAway: false,
}));

export function openPalette(mode: PaletteMode = "all") {
  useUi.setState({ palette: { open: true, mode }, dialog: null });
}

export function closePalette() {
  useUi.setState((s) => ({ palette: { ...s.palette, open: false } }));
}

export function openDialog(dialog: Dialog) {
  useUi.setState({ dialog, palette: { open: false, mode: "all" } });
}

export function closeDialog() {
  useUi.setState({ dialog: null });
}

let toastId = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function toast(
  message: string,
  options: Omit<Toast, "id" | "message"> & { duration?: number } = {},
) {
  const id = ++toastId;
  const { duration = options.action ? 6000 : 3000, ...rest } = options;
  useUi.setState((s) => ({
    toasts: [...s.toasts.slice(-2), { id, message, ...rest }],
  }));
  timers.set(
    id,
    setTimeout(() => dismissToast(id), duration),
  );
  return id;
}

/** Pauses auto-dismiss while the pointer is over the toast stack. */
export function holdToasts(hold: boolean) {
  const { toasts } = useUi.getState();
  for (const t of toasts) {
    clearTimeout(timers.get(t.id));
    if (!hold)
      timers.set(
        t.id,
        setTimeout(() => dismissToast(t.id), 2500),
      );
  }
}

export function errorMessage(err: unknown) {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// Module-level state can't be hot-swapped; reload instead of splitting it.
import.meta.hot?.accept(() => location.reload());
