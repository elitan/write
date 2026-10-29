import { create } from "zustand";
import { isTauri } from "../lib/platform";
import { toast } from "../store/ui";

interface UpdaterState {
  status: "idle" | "checking" | "downloading" | "ready";
  version: string | null;
}

export const useUpdater = create<UpdaterState>(() => ({
  status: "idle",
  version: null,
}));

const INTERVAL = 30 * 60 * 1000;

export async function checkForUpdates(manual = false) {
  if (!isTauri) {
    if (manual) toast("Updates are only available in the desktop app");
    return;
  }
  const { status } = useUpdater.getState();
  if (status === "downloading" || status === "checking") return;
  if (status === "ready") {
    if (manual) toast("An update is ready. Restart to install it.");
    return;
  }
  useUpdater.setState({ status: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      useUpdater.setState({ status: "idle" });
      if (manual) toast("You're on the latest version");
      return;
    }
    useUpdater.setState({ status: "downloading", version: update.version });
    if (manual) toast(`Downloading Write ${update.version}…`);
    await update.downloadAndInstall();
    useUpdater.setState({ status: "ready" });
  } catch (err) {
    useUpdater.setState({ status: "idle" });
    if (manual)
      toast(`Couldn't check for updates: ${String(err)}`, { tone: "error" });
  }
}

export async function restartToUpdate() {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export function startUpdateChecks() {
  if (!isTauri) return () => {};
  const first = setTimeout(() => checkForUpdates(), 5000);
  const timer = setInterval(() => checkForUpdates(), INTERVAL);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

// Module-level state can't be hot-swapped; reload instead of splitting it.
import.meta.hot?.accept(() => location.reload());
