export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/** Overlay title bar on macOS: the traffic lights sit on top of our UI. */
export const hasTrafficLights = isTauri && isMac;

export const modKey = isMac ? "⌘" : "Ctrl";

export function isMod(e: { metaKey: boolean; ctrlKey: boolean }) {
  return isMac ? e.metaKey : e.ctrlKey;
}
